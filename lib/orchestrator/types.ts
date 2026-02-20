import type { WearableSnapshot } from "@/lib/integrations/wearables.mock";
import type { ProfileUpdates } from "@/lib/health-twin/types";

export type AgentName = "analyzer" | "planner" | "monitor";

export type StreamMode = "stream" | "json";

export type DispatchRoute = "greeting" | "quick" | "followup" | "photo" | "full";

export interface DispatcherResult {
  route: DispatchRoute;
  confidence: number;
  reasoning: string;
}

export type SseEventType =
  | "status"
  | "agent_update"
  | "dispatcher"
  | "text_chunk"
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
  profileUpdates?: ProfileUpdates;
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
  /** Health Twin — persistent knowledge built from past conversations */
  healthTwin?: string;
  healthData?: {
    steps: number;
    heartRate: number | null;
    calories: number;
    sleep: number;
    stress: number;
    source: string;
  };
  recentMeals?: {
    summary: string;
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
    analyzedAt: string;
  }[];
  timezone?: string;
  locale?: string;
  appLanguage?: string;
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

export interface ValidationInfo {
  validated: boolean;
  conflicts?: string[];
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
  profileUpdates?: ProfileUpdates;
  route?: DispatchRoute;
  timing?: AgentTiming;
  validation?: ValidationInfo;
}

export interface OrchestratorInput {
  sessionId: string;
  message: string;
  feedback?: string;
  image?: ImageAttachment;
  userContext?: UserContext;
  mode?: "voice" | "text";
  onEvent?: (event: SseEvent) => void;
}

export interface AgentTiming {
  dispatcher?: number;
  analyzer?: number;
  planner?: number;
  validator?: number;
  monitor?: number;
  total?: number;
}

export interface AgentTraceStep {
  agent: string;
  startMs: number;
  durationMs: number;
  inputTokensEstimate?: number;
  outputTokensEstimate?: number;
  status: "success" | "fallback" | "skipped";
  note?: string;
}

export interface PipelineTrace {
  traceId: string;
  sessionId: string;
  route: DispatchRoute;
  steps: AgentTraceStep[];
  totalMs: number;
  agentCount: number;
  usedFallback: boolean;
  validation?: ValidationInfo;
}

export interface OrchestratorOutput {
  apiResponse: AgentApiResponse;
  analyzer: AgentStepResult<AnalyzerResult>;
  planner: AgentStepResult<PlanRecommendation>;
  monitor: AgentStepResult<MonitorResult>;
  route?: DispatchRoute;
  timing?: AgentTiming;
  trace?: PipelineTrace;
}
