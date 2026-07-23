import { useEffect, useState } from "react";
import { listGithubIssues, type Issue } from "../bridge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

// GitHub Issues: list open issues for the working dir's repo (via gh) and insert one as context.
export function IssuesModal({
  cwd,
  onInsert,
  onClose,
}: {
  cwd: string;
  onInsert: (issue: Issue) => void;
  onClose: () => void;
}) {
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

        {loading && <p className="text-xs text-muted-foreground">Loading via gh…</p>}
        {err && <p className="text-xs text-destructive">{err}</p>}

        <ScrollArea className="max-h-[52vh] pr-3">
          <div className="space-y-1.5">
            {issues.map((it) => (
              <div key={`${it.source}-${it.id}`} className="flex items-center gap-3 rounded-lg border p-2.5">
                <a
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 font-mono text-sm font-semibold text-primary no-underline"
                >
                  #{it.id}
                </a>
                <span className="flex-1 truncate text-[13px]">{it.title}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{it.state}</span>
                <Button size="sm" onClick={() => onInsert(it)}>
                  Add to prompt
                </Button>
              </div>
            ))}
            {!loading && !err && issues.length === 0 && (
              <p className="p-2 text-sm text-muted-foreground">
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
