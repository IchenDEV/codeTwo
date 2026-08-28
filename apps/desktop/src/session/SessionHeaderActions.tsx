import {
  Box,
  ChevronDown,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  History,
  Ellipsis,
  MessageSquareText,
  Orbit,
  PanelRight,
  Plus,
  Play,
  Send,
  Upload,
  type HugeIcon,
} from "@/components/ui/icons";

import { useT } from "../i18n";
import { formatCombo } from "../keys";
import type { ProjectScript } from "../bridge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function SplitMenuTrigger({ label, disabled = false }: { label: string; disabled?: boolean }) {
  return (
    <DropdownMenuTrigger
      render={(
        <Button
          type="button"
          variant="ghost"
          size="compact"
          disabled={disabled}
          aria-label={label}
          className="session-header-split-trigger relative w-7 rounded-l-none px-0 text-muted-foreground hover:text-muted-foreground before:absolute before:left-0 before:h-4 before:w-px before:bg-foreground/10"
        >
          <ChevronDown className="size-4" aria-hidden />
        </Button>
      )}
    />
  );
}

function PanelAction({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: HugeIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "size-7 text-muted-foreground hover:text-muted-foreground",
              active && "bg-fill-rest",
            )}
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
          >
            <Icon className="size-4" aria-hidden />
          </Button>
        )}
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function SessionHeaderActions({
  canCommit,
  panelActive,
  onAddAction,
  onOpen,
  onOpenCursor,
  onOpenAntigravity,
  onOpenFinder,
  editorLaunchersAvailable,
  fileManagerLabel,
  finderHint,
  actions = [],
  onRunAction,
  onCommit,
  onCheckpoint,
  onPush,
  onTogglePanel,
  onMoveTask,
}: {
  canCommit: boolean;
  panelActive: boolean;
  onAddAction: () => void;
  onOpen: () => void;
  onOpenCursor: () => void;
  onOpenAntigravity: () => void;
  onOpenFinder: () => void;
  editorLaunchersAvailable: boolean;
  fileManagerLabel: string;
  finderHint: string;
  actions?: ProjectScript[];
  onRunAction?: (action: ProjectScript) => void;
  onCommit: () => void;
  onCheckpoint: () => void;
  onPush: () => void;
  onTogglePanel: () => void;
  onMoveTask: () => void;
}) {
  const t = useT();

  return (
    <div
      className="session-header-actions flex shrink-0 items-center gap-1"
      role="group"
      aria-label={t("header.actions")}
    >
      <Button
        type="button"
        variant="ghost"
        size="compact"
        className="session-header-action-main text-muted-foreground hover:text-muted-foreground"
        aria-label={t("header.addAction")}
        onClick={onAddAction}
      >
        <Plus className="size-4" aria-hidden />
        <span className="session-header-action-label">{t("header.addAction")}</span>
      </Button>

      {actions.slice(0, 2).map((action) => (
        <Button
          key={action.id}
          type="button"
          variant="ghost"
          size="compact"
          className="session-header-action-main max-w-36 text-muted-foreground hover:text-muted-foreground"
          aria-label={action.name || action.id}
          title={action.kind === "prompt" ? action.prompt : action.command}
          onClick={() => onRunAction?.(action)}
        >
          {action.kind === "prompt" ? (
            <MessageSquareText className="size-3.5" aria-hidden />
          ) : (
            <Play className="size-3.5" aria-hidden />
          )}
          <span className="session-header-action-label truncate">{action.name || action.id}</span>
        </Button>
      ))}

      {actions.length > 2 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={(
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-muted-foreground"
                aria-label={t("actionDialog.moreActions")}
              >
                <Ellipsis className="size-4" aria-hidden />
              </Button>
            )}
          />
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {actions.slice(2).map((action) => (
                <DropdownMenuItem key={action.id} onClick={() => onRunAction?.(action)}>
                  {action.kind === "prompt" ? (
                    <MessageSquareText aria-hidden />
                  ) : (
                    <Play aria-hidden />
                  )}
                  {action.name || action.id}
                  {action.keybinding && (
                    <DropdownMenuShortcut>{formatCombo(action.keybinding)}</DropdownMenuShortcut>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu>
        <div className="session-header-split-group flex shrink-0 gap-0">
          <Button
            type="button"
            variant="ghost"
            size="compact"
            className="session-header-action-main rounded-r-none text-muted-foreground hover:text-muted-foreground"
            aria-label={t("header.open")}
            onClick={onOpen}
          >
            <Folder className="size-4" aria-hidden />
            <span className="session-header-action-label">{t("header.open")}</span>
          </Button>
          <SplitMenuTrigger label={`${t("header.open")} · ${t("header.more")}`} />
        </div>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {editorLaunchersAvailable && (
              <>
                <DropdownMenuItem onClick={onOpenCursor}>
                  <Box aria-hidden />
                  {t("header.cursor")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenAntigravity}>
                  <Orbit aria-hidden />
                  {t("header.antigravity")}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onClick={onOpenFinder}>
              <Folder aria-hidden />
              {fileManagerLabel}
              {finderHint && <DropdownMenuShortcut>{finderHint}</DropdownMenuShortcut>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMoveTask}>
              <Send aria-hidden />
              Move task to device
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <div className="session-header-split-group flex shrink-0 gap-0">
          <Button
            type="button"
            variant="ghost"
            size="compact"
            disabled={!canCommit}
            className="session-header-action-main rounded-r-none text-muted-foreground hover:text-muted-foreground"
            aria-label={t("header.commit")}
            onClick={onCommit}
          >
            <GitCommitHorizontal className="size-4" aria-hidden />
            <span className="session-header-action-label">{t("header.commit")}</span>
          </Button>
          <SplitMenuTrigger
            disabled={!canCommit}
            label={`${t("header.commit")} · ${t("header.more")}`}
          />
        </div>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onCommit}>
              <GitBranch aria-hidden />
              {t("action.open_source_control")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCheckpoint}>
              <History aria-hidden />
              {t("header.checkpoint")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPush}>
              <Upload aria-hidden />
              {t("header.push")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <PanelAction
        icon={PanelRight}
        label={t("header.panel")}
        active={panelActive}
        onClick={onTogglePanel}
      />
    </div>
  );
}
