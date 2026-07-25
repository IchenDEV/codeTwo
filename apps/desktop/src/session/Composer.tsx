import { forwardRef, useCallback, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import {
  ArrowUp,
  Check,
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

import { ConfigPopover, type SessionConfig } from "./ConfigPopover";
import { VoiceButton } from "../voice/VoiceButton";
import type { ModelChoice } from "../bridge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";

interface ComposerProps {
  /** The document editor itself. The composer only owns the frame around it. */
  children: ReactNode;
  config: SessionConfig;
  /** Full-page authoring: the document takes the whole column and the transcript steps aside. */
  docMode: boolean;
  onDocMode: (v: boolean) => void;
  /** Height of the document area in compact mode, in px — dragged by the grip, persisted. */
  height: number;
  onHeight: (n: number) => void;
  /** The column the composer lives in; bounds the drag so it can't swallow the transcript. */
  boundsRef: React.MutableRefObject<HTMLElement | null>;
  /** What the agent reported it can run. Empty until a session exists, or if it reports none. */
  models: ModelChoice[];
  currentModel: string | null;
  onModel: (id: string) => void;
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
 * The model this turn will run on.
 *
 * ACP's model API is marked UNSTABLE and most adapters don't implement it, so "no models" is a
 * normal answer, not a failure — the picker explains that instead of showing an empty list. The
 * chip is hidden entirely until a session exists, because before that there's nothing to ask.
 */
function ModelPicker({
  models,
  current,
  onModel,
  hasSession,
}: {
  models: ModelChoice[];
  current: string | null;
  onModel: (id: string) => void;
  hasSession: boolean;
}) {
  const t = useT();
  if (!hasSession) return null;

  const active = models.find((m) => m.id === current);
  const label = active?.name ?? current ?? t("composer.defaultModel");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Chip title={t("composer.model")}>
          <span className="max-w-44 truncate">{label}</span>
        </Chip>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72 p-1">
        {models.length === 0 ? (
          <p className="px-2 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {t("composer.noModels")}
          </p>
        ) : (
          <ScrollArea className="max-h-72">
            {models.map((m) => (
              <button
                key={m.id}
                onClick={() => onModel(m.id)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
              >
                <Check
                  className={cn("mt-0.5 size-3.5 shrink-0", m.id === current ? "text-primary" : "opacity-0")}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{m.name}</span>
                  {m.description && (
                    <span className="block truncate text-[11px] text-muted-foreground">{m.description}</span>
                  )}
                </span>
              </button>
            ))}
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The prompt composer.
 *
 * Two shapes, one document. Compact, it's docked to the foot of the transcript and reads like a
 * chat box — that's the point, it's where you type. Expanded, it *becomes the page*: the card
 * chrome falls away and the document runs the full column on the app's own background, with a
 * centred measure and a real block gutter. It is the same BlockNote document in both — headings,
 * lists, code, `/` skills and `@` files work throughout.
 */
export function Composer({
  children,
  config,
  docMode,
  onDocMode,
  height,
  onHeight,
  boundsRef,
  models,
  currentModel,
  onModel,
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
  const t = useT();
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
    [applied, onHeight, boundsRef],
  );

  const controls = (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={t("composer.add")}>
            <Plus className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-60 p-1">
          <MenuItem icon={FileText} label={t("composer.mentionFile")} hint={filesHint} onClick={onAttachFile} />
          <MenuItem icon={Sparkles} label={t("composer.insertSkill")} hint={skillHint} onClick={onInsertSkill} />
          <MenuItem icon={Ticket} label={t("composer.pullIssue")} onClick={onInsertIssue} />
          <MenuItem icon={Store} label={t("composer.market")} onClick={onOpenMarket} />
          <p className="px-2 pb-1 pt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {t("composer.addHint")}
          </p>
        </PopoverContent>
      </Popover>

      {/* Sandbox, provider and model read as a sentence about what this turn will do. */}
      <ConfigPopover
        config={config}
        trigger={
          <Chip tone={config.sandbox === "danger_full_access" ? "warning" : undefined} title={t("composer.sandbox")}>
            {config.sandbox === "danger_full_access" && <span className="size-1.5 rounded-full bg-warning" />}
            {t(`sandbox.${config.sandbox}` as const)}
          </Chip>
        }
      />

      <ConfigPopover
        config={config}
        trigger={
          <Chip title={t("composer.providerMode")}>
            {provider && !provider.available && (
              <span className="size-1.5 rounded-full bg-warning" title={t("composer.cliNotFound")} />
            )}
            <span className="max-w-40 truncate text-foreground/80">
              {provider?.display_name ?? config.provider}
            </span>
            <span className="opacity-50">{t(`mode.${config.mode}` as "mode.ask")}</span>
          </Chip>
        }
      />

      <ModelPicker models={models} current={currentModel} onModel={onModel} hasSession={config.hasSession} />

      {config.planMode && <Chip title={t("composer.plan")}>plan</Chip>}
      {config.useWorktree && <Chip title={t("composer.worktree")}>worktree</Chip>}

      <div className="flex-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onPreview}>
            <Eye className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("composer.preview")}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-7 shrink-0", docMode && "text-primary")}
            onClick={() => onDocMode(!docMode)}
            aria-label={docMode ? t("composer.collapseLabel") : t("composer.expandLabel")}
          >
            {docMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {docMode ? t("composer.collapse") : t("composer.expand")}
          {docModeHint && <span className="ml-1.5 opacity-60">{docModeHint}</span>}
        </TooltipContent>
      </Tooltip>

      <VoiceButton onText={onVoiceText} />

      {/* Enter makes a paragraph in a document, so the send chord has to be taught rather than
          assumed. It shows only while the document is empty, and so retires itself. */}
      {docEmpty && !running && runHint && (
        <span className="mx-1 shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
          {t("composer.toSend", { key: runHint })}
        </span>
      )}

      {running ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="destructive"
              size="icon"
              className="size-8 shrink-0 rounded-full transition-transform active:scale-90"
              onClick={onStop}
              aria-label={t("composer.stop")}
            >
              <Square className="size-3.5 fill-current" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("composer.stop")}</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Kept enabled on purpose: a disabled button explains nothing, and clicking it
                focuses the document and says what's missing. */}
            <Button
              size="icon"
              variant={docEmpty ? "secondary" : "default"}
              className="size-8 shrink-0 rounded-full transition-transform active:scale-90"
              onClick={onRun}
              aria-label={t("composer.run")}
            >
              <ArrowUp className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {docEmpty ? t("composer.runEmpty") : t("composer.run")}
            <span className="ml-1.5 opacity-60">{runHint}</span>
          </TooltipContent>
        </Tooltip>
      )}
    </>
  );

  /*
   * Compact and expanded are the *same* element tree with different classes, deliberately. Two
   * branches returning different JSX would give React a different structure to reconcile, which
   * unmounts BlockNote and takes the draft with it — expanding the composer would silently erase
   * what you'd written. Keep one tree; vary the styling.
   */
  return (
    <section
      className={cn(
        "flex flex-col",
        docMode ? "min-h-0 flex-1" : "shrink-0 px-4 pb-3.5 pt-1",
      )}
    >
      <div
        className={cn(
          "flex flex-col",
          docMode ? "min-h-0 flex-1" : "mx-auto w-full max-w-[860px]",
        )}
      >
        {/* No `overflow-hidden`: BlockNote's drag/insert handles render just outside the text
            column, and clipping them takes the block gutter away. */}
        <div
          className={cn(
            "composer-card flex flex-col",
            docMode
              ? // Expanded, the composer *is* the page: no card, no border, the app's own surface.
                "min-h-0 flex-1"
              : "glass-raised rounded-2xl border shadow-lg transition-[box-shadow,border-color] duration-200 focus-within:border-ring/50 focus-within:shadow-xl",
          )}
        >
          {/* Grip: drag for any height, double-click for the full page. Meaningless once the
              document owns the column, so it's hidden — but kept mounted to preserve the tree. */}
          <div
            className={cn("composer-grip", docMode && "hidden")}
            onMouseDown={startDrag}
            onDoubleClick={() => onDocMode(true)}
            title={t("composer.grip")}
          />

          <div
            className={cn("min-h-0 overflow-y-auto", docMode ? "bn-doc-mode flex-1" : "py-1")}
            style={docMode ? undefined : { maxHeight: applied }}
          >
            {children}
          </div>

          {/* Expanded, the control row spans the window and lines up with the text measure, so it
              reads as the page's own footer rather than a bar floating over it. */}
          <div className={cn(docMode && "border-t")}>
            <div
              className={cn(
                "flex items-center gap-0.5",
                docMode ? "mx-auto w-full max-w-[860px] px-6 py-2" : "px-2 pb-1.5 pt-1",
              )}
            >
              {controls}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
