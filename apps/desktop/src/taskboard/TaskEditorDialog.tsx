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

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "待处理",
  in_progress: "进行中",
  in_review: "待审阅",
  done: "已完成",
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: "无优先级",
  low: "低优先级",
  medium: "中优先级",
  high: "高优先级",
  urgent: "紧急",
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
          <DialogTitle>{editing ? "编辑任务" : "新建任务"}</DialogTitle>
          <DialogDescription>
            {editing ? "更新任务内容和所在阶段。" : "记录下一步工作，并把它放到合适的阶段。"}
          </DialogDescription>
        </DialogHeader>

        <form id={formId} className="grid gap-4" onSubmit={submit}>
          <FieldGroup>
            <Field data-invalid={titleMissing || undefined}>
              <FieldLabel htmlFor={titleId}>
                标题 <span aria-hidden className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id={titleId}
                size="compact"
                autoFocus
                aria-invalid={titleMissing || undefined}
                aria-describedby={titleMissing ? titleErrorId : undefined}
                placeholder="例如：完善任务筛选体验"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
              <FieldError id={titleErrorId}>
                {titleMissing ? "请输入任务标题" : null}
              </FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor={descriptionId}>描述</FieldLabel>
              <Textarea
                id={descriptionId}
                rows={3}
                placeholder="补充背景、验收标准或实现提示…"
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel id={`${formId}-status-label`}>状态</FieldLabel>
                <Select
                  value={status}
                  onValueChange={(value) => value && setStatus(value as TaskStatus)}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-full"
                    aria-labelledby={`${formId}-status-label`}
                  >
                    <SelectValue>{STATUS_LABELS[status]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {TASK_STATUSES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {STATUS_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel id={`${formId}-priority-label`}>优先级</FieldLabel>
                <Select
                  value={priority}
                  onValueChange={(value) => value && setPriority(value as TaskPriority)}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-full"
                    aria-labelledby={`${formId}-priority-label`}
                  >
                    <SelectValue>{PRIORITY_LABELS[priority]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {PRIORITIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {PRIORITY_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor={labelsId}>标签</FieldLabel>
              <Input
                id={labelsId}
                size="compact"
                placeholder="输入标签，用逗号分隔"
                value={labels}
                onChange={(event) => setLabels(event.currentTarget.value)}
              />
              <FieldDescription>相同标签会自动合并。</FieldDescription>
            </Field>

          </FieldGroup>
        </form>

        <DialogFooter>
          <Button type="button" variant="ghost" size="compact" onClick={onCancel}>
            取消
          </Button>
          <Button type="submit" size="compact" form={formId}>
            {editing ? "保存更改" : "创建任务"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { PRIORITY_LABELS, STATUS_LABELS }
