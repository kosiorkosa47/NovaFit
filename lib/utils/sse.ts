import type { SseEventType, SseEvent } from "@/lib/orchestrator/types";

export function formatSseEvent(eventType: SseEventType, payload: Omit<SseEvent, "type">): string {
  return `event: ${eventType}\ndata: ${JSON.stringify({ type: eventType, ...payload })}\n\n`;
}
