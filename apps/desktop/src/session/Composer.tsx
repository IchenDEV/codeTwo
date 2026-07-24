import { forwardRef, useCallback, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import {
  ArrowUp,
  Eye,
  FileText,
  Maximize2,
  Minimize2,
  Plus,
  Sparkles,
  Square,
  Store,
  Ticket,
} from "lucide-react";

import { ConfigPopover, MODE_LABEL, SANDBOX_LABEL, type SessionConfig } from "./ConfigPopover";
import { VoiceButton } from "../voice/VoiceButton";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ComposerProps {
  /** The document editor itself. The composer only owns the frame around it. */
  children: ReactNode;
  config: SessionConfig;
  /** Full-height authoring: the document takes the whole column and the transcript steps aside. */
  docMode: boolean;
  onDocMode: (v: boolean) => void;
  /** Height of the document area in compact mode, in px — dragged by the grip, persisted. */
  height: number;
  onHeight: (n: number) => void;
  /** The column the composer lives in; bounds the drag so it can't swallow the transcript. */
  boundsRef: React.MutableRefObject<HTMLElement | null>;
  running: boolean;
  docEmpty: boolean;
  onRun: () => void;
  onStop: () => void;
  onPreview: () => void;
  onAttachFile: () => void;
  onInsertSkill: () => void;
  onInsertIssue: () => void;
  onOpenMarket: () => void;
  onVoiceText: (text: string) => void;
  runHint: string;
  docModeHint: string;
  skillHint: string;
  filesHint: string;
}

/** One row of the `+` menu. */
function MenuItem({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent"
      onClick={onClick}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{hint}</span>}
    </button>
  );
}

/**
 * A status chip in the control row — reads as text, behaves as a button. Forwards its ref so it can
 * be a Radix popover trigger.
 */
