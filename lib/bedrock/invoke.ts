import {
  ConverseCommand,
  ConverseStreamCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
  type ConverseStreamCommandInput,
  type Message,
  type ContentBlock,
  type ImageFormat,
  type Tool,
  type ToolResultBlock,
} from "@aws-sdk/client-bedrock-runtime";

import { getBedrockClient } from "@/lib/bedrock/client";
import type { ChatMessage } from "@/lib/session/session.types";
import { log } from "@/lib/utils/logging";

const DEFAULT_MODEL_ID_LITE = "us.amazon.nova-2-lite-v1:0";
const DEFAULT_MODEL_ID_SONIC = "us.amazon.nova-2-sonic-v1:0";
const LEGACY_MODEL_ID_SONIC = "amazon.nova-lite-v1:0";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface InvokeOptions {
  systemPrompt: string;
  userPrompt: string;
  history?: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  imageData?: { bytes: Uint8Array; format: "jpeg" | "png" | "webp" | "gif" };
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

async function invokeWithModel(modelId: string, options: InvokeOptions, retries = 1): Promise<InvokeResult> {
  const client = getBedrockClient();

  // Build user content blocks — image first (if present), then text
  const userContent: ContentBlock[] = [];
  if (options.imageData) {
    userContent.push({
      image: {
        format: options.imageData.format as ImageFormat,
        source: { bytes: options.imageData.bytes },
      },
    });
  }
  userContent.push({ text: options.userPrompt });

  const input: ConverseCommandInput = {
    modelId,
    system: [{ text: options.systemPrompt }],
    messages: [
      ...buildHistoryMessages(options.history),
      {
        role: "user",
        content: userContent,
      }
    ],
    inferenceConfig: {
      maxTokens: options.maxTokens ?? 500,
      temperature: options.temperature ?? 0.4,
      topP: 0.9
    }
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await client.send(new ConverseCommand(input), {
        abortSignal: controller.signal
      });

      return {
        text: extractTextFromConverse(response),
        modelId
      };
    } catch (error) {
      clearTimeout(timeout);
      const message = error instanceof Error ? error.message : "Unknown Bedrock error";

      // Retry on transient errors (throttle, timeout, network)
      const isRetryable = message.includes("ThrottlingException") || message.includes("abort") || message.includes("ECONNRESET") || message.includes("socket hang up");
      if (isRetryable && attempt < retries) {
        const delay = 1000 * (attempt + 1); // 1s, 2s backoff
        log({ level: "warn", agent: "bedrock", message: `Retrying ${modelId} in ${delay}ms (attempt ${attempt + 1}): ${message}` });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      throw new Error(`Nova invocation failed (${modelId}): ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Nova invocation failed (${modelId}): max retries exceeded`);
}

export async function invokeNovaLite(options: InvokeOptions): Promise<InvokeResult> {
  const modelId = process.env.BEDROCK_MODEL_ID_LITE ?? DEFAULT_MODEL_ID_LITE;
  return invokeWithModel(modelId, options);
}

/**
 * Invoke Nova with tool calling support.
 * If the model requests a tool, `onToolUse` is called to execute it,
 * and the result is sent back for a final response.
 * Max 3 tool-call rounds to prevent infinite loops.
 */
export async function invokeWithTools(
  options: InvokeOptions & {
    tools: Tool[];
    onToolUse: (toolName: string, toolInput: Record<string, unknown>) => Promise<ToolResultBlock>;
  }
): Promise<InvokeResult> {
  const modelId = process.env.BEDROCK_MODEL_ID_LITE ?? DEFAULT_MODEL_ID_LITE;
  const client = getBedrockClient();

  const userContent: ContentBlock[] = [];
  if (options.imageData) {
    userContent.push({
      image: {
        format: options.imageData.format as ImageFormat,
        source: { bytes: options.imageData.bytes },
      },
    });
  }
  userContent.push({ text: options.userPrompt });

  const messages: Message[] = [
    ...buildHistoryMessages(options.history),
    { role: "user", content: userContent },
  ];

  const MAX_TOOL_ROUNDS = 2;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS + 5000);

    try {
      const input: ConverseCommandInput = {
        modelId,
        system: [{ text: options.systemPrompt }],
        messages,
        toolConfig: { tools: options.tools },
        inferenceConfig: {
          maxTokens: options.maxTokens ?? 600,
          temperature: options.temperature ?? 0.4,
          topP: 0.9,
        },
      };

      const response = await client.send(new ConverseCommand(input), {
        abortSignal: controller.signal,
      });

      const outputContent = response.output?.message?.content;
      if (!outputContent) throw new Error("Bedrock returned no content.");

      // Check if the model wants to use a tool
      const toolUseBlock = outputContent.find((block) => "toolUse" in block);

      if (toolUseBlock && "toolUse" in toolUseBlock && toolUseBlock.toolUse) {
        const { name, input: toolInput, toolUseId } = toolUseBlock.toolUse;
        log({ level: "info", agent: "bedrock", message: `Tool call: ${name}(${JSON.stringify(toolInput).slice(0, 80)})` });

        // Add assistant's tool-use message to conversation
        messages.push({ role: "assistant", content: outputContent });

        // Execute the tool
        const result = await options.onToolUse(
          name ?? "unknown",
          (toolInput ?? {}) as Record<string, unknown>
        );
        result.toolUseId = toolUseId ?? "";

        // Add tool result as user message
        messages.push({
          role: "user",
          content: [{ toolResult: result }],
        });

        // Continue to next round — model will process the tool result
        continue;
      }

      // No tool use — extract text response
      const text = outputContent
        .map((part) => ("text" in part ? (part.text ?? "") : ""))
        .join(" ")
        .trim();

      if (!text) throw new Error("Bedrock returned empty text after tool use.");

      return { text, modelId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Nova tool invocation failed (${modelId}): ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Max tool-calling rounds exceeded.");
}

/**
 * Stream Nova 2 Lite response token-by-token.
 * Calls onChunk for each text delta, returns full text at the end.
 */
export async function invokeNovaLiteStream(
  options: InvokeOptions & { onChunk: (text: string) => void }
): Promise<InvokeResult> {
  const modelId = process.env.BEDROCK_MODEL_ID_LITE ?? DEFAULT_MODEL_ID_LITE;
  const client = getBedrockClient();

  const userContent: ContentBlock[] = [];
  if (options.imageData) {
    userContent.push({
      image: {
        format: options.imageData.format as ImageFormat,
        source: { bytes: options.imageData.bytes },
      },
    });
  }
  userContent.push({ text: options.userPrompt });

  const input: ConverseStreamCommandInput = {
    modelId,
    system: [{ text: options.systemPrompt }],
    messages: [
      ...buildHistoryMessages(options.history),
      { role: "user", content: userContent },
    ],
    inferenceConfig: {
      maxTokens: options.maxTokens ?? 500,
      temperature: options.temperature ?? 0.4,
      topP: 0.9,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS + 10_000);

  try {
    const response = await client.send(new ConverseStreamCommand(input), {
      abortSignal: controller.signal,
    });

    let fullText = "";
    const stream = response.stream;
    if (!stream) throw new Error("No stream returned from ConverseStreamCommand");

    for await (const event of stream) {
      if (event.contentBlockDelta?.delta && "text" in event.contentBlockDelta.delta) {
        const chunk = event.contentBlockDelta.delta.text ?? "";
        if (chunk) {
          fullText += chunk;
          options.onChunk(chunk);
        }
      }
    }

    if (!fullText.trim()) {
      throw new Error("Streaming returned empty response.");
    }

    return { text: fullText, modelId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown streaming error";
    throw new Error(`Nova streaming failed (${modelId}): ${message}`);
  } finally {
    clearTimeout(timeout);
  }
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
