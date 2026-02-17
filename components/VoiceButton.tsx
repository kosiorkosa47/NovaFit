"use client";

import { Mic, MicOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  size?: "default" | "large";
  disabled?: boolean;
}

interface BrowserSpeechRecognitionResult {
  0: { transcript?: string };
}

interface BrowserSpeechRecognitionEvent {
  results?: BrowserSpeechRecognitionResult[];
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
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

export function VoiceButton({ onTranscript, size = "default", disabled = false }: VoiceButtonProps): React.ReactElement {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // SpeechRecognition: Chrome/Edge/Android Chrome use SpeechRecognition,
    // Safari (iOS 14.5+) uses webkitSpeechRecognition.
    // Firefox: not supported.
    // Detect browser SpeechRecognition API after hydration
    setIsSupported(Boolean( // eslint-disable-line react-hooks/set-state-in-effect
      typeof window !== "undefined" &&
      (window.SpeechRecognition ?? window.webkitSpeechRecognition)
    ));
  }, []);

  const createRecognition = useCallback(() => {
    const Ctor = typeof window !== "undefined"
      ? window.SpeechRecognition ?? window.webkitSpeechRecognition
      : undefined;

    if (!Ctor) return null;

    const recognition = new Ctor();
    recognition.lang = "en-US";
    // iOS Safari: continuous=true can cause issues, keep false
    recognition.continuous = false;
    // interimResults=false for cleaner single-shot transcripts
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) onTranscript(transcript);
    };

    recognition.onend = () => setIsListening(false);

    recognition.onerror = (event) => {
      // "not-allowed" = user denied mic, "no-speech" = silence timeout
      // Both are normal - just stop listening state
      const ignorable = ["not-allowed", "no-speech", "aborted"];
      if (!ignorable.includes(event.error ?? "")) {
        console.warn("SpeechRecognition error:", event.error);
      }
      setIsListening(false);
    };

    return recognition;
  }, [onTranscript]);

  const toggleListening = useCallback((): void => {
    if (disabled) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    // Create a fresh instance each time - iOS Safari requires this
    const recognition = createRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
    } catch {
      // "already started" race condition - ignore
      setIsListening(false);
    }
  }, [disabled, isListening, createRecognition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const isLarge = size === "large";

  if (!isSupported) {
    return (
      <button
        type="button"
        disabled
        className={cn(
          "flex items-center justify-center rounded-full bg-muted text-muted-foreground opacity-50 cursor-not-allowed",
          isLarge ? "h-20 w-20" : "h-[44px] w-[44px]"
        )}
        title="Voice not supported in this browser"
      >
        <MicOff className={isLarge ? "h-8 w-8" : "h-5 w-5"} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled}
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-95",
        isLarge
          ? "h-20 w-20 text-white shadow-lg"
          : "h-[44px] w-[44px] shadow-sm",
        isListening
          ? "bg-red-500 text-white mic-recording hover:bg-red-600 focus:ring-red-400"
          : isLarge
            ? "bg-emerald-500 text-white mic-glow hover:bg-emerald-600 focus:ring-emerald-400"
            : "bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-400",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      title={isListening ? "Stop listening" : "Talk to Nova"}
      aria-label={isListening ? "Stop voice input" : "Start voice input"}
    >
      {isListening ? (
        <MicOff className={isLarge ? "h-8 w-8" : "h-5 w-5"} />
      ) : (
        <Mic className={isLarge ? "h-8 w-8" : "h-5 w-5"} />
      )}
    </button>
  );
}
