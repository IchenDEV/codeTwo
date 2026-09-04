import { useEffect, useRef, useState } from "react";

import { ActivityOrb } from "@/components/ui/activity-orb";
import { Button } from "@/components/ui/button";
import { Mic } from "@/components/ui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { isDesktop, transcribeAudio, voiceAvailable } from "../bridge";
import { useT } from "../i18n";
import type { SceneInfo, SceneSlotDefinition } from "../session/scene";
import { useToast } from "../ui/toast";
import { shouldUseWebSpeech } from "./platform";
import { preferredRecordingType, toWav16kMono } from "./wav";

type Mode = "idle" | "listening" | "transcribing" | "structuring";

/**
A press this long or longer is hold-to-talk; anything shorter is the classic click-to-toggle.
*/
const holdMs = 300;

// The Web Speech API isn't in lib.dom for every target, so reach for it defensively.
function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const SpeechRecognition =
    w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  return shouldUseWebSpeech(isDesktop, SpeechRecognition !== null)
    ? SpeechRecognition
    : null;
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
What the R11 structuring path needs from the app shell — injected so it unit-tests purely.
*/
export interface TranscriptHandlerDeps {
  scene: SceneInfo | null;
  structureBrief: (
    transcript: string,
    slots: SceneSlotDefinition[]
  ) => Promise<Record<string, string> | null>;
  insertBrief: (scene: SceneInfo, values: Record<string, string>) => void;
  insertText: (text: string) => void;
  /**
  Called alongside the raw-text fallback so the user hears why no brief appeared (toast).
  */
  onDegrade: () => void;
}

export function makeTranscriptHandler(
  deps: TranscriptHandlerDeps
): ((full: string) => Promise<void>) | undefined {
  const { scene } = deps;
  if (!scene?.brief) {
    return undefined;
  }
  const slots = scene.brief.slots ?? [];
  return async (full: string) => {
    const values = await deps.structureBrief(full, slots).catch(() => null);
    if (values && Object.keys(values).length > 0) {
      deps.insertBrief(scene, values);
    } else {
      deps.insertText(full);
      deps.onDegrade();
    }
  };
}

