"use client";

import { Mic, MicOff, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { getLang } from "@/lib/i18n";

/** Context needed for real-time voice conversation */
export interface VoiceChatContext {
  sessionId: string;
  userContext?: {
    name?: string;
    appLanguage?: string;
    timeOfDay?: string;
    dayOfWeek?: string;
    goals?: Record<string, number>;
    healthTwin?: string;
    recentMeals?: { summary: string; totalCalories: number }[];
  };
}

/** Result from a voice conversation turn */
export interface VoiceChatResult {
  transcript: string;
  responseText: string;
}

interface VoiceButtonProps {
  /** Called with user's speech transcript (text-only mode) */
  onTranscript: (text: string) => void;
  /** Called when voice conversation completes (transcript + AI response) */
  onVoiceChat?: (result: VoiceChatResult) => void;
  /** Returns context for voice-chat endpoint */
  getVoiceChatContext?: () => VoiceChatContext | null;
  size?: "default" | "large";
  disabled?: boolean;
}

const SILENCE_TIMEOUT_MS = 1800; // Faster cutoff for voice mode

export function VoiceButton({
  onTranscript,
  onVoiceChat,
  getVoiceChatContext,
  size = "default",
  disabled = false,
}: VoiceButtonProps): React.ReactElement {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const transcriptSentRef = useRef(false);

  // Keep refs fresh
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  const onVoiceChatRef = useRef(onVoiceChat);
  useEffect(() => { onVoiceChatRef.current = onVoiceChat; }, [onVoiceChat]);
  const getVoiceChatContextRef = useRef(getVoiceChatContext);
  useEffect(() => { getVoiceChatContextRef.current = getVoiceChatContext; }, [getVoiceChatContext]);

  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop(); } catch { /* */ }
      window.speechSynthesis?.cancel();
    };
  }, []);

  /** Speak text using browser TTS — fast, no API call */
  const speakResponse = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1;
    utterance.lang = getLang() === "pl" ? "pl-PL" : "en-US";
    setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  /** Fast voice conversation: STT → Nova 2 Lite → TTS */
  const handleVoiceConversation = useCallback(async (transcript: string) => {
    const ctx = getVoiceChatContextRef.current?.();
    if (!ctx || !onVoiceChatRef.current) {
      // No voice-chat context — fall back to text pipeline
      onTranscriptRef.current(transcript);
      return;
    }

    setIsProcessing(true);
    transcriptSentRef.current = true;

    try {
      console.log("[voice] Sending transcript to voice-chat:", transcript.slice(0, 60));
      const startTime = performance.now();

      const response = await fetch("/api/voice-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          sessionId: ctx.sessionId,
          userContext: ctx.userContext,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Voice chat failed: ${response.status}`);
      }

      // Process SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let responseText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf("\n\n");

        while (idx !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          let eventType = "message";
          const dataLines: string[] = [];
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          const data = dataLines.join("\n");
          if (!data) { idx = buffer.indexOf("\n\n"); continue; }

          try {
            const parsed = JSON.parse(data);
            if (eventType === "done" && parsed.text) {
              responseText = parsed.text;
            }
            if (eventType === "error") {
              throw new Error(parsed.message || "Voice chat error");
            }
          } catch (e) {
            if (e instanceof Error && e.message.includes("chat error")) throw e;
          }

          idx = buffer.indexOf("\n\n");
        }
      }

      const elapsed = Math.round(performance.now() - startTime);
      console.log("[voice] Response in", elapsed, "ms:", responseText.slice(0, 80));

      setIsProcessing(false);

      if (responseText) {
        // Speak the response immediately
        speakResponse(responseText);
        // Report to chat
        onVoiceChatRef.current({ transcript, responseText });
      } else {
        // No response — fall back to text pipeline
        onTranscriptRef.current(transcript);
      }
    } catch (err) {
      console.error("[voice] Error:", err);
      setIsProcessing(false);
      // Fallback: send through text pipeline
      transcriptSentRef.current = false;
      onTranscriptRef.current(transcript);
    }
  }, [speakResponse]);

  const startListening = useCallback(() => {
    transcriptSentRef.current = false;

    const Ctor = typeof window !== "undefined"
      ? window.SpeechRecognition ?? window.webkitSpeechRecognition
      : undefined;

    if (!Ctor) {
      toast.error("Speech recognition not available on this device.");
      return;
    }

    try {
      const recognition = new Ctor();
      recognition.lang = getLang() === "pl" ? "pl-PL" : "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event: { results?: { 0: { transcript?: string } }[] }) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        console.log("[voice] STT result:", transcript);
        if (transcript && !transcriptSentRef.current) {
          transcriptSentRef.current = true;
          setIsListening(false);
          void handleVoiceConversation(transcript);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        // If no result after timeout, show message
        if (!transcriptSentRef.current) {
          toast.error("Didn't catch that. Try speaking closer to the mic.");
        }
      };

      recognition.onerror = (event: { error?: string }) => {
        setIsListening(false);
        if (event.error === "not-allowed") {
          toast.error("Microphone access denied. Check permissions.");
        } else if (event.error !== "no-speech" && event.error !== "aborted") {
          toast.error("Speech recognition error. Try again.");
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch {
      toast.error("Could not start speech recognition.");
    }
  }, [handleVoiceConversation]);

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* */ }
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (disabled || isProcessing || isSpeaking) return;
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [disabled, isProcessing, isSpeaking, isListening, startListening, stopListening]);

  const isLarge = size === "large";

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled || isProcessing}
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-95",
        isLarge
          ? "h-20 w-20 text-white shadow-lg"
          : "h-[44px] w-[44px] shadow-sm",
        isListening
          ? "bg-red-500 text-white mic-recording hover:bg-red-600 focus:ring-red-400"
          : isSpeaking
            ? "bg-blue-500 text-white animate-pulse hover:bg-blue-600 focus:ring-blue-400"
            : isLarge
              ? "bg-emerald-500 text-white mic-glow hover:bg-emerald-600 focus:ring-emerald-400"
              : "bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-400",
        (disabled || isProcessing) && "opacity-50 cursor-not-allowed"
      )}
      title={
        isProcessing ? "Processing..." :
        isSpeaking ? "Nova is speaking..." :
        isListening ? "Listening... (tap to stop)" :
        "Talk to Nova"
      }
      aria-label={isListening ? "Stop recording" : isSpeaking ? "Nova is speaking" : "Start recording"}
    >
      {isProcessing ? (
        <div className={cn("animate-spin rounded-full border-2 border-white border-t-transparent", isLarge ? "h-8 w-8" : "h-5 w-5")} />
      ) : isListening ? (
        <MicOff className={isLarge ? "h-8 w-8" : "h-5 w-5"} />
      ) : isSpeaking ? (
        <Volume2 className={isLarge ? "h-8 w-8" : "h-5 w-5"} />
      ) : (
        <Mic className={isLarge ? "h-8 w-8" : "h-5 w-5"} />
      )}
    </button>
  );
}

// Browser SpeechRecognition types
interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results?: { 0: { transcript?: string } }[] }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}
