import { log } from "@/lib/utils/logging";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/utils/rate-limit";
import { requireAuth } from "@/lib/auth/helpers";
import { invokeNovaLite } from "@/lib/bedrock/invoke";
import { addMessageToMemory } from "@/lib/session/memory";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface VoiceChatBody {
  transcript: string;
  sessionId: string;
  /** Recent conversation messages for context continuity */
  recentMessages?: ChatMessage[];
  userContext?: {
    name?: string;
    appLanguage?: string;
    timeOfDay?: string;
    dayOfWeek?: string;
    goals?: Record<string, number>;
    healthTwin?: string;
    recentMeals?: { summary: string; totalCalories: number }[];
  };
}

/** Build a voice-optimized health coaching prompt with conversation history */
function buildVoiceCoachPrompt(
  ctx?: VoiceChatBody["userContext"],
  recentMessages?: ChatMessage[]
): string {
  const parts: string[] = [
    "You are Nova — a smart, warm health coach having a real conversation.",
    "",
    "PERSONALITY: Think of that one friend who's really into health science — gives great specific advice but never lectures. You're direct, occasionally funny, and genuinely care.",
    "",
    "RULES:",
    "- 3-5 sentences. Specific foods, exercises, amounts, timing.",
    "- Talk like a human, not a textbook. Use contractions, casual phrasing.",
    "- REFERENCE what they said earlier in the conversation — show you remember.",
    "- If they mentioned a meal, activity, or feeling before, build on it naturally.",
    "- Acknowledge their feeling first (1 sentence), then give concrete tips.",
    "- End with ONE natural follow-up question (not generic 'how can I help').",
    "- NO bullet points, NO lists, NO 'As an AI' — just talk.",
    "- Match their language (Polish → Polish, English → English).",
    "- Vary your openings. Don't always start with 'Hey [name]'.",
    "",
    "GOOD: \"Oh nice, Chinese food! Since you mentioned your back earlier, maybe go for steamed fish instead of fried — less inflammation. And skip the heavy soy sauce, your sodium is probably high already. What are you thinking, a rice dish or noodles?\"",
    "",
    "GOOD: \"5 hours? Ugh, that's rough. Grab an apple with peanut butter right now — the combo of sugar and fat will carry you through the morning without a crash. And skip that second coffee after 2pm, it'll just wreck tonight's sleep too. What time you planning to call it a night?\"",
    "",
    "BAD: \"I understand you're feeling tired. Based on your data, I recommend consuming nutrient-dense foods. Would you like me to help?\"",
  ];

  if (ctx?.name) parts.push(`\nUser's name: ${ctx.name} (use it naturally, not every sentence)`);
  if (ctx?.timeOfDay) parts.push(`Time of day: ${ctx.timeOfDay}`);
  if (ctx?.dayOfWeek) parts.push(`Day: ${ctx.dayOfWeek}`);
  if (ctx?.appLanguage) {
    const lang = ctx.appLanguage === "pl" ? "Polish" : "English";
    parts.push(
      `App language: ${lang}. Respond in ${lang} unless the user clearly speaks differently.`
    );
  }

  if (ctx?.goals) {
    const g = ctx.goals;
    const gp: string[] = [];
    if (g.calories) gp.push(`${g.calories} kcal/day`);
    if (g.steps) gp.push(`${g.steps} steps/day`);
    if (g.sleep) gp.push(`${g.sleep}h sleep`);
    if (g.water) gp.push(`${g.water}ml water`);
    if (gp.length) parts.push(`Daily goals: ${gp.join(", ")}`);
  }

  if (ctx?.recentMeals?.length) {
    const meals = ctx.recentMeals
      .slice(0, 3)
      .map((m) => `${m.totalCalories} kcal — ${m.summary.slice(0, 60)}`);
    parts.push(`\nRecent meals today:\n${meals.join("\n")}`);
  }

  if (ctx?.healthTwin) parts.push(`\nUser health profile:\n${ctx.healthTwin}`);

  // Add conversation history for context continuity
  if (recentMessages?.length) {
    parts.push("\n--- CONVERSATION SO FAR (reference this naturally!) ---");
    for (const msg of recentMessages.slice(-8)) {
      const who = msg.role === "user" ? "User" : "Nova";
      parts.push(`${who}: ${msg.content.slice(0, 300)}`);
    }
    parts.push("--- END OF HISTORY ---");
    parts.push("IMPORTANT: Build on what was discussed above. Don't repeat yourself. Reference earlier topics naturally.");
  }

  return parts.join("\n");
}

/**
 * POST /api/voice-chat
 * Fast voice conversation: text transcript → Nova 2 Lite → streamed text response.
 * Uses browser STT (instant) instead of Nova Sonic for speed.
 *
 * Accepts: { transcript, sessionId, userContext? }
 * Returns: SSE stream with events:
 *   - text_chunk:   { text }       — partial text as it generates
 *   - done:         { text }       — complete response text
 *   - error:        { message }
 */
export async function POST(request: Request): Promise<Response> {
  const authResult = await requireAuth();
  if (!authResult.authorized) return authResult.response;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit(
    `voice-chat:${authResult.userId}:${ip}`,
    15,
    60_000
  );
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests." }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        ...getRateLimitHeaders(rl),
      },
    });
  }

  const body = (await request.json().catch(() => null)) as VoiceChatBody | null;
  if (!body?.transcript?.trim() || !body.sessionId) {
    return new Response(
      JSON.stringify({ error: "Missing transcript or sessionId." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const transcript = body.transcript.trim().slice(0, 500);

  log({
    level: "info",
    agent: "voice-chat",
    message: `Voice chat: "${transcript.slice(0, 60)}"`,
  });

  const systemPrompt = buildVoiceCoachPrompt(body.userContext, body.recentMessages);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function sse(event: string, data: unknown) {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          /* controller closed */
        }
      }

      try {
        // Single fast call to Nova 2 Lite
        const result = await invokeNovaLite({
          systemPrompt,
          userPrompt: transcript,
          maxTokens: 300,
          temperature: 0.7,
        });
        const responseText = result.text;

        if (!responseText) {
          sse("error", { message: "No response generated." });
        } else {
          // Send complete text
          sse("done", { text: responseText });

          // Save to session memory so text pipeline knows about voice exchanges
          const now = new Date().toISOString();
          addMessageToMemory(body.sessionId, {
            id: `voice-u-${Date.now()}`,
            role: "user",
            content: `[voice] ${transcript}`,
            createdAt: now,
          });
          addMessageToMemory(body.sessionId, {
            id: `voice-a-${Date.now()}`,
            role: "assistant",
            content: responseText,
            createdAt: now,
          });
        }

        log({
          level: "info",
          agent: "voice-chat",
          message: `Voice chat done: "${transcript.slice(0, 40)}" → "${(responseText || "").slice(0, 60)}"`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        log({
          level: "error",
          agent: "voice-chat",
          message: `Voice chat error: ${msg}`,
        });
        sse("error", { message: "Voice conversation failed. Try again." });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
