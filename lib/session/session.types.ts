export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "agent";
  content: string;
  createdAt: string;
  agent?: "analyzer" | "planner" | "monitor";
}

export interface SessionMemory {
  sessionId: string;
  messages: ChatMessage[];
  adaptationNotes: string[];
  /** User facts: allergies, weight, preferences discovered through conversation */
  userFacts: string[];
  lastUpdatedAt: number;
}
