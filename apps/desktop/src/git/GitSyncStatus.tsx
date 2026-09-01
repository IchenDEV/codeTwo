import { ArrowDown, ArrowUp } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useT } from "../i18n";

export function GitSyncStatus({
  ahead,
  behind,
  className,
}: {
  ahead: number;
  behind: number;
  className?: string;
}) {
  const t = useT();
  if (ahead <= 0 && behind <= 0) return null;

  return (
    <span className={cn("inline-flex items-center gap-1", className)} data-git-sync-status>
      {ahead > 0 ? (
        <span className="inline-flex items-center gap-0.5" aria-label={t("git.ahead", { count: ahead })}>
          <ArrowUp className="size-3" aria-hidden />
          {ahead}
        </span>
      ) : null}
      {behind > 0 ? (
        <span className="inline-flex items-center gap-0.5" aria-label={t("git.behind", { count: behind })}>
          <ArrowDown className="size-3" aria-hidden />
          {behind}
        </span>
      ) : null}
    </span>
  );
}
