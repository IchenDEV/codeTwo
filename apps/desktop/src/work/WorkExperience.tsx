import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  ExternalLink,
  FileOutput,
  FileText,
  Folder,
  FolderPlus,
  History,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Search,
  Settings,
  SquarePen,
  Store,
} from "lucide-react";

import {
  createWorkTask,
  ensureWorkWorkspace,
  getWorkBrief,
  listWorkChanges,
  listWorkDeliverables,
  listWorkRuns,
  listWorkTasks,
  listWorkWorkspaces,
  renameWorkTask,
  saveWorkBrief,
  type Project,
  type WorkBriefRevision,
  type WorkBriefSaveResult,
  type WorkDeliverable,
  type WorkPage,
  type WorkRun,
  type WorkRunChange,
  type WorkTask,
  type WorkTaskStatus,
  type WorkVersioned,
  type WorkWorkspace,
} from "../bridge";
import { ExperienceSwitcher, type AppExperience } from "./ExperienceSwitcher";
import { ProviderIcon } from "../providers/ProviderIcon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface WorkExperienceApi {
  listWorkspaces: () => Promise<WorkPage<WorkWorkspace>>;
  ensureWorkspace: (path: string, name: string) => Promise<WorkVersioned<WorkWorkspace>>;
  listTasks: (workspaceId: string) => Promise<WorkPage<WorkTask>>;
  createTask: (workspaceId: string, title: string) => Promise<WorkVersioned<WorkTask>>;
  renameTask: (taskId: string, title: string, expectedRevision: number) => Promise<WorkVersioned<WorkTask>>;
  getBrief: (taskId: string) => Promise<WorkVersioned<WorkBriefRevision> | null>;
  saveBrief: (taskId: string, text: string, expectedRevision: number | null) => Promise<WorkBriefSaveResult>;
  listRuns: (taskId: string) => Promise<WorkPage<WorkRun>>;
  listDeliverables: (taskId: string) => Promise<WorkPage<WorkDeliverable>>;
  listChanges: (taskId: string) => Promise<WorkPage<WorkRunChange>>;
}

export const desktopWorkApi: WorkExperienceApi = {
  listWorkspaces: listWorkWorkspaces,
  ensureWorkspace: ensureWorkWorkspace,
  listTasks: listWorkTasks,
  createTask: createWorkTask,
  renameTask: renameWorkTask,
  getBrief: getWorkBrief,
  saveBrief: saveWorkBrief,
  listRuns: listWorkRuns,
  listDeliverables: listWorkDeliverables,
  listChanges: listWorkChanges,
};

const STATUS_ORDER: WorkTaskStatus[] = [
  "active",
  "waiting",
  "review",
  "draft",
  "failed",
  "completed",
  "cancelled",
];

const STATUS_LABEL: Record<WorkTaskStatus, string> = {
  draft: "Draft",
  active: "Active",
  waiting: "Waiting",
  review: "Review",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function statusDot(status: WorkTaskStatus): string {
  if (status === "active" || status === "completed") return "bg-success";
  if (status === "waiting" || status === "review" || status === "draft") return "bg-warning";
  if (status === "failed" || status === "cancelled") return "bg-destructive";
  return "bg-muted-foreground";
}

function briefText(brief: WorkVersioned<WorkBriefRevision> | null): string {
  return brief?.entity.blocks.map((block) => {
    switch (block.type) {
      case "text": return block.text;
      case "skill": return `[skill:${block.skill_id}]`;
      case "file": return `[@${block.path}]`;
      case "image": return `[image:${block.path}]`;
      case "canvas": return `[canvas:${block.id}@${block.frozen_revision}]`;
      case "session": return `[chat:${block.session_id.slice(0, 8)}]`;
    }
  }).join("\n\n") ?? "";
}

function runState(run: WorkRun): string {
  switch (run.activity.state.kind) {
    case "running": return "in progress";
    case "awaiting_input": return "Waiting";
    case "failed": return "Failed";
    case "idle": return "Completed";
  }
}

function workspaceName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? "Workspace";
}

