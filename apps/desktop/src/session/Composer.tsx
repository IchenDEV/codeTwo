import { forwardRef, useCallback, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import {
  ArrowUp,
  ChevronDown,
  FileText,
  Folder,
  ListChecks,
  Plus,
  Sparkles,
  Square,
  Store,
  Ticket,
} from "lucide-react";

import type { SessionConfig } from "./config";
import { SESSION_MODES, sessionMode } from "./mode";
import { familyOf, groupModels, pickVariant, variantOf, type Effort, type ModelFamily } from "./models";
import { ProviderIcon } from "../providers/ProviderIcon";
import { VoiceButton } from "../voice/VoiceButton";
import type { ModelChoice } from "../bridge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  /** The adapter's own pick at session/new — worth a "Default" badge in the menus. */
  defaultModel: string | null;
  onModel: (id: string) => void;
  running: boolean;
  docEmpty: boolean;
  onRun: () => void;
  onStop: () => void;
  onAttachFile: () => void;
  onInsertSkill: () => void;
  onInsertIssue: () => void;
  onOpenMarket: () => void;
  onVoiceText: (text: string) => void;
  runHint: string;
  skillHint: string;
  filesHint: string;
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
        "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-hint transition-colors hover:bg-accent",
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

/** Muted section header inside a picker menu — "Model", "Reasoning". */
function MenuSection({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pb-1 pt-1.5 text-hint text-muted-foreground">{children}</p>;
}

/** The small "Default" pill on the adapter's own pick. */
function DefaultBadge() {
  const t = useT();
  return (
    <span className="shrink-0 rounded-md border bg-muted/60 px-1.5 py-px text-cap text-muted-foreground">
      {t("composer.default")}
    </span>
  );
}

/** One selectable row of a picker menu: the current choice sits on a filled background. */
function MenuRow({
  selected,
  isDefault,
  label,
  detail,
  leading,
  onClick,
}: {
  selected: boolean;
  isDefault: boolean;
  label: string;
  detail?: string | null;
  /** Optional marker before the label — the provider list's availability dot. */
  leading?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui transition-colors",
        selected ? "bg-accent" : "hover:bg-accent/60",
      )}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {detail && <span className="block truncate text-fine text-muted-foreground">{detail}</span>}
      </span>
      {isDefault && <DefaultBadge />}
    </button>
  );
}

/**
 * One chip, one question.
 *
 * These used to be a single popover holding provider, working directory, permissions and two
 * isolation toggles — a settings dashboard behind every chip in the row, so clicking "Auto-edit"
 * asked you about four other things first. Each control row chip now opens only its own list.
 */