export function VoiceButton({
  onText,
  onTranscript,
  hint,
}: {
  readonly onText: (text: string) => void;
  readonly onTranscript?: (full: string) => Promise<void>;
  readonly hint?: string;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [hasLocal, setHasLocal] = useState(false);
  const toast = useToast();
  const t = useT();
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bufferRef = useRef("");
  const pressStartRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    voiceAvailable()
      .then((available) => {
        if (activeRef.current) {
          setHasLocal(available);
        }
      })
      .catch(() => {
        if (activeRef.current) {
          setHasLocal(false);
        }
      });
    return () => {
      activeRef.current = false;
      const recognition = recRef.current;
      recRef.current = null;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        try {
          recognition.stop();
        } catch {
          // Already stopped.
        }
      }
      const recorder = mediaRef.current;
      mediaRef.current = null;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      chunksRef.current = [];
      bufferRef.current = "";
    };
  }, []);

  const stopAll = () => {
    try {
      recRef.current?.stop();
    } catch {
      /*
      already stopped
      */
    }
    recRef.current = null;
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
    }
  };

  /**
  Deliver a finished capture: structure the buffer when asked to, otherwise just go idle.
  */
  const finishCapture = (text: string) => {
    if (onTranscript && text) {
      setMode("structuring");
      void onTranscript(text).finally(() => setMode("idle"));
    } else {
      setMode("idle");
    }
  };

  const startDictation = (SR: new () => SpeechRecognitionLike) => {
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    bufferRef.current = "";
    rec.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          text += r[0].transcript;
        }
      }
      if (!text.trim()) {
        return;
      }
      // R11: buffer finals for one onTranscript on stop; classic path streams them out per chunk.
      if (onTranscript) {
        bufferRef.current += (bufferRef.current ? " " : "") + text.trim();
      } else {
        onText(text.trim());
      }
    };
    rec.onerror = () => setMode("idle");
    rec.onend = () => {
      const buffered = bufferRef.current.trim();
      bufferRef.current = "";
      finishCapture(buffered);
    };
    recRef.current = rec;
    rec.start();
    setMode("listening");
  };

  const startRecording = async () => {
    if (navigator.mediaDevices?.getUserMedia == null) {
      toast(t("voice.noMicApi"), "error");
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!activeRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    streamRef.current = stream;
    const mimeType = preferredRecordingType();
    const mr = new MediaRecorder(
      stream,
      mimeType != null && mimeType !== "" ? { mimeType } : undefined
    );
    chunksRef.current = [];
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      mediaRef.current = null;
      if (!activeRef.current) {
        return;
      }
      setMode("transcribing");
      try {
        // Send WAV, not the recorder's native container: whisper.cpp and the other local
        // transcribers read 16 kHz PCM and nothing else.
        const blob = new Blob(chunksRef.current, {
          type: mr.mimeType || mimeType,
        });
        const wav = await toWav16kMono(blob);
        if (!activeRef.current) {
          return;
        }
        const text = (await transcribeAudio(wav, "wav")).trim();
        if (!activeRef.current) {
          return;
        }
        if (text && onTranscript) {
          // The local transcriber's single result rides the same structuring path as buffered
          // Web-Speech finals.
          finishCapture(text);
          return;
        }
        if (text) {
          onText(text);
        } else {
          toast(t("voice.noSpeech"), "error");
        }
      } catch (error) {
        toast(t("voice.transcribeFailed", { error: String(error) }), "error");
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
    if (mode === "transcribing" || mode === "structuring") {
      return;
    }
    const SR = getSpeechRecognition();
    try {
      if (SR) {
        startDictation(SR);
        return;
      }
      // Re-check rather than trusting the mount-time answer: the transcriber may have been
      // installed since the app started.
      const isLocal = hasLocal || (await voiceAvailable().catch(() => false));
      if (!activeRef.current) {
        return;
      }
      setHasLocal(isLocal);
      if (isLocal) {
        await startRecording();
      } else {
        // Say so out loud, and name the fix — the button used to look simply broken here.
        toast(t("voice.unavailable"), "error");
      }
    } catch (error) {
      toast(t("voice.micUnavailable", { error: String(error) }), "error");
      setMode("idle");
    }
  };

  // ---- hold-to-talk --------------------------------------------------------------------------
  // Pointer presses start capture immediately; releasing after ≥holdMs stops it (hold-to-talk),
  // while a shorter press leaves the capture running — the same outcome as the classic
  // click-to-toggle "on". Either way the click that trails a handled press is swallowed so it
  // can't immediately re-toggle. Keyboard activation fires click without pointer events, so
  // Enter/Space keep plain toggle semantics untouched.
  const onPointerDown = () => {
    suppressClickRef.current = false;
    if (mode !== "idle") {
      return;
    } // pressing a busy/listening button resolves via the click path
    pressStartRef.current = Date.now();
    void toggle();
  };

  const endPress = (isClickFollows: boolean) => {
    const started = pressStartRef.current;
    pressStartRef.current = null;
    if (started === null) {
      return;
    }
    if (Date.now() - started >= holdMs) {
      stopAll();
      setMode((m) => (m === "listening" ? "idle" : m));
    }
    // Short press: keep listening (that *is* the toggle-on the click would have done).
    if (isClickFollows) {
      suppressClickRef.current = true;
    }
  };

  const onClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    void toggle();
  };

  const label =
    mode === "listening"
      ? t("voice.stop")
      : mode === "structuring"
        ? t("voice.structuring")
        : t("voice.hold");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={mode === "listening" ? "destructive" : "ghost"}
            size="icon"
            aria-label={label}
            aria-pressed={mode === "listening"}
            data-voice-mode={mode}
            className="size-8 shrink-0 rounded-full"
            onPointerDown={onPointerDown}
            onPointerUp={() => endPress(true)}
            onPointerLeave={() => endPress(false)}
            onClick={onClick}
            disabled={mode === "transcribing" || mode === "structuring"}
          >
            {mode === "idle" ? (
              <Mic className="size-4" />
            ) : (
              <ActivityOrb
                state={
                  mode === "listening"
                    ? "listening"
                    : mode === "transcribing"
                      ? "composing"
                      : "shaping"
                }
                theme={mode === "listening" ? "dark" : "auto"}
                aria-hidden="true"
              />
            )}
          </Button>
        }
      />
      <TooltipContent>
        {label}
        {hint != null && hint !== "" ? (
          <span className="ml-1.5 opacity-60">{hint}</span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