function replaceTask(
  tasks: WorkVersioned<WorkTask>[],
  next: WorkVersioned<WorkTask>,
): WorkVersioned<WorkTask>[] {
  return tasks.map((task) => task.entity.id === next.entity.id ? next : task);
}

export interface WorkExperienceState {
  workspaces: WorkVersioned<WorkWorkspace>[];
  workspaceId: string | null;
  activeWorkspace: WorkVersioned<WorkWorkspace> | null;
  tasks: WorkVersioned<WorkTask>[];
  activeTaskId: string | null;
  activeTask: WorkVersioned<WorkTask> | null;
  detailTaskId: string | null;
  brief: WorkVersioned<WorkBriefRevision> | null;
  runs: WorkVersioned<WorkRun>[];
  deliverables: WorkVersioned<WorkDeliverable>[];
  changes: WorkVersioned<WorkRunChange>[];
  titleDraft: string;
  briefDraft: string;
  dirty: boolean;
  taskFilter: string;
  loading: boolean;
  saving: boolean;
  notice: { kind: "error" | "success"; text: string } | null;
  newTaskOpen: boolean;
  newTaskTitle: string;
  groupedTasks: Array<{ status: WorkTaskStatus; tasks: WorkVersioned<WorkTask>[] }>;
  setTaskFilter: (value: string) => void;
  setActiveTaskId: (value: string | null) => void;
  setTitleDraft: (value: string) => void;
  setBriefDraft: (value: string) => void;
  setNewTaskOpen: (value: boolean) => void;
  setNewTaskTitle: (value: string) => void;
  selectWorkspace: (id: string) => void;
  createTask: () => Promise<void>;
  saveTask: () => Promise<boolean>;
  refreshActiveTask: () => Promise<void>;
}

/**
 * Work owns durable Task/Brief projections, but deliberately does not own a second conversation
 * runtime. App renders this state around the existing transcript and Composer so Code and Work use
 * one provider/model/session implementation.
 */
