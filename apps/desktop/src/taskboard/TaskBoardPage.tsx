import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { githubCurrentPullRequest } from "@/bridge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, PanelRight } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/i18n";

import { type BoardTask, type TaskPriority } from "./taskBoard";
import { TaskBoardCollection } from "./TaskBoardCollection";
import { TaskBoardHeader } from "./TaskBoardHeader";
import { TaskEditorDialog } from "./TaskEditorDialog";
import { TaskInspector } from "./TaskInspector";
import { useTaskBoardActions } from "./useTaskBoardActions";
import { useTaskBoardData } from "./useTaskBoardData";
import { useTaskBoardSelection } from "./useTaskBoardSelection";
import { useTaskBoardView } from "./useTaskBoardView";
import { useTaskPullRequests } from "./useTaskPullRequests";
import { INITIAL_TASK_LIMIT, sessionCheckoutPath } from "./workspaceModel";
import type {
  EditorState,
  InspectorTab,
  TaskBoardPageProps,
} from "./workspaceTypes";

import "./task-board.css";
export type { TaskBoardSession } from "./workspaceTypes";
const NARROW_BOARD_WIDTH_REM = 48;
function toggleValue<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}
export function TaskBoardPage({
  sessions = [],
  onOpenSession,
  onAskSession,
  onStartTask,
  headerLeadingAction,
  loadPullRequest = githubCurrentPullRequest,
}: TaskBoardPageProps) {
  const { locale, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [priorities, setPriorities] = useState<TaskPriority[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useTaskBoardView();
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [isNarrow, setIsNarrow] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("agent");
  const [prompt, setPrompt] = useState("");
  const [visibleTaskLimit, setVisibleTaskLimit] = useState(INITIAL_TASK_LIMIT);
  const pageRef = useRef<HTMLElement | null>(null);
  const showInspectorButtonRef = useRef<HTMLButtonElement | null>(null);
  const backToTasksButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreInspectorFocus = useRef(false);
  const wasNarrow = useRef<boolean | null>(null);
  const data = useTaskBoardData(locale, t, sessions, query, priorities, labels);
  const selection = useTaskBoardSelection(
    data.allProjectedTasks,
    data.projectedTasks
  );
  useEffect(() => setPrompt(""), [selection.selectedSessionId]);
  useEffect(
    () => setVisibleTaskLimit(INITIAL_TASK_LIMIT),
    [data.deferredQuery, labels, priorities]
  );
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page || typeof ResizeObserver === "undefined") return;
    const updateLayout = (): void => {
      const rootFontSize =
        Number.parseFloat(
          getComputedStyle(document.documentElement).fontSize
        ) || 16;
      const width = page.clientWidth;
      if (width <= 0) return;
      const narrow = width <= NARROW_BOARD_WIDTH_REM * rootFontSize;
      if (narrow && wasNarrow.current !== true) setInspectorOpen(false);
      if (!narrow) setInspectorOpen(true);
      setIsNarrow(narrow);
      wasNarrow.current = narrow;
    };
    updateLayout();
    const observer = new ResizeObserver(updateLayout);
    observer.observe(page);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (isNarrow && inspectorOpen) {
      backToTasksButtonRef.current?.focus();
      return;
    }
    if (inspectorOpen || !restoreInspectorFocus.current) return;
    restoreInspectorFocus.current = false;
    showInspectorButtonRef.current?.focus();
  }, [inspectorOpen, isNarrow]);
  const selectedCheckoutPath = sessionCheckoutPath(
    selection.selectedSession ?? undefined
  );
  const pullRequestsByPath = useTaskPullRequests(
    data.allProjectedTasks,
    selectedCheckoutPath,
    loadPullRequest
  );
  const selectedPullRequest = selectedCheckoutPath
    ? pullRequestsByPath.get(selectedCheckoutPath)
    : null;
  const activeFilterCount =
    (query.trim() ? 1 : 0) + priorities.length + labels.length;
  const renderedTasks = data.projectedTasks.slice(0, visibleTaskLimit);
  const remainingTaskCount = Math.max(
    0,
    data.projectedTasks.length - renderedTasks.length
  );
  const clearFilters = (): void => {
    setQuery("");
    setPriorities([]);
    setLabels([]);
  };
  const actions = useTaskBoardActions({
    t,
    toast: data.toast,
    tasks: data.state.tasks,
    filters: data.filters,
    editor,
    selectedSession: selection.selectedSession,
    prompt,
    onAskSession,
    dispatch: data.dispatch,
    setEditor,
    setSelectedTaskId: selection.setSelectedTaskId,
    setSelectedSessionId: selection.setSelectedSessionId,
    setExpandedTaskIds: selection.setExpandedTaskIds,
    setInspectorOpen,
    setInspectorTab,
    setPrompt,
    clearFilters,
    keepInspectorInPlace: isNarrow,
  });
  const moveTask = (task: BoardTask, status: BoardTask["status"]): void =>
    data.dispatch({ type: "move", id: task.id, status, now: Date.now() });
  const changeInspectorOpen = (open: boolean): void => {
    if (!open && isNarrow) restoreInspectorFocus.current = true;
    setInspectorOpen(open);
  };
  return (
    <main
      ref={pageRef}
      data-task-board-page
      data-task-board-view={view}
      data-inspector-open={inspectorOpen}
      className="task-board-page animate-data-page-in bg-background text-foreground min-h-0 min-w-0 flex-1"
    >
      <div className="task-board-titlebar h-layout-titlebar flex shrink-0 items-center gap-3 px-4 sm:px-6">
        {headerLeadingAction ? (
          <div data-taskboard-leading-action className="shrink-0">
            {headerLeadingAction}
          </div>
        ) : null}
        <nav
          aria-label={t("taskboard.breadcrumb")}
          className="text-body flex min-w-0 items-center gap-2"
        >
          <span className="text-muted-foreground">{t("taskboard.title")}</span>
          <ChevronRight
            aria-hidden
            className="text-muted-foreground size-3.5"
          />
          <strong className="truncate">{t("taskboard.allTasks")}</strong>
        </nav>
        <div className="flex-1" />
        {isNarrow ? (
          inspectorOpen ? (
            <Button
              ref={backToTasksButtonRef}
              type="button"
              variant="ghost"
              size="compact"
              onClick={() => changeInspectorOpen(false)}
            >
              <ChevronLeft aria-hidden />
              {t("taskboard.backToTasks")}
            </Button>
          ) : (
            <Button
              ref={showInspectorButtonRef}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("taskboard.showInspector")}
              onClick={() => changeInspectorOpen(true)}
            >
              <PanelRight aria-hidden />
            </Button>
          )
        ) : null}
      </div>
      <Separator />
      <div className="task-board-layout min-h-0 flex-1">
        {!isNarrow || !inspectorOpen ? (
          <section className="task-board-workspace flex min-h-0 min-w-0 flex-col">
            <TaskBoardHeader
              t={t}
              taskCount={data.state.tasks.length}
              view={view}
              onViewChange={setView}
              filtersOpen={filtersOpen}
              onFiltersOpenChange={setFiltersOpen}
              activeFilterCount={activeFilterCount}
              query={query}
              onQueryChange={setQuery}
              priorities={priorities}
              onTogglePriority={(priority) =>
                setPriorities((values) => toggleValue(values, priority))
              }
              labels={labels}
              availableLabels={data.availableLabels}
              onToggleLabel={(label) =>
                setLabels((values) => toggleValue(values, label))
              }
              onClearFilters={clearFilters}
              onCreateTask={() => actions.openEditor(null, "todo")}
            />
            {data.warning ? (
              <p
                role="alert"
                className="bg-destructive/10 text-metadata text-destructive px-6 py-2"
              >
                {data.warning}
              </p>
            ) : null}
            <TaskBoardCollection
              view={view}
              t={t}
              locale={locale}
              projectedTasks={data.projectedTasks}
              renderedTasks={renderedTasks}
              remainingTaskCount={remainingTaskCount}
              activeFilterCount={activeFilterCount}
              expandedTaskIds={selection.expandedTaskIds}
              selectedTaskId={selection.selectedTask?.id ?? null}
              selectedSessionId={selection.selectedSession?.id ?? null}
              pullRequestsByPath={pullRequestsByPath}
              onToggleTask={actions.toggleTask}
              onSelectTask={actions.selectTask}
              onSelectSession={actions.selectSession}
              onEditTask={(task) => actions.openEditor(task, task.status)}
              onDeleteTask={(task) => void actions.deleteTask(task)}
              onMoveTask={moveTask}
              onStartTask={onStartTask}
              onShowMore={() =>
                setVisibleTaskLimit((limit) => limit + INITIAL_TASK_LIMIT)
              }
            />
          </section>
        ) : null}
        {!isNarrow || inspectorOpen ? (
          <aside
            aria-label={t("taskboard.inspector")}
            className="task-board-inspector bg-surface min-h-0 min-w-0"
          >
            <TaskInspector
              t={t}
              task={selection.selectedTask}
              session={selection.selectedSession}
              pullRequest={selectedPullRequest}
              tab={inspectorTab}
              prompt={prompt}
              onTabChange={setInspectorTab}
              onPromptChange={setPrompt}
              onSubmitPrompt={actions.submitPrompt}
              onOpenSession={onOpenSession}
              onStartTask={onStartTask}
              onCopyCheckout={actions.copyCheckout}
            />
          </aside>
        ) : null}
      </div>
      {editor ? (
        <TaskEditorDialog
          key={editor.task?.id ?? `new-${editor.initialStatus}`}
          task={editor.task}
          initialStatus={editor.initialStatus}
          onCancel={() => setEditor(null)}
          onSave={actions.saveEditor}
        />
      ) : null}
    </main>
  );
}
