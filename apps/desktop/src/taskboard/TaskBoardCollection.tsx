import type { Locale, Translate } from "@/i18n";
import type { SidebarPullRequestStatus } from "@/sidebar/sidebarGitStatus";

import type { BoardTask, TaskStatus } from "./taskBoard";
import { TaskBoardKanban } from "./TaskBoardKanban";
import { TaskBoardList } from "./TaskBoardList";
import type { ProjectedTask, TaskBoardView } from "./workspaceTypes";

interface TaskBoardCollectionProps {
  view: TaskBoardView;
  t: Translate;
  locale: Locale;
  projectedTasks: readonly ProjectedTask[];
  renderedTasks: readonly ProjectedTask[];
  remainingTaskCount: number;
  activeFilterCount: number;
  expandedTaskIds: ReadonlySet<string>;
  selectedTaskId: string | null;
  selectedSessionId: string | null;
  pullRequestsByPath: ReadonlyMap<string, SidebarPullRequestStatus | null>;
  onToggleTask: (task: ProjectedTask) => void;
  onSelectTask: (task: ProjectedTask) => void;
  onSelectSession: (taskId: string, sessionId: string) => void;
  onEditTask: (task: BoardTask) => void;
  onDeleteTask: (task: BoardTask) => void;
  onMoveTask: (task: BoardTask, status: TaskStatus) => void;
  onStartTask?: (task: BoardTask) => void;
  onShowMore: () => void;
}

export function TaskBoardCollection(props: TaskBoardCollectionProps) {
  if (props.view === "board") {
    return (
      <TaskBoardKanban
        t={props.t}
        locale={props.locale}
        projectedTasks={props.projectedTasks}
        activeFilterCount={props.activeFilterCount}
        selectedTaskId={props.selectedTaskId}
        pullRequestsByPath={props.pullRequestsByPath}
        onSelectTask={props.onSelectTask}
        onEditTask={props.onEditTask}
        onDeleteTask={props.onDeleteTask}
        onMoveTask={props.onMoveTask}
        onStartTask={props.onStartTask}
      />
    );
  }

  return (
    <TaskBoardList
      t={props.t}
      locale={props.locale}
      projectedTasks={props.projectedTasks}
      renderedTasks={props.renderedTasks}
      remainingTaskCount={props.remainingTaskCount}
      activeFilterCount={props.activeFilterCount}
      expandedTaskIds={props.expandedTaskIds}
      selectedTaskId={props.selectedTaskId}
      selectedSessionId={props.selectedSessionId}
      pullRequestsByPath={props.pullRequestsByPath}
      onToggleTask={props.onToggleTask}
      onSelectSession={props.onSelectSession}
      onEditTask={props.onEditTask}
      onDeleteTask={props.onDeleteTask}
      onMoveTask={props.onMoveTask}
      onStartTask={props.onStartTask}
      onShowMore={props.onShowMore}
    />
  );
}
