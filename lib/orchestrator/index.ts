import { runAnalyzer } from "@/lib/agents/analyzer";
import { runPlanner } from "@/lib/agents/planner";
import { runMonitor, runMonitorStreaming } from "@/lib/agents/monitor";
import { dispatchMessage } from "@/lib/agents/dispatcher";
import type { DispatchRoute } from "@/lib/agents/dispatcher";
import { validatePlan } from "@/lib/agents/validator";
import {
  generateFallbackAnalyzer,
  generateFallbackPlan,
  generateFallbackMonitor,
  isQuotaError
} from "@/lib/agents/fallback";
import { getNutritionContext } from "@/lib/integrations/nutritionix";
import { getWearableSnapshot } from "@/lib/integrations/wearables.mock";
import type {
  AgentApiResponse,
  AgentTiming,
  AnalyzerResult,
  MonitorResult,
  OrchestratorInput,
  OrchestratorOutput,
  PlanRecommendation,
  UserContext
} from "@/lib/orchestrator/types";
import {
  addAdaptationNote,
  addMessageToMemory,
  cleanupExpiredSessions,
  getAdaptationNotes,
  getMemorySize,
  getRecentMessages,
  getUserFacts,
  addUserFact
} from "@/lib/session/memory";
import { sanitizeMessageInput, sanitizeFeedbackInput } from "@/lib/utils/sanitize";
import { detectPromptInjection } from "@/lib/utils/prompt-guard";
import { logOrchestrator } from "@/lib/utils/logging";

function nowIso(): string {
  return new Date().toISOString();
}

