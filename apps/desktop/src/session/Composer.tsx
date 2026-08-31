import { useEffect, useId, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import {
  ArrowUp,
  BrainCircuit,
  ChevronDown,
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
  SlidersHorizontal,
  Square,
  Star,
  Store,
  Target,
  Ticket,
  TriangleAlert,
  X,
} from "@/components/ui/icons";

import { memoryPresetsForProvider, type SessionConfig } from "./config";
import type { SceneInfo } from "./scene";
import { briefOfferVisible } from "../editor/slotCard";
import { SceneChip } from "./SceneChip";
import { SESSION_MODES, sessionMode } from "./mode";
import { worktreeGatingReason } from "./sessionEvents";
import { familyOf, groupModels, pickVariant, variantOf, type Effort } from "./models";
import { useProviderModelFavorites } from "./modelFavorites";
import { useProviderModelPreferences } from "./modelPreferences";
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
import { Badge } from "@/components/ui/badge";
import { ControlChip as Chip } from "@/components/ui/control-chip";
import { Input } from "@/components/ui/input";
import { ActivityOrb } from "@/components/ui/activity-orb";
import { SelectableRow } from "@/components/business/selectable-row";
import { SearchField } from "@/components/business/search-field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useResizeHandle } from "@/components/ui/use-resize-handle";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";

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
  /** Present only after the live provider session advertises its native `/compact` command. */
  onCompactContext?: () => void;
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
  onMultitask: () => void;
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
      className="relative z-0 mx-page mt-2 flex min-h-control-field min-w-0 items-center rounded-module bg-fill-quiet px-1 py-1 text-metadata text-muted-foreground"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<Button
            type="button"
            variant="ghost"
            size="compact"
            focusStyle="inset"
            className="min-w-0 shrink gap-1.5 px-2"
            title={t("checkout.choose")}
            aria-label={`${t("checkout.title")}: ${modeLabel}`}
            aria-expanded={open}
          >
            <Folder className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate text-body text-foreground/85">{modeLabel}</span>
            <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden="true" />
          </Button>}
        />
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={10}
          className="w-80 max-w-(--available-width) p-1.5"
        >
          {config.hasSession ? (
            <>
              <SelectableRow
                selected
                disabled
                label={selectedRef ?? (selectedKind == null ? projectLabel : modeLabel)}
                accessibilityContext={modeLabel}
                meta={t("checkout.currentBadge")}
                description={config.activeWorktreeUnknown
                  ? t("worktree.legacyUnknownHint")
                  : config.activeWorktreeBaseline?.display ?? projectDetail}
                onSelect={() => {}}
              />
              <p className="px-2.5 pb-1 pt-1.5 text-callout text-muted-foreground">
                {t("worktree.fixedForSession")}
              </p>
            </>
          ) : (
            <>
              <SelectableRow
                selected={config.worktreeBase == null}
                label={projectLabel}
                accessibilityContext={t("checkout.project")}
                meta={config.worktreeBase == null
                  ? t("checkout.currentBadge")
                  : t("checkout.projectBadge")}
                description={projectDetail}
                onSelect={() => {
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
                  <SelectableRow
                    key={kind}
                    selected={config.worktreeBase === kind}
                    disabled={unavailable}
                    label={displayGitRef(option?.resolved?.ref) ?? (kind === "current"
                      ? t("checkout.currentRef")
                      : t("checkout.originRef"))}
                    accessibilityContext={kind === "current"
                      ? t("checkout.currentRef")
                      : t("checkout.originRef")}
                    meta={unavailable
                      ? t("checkout.unavailableBadge")
                      : config.worktreeBase === kind
                        ? t("checkout.currentBadge")
                        : t("checkout.worktreeBadge")}
                    description={detail}
                    onSelect={() => {
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
        <Button
          type="button"
          variant="ghost"
          size="compact"
          focusStyle="inset"
          onClick={checkout.onOpen}
          className="ml-auto shrink-0 gap-1.5 bg-foreground/[0.04] px-module-inset font-mono text-callout text-foreground/80"
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
        </Button>
      )}
    </div>
  );
}

/** Muted section header inside a picker menu — "Model", "Reasoning". */
function MenuSection({ children }: { children: ReactNode }) {
  return <p className="shrink-0 px-2.5 pb-1 pt-1.5 text-metadata text-muted-foreground">{children}</p>;
}

/** The small "Default" pill on the adapter's own pick. */
function DefaultBadge() {
  const t = useT();
  return (
    <Badge variant="secondary" size="status">
      {t("composer.default")}
    </Badge>
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

function ModelPickerRow({
  row,
  favorite,
  disabled,
  onSelect,
  onToggleFavorite,
}: {
  row: PickerRow;
  favorite: boolean;
  disabled: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const t = useT();
  const favoriteLabel = t(
    favorite ? "composer.unfavoriteModel" : "composer.favoriteModel",
    { model: row.label },
  );
  return (
    <div data-model-picker-row className="flex min-w-0 items-center gap-control-group">
      <div className="min-w-0 flex-1">
        <SelectableRow
          selected={row.selected}
          label={row.label}
          description={row.detail}
          meta={row.isDefault ? <DefaultBadge /> : undefined}
          disabled={disabled}
          onSelect={onSelect}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={favoriteLabel}
        aria-pressed={favorite}
        title={favoriteLabel}
        onClick={onToggleFavorite}
        className={cn(
          "self-center text-muted-foreground",
          favorite && "text-foreground",
        )}
      >
        <Star
          aria-hidden="true"
          className="size-3.5"
          fill={favorite ? "currentColor" : "none"}
        />
      </Button>
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
export function SessionModePicker({
  mode,
  sandbox,
  disabled = false,
  onMode,
}: {
  mode: SessionConfig["mode"];
  sandbox: SessionConfig["sandbox"];
  disabled?: boolean;
  onMode: SessionConfig["onSessionMode"];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const active = sessionMode(mode, sandbox);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Chip
          tone={active === "full_access" ? "warning" : undefined}
          title={t("config.mode")}
          disabled={disabled}
          aria-busy={disabled}
          aria-label={`${t("config.mode")}: ${t(`mode.${active}` as "mode.ask")}`}
          className={cn(disabled && "cursor-wait opacity-60 hover:bg-transparent")}
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
          <SelectableRow
            key={m.id}
            selected={m.id === active}
            label={t(`mode.${m.id}` as "mode.ask")}
            description={t(`mode.${m.id}Hint` as "mode.askHint")}
            disabled={disabled}
            onSelect={() => {
              onMode(m.id);
              setOpen(false);
            }}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function ModePicker({ config }: { config: SessionConfig }) {
  return (
    <SessionModePicker
      mode={config.mode}
      sandbox={config.sandbox}
      disabled={config.modeChangeDisabled}
      onMode={config.onSessionMode}
    />
  );
}

export function MemoryPicker({ config }: { config: SessionConfig }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const presets = memoryPresetsForProvider(config.provider);
  const active =
    presets.find(
      (preset) => preset.read === config.memoryRead && preset.write === config.memoryWrite,
    ) ?? presets[0];

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
        {presets.map((preset) => (
          <SelectableRow
            key={preset.id}
            selected={preset.id === active.id}
            label={t(`memory.preset.${preset.id}` as "memory.preset.standard")}
            description={t(`memory.preset.${preset.id}Hint` as "memory.preset.standardHint")}
            meta={preset.isDefault ? <DefaultBadge /> : undefined}
            onSelect={() => {
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
          <SelectableRow
            key={choice.id}
            selected={choice.id === option.current}
            label={choice.name}
            description={choice.description}
            onSelect={() => {
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
              <p className="text-body font-medium text-foreground">{goal.objective}</p>
              <p className="mt-0.5 text-callout text-muted-foreground">{t(`goal.status.${goal.status}` as "goal.status.active")}</p>
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
            <SelectableRow
              selected
              label={
                config.activeWorktreeUnknown
                  ? t("worktree.legacyUnknown")
                  : selectedKind == null
                    ? t("worktree.off")
                    : t(`worktree.${selectedKind}` as "worktree.current")
              }
              description={
                config.activeWorktreeUnknown
                  ? t("worktree.legacyUnknownHint")
                  : config.activeWorktreeBaseline?.display ?? t("worktree.offHint")
              }
              disabled
              onSelect={() => {}}
            />
            <p className="px-2.5 pb-1 pt-2 text-callout text-muted-foreground">
              {t("worktree.fixedForSession")}
            </p>
          </>
        ) : (
          <>
            <SelectableRow
              selected={config.worktreeBase == null}
              label={t("worktree.off")}
              description={t("worktree.offHint")}
              onSelect={() => {
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
                <SelectableRow
                  key={kind}
                  selected={config.worktreeBase === kind}
                  label={t(`worktree.${kind}` as "worktree.current")}
                  description={detail}
                  disabled={unavailable}
                  onSelect={() => {
                    config.onWorktreeBase(kind);
                    setOpen(false);
                  }}
                />
              );
            })}
          </>
        )}
        <p className="px-2.5 pb-1 pt-2 text-callout text-muted-foreground">
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
          <p role="status" className="px-2.5 pb-2 text-callout text-muted-foreground">
            {t("config.providersLoading")}
          </p>
        )}
        {config.providersStatus === "error" && (
          <div className="mb-1 flex items-center gap-2 rounded-control bg-muted/60 px-module-inset py-2 text-callout">
            <span role="alert" className="min-w-0 flex-1 text-muted-foreground">
              {t("config.providersLoadFailed")}
            </span>
            <Button
              type="button"
              variant="link"
              size="compact"
              className="shrink-0 px-0 font-medium text-foreground"
              onClick={config.onReloadProviders}
            >
              {t("config.retryProviders")}
            </Button>
          </div>
        )}
        {providers.map((p) => (
          <SelectableRow
            key={p.id}
            selected={p.id === config.provider}
            label={p.display_name}
            // The dot says installed; the line under it says what's missing, so the list itself
            // answers "why can't I use that one?" without a paragraph of warning text.
            description={registryReady && !p.available
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
            onSelect={() => {
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
 * config decides. Before a session exists, the main composer only shows providers with an
 * advertised model list; host surfaces may keep the explicit affordance visible while metadata is
 * loading. Provider-owned config options still arrive after session creation.
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
  showWhenUnavailable = false,
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
  /** Keep an explicit model affordance while a host surface is waiting for provider metadata. */
  showWhenUnavailable?: boolean;
  /** A live turn owns its provider runtime; model and effort changes wait until it ends. */
  disabled?: boolean;
}) {
  const t = useT();
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [effortOpen, setEffortOpen] = useState(false);
  const families = useMemo(() => groupModels(models), [models]);
  const { favorites, toggle: toggleFavorite } = useProviderModelFavorites(provider);
  const { hidden: hiddenModels } = useProviderModelPreferences(provider);
  useEffect(() => {
    if (disabled) {
      setModelOpen(false);
      setEffortOpen(false);
    }
  }, [disabled]);
  if (!hasSession && models.length === 0 && !showWhenUnavailable) return null;

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

  const favoriteRows: PickerRow[] = [];
  const regularRows: PickerRow[] = [];
  const normalizedSearch = modelSearch.trim().toLocaleLowerCase();
  const visibleModelRows = modelRows.filter((row) => row.selected || !hiddenModels.has(row.key));
  const filteredModelRows = normalizedSearch
    ? visibleModelRows.filter((row) => `${row.label}\n${row.key}\n${row.detail ?? ""}`.toLocaleLowerCase().includes(normalizedSearch))
    : visibleModelRows;
  for (const row of filteredModelRows) (favorites.has(row.key) ? favoriteRows : regularRows).push(row);
  const renderModelRow = (row: PickerRow) => (
    <ModelPickerRow
      key={row.key}
      row={row}
      favorite={favorites.has(row.key)}
      disabled={disabled}
      onSelect={() => {
        row.select();
        setModelOpen(false);
      }}
      onToggleFavorite={() => toggleFavorite(row.key)}
    />
  );

  return (
    <>
      <Popover
        open={modelOpen}
        onOpenChange={(open) => {
          setModelOpen(disabled ? false : open);
          if (!open) setModelSearch("");
        }}
      >
        <PopoverTrigger
          render={
            <Chip
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
            </Chip>
          }
        />
        <PopoverContent
          align="start"
          side="top"
          className="flex max-h-(--available-height) w-64 flex-col overflow-hidden p-1.5"
        >
          {modelRows.length === 0 ? (
            <p className="px-2 py-2 text-callout text-muted-foreground">
              {t("composer.noModels")}
            </p>
          ) : (
            <>
              <SearchField
                autoFocus
                label={t("composer.searchModels")}
                placeholder={t("composer.searchModels")}
                value={modelSearch}
                clearLabel={t("composer.clearModelSearch")}
                onClear={() => setModelSearch("")}
                onChange={(event) => setModelSearch(event.target.value)}
                className="mb-1"
              />
              <div
                data-model-picker-list
                className="max-h-80 min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
              >
                {filteredModelRows.length === 0 ? (
                  <p className="px-2 py-3 text-center text-fine text-muted-foreground">
                    {normalizedSearch ? t("composer.noMatchingModels") : t("composer.noVisibleModels")}
                  </p>
                ) : favoriteRows.length > 0 ? (
                  <>
                    <MenuSection>{t("composer.favorites")}</MenuSection>
                    {favoriteRows.map(renderModelRow)}
                    {regularRows.length > 0 ? (
                      <MenuSection>{t("composer.model")}</MenuSection>
                    ) : null}
                    {regularRows.map(renderModelRow)}
                  </>
                ) : (
                  <>
                    <MenuSection>{t("composer.model")}</MenuSection>
                    {filteredModelRows.map(renderModelRow)}
                  </>
                )}
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>

      {effortRows.length > 1 && (
        <Popover open={effortOpen} onOpenChange={(open) => setEffortOpen(disabled ? false : open)}>
          <PopoverTrigger
            render={
              <Chip
                title={t("composer.reasoning")}
                disabled={disabled}
                aria-busy={disabled}
                className="disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <span>{effortLabel}</span>
                <ChevronDown className="size-3 shrink-0 opacity-50" />
              </Chip>
            }
          />
          <PopoverContent align="start" side="top" className="w-44 p-1.5">
            <MenuSection>{t("composer.reasoning")}</MenuSection>
            {effortRows.map((r) => (
                <SelectableRow
                  key={r.key}
                  selected={r.selected}
                  label={r.label}
                  description={r.detail}
                  meta={r.isDefault ? <DefaultBadge /> : undefined}
                  disabled={disabled}
                  onSelect={() => {
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

/** High-frequency, session-scoped configuration stays one click from the prompt. */
export function SessionControls({
  config,
  models,
  currentModel,
  defaultModel,
  onModel,
  configOptions,
  onConfigOption,
  modelChangeDisabled = false,
  showWorktreePicker = true,
}: {
  config: SessionConfig;
  models: ModelChoice[];
  currentModel: string | null;
  defaultModel: string | null;
  onModel: (id: string) => void;
  configOptions: ConfigOptionInfo[];
  onConfigOption: (configId: string, value: string) => void;
  modelChangeDisabled?: boolean;
  /** The checkout bar already owns this choice when it is rendered below the composer. */
  showWorktreePicker?: boolean;
}) {
  const t = useT();
  const optionsId = useId();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const activeMode = sessionMode(config.mode, config.sandbox);
  const hasHiddenOverride =
    activeMode !== "ask" ||
    (config.memoryEnabled && (config.memoryRead !== "inherit" || config.memoryWrite !== "inherit")) ||
    (showWorktreePicker && (
      config.activeWorktreeUnknown ||
      config.activeWorktreeBaseline !== null ||
      config.worktreeBase !== null
    ));

  return (
    <div data-session-controls className="flex min-w-0 flex-col items-start gap-0.5">
      <div className="flex max-w-full flex-wrap items-center gap-0.5">
        {config.scenesEnabled ? <SceneChip config={config} /> : null}
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
          disabled={modelChangeDisabled}
        />
        <Tooltip>
          <TooltipTrigger
            render={<Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "relative size-7 shrink-0 rounded-full text-muted-foreground",
                optionsOpen && "bg-accent text-foreground",
                activeMode === "full_access" && "text-warning",
              )}
              aria-label={t(optionsOpen ? "config.hideSessionOptions" : "config.showSessionOptions")}
              aria-expanded={optionsOpen}
              aria-controls={optionsId}
              onClick={() => setOptionsOpen((open) => !open)}
            >
              <SlidersHorizontal className="size-3.5" />
              {hasHiddenOverride ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute right-0.5 top-0.5 size-1.5 rounded-full",
                    activeMode === "full_access" ? "bg-warning" : "bg-primary",
                  )}
                />
              ) : null}
            </Button>}
          />
          <TooltipContent>{t("config.sessionOptionsHint")}</TooltipContent>
        </Tooltip>
      </div>
      {optionsOpen ? (
        <div
          id={optionsId}
          data-session-options
          className="flex max-w-full flex-wrap items-center gap-0.5 pl-1"
        >
          <ModePicker config={config} />
          {config.memoryEnabled ? <MemoryPicker config={config} /> : null}
          {showWorktreePicker ? <WorktreePicker config={config} /> : null}
        </div>
      ) : null}
    </div>
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
  onCompactContext,
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
  onMultitask,
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

  const resizeHandle = useResizeHandle({
    axis: "y",
    direction: -1,
    value: applied,
    min: 72,
    max: maxHeight,
    onResize: onHeight,
  });

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
          render={<Button variant="ghost" size="icon" className="size-7 shrink-0 rounded-full" aria-label={t("composer.add")}>
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
          <p className="px-2 pb-1 pt-1.5 text-callout text-muted-foreground">
            {t("composer.addHint")}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>

      <CollaborationModePicker options={configOptions} onChange={onConfigOption} />
      <GoalPicker capability={goalCapability} goal={goal} onGoal={onGoal} />

      <Statusline
        contextWindow={contextWindow}
        usage={usage ?? null}
        onCompact={onCompactContext}
        compactDisabled={running || loading || !composerEmpty}
        compactDisabledReason={
          running || loading
            ? t("context.compactBusy")
            : !composerEmpty
              ? t("context.compactDraft")
              : null
        }
      />

      {pluginActions}

      <div className="flex-1" />

      {/* Document mode is the app's own feature — it deserves a control you can see, not just a
          chord and a grip gesture. */}
      <Tooltip>
        <TooltipTrigger
          render={<Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 rounded-full text-muted-foreground"
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
        <span className="mx-1 hidden shrink-0 whitespace-nowrap text-callout text-muted-foreground @2xl/composer:inline">
          {t("composer.toSend", { key: runHint })}
        </span>
      )}

      {running ? (
        <>
          <div className="flex shrink-0 items-center rounded-control border bg-background">
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
                <DropdownMenuItem onClick={onMultitask}>
                  {t("composer.multitask")}
                </DropdownMenuItem>
                {steeringSupported ? (
                  <DropdownMenuItem onClick={onSteer}>{t("composer.steer")}</DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Tooltip>
            <TooltipTrigger
              render={<Button
                variant="secondary"
                size="icon"
                className="size-8 shrink-0 rounded-full transition-transform active:scale-90 motion-reduce:active:scale-100"
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
                className="size-8 shrink-0 rounded-full transition-transform active:scale-90 motion-reduce:active:scale-100"
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
      data-composer-mode={docMode ? "document" : "compact"}
      className={cn(
        "composer-mode-transition flex flex-col",
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
            column, and clipping them takes the block gutter away. The compact card paints its own
            surface so its background can never drift away from the editor in WebKit. */}
        <div
          className={cn(
            "composer-card relative z-10 flex flex-col",
            docMode
              ? // Expanded, the composer *is* the page: no card, no border, the app's own surface.
                // `relative` anchors the floating control bar below.
                "min-h-0 flex-1"
              : "rounded-composer bg-card shadow-raised transition-shadow duration-feedback ease-enter focus-within:focus-ring-inset",
          )}
        >
          {/* Grip: drag for any height, double-click for the full page. Meaningless once the
              document owns the column, so it's hidden — but kept mounted to preserve the tree. */}
          <div
            className={cn("composer-grip", docMode && "hidden")}
            aria-label={t("composer.grip")}
            onDoubleClick={() => onDocMode(true)}
            title={t("composer.grip")}
            {...resizeHandle}
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
                    className="group relative flex w-64 shrink-0 items-center gap-2 rounded-control bg-fill-quiet p-1.5 shadow-surface"
                  >
                    <img
                      src={appshot.preview_data_url}
                      alt=""
                      className="aspect-5/3 w-20 shrink-0 rounded-control object-cover"
                    />
                    <div className="min-w-0 flex-1 pr-5">
                      <p className="truncate text-metadata font-medium">{appshot.window_title}</p>
                      {appshot.kind === "attachment" ? (
                        <p className="text-callout text-muted-foreground">
                          {t("composer.imageDimensions", {
                            width: appshot.width,
                            height: appshot.height,
                          })}
                        </p>
                      ) : (
                        <>
                          <p className="truncate text-callout text-muted-foreground">{appshot.app_name}</p>
                          <p className="text-metadata text-muted-foreground">
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
              <div className="raised-material canvas-ui-module pointer-events-auto mx-auto flex w-max max-w-full items-center gap-2 px-3 py-2 shadow-raised">
                <ListChecks className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate text-body text-muted-foreground">
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

          {/* Expanded, the control rows *float* over the foot of the page as their own raised card.
              In normal flow it sat at the column's bottom edge, where the transcript panel beside
              the page ended up over the run button and swallowed its clicks; floating on its own
              z-plane keeps every control clickable no matter what the layout around the page does.
              The session configuration row wraps independently, keeping its high-frequency
              controls visible without crowding the run, stop, voice, or document controls.
              `pointer-events-none` on the strip, `auto` on the card: the page stays clickable
              either side of the floating bar. */}
          <div className={cn(docMode && "pointer-events-none absolute inset-x-0 bottom-5 z-20 px-6")}>
            <div
              className={cn(
                "flex flex-col gap-1",
                docMode
                  ? "raised-material pointer-events-auto mx-auto w-full max-w-3xl rounded-composer p-2 shadow-raised"
                  : // Keep every outer edge 8px from the controls. The 24px surface radius then
                    // shares its bottom-right centre with the circular send/stop control.
                    "p-2",
              )}
            >
              <SessionControls
                config={config}
                models={models}
                currentModel={currentModel}
                defaultModel={defaultModel}
                onModel={onModel}
                configOptions={configOptions}
                onConfigOption={onConfigOption}
                modelChangeDisabled={running || loading}
                showWorktreePicker={!checkout}
              />
              <div className="flex items-center gap-0.5">
                {controls}
              </div>
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