const Chip = forwardRef<HTMLButtonElement, ComponentProps<"button"> & { tone?: "warning" }>(
  ({ children, tone, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors hover:bg-accent",
        tone === "warning" ? "text-warning" : "text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
Chip.displayName = "Chip";

/**
 * The prompt composer, docked to the bottom of the transcript.
 *
 * It reads like a chat box — that's the point, it's where you type — but it *is* the full BlockNote
 * document: headings, lists, code, `/` skills and `@` files all work in place. It grows with the
 * content, the grip drags it taller, and Expand hands it the entire column for long-form authoring.
 */
export function Composer({
  children,
  config,
  docMode,
  onDocMode,
  height,
  onHeight,
  boundsRef,
  running,
  docEmpty,
  onRun,
  onStop,
  onPreview,
  onAttachFile,
  onInsertSkill,
  onInsertIssue,
  onOpenMarket,
  onVoiceText,
  runHint,
  docModeHint,
  skillHint,
  filesHint,
}: ComposerProps) {
  const provider = config.providers.find((p) => p.id === config.provider);

  // Leave room for at least a few transcript lines, whatever the window size — including when a
  // height saved on a tall window is restored on a short one. Only the applied height is clamped;
  // the saved preference comes back in full once there's room again.
  const [maxHeight, setMaxHeight] = useState(400);
  useEffect(() => {
    const measure = () => {
      const column = boundsRef.current?.getBoundingClientRect().height ?? 720;
      setMaxHeight(Math.max(72, column - 180));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [boundsRef]);
  const applied = Math.min(height, maxHeight);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      // Dragging is a compact-mode gesture; in doc mode the height is the whole column.
      onDocMode(false);
      const startY = e.clientY;
      const startH = applied;
      const column = boundsRef.current?.getBoundingClientRect().height ?? 720;
      const max = Math.max(72, column - 180);
      const onMove = (ev: MouseEvent) =>
        onHeight(Math.round(Math.min(max, Math.max(72, startH + (startY - ev.clientY)))));
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.classList.remove("resizing-v");
      };
      document.body.classList.add("resizing-v");
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [applied, onHeight, onDocMode, boundsRef],
  );

  return (
    <section className={cn("flex shrink-0 flex-col px-4 pb-3.5 pt-1", docMode && "min-h-0 flex-1")}>
      <div className={cn("mx-auto flex w-full max-w-[860px] flex-col", docMode && "min-h-0 flex-1")}>
        {/* No `overflow-hidden`: BlockNote's drag/insert handles render just outside the text
            column, and clipping them takes the block gutter away. */}
        <div
          className={cn(
            "composer-card flex flex-col rounded-2xl border bg-card shadow-lg transition-shadow",
            "focus-within:border-ring/50 focus-within:shadow-xl",
            docMode && "min-h-0 flex-1",
          )}
        >
          {/* Grip: drag for any height, double-click for the full column. */}
          <div
            className="composer-grip"
            onMouseDown={startDrag}
            onDoubleClick={() => onDocMode(!docMode)}
            title="Drag to resize · double-click to expand"
          />

          {/* The document. Scrolls inside the card so the control row never gets pushed away. */}
          <div
            className={cn("min-h-0 overflow-y-auto py-1", docMode && "bn-doc-mode flex-1")}
            style={docMode ? undefined : { maxHeight: applied }}
          >
            {children}
          </div>

          {/* control row */}
          <div className="flex items-center gap-0.5 px-2 pb-1.5 pt-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Add to the document">
                  <Plus className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-60 p-1">
                <MenuItem icon={FileText} label="Mention a file" hint={filesHint} onClick={onAttachFile} />
                <MenuItem icon={Sparkles} label="Insert a skill" hint={skillHint} onClick={onInsertSkill} />
                <MenuItem icon={Ticket} label="Pull in an issue" onClick={onInsertIssue} />
                <MenuItem icon={Store} label="Skill market" onClick={onOpenMarket} />
                <p className="px-2 pb-1 pt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  Or type <b>/</b> for skills and <b>@</b> for files, right in the document.
                </p>
              </PopoverContent>
            </Popover>

            {/* Sandbox and provider read as a sentence about what this turn will be allowed to do. */}
            <ConfigPopover
              config={config}
              trigger={
                <Chip
                  tone={config.sandbox === "danger_full_access" ? "warning" : undefined}
                  title="Sandbox and approvals"
                >
                  {config.sandbox === "danger_full_access" && (
                    <span className="size-1.5 rounded-full bg-warning" />
                  )}
                  {SANDBOX_LABEL[config.sandbox]}
                </Chip>
              }
            />

            <ConfigPopover
              config={config}
              trigger={
                <Chip title="Provider and approval mode">
                  {provider && !provider.available && (
                    <span className="size-1.5 rounded-full bg-warning" title="CLI not found" />
                  )}
                  <span className="max-w-40 truncate text-foreground/80">
                    {provider?.display_name ?? config.provider}
                  </span>
                  <span className="opacity-50">{MODE_LABEL[config.mode] ?? config.mode}</span>
                </Chip>
              }
            />

            {config.planMode && <Chip title="Plan first is on">plan</Chip>}
            {config.useWorktree && <Chip title="Running in an isolated worktree">worktree</Chip>}

            <div className="flex-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onPreview}>
                  <Eye className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Preview the compiled prompt</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("size-7 shrink-0", docMode && "text-primary")}
                  onClick={() => onDocMode(!docMode)}
                  aria-label={docMode ? "Collapse the document" : "Expand the document"}
                >
                  {docMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {docMode ? "Back to the transcript" : "Full-height document"}
                {docModeHint && <span className="ml-1.5 opacity-60">{docModeHint}</span>}
              </TooltipContent>
            </Tooltip>

            <VoiceButton onText={onVoiceText} />

            {running ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="size-8 shrink-0 rounded-full"
                    onClick={onStop}
                    aria-label="Stop this turn"
                  >
                    <Square className="size-3.5 fill-current" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Stop this turn</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* Kept enabled on purpose: a disabled button explains nothing, and clicking it
                      focuses the document and says what's missing. */}
                  <Button
                    size="icon"
                    variant={docEmpty ? "secondary" : "default"}
                    className="size-8 shrink-0 rounded-full"
                    onClick={onRun}
                    aria-label="Run this document"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {docEmpty ? "Write a prompt first" : "Run this document"}
                  <span className="ml-1.5 opacity-60">{runHint}</span>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
