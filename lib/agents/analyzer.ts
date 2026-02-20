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

/** Extract user-stated health values from conversation history to override sensor data */
function extractUserStatedValues(history: ChatMessage[], currentMessage: string): string {
  const allUserText = [
    ...history.filter(m => m.role === "user").map(m => m.content),
    currentMessage
  ].join(" ").toLowerCase();

  const overrides: string[] = [];

  // Sleep hours
  const sleepMatch = allUserText.match(/(?:slept|sleep|sleeping)\s+(?:only\s+)?(\d+(?:\.\d+)?)\s*(?:hours?|h\b)/);
  if (sleepMatch) {
    overrides.push(`Sleep: User stated ${sleepMatch[1]} hours — use this, NOT sensor data`);
  }

  // Steps
  const stepsMatch = allUserText.match(/(\d{1,2}[,.]?\d{3})\s*steps/) ||
    allUserText.match(/walked\s+(\d+(?:\.\d+)?)\s*km/);
  if (stepsMatch) {
    overrides.push(`Activity: User stated ${stepsMatch[0]} — use this, NOT sensor data`);
  }

  // Pain/discomfort
  if (allUserText.match(/(?:back|neck|knee|head|shoulder|muscle)\s*(?:hurts?|pain|ache|sore)/)) {
    overrides.push(`Pain: User mentioned physical discomfort — factor into energy and exercise recommendations`);
  }

  // Meals/calories
  const calMatch = allUserText.match(/(\d{3,4})\s*(?:cal|kcal|calories)/);
  if (calMatch) {
    overrides.push(`Nutrition: User mentioned ${calMatch[0]} intake`);
  }

  if (!overrides.length) return "";
  return `\n⚠️ USER-STATED VALUES (these override sensor data):\n${overrides.map(o => `  • ${o}`).join("\n")}`;
}

function historyToPrompt(messages: ChatMessage[]): string {
  if (!messages.length) return "No prior conversation in this session.";

  const formatted = messages
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join("\n")
    .slice(0, 3000);

  return `${formatted}\n\nIMPORTANT: Any health facts the user stated in previous messages (sleep hours, exercise, how they feel) should be treated as still true unless they say otherwise.`;
}

export interface AnalyzerInput {
  message: string;
  feedback?: string;
  wearable: WearableSnapshot;
  sensorSource?: string;
  history: ChatMessage[];
  adaptationNotes: string[];
  userFacts: string[];
  userContextStr?: string;
  sessionId: string;
  imageData?: { bytes: Uint8Array; format: "jpeg" | "png" | "webp" | "gif" };
}

export async function runAnalyzer(input: AnalyzerInput): Promise<{ raw: string; parsed: AnalyzerResult }> {
  const startTime = logAgentStart("Analyzer", input.sessionId);

  // Build user-stated overrides from conversation history
  const userStatedOverrides = extractUserStatedValues(input.history, input.message);

  const userPrompt = [
    // 1. Conversation history FIRST — so the model knows what was already discussed
    input.history.length
      ? `\nCONVERSATION HISTORY (previous messages in this session):\n${historyToPrompt(input.history)}`
      : "",
    // 2. Current message
    `\nCURRENT USER MESSAGE: ${input.message}`,
    input.imageData ? "[The user also attached a photo. Describe what you see and incorporate it into your health analysis.]" : "",
    input.feedback ? `User feedback on previous plan: ${input.feedback}` : "",
    // 3. Sensor data (lower priority than user statements)
    `\nSensor/wearable data (LOWER priority than user-stated values):\n${formatWearableForPrompt(input.wearable, input.sensorSource)}`,
    // 4. User-stated overrides — explicit corrections
    userStatedOverrides,
    // 5. Context
    input.adaptationNotes.length
      ? `\nAdaptation notes from previous interactions:\n- ${input.adaptationNotes.join("\n- ")}`
      : "",
    input.userFacts.length
      ? `\nKnown user facts:\n- ${input.userFacts.join("\n- ")}`
      : "",
    input.userContextStr ? `\nUser context:\n${input.userContextStr}` : "",
    // 6. FINAL REMINDER — strongest position in prompt
    `\nFINAL REMINDER:
1. If the user stated specific values in this conversation (e.g., "slept 5 hours", "walked 4000 steps"), you MUST use those values, NOT the sensor data. Sensor data may be stale or reset.
2. ENERGY SCORE CONSISTENCY: If the previous energy score was around X, your new score should be within ±15 of X unless the user explicitly reports feeling WORSE or BETTER. A follow-up message about food/allergies/preferences is NOT a reason to change the score dramatically.
3. A score of 0-19 means MULTIPLE SERIOUS red flags (extreme symptoms, danger signs). Normal tiredness + back pain = 30-50, NOT 0.`
  ]
    .filter(Boolean)
    .join("\n");

  try {
    logAgentStart("Analyzer", input.sessionId); // log image info
    if (input.imageData) {
      console.log(`[Analyzer] Image data: ${input.imageData.format}, ${input.imageData.bytes.length} bytes`);
    }
    const result = await invokeNovaLite({
      systemPrompt: ANALYZER_SYSTEM_PROMPT,
      userPrompt,
      history: input.history,
      maxTokens: 600,
      temperature: 0.2,
      imageData: input.imageData,
    });

    const parsed = parseAnalyzerResult(result.text);
    logAgentDone("Analyzer", startTime, input.sessionId);
    return { raw: result.text, parsed };
  } catch (error) {
    logAgentError("Analyzer", error, input.sessionId);
    throw error;
  }
}
