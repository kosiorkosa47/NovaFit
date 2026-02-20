import { invokeNovaLite, invokeNovaLiteStream } from "@/lib/bedrock/invoke";
import type { AnalyzerResult, PlanRecommendation, MonitorResult } from "@/lib/orchestrator/types";
import type { ProfileUpdates } from "@/lib/health-twin/types";
import { MONITOR_SYSTEM_PROMPT } from "@/lib/orchestrator/prompts";
import type { ChatMessage } from "@/lib/session/session.types";
import { logAgentStart, logAgentDone, logAgentError } from "@/lib/utils/logging";

function extractJsonObject(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function parseProfileUpdates(raw: unknown): ProfileUpdates | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const updates: ProfileUpdates = {};
  let hasAny = false;

  const arrayFields = [
    "addConditions", "addAllergies", "addMedications",
    "addFoodLikes", "addFoodDislikes",
    "addExerciseLikes", "addExerciseDislikes",
    "addPatterns", "addLifestyle"
  ] as const;

  for (const key of arrayFields) {
    if (Array.isArray(obj[key]) && obj[key].length > 0) {
      const filtered = (obj[key] as unknown[]).map(String).filter(s => s.length > 1 && s.length < 200);
      if (filtered.length) {
        (updates as Record<string, string[]>)[key] = filtered;
        hasAny = true;
      }
    }
  }

  if (typeof obj.sessionNote === "string" && obj.sessionNote.length > 2) {
    updates.sessionNote = obj.sessionNote.slice(0, 200);
    hasAny = true;
  }

  return hasAny ? updates : undefined;
}

function parseMonitorResult(raw: string): MonitorResult {
  const parsed = extractJsonObject(raw);

  return {
    reply:
      typeof parsed?.reply === "string"
        ? parsed.reply
        : "It sounds like your body needs a recovery-first evening. I have prepared a lighter plan for tonight.",
    tone: typeof parsed?.tone === "string" ? parsed.tone : "empathetic",
    feedbackPrompt:
      typeof parsed?.feedbackPrompt === "string"
        ? parsed.feedbackPrompt
        : "Would you like tomorrow's plan to be gentler, balanced, or more active?",
    adaptationNote:
      typeof parsed?.adaptationNote === "string"
        ? parsed.adaptationNote
        : "Adjust plan intensity based on user preference next turn.",
    profileUpdates: parseProfileUpdates(parsed?.profileUpdates),
  };
}

export interface MonitorInput {
  message: string;
  feedback?: string;
  analyzer: AnalyzerResult;
  plan: PlanRecommendation;
  history: ChatMessage[];
  userContextStr?: string;
  sessionId: string;
  voiceMode?: boolean;
}

function buildMonitorPrompt(input: MonitorInput): string {
  const prevUserMsgs = input.history.filter(m => m.role === "user").map(m => m.content);
  const conversationContext = prevUserMsgs.length
    ? `\nPREVIOUS MESSAGES FROM USER (reference these naturally):\n${prevUserMsgs.map(m => `- "${m.slice(0, 120)}"`).join("\n")}`
    : "";

  return [
    `Current user message: ${input.message}`,
    input.feedback ? `User feedback: ${input.feedback}` : "",
    conversationContext,
    `\nAnalyzer summary: ${input.analyzer.summary}`,
    `Energy score: ${input.analyzer.energyScore}/100`,
    `Key signals: ${input.analyzer.keySignals.join(", ")}`,
    `\nPlan summary: ${input.plan.summary}`,
    `Diet highlights: ${input.plan.diet.slice(0, 2).join("; ")}`,
    `Exercise: ${input.plan.exercise.slice(0, 2).join("; ")}`,
    `\nRisk flags: ${input.analyzer.riskFlags.join(" | ")}`,
    input.userContextStr ? `\nUser context:\n${input.userContextStr}` : "",
    "\nCompose a warm, natural response. If the user mentioned things in previous messages (sleep hours, exercise, pain), reference them naturally to show you remember. End with one brief feedback question."
  ]
    .filter(Boolean)
    .join("\n");
}

function getSystemPrompt(voiceMode?: boolean): string {
  if (voiceMode) {
    return MONITOR_SYSTEM_PROMPT + "\n\nIMPORTANT: This response will be SPOKEN aloud. Keep it under 4 sentences. Use spoken, conversational language. No written formatting.";
  }
  return MONITOR_SYSTEM_PROMPT;
}

export async function runMonitor(input: MonitorInput): Promise<{ raw: string; parsed: MonitorResult }> {
  const startTime = logAgentStart("Monitor", input.sessionId);

  const userPrompt = buildMonitorPrompt(input);
  const maxTokens = input.voiceMode ? 300 : 700;

  try {
    const result = await invokeNovaLite({
      systemPrompt: getSystemPrompt(input.voiceMode),
      userPrompt,
      history: input.history,
      maxTokens,
      temperature: 0.5
    });

    const parsed = parseMonitorResult(result.text);
    logAgentDone("Monitor", startTime, input.sessionId);
    return { raw: result.text, parsed };
  } catch (error) {
    logAgentError("Monitor", error, input.sessionId);
    throw error;
  }
}

/**
 * Streaming variant — yields text chunks via onChunk callback.
 * Falls back to sync on streaming failure.
 */
export async function runMonitorStreaming(
  input: MonitorInput & { onChunk: (chunk: string) => void }
): Promise<{ raw: string; parsed: MonitorResult }> {
  const startTime = logAgentStart("Monitor (streaming)", input.sessionId);

  const userPrompt = buildMonitorPrompt(input);
  const maxTokens = input.voiceMode ? 300 : 700;

  try {
    const result = await invokeNovaLiteStream({
      systemPrompt: getSystemPrompt(input.voiceMode),
      userPrompt,
      history: input.history,
      maxTokens,
      temperature: 0.5,
      onChunk: input.onChunk,
    });

    const parsed = parseMonitorResult(result.text);
    logAgentDone("Monitor (streaming)", startTime, input.sessionId);
    return { raw: result.text, parsed };
  } catch (error) {
    logAgentError("Monitor (streaming)", error, input.sessionId);
    throw error;
  }
}
