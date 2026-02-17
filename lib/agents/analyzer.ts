import { invokeNovaLite } from "@/lib/bedrock/invoke";
import type { WearableSnapshot } from "@/lib/integrations/wearables.mock";
import { formatWearableForPrompt } from "@/lib/integrations/wearables.mock";
import type { AnalyzerResult } from "@/lib/orchestrator/types";
import { ANALYZER_SYSTEM_PROMPT } from "@/lib/orchestrator/prompts";
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

function parseAnalyzerResult(raw: string): AnalyzerResult {
  const parsed = extractJsonObject(raw);

  return {
    summary:
      typeof parsed?.summary === "string"
        ? parsed.summary
        : "User may be experiencing routine fatigue based on current activity and recovery signals.",
    energyScore:
      typeof parsed?.energyScore === "number"
        ? Math.max(0, Math.min(100, parsed.energyScore))
        : 55,
    keySignals: Array.isArray(parsed?.keySignals)
      ? parsed.keySignals.map(String).slice(0, 5)
      : ["Lower perceived energy", "Heart rate and sleep suggest moderate recovery load"],
    riskFlags: Array.isArray(parsed?.riskFlags)
      ? parsed.riskFlags.map(String).slice(0, 4)
      : ["If fatigue persists, suggest clinical follow-up."]
  };
}

function historyToPrompt(messages: ChatMessage[]): string {
  if (!messages.length) return "No prior conversation in this session.";

  return messages
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join("\n")
    .slice(0, 2000);
}

export interface AnalyzerInput {
  message: string;
  feedback?: string;
  wearable: WearableSnapshot;
  history: ChatMessage[];
  adaptationNotes: string[];
  userFacts: string[];
  sessionId: string;
}

export async function runAnalyzer(input: AnalyzerInput): Promise<{ raw: string; parsed: AnalyzerResult }> {
  const startTime = logAgentStart("Analyzer", input.sessionId);

  const userPrompt = [
    `User message: ${input.message}`,
    input.feedback ? `User feedback on previous plan: ${input.feedback}` : "",
    `\nWearable data:\n${formatWearableForPrompt(input.wearable)}`,
    `\nRecent conversation:\n${historyToPrompt(input.history)}`,
    input.adaptationNotes.length
      ? `\nAdaptation notes from previous interactions:\n- ${input.adaptationNotes.join("\n- ")}`
      : "",
    input.userFacts.length
      ? `\nKnown user facts:\n- ${input.userFacts.join("\n- ")}`
      : ""
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await invokeNovaLite({
      systemPrompt: ANALYZER_SYSTEM_PROMPT,
      userPrompt,
      history: input.history,
      maxTokens: 400,
      temperature: 0.2
    });

    const parsed = parseAnalyzerResult(result.text);
    logAgentDone("Analyzer", startTime, input.sessionId);
    return { raw: result.text, parsed };
  } catch (error) {
    logAgentError("Analyzer", error, input.sessionId);
    throw error;
  }
}
