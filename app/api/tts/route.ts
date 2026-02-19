import { NextResponse } from "next/server";
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2Handler } from "@smithy/node-http-handler";
import { log } from "@/lib/utils/logging";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/utils/rate-limit";
import { requireAuth } from "@/lib/auth/helpers";

export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * POST /api/tts
 * Text-to-Speech via Nova Sonic.
 * Accepts: { text: string, lang?: "pl" | "en" }
 * Returns: { success: boolean, audioBase64: string, sampleRate: number }
 */
export async function POST(request: Request): Promise<Response> {
  const authResult = await requireAuth();
  if (!authResult.authorized) return authResult.response;

  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = checkRateLimit(`tts:${authResult.userId}:${ip}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests." },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      text?: string;
      lang?: string;
    } | null;

    if (!body?.text || body.text.length > 2000) {
      return NextResponse.json(
        { success: false, error: "Text is required (max 2000 chars)." },
        { status: 400 }
      );
    }

    const text = body.text;
    const lang = body.lang ?? "en";

    log({ level: "info", agent: "tts", message: `TTS request: ${text.slice(0, 60)}... (${lang})` });

    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? "us-east-1",
      requestHandler: new NodeHttp2Handler({
        requestTimeout: 30_000,
        sessionTimeout: 30_000,
        disableConcurrentStreams: false,
        maxConcurrentStreams: 10,
      }),
    });

    const promptName = `tts-${Date.now()}`;
    const textEncoder = new TextEncoder();

    const systemPrompt = lang === "pl"
      ? "Przeczytaj na głos dokładnie to, co podaje użytkownik. Nie dodawaj niczego od siebie. Mów naturalnie po polsku."
      : "Read aloud exactly what the user provides. Do not add anything of your own. Speak naturally in the same language as the text.";

    const events = [
      // 1. Session start
      {
        event: {
          sessionStart: {
            inferenceConfiguration: {
              maxTokens: 256,
              topP: 0.9,
              temperature: 0.3,
            },
          },
        },
      },
      // 2. Prompt start with audio output
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
      // 3. System prompt
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
      // 4. User text input (the text to speak aloud)
      {
        event: {
          contentStart: {
            promptName,
            contentName: "user-text",
            type: "TEXT",
            interactive: true,
            role: "USER",
            textInputConfiguration: { mediaType: "text/plain" },
          },
        },
      },
      {
        event: {
          textInput: {
            promptName,
            contentName: "user-text",
            content: text,
          },
        },
      },
      { event: { contentEnd: { promptName, contentName: "user-text" } } },
      // 5. Close
      { event: { promptEnd: { promptName } } },
      { event: { sessionEnd: {} } },
    ];

    async function* generateChunks() {
      for (const evt of events) {
        yield {
          chunk: {
            bytes: textEncoder.encode(JSON.stringify(evt)),
          },
        };
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    const command = new InvokeModelWithBidirectionalStreamCommand({
      modelId: "amazon.nova-sonic-v1:0",
      body: generateChunks(),
    });

    const response = await client.send(command);

    const audioOutputChunks: string[] = [];
    const textDecoder = new TextDecoder();

    if (response.body) {
      for await (const event of response.body) {
        if (event.chunk?.bytes) {
          try {
            const jsonStr = textDecoder.decode(event.chunk.bytes);
            const parsed = JSON.parse(jsonStr);
            if (parsed.event?.audioOutput?.content) {
              audioOutputChunks.push(parsed.event.audioOutput.content);
            }
          } catch {
            // Skip unparseable chunks
          }
        }
      }
    }

    const combinedAudio = audioOutputChunks.length > 0
      ? Buffer.concat(audioOutputChunks.map((c) => Buffer.from(c, "base64"))).toString("base64")
      : "";

    if (!combinedAudio) {
      log({ level: "warn", agent: "tts", message: "Nova Sonic returned no audio" });
      return NextResponse.json({ success: false, error: "No audio generated." }, { status: 500 });
    }

    log({ level: "info", agent: "tts", message: `TTS audio: ${(combinedAudio.length / 1024).toFixed(0)} KB` });

    return NextResponse.json({
      success: true,
      audioBase64: combinedAudio,
      sampleRate: 24000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log({ level: "error", agent: "tts", message: `TTS error: ${message}` });
    return NextResponse.json(
      { success: false, error: "Text-to-speech failed." },
      { status: 500 }
    );
  }
}
