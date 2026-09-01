import {
  useEffect,
  useRef,
  useState,
} from "react"

import { githubCurrentPullRequest } from "@/bridge"
import { useLanguage } from "@/i18n"

import { TaskBoardHeader } from "./TaskBoardHeader"
import { TaskBoardInspectorSurface } from "./TaskBoardInspectorSurface"
import { TaskBoardList } from "./TaskBoardList"
import { TaskEditorDialog } from "./TaskEditorDialog"
import { type BoardTask, type TaskPriority } from "./taskBoard"
import { useTaskBoardActions } from "./useTaskBoardActions"
import { taskBoardViewData, toggleFilterValue, useTaskBoardData } from "./useTaskBoardData"
import { useTaskBoardKeyboard } from "./useTaskBoardKeyboard"
import { useTaskBoardSelection } from "./useTaskBoardSelection"
import { useTaskBoardTranscript } from "./useTaskBoardTranscript"
import { useTaskBoardViewport } from "./useTaskBoardViewport"
import { useTaskPullRequests } from "./useTaskPullRequests"
import { INITIAL_TASK_LIMIT, sessionCheckoutPath } from "./workspaceModel"
import type {
  EditorState,
  InspectorTab,
  TaskBoardPageProps,
  TaskBoardView,
} from "./workspaceTypes"
import "./task-board.css"

export type { TaskBoardSession, TaskBoardTranscriptLine, TaskBoardTranscriptPreview } from "./workspaceTypes"

