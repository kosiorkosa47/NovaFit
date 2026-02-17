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
  PlanRecommendation
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

  // Step 1: Collect wearable context
  input.onEvent?.({ type: "status", message: "Checking your recent activity..." });
  const wearable = await getWearableSnapshot(input.sessionId);
  logOrchestrator(`Wearable: steps=${wearable.steps}, sleep=${wearable.sleepHours}h, stress=${wearable.stressLevel}`, input.sessionId);

  // Try the full Nova pipeline; fall back to template-based responses on quota errors
  let analyzer: AnalyzerResult;
  let plan: PlanRecommendation;
  let monitor: MonitorResult;
  let analyzerRaw = "";
  let plannerRaw = "";
  let monitorRaw = "";
  let usedFallback = false;

  try {
    // Step 2: Analyzer Agent
    input.onEvent?.({ type: "status", message: "Analyzing your current state..." });
    const analyzerResult = await runAnalyzer({
      message,
      feedback,
      wearable,
      history,
      adaptationNotes,
      userFacts,
      sessionId: input.sessionId
    });
    analyzer = analyzerResult.parsed;
    analyzerRaw = analyzerResult.raw;

    input.onEvent?.({
      type: "agent_update",
      agent: "analyzer",
      message: `Energy: ${analyzer.energyScore}/100 — ${analyzer.summary}`,
      payload: analyzer
    });

    // Step 3: Planner Agent (with Nutritionix)
    input.onEvent?.({ type: "status", message: "Building your personalized plan..." });
    const nutritionContext = await getNutritionContext(message);

    const plannerResult = await runPlanner({
      message,
      feedback,
      analyzer,
      nutritionContext,
      history,
      adaptationNotes,
      userFacts,
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
    id: crypto.randomUUID(),
    role: "user",
    content: feedback ? `${message}\nFeedback: ${feedback}` : message,
    createdAt: nowIso()
  });

  const composedReply = buildAgentResponseText(analyzer, plan, monitor);

  addMessageToMemory(input.sessionId, {
    id: crypto.randomUUID(),
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
