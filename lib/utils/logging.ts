export type LogLevel = "info" | "warn" | "error" | "trace";

interface LogEntry {
  level: LogLevel;
  agent?: string;
  message: string;
  durationMs?: number;
  sessionId?: string;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatEntry(entry: LogEntry): string {
  const parts = [
    `[${formatTimestamp()}]`,
    `[${entry.level.toUpperCase()}]`
  ];

  if (entry.sessionId) {
    parts.push(`[session:${entry.sessionId.slice(0, 8)}]`);
  }

  if (entry.agent) {
    parts.push(`[${entry.agent}]`);
  }

  parts.push(entry.message);

  if (entry.durationMs !== undefined) {
    parts.push(`(${entry.durationMs}ms)`);
  }

  return parts.join(" ");
}

export function log(entry: LogEntry): void {
  const formatted = formatEntry(entry);

  switch (entry.level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "trace":
      console.log(formatted);
      break;
    default:
      console.log(formatted);
  }
}

export function logAgentStart(agent: string, sessionId?: string): number {
  log({ level: "trace", agent, message: "Starting...", sessionId });
  return Date.now();
}

export function logAgentDone(agent: string, startTime: number, sessionId?: string): void {
  const durationMs = Date.now() - startTime;
  log({ level: "trace", agent, message: "Done", durationMs, sessionId });
}

export function logAgentError(agent: string, error: unknown, sessionId?: string): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  log({ level: "error", agent, message, sessionId });
}

export function logOrchestrator(message: string, sessionId?: string): void {
  log({ level: "info", agent: "orchestrator", message, sessionId });
}
