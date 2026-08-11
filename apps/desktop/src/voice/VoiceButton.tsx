import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { isDesktop, transcribeAudio, voiceAvailable } from "../bridge";
import { preferredRecordingType, toWav16kMono } from "./wav";
import { shouldUseWebSpeech } from "./platform";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "../ui/toast";
import { cn } from "@/lib/utils";

type Mode = "idle" | "listening" | "transcribing";

// The Web Speech API isn't in lib.dom for every target, so reach for it defensively.
function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const SpeechRecognition = w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  return shouldUseWebSpeech(isDesktop, SpeechRecognition !== null) ? SpeechRecognition : null;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

/**
 * Voice input. Prefers the webview's built-in speech recognition (live, no setup); otherwise records
 * audio and hands it to the core's configured local transcriber.
 */
export function VoiceButton({ onText, hint }: { onText: (text: string) => void; hint?: string }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [hasLocal, setHasLocal] = useState(false);
  const toast = useToast();
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    voiceAvailable().then(setHasLocal).catch(() => setHasLocal(false));
  }, []);

  const stopAll = () => {
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recRef.current = null;
    if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
  };

  const startDictation = (SR: new () => SpeechRecognitionLike) => {
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) text += r[0].transcript;
      }
      if (text.trim()) onText(text.trim());
    };
    rec.onerror = () => setMode("idle");
    rec.onend = () => setMode("idle");
    recRef.current = rec;
    rec.start();
    setMode("listening");
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast("This webview exposes no microphone API.", "error");
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = preferredRecordingType();
    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setMode("transcribing");
      try {
        // Send WAV, not the recorder's native container: whisper.cpp and the other local
        // transcribers read 16 kHz PCM and nothing else.
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || mimeType });
        const text = await transcribeAudio(await toWav16kMono(blob), "wav");
        if (text.trim()) onText(text.trim());
        else toast("No speech detected.", "error");
      } catch (e) {
        toast(`Transcription failed: ${e}`, "error");
      }
      setMode("idle");
    };
    mediaRef.current = mr;
    mr.start();
    setMode("listening");
  };

  const toggle = async () => {
    if (mode === "listening") {
      stopAll();
      setMode("idle");
      return;
    }
    if (mode === "transcribing") return;
    const SR = getSpeechRecognition();
    try {
      if (SR) {
        startDictation(SR);
        return;
      }
      // Re-check rather than trusting the mount-time answer: the transcriber may have been
      // installed since the app started.
      const local = hasLocal || (await voiceAvailable().catch(() => false));
      setHasLocal(local);
      if (local) await startRecording();
      else {
        // Say so out loud, and name the fix — the button used to look simply broken here.
        toast(
          "Dictation isn't available: this webview has no speech API, and the system recognizer is " +
            "off or has no on-device model for your language. Allow it under Privacy & Security → " +
            "Speech Recognition, or point CODETWO_TRANSCRIBE_CMD at a local transcriber.",
          "error",
        );
      }
    } catch (e) {
      toast(`Microphone unavailable: ${e}`, "error");
      setMode("idle");
    }
  };

  const Icon = mode === "listening" ? MicOff : Mic;
  const label = mode === "listening" ? "Stop listening" : "Voice input — dictate into the prompt";
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button
          variant={mode === "listening" ? "destructive" : "ghost"}
          size="icon"
          aria-label={label}
          className={cn("size-8 shrink-0", mode === "listening" && "animate-pulse")}
          onClick={() => void toggle()}
          disabled={mode === "transcribing"}
        >
          <Icon className={cn("size-4", mode === "transcribing" && "animate-spin")} />
        </Button>}
      />
      <TooltipContent>
        {label}
        {hint && <span className="ml-1.5 opacity-60">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
