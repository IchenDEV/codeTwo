import { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type MutableRefObject, type ReactNode } from "react";
import {
  ArrowUp,
  BrainCircuit,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  GitBranch,
  ImagePlus,
  ListChecks,
  Lock,
  LockOpen,
  Maximize2,
  Minimize2,
  Plus,
  PenLine,
  Sparkles,
  Square,
  Store,
  Target,
  Ticket,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";

import type { SessionConfig } from "./config";
import type { SceneInfo } from "./scene";
import { briefOfferVisible } from "../editor/slotCard";
import { SceneChip } from "./SceneChip";
import { SESSION_MODES, sessionMode } from "./mode";
import { worktreeGatingReason } from "./sessionEvents";
import { familyOf, groupModels, pickVariant, variantOf, type Effort } from "./models";
import { ProviderIcon } from "../providers/ProviderIcon";
import { VoiceButton } from "../voice/VoiceButton";
import {
  fallbackProviders,
  providerDisplayName,
  type ConfigOptionInfo,
  type AppshotCapture,
  type GoalCapabilityInfo,
  type GoalSnapshot,
  type ModelChoice,
} from "../bridge";
import type { ContextWindow } from "./contextWindow";
// Explicit extension: this directory also contains the case-colliding `statusline.ts` helper.
import { Statusline, type StatuslineUsage } from "./Statusline.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActivityOrb } from "@/components/ui/activity-orb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";
import "@/components/ui/reasoning-selector.css";

interface ComposerProps {
  /** The document editor itself. The composer only owns the frame around it. */
  children: ReactNode;
  config: SessionConfig;
  /** The checkout bar under the card: execution location on the left, source control on the right. */
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
  /** Per-session cost/burn for the statusline; null until the core's usage command exists. */
  usage?: StatuslineUsage | null;
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
  appshots?: AppshotCapture[];
  onRemoveAppshot?: (id: string) => void;
  onRun: () => void;
  onQueue: () => void;
  onSteer: () => void;
  onStop: () => void;
  steeringSupported: boolean;
  goalCapability: GoalCapabilityInfo | null;
  goal: GoalSnapshot | null;
  onGoal: (action: "set" | "pause" | "resume" | "clear", objective?: string) => Promise<void>;
  onAttachFile: () => void;
  onAttachImages: (files: readonly File[]) => void | Promise<void>;
  onInsertSkill: () => void;
  onInsertIssue: () => void;
  onOpenMarket: () => void;
  onNewSkill: () => void;
  canvasEnabled: boolean;
  onInsertCanvas: () => void;
  /** Component-policy gate; false means the voice plugin may already be unloaded. */
  voiceEnabled: boolean;
  onVoiceText: (text: string) => void;
  /** R11: present only when the active scene has a brief — voice then structures into it. */
  onVoiceTranscript?: (full: string) => Promise<void>;
  runHint: string;
  skillHint: string;
  filesHint: string;
  /** Host-rendered declarative plugin actions in the compact control row. */
  pluginActions?: ReactNode;
  /** Keys the per-session brief-offer dismissal; null while no session exists yet. */
  sessionId?: string | null;
  /** Editor-owned seam that inserts the active scene's brief as a slot card (R5). */
  insertBriefRef?: MutableRefObject<((scene: SceneInfo, values?: Record<string, string>) => void) | null>;
}

function displayGitRef(reference: string | null | undefined): string | null {
  if (!reference) return null;
  return reference
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\//, "");
}

function CheckoutOptionRow({
  selected,
  label,
  accessibleLabel,
  status,
  detail,
  disabled = false,
  onClick,
}: {
  selected: boolean;
  label: string;
  accessibleLabel: string;
  status: string;
  detail: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const detailId = useId();
  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      aria-describedby={detailId}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      title={detail}
      className={cn(
        "flex h-(--ds-control-field) w-full items-center gap-3 rounded-(--ds-radius-control) px-2.5 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring",
        selected ? "bg-foreground/[0.06] text-foreground" : "hover:bg-accent/50",
        disabled && !selected && "cursor-not-allowed opacity-50 hover:bg-transparent",
        disabled && selected && "cursor-default",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-ui">{label}</span>
      <span className="shrink-0 text-fine text-muted-foreground">{status}</span>
      <span id={detailId} className="sr-only">{detail}</span>
    </button>
  );
}

/**
 * The persistent checkout control. It keeps execution location separate from source control, and
 * only presents baselines the engine can actually materialize.
 */
export function CheckoutBar({
  config,
  checkout,
}: {
  config: SessionConfig;
  checkout: NonNullable<ComposerProps["checkout"]>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const gatingReason = worktreeGatingReason(
    config.hasSession,
    config.worktreeOptions,
    config.worktreeOptionsLoading,
  );
  const selectedKind = config.hasSession
    ? config.activeWorktreeBaseline?.kind ?? null
    : config.worktreeBase;
  const selected = selectedKind == null
    ? null
    : config.worktreeOptions.find((option) => option.kind === selectedKind);
  const selectedRef = displayGitRef(
    config.hasSession
      ? config.activeWorktreeBaseline?.ref
      : selected?.resolved?.ref,
  );
  const modeLabel = config.activeWorktreeUnknown
    ? t("checkout.legacy")
    : selectedKind == null
      ? t("checkout.project")
      : config.hasSession
        ? t("checkout.sessionWorktree")
        : t("checkout.newWorktree");
  const projectDetail = checkout.branch
    ? checkout.dirty > 0
      ? t("checkout.branchDirty", { branch: checkout.branch, count: checkout.dirty })
      : t("checkout.branchClean", { branch: checkout.branch })
    : t("checkout.notRepository");
  const projectLabel = !checkout.project || checkout.project === "."
    ? t("rail.noProject")
    : checkout.project;

  useEffect(() => {
    if (!config.hasSession && gatingReason !== null && config.worktreeBase !== null) {
      config.onWorktreeBase(null);
    }
  }, [config.hasSession, config.onWorktreeBase, config.worktreeBase, gatingReason]);

  return (
    <div
      data-checkout-bar
      className="relative z-0 mx-5 mt-2 flex min-h-(--ds-control-field) min-w-0 items-center rounded-(--ds-radius-module) bg-muted/30 px-1 py-1 text-hint text-muted-foreground ring-[0.5px] ring-foreground/[0.07]"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<button
            type="button"
            className="flex h-(--ds-control-normal) min-w-0 shrink items-center gap-1.5 rounded-(--ds-radius-control) px-2 text-left outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            title={t("checkout.choose")}
            aria-label={`${t("checkout.title")}: ${modeLabel}`}
            aria-expanded={open}
          >
            <Folder className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate text-ui text-foreground/85">{modeLabel}</span>
            <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden="true" />
          </button>}
        />
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={10}
          className="w-80 max-w-(--available-width) p-1.5"
        >
          {config.hasSession ? (
            <>
              <CheckoutOptionRow
                selected
                disabled
                label={selectedRef ?? (selectedKind == null ? projectLabel : modeLabel)}
                accessibleLabel={modeLabel}
                status={t("checkout.currentBadge")}
                detail={config.activeWorktreeUnknown
                  ? t("worktree.legacyUnknownHint")
                  : config.activeWorktreeBaseline?.display ?? projectDetail}
                onClick={() => {}}
              />
              <p className="px-2.5 pb-1 pt-1.5 text-fine leading-relaxed text-muted-foreground">
                {t("worktree.fixedForSession")}
              </p>
            </>
          ) : (
            <>
              <CheckoutOptionRow
                selected={config.worktreeBase == null}
                label={projectLabel}
                accessibleLabel={t("checkout.project")}
                status={config.worktreeBase == null
                  ? t("checkout.currentBadge")
                  : t("checkout.projectBadge")}
                detail={projectDetail}
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
                  : option?.resolved?.display
                    ?? option?.unavailable_reason
                    ?? gatingReason
                    ?? t("worktree.unavailable");
                return (
                  <CheckoutOptionRow
                    key={kind}
                    selected={config.worktreeBase === kind}
                    disabled={unavailable}
                    label={displayGitRef(option?.resolved?.ref) ?? (kind === "current"
                      ? t("checkout.currentRef")
                      : t("checkout.originRef"))}
                    accessibleLabel={kind === "current"
                      ? t("checkout.currentRef")
                      : t("checkout.originRef")}
                    status={unavailable
                      ? t("checkout.unavailableBadge")
                      : config.worktreeBase === kind
                        ? t("checkout.currentBadge")
                        : t("checkout.worktreeBadge")}
                    detail={detail}
                    onClick={() => {
                      config.onWorktreeBase(kind);
                      setOpen(false);
                    }}
                  />
                );
              })}
            </>
          )}
        </PopoverContent>
      </Popover>

      {checkout.branch && (
        <button
          type="button"
          onClick={checkout.onOpen}
          className="ml-auto flex h-(--ds-control-normal) shrink-0 items-center gap-1.5 rounded-(--ds-radius-control) bg-foreground/[0.04] px-2.5 font-mono text-fine text-foreground/80 outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("checkout.openSourceControl", { branch: checkout.branch })}
          title={t("checkout.openSourceControl", { branch: checkout.branch })}
        >
          <GitBranch className="size-3" aria-hidden="true" />
          <span className="max-w-36 truncate">{checkout.branch}</span>
          {checkout.dirty > 0 && (
            <span className="text-warning" aria-label={t("checkout.changedFiles", { count: checkout.dirty })}>
              {checkout.dirty}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * A status chip in the control row — reads as text, behaves as a button. Forwards its ref so it can
 * be a Radix popover trigger.
 */
export const Chip = forwardRef<HTMLButtonElement, ComponentProps<"button"> & { tone?: "warning" }>(
  ({ children, tone, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 rounded-(--ds-radius-control) px-2 text-hint transition-colors hover:bg-accent/50",
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
    <span className="shrink-0 rounded-(--ds-radius-micro) border bg-muted/60 px-1.5 py-px text-cap text-muted-foreground">
      {t("composer.default")}
    </span>
  );
}

/** One selectable row of a picker menu: the current choice sits on a filled background. */
export function MenuRow({
  selected,
  isDefault,
  label,
  detail,
  leading,
  onClick,
  disabled = false,
  detailWrap = false,
}: {
  selected: boolean;
  isDefault: boolean;
  label: string;
  detail?: string | null;
  /** Optional marker before the label — the provider list's availability dot. */
  leading?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Scene summaries need enough room to explain the posture instead of ending in an ellipsis. */
  detailWrap?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui transition-colors",
        detailWrap ? "items-start" : "items-center",
        selected ? "bg-accent" : "hover:bg-accent/50",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {detail && (
          <span
            className={cn(
              "block text-fine text-muted-foreground",
              detailWrap ? "whitespace-normal leading-relaxed" : "truncate",
            )}
          >
            {detail}
          </span>
        )}
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

const REASONING_STEP_INSET = 26;
const COMPACT_REASONING_STEP_INSET = 16;

/** Provider-owned discrete effort choices presented through the reference's continuous slider. */
export function ReasoningScale({
  label,
  rows,
  onSelect,
  compact = false,
  disabled = false,
}: {
  label: string;
  rows: PickerRow[];
  onSelect: (row: PickerRow) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const selectedIndex = Math.max(0, rows.findIndex((row) => row.selected));
  const selected = rows[selectedIndex];
  const progress = rows.length > 1 ? selectedIndex / (rows.length - 1) : 0;
  const stepInset = compact ? COMPACT_REASONING_STEP_INSET : REASONING_STEP_INSET;
  const fillAdjustment = stepInset * (1 - 2 * progress);
  const fillWidth = `calc(${progress * 100}% + ${fillAdjustment}px)`;

  return (
    <div className={cn("reasoning-selector-scale", compact && "reasoning-selector-scale--compact")}>
      <div className="reasoning-selector-track" aria-hidden>
        <span className="reasoning-selector-fill" style={{ width: fillWidth }} />
        <span className="reasoning-selector-dots">
          {rows.map((row, index) => (
            <span
              key={row.key}
              className="reasoning-selector-dot"
              data-active={index <= selectedIndex}
            />
          ))}
        </span>
      </div>
      <input
        className="reasoning-selector-range"
        type="range"
        min={0}
        max={Math.max(0, rows.length - 1)}
        step={1}
        value={selectedIndex}
        aria-label={label}
        aria-valuetext={selected?.label}
        title={selected?.detail || selected?.label}
        autoFocus={!disabled}
        disabled={disabled}
        onInput={(event) => onSelect(rows[Number(event.currentTarget.value)])}
      />
    </div>
  );
}

/**
 * One chip, one question.
 *
 * These used to be a single popover holding provider, working directory, permissions and two
 * isolation toggles — a settings dashboard behind every chip in the row, so clicking "Auto-edit"
 * asked you about four other things first. Each control row chip now opens only its own list.
 */
export function ModePicker({ config }: { config: SessionConfig }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const active = sessionMode(config.mode, config.sandbox);

  useEffect(() => {
    if (config.modeChangeDisabled) setOpen(false);
  }, [config.modeChangeDisabled]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Chip
          tone={active === "full_access" ? "warning" : undefined}
          title={t("config.mode")}
          disabled={config.modeChangeDisabled}
          aria-busy={config.modeChangeDisabled}
          aria-label={`${t("config.mode")}: ${t(`mode.${active}` as "mode.ask")}`}
          className={cn(config.modeChangeDisabled && "cursor-wait opacity-60 hover:bg-transparent")}
        >
          {active === "full_access" ? (
            <LockOpen className="size-3 shrink-0" />
          ) : (
            <Lock className="size-3 shrink-0" />
          )}
          <span>{t(`mode.${active}` as "mode.ask")}</span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </Chip>}
      />
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

export function MemoryPicker({ config }: { config: SessionConfig }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const active =
    MEMORY_PRESETS.find(
      (preset) => preset.read === config.memoryRead && preset.write === config.memoryWrite,
    ) ?? MEMORY_PRESETS[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Chip
          title={t("config.memory")}
          aria-label={`${t("config.memory")}: ${t(`memory.preset.${active.id}` as "memory.preset.standard")}`}
        >
          <BrainCircuit className="size-3.5 shrink-0" />
          <span>{t(`memory.preset.${active.id}` as "memory.preset.standard")}</span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </Chip>}
      />
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

/** A provider-reported collaboration selector. Plan is never synthesized into prompt text. */
export function CollaborationModePicker({
  options,
  onChange,
}: {
  options: ConfigOptionInfo[];
  onChange: (configId: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const option = options.find(
    (candidate) =>
      candidate.category === "collaboration_mode" || candidate.id === "collaboration_mode",
  );
  if (!option || option.choices.length < 2) return null;
  const current = option.choices.find((choice) => choice.id === option.current);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Chip aria-label={`${option.name}: ${current?.name ?? option.current}`}>
          <ListChecks className="size-3.5 shrink-0" />
          <span>{current?.name ?? option.current}</span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </Chip>}
      />
      <PopoverContent align="center" side="top" className="w-64 p-1.5">
        <MenuSection>{option.name}</MenuSection>
        {option.choices.map((choice) => (
          <MenuRow
            key={choice.id}
            selected={choice.id === option.current}
            isDefault={false}
            label={choice.name}
            detail={choice.description}
            onClick={() => {
              onChange(option.id, choice.id);
              setOpen(false);
            }}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function GoalPicker({
  capability,
  goal,
  onGoal,
}: {
  capability: GoalCapabilityInfo | null;
  goal: GoalSnapshot | null;
  onGoal: (action: "set" | "pause" | "resume" | "clear", objective?: string) => Promise<void>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [objective, setObjective] = useState("");
  const [pending, setPending] = useState(false);
  if (!capability) return null;
  const run = async (action: "set" | "pause" | "resume" | "clear") => {
    setPending(true);
    try {
      await onGoal(action, action === "set" ? objective.trim() : undefined);
      if (action === "set") setObjective("");
    } finally {
      setPending(false);
    }
  };
  const can = (action: string) => capability.actions.includes(action);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Chip
          aria-label={goal ? `${t("goal.label")}: ${goal.objective}` : t("goal.label")}
          className={cn(goal && "text-primary hover:text-primary")}
        >
          <Target className="size-3.5 shrink-0" />
          <span className="max-w-32 truncate">{goal?.objective ?? t("goal.label")}</span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </Chip>}
      />
      <PopoverContent align="center" side="top" className="w-80 p-2">
        {goal ? (
          <div className="space-y-2">
            <div className="px-1">
              <p className="text-ui font-medium text-foreground">{goal.objective}</p>
              <p className="mt-0.5 text-fine text-muted-foreground">{t(`goal.status.${goal.status}` as "goal.status.active")}</p>
            </div>
            <div className="flex gap-1.5">
              {goal.status === "paused" && can("resume") ? (
                <Button size="sm" disabled={pending} onClick={() => void run("resume")}>{t("goal.resume")}</Button>
              ) : can("pause") ? (
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => void run("pause")}>{t("goal.pause")}</Button>
              ) : null}
              {can("clear") ? (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => void run("clear")}>{t("goal.clear")}</Button>
              ) : null}
            </div>
          </div>
        ) : can("set") ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (objective.trim()) void run("set");
            }}
          >
            <Input
              value={objective}
              onChange={(event) => setObjective(event.currentTarget.value)}
              placeholder={t("goal.placeholder")}
              aria-label={t("goal.objective")}
            />
            <Button type="submit" size="sm" disabled={pending || !objective.trim()}>{t("goal.start")}</Button>
          </form>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

const WORKTREE_BASELINES = ["current", "origin_default"] as const;

/** Worktree isolation is a baseline choice, not a boolean: both commit sources stay explicit. */
export function WorktreePicker({ config }: { config: SessionConfig }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // No git repository, no picker: every baseline is unavailable, so the trigger greys out with
  // the core's reason as its tooltip and the draft stays Off. Sessions are never gated — their
  // recorded worktree state renders regardless of what the current directory looks like.
  const gatingReason = worktreeGatingReason(
    config.hasSession,
    config.worktreeOptions,
    config.worktreeOptionsLoading,
  );
  useEffect(() => {
    // A project default (or a leftover draft choice) may still name a baseline; snap it back to
    // Off so the disabled trigger and the state creation would use never disagree.
    if (gatingReason !== null && config.worktreeBase !== null) config.onWorktreeBase(null);
  }, [gatingReason, config.worktreeBase, config.onWorktreeBase]);
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
      : selectedKind == null || gatingReason !== null
        ? t("worktree.off")
        : t(`worktree.${selectedKind}` as "worktree.current");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Chip
          tone={selectedUnavailable && gatingReason === null ? "warning" : undefined}
          title={gatingReason ?? t("config.worktreeHint")}
          aria-label={`${t("config.worktree")}: ${compactLabel}`}
          aria-expanded={open}
          disabled={gatingReason !== null}
          className={cn(
            selectedKind != null && !selectedUnavailable && "text-primary hover:text-primary",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
          )}
        >
          <GitBranch className="size-3.5 shrink-0" />
          <span className="max-w-36 truncate">{compactLabel}</span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </Chip>}
      />
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

export function ProviderPicker({ config }: { config: SessionConfig }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const registry = config.providers.length > 0 ? config.providers : fallbackProviders();
  // Disabled providers stop being new-session choices. Keep the active one visible so a resumed
  // session still identifies the runtime it already owns.
  const providers = registry.filter((candidate) => candidate.enabled !== false || candidate.id === config.provider);
  const active = providers.find((p) => p.id === config.provider);
  const activeLabel = active?.display_name ?? providerDisplayName(config.provider);
  const registryReady = config.providersStatus === "ready";

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
      <PopoverTrigger
        render={<Chip
          ref={triggerRef}
          title={config.providersStatus === "error" ? t("config.providersLoadFailed") : t("config.provider")}
          aria-label={`${t("config.provider")}: ${activeLabel}`}
          aria-busy={config.providersStatus === "loading"}
        >
          {registryReady && active && !active.available && (
            <span className="size-1.5 shrink-0 rounded-full bg-warning" title={t("composer.cliNotFound")} />
          )}
          <span className="max-w-40 truncate text-foreground/80">
            {activeLabel}
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </Chip>}
      />
      <PopoverContent align="start" side="top" className="w-64 p-1.5">
        <MenuSection>{t("config.provider")}</MenuSection>
        {config.providersStatus === "loading" && (
          <p role="status" className="px-2.5 pb-2 text-fine text-muted-foreground">
            {t("config.providersLoading")}
          </p>
        )}
        {config.providersStatus === "error" && (
          <div className="mb-1 flex items-center gap-2 rounded-(--ds-radius-control) bg-muted/60 px-2.5 py-2 text-fine">
            <span role="alert" className="min-w-0 flex-1 text-muted-foreground">
              {t("config.providersLoadFailed")}
            </span>
            <button
              type="button"
              className="shrink-0 font-medium text-foreground hover:underline"
              onClick={config.onReloadProviders}
            >
              {t("config.retryProviders")}
            </button>
          </div>
        )}
        {providers.map((p) => (
          <MenuRow
            key={p.id}
            selected={p.id === config.provider}
            isDefault={false}
            label={p.display_name}
            // The dot says installed; the line under it says what's missing, so the list itself
            // answers "why can't I use that one?" without a paragraph of warning text.
            detail={registryReady && !p.available
              ? p.enabled === false
                ? t("settings.providerDisabled")
                : p.needs_node ? t("settings.needsNode") : t("settings.notInstalled")
              : null}
            leading={
              <>
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    registryReady && p.available ? "bg-success" : "bg-border",
                  )}
                />
                {/* The brand mark; dimmed when the CLI isn't installed, like the row's text. */}
                <ProviderIcon
                  provider={p.id}
                  className={cn("size-3.5 shrink-0", registryReady && !p.available && "opacity-40")}
                />
              </>
            }
            disabled={registryReady && !p.available}
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
 * config decides. Before a session exists, only providers with an advertised model list show the
 * picker; provider-owned config options still arrive after session creation.
 */
export function ModelPicker({
  models,
  current,
  defaultModel,
  provider,
  onModel,
  configOptions,
  onConfigOption,
  hasSession,
  compact = false,
  disabled = false,
}: {
  models: ModelChoice[];
  current: string | null;
  defaultModel: string | null;
  provider: string;
  onModel: (id: string) => void;
  configOptions: ConfigOptionInfo[];
  onConfigOption: (configId: string, value: string) => void;
  hasSession: boolean;
  /** Scene configuration nests this picker inside another popover, so it uses desktop control density. */
  compact?: boolean;
  /** A live turn owns its provider runtime; model and effort changes wait until it ends. */
  disabled?: boolean;
}) {
  const t = useT();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorPanel, setSelectorPanel] = useState<"reasoning" | "model">("reasoning");
  const families = useMemo(() => groupModels(models), [models]);
  useEffect(() => {
    if (disabled) setSelectorOpen(false);
  }, [disabled]);
  if (!hasSession && models.length === 0) return null;

  const effortName = (e: Effort | null) => (e ? t(`effort.${e}` as "effort.low") : t("composer.default"));

  const modelOpt = configOptions.find((o) => o.category === "model" || o.id === "model");
  const effortOpt = configOptions.find(
    (o) => o.category === "thought_level" || o.id === "effort" || o.id === "reasoning_effort",
  );
  const activeFamily = familyOf(families, current);
  const activeVariant = variantOf(families, current);

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
  } else {
    // Flat list: regroup by the effort suffix parsed out of each name.
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
  }

  // Effort is independently provider-owned. Some ACP agents (notably Grok) report a normal model
  // list plus a separate metadata-derived effort option, rather than a model config option. Never
  // discard that real ladder just because the model selector arrived through the older surface.
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
  } else if (activeFamily) {
    effortLabel = effortName(activeVariant?.effort ?? null);
    effortRows = activeFamily.variants.map((v) => ({
      key: v.choice.id,
      label: effortName(v.effort),
      isDefault: v.choice.id === defaultModel,
      selected: v.choice.id === current,
      select: () => onModel(v.choice.id),
    }));
  }

  if (effortRows.length > 1) {
    return (
      <Popover
        open={selectorOpen}
        onOpenChange={(open) => {
          setSelectorOpen(disabled ? false : open);
          if (!open) setSelectorPanel("reasoning");
        }}
      >
        <PopoverTrigger
          render={
            <button
              type="button"
              className={cn(
                "reasoning-selector-trigger",
                compact && "reasoning-selector-trigger--compact",
              )}
              title={`${t("composer.model")}: ${modelLabel} · ${t("composer.reasoning")}: ${effortLabel}`}
              aria-label={`${modelLabel} ${effortLabel}`}
              disabled={disabled}
              aria-busy={disabled}
            >
              <span className="reasoning-selector-trigger-model">{modelLabel}</span>
              <span className="reasoning-selector-trigger-effort">{effortLabel}</span>
              <ChevronDown className="reasoning-selector-trigger-chevron" aria-hidden />
            </button>
          }
        />
        <PopoverContent
          align="center"
          side="top"
          sideOffset={compact ? 8 : 17}
          className={cn(
            "reasoning-selector-popup",
            selectorPanel === "model" && "reasoning-selector-popup--menu",
            compact && "reasoning-selector-popup--compact",
          )}
        >
          {selectorPanel === "reasoning" ? (
            <>
              <div className="reasoning-selector-header">
                <button
                  type="button"
                  className="reasoning-selector-header-button"
                  onClick={() => setSelectorPanel("model")}
                >
                  <span>{t("composer.advanced")}</span>
                  <ChevronRight aria-hidden />
                </button>
                <Zap className="reasoning-selector-header-icon" strokeWidth={2} aria-hidden />
              </div>
              <ReasoningScale
                label={t("composer.reasoning")}
                rows={effortRows}
                onSelect={(row) => row.select()}
                compact={compact}
                disabled={disabled}
              />
            </>
          ) : (
            <>
              <div className="reasoning-selector-header">
                <button
                  type="button"
                  className="reasoning-selector-header-button"
                  onClick={() => setSelectorPanel("reasoning")}
                >
                  <ChevronLeft aria-hidden />
                  <span>{t("composer.model")}</span>
                </button>
              </div>
              <ScrollArea className="max-h-80">
                {modelRows.map((r) => (
                  <MenuRow
                    key={r.key}
                    selected={r.selected}
                    isDefault={r.isDefault}
                    label={r.label}
                    detail={r.detail}
                    disabled={disabled}
                    onClick={() => {
                      r.select();
                      setSelectorPanel("reasoning");
                      setSelectorOpen(false);
                    }}
                  />
                ))}
              </ScrollArea>
            </>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={selectorOpen} onOpenChange={(open) => setSelectorOpen(disabled ? false : open)}>
      <PopoverTrigger
        render={<Chip
          title={t("composer.model")}
          disabled={disabled}
          aria-busy={disabled}
          className="disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          <ProviderIcon provider={provider} className="size-3.5 shrink-0" />
          <span className="max-w-28 truncate text-foreground/80 @lg/composer:max-w-44">
            {modelLabel}
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </Chip>}
      />
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
                  disabled={disabled}
                  onClick={() => {
                    r.select();
                    setSelectorOpen(false);
                  }}
                />
              ))}
            </ScrollArea>
          </>
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
  checkout,
  hero,
  docMode,
  onDocMode,
  height,
  onHeight,
  boundsRef,
  models,
  currentModel,
  defaultModel,
  contextWindow,
  usage = null,
  onModel,
  configOptions,
  onConfigOption,
  running,
  loading,
  docEmpty,
  appshots = [],
  onRemoveAppshot,
  onRun,
  onQueue,
  onSteer,
  onStop,
  steeringSupported,
  goalCapability,
  goal,
  onGoal,
  onAttachFile,
  onAttachImages,
  onInsertSkill,
  onInsertIssue,
  onOpenMarket,
  onNewSkill,
  canvasEnabled,
  onInsertCanvas,
  voiceEnabled,
  onVoiceText,
  onVoiceTranscript,
  runHint,
  skillHint,
  filesHint,
  pluginActions,
  sessionId,
  insertBriefRef,
}: ComposerProps) {
  const t = useT();
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ---- R5 scene brief: offer banner, + menu entry, required-slot hint --------------------------
  // Dismissal is remembered per session for the Composer's lifetime — a dismissed offer must not
  // come back on every keystroke-then-clear, but a new session gets a fresh offer.
  const briefDismissedRef = useRef(new Set<string>());
  const [, bumpBriefDismissals] = useState(0);
  const sessionKey = sessionId ?? "draft";
  const composerEmpty = docEmpty && appshots.length === 0;
  const activeBrief = config.activeScene?.brief ?? null;
  const insertBrief = () => {
    const scene = config.activeScene;
    if (scene?.brief) insertBriefRef?.current?.(scene);
  };
  const dismissBrief = () => {
    briefDismissedRef.current.add(sessionKey);
    bumpBriefDismissals((n) => n + 1);
  };
  const showBriefOffer = briefOfferVisible({
    docMode,
    docEmpty: composerEmpty,
    hasBrief: activeBrief !== null,
    dismissed: briefDismissedRef.current.has(sessionKey),
  });

  // Required slot-card fields still empty — published by the editor on document change (same
  // window-event seam as `codetwo-open-provider-picker`). A warning near Run, never a block.
  const [unfilledRequired, setUnfilledRequired] = useState<string[]>([]);
  useEffect(() => {
    const onRequiredSlots = (event: Event) => {
      const detail = (event as CustomEvent<string[]>).detail;
      setUnfilledRequired(Array.isArray(detail) ? detail : []);
    };
    window.addEventListener("codetwo-required-slots", onRequiredSlots);
    return () => window.removeEventListener("codetwo-required-slots", onRequiredSlots);
  }, []);
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
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length > 0) void onAttachImages(files);
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={t("composer.add")}>
            <Plus className="size-4" />
          </Button>}
        />
        <DropdownMenuContent align="start" side="top" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onAttachFile}>
              <FileText />
              {t("composer.mentionFile")}
              {filesHint && <DropdownMenuShortcut>{filesHint}</DropdownMenuShortcut>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
              <ImagePlus />
              {t("composer.attachImage")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onInsertSkill}>
              <Sparkles />
              {t("composer.insertSkill")}
              {skillHint && <DropdownMenuShortcut>{skillHint}</DropdownMenuShortcut>}
            </DropdownMenuItem>
            {canvasEnabled && (
              <DropdownMenuItem onClick={onInsertCanvas}>
                <PenLine />
                {t("composer.insertCanvas")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onInsertIssue}>
              <Ticket />
              {t("composer.pullIssue")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenMarket}>
              <Store />
              {t("composer.market")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onNewSkill}>
              <Sparkles />
              {t("composer.newSkill")}
            </DropdownMenuItem>
            {/* With content already in the document the floating offer stays away; the brief is
                still one menu entry away while a scene with one is active. */}
            {activeBrief && !composerEmpty && (
              <DropdownMenuItem onClick={insertBrief}>
                <ListChecks />
                {t("brief.menuInsert")}
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <p className="px-2 pb-1 pt-1.5 text-fine leading-relaxed text-muted-foreground">
            {t("composer.addHint")}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* One scene chip replaces the posture row (docs/scenes.md §UI contract): the scene sets
          provider/model/permissions/memory/plan-first/worktree, and opening the chip still
          exposes each picker unchanged for manual overrides. */}
      <SceneChip
        config={config}
        models={models}
        currentModel={currentModel}
        defaultModel={defaultModel}
        onModel={onModel}
        configOptions={configOptions}
        onConfigOption={onConfigOption}
        modelChangeDisabled={running || loading}
      />

      <CollaborationModePicker options={configOptions} onChange={onConfigOption} />
      <GoalPicker capability={goalCapability} goal={goal} onGoal={onGoal} />

      <Statusline contextWindow={contextWindow} usage={usage ?? null} />

      {pluginActions}

      <div className="flex-1" />

      {/* Document mode is the app's own feature — it deserves a control you can see, not just a
          chord and a grip gesture. */}
      <Tooltip>
        <TooltipTrigger
          render={<Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            aria-label={docMode ? t("composer.collapseLabel") : t("composer.expandLabel")}
            onClick={() => onDocMode(!docMode)}
          >
            {docMode ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>}
        />
        <TooltipContent>{docMode ? t("composer.collapse") : t("composer.expand")}</TooltipContent>
      </Tooltip>

      {voiceEnabled ? (
        <VoiceButton onText={onVoiceText} onTranscript={onVoiceTranscript} />
      ) : null}

      {/* Required slot fields still empty — a hint beside Run, never a gate on it. */}
      {unfilledRequired.length > 0 && (
        <Tooltip>
          <TooltipTrigger
            render={<Chip tone="warning" aria-label={t("slotCard.requiredWarning", { slots: unfilledRequired.join(", ") })}>
              <TriangleAlert className="size-3.5 shrink-0" />
              <span className="hidden @lg/composer:inline">
                {t("slotCard.requiredShort", { count: unfilledRequired.length })}
              </span>
            </Chip>}
          />
          <TooltipContent>
            {t("slotCard.requiredWarning", { slots: unfilledRequired.join(", ") })}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Enter makes a paragraph in a document, so the send chord has to be taught rather than
          assumed. It shows only while the document is empty, and so retires itself. */}
      {composerEmpty && !running && !loading && runHint && (
        <span className="mx-1 hidden shrink-0 whitespace-nowrap text-fine text-muted-foreground @2xl/composer:inline">
          {t("composer.toSend", { key: runHint })}
        </span>
      )}

      {running ? (
        <>
          <div className="flex shrink-0 items-center rounded-full border bg-background">
            <Tooltip>
              <TooltipTrigger
                render={<Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-full"
                  onClick={onQueue}
                  aria-label={t("composer.queue")}
                >
                  <ArrowUp className="size-4" />
                </Button>}
              />
              <TooltipContent>{t("composer.queue")}</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-full text-muted-foreground"
                  aria-label={t("composer.sendOptions")}
                >
                  <ChevronDown className="size-3.5" />
                </Button>}
              />
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuItem onClick={onQueue}>{t("composer.queue")}</DropdownMenuItem>
                {steeringSupported ? (
                  <DropdownMenuItem onClick={onSteer}>{t("composer.steer")}</DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Tooltip>
            <TooltipTrigger
              render={<Button
                variant="destructive"
                size="icon"
                className="size-8 shrink-0 rounded-full transition-transform active:scale-90"
                onClick={onStop}
                aria-label={t("composer.stop")}
              >
                <Square className="size-3.5 fill-current" />
              </Button>}
            />
            <TooltipContent>{t("composer.stop")}</TooltipContent>
          </Tooltip>
        </>
      ) : (
        <Tooltip>
          {/* Kept enabled on purpose: a disabled button explains nothing, and clicking it
              focuses the document and says what's missing. */}
          <TooltipTrigger
            render={
            <Button
              size="icon"
              variant={composerEmpty ? "secondary" : "default"}
              className="size-8 shrink-0 rounded-full transition-transform active:scale-90"
              onClick={onRun}
              disabled={loading}
              aria-label={loading ? t("composer.loadingSession") : t("composer.run")}
            >
              {loading ? (
                <ActivityOrb state="connecting" aria-hidden="true" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </Button>
            }
          />
          <TooltipContent>
            {loading ? t("composer.loadingSession") : composerEmpty ? t("composer.runEmpty") : t("composer.run")}
            {!loading && <span className="ml-1.5 opacity-60">{runHint}</span>}
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
        docMode ? "min-h-0 min-w-0 flex-1" : "shrink-0 px-6 pb-6 pt-3",
      )}
    >
      <div
        className={cn(
          // The width container the control row compresses against (see the chip labels below):
          // in compact mode this is the card's own measure, expanded it's the page column — either
          // way, the width the controls actually have.
          "@container/composer isolate flex flex-col",
          docMode
            ? "min-h-0 flex-1"
            : "mx-auto w-full max-w-3xl",
        )}
      >
        {/* No `overflow-hidden`: BlockNote's drag/insert handles render just outside the text
            column, and clipping them takes the block gutter away. */}
        <div
          className={cn(
            "composer-card relative z-10 flex flex-col",
            docMode
              ? // Expanded, the composer *is* the page: no card, no border, the app's own surface.
                // `relative` anchors the floating control bar below.
                "min-h-0 flex-1"
              : // A plain white card on a plain page, T3-style: a low-contrast hairline lets the
                // shared raised shadow carry the separation without drawing a heavy box.
                "rounded-(--ds-composer-radius) bg-card shadow-raised ring-[0.5px] ring-foreground/[0.07] transition-[box-shadow,--tw-ring-color] duration-200 focus-within:ring-ring/20",
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
            className={cn(
              "min-h-0 overflow-y-auto",
              docMode ? "bn-doc-mode flex-1" : hero ? "min-h-28 py-3" : "py-2",
            )}
            style={docMode ? undefined : { maxHeight: applied }}
          >
            {appshots.length > 0 && (
              <div data-appshot-attachments className="flex gap-2 overflow-x-auto px-4 pb-2">
                {appshots.map((appshot) => (
                  <div
                    key={appshot.id}
                    className="group relative flex w-64 shrink-0 items-center gap-2 rounded-(--ds-radius-control) bg-fill-quiet p-1.5 ring-[0.5px] ring-foreground/10"
                  >
                    <img
                      src={appshot.preview_data_url}
                      alt=""
                      className="aspect-5/3 w-20 shrink-0 rounded-(--ds-radius-control) object-cover ring-[0.5px] ring-foreground/10"
                    />
                    <div className="min-w-0 flex-1 pr-5">
                      <p className="truncate text-hint font-medium">{appshot.window_title}</p>
                      {appshot.kind === "attachment" ? (
                        <p className="text-fine text-muted-foreground">
                          {t("composer.imageDimensions", {
                            width: appshot.width,
                            height: appshot.height,
                          })}
                        </p>
                      ) : (
                        <>
                          <p className="truncate text-fine text-muted-foreground">{appshot.app_name}</p>
                          <p className="text-cap text-muted-foreground">
                            {t("composer.appshotText", { count: appshot.text_length })}
                          </p>
                        </>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 size-6 text-muted-foreground opacity-70 hover:opacity-100"
                      aria-label={appshot.kind === "attachment"
                        ? t("composer.removeImage", { title: appshot.window_title })
                        : t("composer.removeAppshot", { title: appshot.window_title })}
                      onClick={() => onRemoveAppshot?.(appshot.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {children}
          </div>

          {/* R5: an empty page in an active scene with a brief offers to start from it. A
              positioned overlay inside the same tree (see the reconciliation note above) — it
              never auto-inserts, and dismissing it keeps it away for this session. Only rendered
              in doc mode, where the card is `relative`. */}
          {showBriefOffer && config.activeScene && (
            <div className="pointer-events-none absolute inset-x-0 top-8 z-20 px-6">
              <div className="glass-raised canvas-ui-module pointer-events-auto mx-auto flex w-max max-w-full items-center gap-2 border px-3 py-2 shadow-raised">
                <ListChecks className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate text-ui text-muted-foreground">
                  {t("brief.offer", { scene: config.activeScene.title })}
                </span>
                <Button size="sm" className="shrink-0" onClick={insertBrief}>
                  {t("brief.insert")}
                </Button>
                <Button size="sm" variant="ghost" className="shrink-0" onClick={dismissBrief}>
                  {t("brief.dismiss")}
                </Button>
              </div>
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
                    // which its own z-plane makes safe. An 8px inset around the circular 32px
                    // submit control aligns its centre with the surface's 24px corner centre.
                    "glass-raised pointer-events-auto mx-auto w-max rounded-(--ds-composer-radius) border p-2 shadow-raised"
                  : // Keep every outer edge 8px from the controls. The 24px surface radius then
                    // shares its bottom-right centre with the circular send/stop control.
                    "p-2",
              )}
            >
              {controls}
            </div>
          </div>
        </div>

        {/* Execution location and source control are adjacent but distinct: changing where a fresh
            session runs must never be confused with inspecting the current branch. */}
        {!docMode && checkout && (
          <CheckoutBar config={config} checkout={checkout} />
        )}
      </div>
    </section>
  );
}
