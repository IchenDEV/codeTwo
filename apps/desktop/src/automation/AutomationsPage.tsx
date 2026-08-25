import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Folder,
  GitBranch,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import {
  confirmNative,
  createAutomation,
  deleteAutomation,
  listAutomationRuns,
  listAutomations,
  onAutomationChanged,
  runAutomationNow,
  setAutomationEnabled,
  updateAutomation,
  type Automation,
  type AutomationInput,
  type AutomationRun,
  type AutomationRunStatus,
  type PermissionMode,
  type Project,
  type ProviderInfo,
  type Sandbox,
} from "../bridge";
import { providerLabel } from "../bridge";
import { useT } from "../i18n";
import { ProviderIcon } from "../providers/ProviderIcon";
import { useToast } from "../ui/toast";
import {
  cronFromSchedule,
  localTimezone,
  scheduleFromCron,
  type AutomationCadence,
  type ScheduleDraft,
} from "./schedule";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LiquidSelectionGroup } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./automations.css";

interface Draft {
  id: string | null;
  name: string;
  prompt: string;
  projectPath: string;
  provider: string;
  schedule: ScheduleDraft;
  timezone: string;
  enabled: boolean;
  useWorktree: boolean;
  policy: "read_only" | "ask" | "automatic";
}

type AutomationFilter = "all" | "active" | "paused";

const ACTIVE_RUNS = new Set<AutomationRunStatus>(["starting", "running", "needs_attention"]);
const SPINNING_RUNS = new Set<AutomationRunStatus>(["starting", "running"]);
const BUILTIN_PROVIDERS = new Set([
  "claude_code",
  "codex",
  "grok",
  "cursor",
  "opencode",
  "opencode2",
  "pi",
  "kimi",
  "zcode",
]);
const WEEKDAY_KEYS = [
  "automations.weekday.0",
  "automations.weekday.1",
  "automations.weekday.2",
  "automations.weekday.3",
  "automations.weekday.4",
  "automations.weekday.5",
  "automations.weekday.6",
] as const;

function providerId(provider: Automation["provider"]): string {
  return typeof provider === "string" ? provider : provider.custom;
}

function policyFromAutomation(automation: Automation): Draft["policy"] {
  if (automation.sandbox_policy === "read_only") return "read_only";
  return automation.permission_mode === "yolo" ? "automatic" : "ask";
}

function inputFromDraft(draft: Draft): AutomationInput {
  let permissionMode: PermissionMode = "ask";
  let sandboxPolicy: Sandbox = "workspace_write";
  if (draft.policy === "read_only") {
    permissionMode = "yolo";
    sandboxPolicy = "read_only";
  } else if (draft.policy === "automatic") {
    permissionMode = "yolo";
  }
  return {
    name: draft.name,
    prompt: draft.prompt,
    projectPath: draft.projectPath,
    provider: BUILTIN_PROVIDERS.has(draft.provider)
      ? draft.provider
      : { custom: draft.provider },
    cron: cronFromSchedule(draft.schedule),
    timezone: draft.timezone,
    enabled: draft.enabled,
    useWorktree: draft.useWorktree,
    permissionMode,
    sandboxPolicy,
  };
}

function dateTime(value: number | null): string {
  if (value === null) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function runIcon(status: AutomationRunStatus) {
  if (status === "succeeded") return CheckCircle2;
  if (status === "failed" || status === "interrupted") return CircleAlert;
  if (status === "needs_attention") return Clock3;
  return LoaderCircle;
}

function AutomationRow({
  automation,
  projectName,
  schedule,
  status,
  selected,
  onSelect,
}: {
  automation: Automation;
  projectName: string;
  schedule: string;
  status: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "group grid w-full grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-x-2 rounded-(--ds-radius-control) px-3 py-2.5 text-left transition-colors hover:bg-accent/55 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        selected && "bg-accent text-foreground",
      )}
    >
      <span className="relative flex items-center justify-center text-muted-foreground">
        <CalendarClock className="size-4" />
        <span
          className={cn(
            "absolute bottom-0 right-0 size-1.5 rounded-full ring-2 ring-sidebar",
            automation.enabled ? "bg-success" : "bg-muted-foreground",
          )}
        />
      </span>
      <span className="min-w-0 truncate text-ui font-medium">{automation.name}</span>
      <span className="text-fine text-muted-foreground">{status}</span>
      <span className="col-start-2 col-end-4 mt-1 flex min-w-0 items-center gap-2 text-fine text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{schedule}</span>
        <span className="truncate">{projectName}</span>
      </span>
    </button>
  );
}

