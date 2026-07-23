import { useEffect, useState } from "react";
import { GitBranch, Plus, RefreshCw, Sparkles } from "lucide-react";
import {
  gitCreatePr,
  gitDiff,
  gitDiffSince,
  gitSuggestCommit,
  type Checkpoint,
  type GitStatus,
} from "../bridge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

function DiffView({ text }: { text: string }) {
  if (!text.trim()) return <p className="p-3.5 text-sm text-muted-foreground">No changes.</p>;
  return (
    <pre className="diff">
      {text.split("\n").map((line, i) => {
        let cls = "";
        if (line.startsWith("+") && !line.startsWith("+++")) cls = "add";
        else if (line.startsWith("-") && !line.startsWith("---")) cls = "del";
        else if (line.startsWith("@@")) cls = "hunk";
        else if (line.startsWith("diff ") || line.startsWith("index ")) cls = "meta";
        return (
          <div key={i} className={cn("diff-line", cls)}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}

// Source Control: changed files + diff viewer, commit/push/PR, and checkpoint diff/revert.
export function SourceControlModal({
  cwd,
  status,
  checkpoints,
  onCommit,
  onPush,
  onCheckpoint,
  onRevert,
  onRefresh,
  onClose,
}: {
  cwd: string;
  status: GitStatus | null;
  checkpoints: Checkpoint[];
  onCommit: (message: string) => Promise<void>;
  onPush: () => Promise<void>;
  onCheckpoint: () => Promise<void>;
  onRevert: (commit: string) => Promise<void>;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [diff, setDiff] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  useEffect(() => {
    gitDiff(cwd, null).then(setDiff).catch(() => setDiff(""));
  }, [cwd, status]);

  const commit = async () => {
    if (!msg.trim()) return;
    setBusy(true);
    await onCommit(msg.trim());
    setMsg("");
    setBusy(false);
    onRefresh();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Source Control
            {status?.is_repo && (
              <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                <GitBranch className="size-3.5" />
                {status.branch}
                {status.ahead > 0 && ` ↑${status.ahead}`}
                {status.behind > 0 && ` ↓${status.behind}`}
              </span>
            )}
            <Button variant="ghost" size="icon" className="size-6" onClick={onRefresh} title="Refresh">
              <RefreshCw className="size-3.5" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex h-[52vh] gap-3">
          <div className="w-64 shrink-0 overflow-y-auto border-r pr-2.5">
            <p className="pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Changed files
            </p>
            <button
              className="w-full rounded px-1.5 py-1 text-left text-xs hover:bg-accent"
              onClick={() => gitDiff(cwd, null).then(setDiff)}
            >
              All changes
            </button>
            {(status?.files ?? []).map((f) => (
              <button
                key={f.path}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-accent"
                onClick={() => gitDiff(cwd, f.path).then(setDiff)}
              >
                <span
                  className={cn(
                    "inline-flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-bold",
                    f.staged ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                  )}
                >
                  {f.state.charAt(0).toUpperCase()}
                </span>
                <span className="truncate font-mono text-muted-foreground">{f.path}</span>
              </button>
            ))}
            {(!status || status.files.length === 0) && (
              <p className="px-1.5 text-xs text-muted-foreground">working tree clean</p>
            )}

            <div className="flex items-center justify-between pb-1 pt-4">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Checkpoints
              </span>
              <Button variant="ghost" size="icon" className="size-5" onClick={() => void onCheckpoint()} title="Checkpoint now">
                <Plus className="size-3" />
              </Button>
            </div>
            {checkpoints.length === 0 && <p className="px-1.5 text-xs text-muted-foreground">none yet</p>}
            {checkpoints.map((c) => (
              <div key={c.id} className="flex items-center gap-1 py-0.5 text-xs">
                <span className="flex-1 truncate text-muted-foreground" title={c.message}>
                  {c.message || c.id.slice(0, 8)}
                </span>
                <button
                  className="rounded border px-1.5 py-px text-[10px] hover:text-primary"
                  onClick={() => gitDiffSince(cwd, c.commit).then(setDiff)}
                >
                  diff
                </button>
                <button
                  className="rounded border px-1.5 py-px text-[10px] hover:text-primary"
                  onClick={() => void onRevert(c.commit)}
                >
                  revert
                </button>
              </div>
            ))}
          </div>

          <ScrollArea className="flex-1 rounded-md border bg-muted/40">
            <DiffView text={diff} />
          </ScrollArea>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Commit message…"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void commit()}
          />
          <Button
            variant="outline"
            size="sm"
            title="Suggest a message from the changes"
            onClick={() => void gitSuggestCommit(cwd).then(setMsg)}
          >
            <Sparkles className="size-3.5" /> Suggest
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void commit()}>
            Commit
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void onPush()}>
            Push
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            title="Push and open a pull request (gh)"
            onClick={() => {
              setBusy(true);
              void gitCreatePr(cwd, msg.trim() || "Update", "")
                .then(setPrUrl)
                .catch((e) => setPrUrl(String(e)))
                .finally(() => setBusy(false));
            }}
          >
            Create PR
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
        {prUrl && <p className="text-xs text-muted-foreground">{prUrl}</p>}
      </DialogContent>
    </Dialog>
  );
}
