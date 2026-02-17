import type { ChatMessage, SessionMemory } from "@/lib/session/session.types";

const MEMORY_WINDOW_MESSAGES = 8;
const MEMORY_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const MAX_ADAPTATION_NOTES = 10;
const MAX_USER_FACTS = 20;

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

export function addMessageToMemory(sessionId: string, message: ChatMessage): void {
  const memory = getOrCreateSessionMemory(sessionId);
  memory.messages.push(message);

  if (memory.messages.length > MEMORY_WINDOW_MESSAGES * 2) {
    memory.messages = memory.messages.slice(-MEMORY_WINDOW_MESSAGES * 2);
  }

  memory.lastUpdatedAt = Date.now();
}

export function addAdaptationNote(sessionId: string, note: string): void {
  if (!note) return;

  const memory = getOrCreateSessionMemory(sessionId);
  memory.adaptationNotes.push(note);
  memory.adaptationNotes = memory.adaptationNotes.slice(-MAX_ADAPTATION_NOTES);
  memory.lastUpdatedAt = Date.now();
}

export function addUserFact(sessionId: string, fact: string): void {
  if (!fact) return;

  const memory = getOrCreateSessionMemory(sessionId);

  // Avoid duplicates
  if (!memory.userFacts.includes(fact)) {
    memory.userFacts.push(fact);
    memory.userFacts = memory.userFacts.slice(-MAX_USER_FACTS);
  }

  memory.lastUpdatedAt = Date.now();
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
