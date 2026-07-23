import { useEffect, useRef, useState } from "react";
import { transcribeAudio, voiceAvailable } from "../bridge";

type Mode = "idle" | "listening" | "transcribing";

// The Web Speech API isn't in lib.dom for every target, so reach for it defensively.
function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
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
export function VoiceButton({ onText }: { onText: (text: string) => void }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [hasLocal, setHasLocal] = useState(false);
  const [note, setNote] = useState<string | null>(null);
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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    chunksRef.current = [];
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setMode("transcribing");
      try {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const text = await transcribeAudio(bytes, "webm");
        if (text.trim()) onText(text.trim());
        else setNote("No speech detected.");
      } catch (e) {
        setNote(String(e));
      }
      setMode("idle");
    };
    mediaRef.current = mr;
    mr.start();
    setMode("listening");
  };

  const toggle = async () => {
    setNote(null);
    if (mode === "listening") {
      stopAll();
      setMode("idle");
      return;
    }
    if (mode === "transcribing") return;
    const SR = getSpeechRecognition();
    try {
      if (SR) startDictation(SR);
      else if (hasLocal) await startRecording();
      else setNote("No speech recognition here. Set CODETWO_TRANSCRIBE_CMD to use a local transcriber.");
    } catch (e) {
      setNote(String(e));
      setMode("idle");
    }
  };

  const label = mode === "listening" ? "● rec" : mode === "transcribing" ? "…" : "🎤";
  return (
    <button
      className={`ghost voice ${mode}`}
      onClick={() => void toggle()}
      title={note ?? "Voice input — dictate into the prompt"}
    >
      {label}
    </button>
  );
}
