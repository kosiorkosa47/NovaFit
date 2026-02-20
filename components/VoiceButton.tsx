"use client";

import { Mic, MicOff, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { getLang } from "@/lib/i18n";
import { AudioStreamer } from "@/lib/voice/audio-streamer";

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
  /** Called with user's speech transcript (text-only mode or fallback) */
  onTranscript: (text: string) => void;
  /** Called when real-time voice conversation completes (transcript + AI voice response) */
  onVoiceChat?: (result: VoiceChatResult) => void;
  /** Returns context for voice-chat endpoint. When provided, enables real-time voice mode. */
  getVoiceChatContext?: () => VoiceChatContext | null;
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

export function VoiceButton({
  onTranscript,
  onVoiceChat,
  getVoiceChatContext,
  size = "default",
  disabled = false,
}: VoiceButtonProps): React.ReactElement {
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

  // Always use latest callbacks via refs — prevents stale closure bug
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  const onVoiceChatRef = useRef(onVoiceChat);
  useEffect(() => { onVoiceChatRef.current = onVoiceChat; }, [onVoiceChat]);
  const getVoiceChatContextRef = useRef(getVoiceChatContext);
  useEffect(() => { getVoiceChatContextRef.current = getVoiceChatContext; }, [getVoiceChatContext]);

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

  /** Encode audio blob to 16-bit LE PCM base64 at 16kHz */
  const encodeToPcmBase64 = useCallback(async (audioBlob: Blob): Promise<string> => {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    const channelData = decoded.getChannelData(0);

    const pcmBuffer = new ArrayBuffer(channelData.length * 2);
    const pcmView = new DataView(pcmBuffer);
    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      pcmView.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    await audioCtx.close();

    // Convert to base64 in chunks (avoid stack overflow on large arrays)
    const bytes = new Uint8Array(pcmBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
    }
    return btoa(binary);
  }, []);

  /** Real-time voice conversation via SSE streaming */
  const sendToVoiceChat = useCallback(async (audioBlob: Blob) => {
    setIsProcessing(true);
    // Claim the transcript slot immediately — prevents 12s STT fallback from firing
    transcriptSentRef.current = true;
    try {
      const pcmBase64 = await encodeToPcmBase64(audioBlob);
      console.log("[voice-chat] PCM base64:", (pcmBase64.length / 1024).toFixed(0), "KB");

      const ctx = getVoiceChatContextRef.current?.();
      if (!ctx) {
        console.log("[voice-chat] No context — falling back to regular voice");
        void sendToNovaSonicFallback(audioBlob);
        return;
      }

      const response = await fetch("/api/voice-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: pcmBase64,
          sampleRate: 16000,
          sessionId: ctx.sessionId,
          userContext: ctx.userContext,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Voice chat failed: ${response.status}`);
      }

      // Create streaming audio player
      const player = new AudioStreamer(24000);
      setIsPlaying(true);

      // Process SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let transcript = "";
      let responseText = "";
      let audioChunkCount = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf("\n\n");

        while (idx !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          // Parse SSE event
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

            if (eventType === "audio" && parsed.chunk) {
              player.feed(parsed.chunk);
              audioChunkCount++;
            }

            if (eventType === "transcript" && parsed.text) {
              transcript = parsed.text;
              console.log("[voice-chat] transcript:", parsed.text.slice(0, 60));
            }

            if (eventType === "response_text" && parsed.text) {
              responseText = parsed.text;
              console.log("[voice-chat] response:", parsed.text.slice(0, 80));
            }

            if (eventType === "error") {
              throw new Error(parsed.message || "Voice chat stream error");
            }
          } catch (e) {
            if (e instanceof Error && e.message.includes("stream error")) throw e;
            // Skip unparseable chunks
          }

          idx = buffer.indexOf("\n\n");
        }
      }

      // Signal no more audio coming — wait for playback to finish
      player.finish();
      await new Promise<void>((resolve) => {
        if (!player.isPlaying) { resolve(); return; }
        player.onEnd(resolve);
        setTimeout(resolve, 20000); // safety timeout
      });

      await player.stop();
      setIsPlaying(false);

      console.log("[voice-chat] Complete:", { audioChunks: audioChunkCount, transcript: transcript.slice(0, 80), responseText: responseText.slice(0, 80) });

      // Report results
      if (onVoiceChatRef.current && (transcript || responseText)) {
        onVoiceChatRef.current({ transcript, responseText });
      } else if (transcript) {
        // Reset flag so emitTranscript can send
        transcriptSentRef.current = false;
        emitTranscript(transcript);
      } else {
        // Nova heard nothing (silence) — try browser STT fallback
        if (sttResultRef.current) {
          transcriptSentRef.current = false;
          emitTranscript(sttResultRef.current);
        } else {
          toast.error("Didn't catch that. Try speaking closer to the mic.");
        }
      }
    } catch (err) {
      console.error("[voice-chat] Error:", err);
      setIsPlaying(false);
      // Reset flag and try browser STT fallback
      transcriptSentRef.current = false;
      if (sttResultRef.current) {
        emitTranscript(sttResultRef.current);
      } else {
        toast.error("Voice conversation failed. Try again or type.");
      }
    } finally {
      setIsProcessing(false);
    }
  }, [encodeToPcmBase64, emitTranscript]);

  /** Legacy voice endpoint (STT-only fallback) */
  const sendToNovaSonicFallback = useCallback(async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      const pcmBase64 = await encodeToPcmBase64(audioBlob);

      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: pcmBase64, sampleRate: 16000 }),
      });

      const result = (await response.json()) as VoiceResponse;

      if (result.success) {
        const text = result.transcript || result.text;
        if (text) emitTranscript(text);
      } else {
        if (sttResultRef.current) {
          emitTranscript(sttResultRef.current);
        } else {
          toast.error("Could not understand audio. Try again or type.");
        }
      }
    } catch {
      if (sttResultRef.current) {
        emitTranscript(sttResultRef.current);
      } else {
        toast.error("Voice processing failed. Try again or type.");
      }
    } finally {
      setIsProcessing(false);
    }
  }, [encodeToPcmBase64, emitTranscript]);

  // Keep refs fresh for closure access
  const sendToVoiceChatRef = useRef(sendToVoiceChat);
  useEffect(() => { sendToVoiceChatRef.current = sendToVoiceChat; }, [sendToVoiceChat]);
  const sendToNovaSonicFallbackRef = useRef(sendToNovaSonicFallback);
  useEffect(() => { sendToNovaSonicFallbackRef.current = sendToNovaSonicFallback; }, [sendToNovaSonicFallback]);

  const stopRecording = useCallback(() => {
    clearTimers();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setIsListening(false);
  }, [clearTimers]);

  const stopRecordingRef = useRef(stopRecording);
  useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);

  const startRecording = useCallback(async () => {
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

      // Start browser SpeechRecognition in parallel (fallback STT)
      const Ctor = typeof window !== "undefined"
        ? window.SpeechRecognition ?? window.webkitSpeechRecognition
        : undefined;
      if (Ctor) {
        try {
          const recognition = new Ctor();
          recognition.lang = getLang() === "pl" ? "pl-PL" : "en-US";
          recognition.continuous = false;
          recognition.interimResults = false;
          recognition.onresult = (event: { results?: { 0: { transcript?: string } }[] }) => {
            const transcript = event.results?.[0]?.[0]?.transcript?.trim();
            if (transcript) sttResultRef.current = transcript;
          };
          recognition.onend = () => { /* no-op */ };
          recognition.onerror = () => { /* ignore */ };
          recognitionRef.current = recognition;
          recognition.start();
        } catch { /* SpeechRecognition not available */ }
      }

      // Silence detection via AnalyserNode
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
        console.log("[voice] Recording stopped, blob:", blob.size, "bytes");

        if (blob.size > 0) {
          // Use real-time voice chat if context is available
          if (getVoiceChatContextRef.current?.()) {
            void sendToVoiceChatRef.current(blob);
          } else {
            void sendToNovaSonicFallbackRef.current(blob);
          }

          // Safety: if nothing responds in 12s, use browser STT
          setTimeout(() => {
            if (!transcriptSentRef.current && sttResultRef.current) {
              console.log("[voice] Timeout — using browser STT fallback");
              emitTranscript(sttResultRef.current);
            }
          }, 12000);
        } else if (sttResultRef.current) {
          emitTranscript(sttResultRef.current);
        }
      };

      mediaRecorder.start(250);
      setIsListening(true);

      // Silence detection
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
          if (silentFrames >= FRAMES_FOR_SILENCE) stopRecordingRef.current();
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
    if (disabled || isProcessing || isPlaying) return;
    if (isListening) {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [disabled, isProcessing, isPlaying, isListening, startRecording, stopRecording]);

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
            ? "bg-blue-500 text-white animate-pulse hover:bg-blue-600 focus:ring-blue-400"
            : isLarge
              ? "bg-emerald-500 text-white mic-glow hover:bg-emerald-600 focus:ring-emerald-400"
              : "bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-400",
        (disabled || isProcessing) && "opacity-50 cursor-not-allowed"
      )}
      title={
        isProcessing ? "Processing..." :
        isPlaying ? "Nova is speaking..." :
        isListening ? "Recording... (auto-stop on silence)" :
        "Talk to Nova"
      }
      aria-label={isListening ? "Stop recording" : isPlaying ? "Nova is speaking" : "Start recording"}
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
