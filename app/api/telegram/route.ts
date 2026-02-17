import { NextResponse } from "next/server";

import { orchestrateAgents } from "@/lib/orchestrator";
import { sanitizeMessageInput } from "@/lib/utils/sanitize";
import { log } from "@/lib/utils/logging";

export const runtime = "nodejs";

// Telegram Update types (minimal subset we need)
interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  from?: { id: number; first_name?: string };
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

function getTelegramToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const token = getTelegramToken();
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown"
    })
  });
}

async function sendTypingAction(chatId: number): Promise<void> {
  const token = getTelegramToken();
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" })
  });
}

/**
 * POST /api/telegram
 *
 * Telegram webhook endpoint. Set it up with:
 *   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-domain.vercel.app/api/telegram"
 *
 * Required env var: TELEGRAM_BOT_TOKEN
 */
export async function POST(request: Request): Promise<Response> {
  const token = getTelegramToken();
  if (!token) {
    return NextResponse.json({ error: "Telegram bot not configured" }, { status: 503 });
  }

  try {
    const update = (await request.json()) as TelegramUpdate;
    const message = update.message;

    if (!message?.text || !message.chat?.id) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const userId = message.from?.id ?? chatId;
    // Use Telegram user ID as stable session ID
    const sessionId = `tg-${userId}`;
    const userMessage = sanitizeMessageInput(message.text);

    if (!userMessage) {
      return NextResponse.json({ ok: true });
    }

    log({ level: "info", agent: "telegram", message: `Message from chat=${chatId}: "${userMessage.slice(0, 50)}..."`, sessionId });

    // Handle /start command
    if (userMessage.startsWith("/start")) {
      await sendTelegramMessage(
        chatId,
        "Hi! I'm *Nova Health Agent*, your adaptive AI wellness coach.\n\nTell me how you're feeling and I'll create a personalized plan for you.\n\nExample: _I'm tired after work today_"
      );
      return NextResponse.json({ ok: true });
    }

    // Show typing indicator
    await sendTypingAction(chatId);

    // Run the full agent pipeline
    const result = await orchestrateAgents({
      sessionId,
      message: userMessage
    });

    // Send the reply
    await sendTelegramMessage(chatId, result.apiResponse.reply);

    log({ level: "info", agent: "telegram", message: `Reply sent to chat=${chatId}`, sessionId });

    return NextResponse.json({ ok: true });
  } catch (error) {
    log({ level: "error", agent: "telegram", message: error instanceof Error ? error.message : "Unknown error" });

    // Always return 200 to Telegram to avoid retries
    return NextResponse.json({ ok: true });
  }
}

/**
 * GET /api/telegram
 *
 * Health check / webhook info
 */
export async function GET(): Promise<Response> {
  const configured = Boolean(getTelegramToken());
  return NextResponse.json({
    service: "Nova Health Agent - Telegram Webhook",
    configured,
    setup: configured
      ? "Webhook is configured. POST updates to this endpoint."
      : "Set TELEGRAM_BOT_TOKEN environment variable to enable."
  });
}
