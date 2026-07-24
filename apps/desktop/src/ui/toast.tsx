import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "info" | "success" | "error";

interface Toast {
  id: number;
  text: string;
  tone: Tone;
}

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => {});

/**
 * Transient feedback. Several actions used to fail silently — a click that hits a disabled
 * provider, a voice button with no recognizer, a commit with nothing staged — which reads as "the
 * button is broken". Anything that can no-op should say so here instead.
 */
export function useToast() {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((text: string, tone: Tone = "info") => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-9 right-4 z-50 flex flex-col items-end gap-2">
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICONS = { info: Info, success: CheckCircle2, error: CircleAlert };

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    // Errors linger — they usually carry something worth reading.
    const ms = toast.tone === "error" ? 8000 : 3500;
    const timer = setTimeout(onDismiss, ms);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const Icon = ICONS[toast.tone];
  return (
    <div
      role="status"
      className={cn(
        "glass-raised animate-rise-in pointer-events-auto flex max-w-96 items-start gap-2 rounded-lg border px-3 py-2 text-[13px] shadow-lg",
        toast.tone === "error" && "border-destructive/40",
        toast.tone === "success" && "border-success/40",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          toast.tone === "error" && "text-destructive",
          toast.tone === "success" && "text-success",
          toast.tone === "info" && "text-muted-foreground",
        )}
      />
      <span className="min-w-0 flex-1 break-words">{toast.text}</span>
      <button onClick={onDismiss} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Dismiss">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
