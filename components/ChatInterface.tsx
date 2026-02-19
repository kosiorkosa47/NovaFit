"use client";

import { Camera, Mic, SendHorizontal, UtensilsCrossed, ScanBarcode } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { LoadingSpinner } from "@/components/LoadingSpinner";
import { MessageBubble } from "@/components/MessageBubble";
import { NutritionScanCard } from "@/components/NutritionScanCard";
import { MealAnalysisCard } from "@/components/MealAnalysisCard";
import { VoiceButton } from "@/components/VoiceButton";
import { DEFAULT_GREETING } from "@/lib/constants";
import type { AgentApiResponse, AgentApiRequest, SseEvent, PlanRecommendation } from "@/lib/types";
import type { WearableSnapshot } from "@/lib/types";
import type { ScanResponse } from "@/app/api/scan/route";
import type { MealAnalysis } from "@/app/api/meal/route";
import { ensureSessionId, sanitizeMessageInput } from "@/lib/utils";

/** Safe unique ID — fallback for HTTP (no secure context) */
function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try { return crypto.randomUUID(); } catch { /* secure context required */ }
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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
  scanResult?: ScanResponse;
  mealResult?: MealAnalysis;
  imagePreview?: string;
}

const SESSION_STORAGE_KEY = "nova-health-session-id";
const INACTIVITY_REMINDER_MS = 30_000;

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

function WelcomeScreen({ onVoiceTranscript }: { onVoiceTranscript: (text: string) => void }): React.ReactElement {
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
        <VoiceButton onTranscript={onVoiceTranscript} size="large" />
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

      <p className="relative text-[11px] font-light tracking-wider text-muted-foreground/50">
        Tap the mic or type below
      </p>
    </div>
  );
}

interface ChatInterfaceProps {
  voiceOutput?: boolean;
}

