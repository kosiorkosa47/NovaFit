import type { ChatMessage, SessionMemory } from "@/lib/session/session.types";
import { getSession, putSession, updateSessionField } from "@/lib/db/dynamodb";

const MEMORY_WINDOW_MESSAGES = 8;
const MEMORY_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const MAX_ADAPTATION_NOTES = 10;
const MAX_USER_FACTS = 20;

// In-memory L1 cache (fast path)
function getGlobalMemoryStore(): Map<string, SessionMemory> {
  const globalScope = globalThis as typeof globalThis & {
    __novaSessionMemory?: Map<string, SessionMemory>;
  };

  if (!globalScope.__novaSessionMemory) {
    globalScope.__novaSessionMemory = new Map<string, SessionMemory>();
  }

  return globalScope.__novaSessionMemory;
}

export function getOrCreateSessionMemory(sessionId: string): SessionMemory {
  const store = getGlobalMemoryStore();
  const existing = store.get(sessionId);

  if (existing) {
    existing.lastUpdatedAt = Date.now();
    return existing;
  }

  const fresh: SessionMemory = {
    sessionId,
    messages: [],
    adaptationNotes: [],
    userFacts: [],
    lastUpdatedAt: Date.now()
  };

  store.set(sessionId, fresh);
  return fresh;
}

/** Fire-and-forget DynamoDB write — don't block the response */
function asyncPersist(sessionId: string, memory: SessionMemory): void {
  void putSession(sessionId, {
    messages: memory.messages,
    adaptationNotes: memory.adaptationNotes,
    userFacts: memory.userFacts,
  }).catch(() => { /* silently ignore — in-memory is authoritative during session */ });
}

export function addMessageToMemory(sessionId: string, message: ChatMessage): void {
  const memory = getOrCreateSessionMemory(sessionId);
  memory.messages.push(message);

  if (memory.messages.length > MEMORY_WINDOW_MESSAGES * 2) {
    memory.messages = memory.messages.slice(-MEMORY_WINDOW_MESSAGES * 2);
  }

  memory.lastUpdatedAt = Date.now();

  // Async DynamoDB write (fire-and-forget)
  void updateSessionField(sessionId, "messages", memory.messages).catch(() => {});
}

export function addAdaptationNote(sessionId: string, note: string): void {
  if (!note) return;

  const memory = getOrCreateSessionMemory(sessionId);
  memory.adaptationNotes.push(note);
  memory.adaptationNotes = memory.adaptationNotes.slice(-MAX_ADAPTATION_NOTES);
  memory.lastUpdatedAt = Date.now();

  void updateSessionField(sessionId, "adaptationNotes", memory.adaptationNotes).catch(() => {});
}

export function addUserFact(sessionId: string, fact: string): void {
  if (!fact) return;

  const memory = getOrCreateSessionMemory(sessionId);

  if (!memory.userFacts.includes(fact)) {
    memory.userFacts.push(fact);
    memory.userFacts = memory.userFacts.slice(-MAX_USER_FACTS);
  }

  memory.lastUpdatedAt = Date.now();

  void updateSessionField(sessionId, "userFacts", memory.userFacts).catch(() => {});
}

export function getRecentMessages(sessionId: string, limit = MEMORY_WINDOW_MESSAGES): ChatMessage[] {
  const memory = getOrCreateSessionMemory(sessionId);
  return memory.messages.slice(-limit);
}

export function getAdaptationNotes(sessionId: string, limit = 3): string[] {
  const memory = getOrCreateSessionMemory(sessionId);
  return memory.adaptationNotes.slice(-limit);
}

export function getUserFacts(sessionId: string): string[] {
  const memory = getOrCreateSessionMemory(sessionId);
  return memory.userFacts;
}

export function getMemorySize(sessionId: string): number {
  const memory = getOrCreateSessionMemory(sessionId);
  return memory.messages.length;
}

export function cleanupExpiredSessions(ttlMs = MEMORY_TTL_MS): void {
  const store = getGlobalMemoryStore();
  const now = Date.now();

  for (const [sessionId, memory] of store.entries()) {
    if (now - memory.lastUpdatedAt > ttlMs) {
      store.delete(sessionId);
    }
  }
}

/**
 * Hydrate in-memory cache from DynamoDB.
 * Call at the start of each request to recover from cold starts.
 */
export async function loadSession(sessionId: string): Promise<void> {
  const store = getGlobalMemoryStore();
  if (store.has(sessionId)) return; // Already in cache

  const dbSession = await getSession(sessionId);
  if (!dbSession) return; // No prior data

  const memory: SessionMemory = {
    sessionId,
    messages: (dbSession.messages ?? []) as ChatMessage[],
    adaptationNotes: dbSession.adaptationNotes ?? [],
    userFacts: dbSession.userFacts ?? [],
    lastUpdatedAt: Date.now(),
  };

  store.set(sessionId, memory);
}

/**
 * Force-write entire session to DynamoDB.
 */
export async function flushSession(sessionId: string): Promise<void> {
  const memory = getOrCreateSessionMemory(sessionId);
  await putSession(sessionId, {
    messages: memory.messages,
    adaptationNotes: memory.adaptationNotes,
    userFacts: memory.userFacts,
  });
}
