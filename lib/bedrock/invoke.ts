import {
  ConverseCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
  type Message
} from "@aws-sdk/client-bedrock-runtime";

import { getBedrockClient } from "@/lib/bedrock/client";
import type { ChatMessage } from "@/lib/session/session.types";
import { log } from "@/lib/utils/logging";

const DEFAULT_MODEL_ID_LITE = "us.amazon.nova-2-lite-v1:0";
const DEFAULT_MODEL_ID_SONIC = "us.amazon.nova-2-sonic-v1:0";
const LEGACY_MODEL_ID_SONIC = "amazon.nova-lite-v1:0";
const DEFAULT_TIMEOUT_MS = 12_000;

export interface InvokeOptions {
  systemPrompt: string;
  userPrompt: string;
  history?: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface InvokeResult {
  text: string;
  modelId: string;
}

function buildHistoryMessages(history: ChatMessage[] = []): Message[] {
  return history
    .filter(
      (msg): msg is ChatMessage & { role: "user" | "assistant" } =>
        msg.role === "user" || msg.role === "assistant"
    )
    .map((msg) => ({
      role: msg.role,
      content: [{ text: msg.content }]
    }));
}

function extractTextFromConverse(output: ConverseCommandOutput): string {
  const text = output.output?.message?.content
    ?.map((part) => ("text" in part ? (part.text ?? "") : ""))
    .join(" ")
    .trim();

  if (!text) {
    throw new Error("Bedrock returned an empty response.");
  }

  return text;
}

async function invokeWithModel(modelId: string, options: InvokeOptions): Promise<InvokeResult> {
  const client = getBedrockClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const input: ConverseCommandInput = {
    modelId,
    system: [{ text: options.systemPrompt }],
    messages: [
      ...buildHistoryMessages(options.history),
      {
        role: "user",
        content: [{ text: options.userPrompt }]
      }
    ],
    inferenceConfig: {
      maxTokens: options.maxTokens ?? 500,
      temperature: options.temperature ?? 0.4,
      topP: 0.9
    }
  };

  try {
    const response = await client.send(new ConverseCommand(input), {
      abortSignal: controller.signal
    });

    return {
      text: extractTextFromConverse(response),
      modelId
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Bedrock error";
    throw new Error(`Nova invocation failed (${modelId}): ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function invokeNovaLite(options: InvokeOptions): Promise<InvokeResult> {
  const modelId = process.env.BEDROCK_MODEL_ID_LITE ?? DEFAULT_MODEL_ID_LITE;
  return invokeWithModel(modelId, options);
}

export async function invokeNovaSonicOrFallback(options: InvokeOptions): Promise<InvokeResult> {
  const preferredSonicModel = process.env.BEDROCK_MODEL_ID_SONIC ?? DEFAULT_MODEL_ID_SONIC;

  try {
    return await invokeWithModel(preferredSonicModel, options);
  } catch (firstError) {
    log({ level: "warn", agent: "bedrock", message: `Sonic model failed, trying fallback: ${firstError instanceof Error ? firstError.message : "unknown"}` });

    if (preferredSonicModel !== LEGACY_MODEL_ID_SONIC) {
      try {
        return await invokeWithModel(LEGACY_MODEL_ID_SONIC, options);
      } catch {
        // Continue to Lite fallback
      }
    }

    return invokeNovaLite(options);
  }
}
