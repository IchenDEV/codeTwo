import { useEffect, useState } from "react"

import { githubCurrentPullRequest } from "@/bridge"
import { Button } from "@/components/ui/button"
import { X } from "@/components/ui/icons"
import { useLanguage } from "@/i18n"

import { TaskBoardHeader } from "./TaskBoardHeader"
import { TaskBoardList } from "./TaskBoardList"
import { TaskEditorDialog } from "./TaskEditorDialog"
import { TaskInspector } from "./TaskInspector"
import { type BoardTask, type TaskPriority } from "./taskBoard"
import { useTaskBoardActions } from "./useTaskBoardActions"
import { useTaskBoardData } from "./useTaskBoardData"
import { useTaskBoardSelection } from "./useTaskBoardSelection"
import { useTaskPullRequests } from "./useTaskPullRequests"
import { INITIAL_TASK_LIMIT, sessionCheckoutPath } from "./workspaceModel"
import type { EditorState, InspectorTab, TaskBoardPageProps } from "./workspaceTypes"
import "./task-board.css"

export type { TaskBoardSession } from "./workspaceTypes"

function toggleValue<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value]
}

export function TaskBoardPage({
  sessions = [],
  onOpenSession,
  onAskSession,
  onStartTask,
  headerLeadingAction,
  loadPullRequest = githubCurrentPullRequest,
}: TaskBoardPageProps) {
  const { locale, t } = useLanguage()
  const [query, setQuery] = useState("")
  const [priorities, setPriorities] = useState<TaskPriority[]>([])
  const [labels, setLabels] = useState<string[]>([])
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("agent")
  const [prompt, setPrompt] = useState("")
  const [visibleTaskLimit, setVisibleTaskLimit] = useState(INITIAL_TASK_LIMIT)
  const data = useTaskBoardData(locale, t, sessions, query, priorities, labels)

  const selection = useTaskBoardSelection(data.allProjectedTasks, data.projectedTasks)

  useEffect(() => setPrompt(""), [selection.selectedSessionId])
  useEffect(() => setVisibleTaskLimit(INITIAL_TASK_LIMIT), [data.deferredQuery, labels, priorities])

  const pullRequestsByPath = useTaskPullRequests(data.allProjectedTasks, loadPullRequest)
  const selectedCheckoutPath = sessionCheckoutPath(selection.selectedSession ?? undefined)
  const selectedPullRequest = selectedCheckoutPath
    ? pullRequestsByPath.get(selectedCheckoutPath) ?? null
    : null
  const activeFilterCount = (query.trim() ? 1 : 0) + priorities.length + labels.length
  const renderedTasks = data.projectedTasks.slice(0, visibleTaskLimit)
  const remainingTaskCount = Math.max(0, data.projectedTasks.length - renderedTasks.length)

  const clearFilters = (): void => {
    setQuery("")
    setPriorities([])
    setLabels([])
  }
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
  })
  const moveTask = (task: BoardTask, status: BoardTask["status"]): void => {
    data.dispatch({ type: "move", id: task.id, status, now: Date.now() })
  }

  return (
    <main
      data-task-board-page
      data-inspector-open={inspectorOpen}
      className="task-board-page animate-data-page-in min-h-0 min-w-0 flex-1 bg-background text-foreground"
    >
      <div className="task-board-layout h-full min-h-0">
        <section className="task-board-workspace flex min-h-0 min-w-0 flex-col">
          <TaskBoardHeader
            t={t}
            taskCount={data.state.tasks.length}
            headerLeadingAction={headerLeadingAction}
            inspectorOpen={inspectorOpen}
            onShowInspector={() => setInspectorOpen(true)}
            filtersOpen={filtersOpen}
            onFiltersOpenChange={setFiltersOpen}
            activeFilterCount={activeFilterCount}
            query={query}
            onQueryChange={setQuery}
            priorities={priorities}
            onTogglePriority={(priority) => setPriorities((values) => toggleValue(values, priority))}
            labels={labels}
            availableLabels={data.availableLabels}
            onToggleLabel={(label) => setLabels((values) => toggleValue(values, label))}
            onClearFilters={clearFilters}
            onCreateTask={() => actions.openEditor(null, "todo")}
          />
          {data.warning ? (
            <p role="alert" className="bg-destructive/10 px-6 py-2 text-metadata text-destructive">
              {data.warning}
            </p>
          ) : null}
          <TaskBoardList
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
            onSelectSession={actions.selectSession}
            onEditTask={(task) => actions.openEditor(task, task.status)}
            onDeleteTask={(task) => void actions.deleteTask(task)}
            onMoveTask={moveTask}
            onStartTask={onStartTask}
            onShowMore={() => setVisibleTaskLimit((limit) => limit + INITIAL_TASK_LIMIT)}
          />
        </section>
        <aside
          aria-label={t("taskboard.inspector")}
          className="task-board-inspector min-h-0 min-w-0 border-l border-border bg-background"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="task-board-inspector-close absolute right-3 top-2.5 z-10"
            aria-label={t("taskboard.hideInspector")}
            onClick={() => setInspectorOpen(false)}
          >
            <X aria-hidden />
          </Button>
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
  )
}
