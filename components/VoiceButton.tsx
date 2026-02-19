"use client";

import { Mic, MicOff, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { getLang } from "@/lib/i18n";

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

const SILENCE_TIMEOUT_MS = 2500;
const MAX_RECORDING_MS = 15000;

export function VoiceButton({ onTranscript, size = "default", disabled = false }: VoiceButtonProps): React.ReactElement {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sttResultRef = useRef<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const transcriptSentRef = useRef(false);

  // FIX: Always use latest onTranscript via ref — prevents stale closure bug
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  /** Safely call onTranscript with latest ref — single entry point */
  const emitTranscript = useCallback((text: string) => {
    console.log("[voice] emitTranscript:", text, "alreadySent:", transcriptSentRef.current);
    if (!text.trim() || transcriptSentRef.current) return;
    transcriptSentRef.current = true;
    onTranscriptRef.current(text);
  }, []);

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
    if (silenceCheckRef.current) { clearInterval(silenceCheckRef.current); silenceCheckRef.current = null; }
  }, []);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioContextRef.current?.close();
      recognitionRef.current?.stop();
      clearTimers();
    };
  }, [clearTimers]);

  const playAudioResponse = useCallback(async (audioBase64: string, sampleRate: number) => {
    if (!audioBase64) return;
    try {
      setIsPlaying(true);
      const audioBytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
      const samples = new Float32Array(audioBytes.length / 2);
      const view = new DataView(audioBytes.buffer, audioBytes.byteOffset, audioBytes.byteLength);
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
      console.log("[voice] sendToNovaSonic: blob size=", audioBlob.size);
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      const channelData = decoded.getChannelData(0);
      console.log("[voice] Decoded PCM samples:", channelData.length, "duration:", (channelData.length / 16000).toFixed(1), "s");

      const pcmBuffer = new ArrayBuffer(channelData.length * 2);
      const pcmView = new DataView(pcmBuffer);
      for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        pcmView.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      }
      await audioCtx.close();

      // Convert to base64 in chunks (spread operator crashes on large arrays)
      const bytes = new Uint8Array(pcmBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
      }
      const pcmBase64 = btoa(binary);
      console.log("[voice] PCM base64 length:", pcmBase64.length);

      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: pcmBase64, sampleRate: 16000 }),
      });

      console.log("[voice] API response status:", response.status);
      const result = (await response.json()) as VoiceResponse;
      console.log("[voice] Nova Sonic result:", JSON.stringify({ success: result.success, transcript: result.transcript?.slice(0, 80), text: result.text?.slice(0, 80), error: result.error, hasAudio: !!result.audioBase64 }));

      if (result.success) {
        // Don't play Nova Sonic's standalone audio — the 3-agent pipeline
        // will generate a better response, spoken via Nova Sonic TTS
        const text = result.transcript || result.text;
        if (text) emitTranscript(text);
      } else {
        // Nova Sonic failed — use browser STT result if we have one
        console.log("[voice] Nova Sonic failed, browser STT result:", sttResultRef.current);
        if (sttResultRef.current) {
          emitTranscript(sttResultRef.current);
        } else {
          toast.error("Could not understand audio. Try again or type.");
        }
      }
    } catch (err) {
      // Error — use browser STT result if available
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[voice] sendToNovaSonic error:", msg);
      if (sttResultRef.current) {
        emitTranscript(sttResultRef.current);
      } else {
        toast.error("Voice processing failed. Try again or type.");
      }
    } finally {
      setIsProcessing(false);
    }
  }, [emitTranscript, playAudioResponse]);

  // Keep sendToNovaSonic ref fresh for mediaRecorder.onstop closure
  const sendToNovaSonicRef = useRef(sendToNovaSonic);
  useEffect(() => { sendToNovaSonicRef.current = sendToNovaSonic; }, [sendToNovaSonic]);

  const stopRecording = useCallback(() => {
    clearTimers();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setIsListening(false);
  }, [clearTimers]);

  // Keep stopRecording ref fresh for silence detection closure
  const stopRecordingRef = useRef(stopRecording);
  useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);

  const startRecording = useCallback(async () => {
    // Reset state for this recording session
    sttResultRef.current = null;
    transcriptSentRef.current = false;

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

      // --- Start browser SpeechRecognition in parallel ---
      const Ctor = typeof window !== "undefined"
        ? window.SpeechRecognition ?? window.webkitSpeechRecognition
        : undefined;
      console.log("[voice] SpeechRecognition available:", !!Ctor);
      if (Ctor) {
        try {
          const recognition = new Ctor();
          recognition.lang = getLang() === "pl" ? "pl-PL" : "en-US";
          recognition.continuous = false;
          recognition.interimResults = false;
          recognition.onresult = (event: { results?: { 0: { transcript?: string } }[] }) => {
            const transcript = event.results?.[0]?.[0]?.transcript?.trim();
            console.log("[voice] Browser STT result:", transcript);
            if (transcript) {
              // Save as fallback — Nova Sonic result is preferred when available
              sttResultRef.current = transcript;
            }
          };
          recognition.onend = () => { /* no-op */ };
          recognition.onerror = (e: { error?: string }) => { console.log("[voice] STT error:", e.error); };
          recognitionRef.current = recognition;
          recognition.start();
        } catch { /* SpeechRecognition not available */ }
      }

      // --- Set up silence detection via AnalyserNode ---
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

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
        audioCtx.close().catch(() => {});
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        console.log("[voice] Recording stopped, blob size:", blob.size, "chunks:", chunksRef.current.length);
        if (blob.size > 0) {
          // Send to Nova Sonic (preferred STT) — browser STT is fallback
          void sendToNovaSonicRef.current(blob);

          // Safety net: if Nova Sonic takes too long, use browser STT result
          setTimeout(() => {
            if (!transcriptSentRef.current && sttResultRef.current) {
              console.log("[voice] Nova Sonic timeout — using browser STT fallback");
              emitTranscript(sttResultRef.current);
            }
          }, 8000);
        } else if (sttResultRef.current) {
          // No audio recorded but browser STT got something
          emitTranscript(sttResultRef.current);
        }
      };

      mediaRecorder.start(250);
      setIsListening(true);

      // --- Silence detection ---
      let silentFrames = 0;
      const SILENCE_THRESHOLD = 15;
      const FRAMES_FOR_SILENCE = Math.ceil(SILENCE_TIMEOUT_MS / 100);

      silenceCheckRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;

        if (avg < SILENCE_THRESHOLD) {
          silentFrames++;
          if (silentFrames >= FRAMES_FOR_SILENCE) {
            stopRecordingRef.current();
          }
        } else {
          silentFrames = 0;
        }
      }, 100);

      maxTimerRef.current = setTimeout(() => {
        stopRecordingRef.current();
      }, MAX_RECORDING_MS);

    } catch {
      // Mic permission denied — try browser STT alone
      const Ctor = typeof window !== "undefined"
        ? window.SpeechRecognition ?? window.webkitSpeechRecognition
        : undefined;
      if (Ctor) {
        const recognition = new Ctor();
        recognition.lang = getLang() === "pl" ? "pl-PL" : "en-US";
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = (event: { results?: { 0: { transcript?: string } }[] }) => {
          const transcript = event.results?.[0]?.[0]?.transcript?.trim();
          if (transcript) emitTranscript(transcript);
        };
        recognition.onend = () => setIsListening(false);
        recognition.onerror = () => { setIsListening(false); toast.error("Microphone not available."); };
        try { recognition.start(); setIsListening(true); } catch { toast.error("Microphone not available."); }
      } else {
        toast.error("Microphone not available on this device.");
      }
    }
  }, [emitTranscript, clearTimers]);

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
        isProcessing ? "Przetwarzanie..." :
        isListening ? "Nagrywam... (auto-stop po ciszy)" :
        isPlaying ? "Odtwarzam odpowiedź" :
        "Mów do Nova"
      }
      aria-label={isListening ? "Zatrzymaj nagrywanie" : "Rozpocznij nagrywanie"}
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
