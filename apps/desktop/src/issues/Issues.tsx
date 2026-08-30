import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Clapperboard } from "@/components/ui/icons";
import { listGithubIssues, listIssueDelegations, type Issue, type IssueDelegation } from "../bridge";
import type { SceneInfo } from "../session/scene";
import { useT } from "../i18n";
import { Badge } from "@/components/ui/badge";
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
/** Lazily loaded delegation history for one issue: scene, when, session jump, tracker comment. */
function DelegationTrail({
  issue,
  onOpenSession,
}: {
  issue: Issue;
  onOpenSession?: (session: string) => void;
}) {
  const t = useT();
  const [rows, setRows] = useState<IssueDelegation[] | null>(null);

  useEffect(() => {
    let alive = true;
    void listIssueDelegations(issue.source, issue.id).then((r) => {
      if (alive) setRows(r);
    });
    return () => {
      alive = false;
    };
  }, [issue.source, issue.id]);

  if (rows === null) return <p className="px-2 pb-1 text-callout text-muted-foreground">…</p>;
  if (rows.length === 0)
    return <p className="px-2 pb-1 text-callout text-muted-foreground">{t("issueDeleg.none")}</p>;
  return (
    <div className="space-y-0.5 px-2 pb-1">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2 text-callout text-muted-foreground">
          <Badge variant="outline" className="shrink-0 text-metadata">
            {row.scene_title || row.scene_ref}
          </Badge>
          <span className="shrink-0">{new Date(row.created_at).toLocaleString()}</span>
          {row.session_id && onOpenSession && (
            <Button
              type="button"
              variant="link"
              size="compact"
              className="h-auto shrink-0 px-0 py-0 text-primary"
              onClick={() => onOpenSession(row.session_id!)}
            >
              {t("issueDeleg.openSession")}
            </Button>
          )}
          {row.comment_url && (
            <a
              href={row.comment_url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-primary no-underline hover:underline"
            >
              {t("issueDeleg.comment")}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

export function IssuesModal({
  cwd,
  scenes,
  onInsert,
  onDelegate,
  onOpenSession,
  onClose,
}: {
  cwd: string;
  scenes: SceneInfo[];
  onInsert: (issue: Issue) => void;
  onDelegate: (issue: Issue, sceneReference: string) => void;
  onOpenSession?: (session: string) => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
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

        {loading && <p className="text-metadata text-muted-foreground">Loading via gh…</p>}
        {err && <p className="text-metadata text-destructive">{err}</p>}

        <ScrollArea className="max-h-dialog-content pe-3">
          <div className="space-y-1.5">
            {issues.map((it) => (
              <div key={`${it.source}-${it.id}`} className="rounded-module bg-fill-quiet p-surface-inset">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 text-muted-foreground"
                  aria-label={t("issueDeleg.activity")}
                  aria-expanded={expanded === `${it.source}-${it.id}`}
                  onClick={() =>
                    setExpanded((prev) =>
                      prev === `${it.source}-${it.id}` ? null : `${it.source}-${it.id}`,
                    )
                  }
                >
                  {expanded === `${it.source}-${it.id}` ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </Button>
                <a
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 font-mono text-body font-semibold text-primary no-underline"
                >
                  #{it.id}
                </a>
                <span className="flex-1 truncate text-body">{it.title}</span>
                <span className="text-metadata uppercase text-muted-foreground">{it.state}</span>
                <Button size="sm" onClick={() => onInsert(it)}>
                  Add to prompt
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button size="sm" variant="outline">
                      {t("issueDeleg.delegate")}
                    </Button>}
                  />
                  <DropdownMenuContent align="end">
                    {scenes.length === 0 && (
                      <DropdownMenuItem disabled>{t("issueDeleg.noScenes")}</DropdownMenuItem>
                    )}
                    {scenes.map((s) => (
                      <DropdownMenuItem key={s.reference} onClick={() => onDelegate(it, s.reference)}>
                        <Clapperboard />
                        {s.title}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {expanded === `${it.source}-${it.id}` && (
                <DelegationTrail issue={it} onOpenSession={onOpenSession} />
              )}
              </div>
            ))}
            {!loading && !err && issues.length === 0 && (
              <p className="p-2 text-body text-muted-foreground">
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
