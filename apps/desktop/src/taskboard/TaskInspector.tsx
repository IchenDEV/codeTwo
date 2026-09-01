import type { FormEvent } from "react"

import type { Translate } from "@/i18n"
import type { SidebarPullRequestStatus } from "@/sidebar/sidebarGitStatus"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { TaskInspectorAgent } from "./TaskInspectorAgent"
import { TaskInspectorDetails, TaskInspectorInsights } from "./TaskInspectorSummary"
import type { BoardTask } from "./taskBoard"
import type { InspectorTab, SessionProjection } from "./workspaceTypes"

interface TaskInspectorProps {
  t: Translate
  task: BoardTask | null
  session: SessionProjection | null
  pullRequest: SidebarPullRequestStatus | null
  tab: InspectorTab
  prompt: string
  onTabChange: (tab: InspectorTab) => void
  onPromptChange: (value: string) => void
  onSubmitPrompt: (event: FormEvent<HTMLFormElement>) => void
  onOpenSession?: (id: string) => void
  onStartTask?: (task: BoardTask) => void
  onCopyCheckout: (path: string) => void
}

export function TaskInspector(props: TaskInspectorProps) {
  if (!props.task) {
    return (
      <div className="flex min-h-full items-center justify-center px-6 text-center text-body text-muted-foreground">
        {props.t("taskboard.selectTask")}
      </div>
    )
  }

  const task = props.task
  return (
    <Tabs
      value={props.tab}
      onValueChange={(value) => props.onTabChange(value as InspectorTab)}
      className="min-h-0 flex-1 gap-0"
    >
      <div className="task-board-inspector-tabs flex h-layout-titlebar shrink-0 items-center border-b border-border px-3">
        <TabsList variant="line" aria-label={props.t("taskboard.inspectorViews")} className="h-full">
          <TabsTrigger value="agent">{props.t("taskboard.inspector.agent")}</TabsTrigger>
          <TabsTrigger value="details">{props.t("taskboard.inspector.details")}</TabsTrigger>
          <TabsTrigger value="insights">{props.t("taskboard.inspector.insights")}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="agent" className="min-h-0 overflow-y-auto px-4 py-4">
        <TaskInspectorAgent {...props} task={task} />
      </TabsContent>
      <TabsContent value="details" className="min-h-0 overflow-y-auto px-4 py-4">
        <TaskInspectorDetails {...props} task={task} />
      </TabsContent>
      <TabsContent value="insights" className="min-h-0 overflow-y-auto px-4 py-4">
        <TaskInspectorInsights {...props} task={task} />
      </TabsContent>
    </Tabs>
  )
}
