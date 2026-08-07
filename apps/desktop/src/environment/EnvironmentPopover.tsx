import { useState, type ReactNode } from "react";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Copy,
  Folder,
  FolderPlus,
  GitBranch,
  GitCommitHorizontal,
  History,
  Laptop,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  SquarePlus,
  Store,
  type LucideIcon,
} from "lucide-react";

import type { GitStatus, Project } from "../bridge";
import { useT } from "../i18n";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/ui/toast";
import { cn } from "@/lib/utils";

function EnvironmentRow({
  icon: Icon,
  label,
  description,
  detail,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  detail?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  const content = (
    <>
      <Icon className={cn("size-4 shrink-0 text-muted-foreground", description && "mt-0.5 self-start")} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui">{label}</span>
        {description && (
          <span className="block truncate text-fine leading-snug text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      {detail !== undefined && (
        <span className="shrink-0 text-hint text-muted-foreground">{detail}</span>
      )}
      {active && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
    </>
  );

  if (!onClick) {
    return <div className="flex min-h-8 items-center gap-2 px-2 py-1">{content}</div>;
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        active && "bg-accent/70",
      )}
    >
      {content}
    </button>
  );
}

/**
 * The project environment at a glance. It keeps the compact, frequently checked Git facts in a
 * header-anchored popover. The neighboring panel control owns the dock independently.
 */
