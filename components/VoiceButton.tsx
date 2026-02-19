"use client";

import { Mic, MicOff, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  size?: "default" | "large";
  disabled?: boolean;
}

interface VoiceResponse {
  success: boolean;
  transcript: string;
  text: string;
  audioBase64: string;
  sampleRate: number;
  error?: string;
}

/**
 * VoiceButton — records audio via MediaRecorder, sends to Nova Sonic,
 * plays back audio response and returns transcript.
 * Falls back to browser SpeechRecognition if MediaRecorder unavailable.
 */
export function VoiceButton({ onTranscript, size = "default", disabled = false }: VoiceButtonProps): React.ReactElement {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioContextRef.current?.close();
    };
  }, []);

  const playAudioResponse = useCallback(async (audioBase64: string, sampleRate: number) => {
    if (!audioBase64) return;
    try {
      setIsPlaying(true);
      const audioBytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));

      // Convert raw PCM (16-bit signed LE) to Float32
      const samples = new Float32Array(audioBytes.length / 2);
      const view = new DataView(audioBytes.buffer);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = view.getInt16(i * 2, true) / 32768;
      }

      const ctx = new AudioContext({ sampleRate });
      audioContextRef.current = ctx;
      const buffer = ctx.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlaying(false);
      source.start();
    } catch {
      setIsPlaying(false);
    }
  }, []);

  const sendToNovaSonic = useCallback(async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      // Convert blob to raw PCM 16-bit 16kHz mono
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      const channelData = decoded.getChannelData(0);

      // Convert Float32 → Int16 PCM
      const pcmBuffer = new ArrayBuffer(channelData.length * 2);
      const pcmView = new DataView(pcmBuffer);
      for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        pcmView.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      }
      await audioCtx.close();

      const pcmBase64 = btoa(
        String.fromCharCode(...new Uint8Array(pcmBuffer))
      );

      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: pcmBase64,
          sampleRate: 16000,
        }),
      });

      const result = (await response.json()) as VoiceResponse;

      if (result.success) {
        // Play audio response
        if (result.audioBase64) {
          void playAudioResponse(result.audioBase64, result.sampleRate);
        }
        // Send transcript to parent (use assistant text if transcript empty)
        const text = result.transcript || result.text;
        if (text) onTranscript(text);
      } else {
        // Fallback: try browser speech recognition
        console.warn("Nova Sonic failed, falling back to browser STT:", result.error);
        fallbackBrowserSTT();
      }
    } catch (error) {
      console.warn("Voice processing error:", error);
      fallbackBrowserSTT();
    } finally {
      setIsProcessing(false);
    }
  }, [onTranscript, playAudioResponse]);

  const fallbackBrowserSTT = useCallback(() => {
    const Ctor = typeof window !== "undefined"
      ? window.SpeechRecognition ?? window.webkitSpeechRecognition
      : undefined;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: { results?: { 0: { transcript?: string } }[] }) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) onTranscript(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    try { recognition.start(); setIsListening(true); } catch { /* ignore */ }
  }, [onTranscript]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      chunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size > 0) {
          void sendToNovaSonic(blob);
        }
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch {
      // Mic permission denied — fallback
      fallbackBrowserSTT();
    }
  }, [sendToNovaSonic, fallbackBrowserSTT]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (disabled || isProcessing) return;
    if (isListening) {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [disabled, isProcessing, isListening, startRecording, stopRecording]);

  const isLarge = size === "large";
  const showSpinner = isProcessing;

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
          : isPlaying
            ? "bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-400"
            : isLarge
              ? "bg-emerald-500 text-white mic-glow hover:bg-emerald-600 focus:ring-emerald-400"
              : "bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-400",
        (disabled || isProcessing) && "opacity-50 cursor-not-allowed"
      )}
      title={
        isProcessing ? "Processing..." :
        isListening ? "Stop listening" :
        isPlaying ? "Playing response" :
        "Talk to Nova"
      }
      aria-label={isListening ? "Stop voice input" : "Start voice input"}
    >
      {showSpinner ? (
        <div className={cn("animate-spin rounded-full border-2 border-white border-t-transparent", isLarge ? "h-8 w-8" : "h-5 w-5")} />
      ) : isListening ? (
        <MicOff className={isLarge ? "h-8 w-8" : "h-5 w-5"} />
      ) : isPlaying ? (
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