function DetailMetric({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] items-start gap-3 text-ui">
      <span className="flex items-center gap-2 text-muted-foreground">{icon}{label}</span>
      <span className="min-w-0 text-foreground/90">{children}</span>
    </div>
  );
}

export function AutomationsPage({
  projects,
  providers,
  defaultProject,
  defaultProvider,
  onOpenSession,
  headerLeadingAction,
}: {
  projects: Project[];
  providers: ProviderInfo[];
  defaultProject: string;
  defaultProvider: string;
  onOpenSession: (session: string) => void;
  headerLeadingAction?: ReactNode;
}) {
  const t = useT();
  const toast = useToast();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AutomationFilter>("all");
  const [detailTab, setDetailTab] = useState<"overview" | "runs">("overview");
  const [compactListVisible, setCompactListVisible] = useState(true);

  const scheduleLabel = (cron: string): string => {
    const schedule = scheduleFromCron(cron);
    if (schedule.cadence === "custom") return cron;
    if (schedule.cadence === "hourly") {
      return `${t("automations.cadence.hourly")} · :${schedule.time.slice(3)}`;
    }
    if (schedule.cadence === "weekly") {
      return `${t("automations.cadence.weekly")} · ${t(WEEKDAY_KEYS[schedule.weekday])} ${schedule.time}`;
    }
    return `${t(`automations.cadence.${schedule.cadence}`)} · ${schedule.time}`;
  };

  const filteredAutomations = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return automations.filter((automation) => {
      if (filter === "active" && !automation.enabled) return false;
      if (filter === "paused" && automation.enabled) return false;
      if (normalizedQuery === "") return true;
      return `${automation.name}\n${automation.prompt}`.toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [automations, filter, query]);

  const groups = useMemo(() => {
    const active = filteredAutomations.filter((automation) => automation.enabled);
    const paused = filteredAutomations.filter((automation) => !automation.enabled);
    return [
      { id: "active" as const, items: active },
      { id: "paused" as const, items: paused },
    ].filter((group) => group.items.length > 0);
  }, [filteredAutomations]);
  const refresh = useCallback(async () => {
    const next = await listAutomations();
    setAutomations(next);
    setSelectedId((current) =>
      current && next.some((automation) => automation.id === current)
        ? current
        : next[0]?.id ?? null,
    );
    setLoading(false);
  }, []);

  const refreshRuns = useCallback(async (id: string | null) => {
    setRuns(id ? await listAutomationRuns(id) : []);
  }, []);

  useEffect(() => {
    void refresh().catch((error) => {
      setLoading(false);
      toast(t("automations.loadFailed", { error: String(error) }), "error");
    });
    let unlisten: (() => void) | null = null;
    void onAutomationChanged(() => {
      void refresh();
      void refreshRuns(selectedId);
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, [refresh, refreshRuns, selectedId, t, toast]);

  useEffect(() => {
    void refreshRuns(selectedId);
  }, [refreshRuns, selectedId]);

  useEffect(() => {
    if (draft) return;
    if (selectedId && filteredAutomations.some((automation) => automation.id === selectedId)) return;
    setSelectedId(filteredAutomations[0]?.id ?? null);
    setDetailTab("overview");
  }, [draft, filteredAutomations, selectedId]);

  const emptyDraft = (): Draft => ({
    id: null,
    name: "",
    prompt: "",
    projectPath: defaultProject || projects[0]?.path || "",
    provider:
      providers.find((candidate) => candidate.id === defaultProvider && candidate.available)?.id ??
      providers.find((candidate) => candidate.available)?.id ??
      defaultProvider,
    schedule: { cadence: "daily", time: "09:00", weekday: 1, customCron: "" },
    timezone: localTimezone(),
    enabled: true,
    useWorktree: true,
    policy: "automatic",
  });

  const editDraft = (automation: Automation): Draft => ({
    id: automation.id,
    name: automation.name,
    prompt: automation.prompt,
    projectPath: automation.project_path,
    provider: providerId(automation.provider),
    schedule: scheduleFromCron(automation.cron),
    timezone: automation.timezone,
    enabled: automation.enabled,
    useWorktree: automation.use_worktree,
    policy: policyFromAutomation(automation),
  });

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = draft.id
        ? await updateAutomation(draft.id, inputFromDraft(draft))
        : await createAutomation(inputFromDraft(draft));
      setDraft(null);
      await refresh();
      setSelectedId(saved.id);
      toast(t(draft.id ? "automations.updated" : "automations.created"), "success");
    } catch (error) {
      toast(t("automations.saveFailed", { error: String(error) }), "error");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (automation: Automation) => {
    try {
      await setAutomationEnabled(automation.id, !automation.enabled);
      await refresh();
    } catch (error) {
      toast(t("automations.saveFailed", { error: String(error) }), "error");
    }
  };

  const runNow = async (automation: Automation) => {
    try {
      await runAutomationNow(automation.id);
      await refresh();
      await refreshRuns(automation.id);
      toast(t("automations.started"), "success");
    } catch (error) {
      toast(t("automations.runFailed", { error: String(error) }), "error");
    }
  };

  const remove = async (automation: Automation) => {
    if (!(await confirmNative(t("automations.deleteConfirm", { name: automation.name })))) return;
    try {
      await deleteAutomation(automation.id);
      await refresh();
      toast(t("automations.deleted"), "success");
    } catch (error) {
      toast(t("automations.deleteFailed", { error: String(error) }), "error");
    }
  };

  const selected = automations.find((automation) => automation.id === selectedId) ?? null;
  const activeRun = runs.find((run) => ACTIVE_RUNS.has(run.status)) ?? null;
  const projectName = (automation: Automation) =>
    projects.find((project) => project.path === automation.project_path)?.name ?? automation.project_path;

  const beginCreate = () => {
    setDraft(emptyDraft());
    setDetailTab("overview");
    setCompactListVisible(false);
  };

  return (
    <section
      data-automation-page
      data-compact-detail={(selectedId !== null || draft !== null) && !compactListVisible}
      className="automations-page animate-page-in flex min-h-0 min-w-0 flex-1 bg-background text-foreground"
      aria-label={t("automations.title")}
    >
      <div data-automation-list-pane className="automation-list-pane flex min-h-0 shrink-0 flex-col bg-sidebar">
        <header className="electrobun-webkit-app-region-drag flex shrink-0 items-center gap-2 px-3 py-2.5">
          {headerLeadingAction ? <div data-automation-leading-action>{headerLeadingAction}</div> : null}
          <LiquidSelectionGroup data-automation-filters role="tablist" aria-label={t("automations.filterLabel")} className="flex h-(--ds-control-normal) items-center gap-1">
            {(["all", "active", "paused"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                className={cn(
                  "h-(--ds-control-normal) rounded-(--ds-radius-control) px-2.5 text-ui text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  filter === value && "font-medium text-foreground hover:bg-transparent",
                )}
                onClick={() => setFilter(value)}
              >
                {t(`automations.filter.${value}`)}
              </button>
            ))}
          </LiquidSelectionGroup>
          <div className="electrobun-webkit-app-region-drag flex-1" />
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={t("automations.new")} onClick={beginCreate} disabled={projects.length === 0}><Plus className="size-3.5" /></Button>} />
            <TooltipContent>{t("automations.new")}</TooltipContent>
          </Tooltip>
        </header>

        <div className="flex shrink-0 items-center gap-2 px-4 py-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-automation-search
              type="search"
              size="compact"
              className="pl-8 pr-8"
              value={query}
              placeholder={t("automations.searchPlaceholder")}
              aria-label={t("automations.searchPlaceholder")}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            {query !== "" && (
              <Button variant="ghost" size="icon-xs" className="absolute right-1 top-1/2 -translate-y-1/2" aria-label={t("automations.clearSearch")} onClick={() => setQuery("")}>
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-3 pb-4" aria-live="polite">
            {loading && automations.length === 0 ? (
              <div role="status" className="flex items-center justify-center gap-2 py-12 text-ui text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("automations.loading")}</div>
            ) : automations.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-ui text-muted-foreground">
                <CalendarClock className="size-4" />
                <p>{t("automations.empty")}</p>
                <Button variant="secondary" size="compact" onClick={beginCreate} disabled={projects.length === 0}><Plus className="size-3.5" />{t("automations.new")}</Button>
              </div>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-ui text-muted-foreground"><Search className="size-4" /><p>{t("automations.noMatches")}</p></div>
            ) : groups.map((group) => (
              <section key={group.id} className="pt-2">
                <h2 className="px-3 pb-1 text-fine font-medium text-muted-foreground">{t(`automations.${group.id}`)}</h2>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((automation) => (
                    <AutomationRow
                      key={automation.id}
                      automation={automation}
                      projectName={projectName(automation)}
                      schedule={scheduleLabel(automation.cron)}
                      status={automation.enabled ? dateTime(automation.next_run_at) : t("automations.paused")}
                      selected={automation.id === selectedId && draft === null}
                      onSelect={() => { setDraft(null); setSelectedId(automation.id); setDetailTab("overview"); setCompactListVisible(false); }}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div data-automation-detail-pane className="automation-detail-pane flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <header className="electrobun-webkit-app-region-drag flex shrink-0 items-center gap-2 px-4 py-2.5">
          {(selectedId || draft) && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="automation-back"
              aria-label={t("automations.backToList")}
              onClick={() => { if (draft) setDraft(null); setCompactListVisible(true); }}
            >
              <ArrowLeft className="size-3.5" />
            </Button>
          )}
          {draft ? (
            <span className="text-ui font-medium">{draft.id ? t("automations.editTitle") : t("automations.createTitle")}</span>
          ) : (
            <LiquidSelectionGroup role="tablist" aria-label={t("automations.detailViews")} className="flex h-(--ds-control-normal) items-center gap-1">
              {(["overview", "runs"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={detailTab === value}
                  disabled={!selected}
                  onClick={() => setDetailTab(value)}
                  className={cn(
                    "h-(--ds-control-normal) rounded-(--ds-radius-control) px-2.5 text-ui text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
                    detailTab === value && "font-medium text-foreground hover:bg-transparent",
                  )}
                >
                  {t(`automations.detail.${value}`)}
                </button>
              ))}
            </LiquidSelectionGroup>
          )}
          <div className="electrobun-webkit-app-region-drag flex-1" />
          {selected && !draft ? (
            <>
              <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={t("automations.edit")} onClick={() => setDraft(editDraft(selected))}><Pencil className="size-3.5" /></Button>} /><TooltipContent>{t("automations.edit")}</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={selected.enabled ? t("automations.pause") : t("automations.resume")} onClick={() => void toggle(selected)}>{selected.enabled ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</Button>} /><TooltipContent>{selected.enabled ? t("automations.pause") : t("automations.resume")}</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={t("automations.delete")} onClick={() => void remove(selected)}><Trash2 className="size-3.5 text-destructive" /></Button>} /><TooltipContent>{t("automations.delete")}</TooltipContent></Tooltip>
              <Button variant="secondary" size="compact" disabled={activeRun !== null} onClick={() => void runNow(selected)}>
                {activeRun ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                {activeRun ? t("automations.inProgress") : t("automations.runNow")}
              </Button>
            </>
          ) : null}
        </header>

        {draft ? (
          <ScrollArea className="min-h-0 flex-1">
            <AutomationEditor
              draft={draft}
              projects={projects}
              providers={providers}
              saving={saving}
              onChange={setDraft}
              onCancel={() => setDraft(null)}
              onSave={() => void save()}
            />
          </ScrollArea>
        ) : !selected ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-ui text-muted-foreground">
            <div><CalendarClock className="mx-auto mb-3 size-4" /><p>{t("automations.select")}</p></div>
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            {detailTab === "overview" ? (
              <article className="mx-auto w-full max-w-5xl px-8 pb-12 pt-5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h1 className="text-page font-semibold leading-tight text-foreground">{selected.name}</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-ui text-muted-foreground">
                      <span className="flex items-center gap-1.5"><ProviderIcon provider={providerId(selected.provider)} className="size-4" />{providerLabel(selected.provider)}</span>
                      <span>·</span>
                      <span>{scheduleLabel(selected.cron)}</span>
                      <span>·</span>
                      <span>{selected.enabled ? t("automations.next", { time: dateTime(selected.next_run_at) }) : t("automations.paused")}</span>
                    </div>
                  </div>
                  {activeRun ? <LoaderCircle className="size-4 animate-spin text-primary" /> : null}
                </div>

                <div className="mt-8 grid gap-4">
                  <DetailMetric icon={<Folder className="size-3.5" />} label={t("automations.project")}><span title={selected.project_path}>{projectName(selected)}</span></DetailMetric>
                  <DetailMetric icon={<ProviderIcon provider={providerId(selected.provider)} className="size-3.5" />} label={t("automations.agent")}>{providerLabel(selected.provider)}</DetailMetric>
                  <DetailMetric icon={<Clock3 className="size-3.5" />} label={t("automations.schedule")}><span>{scheduleLabel(selected.cron)}</span><span className="ml-2 text-fine text-muted-foreground">{selected.timezone}</span></DetailMetric>
                  <DetailMetric icon={<GitBranch className="size-3.5" />} label={t("automations.workspace")}>{selected.use_worktree ? t("automations.isolated") : t("automations.local")}</DetailMetric>
                  <DetailMetric icon={<CalendarClock className="size-3.5" />} label={t("automations.status")}><span className="inline-flex items-center gap-1.5"><span className={cn("size-2 rounded-full", selected.enabled ? "bg-success" : "bg-muted-foreground")} />{selected.enabled ? t("automations.active") : t("automations.paused")}</span></DetailMetric>
                </div>

                <section className="mt-8">
                  <h2 className="mb-4 text-dialog font-semibold">{t("automations.instructions")}</h2>
                  <p className="whitespace-pre-wrap text-ui leading-relaxed text-foreground/90">{selected.prompt}</p>
                </section>
              </article>
            ) : (
              <div className="mx-auto w-full max-w-5xl px-6 pb-10 pt-5">
                <div className="mb-4 flex items-center gap-2"><Clock3 className="size-4 text-muted-foreground" /><h1 className="text-section font-semibold">{t("automations.history")}</h1><span className="text-fine tabular-nums text-muted-foreground">{runs.length}</span></div>
                {runs.length === 0 ? (
                  <p className="py-8 text-ui text-muted-foreground">{t("automations.noRuns")}</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {runs.map((run) => {
                      const Icon = runIcon(run.status);
                      const openable = run.session_id !== null;
                      return (
                        <button
                          key={run.id}
                          type="button"
                          disabled={!openable}
                          className="grid min-h-(--ds-control-field) w-full grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-(--ds-radius-control) bg-fill-quiet px-3 py-2 text-left text-ui transition-colors enabled:hover:bg-accent/60 disabled:opacity-80"
                          onClick={() => run.session_id && onOpenSession(run.session_id)}
                        >
                          <Icon className={cn("size-4", SPINNING_RUNS.has(run.status) && "animate-spin text-primary", run.status === "needs_attention" && "text-warning", run.status === "succeeded" && "text-success", (run.status === "failed" || run.status === "interrupted") && "text-destructive")} />
                          <span className="min-w-0"><span className="block font-medium">{t(`automations.status.${run.status}`)}</span><span className="block text-fine text-muted-foreground">{dateTime(run.started_at)}</span>{run.error ? <span className="mt-1 block text-hint text-destructive">{run.error}</span> : null}</span>
                          {openable ? <span className="text-hint text-primary">{t("automations.openRun")}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        )}
      </div>
    </section>
  );
}

function AutomationEditor({
  draft,
  projects,
  providers,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft;
  projects: Project[];
  providers: ProviderInfo[];
  saving: boolean;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useT();
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  const updateSchedule = <K extends keyof ScheduleDraft>(key: K, value: ScheduleDraft[K]) =>
    update("schedule", { ...draft.schedule, [key]: value });
  const selectedProject = projects.find((project) => project.path === draft.projectPath)?.name ?? draft.projectPath;
  const selectedProvider = providers.find((provider) => provider.id === draft.provider)?.display_name ?? draft.provider;
  const selectedPolicy = draft.policy === "automatic"
    ? t("automations.permissions.auto")
    : draft.policy === "ask"
      ? t("automations.permissions.ask")
      : t("automations.permissions.readOnly");
  const valid =
    draft.name.trim() !== "" &&
    draft.prompt.trim() !== "" &&
    draft.projectPath !== "" &&
    draft.provider !== "" &&
    providers.some((provider) => provider.id === draft.provider && provider.available) &&
    cronFromSchedule(draft.schedule) !== "";

  return (
    <section data-automation-editor className="mx-auto w-full max-w-5xl px-8 pb-12 pt-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-page font-semibold leading-tight">{draft.id ? draft.name : t("automations.createTitle")}</h1>
          <p className="mt-2 max-w-2xl text-ui leading-relaxed text-muted-foreground">{t("automations.formHint")}</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={t("automations.cancel")} onClick={onCancel}>
          <X />
        </Button>
      </div>

      <form
        className="mt-7 grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && !saving) onSave();
        }}
      >
          <div className="grid gap-2">
            <Label htmlFor="automation-name">{t("automations.name")}</Label>
            <Input id="automation-name" value={draft.name} placeholder={t("automations.namePlaceholder")} onChange={(event) => update("name", event.currentTarget.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="automation-prompt">{t("automations.prompt")}</Label>
            <Textarea id="automation-prompt" rows={6} value={draft.prompt} placeholder={t("automations.promptPlaceholder")} onChange={(event) => update("prompt", event.currentTarget.value)} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("automations.project")}</Label>
              <Select value={draft.projectPath} onValueChange={(value) => value && update("projectPath", value)}>
                <SelectTrigger className="w-full"><SelectValue>{selectedProject}</SelectValue></SelectTrigger>
                <SelectContent>
                  {projects.map((project) => <SelectItem key={project.path} value={project.path}>{project.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("automations.agent")}</Label>
              <Select value={draft.provider} onValueChange={(value) => value && update("provider", value)}>
                <SelectTrigger className="w-full"><SelectValue>{selectedProvider}</SelectValue></SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id} disabled={!provider.available}>
                      {provider.display_name}{provider.available ? "" : ` · ${t("settings.notInstalled")}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("automations.cadence")}</Label>
              <Select value={draft.schedule.cadence} onValueChange={(value) => value && updateSchedule("cadence", value as AutomationCadence)}>
                <SelectTrigger className="w-full"><SelectValue>{t(`automations.cadence.${draft.schedule.cadence}`)}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">{t("automations.cadence.hourly")}</SelectItem>
                  <SelectItem value="daily">{t("automations.cadence.daily")}</SelectItem>
                  <SelectItem value="weekdays">{t("automations.cadence.weekdays")}</SelectItem>
                  <SelectItem value="weekly">{t("automations.cadence.weekly")}</SelectItem>
                  <SelectItem value="custom">{t("automations.cadence.custom")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draft.schedule.cadence === "custom" ? (
              <div className="grid gap-2">
                <Label htmlFor="automation-cron">{t("automations.cron")}</Label>
                <Input id="automation-cron" className="font-mono" value={draft.schedule.customCron} placeholder="0 9 * * 1-5" onChange={(event) => updateSchedule("customCron", event.currentTarget.value)} />
              </div>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="automation-time">{draft.schedule.cadence === "hourly" ? t("automations.minute") : t("automations.time")}</Label>
                <Input id="automation-time" type="time" value={draft.schedule.time} onChange={(event) => updateSchedule("time", event.currentTarget.value)} />
              </div>
            )}
          </div>

          {draft.schedule.cadence === "weekly" && (
            <div className="grid gap-2">
              <Label>{t("automations.weekday")}</Label>
              <Select value={String(draft.schedule.weekday)} onValueChange={(value) => value !== null && updateSchedule("weekday", Number(value))}>
                <SelectTrigger className="w-full"><SelectValue>{t(WEEKDAY_KEYS[draft.schedule.weekday])}</SelectValue></SelectTrigger>
                <SelectContent>
                  {WEEKDAY_KEYS.map((key, day) => <SelectItem key={key} value={String(day)}>{t(key)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <p className="text-fine text-muted-foreground">{t("automations.timezone", { timezone: draft.timezone })}</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("automations.permissions")}</Label>
              <Select value={draft.policy} onValueChange={(value) => value && update("policy", value as Draft["policy"])}>
                <SelectTrigger className="w-full"><SelectValue>{selectedPolicy}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">{t("automations.permissions.auto")}</SelectItem>
                  <SelectItem value="ask">{t("automations.permissions.ask")}</SelectItem>
                  <SelectItem value="read_only">{t("automations.permissions.readOnly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid content-start gap-3 pt-6">
              <Label className="items-start leading-relaxed">
                <Checkbox checked={draft.useWorktree} onCheckedChange={(checked) => update("useWorktree", checked === true)} />
                <span>
                  {t("automations.useWorktree")}
                  <span className="mt-0.5 block text-fine font-normal text-muted-foreground">{t("automations.useWorktreeHint")}</span>
                </span>
              </Label>
            </div>
          </div>

        <div className="h-px bg-border" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="compact" onClick={onCancel}>{t("automations.cancel")}</Button>
          <Button type="submit" size="compact" disabled={!valid || saving}>
            {saving && <LoaderCircle className="animate-spin" />}
            {saving ? t("automations.saving") : t("automations.save")}
          </Button>
        </div>
      </form>
    </section>
  );
}
