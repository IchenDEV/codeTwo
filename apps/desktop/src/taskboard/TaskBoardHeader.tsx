import type { ReactNode } from "react"

import { ChevronRight, Filter, PanelRight, Plus } from "@/components/ui/icons"
import { SearchField } from "@/components/business/search-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { Translate } from "@/i18n"

import { PRIORITIES, type TaskPriority } from "./taskBoard"
import { taskPriorityLabel } from "./TaskEditorDialog"
import type { TaskBoardView } from "./workspaceTypes"

interface TaskBoardHeaderProps {
  t: Translate
  taskCount: number
  pageTitle: string
  pageDescription: string
  view: TaskBoardView
  attentionCount: number
  onViewChange: (view: TaskBoardView) => void
  headerLeadingAction?: ReactNode
  inspectorOpen: boolean
  onShowInspector: () => void
  filtersOpen: boolean
  onFiltersOpenChange: (open: boolean) => void
  activeFilterCount: number
  query: string
  onQueryChange: (value: string) => void
  priorities: readonly TaskPriority[]
  onTogglePriority: (priority: TaskPriority) => void
  labels: readonly string[]
  availableLabels: readonly string[]
  onToggleLabel: (label: string) => void
  onClearFilters: () => void
  onCreateTask: () => void
}

export function TaskBoardHeader(props: TaskBoardHeaderProps) {
  const { t } = props
  return (
    <header className="shrink-0 bg-background">
      <div className="flex h-layout-titlebar items-center gap-3 border-b border-border px-4 sm:px-6">
        {props.headerLeadingAction ? (
          <div data-taskboard-leading-action className="shrink-0">{props.headerLeadingAction}</div>
        ) : null}
        <nav aria-label={t("taskboard.breadcrumb")} className="flex min-w-0 items-center gap-2 text-body">
          <span className="text-muted-foreground">{t("taskboard.title")}</span>
          <ChevronRight aria-hidden className="size-3.5 text-muted-foreground" />
          <strong className="truncate">{props.pageTitle}</strong>
        </nav>
        <div className="flex-1" />
        {!props.inspectorOpen ? (
          <Button
            data-task-board-show-inspector
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("taskboard.showInspector")}
            onClick={props.onShowInspector}
          >
            <PanelRight aria-hidden />
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start gap-4 px-4 py-5 sm:px-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-page font-semibold tracking-tight">{props.pageTitle}</h1>
            <Badge variant="secondary" className="tabular-nums text-muted-foreground">
              {props.taskCount}
            </Badge>
          </div>
          <p className="mt-1 max-w-2xl text-body text-muted-foreground">
            {props.pageDescription}
          </p>
        </div>

        <div data-page-header-controls className="flex shrink-0 items-center gap-2">
          <div
            role="group"
            aria-label={t("taskboard.views")}
            className="flex items-center rounded-control bg-fill-rest p-0.5"
          >
            <Button
              type="button"
              variant={props.view === "all" ? "secondary" : "ghost"}
              size="compact"
              aria-pressed={props.view === "all"}
              onClick={() => props.onViewChange("all")}
            >
              {t("taskboard.allTasks")}
            </Button>
            <Button
              type="button"
              variant={props.view === "attention" ? "secondary" : "ghost"}
              size="compact"
              aria-label={t("taskboard.attentionSummary", { count: props.attentionCount })}
              aria-pressed={props.view === "attention"}
              onClick={() => props.onViewChange("attention")}
            >
              {t("taskboard.lane.needsYou")}
              <Badge variant="secondary" className="min-w-4 px-1 text-metadata tabular-nums">
                {props.attentionCount}
              </Badge>
            </Button>
          </div>
          <Popover open={props.filtersOpen} onOpenChange={props.onFiltersOpenChange}>
            <PopoverTrigger
              render={
                <Button type="button" variant="secondary" size="compact">
                  <Filter aria-hidden />
                  {t("taskboard.filter")}
                  {props.activeFilterCount > 0 ? (
                    <Badge className="min-w-4 px-1 text-metadata">{props.activeFilterCount}</Badge>
                  ) : null}
                </Button>
              }
            />
            <PopoverContent align="end" className="grid max-h-(--available-height) w-80 gap-4 overflow-y-auto">
              <PopoverHeader>
                <PopoverTitle>{t("taskboard.filtersTitle")}</PopoverTitle>
                <PopoverDescription>{t("taskboard.filtersDescription")}</PopoverDescription>
              </PopoverHeader>
              <SearchField
                inputClassName="bg-fill-rest shadow-surface"
                label={t("taskboard.search")}
                placeholder={t("taskboard.search")}
                value={props.query}
                clearLabel={t("taskboard.clearSearch")}
                onClear={() => props.onQueryChange("")}
                onChange={(event) => props.onQueryChange(event.currentTarget.value)}
              />
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-metadata font-medium">{t("taskboard.priority")}</legend>
                {PRIORITIES.map((priority) => (
                  <label key={priority} className="flex items-center gap-2 text-body">
                    <Checkbox
                      checked={props.priorities.includes(priority)}
                      onCheckedChange={() => props.onTogglePriority(priority)}
                    />
                    {taskPriorityLabel(t, priority)}
                  </label>
                ))}
              </fieldset>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-metadata font-medium">{t("taskboard.labels")}</legend>
                {props.availableLabels.length > 0 ? props.availableLabels.map((label) => (
                  <label key={label} className="flex items-center gap-2 text-body">
                    <Checkbox
                      checked={props.labels.includes(label)}
                      onCheckedChange={() => props.onToggleLabel(label)}
                    />
                    {label}
                  </label>
                )) : (
                  <p className="text-metadata text-muted-foreground">{t("taskboard.noLabels")}</p>
                )}
              </fieldset>
              <Button
                type="button"
                variant="ghost"
                size="compact"
                disabled={props.activeFilterCount === 0}
                onClick={props.onClearFilters}
              >
                {t("taskboard.clearFilters")}
              </Button>
            </PopoverContent>
          </Popover>
          <Button type="button" size="compact" onClick={props.onCreateTask}>
            <Plus aria-hidden />
            {t("taskboard.new")}
          </Button>
        </div>
      </div>
    </header>
  )
}
