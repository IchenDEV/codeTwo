import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { CheckCircle2, CircleAlert, Info, X } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export type Tone = "info" | "success" | "error";

/**
An offer to take it back. See the undo rule in docs/design/system.md.
*/
export interface ToastAction {
  label: string;
  run: () => void;
}

interface Toast {
  id: number;
  text: string;
  tone: Tone;
  action?: ToastAction;
}

const ToastContext = createContext<
  (text: string, tone?: Tone, action?: ToastAction) => void
>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = (text: string, tone: Tone = "info", action?: ToastAction) => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { action, id, text, tone }]);
  };

  const dismiss = (id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  };

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-8 z-50 flex flex-col items-end gap-2">
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICONS = { error: CircleAlert, info: Info, success: CheckCircle2 };

function ToastRow({
  toast,
  onDismiss,
}: {
  readonly toast: Toast;
  readonly onDismiss: () => void;
}) {
  useEffect(() => {
    // Errors linger — they usually carry something worth reading. So does an undo: the offer is
    // only real if it outlives the moment you notice you needed it.
    const ms = toast.tone === "error" || toast.action ? 8000 : 3500;
    const timer = setTimeout(onDismiss, ms);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const Icon = ICONS[toast.tone];
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className="animate-rise-in rounded-module bg-raised text-body text-content shadow-raised pointer-events-auto flex w-fit max-w-full items-start gap-2 px-3 py-2"
    >
      <Icon
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          toast.tone === "error" && "text-destructive",
          toast.tone === "success" && "text-success",
          toast.tone === "info" && "text-muted-foreground"
        )}
      />
      <span className="min-w-0 flex-1 break-words">{toast.text}</span>
      {toast.action ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            toast.action!.run();
            onDismiss();
          }}
          className="shrink-0"
        >
          {toast.action.label}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onDismiss}
        className="shrink-0"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