export function ChatInterface({ voiceOutput = true }: ChatInterfaceProps): React.ReactElement {
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [showTurnPrompt, setShowTurnPrompt] = useState(false);

  const [cameraMode, setCameraMode] = useState<"label" | "meal" | null>(null);
  const [showCameraMenu, setShowCameraMenu] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize session
  useEffect(() => {
    const existingSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
    const safeSession = ensureSessionId(existingSession ?? undefined);
    window.localStorage.setItem(SESSION_STORAGE_KEY, safeSession);
    setSessionId(safeSession);
  }, []);

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

  const speakText = useCallback(
    (text: string) => {
      if (!voiceOutput || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.lang = "en-US";
      window.speechSynthesis.speak(utterance);
    },
    [voiceOutput]
  );

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

  const addAgentUpdate = useCallback((agent: string | undefined, content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "agent",
        content,
        timestamp: new Date().toISOString(),
        agentLabel: agent ? `${agent[0].toUpperCase()}${agent.slice(1)} Agent` : "Agent"
      }
    ]);
  }, []);

  const handleStreamResponse = useCallback(
    async (response: Response) => {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Streaming reader is unavailable.");

      const decoder = new TextDecoder();
      let buffer = "";

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
              const eventData = JSON.parse(parsed.data) as SseEvent;

              if (parsed.eventType === "status") setStatusLabel(eventData.message ?? null);
              if (parsed.eventType === "agent_update") addAgentUpdate(eventData.agent, eventData.message ?? "Agent update");
              if (parsed.eventType === "final") {
                const payload = eventData.payload as AgentApiResponse | undefined;
                if (payload?.reply) {
                  addAssistantMessage(payload.reply, "Nova", {
                    plan: payload.plan,
                    wearable: payload.wearableSnapshot,
                    analyzerSummary: payload.analyzerSummary
                  });
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
    [addAgentUpdate, addAssistantMessage]
  );

  const sendMessage = useCallback(async (overrideMessage?: string) => {
    const messageToSend = overrideMessage ?? input;
    const sanitizedMessage = sanitizeMessageInput(messageToSend);
    if (!sanitizedMessage || !sessionId || isStreaming) return;

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
    const isScanRequest =
      sanitizedMessage.toLowerCase().startsWith("scan:") ||
      sanitizedMessage.toLowerCase().startsWith("ingredients:") ||
      (sanitizedMessage.length > 50 && /(?:ingredients|sodium|sugar|calories|nutrition|e\d{3})/i.test(sanitizedMessage));

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
      }
      return;
    }

    addUserMessage(sanitizedMessage);
    setInput("");
    setStatusLabel("Nova is analyzing your request...");
    setIsStreaming(true);

    // Blur textarea on mobile to hide keyboard during processing
    textareaRef.current?.blur();

    const payload: AgentApiRequest = {
      sessionId,
      message: sanitizedMessage,
      mode: "stream"
    };

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(payload)
      });

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
    }
  }, [addAssistantMessage, addUserMessage, handleStreamResponse, hasStarted, input, isStreaming, sessionId]);

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
    }
  }, [addAssistantMessage, hasStarted, speakText, startInactivityTimer]);

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
      }
    } catch {
      toast.error("Failed to analyze the meal.");
      addAssistantMessage("Something went wrong. Try again with a different photo.", "Nova");
    } finally {
      setStatusLabel(null);
      setIsStreaming(false);
    }
  }, [addAssistantMessage, hasStarted, speakText, startInactivityTimer]);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        if (cameraMode === "meal") {
          void handleMealUpload(file);
        } else {
          void handleScanUpload(file);
        }
      }
      e.target.value = "";
      setCameraMode(null);
    },
    [handleScanUpload, handleMealUpload, cameraMode]
  );

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput(text);
    void sendMessage(text);
  }, [sendMessage]);

  const canSend = useMemo(() => Boolean(input.trim()) && !isStreaming, [input, isStreaming]);

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
        <WelcomeScreen onVoiceTranscript={handleVoiceTranscript} />

        {/* Input bar pinned at bottom */}
        <div className="shrink-0 border-t-[1.5px] border-white/50 bg-gradient-to-b from-white/65 to-white/45 px-3 pb-2 pt-2 shadow-[inset_0_2px_0_rgba(255,255,255,0.7),0_-8px_32px_-4px_rgba(16,185,129,0.06)] backdrop-blur-[50px] backdrop-saturate-[250%] backdrop-brightness-[1.15] dark:border-emerald-800/20 dark:from-[rgba(16,185,129,0.10)] dark:to-[rgba(2,44,34,0.50)] dark:shadow-[inset_0_2px_0_rgba(255,255,255,0.08),0_-8px_32px_-4px_rgba(0,0,0,0.3)]">
          <div className="flex items-end gap-2">
            <textarea
              suppressHydrationWarning
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Tell me how you're feeling..."
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
        <div className="mx-auto flex max-w-2xl items-end gap-1.5">
          <VoiceButton onTranscript={handleVoiceTranscript} disabled={isStreaming} />

          <div className="relative">
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
                  onClick={() => { setCameraMode("meal"); setShowCameraMenu(false); fileInputRef.current?.click(); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/40"
                >
                  <UtensilsCrossed className="h-4 w-4 text-emerald-600" />
                  <span>Analyze meal</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setCameraMode("label"); setShowCameraMenu(false); fileInputRef.current?.click(); }}
                  className="flex w-full items-center gap-2.5 border-t border-white/20 px-3 py-2.5 text-left text-sm hover:bg-emerald-50 dark:border-emerald-800/20 dark:hover:bg-emerald-900/40"
                >
                  <ScanBarcode className="h-4 w-4 text-amber-600" />
                  <span>Scan label</span>
                </button>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileInputChange}
            className="hidden"
          />

          <textarea
            suppressHydrationWarning
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); resetInactivityTimer(); }}
            onKeyDown={handleInputKeyDown}
            placeholder="Tell me how you're feeling..."
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
