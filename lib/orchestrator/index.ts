import { runAnalyzer } from "@/lib/agents/analyzer";
import { runPlanner } from "@/lib/agents/planner";
import { runMonitor } from "@/lib/agents/monitor";
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
  if (ctx.locale) parts.push(`Device locale (for reference only — always reply in the language the user WRITES in): ${ctx.locale}`);
  if (ctx.goals) {
    const g = ctx.goals;
    const goalParts: string[] = [];
    if (g.calories) goalParts.push(`${g.calories} kcal/day`);
    if (g.steps) goalParts.push(`${g.steps} steps/day`);
    if (g.sleep) goalParts.push(`${g.sleep}h sleep`);
    if (g.water) goalParts.push(`${g.water}ml water`);
    if (goalParts.length) parts.push(`Daily goals: ${goalParts.join(", ")}`);
  }
  return parts.length ? parts.join("\n") : "";
}

function buildAgentResponseText(
  _analyzer: AnalyzerResult,
  _plan: PlanRecommendation,
  monitor: MonitorResult
): string {
  // Keep reply text clean — structured plan data is displayed as cards in the UI
  return [
    monitor.reply,
    "",
    monitor.feedbackPrompt
  ].join("\n");
}

export async function orchestrateAgents(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const message = sanitizeMessageInput(input.message);
  const feedback = input.feedback ? sanitizeFeedbackInput(input.feedback) : undefined;

  logOrchestrator("Starting agent pipeline", input.sessionId);
  cleanupExpiredSessions();

  const history = getRecentMessages(input.sessionId);
  const adaptationNotes = getAdaptationNotes(input.sessionId);
  const userFacts = getUserFacts(input.sessionId);

  // Step 1: Collect wearable context (prefer real data from client)
  input.onEvent?.({ type: "status", message: "Checking your recent activity..." });
  let wearable = await getWearableSnapshot(input.sessionId);

  // Override mock with real sensor data from client if available
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
  logOrchestrator(`Wearable: steps=${wearable.steps}, sleep=${wearable.sleepHours}h, stress=${wearable.stressLevel} (source: ${input.userContext?.healthData?.source ?? "mock"})`, input.sessionId);

  // Build user context string for prompts
  const userContextStr = formatUserContext(input.userContext);

  // Try the full Nova pipeline; fall back to template-based responses on quota errors
  let analyzer: AnalyzerResult;
  let plan: PlanRecommendation;
  let monitor: MonitorResult;
  let analyzerRaw = "";
  let plannerRaw = "";
  let monitorRaw = "";
  let usedFallback = false;

  try {
    // Step 2: Analyzer Agent + Nutritionix in parallel (saves 2-5s)
    input.onEvent?.({ type: "status", message: "Analyzing your current state..." });

    const [analyzerResult, nutritionContext] = await Promise.all([
      runAnalyzer({
        message,
        feedback,
        wearable,
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

    logOrchestrator(`Image passed to analyzer: ${input.image ? `${input.image.format}, ${input.image.bytes.length} bytes` : "none"}`, input.sessionId);

    input.onEvent?.({
      type: "agent_update",
      agent: "analyzer",
      message: `Energy: ${analyzer.energyScore}/100 — ${analyzer.summary}`,
      payload: analyzer
    });

    // Step 3: Planner Agent
    input.onEvent?.({ type: "status", message: "Building your personalized plan..." });

    const plannerResult = await runPlanner({
      message,
      feedback,
      analyzer,
      nutritionContext,
      history,
      adaptationNotes,
      userFacts,
      userContextStr,
      sessionId: input.sessionId
    });
    plan = plannerResult.parsed;
    plannerRaw = plannerResult.raw;

    input.onEvent?.({
      type: "agent_update",
      agent: "planner",
      message: plan.summary,
      payload: plan
    });

    // Step 4: Monitor Agent
    input.onEvent?.({ type: "status", message: "Composing your coaching response..." });

    const monitorResult = await runMonitor({
      message,
      feedback,
      analyzer,
      plan,
      history,
      userContextStr,
      sessionId: input.sessionId
    });
    monitor = monitorResult.parsed;
    monitorRaw = monitorResult.raw;

    input.onEvent?.({
      type: "agent_update",
      agent: "monitor",
      message: `Tone: ${monitor.tone}`,
      payload: monitor
    });
  } catch (error) {
    if (!isQuotaError(error)) {
      throw error; // Not a quota issue — rethrow
    }

    // Quota exceeded — use intelligent fallback
    usedFallback = true;
    logOrchestrator("Bedrock quota exceeded — switching to fallback mode", input.sessionId);

    input.onEvent?.({ type: "status", message: "Analyzing your current state..." });
    analyzer = generateFallbackAnalyzer(message, wearable, input.sessionId);
    analyzerRaw = JSON.stringify(analyzer);

    input.onEvent?.({
      type: "agent_update",
      agent: "analyzer",
      message: `Energy: ${analyzer.energyScore}/100 — ${analyzer.summary}`,
      payload: analyzer
    });

    input.onEvent?.({ type: "status", message: "Building your personalized plan..." });
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
      payload: plan
    });

    input.onEvent?.({ type: "status", message: "Composing your coaching response..." });
    monitor = generateFallbackMonitor(message, analyzer, plan);
    monitorRaw = JSON.stringify(monitor);

    input.onEvent?.({
      type: "agent_update",
      agent: "monitor",
      message: `Tone: ${monitor.tone}`,
      payload: monitor
    });
  }

  // Step 5: Store memory
  if (feedback) {
    addAdaptationNote(input.sessionId, `User feedback: ${feedback}`);
  }

  addAdaptationNote(input.sessionId, monitor.adaptationNote);

  // Extract user facts from adaptation notes (simple heuristic)
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

  logOrchestrator(`Pipeline complete${usedFallback ? " (fallback mode)" : ""}`, input.sessionId);

  const apiResponse: AgentApiResponse = {
    success: true,
    sessionId: input.sessionId,
    reply: composedReply,
    analyzerSummary: analyzer.summary,
    plan,
    monitorTone: monitor.tone,
    memorySize: getMemorySize(input.sessionId),
    wearableSnapshot: wearable
  };

  return {
    apiResponse,
    analyzer: { agent: "analyzer", raw: analyzerRaw, parsed: analyzer },
    planner: { agent: "planner", raw: plannerRaw, parsed: plan },
    monitor: { agent: "monitor", raw: monitorRaw, parsed: monitor }
  };
}
