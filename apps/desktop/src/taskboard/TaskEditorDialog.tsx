import { useId, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useT, type Translate } from "@/i18n"

import {
  PRIORITIES,
  TASK_STATUSES,
  type BoardTask,
  type TaskPriority,
  type TaskStatus,
} from "./taskBoard"

export interface TaskEditorValue {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  labels: string[]
}

interface TaskEditorDialogProps {
  task?: BoardTask | null
  initialStatus?: TaskStatus
  onCancel: () => void
  onSave: (value: TaskEditorValue) => void
}

const STATUS_LABEL_KEYS = {
  todo: "taskboard.status.todo",
  in_progress: "taskboard.status.inProgress",
  in_review: "taskboard.status.inReview",
  done: "taskboard.status.done",
} as const

const PRIORITY_LABEL_KEYS = {
  none: "taskboard.priority.none",
  low: "taskboard.priority.low",
  medium: "taskboard.priority.medium",
  high: "taskboard.priority.high",
  urgent: "taskboard.priority.urgent",
} as const

export function taskStatusLabel(t: Translate, status: TaskStatus): string {
  return t(STATUS_LABEL_KEYS[status])
}

export function taskPriorityLabel(t: Translate, priority: TaskPriority): string {
  return t(PRIORITY_LABEL_KEYS[priority])
}

function normalizeLabels(value: string): string[] {
  const labels: string[] = []
  const seen = new Set<string>()
  for (const part of value.split(/[,，]/)) {
    const label = part.trim()
    if (!label || seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }
  return labels
}

export function TaskEditorDialog({
  task = null,
  initialStatus = "todo",
  onCancel,
  onSave,
}: TaskEditorDialogProps) {
  const t = useT()
  const formId = useId()
  const titleId = `${formId}-title`
  const titleErrorId = `${formId}-title-error`
  const descriptionId = `${formId}-description`
  const labelsId = `${formId}-labels`
  const [title, setTitle] = useState(task?.title ?? "")
  const [description, setDescription] = useState(task?.description ?? "")
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? initialStatus)
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium")
  const [labels, setLabels] = useState(task?.labels.join("，") ?? "")
  const [submitted, setSubmitted] = useState(false)

  const titleMissing = submitted && title.trim().length === 0

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    const normalizedTitle = title.trim()
    if (!normalizedTitle) return

    onSave({
      title: normalizedTitle,
      description: description.trim(),
      status,
      priority,
      labels: normalizeLabels(labels),
    })
  }

  const editing = Boolean(task)

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-dvh overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(editing ? "taskboard.editor.editTitle" : "taskboard.editor.newTitle")}
          </DialogTitle>
          <DialogDescription>
            {t(editing
              ? "taskboard.editor.editDescription"
              : "taskboard.editor.newDescription")}
          </DialogDescription>
        </DialogHeader>

        <form id={formId} className="grid gap-4" onSubmit={submit}>
          <FieldGroup>
            <Field data-invalid={titleMissing || undefined}>
              <FieldLabel htmlFor={titleId}>
                {t("taskboard.editor.title")} <span aria-hidden className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id={titleId}
                size="compact"
                autoFocus
                aria-invalid={titleMissing || undefined}
                aria-describedby={titleMissing ? titleErrorId : undefined}
                placeholder={t("taskboard.editor.titlePlaceholder")}
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
              <FieldError id={titleErrorId}>
                {titleMissing ? t("taskboard.editor.titleRequired") : null}
              </FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor={descriptionId}>{t("taskboard.editor.description")}</FieldLabel>
              <Textarea
                id={descriptionId}
                rows={3}
                placeholder={t("taskboard.editor.descriptionPlaceholder")}
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel id={`${formId}-status-label`}>
                  {t("taskboard.editor.status")}
                </FieldLabel>
                <Select
                  value={status}
                  onValueChange={(value) => value && setStatus(value as TaskStatus)}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-full"
                    aria-labelledby={`${formId}-status-label`}
                  >
                    <SelectValue>{taskStatusLabel(t, status)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {TASK_STATUSES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {taskStatusLabel(t, value)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel id={`${formId}-priority-label`}>
                  {t("taskboard.editor.priority")}
                </FieldLabel>
                <Select
                  value={priority}
                  onValueChange={(value) => value && setPriority(value as TaskPriority)}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-full"
                    aria-labelledby={`${formId}-priority-label`}
                  >
                    <SelectValue>{taskPriorityLabel(t, priority)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {PRIORITIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {taskPriorityLabel(t, value)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor={labelsId}>{t("taskboard.editor.labels")}</FieldLabel>
              <Input
                id={labelsId}
                size="compact"
                placeholder={t("taskboard.editor.labelsPlaceholder")}
                value={labels}
                onChange={(event) => setLabels(event.currentTarget.value)}
              />
              <FieldDescription>{t("taskboard.editor.labelsHint")}</FieldDescription>
            </Field>

          </FieldGroup>
        </form>

        <DialogFooter>
          <Button type="button" variant="ghost" size="compact" onClick={onCancel}>
            {t("taskboard.editor.cancel")}
          </Button>
          <Button type="submit" size="compact" form={formId}>
            {t(editing ? "taskboard.editor.save" : "taskboard.editor.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
