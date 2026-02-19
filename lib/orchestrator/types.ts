import type { WearableSnapshot } from "@/lib/integrations/wearables.mock";

export type AgentName = "analyzer" | "planner" | "monitor";

export type StreamMode = "stream" | "json";

export type SseEventType =
  | "status"
  | "agent_update"
  | "final"
  | "error"
  | "done";

export interface SseEvent {
  type: SseEventType;
  message?: string;
  agent?: AgentName;
  payload?: unknown;
}

export interface AnalyzerResult {
  summary: string;
  energyScore: number;
  keySignals: string[];
  riskFlags: string[];
}

export interface PlanRecommendation {
  summary: string;
  diet: string[];
  exercise: string[];
  hydration: string;
  recovery: string;
  nutritionContext: string[];
}

export interface MonitorResult {
  reply: string;
  tone: string;
  feedbackPrompt: string;
  adaptationNote: string;
}

export interface AgentStepResult<T> {
  agent: AgentName;
  raw: string;
  parsed: T;
}

export interface ImageAttachment {
  bytes: Uint8Array;
  format: "jpeg" | "png" | "webp" | "gif";
}

export interface UserContext {
  name?: string;
  goals?: { calories?: number; steps?: number; sleep?: number; water?: number };
  healthData?: {
    steps: number;
    heartRate: number | null;
    calories: number;
    sleep: number;
    stress: number;
    source: string;
  };
  timezone?: string;
  locale?: string;
  timeOfDay?: string;
  dayOfWeek?: string;
}

export interface AgentApiRequest {
  sessionId: string;
  message: string;
  feedback?: string;
  mode?: StreamMode;
  image?: ImageAttachment;
  userContext?: UserContext;
}

export interface AgentApiResponse {
  success: boolean;
  sessionId: string;
  reply: string;
  analyzerSummary: string;
  plan: PlanRecommendation;
  monitorTone: string;
  memorySize: number;
  wearableSnapshot?: WearableSnapshot;
}

export interface OrchestratorInput {
  sessionId: string;
  message: string;
  feedback?: string;
  image?: ImageAttachment;
  userContext?: UserContext;
  onEvent?: (event: SseEvent) => void;
}

export interface OrchestratorOutput {
  apiResponse: AgentApiResponse;
  analyzer: AgentStepResult<AnalyzerResult>;
  planner: AgentStepResult<PlanRecommendation>;
  monitor: AgentStepResult<MonitorResult>;
}
