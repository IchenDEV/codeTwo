import { PageHeader } from "@/components/business/page-header";
import { SearchField } from "@/components/business/search-field";
import { ViewSwitcher } from "@/components/business/view-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Filter, Plus } from "@/components/ui/icons";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Translate } from "@/i18n";

import { PRIORITIES } from "./taskBoard";
import type { TaskPriority } from "./taskBoard";
import { taskPriorityLabel } from "./TaskEditorDialog";
import type { TaskBoardView } from "./workspaceTypes";

interface TaskBoardHeaderProps {
  t: Translate;
  taskCount: number;
  view: TaskBoardView;
  onViewChange: (view: TaskBoardView) => void;
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  activeFilterCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  priorities: readonly TaskPriority[];
  onTogglePriority: (priority: TaskPriority) => void;
  labels: readonly string[];
  availableLabels: readonly string[];
  onToggleLabel: (label: string) => void;
  onClearFilters: () => void;
  onCreateTask: () => void;
}

export function TaskBoardHeader(props: TaskBoardHeaderProps) {
  const { t } = props;
  return (
    <header className="bg-background shrink-0">
      <div className="task-board-panel-header px-4 py-5 sm:px-6">
        <PageHeader
          title={t("taskboard.allTasks")}
          titleAccessory={
            <Badge
              variant="secondary"
              className="text-muted-foreground tabular-nums"
            >
              {props.taskCount}
            </Badge>
          }
          description={t("taskboard.workspaceDescription")}
          actions={
            <>
              <ViewSwitcher<TaskBoardView>
                label={t("taskboard.viewSwitcher")}
                value={props.view}
                options={[
                  { value: "list", label: t("taskboard.view.list") },
                  { value: "board", label: t("taskboard.view.board") },
                ]}
                onValueChange={props.onViewChange}
              />
              <Popover
                open={props.filtersOpen}
                onOpenChange={props.onFiltersOpenChange}
              >
                <PopoverTrigger
                  render={
                    <Button type="button" variant="secondary" size="compact">
                      <Filter aria-hidden />
                      {t("taskboard.filter")}
                      {props.activeFilterCount > 0 ? (
                        <Badge className="text-metadata min-w-4 px-1">
                          {props.activeFilterCount}
                        </Badge>
                      ) : null}
                    </Button>
                  }
                />
                <PopoverContent
                  align="end"
                  className="grid max-h-(--available-height) w-80 gap-4 overflow-y-auto"
                >
                  <PopoverHeader>
                    <PopoverTitle>{t("taskboard.filtersTitle")}</PopoverTitle>
                    <PopoverDescription>
                      {t("taskboard.filtersDescription")}
                    </PopoverDescription>
                  </PopoverHeader>
                  <SearchField
                    inputClassName="bg-fill-rest shadow-surface"
                    label={t("taskboard.search")}
                    placeholder={t("taskboard.search")}
                    value={props.query}
                    clearLabel={t("taskboard.clearSearch")}
                    onClear={() => props.onQueryChange("")}
                    onChange={(event) =>
                      props.onQueryChange(event.currentTarget.value)
                    }
                  />
                  <fieldset className="grid gap-2">
                    <legend className="text-metadata mb-1 font-medium">
                      {t("taskboard.priority")}
                    </legend>
                    {PRIORITIES.map((priority) => (
                      <label
                        key={priority}
                        className="text-body flex items-center gap-2"
                      >
                        <Checkbox
                          checked={props.priorities.includes(priority)}
                          onCheckedChange={() =>
                            props.onTogglePriority(priority)
                          }
                        />
                        {taskPriorityLabel(t, priority)}
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className="grid gap-2">
                    <legend className="text-metadata mb-1 font-medium">
                      {t("taskboard.labels")}
                    </legend>
                    {props.availableLabels.length > 0 ? (
                      props.availableLabels.map((label) => (
                        <label
                          key={label}
                          className="text-body flex items-center gap-2"
                        >
                          <Checkbox
                            checked={props.labels.includes(label)}
                            onCheckedChange={() => props.onToggleLabel(label)}
                          />
                          {label}
                        </label>
                      ))
                    ) : (
                      <p className="text-metadata text-muted-foreground">
                        {t("taskboard.noLabels")}
                      </p>
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
            </>
          }
        />
      </div>
    </header>
  );
}
