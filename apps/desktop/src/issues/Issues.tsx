import { useEffect, useState } from "react";
import { listGithubIssues, type Issue } from "../bridge";
import type { SceneInfo } from "../session/scene";
import { useT } from "../i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

// GitHub Issues: list open issues for the working dir's repo (via gh) and insert one as context.
// R12 adds per-row delegation: pick a scene and the issue opens as a provenance-carrying block
// in a fresh draft fully applied to that scene — you stay assignee.
export function IssuesModal({
  cwd,
  scenes,
  onInsert,
  onDelegate,
  onClose,
}: {
  cwd: string;
  scenes: SceneInfo[];
  onInsert: (issue: Issue) => void;
  onDelegate: (issue: Issue, sceneReference: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    listGithubIssues(cwd)
      .then((i) => {
        setIssues(i);
        setLoading(false);
      })
      .catch((e) => {
        setErr(String(e));
        setLoading(false);
      });
  }, [cwd]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>GitHub Issues</DialogTitle>
        </DialogHeader>

        {loading && <p className="text-hint text-muted-foreground">Loading via gh…</p>}
        {err && <p className="text-hint text-destructive">{err}</p>}

        <ScrollArea className="max-h-[52vh] pr-3">
          <div className="space-y-1.5">
            {issues.map((it) => (
              <div key={`${it.source}-${it.id}`} className="flex items-center gap-3 rounded-xl bg-fill-quiet p-2.5">
                <a
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 font-mono text-ui font-semibold text-primary no-underline"
                >
                  #{it.id}
                </a>
                <span className="flex-1 truncate text-ui">{it.title}</span>
                <span className="text-cap uppercase text-muted-foreground">{it.state}</span>
                <Button size="sm" onClick={() => onInsert(it)}>
                  Add to prompt
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      {t("issueDeleg.delegate")}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {scenes.length === 0 && (
                      <DropdownMenuItem disabled>{t("issueDeleg.noScenes")}</DropdownMenuItem>
                    )}
                    {scenes.map((s) => (
                      <DropdownMenuItem key={s.reference} onSelect={() => onDelegate(it, s.reference)}>
                        {s.icon ? <span aria-hidden>{s.icon}</span> : null}
                        {s.title}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            {!loading && !err && issues.length === 0 && (
              <p className="p-2 text-ui text-muted-foreground">
                No open issues (or this dir isn’t a GitHub repo).
              </p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
