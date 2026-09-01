import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { X } from "@/components/ui/icons"

import { TaskInspector, type TaskInspectorProps } from "./TaskInspector"

interface TaskBoardInspectorSurfaceProps extends TaskInspectorProps {
  isNarrow: boolean
  inspectorOpen: boolean
  onClose: () => void
  onOpenChange: (open: boolean) => void
}

export function TaskBoardInspectorSurface(props: TaskBoardInspectorSurfaceProps) {
  const contents = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="task-board-inspector-close absolute right-3 top-2.5 z-10"
        aria-label={props.t("taskboard.hideInspector")}
        onClick={props.onClose}
      >
        <X aria-hidden />
      </Button>
      <TaskInspector {...props} />
    </>
  )

  if (props.isNarrow) {
    return (
      <Dialog open={props.inspectorOpen} onOpenChange={props.onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="task-board-inspector task-board-inspector-dialog fixed inset-y-0 right-0 left-auto top-0 min-h-0 min-w-0 max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-l border-border bg-background p-0"
        >
          <DialogTitle className="sr-only">{props.t("taskboard.inspector")}</DialogTitle>
          {contents}
        </DialogContent>
      </Dialog>
    )
  }

  return props.inspectorOpen ? (
    <aside
      aria-label={props.t("taskboard.inspector")}
      className="task-board-inspector min-h-0 min-w-0 border-l border-border bg-background"
    >
      {contents}
    </aside>
  ) : null
}