function ModePicker({ config }: { config: SessionConfig }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const active = sessionMode(config.mode, config.sandbox);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip tone={active === "full_access" ? "warning" : undefined} title={t("config.mode")}>
          {active === "full_access" && <span className="size-1.5 shrink-0 rounded-full bg-warning" />}
          <span>{t(`mode.${active}` as "mode.ask")}</span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </Chip>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-64 p-1.5">
        <MenuSection>{t("config.mode")}</MenuSection>
        {SESSION_MODES.map((m) => (
          <MenuRow
            key={m.id}
            selected={m.id === active}
            isDefault={false}
            label={t(`mode.${m.id}` as "mode.ask")}
            detail={t(`mode.${m.id}Hint` as "mode.askHint")}
            onClick={() => {
              config.onSessionMode(m.id);
              setOpen(false);
            }}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function ProviderPicker({ config }: { config: SessionConfig }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const active = config.providers.find((p) => p.id === config.provider);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip title={t("config.provider")}>
          {active && !active.available && (
            <span className="size-1.5 shrink-0 rounded-full bg-warning" title={t("composer.cliNotFound")} />
          )}
          <span className="max-w-40 truncate text-foreground/80">
            {active?.display_name ?? config.provider}
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </Chip>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-64 p-1.5">
        <MenuSection>{t("config.provider")}</MenuSection>
        {config.providers.map((p) => (
          <MenuRow
            key={p.id}
            selected={p.id === config.provider}
            isDefault={false}
            label={p.display_name}
            // The dot says installed; the line under it says what's missing, so the list itself
            // answers "why can't I use that one?" without a paragraph of warning text.
            detail={p.available ? null : p.needs_node ? t("settings.needsNode") : t("settings.notInstalled")}
            leading={
              <span
                className={cn("size-1.5 shrink-0 rounded-full", p.available ? "bg-success" : "bg-border")}
              />
            }
            onClick={() => {
              config.onProvider(p.id);
              setOpen(false);
            }}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Where the session runs: the directory, and whether it gets its own checkout of it. Two fields, but
 * one question — both answer "which files is this turn going to touch?".
 */
function WorkspacePicker({ config }: { config: SessionConfig }) {
  const t = useT();
  const name = config.cwd.split("/").filter(Boolean).pop() ?? config.cwd;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Chip title={t("composer.workspace")}>
          <Folder className="size-3.5 shrink-0 opacity-70" />
          <span className="max-w-32 truncate">{name}</span>
          {/* The worktree toggle lives inside, so its "on" state has to show out here. */}
          {config.useWorktree && <span className="shrink-0 text-primary">{t("composer.wt")}</span>}
        </Chip>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 space-y-1.5">
        <Label className="text-xs">{t("config.cwd")}</Label>
        <Input
          className="h-8 font-mono text-xs"
          value={config.cwd}
          onChange={(e) => config.onCwd(e.target.value)}
          placeholder="."
        />
        <label className="flex cursor-pointer items-start gap-2 pt-1">
          <Checkbox
            checked={config.useWorktree}
            onCheckedChange={(v) => config.onWorktree(v === true)}
            className="mt-0.5"
          />
          <span className="text-xs">
            {t("config.worktree")}
            <span className="block text-fine text-muted-foreground">{t("config.worktreeHint")}</span>
          </span>
        </label>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The model this turn will run on: a model chip, and an effort chip when the model comes in
 * reasoning variants.
 *
 * ACP's model API is flat, so adapters that offer reasoning effort mint one entry per level
 * ("gpt-5.1-codex low/medium/high"). `groupModels` folds those back into families: the first chip
 * picks the family, the second the effort, and together they resolve to one of the adapter's own
 * ids. Adapters without variants just get the flat list under the first chip.
 *
 * The API is also marked UNSTABLE and most adapters skip it entirely, so "no models" is a normal
 * answer, not a failure — the menu explains that instead of showing an empty list. Everything is
 * hidden until a session exists, because before that there's nothing to ask.
 */
function ModelPicker({
  models,
  current,
  defaultModel,
  provider,
  onModel,
  hasSession,
}: {
  models: ModelChoice[];
  current: string | null;
  defaultModel: string | null;
  provider: string;
  onModel: (id: string) => void;
  hasSession: boolean;
}) {
  const t = useT();
  const [modelOpen, setModelOpen] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const families = useMemo(() => groupModels(models), [models]);
  if (!hasSession) return null;

  const activeFamily = familyOf(families, current);
  const activeVariant = variantOf(families, current);
  const active = models.find((m) => m.id === current);
  const label = activeFamily?.label ?? active?.name ?? current ?? t("composer.defaultModel");
  const effortName = (e: Effort | null) => (e ? t(`effort.${e}` as "effort.low") : t("composer.default"));

  const pick = (family: ModelFamily) => {
    onModel(pickVariant(family, activeVariant?.effort ?? null, defaultModel).id);
    setModelOpen(false);
  };

  return (
    <>
      <Popover open={modelOpen} onOpenChange={setModelOpen}>
        <PopoverTrigger asChild>
          <Chip title={t("composer.model")}>
            <ProviderIcon provider={provider} className="size-3.5 shrink-0" />
            <span className="max-w-44 truncate text-foreground/80">{label}</span>
            <ChevronDown className="size-3 shrink-0 opacity-50" />
          </Chip>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-64 p-1.5">
          {models.length === 0 ? (
            <p className="px-2 py-2 text-fine leading-relaxed text-muted-foreground">
              {t("composer.noModels")}
            </p>
          ) : (
            <>
              <MenuSection>{t("composer.model")}</MenuSection>
              <ScrollArea className="max-h-80">
                {families.map((f) => (
                  <MenuRow
                    key={f.key}
                    selected={f === activeFamily}
                    isDefault={f.variants.some((v) => v.choice.id === defaultModel)}
                    label={f.label}
                    detail={f.variants[0]?.choice.description}
                    onClick={() => pick(f)}
                  />
                ))}
              </ScrollArea>
            </>
          )}
        </PopoverContent>
      </Popover>

      {activeFamily && activeFamily.variants.length > 1 && (
        <Popover open={effortOpen} onOpenChange={setEffortOpen}>
          <PopoverTrigger asChild>
            <Chip title={t("composer.reasoning")}>
              <span>{effortName(activeVariant?.effort ?? null)}</span>
              <ChevronDown className="size-3 shrink-0 opacity-50" />
            </Chip>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="w-44 p-1.5">
            <MenuSection>{t("composer.reasoning")}</MenuSection>
            {activeFamily.variants.map((v) => (
              <MenuRow
                key={v.choice.id}
                selected={v.choice.id === current}
                isDefault={v.choice.id === defaultModel}
                label={effortName(v.effort)}
                onClick={() => {
                  onModel(v.choice.id);
                  setEffortOpen(false);
                }}
              />
            ))}
          </PopoverContent>
        </Popover>
      )}
    </>
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
  defaultModel,
  onModel,
  running,
  docEmpty,
  onRun,
  onStop,
  onAttachFile,
  onInsertSkill,
  onInsertIssue,
  onOpenMarket,
  onVoiceText,
  runHint,
  skillHint,
  filesHint,
}: ComposerProps) {
  const t = useT();
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={t("composer.add")}>
            <Plus className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-60">
          <DropdownMenuItem onSelect={onAttachFile}>
            <FileText />
            {t("composer.mentionFile")}
            {filesHint && <DropdownMenuShortcut>{filesHint}</DropdownMenuShortcut>}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onInsertSkill}>
            <Sparkles />
            {t("composer.insertSkill")}
            {skillHint && <DropdownMenuShortcut>{skillHint}</DropdownMenuShortcut>}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onInsertIssue}>
            <Ticket />
            {t("composer.pullIssue")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenMarket}>
            <Store />
            {t("composer.market")}
          </DropdownMenuItem>
          <p className="px-2 pb-1 pt-1.5 text-fine leading-relaxed text-muted-foreground">
            {t("composer.addHint")}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Workspace, mode, provider and model read as a sentence about what this turn will do — and
          each one opens only itself. */}
      <WorkspacePicker config={config} />

      <ModePicker config={config} />

      <ProviderPicker config={config} />

      <ModelPicker
        models={models}
        current={currentModel}
        defaultModel={defaultModel}
        provider={config.provider}
        onModel={onModel}
        hasSession={config.hasSession}
      />

      {/* A boolean needs no view to choose from: the chip *is* the control. */}
      <Chip
        title={t("config.planFirstHint")}
        aria-pressed={config.planMode}
        className={cn(config.planMode && "text-primary hover:text-primary")}
        onClick={() => config.onPlan(!config.planMode)}
      >
        <ListChecks className="size-3.5 shrink-0" />
        {t("config.planFirst")}
      </Chip>

      <div className="flex-1" />

      <VoiceButton onText={onVoiceText} />

      {/* Enter makes a paragraph in a document, so the send chord has to be taught rather than
          assumed. It shows only while the document is empty, and so retires itself. */}
      {docEmpty && !running && runHint && (
        <span className="mx-1 shrink-0 whitespace-nowrap text-fine text-muted-foreground">
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
        // min-w-0: in document mode the composer sits in a row beside the transcript panel and
        // must be able to shrink, or the panel gets pushed off the module's edge.
        docMode ? "min-h-0 min-w-0 flex-1" : "shrink-0 px-4 pb-3.5 pt-1",
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
              : "glass-raised rounded-2xl shadow-lg ring-1 ring-foreground/10 transition-[box-shadow] duration-200 focus-within:shadow-xl focus-within:ring-ring/40",
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
          <div>
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
