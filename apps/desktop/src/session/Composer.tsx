import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  ArrowUp,
  BrainCircuit,
  ChevronDown,
  FileText,
  Gauge,
  GitBranch,
  ListChecks,
  Lock,
  LockOpen,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  PenLine,
  Sparkles,
  Square,
  Store,
  Ticket,
} from "lucide-react";

import type { SessionConfig } from "./config";
import { SESSION_MODES, sessionMode } from "./mode";
import { familyOf, groupModels, pickVariant, variantOf, type Effort } from "./models";
import { ProviderIcon } from "../providers/ProviderIcon";
import { VoiceButton } from "../voice/VoiceButton";
import type { ConfigOptionInfo, ModelChoice } from "../bridge";
import {
  describeContextWindow,
  formatExactContextTokens,
  formatContextWindowPercentage,
  type ContextWindow,
} from "./contextWindow";
import { Button } from "@/components/ui/button";
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
  /** The "Current checkout" bar under the card — where the next turn runs, and its branch. */
  checkout?: {
    project: string | null;
    branch: string | null;
    dirty: number;
    onOpen: () => void;
  } | null;
  /** Empty-thread centre stage: the card narrows to the reference's hero measure. */
  hero?: boolean;
  /** Full-page authoring: the document takes the whole column and the transcript steps aside. */
  docMode: boolean;
  /** Work keeps the same editor and controls, but presents them as the reference chat composer. */
  workMode?: boolean;
  onDocMode: (v: boolean) => void;
  /** Height of the document area in compact mode, in px — dragged by the grip, persisted. */
  height: number;
  onHeight: (n: number) => void;
  /** The column the composer lives in; bounds the drag so it can't swallow the transcript. */
  boundsRef: React.MutableRefObject<HTMLElement | null>;
  /** What the agent reported it can run. Empty until a session exists, or if it reports none. */
  models: ModelChoice[];
  currentModel: string | null;
  /** The current session's authoritative provider context usage/capacity, if reported. */
  contextWindow: ContextWindow | null;
  /** The adapter's own pick at session/new — worth a "Default" badge in the menus. */
  defaultModel: string | null;
  onModel: (id: string) => void;
  /** Selectors the agent reported as session config options — model and reasoning effort. */
  configOptions: ConfigOptionInfo[];
  onConfigOption: (configId: string, value: string) => void;
  running: boolean;
  /** Session summary is visible while its transcript detail is still loading; sending is gated. */
  loading: boolean;
  docEmpty: boolean;
  onRun: () => void;
  onStop: () => void;
  onAttachFile: () => void;
  onInsertSkill: () => void;
  onInsertIssue: () => void;
  onOpenMarket: () => void;
  onNewSkill: () => void;
  canvasEnabled: boolean;
  onInsertCanvas: () => void;
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
        "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-hint transition-colors hover:bg-accent/50",
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
  disabled = false,
}: {
  selected: boolean;
  isDefault: boolean;
  label: string;
  detail?: string | null;
  /** Optional marker before the label — the provider list's availability dot. */
  leading?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui transition-colors",
        selected ? "bg-accent" : "hover:bg-accent/50",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
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

/** One row of a picker menu, normalized so the two data sources below render identically. */
interface PickerRow {
  key: string;
  label: string;
  detail?: string | null;
  isDefault: boolean;
  selected: boolean;
  select: () => void;
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

  useEffect(() => {
    if (config.modeChangeDisabled) setOpen(false);
  }, [config.modeChangeDisabled]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip
          tone={active === "full_access" ? "warning" : undefined}
          title={t("config.mode")}
          disabled={config.modeChangeDisabled}
          aria-busy={config.modeChangeDisabled}
          className={cn(config.modeChangeDisabled && "cursor-wait opacity-60 hover:bg-transparent")}
        >
          {active === "full_access" ? (
            <LockOpen className="size-3 shrink-0" />
          ) : (
            <Lock className="size-3 shrink-0" />
          )}
          {/* Narrow, the lock alone carries the meaning — the label is spelt out in the menu. */}
          <span className="hidden @lg/composer:inline">{t(`mode.${active}` as "mode.ask")}</span>
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
            disabled={config.modeChangeDisabled}
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

const MEMORY_PRESETS = [
  { id: "standard", read: "inherit", write: "inherit" },
  { id: "read_only", read: "allow", write: "deny" },
  { id: "private", read: "deny", write: "deny" },
  { id: "learn_only", read: "deny", write: "allow" },
] as const;

function MemoryPicker({ config }: { config: SessionConfig }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const active =
    MEMORY_PRESETS.find(
      (preset) => preset.read === config.memoryRead && preset.write === config.memoryWrite,
    ) ?? MEMORY_PRESETS[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip
          title={t("config.memory")}
          aria-label={`${t("config.memory")}: ${t(`memory.preset.${active.id}` as "memory.preset.standard")}`}
        >
          <BrainCircuit className="size-3.5 shrink-0" />
          <span className="hidden @xl/composer:inline">
            {t(`memory.preset.${active.id}` as "memory.preset.standard")}
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </Chip>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72 p-1.5">
        <MenuSection>{t("config.memory")}</MenuSection>
        {MEMORY_PRESETS.map((preset) => (
          <MenuRow
            key={preset.id}
            selected={preset.id === active.id}
            isDefault={preset.id === "standard"}
            label={t(`memory.preset.${preset.id}` as "memory.preset.standard")}
            detail={t(`memory.preset.${preset.id}Hint` as "memory.preset.standardHint")}
            onClick={() => {
              config.onMemoryPolicy(preset.read, preset.write);
              setOpen(false);
            }}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

const WORKTREE_BASELINES = ["current", "origin_default"] as const;

/** Worktree isolation is a baseline choice, not a boolean: both commit sources stay explicit. */
function WorktreePicker({ config }: { config: SessionConfig }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const selectedKind = config.hasSession
    ? config.activeWorktreeBaseline?.kind ?? null
    : config.worktreeBase;
  const selected =
    selectedKind == null
      ? null
      : config.worktreeOptions.find((option) => option.kind === selectedKind);
  const selectedUnavailable =
    !config.hasSession &&
    selectedKind != null &&
    !config.worktreeOptionsLoading &&
    selected?.resolved == null;
  const compactLabel = config.activeWorktreeUnknown
    ? t("worktree.legacyUnknown")
    : config.hasSession && config.activeWorktreeBaseline
      ? config.activeWorktreeBaseline.display
      : selectedKind == null
        ? t("worktree.off")
        : t(`worktree.${selectedKind}` as "worktree.current");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip
          tone={selectedUnavailable ? "warning" : undefined}
          title={t("config.worktreeHint")}
          aria-expanded={open}
          className={cn(
            selectedKind != null && !selectedUnavailable && "text-primary hover:text-primary",
          )}
        >
          <GitBranch className="size-3.5 shrink-0" />
          <span className="hidden max-w-36 truncate @lg/composer:inline">{compactLabel}</span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </Chip>
      </PopoverTrigger>
      <PopoverContent align="center" side="top" className="w-80 p-1.5">
        <MenuSection>{t("config.worktree")}</MenuSection>
        {config.hasSession ? (
          <>
            <MenuRow
              selected
              isDefault={false}
              label={
                config.activeWorktreeUnknown
                  ? t("worktree.legacyUnknown")
                  : selectedKind == null
                    ? t("worktree.off")
                    : t(`worktree.${selectedKind}` as "worktree.current")
              }
              detail={
                config.activeWorktreeUnknown
                  ? t("worktree.legacyUnknownHint")
                  : config.activeWorktreeBaseline?.display ?? t("worktree.offHint")
              }
              disabled
              onClick={() => {}}
            />
            <p className="px-2.5 pb-1 pt-2 text-fine leading-relaxed text-muted-foreground">
              {t("worktree.fixedForSession")}
            </p>
          </>
        ) : (
          <>
            <MenuRow
              selected={config.worktreeBase == null}
              isDefault={false}
              label={t("worktree.off")}
              detail={t("worktree.offHint")}
              onClick={() => {
                config.onWorktreeBase(null);
                setOpen(false);
              }}
            />
            {WORKTREE_BASELINES.map((kind) => {
              const option = config.worktreeOptions.find((candidate) => candidate.kind === kind);
              const unavailable = !config.worktreeOptionsLoading && option?.resolved == null;
              const detail = config.worktreeOptionsLoading
                ? t("worktree.resolving")
                : option?.resolved
                  ? `${option.resolved.display} · ${t("worktree.localOnly")}`
                  : option?.unavailable_reason || t("worktree.unavailable");
              return (
                <MenuRow
                  key={kind}
                  selected={config.worktreeBase === kind}
                  isDefault={false}
                  label={t(`worktree.${kind}` as "worktree.current")}
                  detail={detail}
                  disabled={unavailable}
                  onClick={() => {
                    config.onWorktreeBase(kind);
                    setOpen(false);
                  }}
                />
              );
            })}
          </>
        )}
        <p className="px-2.5 pb-1 pt-2 text-fine leading-relaxed text-muted-foreground">
          {t("worktree.noFetch")}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function ProviderPicker({ config }: { config: SessionConfig }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = config.providers.find((p) => p.id === config.provider);

  useEffect(() => {
    const openProviderPicker = () => {
      setOpen(true);
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    };
    window.addEventListener("codetwo-open-provider-picker", openProviderPicker);
    return () => window.removeEventListener("codetwo-open-provider-picker", openProviderPicker);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* The provider also reads in the sidebar footer; squeezed, this chip is the detail to
            shed first. @3xl, not narrower: the full row runs ~730px, so anything under that must
            already have let this go — including the 680px hero card, which keeps the "⌘⏎ to
            send" hint (worth more to a first run than a name the sidebar already shows). */}
        <Chip ref={triggerRef} title={t("config.provider")} className="hidden @3xl/composer:flex">
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
              <>
                <span
                  className={cn("size-1.5 shrink-0 rounded-full", p.available ? "bg-success" : "bg-border")}
                />
                {/* The brand mark; dimmed when the CLI isn't installed, like the row's text. */}
                <ProviderIcon
                  provider={p.id}
                  className={cn("size-3.5 shrink-0", !p.available && "opacity-40")}
                />
              </>
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

function ContextWindowStatus({ value }: { value: ContextWindow | null }) {
  const t = useT();
  const display = describeContextWindow(value);
  if (!value || !display) return null;
  const exact = t("composer.contextWindowExact", {
    used: formatExactContextTokens(value.usedTokens),
    capacity: formatExactContextTokens(value.contextWindow),
    percentage: formatContextWindowPercentage(value),
  });
  const warning = display.percentage !== null && display.percentage >= 80;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="meter"
          aria-valuemin={0}
          aria-valuemax={value.contextWindow}
          aria-valuenow={Math.min(value.usedTokens, value.contextWindow)}
          aria-valuetext={exact}
          aria-label={exact}
          title={exact}
          className={cn(
            "flex shrink-0 items-center gap-1 px-0 py-1 text-hint @lg/composer:px-1.5",
            warning ? "text-warning" : "text-muted-foreground",
          )}
        >
          <Gauge className="hidden size-3.5 shrink-0 @lg/composer:inline" aria-hidden="true" />
          <span className="hidden @lg/composer:inline" aria-hidden="true">
            {display.compact}
          </span>
          <span className="@lg/composer:hidden" aria-hidden="true">
            {display.capacity}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{exact}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The model this turn will run on: a model chip, and an effort chip when the model comes in
 * reasoning variants.
 *
 * Agents describe this two different ways, so the picker reads both and renders one menu.
 *
 * Newer adapters (claude-agent-acp, codex-acp) report *selectors* as session config options — a
 * "model" one and a "thought_level" one — and those are taken at face value: no parsing, and
 * effort is independent of the model, which is the only way it works for Claude Code.
 *
 * Older adapters report a flat model list instead, and encode effort by minting one entry per
 * level ("gpt-5.1-codex low/medium/high"). `groupModels` folds those back into families: the first
 * chip picks the family, the second the effort, and together they resolve to one of the adapter's
 * own ids.
 *
 * Both APIs are optional and many adapters skip both, in which case the flat list is the core's
 * built-in one for that provider rather than the agent's own — same shape either way. Only a
 * provider we have no list for (a custom one) falls through to the note explaining that its CLI
 * config decides. Provider metadata keeps the picker available on a blank draft; after the session
 * starts, adapter-reported options replace that pre-session fallback.
 */
function ModelPicker({
  models,
  current,
  defaultModel,
  provider,
  onModel,
  configOptions,
  onConfigOption,
  hasSession,
}: {
  models: ModelChoice[];
  current: string | null;
  defaultModel: string | null;
  provider: string;
  onModel: (id: string) => void;
  configOptions: ConfigOptionInfo[];
  onConfigOption: (configId: string, value: string) => void;
  hasSession: boolean;
}) {
  const t = useT();
  const [modelOpen, setModelOpen] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const families = useMemo(() => groupModels(models), [models]);
  // Provider metadata supplies an honest pre-session list. A selected draft model is stored on
  // NewSession and reconciled against the adapter immediately after ACP session/new, so the first
  // Work Run is configurable instead of forcing an invisible provider default.
  if (!modelPickerAvailable(hasSession, models)) return null;

  const effortName = (e: Effort | null) => (e ? t(`effort.${e}` as "effort.low") : t("composer.default"));

  const modelOpt = configOptions.find((o) => o.category === "model" || o.id === "model");
  const effortOpt = configOptions.find(
    (o) => o.category === "thought_level" || o.id === "effort" || o.id === "reasoning_effort",
  );

  let modelLabel: string;
  let modelRows: PickerRow[];
  let effortLabel = "";
  let effortRows: PickerRow[] = [];

  if (modelOpt) {
    // The adapter described its own selectors; show them as described.
    modelLabel =
      modelOpt.choices.find((c) => c.id === modelOpt.current)?.name ||
      modelOpt.current ||
      t("composer.defaultModel");
    modelRows = modelOpt.choices.map((c) => ({
      key: c.id,
      label: c.name,
      detail: c.description,
      isDefault: c.id === defaultModel,
      selected: c.id === modelOpt.current,
      select: () => onConfigOption(modelOpt.id, c.id),
    }));
    if (effortOpt) {
      effortLabel = effortOpt.choices.find((c) => c.id === effortOpt.current)?.name || effortOpt.current;
      effortRows = effortOpt.choices.map((c) => ({
        key: c.id,
        label: c.name,
        detail: c.description,
        isDefault: false,
        selected: c.id === effortOpt.current,
        select: () => onConfigOption(effortOpt.id, c.id),
      }));
    }
  } else {
    // Flat list: regroup by the effort suffix parsed out of each name.
    const activeFamily = familyOf(families, current);
    const activeVariant = variantOf(families, current);
    const active = models.find((m) => m.id === current);
    modelLabel = activeFamily?.label ?? active?.name ?? current ?? t("composer.defaultModel");
    modelRows = families.map((f) => ({
      key: f.key,
      label: f.label,
      detail: f.variants[0]?.choice.description,
      isDefault: f.variants.some((v) => v.choice.id === defaultModel),
      selected: f === activeFamily,
      select: () => onModel(pickVariant(f, activeVariant?.effort ?? null, defaultModel).id),
    }));
    if (activeFamily) {
      effortLabel = effortName(activeVariant?.effort ?? null);
      effortRows = activeFamily.variants.map((v) => ({
        key: v.choice.id,
        label: effortName(v.effort),
        isDefault: v.choice.id === defaultModel,
        selected: v.choice.id === current,
        select: () => onModel(v.choice.id),
      }));
    }
  }

  return (
    <>
      <Popover open={modelOpen} onOpenChange={setModelOpen}>
        <PopoverTrigger asChild>
          <Chip title={t("composer.model")}>
            <ProviderIcon provider={provider} className="size-3.5 shrink-0" />
            <span className="max-w-28 truncate text-foreground/80 @lg/composer:max-w-44">
              {modelLabel}
            </span>
            <ChevronDown className="size-3 shrink-0 opacity-50" />
          </Chip>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-64 p-1.5">
          {modelRows.length === 0 ? (
            <p className="px-2 py-2 text-fine leading-relaxed text-muted-foreground">
              {t("composer.noModels")}
            </p>
          ) : (
            <>
              <MenuSection>{t("composer.model")}</MenuSection>
              <ScrollArea className="max-h-80">
                {modelRows.map((r) => (
                  <MenuRow
                    key={r.key}
                    selected={r.selected}
                    isDefault={r.isDefault}
                    label={r.label}
                    detail={r.detail}
                    onClick={() => {
                      r.select();
                      setModelOpen(false);
                    }}
                  />
                ))}
              </ScrollArea>
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* Only worth a chip when there's an actual choice to make. */}
      {effortRows.length > 1 && (
        <Popover open={effortOpen} onOpenChange={setEffortOpen}>
          <PopoverTrigger asChild>
            <Chip title={t("composer.reasoning")}>
              <span>{effortLabel}</span>
              <ChevronDown className="size-3 shrink-0 opacity-50" />
            </Chip>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="w-44 p-1.5">
            <MenuSection>{t("composer.reasoning")}</MenuSection>
            {effortRows.map((r) => (
              <MenuRow
                key={r.key}
                selected={r.selected}
                isDefault={r.isDefault}
                label={r.label}
                detail={r.detail}
                onClick={() => {
                  r.select();
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

export function modelPickerAvailable(hasSession: boolean, models: readonly ModelChoice[]): boolean {
  return hasSession || models.length > 0;
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
  checkout,
  hero,
  docMode,
  workMode = false,
  onDocMode,
  height,
  onHeight,
  boundsRef,
  models,
  currentModel,
  defaultModel,
  contextWindow,
  onModel,
  configOptions,
  onConfigOption,
  running,
  loading,
  docEmpty,
  onRun,
  onStop,
  onAttachFile,
  onInsertSkill,
  onInsertIssue,
  onOpenMarket,
  onNewSkill,
  canvasEnabled,
  onInsertCanvas,
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

  const addControl = (
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
          {canvasEnabled && (
            <DropdownMenuItem onSelect={onInsertCanvas}>
              <PenLine />
              {t("composer.insertCanvas")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onInsertIssue}>
            <Ticket />
            {t("composer.pullIssue")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenMarket}>
            <Store />
            {t("composer.market")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onNewSkill}>
            <Sparkles />
            {t("composer.newSkill")}
          </DropdownMenuItem>
          <p className="px-2 pb-1 pt-1.5 text-fine leading-relaxed text-muted-foreground">
            {t("composer.addHint")}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
  );

  const runControl = running ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="destructive"
          size={workMode ? "sm" : "icon"}
          className={cn(
            "shrink-0 transition-transform active:scale-95",
            workMode ? "h-(--ds-control-field) rounded-(--ds-radius-control) px-3" : "size-8 rounded-full",
          )}
          onClick={onStop}
          aria-label={t("composer.stop")}
        >
          {workMode ? <><span>Stop</span><Square className="size-3 fill-current" /></> : <Square className="size-3.5 fill-current" />}
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
          size={workMode ? "sm" : "icon"}
          variant={docEmpty ? "secondary" : "default"}
          className={cn(
            "shrink-0 transition-transform active:scale-95",
            workMode ? "h-(--ds-control-field) gap-2 rounded-(--ds-radius-control) px-3" : "size-8 rounded-full",
          )}
          onClick={onRun}
          disabled={loading}
          aria-label={loading ? t("composer.loadingSession") : t("composer.run")}
        >
          {workMode && <span>{loading ? "Loading" : "Send"}</span>}
          {loading && !workMode ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {loading ? t("composer.loadingSession") : docEmpty ? t("composer.runEmpty") : t("composer.run")}
        {!loading && <span className="ml-1.5 opacity-60">{runHint}</span>}
      </TooltipContent>
    </Tooltip>
  );

  const controls = (
    <>
      {!workMode && addControl}

      {/* Provider, model, effort, then access — cause before effect: the provider decides which
          models exist, the model decides which efforts exist, and access frames the run. Each
          chip opens only itself. */}
      <ProviderPicker config={config} />

      <ModelPicker
        models={models}
        current={currentModel}
        defaultModel={defaultModel}
        provider={config.provider}
        onModel={onModel}
        configOptions={configOptions}
        onConfigOption={onConfigOption}
        hasSession={config.hasSession}
      />

      <ContextWindowStatus value={contextWindow} />

      <ModePicker config={config} />

      <MemoryPicker config={config} />

      {/* A boolean needs no view to choose from: the chip *is* the control. */}
      <Chip
        title={t("config.planFirstHint")}
        aria-pressed={config.planMode}
        className={cn(config.planMode && "text-primary hover:text-primary")}
        onClick={() => config.onPlan(!config.planMode)}
      >
        <ListChecks className="size-3.5 shrink-0" />
        <span className="hidden @lg/composer:inline">{t("config.planFirst")}</span>
      </Chip>

      <WorktreePicker config={config} />

      <div className="flex-1" />

      {/* Document mode is the app's own feature — it deserves a control you can see, not just a
          chord and a grip gesture. */}
      {!workMode && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground"
              aria-label={docMode ? t("composer.collapseLabel") : t("composer.expandLabel")}
              onClick={() => onDocMode(!docMode)}
            >
              {docMode ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{docMode ? t("composer.collapse") : t("composer.expand")}</TooltipContent>
        </Tooltip>
      )}

      <VoiceButton onText={onVoiceText} />

      {/* Enter makes a paragraph in a document, so the send chord has to be taught rather than
          assumed. It shows only while the document is empty, and so retires itself. */}
      {docEmpty && !running && !loading && runHint && (
        <span className="mx-1 hidden shrink-0 whitespace-nowrap text-fine text-muted-foreground @2xl/composer:inline">
          {t("composer.toSend", { key: runHint })}
        </span>
      )}

      {!workMode && runControl}
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
        docMode ? "min-h-0 min-w-0 flex-1" : cn("shrink-0 px-4", workMode ? "pb-5 pt-2" : "pb-3.5 pt-1"),
      )}
    >
      <div
        className={cn(
          // The width container the control row compresses against (see the chip labels below):
          // in compact mode this is the card's own measure, expanded it's the page column — either
          // way, the width the controls actually have.
          "@container/composer flex flex-col",
          docMode
            ? "min-h-0 flex-1"
            : cn("mx-auto w-full", workMode ? "work-measure" : hero ? "max-w-[680px]" : "max-w-[860px]"),
        )}
      >
        {/* No `overflow-hidden`: BlockNote's drag/insert handles render just outside the text
            column, and clipping them takes the block gutter away. */}
        <div
          className={cn(
            "composer-card flex flex-col",
            workMode && "work-chat-composer",
            docMode
              ? // Expanded, the composer *is* the page: no card, no border, the app's own surface.
                // `relative` anchors the floating control bar below.
                "relative min-h-0 flex-1"
              : workMode
                ? "border bg-card"
                : // A plain white card on a plain page, T3-style: border + a soft shadow, and the
                  // ring only wakes up when the caret is inside.
                  "rounded-2xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_16px_rgb(0_0_0/0.04)] transition-[box-shadow,border-color] duration-200 focus-within:border-ring/40 focus-within:shadow-[0_1px_2px_rgb(0_0_0/0.05),0_8px_28px_rgb(0_0_0/0.07)]",
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

          {workMode && (
            <div className="work-composer-context flex h-(--ds-control-field) items-center gap-2 px-3.5 text-hint text-muted-foreground">
              {addControl}
              <span>Add context</span>
            </div>
          )}

          <div
            className={cn(
              "min-h-0 overflow-y-auto",
              docMode ? "bn-doc-mode flex-1" : workMode ? "work-composer-editor py-0" : "py-1",
            )}
            style={docMode ? undefined : { maxHeight: applied }}
          >
            {children}
          </div>

          {workMode && (
            <div className="work-composer-primary flex items-center justify-end gap-2 px-3.5 pb-2">
              {runHint && <kbd className="rounded border bg-muted/30 px-1.5 py-0.5 text-cap text-muted-foreground">{runHint}</kbd>}
              {runControl}
            </div>
          )}

          {/* Expanded, the control row *floats* over the foot of the page as its own raised card.
              In normal flow it sat at the column's bottom edge, where the transcript panel beside
              the page ended up over the run button and swallowed its clicks; floating on its own
              z-plane keeps every control clickable no matter what the layout around the page does.
              Sized to its content (`w-fit`), not the column: a page squeezed by the panel would
              otherwise cap the card while the non-wrapping controls spill out of it — grown to fit,
              the card carries its own surface over the panel instead of leaking naked buttons.
              `pointer-events-none` on the strip, `auto` on the card: the page stays clickable
              either side of the floating bar. */}
          <div className={cn(docMode && "pointer-events-none absolute inset-x-0 bottom-5 z-20 px-6")}>
            <div
              className={cn(
                "flex items-center gap-0.5",
                docMode
                  ? // `w-max`, not `w-fit`: fit-content clamps to the column, and a clamped box
                    // lets the send button spill outside the card. Max-content always wraps every
                    // control — worst case the card floats a little over whatever sits beside it,
                    // which its own z-plane makes safe.
                    "glass-raised pointer-events-auto mx-auto w-max rounded-2xl border px-3 py-2 shadow-raised"
                  : cn("px-2 pb-1.5 pt-1", workMode && "work-composer-controls work-divider-top mx-3 px-0 pb-1.5 pt-1.5"),
              )}
            >
              {controls}
            </div>
          </div>
        </div>

        {/* "Current checkout" — where this document will run, and the branch it lands on. One
            click through to source control. Compact mode only: expanded, the page is the page. */}
        {!docMode && checkout && (
          <button
            onClick={checkout.onOpen}
            className="mt-2 flex h-8 items-center gap-1.5 rounded-lg border bg-muted/30 px-3 text-hint text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {/* Squeezed, the row keeps what identifies the checkout (project, dirty count) and
                sheds the caption and branch name — both one click away. */}
            <span className="hidden shrink-0 @md/composer:inline">{t("composer.currentCheckout")}</span>
            <ChevronDown className="size-3 shrink-0 opacity-50" />
            <span className="min-w-0 flex-1 truncate text-left">{checkout.project}</span>
            {checkout.branch && (
              <span className="flex shrink-0 items-center gap-1 font-mono text-fine">
                <GitBranch className="size-3" />
                <span className="hidden max-w-40 truncate @lg/composer:inline">{checkout.branch}</span>
                {checkout.dirty > 0 && <span className="text-warning">•{checkout.dirty}</span>}
              </span>
            )}
          </button>
        )}
      </div>
    </section>
  );
}
