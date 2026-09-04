import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronRight, Clapperboard } from "@/components/ui/icons";
import { ScrollArea } from "@/components/ui/scroll-area";

import { listGithubIssues, listIssueDelegations } from "../bridge";
import type { Issue, IssueDelegation } from "../bridge";
import { useT } from "../i18n";
import type { SceneInfo } from "../session/scene";

// GitHub Issues: list open issues for the working dir's repo (via gh) and insert one as context.
// R12 adds per-row delegation: pick a scene and the issue opens as a provenance-carrying block
// in a fresh draft fully applied to that scene — you stay assignee.
function DelegationTrail({
  issue,
  onOpenSession,
}: {
  readonly issue: Issue;
  readonly onOpenSession?: (session: string) => void;
}) {
  const t = useT();
  const [rows, setRows] = useState<IssueDelegation[] | null>(null);

  useEffect(() => {
    let isAlive = true;
    void listIssueDelegations(issue.source, issue.id).then((r) => {
      if (isAlive) {
        setRows(r);
      }
    });
    return () => {
      isAlive = false;
    };
  }, [issue.source, issue.id]);

  if (rows === null) {
    return <p className="text-callout text-muted-foreground px-2 pb-1">…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-callout text-muted-foreground px-2 pb-1">
        {t("issueDeleg.none")}
      </p>
    );
  }
  return (
    <div className="space-y-0.5 px-2 pb-1">
      {rows.map((row) => (
        <div
          key={row.id}
          className="text-callout text-muted-foreground flex items-center gap-2"
        >
          <Badge variant="outline" className="text-metadata shrink-0">
            {row.scene_title || row.scene_ref}
          </Badge>
          <span className="shrink-0">
            {new Date(row.created_at).toLocaleString()}
          </span>
          {row.session_id != null && row.session_id !== "" && onOpenSession ? (
            <Button
              type="button"
              variant="link"
              size="compact"
              className="text-primary h-auto shrink-0 px-0 py-0"
              onClick={() => onOpenSession(row.session_id!)}
            >
              {t("issueDeleg.openSession")}
            </Button>
          ) : null}
          {row.comment_url != null && row.comment_url !== "" ? (
            <a
              href={row.comment_url}
              target="_blank"
              rel="noreferrer"
              className="text-primary shrink-0 no-underline hover:underline"
            >
              {t("issueDeleg.comment")}
            </a>
          ) : null}
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
  readonly cwd: string;
  readonly scenes: SceneInfo[];
  readonly onInsert: (issue: Issue) => void;
  readonly onDelegate: (issue: Issue, sceneReference: string) => void;
  readonly onOpenSession?: (session: string) => void;
  readonly onClose: () => void;
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

        {loading ? (
          <p className="text-metadata text-muted-foreground">Loading via gh…</p>
        ) : null}
        {err != null && err !== "" ? (
          <p className="text-metadata text-destructive">{err}</p>
        ) : null}

        <ScrollArea className="max-h-dialog-content pe-3">
          <div className="space-y-1.5">
            {issues.map((it) => (
              <div
                key={`${it.source}-${it.id}`}
                className="rounded-module bg-fill-quiet p-surface-inset"
              >
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground shrink-0"
                    aria-label={t("issueDeleg.activity")}
                    aria-expanded={expanded === `${it.source}-${it.id}`}
                    onClick={() =>
                      setExpanded((prev) =>
                        prev === `${it.source}-${it.id}`
                          ? null
                          : `${it.source}-${it.id}`
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
                    className="text-body text-primary shrink-0 font-mono font-semibold no-underline"
                  >
                    #{it.id}
                  </a>
                  <span className="text-body flex-1 truncate">{it.title}</span>
                  <span className="text-metadata text-muted-foreground uppercase">
                    {it.state}
                  </span>
                  <Button size="sm" onClick={() => onInsert(it)}>
                    Add to prompt
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button size="sm" variant="outline">
                          {t("issueDeleg.delegate")}
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      {scenes.length === 0 && (
                        <DropdownMenuItem disabled>
                          {t("issueDeleg.noScenes")}
                        </DropdownMenuItem>
                      )}
                      {scenes.map((s) => (
                        <DropdownMenuItem
                          key={s.reference}
                          onClick={() => onDelegate(it, s.reference)}
                        >
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
            {!loading && (err == null || err === "") && issues.length === 0 && (
              <p className="text-body text-muted-foreground p-2">
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
