import { log } from "@/lib/utils/logging";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/utils/rate-limit";
import { requireAuth } from "@/lib/auth/helpers";
import { invokeNovaLite } from "@/lib/bedrock/invoke";

export const runtime = "nodejs";
export const maxDuration = 30;

interface VoiceChatBody {
  transcript: string;
  sessionId: string;
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

/** Build a voice-optimized health coaching prompt */
function buildVoiceCoachPrompt(ctx?: VoiceChatBody["userContext"]): string {
  const parts: string[] = [
    "You are Nova, a knowledgeable AI health and wellness coach having a voice conversation.",
    "",
    "RULES:",
    "- Give 3-5 sentences of SPECIFIC, ACTIONABLE health advice.",
    "- Name exact foods, exercises, amounts, and timing.",
    "- Be warm and conversational — like a smart friend who knows health science.",
    "- If they're tired/stressed, acknowledge first, then give concrete tips.",
    "- End with one brief follow-up question.",
    "- Match their language (Polish → Polish, English → English).",
    "- NO bullet points or lists — speak naturally.",
    "",
    "EXAMPLES of good responses:",
    "\"That's great you went for a run this morning! To recover well, grab some Greek yogurt with banana within 30 minutes — the protein and carbs help muscle repair. For lunch, try salmon with quinoa, about 450 calories, which gives you omega-3s for inflammation. How's your water intake been today?\"",
    "",
    "\"I hear you're feeling tired. Since you only got 5 hours of sleep, your body needs quick energy — try a handful of almonds with an apple right now, about 200 calories. Skip the coffee after 2pm though, it'll hurt tonight's sleep. A 15-minute walk outside would actually boost your energy more than caffeine. What time are you planning to sleep tonight?\"",
  ];

  if (ctx?.name) parts.push(`\nUser's name: ${ctx.name}`);
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

  const systemPrompt = buildVoiceCoachPrompt(body.userContext);

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
