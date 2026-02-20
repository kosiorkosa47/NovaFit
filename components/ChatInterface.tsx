"use client";

import { Camera, Mic, SendHorizontal, UtensilsCrossed, ScanBarcode, ImageIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { LoadingSpinner } from "@/components/LoadingSpinner";
import { MessageBubble } from "@/components/MessageBubble";
import { NutritionScanCard } from "@/components/NutritionScanCard";
import { MealAnalysisCard } from "@/components/MealAnalysisCard";
import { VoiceButton } from "@/components/VoiceButton";
import type { VoiceChatResult, VoiceChatContext } from "@/components/VoiceButton";
import { DEFAULT_GREETING } from "@/lib/constants";
import type { AgentApiResponse, AgentApiRequest, SseEvent, PlanRecommendation, UserContext } from "@/lib/types";
import type { WearableSnapshot } from "@/lib/types";
import type { ScanResponse } from "@/app/api/scan/route";
import type { MealAnalysis } from "@/app/api/meal/route";
import { ensureSessionId, sanitizeMessageInput } from "@/lib/utils";
import { saveHistoryEntry } from "@/components/HistoryPage";
import { t, getLang, type Lang } from "@/lib/i18n";
import { getHealthData } from "@/lib/sensors/health-bridge";
import { loadHealthTwin, saveHealthTwin, applyProfileUpdates, addSessionSummary, formatHealthTwinForPrompt } from "@/lib/health-twin/storage";
import type { ProfileUpdates } from "@/lib/health-twin/types";

/** Safe unique ID — fallback for HTTP (no secure context) */
function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try { return crypto.randomUUID(); } catch { /* secure context required */ }
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Check if running inside Capacitor native app */
function isNative(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).Capacitor;
}

/** Use Capacitor Camera plugin for native photo capture (camera + gallery picker) */
async function takeNativePhoto(): Promise<File | null> {
  try {
    console.log("[camera] takeNativePhoto: importing Capacitor Camera...");
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      quality: 75,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt,
      width: 800,
      height: 800,
      correctOrientation: true,
      promptLabelHeader: "Photo",
      promptLabelPhoto: "Choose from Gallery",
      promptLabelPicture: "Take Photo",
      promptLabelCancel: "Cancel",
    });
    if (!photo.dataUrl) {
      console.log("[camera] No dataUrl returned from Camera.getPhoto");
      return null;
    }
    console.log("[camera] Photo captured, format:", photo.format, "dataUrl length:", photo.dataUrl.length);
    const resp = await fetch(photo.dataUrl);
    const blob = await resp.blob();
    const mime = photo.format === "png" ? "image/png" : "image/jpeg";
    const file = new File([blob], `photo.${photo.format}`, { type: mime });
    console.log("[camera] File created:", file.name, file.type, (file.size / 1024).toFixed(0), "KB");
    return file;
  } catch (err) {
    console.warn("[camera] takeNativePhoto failed:", err);
    return null;
  }
}

interface UiMessage {
  id: string;
  role: "user" | "assistant" | "agent";
  content: string;
  timestamp: string;
  agentLabel?: string;
  plan?: PlanRecommendation;
  wearable?: WearableSnapshot;
  analyzerSummary?: string;
  agentPayload?: unknown;
  scanResult?: ScanResponse;
  mealResult?: MealAnalysis;
  imagePreview?: string;
  route?: string;
  timing?: Record<string, number>;
}

const SESSION_STORAGE_KEY = "nova-health-session-id";
const MESSAGES_STORAGE_PREFIX = "nova-health-messages-";
const INACTIVITY_REMINDER_MS = 30_000;

/** Save messages to localStorage for a session (without blob URLs which can't be serialized) */
function persistMessages(sessionId: string, messages: UiMessage[]) {
  if (!sessionId) return;
  try {
    const serializable = messages
      .filter((m) => m.role !== "agent") // Don't persist pipeline steps — keep history clean
      .map((m) => ({
        ...m,
        imagePreview: undefined, // blob URLs don't survive reload
      }));
    const key = MESSAGES_STORAGE_PREFIX + sessionId;
    localStorage.setItem(key, JSON.stringify(serializable));
    console.log("[persist]", key, "→", serializable.length, "msgs");
  } catch (e) {
    console.warn("[persist] FAILED:", e);
  }
}

/** Load saved messages for a session */
function loadMessages(sessionId: string): UiMessage[] {
  try {
    const key = MESSAGES_STORAGE_PREFIX + sessionId;
    const raw = localStorage.getItem(key);
    const result = raw ? (JSON.parse(raw) as UiMessage[]) : [];
    console.log("[loadMessages]", key, "→", result.length, "msgs", raw ? "(found)" : "(empty)");
    return result;
  } catch (e) {
    console.warn("[loadMessages] FAILED:", e);
    return [];
  }
}

function parseSseChunk(chunk: string): { eventType: string; data: string } | null {
  const lines = chunk.replace(/\r\n/g, "\n").split("\n");
  let eventType = "message";
  const data: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("event:")) {
      eventType = line.replace("event:", "").trim();
    } else if (line.startsWith("data:")) {
      data.push(line.replace("data:", "").trim());
    }
  }

  if (!data.length) return null;
  return { eventType, data: data.join("\n") };
}

