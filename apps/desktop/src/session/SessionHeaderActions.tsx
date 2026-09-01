import {
  Box,
  Folder,
  GitCommitHorizontal,
  Ellipsis,
  MessageSquareText,
  Orbit,
  Plus,
  Play,
  Send,
} from "@/components/ui/icons";

import { useT } from "../i18n";
import { formatCombo } from "../keys";
import type { ProjectScript } from "../bridge";
import {
  gitNextActionLabel,
  runGitNextAction,
  type GitNextActionItem,
  type GitNextActionProjection,
} from "../git/nextAction";
import { Button } from "@/components/ui/button";
import { SplitButton } from "@/components/ui/split-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SessionHeaderActions({
  gitAction,
  onAddAction,
  onOpenCursor,
  onOpenAntigravity,
  onOpenFinder,
  editorLaunchersAvailable,
  fileManagerLabel,
  finderHint,
  actions = [],
  onRunAction,
  onOpenSourceControl,
  onOpenPullRequest,
  onCleanupWorktree,
  onCheckpoint,
  onPush,
  onMoveTask,
}: {
  gitAction: GitNextActionProjection;
  onAddAction: () => void;
  onOpenCursor: () => void;
  onOpenAntigravity: () => void;
  onOpenFinder: () => void;
  editorLaunchersAvailable: boolean;
  fileManagerLabel: string;
  finderHint: string;
  actions?: ProjectScript[];
  onRunAction?: (action: ProjectScript) => void;
  onOpenSourceControl: () => void;
  onOpenPullRequest: () => void;
  onCleanupWorktree: () => void;
  onCheckpoint: () => void;
  onPush: () => void;
  onMoveTask: () => void;
}) {
  const t = useT();
  const runGitAction = (item: GitNextActionItem) => runGitNextAction(item, {
    openSourceControl: onOpenSourceControl,
    push: onPush,
    openPullRequest: onOpenPullRequest,
    cleanupWorktree: onCleanupWorktree,
  });
  const primaryGitLabel = gitNextActionLabel(
    t,
    gitAction.primary,
    gitAction.changeRequestLabel,
  );
  const gitAlternatives = gitAction.alternatives.map((item) => ({
    label: gitNextActionLabel(t, item, gitAction.changeRequestLabel),
    onClick: () => runGitAction(item),
    disabled: item.disabled,
  }));
  if (!gitAction.primary.disabled) {
    gitAlternatives.push({
      label: t("header.checkpoint"),
      onClick: onCheckpoint,
      disabled: false,
    });
  }
  const renderOpenMenu = () => (
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
        <Plus className="session-header-action-icon size-4 text-muted-foreground" aria-hidden />
        <span className="session-header-action-label">{t("header.addAction")}</span>
      </Button>

      {actions.slice(0, 2).map((action) => (
        <Button
          key={action.id}
          type="button"
          variant="ghost"
          size="compact"
          className="session-header-action-main max-w-36 bg-fill-rest text-foreground hover:bg-fill-hover hover:text-foreground"
          aria-label={action.name || action.id}
          title={action.kind === "prompt" ? action.prompt : action.command}
          onClick={() => onRunAction?.(action)}
        >
          {action.kind === "prompt" ? (
            <MessageSquareText className="session-header-action-icon size-3.5 text-muted-foreground" aria-hidden />
          ) : (
            <Play className="session-header-action-icon size-3.5 text-muted-foreground" aria-hidden />
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
        <DropdownMenuTrigger
          render={(
            <Button
              type="button"
              variant="ghost"
              size="compact"
              className="session-header-action-main bg-fill-rest text-foreground hover:bg-fill-hover hover:text-foreground"
              aria-label={t("header.open")}
            >
              <Folder className="session-header-action-icon size-4 text-muted-foreground" aria-hidden />
              <span className="session-header-action-label">{t("header.open")}</span>
            </Button>
          )}
        />
        {renderOpenMenu()}
      </DropdownMenu>

      <SplitButton
        label={(
          <>
            <GitCommitHorizontal className="session-header-action-icon size-4 text-muted-foreground" aria-hidden />
            <span className="session-header-action-label">{primaryGitLabel}</span>
          </>
        )}
        primaryLabel={primaryGitLabel}
        onClick={() => runGitAction(gitAction.primary)}
        actions={gitAlternatives}
        disabled={gitAction.primary.disabled}
        variant="ghost"
        size="compact"
        menuSide="bottom"
        menuAlign="end"
        menuLabel={t("git.next.moreActions")}
        className="session-header-git-action"
        primaryClassName="session-header-action-main bg-fill-rest text-foreground hover:bg-fill-hover hover:text-foreground disabled:opacity-60"
        menuButtonClassName="bg-fill-rest text-muted-foreground hover:bg-fill-hover hover:text-muted-foreground disabled:opacity-60"
      />
    </div>
  );
}
