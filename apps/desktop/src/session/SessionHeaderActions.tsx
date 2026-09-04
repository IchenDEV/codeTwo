import {
  Box,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  History,
  Ellipsis,
  MessageSquareText,
  Orbit,
  Plus,
  Play,
  Send,
  Upload,
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

export const SessionHeaderActions = ({
  canCommit,
  onAddAction,
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
  onMoveTask,
}: {
  readonly canCommit: boolean;
  readonly onAddAction: () => void;
  readonly onOpenCursor: () => void;
  readonly onOpenAntigravity: () => void;
  readonly onOpenFinder: () => void;
  readonly editorLaunchersAvailable: boolean;
  readonly fileManagerLabel: string;
  readonly finderHint: string;
  readonly actions?: ProjectScript[];
  readonly onRunAction?: (action: ProjectScript) => void;
  readonly onCommit: () => void;
  readonly onCheckpoint: () => void;
  readonly onPush: () => void;
  readonly onMoveTask: () => void;
}) => {
  const t = useT();
  const renderOpenMenu = () => (
    <DropdownMenuContent align="end">
      <DropdownMenuGroup>
        {editorLaunchersAvailable ? <>
            <DropdownMenuItem onClick={onOpenCursor}>
              <Box aria-hidden />
              {t("header.cursor")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenAntigravity}>
              <Orbit aria-hidden />
              {t("header.antigravity")}
            </DropdownMenuItem>
          </> : null}
        <DropdownMenuItem onClick={onOpenFinder}>
          <Folder aria-hidden />
          {fileManagerLabel}
          {finderHint ? <DropdownMenuShortcut>{finderHint}</DropdownMenuShortcut> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onMoveTask}>
          <Send aria-hidden />
          Move task to device
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
  const renderCommitMenu = () => (
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
  );

  return (
    <div
      className="session-header-actions flex shrink-0 items-center gap-2"
      role="group"
      aria-label={t("header.actions")}
    >
      <Button
        type="button"
        variant="ghost"
        size="compact"
        className="session-header-action-main bg-fill-rest text-foreground hover:bg-fill-hover hover:text-foreground"
        aria-label={t("header.addAction")}
        onClick={onAddAction}
      >
        <Plus
          className="session-header-action-icon text-muted-foreground size-4"
          aria-hidden
        />
        <span className="session-header-action-label">
          {t("header.addAction")}
        </span>
      </Button>

      {actions.slice(0, 2).map((action) => (
        <Button
          key={action.id}
          type="button"
          variant="ghost"
          size="compact"
          className="session-header-action-main bg-fill-rest text-foreground hover:bg-fill-hover hover:text-foreground max-w-36"
          aria-label={action.name || action.id}
          title={action.kind === "prompt" ? action.prompt : action.command}
          onClick={() => onRunAction?.(action)}
        >
          {action.kind === "prompt" ? (
            <MessageSquareText
              className="session-header-action-icon text-muted-foreground size-3.5"
              aria-hidden
            />
          ) : (
            <Play
              className="session-header-action-icon text-muted-foreground size-3.5"
              aria-hidden
            />
          )}
          <span className="session-header-action-label truncate">
            {action.name || action.id}
          </span>
        </Button>
      ))}

      {actions.length > 2 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-muted-foreground size-7"
                aria-label={t("actionDialog.moreActions")}
              >
                <Ellipsis className="size-4" aria-hidden />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {actions.slice(2).map((action) => (
                <DropdownMenuItem
                  key={action.id}
                  onClick={() => onRunAction?.(action)}
                >
                  {action.kind === "prompt" ? (
                    <MessageSquareText aria-hidden />
                  ) : (
                    <Play aria-hidden />
                  )}
                  {action.name || action.id}
                  {action.keybinding ? <DropdownMenuShortcut>
                      {formatCombo(action.keybinding)}
                    </DropdownMenuShortcut> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="compact"
              className="session-header-action-main bg-fill-rest text-foreground hover:bg-fill-hover hover:text-foreground"
              aria-label={t("header.open")}
            >
              <Folder
                className="session-header-action-icon text-muted-foreground size-4"
                aria-hidden
              />
              <span className="session-header-action-label">
                {t("header.open")}
              </span>
            </Button>
          }
        />
        {renderOpenMenu()}
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="compact"
              disabled={!canCommit}
              className="session-header-action-main bg-fill-rest text-foreground hover:bg-fill-hover hover:text-foreground disabled:opacity-60"
              aria-label={t("header.commit")}
            >
              <GitCommitHorizontal
                className="session-header-action-icon text-muted-foreground size-4"
                aria-hidden
              />
              <span className="session-header-action-label">
                {t("header.commit")}
              </span>
            </Button>
          }
        />
        {renderCommitMenu()}
      </DropdownMenu>
    </div>
  );
}