function TypingIndicator(): React.ReactElement {
  return (
    <div className="flex items-center gap-2 px-1 py-1.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/60">
        <LoadingSpinner className="h-3.5 w-3.5" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl border border-emerald-100 bg-white/90 px-3 py-2 dark:border-emerald-800/45 dark:bg-emerald-950/55">
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Nova is thinking</span>
        <span className="ml-1 flex gap-0.5">
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
      </div>
    </div>
  );
}

function StatusStep({ message }: { message: string }): React.ReactElement {
  return (
    <div className="animate-fade-in-up flex items-center gap-2 px-1 py-1 text-xs text-emerald-600 dark:text-emerald-400">
      <LoadingSpinner className="h-3 w-3" />
      <span>{message}</span>
    </div>
  );
}

function WelcomeScreen({ onVoiceTranscript, onVoiceChat, getVoiceChatContext }: {
  onVoiceTranscript: (text: string) => void;
  onVoiceChat?: (result: VoiceChatResult) => void;
  getVoiceChatContext?: () => VoiceChatContext | null;
}): React.ReactElement {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-7 px-6">
      {/* Decorative background blobs */}
      <div className="zen-blob absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2" />
      <div className="zen-blob-2 absolute right-0 top-2/3 translate-x-1/4" />

      {/* Logo / brand area */}
      <div className="glass-panel animate-float relative flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/8 shadow-zen dark:bg-emerald-400/8">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 dark:text-emerald-400">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </div>

      <div className="relative text-center">
        <h2 className="text-2xl font-light tracking-wide text-foreground/90">
          How are you feeling today?
        </h2>
        <p className="mt-3 max-w-xs text-sm font-normal leading-relaxed text-muted-foreground/80">
          Your AI health coach powered by Amazon Nova. Share how you feel and receive personalized wellness plans.
        </p>
      </div>

      <div className="relative">
        <VoiceButton onTranscript={onVoiceTranscript} onVoiceChat={onVoiceChat} getVoiceChatContext={getVoiceChatContext} size="large" />
      </div>

      <div className="relative flex flex-wrap items-center justify-center gap-2">
        {["Nutrition", "Exercise", "Sleep", "Stress", "Recovery"].map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-white/30 bg-white/40 px-3 py-1 text-[10px] font-medium tracking-wide text-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] backdrop-blur-sm dark:border-emerald-500/15 dark:bg-emerald-400/8 dark:text-emerald-300 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          >
            {tag}
          </span>
        ))}
      </div>

      <p className="relative text-xs font-medium tracking-wide text-muted-foreground/70">
        Tap the mic or type below
      </p>
    </div>
  );
}

interface ChatInterfaceProps {
  voiceOutput?: boolean;
  /** When set/changed, load this session's messages */
  loadSessionId?: string;
}

