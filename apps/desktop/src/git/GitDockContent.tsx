import { GitBranch } from "@/components/ui/icons";

import type { GitStatus } from "../bridge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";
import { GitHubPullRequestPanel } from "./GitHubPullRequestPanel";

type GitDockContentProps = {
  readonly cwd: string | null;
  readonly status: GitStatus | null;
  readonly onRefresh: () => void;
  readonly onOpenSourceControl: () => void;
};

/**
Source-control summary rendered inside the generic Dock container.
*/
export const GitDockContent = ({
  cwd,
  status,
  onRefresh,
  onOpenSourceControl,
}: GitDockContentProps) => {
  const t = useT();

  return (
    <ScrollArea className="h-full min-h-0 flex-1">
      <div className="space-y-module-inset text-metadata p-4">
        {status?.is_repo ? (
          <>
            <GitHubPullRequestPanel
              key={`${cwd ?? "."}:${status.branch}`}
              cwd={cwd ?? "."}
              branch={status.branch}
              onRefreshGit={onRefresh}
            />

            <section
              className="space-y-module-inset pt-3"
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
                {status.ahead > 0 && (
                  <span className="text-primary">↑{status.ahead}</span>
                )}
                {status.behind > 0 && (
                  <span className="text-primary">↓{status.behind}</span>
                )}
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

              <Button
                size="sm"
                className="w-full"
                onClick={onOpenSourceControl}
              >
                {t("dock.reviewCommit")}
              </Button>
            </section>
          </>
        ) : (
          <p className="text-muted-foreground">{t("rail.notARepo")}</p>
        )}
      </div>
    </ScrollArea>
  );
};