export function useWorkExperience({
  projects,
  activeProject,
  onSelectProject,
  api = desktopWorkApi,
}: {
  projects: Project[];
  activeProject: string | null;
  onSelectProject: (path: string) => void;
  api?: WorkExperienceApi;
}): WorkExperienceState {
  const [workspaces, setWorkspaces] = useState<WorkVersioned<WorkWorkspace>[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<WorkVersioned<WorkTask>[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [brief, setBrief] = useState<WorkVersioned<WorkBriefRevision> | null>(null);
  const [runs, setRuns] = useState<WorkVersioned<WorkRun>[]>([]);
  const [deliverables, setDeliverables] = useState<WorkVersioned<WorkDeliverable>[]>([]);
  const [changes, setChanges] = useState<WorkVersioned<WorkRunChange>[]>([]);
  const [titleDraft, setTitleDraft] = useState("");
  const [briefDraft, setBriefDraft] = useState("");
  const [savedTitle, setSavedTitle] = useState("");
  const [savedBrief, setSavedBrief] = useState("");
  const [taskFilter, setTaskFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const activeWorkspace = workspaces.find((workspace) => workspace.entity.id === workspaceId) ?? null;
  const activeTask = tasks.find((task) => task.entity.id === activeTaskId) ?? null;
  const dirty = Boolean(activeTask) && (titleDraft.trim() !== savedTitle || briefDraft !== savedBrief);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotice(null);
    void (async () => {
      try {
        let ensured: WorkVersioned<WorkWorkspace> | null = null;
        if (activeProject) {
          const project = projects.find((item) => item.path === activeProject);
          ensured = await api.ensureWorkspace(activeProject, project?.name ?? workspaceName(activeProject));
        }
        const page = await api.listWorkspaces();
        if (cancelled) return;
        const next = ensured && !page.items.some((item) => item.entity.id === ensured?.entity.id)
          ? [...page.items, ensured]
          : page.items;
        setWorkspaces(next);
        setWorkspaceId((current) => {
          if (ensured) return ensured.entity.id;
          if (current && next.some((item) => item.entity.id === current)) return current;
          return next[0]?.entity.id ?? null;
        });
      } catch (error) {
        if (!cancelled) setNotice({ kind: "error", text: String(error) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeProject, api, projects]);

  useEffect(() => {
    if (!workspaceId) {
      setTasks([]);
      setActiveTaskId(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void api.listTasks(workspaceId)
      .then((page) => {
        if (cancelled) return;
        const next = page.items.filter((task) => task.entity.experience === "work");
        setTasks(next);
        setActiveTaskId((current) => current && next.some((task) => task.entity.id === current)
          ? current
          : next[0]?.entity.id ?? null);
      })
      .catch((error) => {
        if (!cancelled) setNotice({ kind: "error", text: String(error) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [api, workspaceId]);

  const loadTaskDetails = useCallback(async (taskId: string) => {
    const [nextBrief, nextRuns, nextDeliverables, nextChanges] = await Promise.all([
      api.getBrief(taskId),
      api.listRuns(taskId),
      api.listDeliverables(taskId),
      api.listChanges(taskId),
    ]);
    return { nextBrief, nextRuns, nextDeliverables, nextChanges };
  }, [api]);

  useEffect(() => {
    if (!activeTask) {
      setDetailTaskId(null);
      setBrief(null);
      setRuns([]);
      setDeliverables([]);
      setChanges([]);
      setTitleDraft("");
      setBriefDraft("");
      setSavedTitle("");
      setSavedBrief("");
      return;
    }
    const taskId = activeTask.entity.id;
    let cancelled = false;
    setLoading(true);
    setDetailTaskId(null);
    setNotice(null);
    setTitleDraft(activeTask.entity.title);
    setSavedTitle(activeTask.entity.title);
    void loadTaskDetails(taskId).then(({ nextBrief, nextRuns, nextDeliverables, nextChanges }) => {
      if (cancelled) return;
      const text = briefText(nextBrief);
      setBrief(nextBrief);
      setBriefDraft(text);
      setSavedBrief(text);
      setRuns(nextRuns.items);
      setDeliverables(nextDeliverables.items);
      setChanges(nextChanges.items);
      setDetailTaskId(taskId);
    }).catch((error) => {
      if (!cancelled) setNotice({ kind: "error", text: String(error) });
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeTask?.entity.id, loadTaskDetails]);

  const refreshActiveTask = useCallback(async () => {
    const taskId = activeTaskId;
    if (!taskId) return;
    try {
      const { nextBrief, nextRuns, nextDeliverables, nextChanges } = await loadTaskDetails(taskId);
      setBrief(nextBrief);
      setRuns(nextRuns.items);
      setDeliverables(nextDeliverables.items);
      setChanges(nextChanges.items);
      setDetailTaskId(taskId);
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    }
  }, [activeTaskId, loadTaskDetails]);

  const groupedTasks = useMemo(() => {
    const query = taskFilter.trim().toLocaleLowerCase();
    const visible = tasks.filter((task) => !query || task.entity.title.toLocaleLowerCase().includes(query));
    return STATUS_ORDER.map((status) => ({
      status,
      tasks: visible
        .filter((task) => task.entity.status === status)
        .sort((left, right) => right.entity.updated_at - left.entity.updated_at),
    })).filter((group) => group.tasks.length > 0);
  }, [taskFilter, tasks]);

  const saveTask = useCallback(async (): Promise<boolean> => {
    if (!activeTask || saving) return false;
    const title = titleDraft.trim();
    if (!title) {
      setNotice({ kind: "error", text: "Task title cannot be empty." });
      return false;
    }
    setSaving(true);
    setNotice(null);
    try {
      let nextTask = activeTask;
      if (title !== savedTitle) {
        nextTask = await api.renameTask(activeTask.entity.id, title, nextTask.revision);
        setTasks((current) => replaceTask(current, nextTask));
      }
      if (briefDraft !== savedBrief) {
        const result = await api.saveBrief(activeTask.entity.id, briefDraft, brief?.revision ?? null);
        setBrief(result.brief);
        nextTask = result.task;
        setTasks((current) => replaceTask(current, result.task));
      }
      setSavedTitle(nextTask.entity.title);
      setTitleDraft(nextTask.entity.title);
      setSavedBrief(briefDraft);
      setNotice({ kind: "success", text: "Brief saved" });
      return true;
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
      return false;
    } finally {
      setSaving(false);
    }
  }, [activeTask, api, brief?.revision, briefDraft, savedBrief, savedTitle, saving, titleDraft]);

  const createTask = useCallback(async () => {
    if (!workspaceId || !newTaskTitle.trim()) return;
    setSaving(true);
    setNotice(null);
    try {
      const created = await api.createTask(workspaceId, newTaskTitle.trim());
      setTasks((current) => [created, ...current]);
      setActiveTaskId(created.entity.id);
      setNewTaskTitle("");
      setNewTaskOpen(false);
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setSaving(false);
    }
  }, [api, newTaskTitle, workspaceId]);

  const selectWorkspace = useCallback((nextId: string) => {
    setWorkspaceId(nextId);
    const root = workspaces.find((workspace) => workspace.entity.id === nextId)?.entity.root_path;
    if (root && projects.some((project) => project.path === root)) onSelectProject(root);
  }, [onSelectProject, projects, workspaces]);

  return {
    workspaces,
    workspaceId,
    activeWorkspace,
    tasks,
    activeTaskId,
    activeTask,
    detailTaskId,
    brief,
    runs,
    deliverables,
    changes,
    titleDraft,
    briefDraft,
    dirty,
    taskFilter,
    loading,
    saving,
    notice,
    newTaskOpen,
    newTaskTitle,
    groupedTasks,
    setTaskFilter,
    setActiveTaskId,
    setTitleDraft,
    setBriefDraft,
    setNewTaskOpen,
    setNewTaskTitle,
    selectWorkspace,
    createTask,
    saveTask,
    refreshActiveTask,
  };
}

export function WorkTaskRail({
  work,
  collapsed,
  overlay,
  onToggleCollapse,
  onExperience,
  onAddProject,
  provider,
  providerLabel,
  onOpenMarket,
  onOpenSettings,
}: {
  work: WorkExperienceState;
  collapsed: boolean;
  overlay: boolean;
  onToggleCollapse: () => void;
  onExperience: (experience: AppExperience) => void;
  onAddProject: () => void;
  provider: string;
  providerLabel: string;
  onOpenMarket: () => void;
  onOpenSettings: () => void;
}) {
  const applied = 330;
  const taskGroups = [
    {
      label: "Tasks",
      tasks: work.groupedTasks
        .filter((group) => !["completed", "cancelled"].includes(group.status))
        .flatMap((group) => group.tasks),
    },
    {
      label: "Completed",
      tasks: work.groupedTasks
        .filter((group) => ["completed", "cancelled"].includes(group.status))
        .flatMap((group) => group.tasks),
    },
  ].filter((group) => group.tasks.length > 0);
  return (
    <aside
      aria-hidden={collapsed}
      className={cn(
        "glass-rail relative flex shrink-0 flex-col overflow-hidden",
        overlay && "fixed inset-y-0 left-0 z-50",
        collapsed && "invisible w-0",
      )}
      style={{ width: collapsed ? 0 : applied }}
    >
      <div className="flex min-h-0 flex-1 flex-col" style={{ width: applied }}>
        <div data-tauri-drag-region className="window-titlebar work-rail-title flex shrink-0 items-center gap-1 pr-2">
          <span data-tauri-drag-region className="min-w-0 truncate text-title font-semibold">CodeTwo</span>
          <div data-tauri-drag-region className="min-w-0 flex-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" aria-label="Collapse sidebar" onClick={onToggleCollapse}>
                <PanelLeft className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Collapse sidebar</TooltipContent>
          </Tooltip>
        </div>

        <div className="px-3 pb-1 pt-2">
          <ExperienceSwitcher value="work" onChange={onExperience} />
        </div>
        <div className="flex items-center gap-1.5 px-3 pb-1 pt-3">
          <label className="work-control flex min-w-0 flex-1 items-center gap-2 border bg-background px-2.5 focus-within:ring-1 focus-within:ring-ring">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              aria-label="Search Work tasks"
              className="min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-muted-foreground"
              placeholder="Search tasks"
              value={work.taskFilter}
              onChange={(event) => work.setTaskFilter(event.target.value)}
            />
          </label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="New Work task"
                disabled={!work.workspaceId}
                onClick={() => work.setNewTaskOpen(true)}
              >
                <SquarePen className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New Work task</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1.5 px-3 pb-1 pt-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="work-workspace-row flex min-w-0 flex-1 items-center gap-2 rounded-(--ds-radius-control) border bg-background px-3 text-ui hover:bg-accent/30">
                <Folder className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left font-medium">{work.activeWorkspace?.entity.name ?? "No workspace"}</span>
                <ChevronDown className="size-3 shrink-0 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {work.workspaces.map((workspace) => (
                <DropdownMenuItem key={workspace.entity.id} onSelect={() => work.selectWorkspace(workspace.entity.id)}>
                  <Folder className={cn(workspace.entity.id === work.workspaceId && "text-primary")} />
                  <span className="min-w-0 flex-1 truncate">{workspace.entity.name}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onAddProject}>
                <FolderPlus /> Add project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Add project"
            onClick={onAddProject}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-2.5 pb-3">
            {taskGroups.map((group) => (
              <section key={group.label} className={group.label === "Completed" ? "mt-10" : "mt-6"}>
                <p className="flex items-center gap-2 px-2 pb-1.5 text-cap font-semibold uppercase tracking-[0.08em] text-muted-foreground/85">
                  <ChevronDown className="size-3" />
                  <span>{group.label}</span>
                  <span className="ml-auto rounded border bg-background/70 px-1.5 py-px font-mono text-cap font-normal text-muted-foreground">
                    {group.tasks.length}
                  </span>
                </p>
                <div className="space-y-px">
                  {group.tasks.map((task) => {
                    const taskRuns = task.entity.id === work.detailTaskId ? work.runs : [];
                    const lastRun = taskRuns[taskRuns.length - 1]?.entity;
                    return (
                      <button
                        type="button"
                        key={task.entity.id}
                        className={cn(
                          "work-task-row flex w-full items-start gap-2 rounded-(--ds-radius-control) px-2 py-3 text-left transition-colors hover:bg-accent/50",
                          task.entity.id === work.activeTaskId && "bg-accent/80",
                        )}
                        onClick={() => work.setActiveTaskId(task.entity.id)}
                      >
                        <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", statusDot(task.entity.status))} />
                        <span className="min-w-0 flex-1">
                          <span className={cn(
                            "block truncate text-ui",
                            task.entity.id === work.activeTaskId && "font-medium",
                          )}>
                            {task.entity.title}
                          </span>
                          <span className="block truncate text-fine text-muted-foreground/80">
                            {lastRun
                              ? lastRun.activity.state.kind === "running"
                                ? `Active run #${lastRun.index}`
                                : `Run #${lastRun.index} · ${runState(lastRun)}`
                              : STATUS_LABEL[task.entity.status]}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {!work.loading && work.workspaceId && work.groupedTasks.length === 0 && (
              <div className="px-2 py-5 text-fine text-muted-foreground">
                <p>{work.taskFilter ? "No matching tasks." : "No Work tasks yet."}</p>
                {!work.taskFilter && (
                  <Button className="mt-3" size="sm" variant="outline" onClick={() => work.setNewTaskOpen(true)}>
                    <Plus className="size-3.5" /> New task
                  </Button>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="work-rail-footer work-divider-top px-3 py-4">
          <div className="flex items-center gap-2">
            <ProviderIcon provider={provider} className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-ui font-medium">
              {providerLabel}
            </span>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label="Open plugin market" onClick={onOpenMarket}>
              <Store className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={onOpenSettings}>
              <Settings className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={work.newTaskOpen} onOpenChange={work.setNewTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Work task</DialogTitle>
            <DialogDescription>
              Create a task in {work.activeWorkspace?.entity.name ?? "this workspace"}. Its conversations become Runs.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Task title"
            placeholder="Task title"
            value={work.newTaskTitle}
            onChange={(event) => work.setNewTaskTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void work.createTask();
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => work.setNewTaskOpen(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={!work.newTaskTitle.trim() || work.saving}
              onClick={() => void work.createTask()}
            >
              {work.saving ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

export function WorkInspector({
  work,
  open,
  width,
  onClose,
  onSelectRun,
  onOpenFile,
}: {
  work: WorkExperienceState;
  open: boolean;
  width: number;
  onClose: () => void;
  onSelectRun: (id: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const applied = Math.min(376, Math.max(320, width));
  const [editingBrief, setEditingBrief] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  useEffect(() => setEditingBrief(false), [work.activeTask?.entity.id]);
  const activity = work.activeTask ? [
    ...work.runs.map((run) => ({
      id: `run-${run.entity.id}`,
      label: `Run #${run.entity.index} started`,
      at: run.entity.created_at,
      icon: History,
    })),
    ...work.deliverables.map((item) => ({
      id: `deliverable-${item.entity.id}`,
      label: `Created ${item.entity.path}`,
      at: item.entity.created_at,
      icon: FileOutput,
    })),
    ...work.changes.map((item) => ({
      id: `change-${item.entity.id}`,
      label: `${item.entity.change.kind === "modified" ? "Modified" : item.entity.change.kind === "added" ? "Added" : "Deleted"} ${item.entity.change.path}`,
      at: item.entity.created_at,
      icon: FileText,
    })),
    ...(work.brief ? [{
      id: `brief-${work.brief.entity.id}`,
      label: "Updated task brief",
      at: work.brief.entity.created_at,
      icon: FileText,
    }] : []),
  ].sort((left, right) => left.at - right.at) : [];
  const time = (value: number) => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(value);
  const pathMenu = (path: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" aria-label={`More actions for ${path}`}>
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onOpenFile(path)}><ExternalLink /> Open in Code</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(path)}><FileText /> Copy path</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return (
    <aside
      aria-hidden={!open}
      className={cn(
        "work-context-panel shrink-0 overflow-hidden bg-sidebar",
        !open && "invisible w-0",
      )}
      style={{ width: open ? applied : 0 }}
    >
      <div className="flex h-full min-h-0 max-w-full flex-col" style={{ width: applied }}>
        <div data-tauri-drag-region className="work-inspector-drag-region shrink-0" />
        <div className="work-inspector-header work-divider-bottom flex shrink-0 items-center gap-2 px-5">
          <BriefcaseBusiness className="size-4 text-muted-foreground" />
          <span className="text-ui font-semibold">Work</span>
          <ChevronDown className="size-3 text-muted-foreground" />
          <div data-tauri-drag-region className="flex-1" />
          <Button variant="ghost" size="icon" className="size-7" aria-label="Close Work details" onClick={onClose}>
            <ChevronUp className="size-3.5" />
          </Button>
        </div>

        {!work.activeTask ? (
          <div className="p-4 text-ui text-muted-foreground">
            Select or create a Work task. The normal conversation and model controls stay in the center.
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <div className="work-inspector-sections px-5">
              <section className="work-inspector-section" aria-labelledby="work-brief-heading">
                <div className="flex items-center gap-2">
                  <h2 id="work-brief-heading" className="text-ui font-semibold">Task brief</h2>
                  {!editingBrief && <button type="button" className="ml-auto text-hint text-primary hover:underline" onClick={() => setEditingBrief(true)}>Edit</button>}
                </div>
                {editingBrief ? (
                  <div className="mt-3">
                    <Input aria-label="Work task title" value={work.titleDraft} onChange={(event) => work.setTitleDraft(event.target.value)} />
                    <textarea
                      aria-label="Work brief"
                      className="mt-2 min-h-28 w-full resize-y rounded-(--ds-radius-control) border bg-background p-3 text-ui leading-relaxed outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      value={work.briefDraft}
                      placeholder="Outcome, constraints, inputs, and acceptance criteria."
                      onChange={(event) => work.setBriefDraft(event.target.value)}
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingBrief(false)}>Cancel</Button>
                      <Button size="sm" disabled={!work.dirty || work.saving} onClick={() => void work.saveTask().then((saved) => saved && setEditingBrief(false))}>
                        {work.saving ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-hint leading-[1.55] text-muted-foreground">
                    {work.briefDraft || "Add an outcome, constraints, and acceptance criteria."}
                  </p>
                )}
                {work.notice && (
                  <div
                    role={work.notice.kind === "error" ? "alert" : "status"}
                    className={cn(
                      "mt-2 flex items-center gap-2 text-fine",
                      work.notice.kind === "error" ? "text-destructive" : "text-success",
                    )}
                  >
                    {work.notice.kind === "error" && <CircleAlert className="size-3.5" />}
                    {work.notice.text}
                  </div>
                )}
              </section>

              <section className="work-inspector-section" aria-labelledby="work-status-heading">
                <div className="flex items-center gap-2">
                  <h2 id="work-status-heading" className="text-ui font-semibold">Status</h2>
                  <span className="ml-auto flex items-center gap-2 text-hint">
                    <span className={cn("size-2 rounded-full", statusDot(work.activeTask.entity.status))} />
                    {STATUS_LABEL[work.activeTask.entity.status]}
                    <ChevronDown className="size-3 text-muted-foreground" />
                  </span>
                </div>
                <div className="mt-3 space-y-1">
                  {work.runs.slice().reverse().map((run) => (
                    <button
                      key={run.entity.id}
                      type="button"
                      className="work-detail-row flex w-full items-start gap-2 rounded-(--ds-radius-control) px-1 py-2 text-left hover:bg-accent/50"
                      onClick={() => onSelectRun(run.entity.id)}
                    >
                      <span className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        run.entity.activity.state.kind === "failed" ? "bg-destructive" : "bg-success",
                      )} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ui font-medium">Run #{run.entity.index}</span>
                        <span className="block truncate text-fine text-muted-foreground">
                          Started {time(run.entity.created_at)} · {runState(run.entity)}
                        </span>
                      </span>
                      <ChevronRight className="mt-1 size-3.5 text-muted-foreground" />
                    </button>
                  ))}
                  {work.runs.length === 0 && (
                    <p className="px-2 py-2 text-fine text-muted-foreground">
                      Your first message below creates Run #1. Later messages continue it.
                    </p>
                  )}
                </div>
              </section>

              <section className="work-inspector-section" aria-labelledby="work-deliverables-heading">
                <div className="flex items-center gap-2">
                  <h2 id="work-deliverables-heading" className="text-ui font-semibold">Deliverables</h2>
                  <span className="ml-auto flex items-center gap-3">
                    <span className="rounded-full bg-fill-quiet px-2 py-0.5 text-cap">{work.deliverables.length}</span>
                    <Plus className="size-4" aria-hidden />
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  {work.deliverables.map((deliverable) => (
                    <div key={deliverable.entity.id} className="flex items-start gap-2 py-2">
                      <FileOutput className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-ui">{deliverable.entity.path}</p>
                        <p className="text-fine text-muted-foreground">
                          v{deliverable.entity.version}{deliverable.entity.missing ? " · Missing" : ""}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Open ${deliverable.entity.path}`} onClick={() => onOpenFile(deliverable.entity.path)}>
                        <ExternalLink className="size-3.5" />
                      </Button>
                      {pathMenu(deliverable.entity.path)}
                    </div>
                  ))}
                  {work.deliverables.length === 0 && (
                    <p className="px-2 py-2 text-fine text-muted-foreground">No deliverables recorded yet.</p>
                  )}
                </div>
              </section>

              <section className="work-inspector-section" aria-labelledby="work-changes-heading">
                <div className="flex items-center gap-2">
                  <h2 id="work-changes-heading" className="text-ui font-semibold">Changes</h2>
                  <span className="ml-auto flex items-center gap-3">
                    <span className="rounded-full bg-fill-quiet px-2 py-0.5 text-cap">{work.changes.length}</span>
                    <Plus className="size-4" aria-hidden />
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  {work.changes.map((change) => (
                    <div key={change.entity.id} className="flex items-start gap-2 py-2">
                      <span className="mt-0.5 w-4 shrink-0 text-center font-mono text-fine text-muted-foreground">
                        {change.entity.change.kind === "added" ? "+" : change.entity.change.kind === "deleted" ? "−" : "M"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-ui">{change.entity.change.path}</p>
                        <p className="capitalize text-fine text-muted-foreground">{change.entity.change.kind}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Open ${change.entity.change.path}`} onClick={() => onOpenFile(change.entity.change.path)}>
                        <ExternalLink className="size-3.5" />
                      </Button>
                      {pathMenu(change.entity.change.path)}
                    </div>
                  ))}
                  {work.changes.length === 0 && (
                    <p className="px-2 py-2 text-fine text-muted-foreground">No inspected file changes.</p>
                  )}
                </div>
              </section>

              <section className="work-inspector-section" aria-labelledby="work-activity-heading">
                <div className="flex items-center gap-2">
                  <h2 id="work-activity-heading" className="text-ui font-semibold">Activity</h2>
                  <span className="ml-auto rounded-full bg-fill-quiet px-2 py-0.5 text-cap">{activity.length}</span>
                </div>
                <ol className="mt-3 space-y-2.5">
                  {activity.slice(-5).map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.id} className="flex items-center gap-2 text-hint">
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        <time className="shrink-0 text-fine text-muted-foreground">{time(item.at)}</time>
                      </li>
                    );
                  })}
                </ol>
                {activity.length > 0 && (
                  <button
                    type="button"
                    className="mt-3 text-hint font-medium text-primary hover:underline"
                    onClick={() => setActivityOpen(true)}
                  >
                    View all
                  </button>
                )}
              </section>

              <section className="work-inspector-section" aria-labelledby="work-automation-heading">
                <div className="flex items-center gap-2">
                  <h2 id="work-automation-heading" className="text-ui font-semibold">Automation</h2>
                  <Plus className="ml-auto size-4" aria-hidden />
                </div>
                <p className="mt-3 text-hint text-muted-foreground">No automations configured</p>
              </section>
            </div>
          </ScrollArea>
        )}

        <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Activity</DialogTitle>
              <DialogDescription>Recorded events for {work.activeTask?.entity.title ?? "this Work task"}.</DialogDescription>
            </DialogHeader>
            <ol className="space-y-3">
              {activity.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id} className="flex items-center gap-2 text-ui">
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">{item.label}</span>
                    <time className="text-fine text-muted-foreground">{time(item.at)}</time>
                  </li>
                );
              })}
            </ol>
          </DialogContent>
        </Dialog>
      </div>
    </aside>
  );
}