export function EnvironmentPopover({
  project,
  projectPath,
  projects,
  git,
  diffStat,
  onRefresh,
  onSelectProject,
  onAddProject,
  onCheckpoint,
  onOpenSourceControl,
  onOpenIssues,
  onOpenUsage,
  onOpenMarket,
  onOpenSettings,
}: {
  project: string | null;
  projectPath: string | null;
  projects: Project[];
  git: GitStatus | null;
  diffStat: { added: number; deleted: number };
  onRefresh: () => void;
  onSelectProject: (path: string) => void;
  onAddProject: () => void;
  onCheckpoint: () => void;
  onOpenSourceControl: () => void;
  onOpenIssues: () => void;
  onOpenUsage: () => void;
  onOpenMarket: () => void;
  onOpenSettings: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const [localOpen, setLocalOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const isRepo = git?.is_repo === true;
  const dirty = isRepo ? git.files.length : 0;
  const staged = isRepo ? git.files.filter((file) => file.staged).length : 0;

  const changeDetail = git === null ? (
    "…"
  ) : isRepo ? (
    <span className="font-mono">
      <span className="text-success">+{diffStat.added}</span>{" "}
      <span className="text-destructive">−{diffStat.deleted}</span>
    </span>
  ) : (
    "—"
  );

  const openSourceControl = () => {
    setOpen(false);
    onOpenSourceControl();
  };

  const chooseProject = (path: string) => {
    setOpen(false);
    onSelectProject(path);
  };

  const addProject = () => {
    setOpen(false);
    onAddProject();
  };

  const openTool = (action: () => void) => {
    setOpen(false);
    action();
  };

  const copyProjectPath = async () => {
    if (!projectPath) return;
    try {
      await navigator.clipboard.writeText(projectPath);
      toast(t("environment.pathCopied"), "success");
    } catch {
      toast(t("environment.copyFailed"), "error");
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onRefresh();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant={open ? "secondary" : "ghost"}
          size="icon"
          className={cn("size-7 shrink-0", open && "text-primary")}
          aria-label={t("header.environment")}
          title={t("header.environment")}
        >
          <SlidersHorizontal className="size-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 rounded-lg p-2"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="mb-1 flex h-8 items-center gap-2 px-2">
          <h2 className="min-w-0 flex-1 truncate text-title font-semibold">
            {t("environment.title")}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label={t("dock.refresh")}
            onClick={onRefresh}
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>

        <EnvironmentRow
          icon={SquarePlus}
          label={t("rail.changes")}
          description={
            isRepo
              ? dirty === 0
                ? t("rail.clean")
                : staged > 0
                  ? `${t("rail.changedCount", { count: dirty })} · ${t("rail.stagedCount", { count: staged })}`
                  : t("rail.changedCount", { count: dirty })
              : t("rail.notARepo")
          }
          detail={changeDetail}
          onClick={openSourceControl}
        />
        {isRepo && git.files.length > 0 && (
          <div className="mb-1 ml-4 mr-1 rounded-md bg-fill-quiet p-1">
            {git.files.slice(0, 3).map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={openSourceControl}
                className="flex min-h-7 w-full items-center gap-2 rounded-sm px-1.5 text-left transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span
                  className={cn(
                    "inline-flex size-4 shrink-0 items-center justify-center rounded text-cap font-bold",
                    file.staged ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                  )}
                >
                  {file.state.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-fine text-muted-foreground">
                  {file.path}
                </span>
              </button>
            ))}
            {git.files.length > 3 && (
              <p className="px-1.5 py-1 text-fine text-muted-foreground">
                {t("environment.moreChanges", { count: git.files.length - 3 })}
              </p>
            )}
          </div>
        )}

        <Collapsible open={localOpen} onOpenChange={setLocalOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              title={projectPath ?? undefined}
            >
              <Laptop className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-ui font-medium">
                {t("environment.local")}
              </span>
              {project && (
                <span className="max-w-28 truncate text-hint text-muted-foreground">{project}</span>
              )}
              {localOpen ? (
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pl-3">
            <Collapsible open={projectsOpen} onOpenChange={setProjectsOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui">{t("environment.project")}</span>
                    <span className="block truncate text-fine leading-snug text-muted-foreground">
                      {project ?? t("rail.noProject")}
                    </span>
                  </span>
                  {projectsOpen ? (
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="max-h-48 overflow-y-auto pl-3">
                {projects.map((item) => (
                  <EnvironmentRow
                    key={item.path}
                    icon={item.path === projectPath ? Check : Folder}
                    label={item.name}
                    description={item.path}
                    active={item.path === projectPath}
                    onClick={() => chooseProject(item.path)}
                  />
                ))}
                <EnvironmentRow icon={FolderPlus} label={t("rail.addProject")} onClick={addProject} />
              </CollapsibleContent>
            </Collapsible>
            <EnvironmentRow
              icon={Copy}
              label={t("files.copyPath")}
              description={projectPath ?? t("rail.noProject")}
              onClick={() => void copyProjectPath()}
              disabled={!projectPath}
            />
            <EnvironmentRow
              icon={GitBranch}
              label={isRepo ? git.branch || "?" : t("rail.notARepo")}
              detail={
                isRepo && (git.ahead > 0 || git.behind > 0) ? (
                  <span className="font-mono text-primary">
                    {git.ahead > 0 && `↑${git.ahead}`}
                    {git.ahead > 0 && git.behind > 0 && " "}
                    {git.behind > 0 && `↓${git.behind}`}
                  </span>
                ) : undefined
              }
            />
            <EnvironmentRow
              icon={History}
              label={t("header.checkpoint")}
              onClick={onCheckpoint}
              disabled={!isRepo}
            />
            <EnvironmentRow
              icon={GitCommitHorizontal}
              label={t("environment.commitOrPush")}
              onClick={openSourceControl}
              disabled={!isRepo}
            />
          </CollapsibleContent>
        </Collapsible>

        <Separator className="my-1" />
        <div className="flex h-6 items-center px-2 text-hint font-medium text-muted-foreground">
          {t("environment.tools")}
        </div>
        <div className="grid grid-cols-2 gap-1">
          <EnvironmentRow
            icon={CircleDot}
            label={t("environment.issues")}
            onClick={() => openTool(onOpenIssues)}
          />
          <EnvironmentRow
            icon={BarChart3}
            label={t("environment.usage")}
            onClick={() => openTool(onOpenUsage)}
          />
          <EnvironmentRow
            icon={Store}
            label={t("composer.market")}
            onClick={() => openTool(onOpenMarket)}
          />
          <EnvironmentRow
            icon={Settings}
            label={t("header.settings")}
            onClick={() => openTool(onOpenSettings)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