export function TaskBoardPage(props: TaskBoardPageProps) {
  const {
    sessions = [], pendingInputs = [], loadPullRequest = githubCurrentPullRequest,
    onOpenSession, onAskSession, onStartTask, loadTranscript, onAnswerPermission,
    onAnswerElicitation, onSplitSession, onForkSession, headerLeadingAction,
  } = props
  const { locale, t } = useLanguage()
  const [query, setQuery] = useState("")
  const [priorities, setPriorities] = useState<TaskPriority[]>([])
  const [labels, setLabels] = useState<string[]>([])
  const [view, setView] = useState<TaskBoardView>("all")
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("agent")
  const [prompt, setPrompt] = useState("")
  const [promptSubmitting, setPromptSubmitting] = useState(false)
  const [visibleTaskLimit, setVisibleTaskLimit] = useState(INITIAL_TASK_LIMIT)
  const pageRef = useRef<HTMLElement | null>(null)
  const viewport = useTaskBoardViewport(pageRef)
  const { inspectorOpen, isNarrow, setInspectorOpen, closeInspector } = viewport
  const data = useTaskBoardData(locale, t, sessions, query, priorities, labels)
  const viewData = taskBoardViewData(view, data.projectedTasks, data.allProjectedTasks, t)
  const { tasks: viewTasks, attentionCount, title: pageTitle, description: pageDescription } = viewData
  const selection = useTaskBoardSelection(viewTasks)
  const transcript = useTaskBoardTranscript(selection.selectedSession?.id ?? null, loadTranscript)

  useEffect(() => {
    setPrompt("")
    setPromptSubmitting(false)
  }, [selection.selectedSessionId])
  useEffect(() => setVisibleTaskLimit(INITIAL_TASK_LIMIT), [data.deferredQuery, labels, priorities, view])
  const selectedCheckoutPath = sessionCheckoutPath(selection.selectedSession ?? undefined)
  const pullRequestsByPath = useTaskPullRequests(
    data.allProjectedTasks,
    loadPullRequest,
    selectedCheckoutPath,
  )
  const selectedPullRequest = selectedCheckoutPath
    ? pullRequestsByPath.get(selectedCheckoutPath)
    : null
  const selectedPendingInput = selection.selectedSession
    ? pendingInputs.find((request) => request.session === selection.selectedSession?.id) ?? null
    : null
  const activeFilterCount = (query.trim() ? 1 : 0) + priorities.length + labels.length
  const renderedTasks = viewTasks.slice(0, visibleTaskLimit)
  const remainingTaskCount = Math.max(0, viewTasks.length - renderedTasks.length)
  const clearFilters = (): void => {
    setQuery("")
    setPriorities([])
    setLabels([])
  }
  const revealAllTasks = (): void => {
    clearFilters()
    setView("all")
  }
  const actions = useTaskBoardActions({
    t,
    toast: data.toast,
    tasks: data.state.tasks,
    filters: data.filters,
    editor,
    view,
    selectedSession: selection.selectedSession,
    prompt,
    promptSubmitting,
    onAskSession,
    dispatch: data.dispatch,
    setEditor,
    setSelectedTaskId: selection.setSelectedTaskId,
    setSelectedSessionId: selection.setSelectedSessionId,
    setExpandedTaskIds: selection.setExpandedTaskIds,
    setInspectorOpen,
    setInspectorTab,
    setPrompt,
    setPromptSubmitting,
    revealAllTasks,
    openInspectorForSelection: viewport.openInspectorForSelection,
  })
  const moveTask = (task: BoardTask, status: BoardTask["status"]): void => {
    data.dispatch({ type: "move", id: task.id, status, now: Date.now() })
  }
  const advanceAfterAttention = (): void => {
    if (!selection.selectedTask) return
    const index = viewTasks.findIndex(({ task }) => task.id === selection.selectedTask?.id)
    const next = viewTasks[index + 1] ?? viewTasks[index - 1]
    if (!next || next.task.id === selection.selectedTask.id) return
    selection.setSelectedTaskId(next.task.id)
    selection.setSelectedSessionId(next.currentSession?.id ?? next.sessions[0]?.id ?? null)
    setInspectorTab("agent")
  }
  const handleBoardKeyDown = useTaskBoardKeyboard({
    pageRef,
    renderedTasks,
    selectedTask: selection.selectedTask,
    selectedSession: selection.selectedSession,
    setSelectedTaskId: selection.setSelectedTaskId,
    setSelectedSessionId: selection.setSelectedSessionId,
    setInspectorTab,
    setInspectorOpen,
    onOpenSession,
    onStartTask,
  })

  return (
    <main
      ref={pageRef}
      data-task-board-page
      data-inspector-open={inspectorOpen}
      onKeyDown={handleBoardKeyDown}
      className="task-board-page animate-data-page-in min-h-0 min-w-0 flex-1 bg-background text-foreground"
    >
      <div className="task-board-layout h-full min-h-0">
        <section
          {...(isNarrow && inspectorOpen ? { inert: "" } : {})}
          className="task-board-workspace flex min-h-0 min-w-0 flex-col"
        >
          <TaskBoardHeader
            t={t}
            taskCount={viewTasks.length}
            pageTitle={pageTitle}
            pageDescription={pageDescription}
            view={view}
            attentionCount={attentionCount}
            onViewChange={setView}
            headerLeadingAction={headerLeadingAction}
            inspectorOpen={inspectorOpen}
            onShowInspector={() => setInspectorOpen(true)}
            filtersOpen={filtersOpen}
            onFiltersOpenChange={setFiltersOpen}
            activeFilterCount={activeFilterCount}
            query={query}
            onQueryChange={setQuery}
            priorities={priorities}
            onTogglePriority={(priority) => setPriorities((values) => toggleFilterValue(values, priority))}
            labels={labels}
            availableLabels={data.availableLabels}
            onToggleLabel={(label) => setLabels((values) => toggleFilterValue(values, label))}
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
            view={view}
            projectedTasks={viewTasks}
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

        <TaskBoardInspectorSurface
          t={t}
          task={selection.selectedTask}
          session={selection.selectedSession}
          pullRequest={selectedPullRequest}
          transcript={transcript}
          pendingInput={selectedPendingInput}
          tab={inspectorTab}
          prompt={prompt}
          promptSubmitting={promptSubmitting}
          canAskSession={Boolean(onAskSession)}
          onTabChange={setInspectorTab}
          onPromptChange={setPrompt}
          onSubmitPrompt={actions.submitPrompt}
          onOpenSession={onOpenSession}
          onStartTask={onStartTask}
          onCopyCheckout={actions.copyCheckout}
          onAnswerPermission={onAnswerPermission}
          onAnswerElicitation={onAnswerElicitation}
          onAttentionAccepted={advanceAfterAttention}
          onSplitSession={onSplitSession}
          onForkSession={onForkSession}
          isNarrow={isNarrow}
          inspectorOpen={inspectorOpen}
          onClose={closeInspector}
          onOpenChange={(open) => open ? setInspectorOpen(true) : closeInspector()}
        />
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
