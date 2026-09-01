import { useState } from "react"

import type { ElicitationAnswer } from "@/bridge"
import { Button } from "@/components/ui/button"
import { CircleAlert } from "@/components/ui/icons"
import type { Translate } from "@/i18n"
import { QuestionForm } from "@/session/QuestionDialog"
import type { PermissionQueueItem } from "@/session/sessionEvents"

export interface TaskBoardPendingInputProps {
  t: Translate
  request: PermissionQueueItem
  onAnswerPermission?: (request: PermissionQueueItem, optionId: string | null) => Promise<boolean>
  onAnswerElicitation?: (request: PermissionQueueItem, answer: ElicitationAnswer) => Promise<boolean>
  onAccepted: () => void
}

export function TaskBoardPendingInput(props: TaskBoardPendingInputProps) {
  const [answering, setAnswering] = useState(false)

  if (props.request.form && props.onAnswerElicitation) {
    return (
      <section data-task-board-question className="rounded-module border border-warning/35 bg-warning/6 p-3">
        <QuestionForm
          key={props.request.requestId}
          form={props.request.form}
          embedded
          onAnswer={async (answer) => {
            const accepted = await props.onAnswerElicitation?.(props.request, answer) ?? false
            if (accepted) props.onAccepted()
            return accepted
          }}
        />
      </section>
    )
  }

  if (!props.onAnswerPermission) return null
  const answer = async (optionId: string | null): Promise<void> => {
    if (answering) return
    setAnswering(true)
    try {
      const accepted = await props.onAnswerPermission?.(props.request, optionId) ?? false
      if (accepted) props.onAccepted()
    } finally {
      setAnswering(false)
    }
  }

  return (
    <section
      data-task-board-permission
      className="rounded-module border border-warning/35 bg-warning/6 p-3"
      aria-busy={answering}
    >
      <div className="flex items-start gap-2">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <h2 className="text-body font-semibold">{props.t("taskboard.attention.actionRequired")}</h2>
          <p className="mt-1 whitespace-pre-wrap break-words text-body text-foreground/85">
            {props.request.title}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {props.request.options.map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="compact"
            variant="secondary"
            disabled={answering}
            onClick={() => void answer(id)}
          >
            {label}
          </Button>
        ))}
        <Button type="button" size="compact" variant="ghost" disabled={answering} onClick={() => void answer(null)}>
          {props.t("permission.cancel")}
        </Button>
      </div>
    </section>
  )
}
