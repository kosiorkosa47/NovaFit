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
export const maxDuration = 30;

const MAX_AUDIO_SIZE = 2 * 1024 * 1024; // 2 MB

/**
 * POST /api/voice
 * Accepts: { audioBase64: string, sampleRate?: number }
 * Sends audio to Nova Sonic for speech-to-speech processing.
 * Returns: { text: string, audioBase64: string, transcript: string }
 */
export async function POST(request: Request): Promise<Response> {
  const authResult = await requireAuth();
  if (!authResult.authorized) return authResult.response;

  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = checkRateLimit(`${authResult.userId}:${ip}`, 15, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests." },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      audioBase64?: string;
      sampleRate?: number;
      systemPrompt?: string;
    } | null;

    if (!body?.audioBase64) {
      return NextResponse.json(
        { success: false, error: "No audio data provided." },
        { status: 400 }
      );
    }

    const audioBytes = Buffer.from(body.audioBase64, "base64");
    if (audioBytes.length > MAX_AUDIO_SIZE) {
      return NextResponse.json(
        { success: false, error: "Audio too large. Maximum 2 MB." },
        { status: 413 }
      );
    }

    const sampleRate = body.sampleRate ?? 16000;

    log({ level: "info", agent: "voice", message: `Processing voice input (${(audioBytes.length / 1024).toFixed(0)} KB, ${sampleRate}Hz)` });

    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? "us-east-1",
      requestHandler: new NodeHttp2Handler({
        requestTimeout: 180_000,
        sessionTimeout: 180_000,
        disableConcurrentStreams: false,
        maxConcurrentStreams: 20,
      }),
    });

    const systemPrompt = body.systemPrompt ??
      "Jesteś Nova, przyjazny trener zdrowia AI. Odpowiadaj po polsku. Dawaj krótkie, pomocne porady zdrowotne. Odpowiedzi max 3 zdania. If the user speaks English, respond in English.";

    const promptName = `voice-${Date.now()}`;
    const textEncoder = new TextEncoder();

    // Build the event sequence for Nova Sonic
    const events = [
      // 1. Session start
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
      // 2. Prompt start with audio output config
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
      // 4. Audio input
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

    // Split audio into ~32ms chunks (sampleRate * 2 bytes * 0.032s)
    const chunkSize = Math.floor(sampleRate * 2 * 0.032);
    const audioChunks: object[] = [];
    for (let i = 0; i < audioBytes.length; i += chunkSize) {
      const chunk = audioBytes.subarray(i, Math.min(i + chunkSize, audioBytes.length));
      audioChunks.push({
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
      { event: { contentEnd: { promptName, contentName: "user-audio" } } },
      { event: { promptEnd: { promptName } } },
      { event: { sessionEnd: {} } },
    ];

    const allEvents = [...events, ...audioChunks, ...closingEvents];

    async function* generateChunks() {
      for (const evt of allEvents) {
        yield {
          chunk: {
            bytes: textEncoder.encode(JSON.stringify(evt)),
          },
        };
        // Small delay between events
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
    }

    const command = new InvokeModelWithBidirectionalStreamCommand({
      modelId: "amazon.nova-sonic-v1:0",
      body: generateChunks(),
    });

    const response = await client.send(command);

    // Collect response events
    let userTranscript = "";
    let assistantText = "";
    const audioOutputChunks: string[] = [];
    const textDecoder = new TextDecoder();

    if (response.body) {
      for await (const event of response.body) {
        if (event.chunk?.bytes) {
          try {
            const jsonStr = textDecoder.decode(event.chunk.bytes);
            const parsed = JSON.parse(jsonStr);

            if (parsed.event?.textOutput) {
              const content = parsed.event.textOutput.content;
              const role = parsed.event.textOutput.role;
              if (role === "USER") {
                userTranscript += content;
              } else if (role === "ASSISTANT") {
                assistantText += content;
              }
            }

            if (parsed.event?.audioOutput?.content) {
              audioOutputChunks.push(parsed.event.audioOutput.content);
            }
          } catch {
            // Skip unparseable chunks
          }
        }
      }
    }

    // Combine audio chunks
    const combinedAudio = audioOutputChunks.length > 0
      ? Buffer.concat(audioOutputChunks.map((c) => Buffer.from(c, "base64"))).toString("base64")
      : "";

    log({
      level: "info",
      agent: "voice",
      message: `Voice response: transcript="${userTranscript.slice(0, 50)}", reply="${assistantText.slice(0, 50)}", audio=${(combinedAudio.length / 1024).toFixed(0)}KB`,
    });

    return NextResponse.json({
      success: true,
      transcript: userTranscript,
      text: assistantText,
      audioBase64: combinedAudio,
      sampleRate: 24000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log({ level: "error", agent: "voice", message: `Voice error: ${message}` });
    return NextResponse.json(
      { success: false, error: "Voice processing failed. Please try again." },
      { status: 500 }
    );
  }
}
