import {
  Activity,
  Box,
  ChevronDown,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  History,
  Ellipsis,
  MessageSquare,
  MessageSquareText,
  Orbit,
  PanelRight,
  Plus,
  Play,
  Send,
  TerminalIcon,
  Upload,
  type LucideIcon,
} from "lucide-react";

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
          variant="secondary"
          size="compact"
          disabled={disabled}
          aria-label={label}
          className="relative w-7 rounded-l-none px-0 before:absolute before:left-0 before:h-4 before:w-px before:bg-foreground/10"
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
  icon: LucideIcon;
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
            variant={active ? "secondary" : "ghost"}
            size="icon"
            className={cn("size-7", active && "text-primary")}
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
  terminalActive,
  panelActive,
  sideChatActive = false,
  trajectoryActive = false,
  trajectoryAvailable = false,
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
  onToggleTerminal,
  onTogglePanel,
  onToggleSideChat = () => {},
  onToggleTrajectory = () => {},
  onMoveTask,
}: {
  canCommit: boolean;
  terminalActive: boolean;
  panelActive: boolean;
  sideChatActive?: boolean;
  trajectoryActive?: boolean;
  trajectoryAvailable?: boolean;
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
  onToggleTerminal: () => void;
  onTogglePanel: () => void;
  onToggleSideChat?: () => void;
  onToggleTrajectory?: () => void;
  onMoveTask: () => void;
}) {
  const t = useT();

  return (
    <div className="flex shrink-0 items-center gap-2" role="group" aria-label={t("header.actions")}>
      <Button type="button" variant="secondary" size="compact" onClick={onAddAction}>
        <Plus className="size-4" aria-hidden />
        {t("header.addAction")}
      </Button>

      {actions.slice(0, 2).map((action) => (
        <Button
          key={action.id}
          type="button"
          variant="secondary"
          size="compact"
          className="max-w-36"
          title={action.kind === "prompt" ? action.prompt : action.command}
          onClick={() => onRunAction?.(action)}
        >
          {action.kind === "prompt" ? (
            <MessageSquareText className="size-3.5" aria-hidden />
          ) : (
            <Play className="size-3.5" aria-hidden />
          )}
          <span className="truncate">{action.name || action.id}</span>
        </Button>
      ))}

      {actions.length > 2 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={(
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-7"
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
        <div className="flex shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="compact"
            className="rounded-r-none px-2.5"
            onClick={onOpen}
          >
            <Folder className="size-4" aria-hidden />
            {t("header.open")}
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
        <div className="flex shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="compact"
            disabled={!canCommit}
            className="rounded-r-none px-2.5"
            onClick={onCommit}
          >
            <GitCommitHorizontal className="size-4" aria-hidden />
            {t("header.commit")}
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

      {trajectoryAvailable ? (
        <PanelAction
          icon={Activity}
          label={t(trajectoryActive ? "trajectory.hide" : "trajectory.show")}
          active={trajectoryActive}
          onClick={onToggleTrajectory}
        />
      ) : null}
      <PanelAction
        icon={MessageSquare}
        label={t("sideChat.toggle")}
        active={sideChatActive}
        onClick={onToggleSideChat}
      />
      <PanelAction
        icon={TerminalIcon}
        label={t("action.toggle_terminal")}
        active={terminalActive}
        onClick={onToggleTerminal}
      />
      <PanelAction
        icon={PanelRight}
        label={t("header.panel")}
        active={panelActive}
        onClick={onTogglePanel}
      />
    </div>
  );
}
