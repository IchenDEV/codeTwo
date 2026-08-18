import { useCallback, useEffect, useMemo, useState } from "react";
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
  Trash2,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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

const ACTIVE_RUNS = new Set<AutomationRunStatus>(["starting", "running", "needs_attention"]);
const SPINNING_RUNS = new Set<AutomationRunStatus>(["starting", "running"]);
const BUILTIN_PROVIDERS = new Set([
  "claude_code",
  "codex",
  "grok",
  "cursor",
  "opencode",
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

export function AutomationsPage({
  projects,
  providers,
  defaultProject,
  defaultProvider,
  onClose,
  onOpenSession,
}: {
  projects: Project[];
  providers: ProviderInfo[];
  defaultProject: string;
  defaultProvider: string;
  onClose: () => void;
  onOpenSession: (session: string) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

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

  const selected = useMemo(
    () => automations.find((automation) => automation.id === selectedId) ?? null,
    [automations, selectedId],
  );

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

  const activeRun = runs.find((run) => ACTIVE_RUNS.has(run.status)) ?? null;

  return (
    <div className="animate-page-in flex min-h-0 flex-1 flex-col bg-background">
      <header data-tauri-drag-region className="flex h-14 shrink-0 items-center gap-3 bg-card pl-24 pr-6 pt-2">
        <Button variant="ghost" size="icon-sm" aria-label={t("automations.back")} onClick={onClose}>
          <ArrowLeft className="size-4" />
        </Button>
        <div data-tauri-drag-region className="min-w-0 flex-1">
          <h1 className="text-heading font-semibold">{t("automations.title")}</h1>
          <p className="truncate text-hint text-muted-foreground">{t("automations.subtitle")}</p>
        </div>
        <Button size="compact" onClick={() => setDraft(emptyDraft())} disabled={projects.length === 0}>
          <Plus />
          {t("automations.new")}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <section
          data-automation-list-pane
          className="flex w-72 shrink-0 flex-col bg-sidebar/40 xl:w-80 2xl:w-96"
        >
          <div className="flex items-center justify-between px-6 pb-2 pt-5">
            <h2 className="text-section font-semibold">{t("automations.tasks")}</h2>
            <span className="text-hint text-muted-foreground">{automations.length}</span>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2 px-4 pb-6">
              {loading ? (
                <p className="px-2 py-8 text-ui text-muted-foreground">{t("automations.loading")}</p>
              ) : automations.length === 0 ? (
                <div className="rounded-(--ds-radius-module) bg-card p-5">
                  <CalendarClock className="mb-3 size-4 text-muted-foreground" />
                  <h3 className="text-ui font-medium">{t("automations.empty")}</h3>
                  <p className="mt-1 text-hint leading-relaxed text-muted-foreground">
                    {t("automations.emptyHint")}
                  </p>
                </div>
              ) : (
                automations.map((automation) => {
                  const isSelected = automation.id === selectedId;
                  return (
                    <button
                      key={automation.id}
                      type="button"
                      className={cn(
                        "w-full rounded-(--ds-radius-module) bg-card p-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        isSelected && "bg-accent",
                      )}
                      onClick={() => setSelectedId(automation.id)}
                    >
                      <div className="flex items-start gap-2">
                        <span className={cn("mt-1 size-2 shrink-0 rounded-full", automation.enabled ? "bg-success" : "bg-muted-foreground/40")} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-ui font-medium">{automation.name}</div>
                          <div className="mt-1 flex items-center gap-1.5 text-hint text-muted-foreground">
                            <Clock3 className="size-3" />
                            <span className="truncate">{scheduleLabel(automation.cron)}</span>
                          </div>
                          <div className="mt-1 truncate text-fine text-muted-foreground/80">
                            {automation.enabled
                              ? t("automations.next", { time: dateTime(automation.next_run_at) })
                              : t("automations.paused")}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </section>

        <section data-automation-detail-pane className="@container/automation-detail min-w-0 flex-1">
          {selected ? (
            <ScrollArea className="h-full">
              <div className="mx-auto w-full max-w-4xl px-6 py-6 @3xl/automation-detail:px-8">
                <div className="flex flex-col gap-4 @3xl/automation-detail:flex-row @3xl/automation-detail:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-display font-semibold tracking-tight">{selected.name}</h2>
                      <Badge variant={selected.enabled ? "secondary" : "ghost"}>
                        {selected.enabled ? t("automations.active") : t("automations.paused")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-hint text-muted-foreground">
                      {selected.enabled
                        ? t("automations.next", { time: dateTime(selected.next_run_at) })
                        : t("automations.pausedHint")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="secondary" size="compact" onClick={() => void runNow(selected)} disabled={activeRun !== null}>
                      <Play />
                      {activeRun ? t("automations.inProgress") : t("automations.runNow")}
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={t("automations.edit")} onClick={() => setDraft(editDraft(selected))}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={selected.enabled ? t("automations.pause") : t("automations.resume")} onClick={() => void toggle(selected)}>
                      {selected.enabled ? <Pause /> : <Play />}
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={t("automations.delete")} onClick={() => void remove(selected)}>
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="mt-6 rounded-(--ds-radius-module) bg-card p-4">
                  <h3 className="text-ui font-medium">{t("automations.instructions")}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-ui leading-relaxed text-muted-foreground">{selected.prompt}</p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 @2xl/automation-detail:grid-cols-2">
                  <div className="rounded-(--ds-radius-module) bg-card p-4">
                    <div className="flex items-center gap-2 text-hint text-muted-foreground">
                      <Folder className="size-3.5" />
                      {t("automations.project")}
                    </div>
                    <p className="mt-2 truncate text-ui font-medium" title={selected.project_path}>
                      {projects.find((project) => project.path === selected.project_path)?.name ?? selected.project_path}
                    </p>
                  </div>
                  <div className="rounded-(--ds-radius-module) bg-card p-4">
                    <div className="flex items-center gap-2 text-hint text-muted-foreground">
                      <ProviderIcon provider={providerId(selected.provider)} className="size-3.5" />
                      {t("automations.agent")}
                    </div>
                    <p className="mt-2 text-ui font-medium">{providerLabel(selected.provider)}</p>
                  </div>
                  <div className="rounded-(--ds-radius-module) bg-card p-4">
                    <div className="flex items-center gap-2 text-hint text-muted-foreground">
                      <Clock3 className="size-3.5" />
                      {t("automations.schedule")}
                    </div>
                    <p className="mt-2 text-ui font-medium">{scheduleLabel(selected.cron)}</p>
                    <p className="mt-1 text-fine text-muted-foreground">{selected.timezone}</p>
                  </div>
                  <div className="rounded-(--ds-radius-module) bg-card p-4">
                    <div className="flex items-center gap-2 text-hint text-muted-foreground">
                      <GitBranch className="size-3.5" />
                      {t("automations.workspace")}
                    </div>
                    <p className="mt-2 text-ui font-medium">
                      {selected.use_worktree ? t("automations.isolated") : t("automations.local")}
                    </p>
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-between">
                  <h3 className="text-section font-semibold">{t("automations.history")}</h3>
                  <span className="text-hint text-muted-foreground">{runs.length}</span>
                </div>
                <div className="mt-2 space-y-2 pb-8">
                  {runs.length === 0 ? (
                    <p className="rounded-(--ds-radius-module) bg-card px-4 py-6 text-ui text-muted-foreground">
                      {t("automations.noRuns")}
                    </p>
                  ) : (
                    runs.map((run) => {
                      const Icon = runIcon(run.status);
                      const openable = run.session_id !== null;
                      return (
                        <button
                          key={run.id}
                          type="button"
                          disabled={!openable}
                          className="flex w-full items-start gap-3 rounded-(--ds-radius-module) bg-card px-4 py-3 text-left transition-colors enabled:hover:bg-accent/50 disabled:opacity-80"
                          onClick={() => run.session_id && onOpenSession(run.session_id)}
                        >
                          <Icon className={cn("mt-0.5 size-4 shrink-0", SPINNING_RUNS.has(run.status) && "animate-spin text-primary", run.status === "needs_attention" && "text-warning", run.status === "succeeded" && "text-success", (run.status === "failed" || run.status === "interrupted") && "text-destructive")} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-ui font-medium">{t(`automations.status.${run.status}`)}</span>
                            <span className="mt-0.5 block text-fine text-muted-foreground">{dateTime(run.started_at)}</span>
                            {run.error && <span className="mt-1 block text-hint text-destructive">{run.error}</span>}
                          </span>
                          {openable && <span className="text-hint text-primary">{t("automations.openRun")}</span>}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center">
              <div className="max-w-md">
                <CalendarClock className="mx-auto size-4 text-muted-foreground" />
                <h2 className="mt-3 text-section font-semibold">{t("automations.select")}</h2>
                <p className="mt-1 text-ui leading-relaxed text-muted-foreground">{t("automations.selectHint")}</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {draft && (
        <AutomationDialog
          draft={draft}
          projects={projects}
          providers={providers}
          saving={saving}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => void save()}
        />
      )}
    </div>
  );
}

function AutomationDialog({
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
  const valid =
    draft.name.trim() !== "" &&
    draft.prompt.trim() !== "" &&
    draft.projectPath !== "" &&
    draft.provider !== "" &&
    providers.some((provider) => provider.id === draft.provider && provider.available) &&
    cronFromSchedule(draft.schedule) !== "";

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{draft.id ? t("automations.editTitle") : t("automations.createTitle")}</DialogTitle>
          <DialogDescription>{t("automations.formHint")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="automation-name">{t("automations.name")}</Label>
            <Input id="automation-name" value={draft.name} placeholder={t("automations.namePlaceholder")} onChange={(event) => update("name", event.currentTarget.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="automation-prompt">{t("automations.prompt")}</Label>
            <Textarea id="automation-prompt" rows={6} value={draft.prompt} placeholder={t("automations.promptPlaceholder")} onChange={(event) => update("prompt", event.currentTarget.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>{t("automations.project")}</Label>
              <Select value={draft.projectPath} onValueChange={(value) => value && update("projectPath", value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {projects.map((project) => <SelectItem key={project.path} value={project.path}>{project.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("automations.agent")}</Label>
              <Select value={draft.provider} onValueChange={(value) => value && update("provider", value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>{t("automations.cadence")}</Label>
              <Select value={draft.schedule.cadence} onValueChange={(value) => value && updateSchedule("cadence", value as AutomationCadence)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAY_KEYS.map((key, day) => <SelectItem key={key} value={String(day)}>{t(key)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <p className="text-fine text-muted-foreground">{t("automations.timezone", { timezone: draft.timezone })}</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>{t("automations.permissions")}</Label>
              <Select value={draft.policy} onValueChange={(value) => value && update("policy", value as Draft["policy"])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
        </div>

        <DialogFooter>
          <Button variant="ghost" size="compact" onClick={onCancel}>{t("automations.cancel")}</Button>
          <Button size="compact" disabled={!valid || saving} onClick={onSave}>
            {saving && <LoaderCircle className="animate-spin" />}
            {saving ? t("automations.saving") : t("automations.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
