import { GitBranch } from "@/components/ui/icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SplitButton } from "@/components/ui/split-button";
import { cn } from "@/lib/utils";

import type { GitStatus } from "../bridge";
import { useT } from "../i18n";
import { GitHubPullRequestPanel } from "./GitHubPullRequestPanel";
import { GitSyncStatus } from "./GitSyncStatus";
import {
  gitNextActionLabel,
  gitNextActionReason,
  runGitNextAction,
  type GitNextActionItem,
  type GitNextActionProjection,
} from "./nextAction";

type GitDockContentProps = {
  status: GitStatus | null;
  action: GitNextActionProjection;
  onOpenSourceControl: () => void;
  onPush: () => void;
  onOpenPullRequest: () => void;
  onCleanupWorktree: () => void;
};

type PullRequestDockContentProps = {
  cwd: string | null;
  status: GitStatus | null;
  onRefresh: () => void;
};

/** Working-tree summary rendered inside the generic Dock container. */
export function GitDockContent({
  status,
  action,
  onOpenSourceControl,
  onPush,
  onOpenPullRequest,
  onCleanupWorktree,
}: GitDockContentProps) {
  const t = useT();
  const runAction = (item: GitNextActionItem) =>
    runGitNextAction(item, {
      openSourceControl: onOpenSourceControl,
      push: onPush,
      openPullRequest: onOpenPullRequest,
      cleanupWorktree: onCleanupWorktree,
    });
  const primaryLabel = gitNextActionLabel(
    t,
    action.primary,
    action.changeRequestLabel
  );

  return (
    <ScrollArea className="h-full min-h-0 flex-1">
      <div className="space-y-module-inset text-metadata p-4">
        {status?.is_repo ? (
          <section
            className="space-y-module-inset"
            aria-label={t("dock.workingTree")}
          >
            <div className="flex items-center gap-2">
              <GitBranch className="size-3.5" />
              <h3 className="text-body font-semibold">
                {t("dock.workingTree")}
              </h3>
              <span className="text-metadata text-muted-foreground min-w-0 truncate font-mono">
                {status.branch || "?"}
              </span>
              <GitSyncStatus
                ahead={status.ahead}
                behind={status.behind}
                className="text-primary"
              />
            </div>

            {status.files.length === 0 ? (
              <p className="text-muted-foreground">{t("rail.clean")}</p>
            ) : (
              <div className="space-y-0.5">
                {status.files.map((file) => (
                  <div key={file.path} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-control text-metadata inline-flex size-4 shrink-0 items-center justify-center font-bold",
                        file.staged
                          ? "bg-success/15 text-success"
                          : "bg-warning/15 text-warning"
                      )}
                      title={file.state}
                    >
                      {file.state.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-callout text-muted-foreground truncate font-mono">
                      {file.path}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
        <div className="space-y-1.5">
          <SplitButton
            label={primaryLabel}
            primaryLabel={primaryLabel}
            onClick={() => runAction(action.primary)}
            actions={action.alternatives.map((item) => ({
              label: gitNextActionLabel(t, item, action.changeRequestLabel),
              onClick: () => runAction(item),
              disabled: item.disabled,
            }))}
            disabled={action.primary.disabled}
            variant={action.primary.disabled ? "secondary" : "default"}
            size="sm"
            className="w-full"
            primaryClassName="flex-1"
            menuLabel={t("git.next.moreActions")}
          />
          <p className="text-metadata text-muted-foreground">
            {gitNextActionReason(t, action)}
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}

/** Current-branch pull request rendered as its own conversation-side Dock surface. */
export function PullRequestDockContent({
  cwd,
  status,
  onRefresh,
}: PullRequestDockContentProps) {
  const t = useT();

  return (
    <ScrollArea className="h-full min-h-0 flex-1">
      <div className="text-metadata p-4">
        {status?.is_repo ? (
          <GitHubPullRequestPanel
            key={`${cwd ?? "."}:${status.branch}`}
            cwd={cwd ?? "."}
            branch={status.branch}
            onRefreshGit={onRefresh}
          />
        ) : (
          <p className="text-muted-foreground">{t("rail.notARepo")}</p>
        )}
      </div>
    </ScrollArea>
  );
}
