import { NextResponse } from "next/server";
import { z } from "zod";

import { assertBedrockEnv } from "@/lib/bedrock/client";
import { orchestrateAgents } from "@/lib/orchestrator";
import type { SseEvent } from "@/lib/orchestrator/types";
import { MAX_FEEDBACK_LENGTH, MAX_MESSAGE_LENGTH, sanitizeMessageInput, sanitizeFeedbackInput } from "@/lib/utils/sanitize";
import { formatSseEvent } from "@/lib/utils/sse";
import { log } from "@/lib/utils/logging";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/utils/rate-limit";
import { v4 as uuidv4 } from "uuid";
import { isValidSessionId } from "@/lib/utils/sanitize";

export const runtime = "nodejs";

const requestSchema = z.object({
  sessionId: z.string().min(8).max(80),
  message: z.string().min(1).max(MAX_MESSAGE_LENGTH * 2),
  feedback: z.string().max(MAX_FEEDBACK_LENGTH * 2).optional(),
  mode: z.enum(["stream", "json"]).optional()
});

function ensureSessionId(candidate?: string): string {
  if (candidate && isValidSessionId(candidate)) {
    return candidate;
  }
  return uuidv4();
}

function getSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.includes("Missing required environment variable")
      ? "Server configuration is incomplete. Please check Bedrock environment variables."
      : "Something went wrong while generating your plan. Please try again.";
  }

  return "Unexpected server error.";
}

export async function POST(request: Request): Promise<Response> {
  try {
    // Rate limit: 20 requests per minute per IP
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = checkRateLimit(ip, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please wait a moment." },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request payload.",
          details: parsed.error.flatten()
        },
        { status: 400 }
      );
    }

    const sessionId = ensureSessionId(parsed.data.sessionId);
    const message = sanitizeMessageInput(parsed.data.message);
    const feedback = parsed.data.feedback ? sanitizeFeedbackInput(parsed.data.feedback) : undefined;

    if (!message) {
      return NextResponse.json(
        {
          success: false,
          error: "Message cannot be empty after sanitization."
        },
        { status: 400 }
      );
    }

    assertBedrockEnv();

    log({ level: "info", agent: "api", message: `POST /api/agent session=${sessionId.slice(0, 8)} mode=${parsed.data.mode ?? "stream"}` });

    const forceJson = parsed.data.mode === "json";

    if (forceJson) {
      const result = await orchestrateAgents({
        sessionId,
        message,
        feedback
      });

      return NextResponse.json(result.apiResponse, { status: 200 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const emit = (event: SseEvent): void => {
          controller.enqueue(
            encoder.encode(formatSseEvent(event.type, {
              message: event.message,
              agent: event.agent,
              payload: event.payload
            }))
          );
        };

        void (async () => {
          try {
            emit({ type: "status", message: "Initializing Nova multi-agent orchestration..." });

            const result = await orchestrateAgents({
              sessionId,
              message,
              feedback,
              onEvent: emit
            });

            emit({
              type: "final",
              message: "Plan completed.",
              payload: result.apiResponse
            });
            emit({ type: "done", message: "stream_complete" });
          } catch (error) {
            log({ level: "error", agent: "api", message: getSafeErrorMessage(error), sessionId });
            emit({
              type: "error",
              message: getSafeErrorMessage(error)
            });
          } finally {
            controller.close();
          }
        })();
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    log({ level: "error", agent: "api", message: getSafeErrorMessage(error) });
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error)
      },
      { status: 500 }
    );
  }
}
