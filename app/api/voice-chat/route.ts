import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2Handler } from "@smithy/node-http-handler";
import { log } from "@/lib/utils/logging";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/utils/rate-limit";
import { requireAuth } from "@/lib/auth/helpers";
import { getWearableSnapshot, formatWearableForPrompt } from "@/lib/integrations/wearables.mock";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_SIZE = 2 * 1024 * 1024; // 2 MB

interface VoiceChatBody {
  audioBase64: string;
  sampleRate?: number;
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

/** Build a voice-optimized health coaching system prompt */
function buildVoiceCoachPrompt(
  ctx?: VoiceChatBody["userContext"],
  wearableStr?: string
): string {
  const parts: string[] = [
    "You are Nova, a friendly AI health and wellness coach. You are having a real-time voice conversation.",
    "",
    "VOICE CONVERSATION RULES:",
    "- Keep responses SHORT: 2-3 sentences max. This is spoken, not written.",
    "- Be warm, natural, conversational — like a knowledgeable friend.",
    "- NO lists, bullet points, or structured formats. Speak naturally.",
    "- Give specific advice: name exact foods, exercises, and amounts.",
    "- If they are tired or stressed, acknowledge feelings first.",
    "- Use their name once per response, naturally.",
    "- Match their language (Polish → Polish, English → English).",
    "- End with a brief follow-up question to keep the conversation going.",
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

  if (wearableStr) parts.push(`\nCurrent sensor data:\n${wearableStr}`);

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
 * Real-time voice conversation via Nova Sonic with streaming audio response.
 *
 * Accepts: { audioBase64, sampleRate?, sessionId, userContext? }
 * Returns: SSE stream with events:
 *   - status:        { message }
 *   - transcript:    { text }       — user's speech transcribed
 *   - audio:         { chunk, sampleRate } — base64 PCM audio to play immediately
 *   - response_text: { text }       — assistant's text response
 *   - done:          { success }
 *   - error:         { message }
 */
export async function POST(request: Request): Promise<Response> {
  const authResult = await requireAuth();
  if (!authResult.authorized) return authResult.response;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit(
    `voice-chat:${authResult.userId}:${ip}`,
    10,
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
  if (!body?.audioBase64 || !body.sessionId) {
    return new Response(
      JSON.stringify({ error: "Missing audio or sessionId." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const audioBytes = Buffer.from(body.audioBase64, "base64");
  if (audioBytes.length > MAX_AUDIO_SIZE) {
    return new Response(JSON.stringify({ error: "Audio too large." }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sampleRate = body.sampleRate ?? 16000;

  log({
    level: "info",
    agent: "voice-chat",
    message: `Voice chat: ${(audioBytes.length / 1024).toFixed(0)} KB, ${sampleRate}Hz`,
  });

  // Get wearable data for health context
  let wearableStr = "";
  try {
    const wearable = await getWearableSnapshot(body.sessionId);
    wearableStr = formatWearableForPrompt(wearable);
  } catch {
    /* ignore */
  }

  const systemPrompt = buildVoiceCoachPrompt(body.userContext, wearableStr);

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
        sse("status", { message: "Listening..." });

        const client = new BedrockRuntimeClient({
          region: process.env.AWS_REGION ?? "us-east-1",
          requestHandler: new NodeHttp2Handler({
            requestTimeout: 180_000,
            sessionTimeout: 180_000,
            disableConcurrentStreams: false,
            maxConcurrentStreams: 20,
          }),
        });

        const promptName = `vc-${Date.now()}`;
        const te = new TextEncoder();

        // --- Build Nova Sonic event sequence ---
        const inputEvents = [
          // Session start
          {
            event: {
              sessionStart: {
                inferenceConfiguration: {
                  maxTokens: 512,
                  topP: 0.9,
                  temperature: 0.7,
                },
              },
            },
          },
          // Prompt start + audio output config
          {
            event: {
              promptStart: {
                promptName,
                textOutputConfiguration: { mediaType: "text/plain" },
                audioOutputConfiguration: {
                  mediaType: "audio/lpcm",
                  sampleRateHertz: 24000,
                  sampleSizeBits: 16,
                  channelCount: 1,
                  voiceId: "tiffany",
                  encoding: "base64",
                  audioType: "SPEECH",
                },
              },
            },
          },
          // System prompt
          {
            event: {
              contentStart: {
                promptName,
                contentName: "system",
                type: "TEXT",
                interactive: false,
                role: "SYSTEM",
                textInputConfiguration: { mediaType: "text/plain" },
              },
            },
          },
          {
            event: {
              textInput: {
                promptName,
                contentName: "system",
                content: systemPrompt,
              },
            },
          },
          { event: { contentEnd: { promptName, contentName: "system" } } },
          // Audio input start
          {
            event: {
              contentStart: {
                promptName,
                contentName: "user-audio",
                type: "AUDIO",
                interactive: true,
                role: "USER",
                audioInputConfiguration: {
                  mediaType: "audio/lpcm",
                  sampleRateHertz: sampleRate,
                  sampleSizeBits: 16,
                  channelCount: 1,
                  audioType: "SPEECH",
                  encoding: "base64",
                },
              },
            },
          },
        ];

        // Split audio into ~32ms chunks
        const chunkSize = Math.floor(sampleRate * 2 * 0.032);
        const audioInputChunks: object[] = [];
        for (let i = 0; i < audioBytes.length; i += chunkSize) {
          const chunk = audioBytes.subarray(
            i,
            Math.min(i + chunkSize, audioBytes.length)
          );
          audioInputChunks.push({
            event: {
              audioInput: {
                promptName,
                contentName: "user-audio",
                content: chunk.toString("base64"),
              },
            },
          });
        }

        // Closing events
        const closingEvents = [
          {
            event: { contentEnd: { promptName, contentName: "user-audio" } },
          },
          { event: { promptEnd: { promptName } } },
          { event: { sessionEnd: {} } },
        ];

        const allInputEvents = [
          ...inputEvents,
          ...audioInputChunks,
          ...closingEvents,
        ];

        async function* generateInput() {
          for (const evt of allInputEvents) {
            yield { chunk: { bytes: te.encode(JSON.stringify(evt)) } };
            await new Promise((r) => setTimeout(r, 15));
          }
        }

        sse("status", { message: "Nova is thinking..." });

        const command = new InvokeModelWithBidirectionalStreamCommand({
          modelId: "amazon.nova-sonic-v1:0",
          body: generateInput(),
        });

        const response = await client.send(command);

        let userTranscript = "";
        let assistantText = "";
        let audioChunkCount = 0;
        const td = new TextDecoder();

        if (response.body) {
          for await (const event of response.body) {
            if (event.chunk?.bytes) {
              try {
                const jsonStr = td.decode(event.chunk.bytes);
                const parsed = JSON.parse(jsonStr);

                // Stream audio chunks to client IMMEDIATELY
                if (parsed.event?.audioOutput?.content) {
                  sse("audio", {
                    chunk: parsed.event.audioOutput.content,
                    sampleRate: 24000,
                  });
                  audioChunkCount++;
                }

                // Collect text outputs
                if (parsed.event?.textOutput) {
                  const content = parsed.event.textOutput.content ?? "";
                  const role = parsed.event.textOutput.role;
                  if (role === "USER") {
                    userTranscript += content;
                    sse("transcript", { text: userTranscript });
                  } else if (role === "ASSISTANT") {
                    assistantText += content;
                  }
                }
              } catch {
                // Skip unparseable chunks
              }
            }
          }
        }

        // Send complete response text
        if (assistantText) {
          sse("response_text", { text: assistantText });
        }

        log({
          level: "info",
          agent: "voice-chat",
          message: `Voice chat done: "${userTranscript.slice(0, 50)}" → "${assistantText.slice(0, 50)}" (${audioChunkCount} audio chunks)`,
        });

        sse("done", {
          success: true,
          transcript: userTranscript,
          responseText: assistantText,
          audioChunks: audioChunkCount,
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
