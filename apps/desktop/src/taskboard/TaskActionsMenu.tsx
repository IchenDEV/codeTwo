import { MessageSquareText, MoreHorizontal, Pencil, Trash2 } from "@/components/ui/icons"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Translate } from "@/i18n"

import { TASK_STATUSES, type BoardTask, type TaskStatus } from "./taskBoard"
import { taskStatusLabel } from "./TaskEditorDialog"

interface TaskActionsMenuProps {
  t: Translate
  task: BoardTask
  onEdit: () => void
  onDelete: () => void
  onMove: (status: TaskStatus) => void
  onStartTask?: (task: BoardTask) => void
}

export function TaskActionsMenu({
  t,
  task,
  onEdit,
  onDelete,
  onMove,
  onStartTask,
}: TaskActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="task-board-row-action shrink-0"
            aria-label={t("taskboard.taskActions", { title: task.title })}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onEdit}>
            <Pencil aria-hidden />
            {t("taskboard.edit")}
          </DropdownMenuItem>
          {onStartTask ? (
            <DropdownMenuItem onClick={() => onStartTask(task)}>
              <MessageSquareText aria-hidden />
              {task.sessionIds.length > 0
                ? t("taskboard.startInNewSession")
                : t("taskboard.startTask")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {TASK_STATUSES.filter((status) => status !== task.status).map((status) => (
            <DropdownMenuItem key={status} onClick={() => onMove(status)}>
              {t("taskboard.moveTo", { status: taskStatusLabel(t, status) })}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 aria-hidden />
            {t("taskboard.delete")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