export function ChatInterface({ voiceOutput = true, loadSessionId }: ChatInterfaceProps): React.ReactElement {
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [showTurnPrompt, setShowTurnPrompt] = useState(false);

  const [showCameraMenu, setShowCameraMenu] = useState(false);
  const cameraModeRef = useRef<"label" | "meal">("meal");
  const [lang, setLangState] = useState<Lang>("en");
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraMenuRef = useRef<HTMLDivElement | null>(null);
  const lastInputWasVoiceRef = useRef(false);
  const ttsAudioRef = useRef<AudioContext | null>(null);

  // Initialize session + lang
  useEffect(() => {
    const existingSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
    const safeSession = ensureSessionId(existingSession ?? undefined);
    window.localStorage.setItem(SESSION_STORAGE_KEY, safeSession);
    setSessionId(safeSession);

    // Load saved messages for this session
    const saved = loadMessages(safeSession);
    if (saved.length > 0) {
      setMessages(saved);
      setHasStarted(true);
    }

    setLangState(getLang());
    const langHandler = (e: Event) => setLangState((e as CustomEvent).detail as Lang);
    window.addEventListener("novafit-lang-change", langHandler);
    return () => window.removeEventListener("novafit-lang-change", langHandler);
  }, []);

  // Load a different session when History sends us a sessionId via prop
  useEffect(() => {
    if (!loadSessionId) return;
    // Strip timestamp suffix appended by AppShell (format: "sessionId:timestamp")
    const lastColon = loadSessionId.lastIndexOf(":");
    const sid = lastColon > 0 ? loadSessionId.substring(0, lastColon) : loadSessionId;
    console.log("[ChatInterface] loadSessionId changed:", loadSessionId, "→ sid:", sid);
    setSessionId(sid);
    window.localStorage.setItem(SESSION_STORAGE_KEY, sid);
    const saved = loadMessages(sid);
    console.log("[ChatInterface] Loaded messages for", sid, "→", saved.length, "messages");
    if (saved.length > 0) {
      setMessages(saved);
      setHasStarted(true);
    } else {
      setMessages([]);
      setHasStarted(false);
    }
  }, [loadSessionId]);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      persistMessages(sessionId, messages);
    }
  }, [sessionId, messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // Use requestAnimationFrame for smooth scroll after render
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, statusLabel, showTurnPrompt]);

  // Inactivity reminder
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    setShowTurnPrompt(false);
  }, []);

  const startInactivityTimer = useCallback(() => {
    resetInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      setShowTurnPrompt(true);
    }, INACTIVITY_REMINDER_MS);
  }, [resetInactivityTimer]);

  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, []);

  /** Play audio from base64 PCM data (Nova Sonic TTS) */
  const playTtsAudio = useCallback((audioBase64: string, sampleRate: number) => {
    try {
      const audioBytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
      const samples = new Float32Array(audioBytes.length / 2);
      const view = new DataView(audioBytes.buffer, audioBytes.byteOffset, audioBytes.byteLength);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = view.getInt16(i * 2, true) / 32768;
      }
      const ctx = new AudioContext({ sampleRate });
      ttsAudioRef.current = ctx;
      const buffer = ctx.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
    } catch (err) {
      console.warn("[tts] Audio playback failed:", err);
    }
  }, []);

  const speakText = useCallback(
    (text: string) => {
      if (!voiceOutput || typeof window === "undefined") return;

      // If last input was voice, use Nova Sonic TTS for premium audio
      if (lastInputWasVoiceRef.current) {
        lastInputWasVoiceRef.current = false;
        // Fire-and-forget TTS request — fall back to browser speech on failure
        void (async () => {
          try {
            const res = await fetch("/api/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: text.slice(0, 500), lang: getLang() }),
            });
            const data = await res.json() as { success: boolean; audioBase64?: string; sampleRate?: number };
            if (data.success && data.audioBase64) {
              playTtsAudio(data.audioBase64, data.sampleRate ?? 24000);
              return;
            }
          } catch {
            // Fall through to browser TTS
          }
          // Fallback: browser SpeechSynthesis
          if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.95;
            utterance.lang = getLang() === "pl" ? "pl-PL" : "en-US";
            window.speechSynthesis.speak(utterance);
          }
        })();
        return;
      }

      // Text input — use browser speech synthesis
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.lang = getLang() === "pl" ? "pl-PL" : "en-US";
      window.speechSynthesis.speak(utterance);
    },
    [voiceOutput, playTtsAudio]
  );

  /** Build context for real-time voice conversation endpoint */
  const getVoiceChatContext = useCallback((): VoiceChatContext | null => {
    if (!sessionId) return null;
    try {
      const profile = JSON.parse(localStorage.getItem("nova-health-profile") || "{}") as Record<string, unknown>;
      const goals = JSON.parse(localStorage.getItem("nova-health-goals") || "{}") as Record<string, number>;
      let healthTwinStr: string | undefined;
      try {
        const twin = loadHealthTwin();
        const formatted = formatHealthTwinForPrompt(twin);
        if (formatted) healthTwinStr = formatted;
      } catch { /* ignore */ }

      let recentMeals: { summary: string; totalCalories: number }[] | undefined;
      try {
        const raw = localStorage.getItem("nova-health-recent-meals");
        if (raw) recentMeals = JSON.parse(raw) as typeof recentMeals;
      } catch { /* ignore */ }

      const now = new Date();
      const hour = now.getHours();
      const timeOfDay = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

      // Include recent conversation messages for voice context continuity
      const recentMessages = messages
        .filter(m => m.role === "user" || m.role === "assistant")
        .slice(-8)
        .map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content.slice(0, 300),
        }));

      return {
        sessionId,
        recentMessages: recentMessages.length > 0 ? recentMessages : undefined,
        userContext: {
          name: typeof profile.name === "string" ? profile.name : undefined,
          appLanguage: getLang(),
          timeOfDay,
          dayOfWeek: days[now.getDay()],
          goals: Object.keys(goals).length > 0 ? goals : undefined,
          healthTwin: healthTwinStr,
          recentMeals,
        },
      };
    } catch {
      return { sessionId };
    }
  }, [sessionId, messages]);

  const addUserMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", content, timestamp: new Date().toISOString() }
    ]);
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  const addAssistantMessage = useCallback(
    (content: string, agentLabel = "Nova", extras?: { plan?: PlanRecommendation; wearable?: WearableSnapshot; analyzerSummary?: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content,
          timestamp: new Date().toISOString(),
          agentLabel,
          plan: extras?.plan,
          wearable: extras?.wearable,
          analyzerSummary: extras?.analyzerSummary
        }
      ]);
      speakText(content);
      startInactivityTimer();
    },
    [speakText, startInactivityTimer]
  );

  const addAgentUpdate = useCallback((agent: string | undefined, content: string, payload?: unknown) => {
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "agent",
        content,
        timestamp: new Date().toISOString(),
        agentLabel: agent ? `${agent[0].toUpperCase()}${agent.slice(1)} Agent` : "Agent",
        agentPayload: payload
      }
    ]);
  }, []);

  // Persist current messages + history entry (called from ALL flows: agent, scan, meal)
  const persistCurrentSession = useCallback(() => {
    setMessages((current) => {
      const userMsgs = current.filter((m) => m.role === "user");
      if (userMsgs.length > 0) {
        const firstUserMsg = userMsgs[0].content;
        const topics: string[] = [];
        if (current.some((m) => m.plan)) topics.push("plan");
        if (current.some((m) => m.scanResult)) topics.push("scan");
        if (current.some((m) => m.mealResult)) topics.push("meal");
        if (current.some((m) => m.content.toLowerCase().includes("exercise") || m.content.toLowerCase().includes("ćwicz"))) topics.push("exercise");
        if (current.some((m) => m.content.toLowerCase().includes("diet") || m.content.toLowerCase().includes("dieta"))) topics.push("diet");

        saveHistoryEntry({
          sessionId,
          timestamp: new Date().toISOString(),
          firstMessage: firstUserMsg.slice(0, 100),
          messageCount: current.length,
          topics: topics.slice(0, 4),
        });
        persistMessages(sessionId, current);
      }
      return current;
    });
  }, [sessionId]);

  /** Handle real-time voice conversation result — add messages to chat */
  const handleVoiceChat = useCallback((result: VoiceChatResult) => {
    console.log("[chat] handleVoiceChat:", result.transcript?.slice(0, 60), "→", result.responseText?.slice(0, 60));

    if (!hasStarted) {
      setMessages([{
        id: uid(),
        role: "assistant",
        content: DEFAULT_GREETING,
        timestamp: new Date().toISOString(),
        agentLabel: "Nova"
      }]);
      setHasStarted(true);
    }

    // Add user message (voice transcript)
    if (result.transcript) {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "user", content: result.transcript, timestamp: new Date().toISOString() }
      ]);
    }

    // Add assistant message (Nova Sonic voice response)
    if (result.responseText) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: result.responseText,
          timestamp: new Date().toISOString(),
          agentLabel: "Nova Voice",
        }
      ]);
    }

    resetInactivityTimer();
    startInactivityTimer();
    persistCurrentSession();
  }, [hasStarted, resetInactivityTimer, startInactivityTimer, persistCurrentSession]);

  const handleStreamResponse = useCallback(
    async (response: Response) => {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Streaming reader is unavailable.");

      const decoder = new TextDecoder();
      let buffer = "";
      let streamingMsgId: string | null = null;
      let streamedText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf("\n\n");

        while (idx !== -1) {
          const rawChunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const parsed = parseSseChunk(rawChunk);

          if (parsed) {
            try {
              const eventData = JSON.parse(parsed.data) as SseEvent & { payload?: AgentApiResponse & { route?: string; timing?: Record<string, number>; reasoning?: string; confidence?: number } };

              if (parsed.eventType === "status") setStatusLabel(eventData.message ?? null);

              if (parsed.eventType === "dispatcher") {
                const dp = eventData.payload;
                const routeLabel = dp?.route ?? "full";
                setStatusLabel(`Route: ${routeLabel}`);
              }

              if (parsed.eventType === "agent_update") {
                const name = eventData.agent;
                const label = name ? name.charAt(0).toUpperCase() + name.slice(1) : "Agent";
                setStatusLabel(`${label}: ${(eventData.message ?? "Processing...").slice(0, 100)}`);
              }

              if (parsed.eventType === "text_chunk") {
                const chunk = eventData.message ?? "";
                if (chunk) {
                  streamedText += chunk;
                  if (!streamingMsgId) {
                    // Create temporary streaming message
                    streamingMsgId = uid();
                    setStatusLabel(null);
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: streamingMsgId!,
                        role: "assistant",
                        content: streamedText,
                        timestamp: new Date().toISOString(),
                        agentLabel: "Nova",
                      }
                    ]);
                  } else {
                    // Update streaming message with new text
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === streamingMsgId
                          ? { ...m, content: streamedText }
                          : m
                      )
                    );
                  }
                }
              }

              if (parsed.eventType === "final") {
                const payload = eventData.payload as AgentApiResponse | undefined;
                if (payload?.reply) {
                  if (streamingMsgId) {
                    // Replace streaming message with final version (includes plan, etc.)
                    // Filter timing to only include defined values
                    const timingMap: Record<string, number> | undefined = payload.timing
                      ? Object.fromEntries(
                          Object.entries(payload.timing).filter((e): e is [string, number] => typeof e[1] === "number")
                        )
                      : undefined;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === streamingMsgId
                          ? {
                              ...m,
                              content: payload.reply,
                              plan: payload.plan,
                              wearable: payload.wearableSnapshot,
                              analyzerSummary: payload.analyzerSummary,
                              route: payload.route,
                              timing: timingMap,
                            }
                          : m
                      )
                    );
                    speakText(payload.reply);
                    startInactivityTimer();
                  } else {
                    addAssistantMessage(payload.reply, "Nova", {
                      plan: payload.plan,
                      wearable: payload.wearableSnapshot,
                      analyzerSummary: payload.analyzerSummary
                    });
                  }
                }
                // Health Twin: save profile updates from agent
                if (payload?.profileUpdates) {
                  try {
                    const twin = loadHealthTwin();
                    const updated = applyProfileUpdates(twin, payload.profileUpdates);
                    const topics = payload.profileUpdates.sessionNote
                      ? [payload.profileUpdates.sessionNote]
                      : [payload.analyzerSummary?.slice(0, 80) ?? "conversation"];
                    addSessionSummary(updated, 0, topics, payload.profileUpdates.sessionNote ?? payload.analyzerSummary ?? "");
                    saveHealthTwin(updated);
                    console.log("[health-twin] Profile updated:", payload.profileUpdates);
                  } catch (e) {
                    console.warn("[health-twin] Failed to save profile:", e);
                  }
                }
              }
              if (parsed.eventType === "error") throw new Error(eventData.message ?? "Unknown stream error");
            } catch (error) {
              throw error instanceof Error ? error : new Error("Failed to parse stream event.");
            }
          }

          idx = buffer.indexOf("\n\n");
        }
      }
    },
    [addAgentUpdate, addAssistantMessage, speakText, startInactivityTimer]
  );

  const sendMessage = useCallback(async (overrideMessage?: string) => {
    const messageToSend = overrideMessage ?? input;
    console.log("[chat] sendMessage called, override:", overrideMessage, "input:", input, "sessionId:", sessionId, "isStreaming:", isStreaming);
    // If there's a pending image but no text, use a default prompt
    const fallbackMessage = pendingImage && !messageToSend.trim() ? "What can you tell me about this photo?" : messageToSend;
    const sanitizedMessage = sanitizeMessageInput(fallbackMessage);
    if (!sanitizedMessage || !sessionId || isStreaming) {
      console.log("[chat] sendMessage BLOCKED — sanitized:", sanitizedMessage, "sessionId:", sessionId, "isStreaming:", isStreaming);
      return;
    }

    if (!hasStarted) {
      setMessages([{
        id: uid(),
        role: "assistant",
        content: DEFAULT_GREETING,
        timestamp: new Date().toISOString(),
        agentLabel: "Nova"
      }]);
      setHasStarted(true);
    }

    // Check if user wants to scan ingredients (text-based)
    // Only trigger scan for explicit prefixes or messages that look like pasted ingredient lists
    // (contain multiple scan-specific terms, not just one word like "nutrition" in "nutrition plan")
    const lowerMsg = sanitizedMessage.toLowerCase();
    const scanKeywords = ["sodium", "sugar", "e1", "e2", "e3", "e4", "e5", "e6", "e9", "preservative", "aspartame", "msg", "hydrogenated"];
    const scanKeywordCount = scanKeywords.filter(k => lowerMsg.includes(k)).length;
    const isScanRequest =
      lowerMsg.startsWith("scan:") ||
      lowerMsg.startsWith("ingredients:") ||
      (sanitizedMessage.length > 80 && scanKeywordCount >= 2);

    if (isScanRequest) {
      addUserMessage(sanitizedMessage);
      setInput("");
      setStatusLabel("Analyzing ingredients...");
      setIsStreaming(true);
      textareaRef.current?.blur();

      try {
        const ingredientsText = sanitizedMessage.replace(/^(?:scan|ingredients):\s*/i, "");
        const response = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ingredientsText }),
        });
        const result = (await response.json()) as ScanResponse;
        if (result.success) {
          setMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: "assistant",
              content: result.summary,
              timestamp: new Date().toISOString(),
              agentLabel: "Scanner",
              scanResult: result,
            }
          ]);
          speakText(result.summary);
          startInactivityTimer();
        } else {
          addAssistantMessage("Could not analyze those ingredients. Try again.", "Scanner");
        }
      } catch {
        addAssistantMessage("Failed to analyze ingredients.", "Scanner");
      } finally {
        setStatusLabel(null);
        setIsStreaming(false);
        persistCurrentSession();
      }
      return;
    }

    // Capture pending image before clearing state
    const imageFile = pendingImage;
    const imagePreviewUrl = pendingImagePreview;
    console.log("[chat] image state:", imageFile ? `${imageFile.name} (${imageFile.type}, ${(imageFile.size / 1024).toFixed(0)} KB)` : "none");

    // Show user message with optional image preview
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "user",
        content: sanitizedMessage,
        timestamp: new Date().toISOString(),
        imagePreview: imagePreviewUrl ?? undefined,
      }
    ]);
    resetInactivityTimer();

    setInput("");
    setPendingImage(null);
    setPendingImagePreview(null);
    setStatusLabel(imageFile ? "Nova is analyzing your photo..." : "Nova is analyzing your request...");
    setIsStreaming(true);

    // Blur textarea on mobile to hide keyboard during processing
    textareaRef.current?.blur();

    try {
      // Collect user context (profile + goals + real sensor data)
      let userContext: UserContext | undefined;
      try {
        const now = new Date();
        const hour = now.getHours();
        const timeOfDay = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

        const profile = JSON.parse(localStorage.getItem("nova-health-profile") || "{}") as Record<string, unknown>;
        const goals = JSON.parse(localStorage.getItem("nova-health-goals") || "{}") as Record<string, unknown>;

        let healthData: UserContext["healthData"] | undefined;
        try {
          const hd = await getHealthData();
          healthData = { steps: hd.steps, heartRate: hd.heartRate, calories: hd.calories, sleep: hd.sleep, stress: hd.stress, source: hd.source };
        } catch { /* sensor unavailable */ }

        // Load recent meal analyses for agent context
        let recentMeals: UserContext["recentMeals"];
        try {
          const raw = localStorage.getItem("nova-health-recent-meals");
          if (raw) recentMeals = JSON.parse(raw) as UserContext["recentMeals"];
        } catch { /* ignore */ }

        // Load Health Twin profile for agent context
        let healthTwinContext: string | undefined;
        try {
          const twin = loadHealthTwin();
          const formatted = formatHealthTwinForPrompt(twin);
          if (formatted) healthTwinContext = formatted;
        } catch { /* ignore */ }

        userContext = {
          name: typeof profile.name === "string" ? profile.name : undefined,
          goals: Object.keys(goals).length > 0 ? goals as UserContext["goals"] : undefined,
          healthTwin: healthTwinContext,
          healthData,
          recentMeals,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          locale: getLang() === "pl" ? "pl-PL" : "en-US",
          appLanguage: getLang(),
          timeOfDay,
          dayOfWeek: days[now.getDay()],
        };
      } catch { /* ignore context errors */ }

      let response: Response;

      if (imageFile) {
        // Send as FormData (multipart) with image
        console.log("[chat] Sending image to /api/agent via FormData");
        const formData = new FormData();
        formData.append("sessionId", sessionId);
        formData.append("message", sanitizedMessage);
        formData.append("mode", "stream");
        formData.append("image", imageFile);
        if (userContext) formData.append("userContext", JSON.stringify(userContext));
        response = await fetch("/api/agent", {
          method: "POST",
          headers: { Accept: "text/event-stream" },
          body: formData,
        });
        console.log("[chat] Image response status:", response.status);
      } else {
        // Send as JSON (text only)
        const payload: AgentApiRequest = {
          sessionId,
          message: sanitizedMessage,
          mode: "stream",
          userContext,
        };
        response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) {
        const errorJson = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorJson?.error ?? "Unable to process your request right now.");
      }

      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream")) {
        await handleStreamResponse(response);
      } else {
        const json = (await response.json()) as AgentApiResponse;
        addAssistantMessage(json.reply, "Nova", {
          plan: json.plan,
          wearable: json.wearableSnapshot,
          analyzerSummary: json.analyzerSummary
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unexpected network error. Please try again.";
      toast.error(msg);
      addAssistantMessage("I could not finish that request. Please try again in a moment.", "System");
    } finally {
      setStatusLabel(null);
      setIsStreaming(false);
      persistCurrentSession();
    }
  }, [addAssistantMessage, handleStreamResponse, hasStarted, input, isStreaming, sessionId, pendingImage, pendingImagePreview, resetInactivityTimer, persistCurrentSession]);

  const handleScanUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file.");
      return;
    }

    if (!hasStarted) {
      setMessages([{
        id: uid(),
        role: "assistant",
        content: DEFAULT_GREETING,
        timestamp: new Date().toISOString(),
        agentLabel: "Nova"
      }]);
      setHasStarted(true);
    }

    // Show preview as user message
    const previewUrl = URL.createObjectURL(file);
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "user",
        content: "Scan this product label",
        timestamp: new Date().toISOString(),
        imagePreview: previewUrl,
      }
    ]);

    setStatusLabel("Scanning nutrition label...");
    setIsStreaming(true);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/scan", {
        method: "POST",
        body: formData,
      });

      const result = (await response.json()) as ScanResponse & { error?: string };

      if (!response.ok || !result.success) {
        // If OCR failed, prompt manual input
        addAssistantMessage(
          "I couldn't read the label from the photo. Please type or paste the ingredients list and I'll analyze it for harmful additives.",
          "Scanner"
        );
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: result.summary,
            timestamp: new Date().toISOString(),
            agentLabel: "Scanner",
            scanResult: result,
          }
        ]);
        speakText(result.summary);
        startInactivityTimer();
      }
    } catch {
      toast.error("Failed to scan the product.");
      addAssistantMessage(
        "Something went wrong during scanning. Try typing the ingredients list instead.",
        "Scanner"
      );
    } finally {
      setStatusLabel(null);
      setIsStreaming(false);
      persistCurrentSession();
    }
  }, [addAssistantMessage, hasStarted, speakText, startInactivityTimer, persistCurrentSession]);

  const handleMealUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file.");
      return;
    }

    if (!hasStarted) {
      setMessages([{
        id: uid(),
        role: "assistant",
        content: DEFAULT_GREETING,
        timestamp: new Date().toISOString(),
        agentLabel: "Nova"
      }]);
      setHasStarted(true);
    }

    const previewUrl = URL.createObjectURL(file);
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "user",
        content: "Analyze this meal",
        timestamp: new Date().toISOString(),
        imagePreview: previewUrl,
      }
    ]);

    setStatusLabel("Analyzing meal with Nova AI...");
    setIsStreaming(true);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/meal", {
        method: "POST",
        body: formData,
      });

      const result = (await response.json()) as MealAnalysis & { error?: string };

      if (!response.ok || !result.success) {
        addAssistantMessage(
          result.error ?? "Could not analyze the meal photo. Please try again with a clearer image.",
          "Nova"
        );
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: result.summary,
            timestamp: new Date().toISOString(),
            agentLabel: "Nutrition AI",
            mealResult: result,
          }
        ]);
        speakText(result.summary);
        startInactivityTimer();

        // Store meal analysis for agent pipeline context
        try {
          const existing = JSON.parse(localStorage.getItem("nova-health-recent-meals") || "[]") as unknown[];
          const entry = {
            summary: result.summary,
            totalCalories: result.totalCalories,
            totalProtein: result.totalProtein,
            totalCarbs: result.totalCarbs,
            totalFat: result.totalFat,
            analyzedAt: new Date().toISOString(),
          };
          // Keep last 5 meals
          const updated = [entry, ...existing].slice(0, 5);
          localStorage.setItem("nova-health-recent-meals", JSON.stringify(updated));
        } catch { /* ignore storage errors */ }
      }
    } catch {
      toast.error("Failed to analyze the meal.");
      addAssistantMessage("Something went wrong. Try again with a different photo.", "Nova");
    } finally {
      setStatusLabel(null);
      setIsStreaming(false);
      persistCurrentSession();
    }
  }, [addAssistantMessage, hasStarted, speakText, startInactivityTimer, persistCurrentSession]);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      console.log("[chat] handleFileInputChange:", file ? `${file.name} (${file.type}, ${(file.size / 1024).toFixed(0)} KB)` : "no file", "mode:", cameraModeRef.current);
      if (file) {
        if (cameraModeRef.current === "meal") {
          void handleMealUpload(file);
        } else {
          void handleScanUpload(file);
        }
      }
      e.target.value = "";
    },
    [handleScanUpload, handleMealUpload]
  );

  const handleImageAttach = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      console.log("[chat] handleImageAttach:", file ? `${file.name} (${file.type}, ${(file.size / 1024).toFixed(0)} KB)` : "no file");
      if (file && file.type.startsWith("image/")) {
        setPendingImage(file);
        setPendingImagePreview(URL.createObjectURL(file));
      }
      e.target.value = "";
    },
    []
  );

  const clearPendingImage = useCallback(() => {
    setPendingImage(null);
    setPendingImagePreview(null);
  }, []);

  // Close camera menu on outside click
  useEffect(() => {
    if (!showCameraMenu) return;
    const handler = (e: MouseEvent) => {
      if (cameraMenuRef.current && !cameraMenuRef.current.contains(e.target as Node)) {
        setShowCameraMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCameraMenu]);

  // Keep sendMessage ref fresh so voice callback always uses latest version
  const sendMessageRef = useRef(sendMessage);
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  const handleVoiceTranscript = useCallback((text: string) => {
    console.log("[chat] handleVoiceTranscript called:", text, "sessionId:", sessionId, "isStreaming:", isStreaming);
    lastInputWasVoiceRef.current = true; // Agent response will use Nova Sonic TTS
    setInput(text);
    void sendMessageRef.current(text);
  }, [sessionId, isStreaming]);

  const canSend = useMemo(() => (Boolean(input.trim()) || Boolean(pendingImage)) && !isStreaming, [input, isStreaming, pendingImage]);

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (canSend) void sendMessage();
      }
      resetInactivityTimer();
    },
    [canSend, sendMessage, resetInactivityTimer]
  );

  // ── Welcome screen (before first message) ──
  if (!hasStarted && messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <WelcomeScreen onVoiceTranscript={handleVoiceTranscript} onVoiceChat={handleVoiceChat} getVoiceChatContext={getVoiceChatContext} />

        {/* Input bar pinned at bottom */}
        <div className="shrink-0 border-t-[1.5px] border-white/50 bg-gradient-to-b from-white/65 to-white/45 px-3 pb-2 pt-2 shadow-[inset_0_2px_0_rgba(255,255,255,0.7),0_-8px_32px_-4px_rgba(16,185,129,0.06)] backdrop-blur-[50px] backdrop-saturate-[250%] backdrop-brightness-[1.15] dark:border-emerald-800/20 dark:from-[rgba(16,185,129,0.10)] dark:to-[rgba(2,44,34,0.50)] dark:shadow-[inset_0_2px_0_rgba(255,255,255,0.08),0_-8px_32px_-4px_rgba(0,0,0,0.3)]">
          <div className="flex items-end gap-2">
            <textarea
              suppressHydrationWarning
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={t("tell_feeling", lang)}
              disabled={isStreaming}
              rows={1}
              className="min-h-[44px] flex-1 resize-none rounded-2xl border-[1.5px] border-white/40 bg-white/35 px-3.5 py-2.5 text-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.5)] placeholder:text-muted-foreground/50 focus-zen disabled:opacity-50 dark:border-emerald-800/20 dark:bg-emerald-950/20 dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.04)]"
            />
            <button
              type="button"
              disabled={!canSend}
              onClick={() => void sendMessage()}
              className="send-btn flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_4px_16px_-2px_rgba(16,185,129,0.30),inset_0_2px_0_rgba(255,255,255,0.20)] transition-all hover:shadow-[0_6px_24px_-2px_rgba(16,185,129,0.40),inset_0_2px_0_rgba(255,255,255,0.25)] disabled:opacity-40"
            >
              <SendHorizontal className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Active chat (messenger layout) ──
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Messages: scrollable, fills available space */}
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
      >
        <div className="mx-auto max-w-2xl space-y-2.5">
          {messages.map((message) => (
            <div key={message.id}>
              {message.imagePreview && (
                <div className="mb-1 flex justify-end">
                  <img
                    src={message.imagePreview}
                    alt="Scanned product"
                    className="max-h-48 rounded-2xl border border-white/30 object-cover shadow-sm"
                  />
                </div>
              )}
              <MessageBubble
                role={message.role}
                content={message.content}
                timestamp={message.timestamp}
                agentLabel={message.agentLabel}
                plan={message.plan}
                wearable={message.wearable}
                analyzerSummary={message.analyzerSummary}
                agentPayload={message.agentPayload}
                route={message.route}
                timing={message.timing}
              />
              {message.scanResult && (
                <NutritionScanCard data={message.scanResult} />
              )}
              {message.mealResult && (
                <MealAnalysisCard data={message.mealResult} />
              )}
            </div>
          ))}

          {statusLabel && <StatusStep message={statusLabel} />}
          {isStreaming && !statusLabel && <TypingIndicator />}

          {showTurnPrompt && !isStreaming && (
            <div className="animate-fade-in-up flex items-center justify-center py-2">
              <div className="flex items-center gap-2 rounded-full border border-white/30 bg-white/40 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] backdrop-blur-sm dark:border-emerald-800/30 dark:bg-emerald-900/30 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <Mic className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  Your turn - tap mic or type
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input bar: pinned at bottom */}
      <div className="shrink-0 border-t-[1.5px] border-white/50 bg-gradient-to-b from-white/65 to-white/45 px-3 pb-2 pt-2 shadow-[inset_0_2px_0_rgba(255,255,255,0.7),0_-8px_32px_-4px_rgba(16,185,129,0.06)] backdrop-blur-[50px] backdrop-saturate-[250%] backdrop-brightness-[1.15] dark:border-emerald-800/20 dark:from-[rgba(16,185,129,0.10)] dark:to-[rgba(2,44,34,0.50)] dark:shadow-[inset_0_2px_0_rgba(255,255,255,0.08),0_-8px_32px_-4px_rgba(0,0,0,0.3)]">
        {/* Pending image preview */}
        {pendingImagePreview && (
          <div className="mx-auto mb-2 flex max-w-2xl items-center gap-2">
            <div className="relative">
              <img
                src={pendingImagePreview}
                alt="Attached"
                className="h-16 w-16 rounded-xl border border-white/30 object-cover shadow-sm"
              />
              <button
                type="button"
                onClick={clearPendingImage}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-sm"
              >
                ✕
              </button>
            </div>
            <span className="text-xs text-muted-foreground">Type a question about this photo</span>
          </div>
        )}
        <div className="mx-auto flex max-w-2xl items-end gap-1.5">
          <VoiceButton onTranscript={handleVoiceTranscript} onVoiceChat={handleVoiceChat} getVoiceChatContext={getVoiceChatContext} disabled={isStreaming} />

          <div className="relative" ref={cameraMenuRef}>
            <button
              type="button"
              disabled={isStreaming}
              onClick={() => setShowCameraMenu((v) => !v)}
              className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-2xl border-[1.5px] border-white/40 bg-white/35 text-muted-foreground transition-all hover:text-foreground active:scale-95 disabled:opacity-40 dark:border-emerald-800/20 dark:bg-emerald-950/20"
              title="Camera options"
            >
              <Camera className="h-4.5 w-4.5" />
            </button>
            {showCameraMenu && (
              <div className="absolute bottom-full left-0 mb-2 w-48 overflow-hidden rounded-xl border border-white/40 bg-white/90 shadow-lg backdrop-blur-xl dark:border-emerald-800/30 dark:bg-emerald-950/90">
                <button
                  type="button"
                  onClick={() => {
                    setShowCameraMenu(false);
                    cameraModeRef.current = "meal";
                    cameraInputRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/40"
                >
                  <UtensilsCrossed className="h-4 w-4 text-emerald-600" />
                  <span>{t("analyze_meal", lang)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCameraMenu(false);
                    cameraModeRef.current = "label";
                    cameraInputRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2.5 border-t border-white/20 px-3 py-2.5 text-left text-sm hover:bg-emerald-50 dark:border-emerald-800/20 dark:hover:bg-emerald-900/40"
                >
                  <ScanBarcode className="h-4 w-4 text-amber-600" />
                  <span>{t("scan_label", lang)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCameraMenu(false);
                    imageInputRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2.5 border-t border-white/20 px-3 py-2.5 text-left text-sm hover:bg-emerald-50 dark:border-emerald-800/20 dark:hover:bg-emerald-900/40"
                >
                  <ImageIcon className="h-4 w-4 text-blue-600" />
                  <span>Ask about photo</span>
                </button>
              </div>
            )}
          </div>
          {/* Camera input — opens rear camera directly (meal/scan) */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileInputChange}
            className="sr-only"
          />
          {/* Gallery input — opens file chooser (meal/scan fallback) */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileInputChange}
            className="sr-only"
          />
          {/* Image attach input — for "Ask about photo" */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageAttach}
            className="sr-only"
          />

          <textarea
            suppressHydrationWarning
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); resetInactivityTimer(); }}
            onKeyDown={handleInputKeyDown}
            placeholder={t("tell_feeling", lang)}
            disabled={isStreaming}
            rows={1}
            className="min-h-[44px] flex-1 resize-none rounded-2xl border-[1.5px] border-white/40 bg-white/35 px-3.5 py-2.5 text-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.5)] placeholder:text-muted-foreground/50 focus-zen disabled:opacity-50 dark:border-emerald-800/20 dark:bg-emerald-950/20 dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.04)]"
          />

          <button
            type="button"
            disabled={!canSend}
            onClick={() => void sendMessage()}
            className="send-btn flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_4px_16px_-2px_rgba(16,185,129,0.30),inset_0_2px_0_rgba(255,255,255,0.20)] transition-all hover:shadow-[0_6px_24px_-2px_rgba(16,185,129,0.40),inset_0_2px_0_rgba(255,255,255,0.25)] disabled:opacity-40"
          >
            {isStreaming ? <LoadingSpinner className="h-4 w-4" /> : <SendHorizontal className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