/** Safe unique ID — works without HTTPS/secure context */
function safeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try { return crypto.randomUUID(); } catch { /* secure context required */ }
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function formatUserContext(ctx?: UserContext): string {
  if (!ctx) return "";
  const parts: string[] = [];
  if (ctx.name) parts.push(`User's name: ${ctx.name}`);
  if (ctx.timeOfDay) parts.push(`Current time of day: ${ctx.timeOfDay}`);
  if (ctx.dayOfWeek) parts.push(`Day: ${ctx.dayOfWeek}`);
  if (ctx.appLanguage) {
    const langName = ctx.appLanguage === "pl" ? "Polish" : "English";
    parts.push(`IMPORTANT — App language selected by user: ${langName}. Reply in ${langName} unless the user's current message is clearly written in a different language.`);
  }
  if (ctx.goals) {
    const g = ctx.goals;
    const goalParts: string[] = [];
    if (g.calories) goalParts.push(`${g.calories} kcal/day`);
    if (g.steps) goalParts.push(`${g.steps} steps/day`);
    if (g.sleep) goalParts.push(`${g.sleep}h sleep`);
    if (g.water) goalParts.push(`${g.water}ml water`);
    if (goalParts.length) parts.push(`Daily goals: ${goalParts.join(", ")}`);
  }
  if (ctx.recentMeals && ctx.recentMeals.length > 0) {
    const mealLines = ctx.recentMeals.slice(0, 3).map((m) => {
      const time = new Date(m.analyzedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `  - ${time}: ${m.totalCalories} kcal (P:${m.totalProtein}g C:${m.totalCarbs}g F:${m.totalFat}g) — ${m.summary.slice(0, 80)}`;
    });
    parts.push(`Recent meals (photo-analyzed today):\n${mealLines.join("\n")}`);
  }
  // Health Twin — persistent profile from past conversations
  if (ctx.healthTwin) {
    parts.push(`\n${ctx.healthTwin}`);
  }
  return parts.length ? parts.join("\n") : "";
}

/** Post-process energy score — prevent wild swings between conversation turns. */
function stabilizeEnergyScore(
  rawScore: number,
  adaptationNotes: string[],
  currentMessage: string
): number {
  let prevScore: number | null = null;
  for (const note of adaptationNotes) {
    const match = note.match(/Previous energy score:\s*(\d+)\/100/);
    if (match) {
      prevScore = parseInt(match[1], 10);
    }
  }

  const emergencyPattern = /(?:emergency|faint|unconscious|hospital|ambulance|chest\s*pain|can'?t\s*breathe|severe|collapsed|dizzy|blacking\s*out)/i;
  const isEmergency = emergencyPattern.test(currentMessage);
  const minScore = isEmergency ? 5 : 20;

  let score = Math.max(rawScore, minScore);

  if (prevScore !== null) {
    const worseningPattern = /(?:worse|terrible|awful|horrible|can'?t\s*move|much\s*more\s*tired|significantly\s*worse|really\s*bad)/i;
    const improvingPattern = /(?:better|great|amazing|wonderful|much\s*better|recovered|well[\s-]*rested|energized|fantastic)/i;

    const maxDrop = worseningPattern.test(currentMessage) ? 30 : 15;
    const maxRise = improvingPattern.test(currentMessage) ? 30 : 15;

    const lowerBound = Math.max(prevScore - maxDrop, minScore);
    const upperBound = Math.min(prevScore + maxRise, 100);

    score = Math.max(lowerBound, Math.min(upperBound, score));
  }

  return score;
}

function buildAgentResponseText(
  _analyzer: AnalyzerResult,
  _plan: PlanRecommendation,
  monitor: MonitorResult
): string {
  return [
    monitor.reply,
    "",
    monitor.feedbackPrompt
  ].join("\n");
}

/** Run only the Monitor agent (for greeting/quick routes) */
async function runMonitorOnly(
  input: OrchestratorInput,
  message: string,
  history: ReturnType<typeof getRecentMessages>,
  userContextStr: string,
  timing: AgentTiming
): Promise<{ monitor: MonitorResult; monitorRaw: string }> {
  const monitorStart = Date.now();
  const isVoice = input.mode === "voice";

  // For greeting/quick, use Monitor with simplified context
  const dummyAnalyzer: AnalyzerResult = {
    summary: "Quick response — no health analysis needed.",
    energyScore: 70,
    keySignals: [],
    riskFlags: [],
  };
  const dummyPlan: PlanRecommendation = {
    summary: "No plan needed for this message.",
    diet: [],
    exercise: [],
    hydration: "",
    recovery: "",
    nutritionContext: [],
  };

  // Try streaming for text mode
  if (!isVoice && input.onEvent) {
    try {
      const result = await runMonitorStreaming({
        message,
        analyzer: dummyAnalyzer,
        plan: dummyPlan,
        history,
        userContextStr,
        sessionId: input.sessionId,
        voiceMode: false,
        onChunk: (chunk) => {
          input.onEvent?.({ type: "text_chunk", message: chunk });
        },
      });
      timing.monitor = Date.now() - monitorStart;
      return { monitor: result.parsed, monitorRaw: result.raw };
    } catch {
      // Fall through to sync
    }
  }

  const result = await runMonitor({
    message,
    analyzer: dummyAnalyzer,
    plan: dummyPlan,
    history,
    userContextStr,
    sessionId: input.sessionId,
    voiceMode: isVoice,
  });
  timing.monitor = Date.now() - monitorStart;
  return { monitor: result.parsed, monitorRaw: result.raw };
}

export async function orchestrateAgents(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const pipelineStart = Date.now();
  const message = sanitizeMessageInput(input.message);
  const feedback = input.feedback ? sanitizeFeedbackInput(input.feedback) : undefined;
  const timing: AgentTiming = {};

  // Prompt injection guard
  const injectionCheck = detectPromptInjection(message);
  if (injectionCheck) {
    logOrchestrator(`Prompt injection detected: ${injectionCheck}`, input.sessionId);
  }

  logOrchestrator("Starting agent pipeline", input.sessionId);
  cleanupExpiredSessions();

  const history = getRecentMessages(input.sessionId);
  const adaptationNotes = getAdaptationNotes(input.sessionId);
  const userFacts = getUserFacts(input.sessionId);

  // Step 0: Dispatcher — classify intent and route to minimum agents
  const dispatchStart = Date.now();
  const dispatch = await dispatchMessage(message, !!input.image, history);
  timing.dispatcher = Date.now() - dispatchStart;

  const route: DispatchRoute = dispatch.route;
  logOrchestrator(`Dispatcher: route=${route} confidence=${dispatch.confidence} (${timing.dispatcher}ms)`, input.sessionId);

  input.onEvent?.({
    type: "dispatcher",
    message: `Route: ${route}`,
    payload: { route, confidence: dispatch.confidence, reasoning: dispatch.reasoning },
  });

  // Build user context string for prompts
  const userContextStr = formatUserContext(input.userContext);

  // ── Greeting / Quick route: Monitor only ──
  if (route === "greeting" || route === "quick") {
    input.onEvent?.({ type: "status", message: "Responding..." });

    const { monitor, monitorRaw } = await runMonitorOnly(input, message, history, userContextStr, timing);

    const composedReply = buildAgentResponseText(
      { summary: "", energyScore: 70, keySignals: [], riskFlags: [] },
      { summary: "", diet: [], exercise: [], hydration: "", recovery: "", nutritionContext: [] },
      monitor
    );

    addMessageToMemory(input.sessionId, { id: safeId(), role: "user", content: message, createdAt: nowIso() });
    addMessageToMemory(input.sessionId, { id: safeId(), role: "assistant", content: composedReply, createdAt: nowIso() });

    timing.total = Date.now() - pipelineStart;
    logOrchestrator(`Pipeline complete (${route} route, ${timing.total}ms)`, input.sessionId);

    const apiResponse: AgentApiResponse = {
      success: true,
      sessionId: input.sessionId,
      reply: composedReply,
      analyzerSummary: "",
      plan: { summary: "", diet: [], exercise: [], hydration: "", recovery: "", nutritionContext: [] },
      monitorTone: monitor.tone,
      memorySize: getMemorySize(input.sessionId),
      profileUpdates: monitor.profileUpdates,
      route,
      timing,
    };

    return {
      apiResponse,
      analyzer: { agent: "analyzer", raw: "", parsed: { summary: "", energyScore: 70, keySignals: [], riskFlags: [] } },
      planner: { agent: "planner", raw: "", parsed: { summary: "", diet: [], exercise: [], hydration: "", recovery: "", nutritionContext: [] } },
      monitor: { agent: "monitor", raw: monitorRaw, parsed: monitor },
      route,
      timing,
    };
  }

  // ── Full / Follow-up / Photo: collect wearable data ──
  input.onEvent?.({ type: "status", message: "Checking your recent activity..." });
  let wearable = await getWearableSnapshot(input.sessionId);

  if (input.userContext?.healthData && input.userContext.healthData.source !== "mock") {
    const hd = input.userContext.healthData;
    wearable = {
      steps: hd.steps,
      averageHeartRate: hd.heartRate ?? wearable.averageHeartRate,
      restingHeartRate: Math.round((hd.heartRate ?? wearable.averageHeartRate) * 0.75),
      sleepHours: hd.sleep,
      stressLevel: hd.stress < 35 ? "low" : hd.stress < 65 ? "moderate" : "high",
      capturedAt: new Date().toISOString(),
    };
  }

  const allUserText = [
    ...history.filter(m => m.role === "user").map(m => m.content),
    message
  ].join(" ").toLowerCase();

  const sleepMatch = allUserText.match(/(?:slept|sleep|sleeping)\s+(?:only\s+)?(\d+(?:\.\d+)?)\s*(?:hours?|h\b)/);
  if (sleepMatch) {
    wearable = { ...wearable, sleepHours: parseFloat(sleepMatch[1]) };
  }

  const stepsMatch = allUserText.match(/(\d{1,2}[,.]?\d{3})\s*steps/);
  if (stepsMatch) {
    wearable = { ...wearable, steps: parseInt(stepsMatch[1].replace(/[,.]/, ""), 10) };
  }

  logOrchestrator(`Wearable: steps=${wearable.steps}, sleep=${wearable.sleepHours}h, stress=${wearable.stressLevel} (source: ${input.userContext?.healthData?.source ?? "mock"})`, input.sessionId);

  let analyzer: AnalyzerResult;
  let plan: PlanRecommendation;
  let monitor: MonitorResult;
  let analyzerRaw = "";
  let plannerRaw = "";
  let monitorRaw = "";
  let usedFallback = false;

  try {
    // ── Follow-up route: skip Analyzer, use last known state ──
    if (route === "followup") {
      input.onEvent?.({ type: "status", message: "Building on our conversation..." });

      // Use a lightweight analyzer result from adaptation notes
      const prevEnergyMatch = adaptationNotes.join(" ").match(/Previous energy score:\s*(\d+)\/100/);
      const prevEnergy = prevEnergyMatch ? parseInt(prevEnergyMatch[1], 10) : 65;

      analyzer = {
        summary: "Follow-up to previous conversation — using existing context.",
        energyScore: prevEnergy,
        keySignals: ["Follow-up message"],
        riskFlags: [],
      };
      analyzerRaw = JSON.stringify(analyzer);

      // Still run Planner for follow-up (may need updated plan)
      const plannerStart = Date.now();
      const nutritionContext = await getNutritionContext(message);
      const plannerResult = await runPlanner({
        message,
        feedback,
        analyzer,
        nutritionContext,
        history,
        adaptationNotes,
        userFacts,
        userContextStr,
        sessionId: input.sessionId,
      });
      plan = plannerResult.parsed;
      plannerRaw = plannerResult.raw;
      timing.planner = Date.now() - plannerStart;

      input.onEvent?.({
        type: "agent_update",
        agent: "planner",
        message: plan.summary,
        payload: plan,
      });
    } else {
      // ── Full / Photo: run all 3 agents ──
      input.onEvent?.({ type: "status", message: "Reading your health data..." });

      const analyzerStart = Date.now();
      const sensorSource = input.userContext?.healthData?.source ?? "mock";
      const [analyzerResult, nutritionContext] = await Promise.all([
        runAnalyzer({
          message,
          feedback,
          wearable,
          sensorSource,
          history,
          adaptationNotes,
          userFacts,
          userContextStr,
          sessionId: input.sessionId,
          imageData: input.image,
        }),
        getNutritionContext(message),
      ]);
      analyzer = analyzerResult.parsed;
      analyzerRaw = analyzerResult.raw;
      timing.analyzer = Date.now() - analyzerStart;

      const rawEnergyScore = analyzer.energyScore;
      analyzer.energyScore = stabilizeEnergyScore(rawEnergyScore, adaptationNotes, message);
      if (rawEnergyScore !== analyzer.energyScore) {
        logOrchestrator(`Energy score stabilized: ${rawEnergyScore} → ${analyzer.energyScore}`, input.sessionId);
      }

      logOrchestrator(`Image passed to analyzer: ${input.image ? `${input.image.format}, ${input.image.bytes.length} bytes` : "none"}`, input.sessionId);

      input.onEvent?.({
        type: "agent_update",
        agent: "analyzer",
        message: analyzer.summary,
        payload: analyzer,
      });

      // Step 3: Planner Agent
      input.onEvent?.({ type: "status", message: "Creating your plan..." });

      const plannerStart = Date.now();
      const plannerResult = await runPlanner({
        message,
        feedback,
        analyzer,
        nutritionContext,
        history,
        adaptationNotes,
        userFacts,
        userContextStr,
        sessionId: input.sessionId,
      });
      plan = plannerResult.parsed;
      plannerRaw = plannerResult.raw;
      timing.planner = Date.now() - plannerStart;

      input.onEvent?.({
        type: "agent_update",
        agent: "planner",
        message: plan.summary,
        payload: plan,
      });
    }

    // Step 3.5: Plan Validator — inter-agent verification loop
    const healthTwinCtx = input.userContext?.healthTwin;
    if (healthTwinCtx && (route === "full" || route === "photo")) {
      const validatorStart = Date.now();
      input.onEvent?.({ type: "status", message: "Verifying plan safety..." });

      const validation = await validatePlan(plan, analyzer, healthTwinCtx);
      timing.validator = Date.now() - validatorStart;

      if (!validation.approved && validation.conflicts.length > 0) {
        logOrchestrator(`Validator rejected plan: ${validation.conflicts.join("; ")}`, input.sessionId);

        input.onEvent?.({
          type: "agent_update",
          agent: "monitor" as const,
          message: `Plan revision: ${validation.conflicts[0]}`,
          payload: { validation },
        });

        // Re-run Planner with conflict feedback
        const replanStart = Date.now();
        const conflictFeedback = `CRITICAL — The Validator agent found these conflicts with the user's profile:\n${validation.conflicts.map(c => `- ${c}`).join("\n")}\n\nYou MUST revise the plan to avoid ALL conflicts. Suggested alternatives: ${validation.suggestions.join("; ") || "choose safe substitutes"}`;

        const replanResult = await runPlanner({
          message,
          feedback: conflictFeedback,
          analyzer,
          nutritionContext: plan.nutritionContext,
          history,
          adaptationNotes,
          userFacts,
          userContextStr,
          sessionId: input.sessionId,
        });
        plan = replanResult.parsed;
        plannerRaw = replanResult.raw;
        timing.planner = (timing.planner ?? 0) + (Date.now() - replanStart);

        logOrchestrator(`Planner revised plan after validation (${Date.now() - replanStart}ms)`, input.sessionId);

        input.onEvent?.({
          type: "agent_update",
          agent: "planner" as const,
          message: `Revised: ${plan.summary}`,
          payload: plan,
        });
      } else {
        logOrchestrator(`Validator approved plan (${timing.validator}ms)`, input.sessionId);
      }
    }

    // Step 4: Monitor Agent (with streaming for text mode)
    input.onEvent?.({ type: "status", message: "Putting it together..." });

    const monitorStart = Date.now();
    const isVoice = input.mode === "voice";

    if (!isVoice && input.onEvent) {
      // Try streaming monitor
      try {
        const monitorResult = await runMonitorStreaming({
          message,
          feedback,
          analyzer,
          plan,
          history,
          userContextStr,
          sessionId: input.sessionId,
          voiceMode: false,
          onChunk: (chunk) => {
            input.onEvent?.({ type: "text_chunk", message: chunk });
          },
        });
        monitor = monitorResult.parsed;
        monitorRaw = monitorResult.raw;
      } catch {
        // Fallback to sync monitor
        const monitorResult = await runMonitor({
          message,
          feedback,
          analyzer,
          plan,
          history,
          userContextStr,
          sessionId: input.sessionId,
        });
        monitor = monitorResult.parsed;
        monitorRaw = monitorResult.raw;
      }
    } else {
      const monitorResult = await runMonitor({
        message,
        feedback,
        analyzer,
        plan,
        history,
        userContextStr,
        sessionId: input.sessionId,
        voiceMode: isVoice,
      });
      monitor = monitorResult.parsed;
      monitorRaw = monitorResult.raw;
    }
    timing.monitor = Date.now() - monitorStart;

    input.onEvent?.({
      type: "agent_update",
      agent: "monitor",
      message: "Response ready",
      payload: monitor,
    });
  } catch (error) {
    if (!isQuotaError(error)) {
      throw error;
    }

    usedFallback = true;
    logOrchestrator("Bedrock quota exceeded — switching to fallback mode", input.sessionId);

    input.onEvent?.({ type: "status", message: "Reading your health data..." });
    analyzer = generateFallbackAnalyzer(message, wearable, input.sessionId);
    analyzer.energyScore = stabilizeEnergyScore(analyzer.energyScore, adaptationNotes, message);
    analyzerRaw = JSON.stringify(analyzer);

    input.onEvent?.({
      type: "agent_update",
      agent: "analyzer",
      message: analyzer.summary,
      payload: analyzer,
    });

    input.onEvent?.({ type: "status", message: "Creating your plan..." });
    const nutritionContext = await getNutritionContext(message);
    plan = generateFallbackPlan(message, analyzer);
    if (nutritionContext.length > 0 && !nutritionContext[0].startsWith("Focus on balanced")) {
      plan.nutritionContext = nutritionContext;
    }
    plannerRaw = JSON.stringify(plan);

    input.onEvent?.({
      type: "agent_update",
      agent: "planner",
      message: plan.summary,
      payload: plan,
    });

    input.onEvent?.({ type: "status", message: "Putting it together..." });
    monitor = generateFallbackMonitor(message, analyzer, plan, input.userContext?.name);
    monitorRaw = JSON.stringify(monitor);

    input.onEvent?.({
      type: "agent_update",
      agent: "monitor",
      message: "Response ready",
      payload: monitor,
    });
  }

  // Step 5: Store memory
  if (feedback) {
    addAdaptationNote(input.sessionId, `User feedback: ${feedback}`);
  }

  addAdaptationNote(input.sessionId, monitor.adaptationNote);
  addAdaptationNote(input.sessionId, `Previous energy score: ${analyzer.energyScore}/100 — maintain consistency unless user reports significant change`);

  if (monitor.adaptationNote.toLowerCase().includes("allerg")) {
    addUserFact(input.sessionId, monitor.adaptationNote);
  }
  if (monitor.adaptationNote.toLowerCase().includes("prefer")) {
    addUserFact(input.sessionId, monitor.adaptationNote);
  }

  addMessageToMemory(input.sessionId, {
    id: safeId(),
    role: "user",
    content: feedback ? `${message}\nFeedback: ${feedback}` : message,
    createdAt: nowIso()
  });

  const composedReply = buildAgentResponseText(analyzer, plan, monitor);

  addMessageToMemory(input.sessionId, {
    id: safeId(),
    role: "assistant",
    content: composedReply,
    createdAt: nowIso()
  });

  timing.total = Date.now() - pipelineStart;
  logOrchestrator(`Pipeline complete (${route} route, ${timing.total}ms)${usedFallback ? " [fallback]" : ""}`, input.sessionId);

  const apiResponse: AgentApiResponse = {
    success: true,
    sessionId: input.sessionId,
    reply: composedReply,
    analyzerSummary: analyzer.summary,
    plan,
    monitorTone: monitor.tone,
    memorySize: getMemorySize(input.sessionId),
    wearableSnapshot: wearable,
    profileUpdates: monitor.profileUpdates,
    route,
    timing,
  };

  return {
    apiResponse,
    analyzer: { agent: "analyzer", raw: analyzerRaw, parsed: analyzer },
    planner: { agent: "planner", raw: plannerRaw, parsed: plan },
    monitor: { agent: "monitor", raw: monitorRaw, parsed: monitor },
    route,
    timing,
  };
}
