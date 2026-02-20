import { invokeNovaLite } from "@/lib/bedrock/invoke";
import { log } from "@/lib/utils/logging";
import type { ChatMessage } from "@/lib/session/session.types";

export type DispatchRoute = "greeting" | "quick" | "followup" | "photo" | "full";

export interface DispatcherResult {
  route: DispatchRoute;
  confidence: number;
  reasoning: string;
}

/**
 * Fast regex pre-filter — catches obvious cases without an API call.
 * Returns null if uncertain (needs Nova classification).
 */
function preFilterRoute(message: string, hasImage: boolean, history: ChatMessage[]): DispatcherResult | null {
  if (hasImage) {
    return { route: "photo", confidence: 0.99, reasoning: "Image attached" };
  }

  const lower = message.toLowerCase().trim();

  // Greetings
  if (/^(h(i|ello|ey|owdy)|dzien dobry|czesc|cześć|siema|yo|hola|what'?s up|good (morning|afternoon|evening))[\s!?.]*$/i.test(lower)) {
    return { route: "greeting", confidence: 0.95, reasoning: "Simple greeting detected" };
  }

  // Quick acknowledgements
  if (/^(thanks?|thank you|ok(ay)?|got it|sure|cool|nice|great|good|perfect|understood|dzięki|dziekuje|dziękuję|dobra|spoko|super|fajnie|rozumiem)[\s!?.]*$/i.test(lower)) {
    return { route: "quick", confidence: 0.95, reasoning: "Quick acknowledgement" };
  }

  // Very short messages (<15 chars) that don't contain health keywords
  if (lower.length < 15) {
    const healthKeywords = /sleep|tired|eat|food|exercise|workout|stress|pain|calori|diet|weight|run|gym|walk|sleep|snu|sen|zmęczon|ćwicz|bieg|jedzeni|dieta|ból|stres/;
    if (!healthKeywords.test(lower)) {
      return { route: "quick", confidence: 0.8, reasoning: "Short non-health message" };
    }
  }

  // Follow-up indicators (references previous answer)
  if (history.length >= 2) {
    const followupPatterns = /^(yes|no|yeah|nah|that|this|the first|the second|option|which|and what about|a co z|tak|nie|to|tamto|pierwszy|drugi|opcja)/i;
    if (followupPatterns.test(lower) && lower.length < 60) {
      return { route: "followup", confidence: 0.85, reasoning: "Short follow-up to previous answer" };
    }
  }

  // Health complaints or plan requests → full pipeline
  const fullPipelinePatterns = /(?:feel|plan|program|routine|hurt|ache|suggest|recommend|analyze|czuję|czuje|plan|program|rutyn|boli|zaproponuj|polec|przeanalizuj|co.*jeść|co.*jesc|co.*ćwiczyć|what should i|give me a|create|make me|help me with)/i;
  if (fullPipelinePatterns.test(lower)) {
    return { route: "full", confidence: 0.85, reasoning: "Health/plan request detected" };
  }

  return null;
}

/**
 * Nova-based classification for ambiguous messages.
 * Single fast call, ~100 tokens in / ~50 out.
 */
async function classifyWithNova(
  message: string,
  hasHistory: boolean
): Promise<DispatcherResult> {
  const systemPrompt = `You are a message classifier for a health coaching app. Classify the user message into ONE route:

- "greeting": hello, hi, hey, good morning, etc.
- "quick": thanks, ok, short acknowledgement, simple question not about health
- "followup": references a previous answer, asks about something discussed before, short clarification
- "full": health complaint, asks for a plan, reports symptoms, asks about nutrition/exercise/sleep

Output JSON only: {"route":"...","confidence":0.0-1.0,"reasoning":"brief reason"}`;

  try {
    const result = await invokeNovaLite({
      systemPrompt,
      userPrompt: `Message: "${message}"\nHas conversation history: ${hasHistory}`,
      maxTokens: 80,
      temperature: 0.1,
    });

    const parsed = JSON.parse(
      result.text.match(/\{[\s\S]*\}/)?.[0] ?? "{}"
    ) as Partial<DispatcherResult>;

    const validRoutes: DispatchRoute[] = ["greeting", "quick", "followup", "photo", "full"];
    const route: DispatchRoute = validRoutes.includes(parsed.route as DispatchRoute)
      ? (parsed.route as DispatchRoute)
      : "full";

    return {
      route,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "Nova classification",
    };
  } catch (error) {
    log({
      level: "warn",
      agent: "dispatcher",
      message: `Nova classification failed, defaulting to full: ${error instanceof Error ? error.message : "unknown"}`,
    });
    return { route: "full", confidence: 0.5, reasoning: "Classification failed — defaulting to full" };
  }
}

/**
 * Dispatcher: classify intent and determine minimum required agents.
 * Uses fast regex pre-filter first, falls back to Nova for ambiguous cases.
 */
export async function dispatchMessage(
  message: string,
  hasImage: boolean,
  history: ChatMessage[]
): Promise<DispatcherResult> {
  const startMs = Date.now();

  // Try regex pre-filter first (0ms, no API cost)
  const preFilter = preFilterRoute(message, hasImage, history);
  if (preFilter && preFilter.confidence >= 0.8) {
    log({
      level: "info",
      agent: "dispatcher",
      message: `Route: ${preFilter.route} (pre-filter, ${preFilter.confidence}, ${Date.now() - startMs}ms)`,
    });
    return preFilter;
  }

  // Ambiguous — use Nova classification
  const result = await classifyWithNova(message, history.length > 0);

  // Low confidence → default to full
  if (result.confidence < 0.7) {
    result.route = "full";
    result.reasoning += " (low confidence → full)";
  }

  log({
    level: "info",
    agent: "dispatcher",
    message: `Route: ${result.route} (Nova, ${result.confidence}, ${Date.now() - startMs}ms)`,
  });

  return result;
}
