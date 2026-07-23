import { useEffect, useState } from "react";
import {
  gitCreatePr,
  gitDiff,
  gitDiffSince,
  gitSuggestCommit,
  type Checkpoint,
  type GitStatus,
} from "../bridge";

function DiffView({ text }: { text: string }) {
  if (!text.trim()) return <div className="diff-empty">No changes.</div>;
  return (
    <pre className="diff">
      {text.split("\n").map((line, i) => {
        let cls = "";
        if (line.startsWith("+") && !line.startsWith("+++")) cls = "add";
        else if (line.startsWith("-") && !line.startsWith("---")) cls = "del";
        else if (line.startsWith("@@")) cls = "hunk";
        else if (line.startsWith("diff ") || line.startsWith("index ")) cls = "meta";
        return (
          <div key={i} className={`diff-line ${cls}`}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}

// Source Control (F7/F8): changed files + diff viewer, commit/push, and checkpoint diff/revert.
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
    <div className="modal-backdrop">
      <div className="modal wide sc">
        <div className="sc-head">
          <h3>Source Control</h3>
          {status?.is_repo && (
            <span className="sc-branch">
              ⎇ {status.branch}
              {status.ahead > 0 && ` ↑${status.ahead}`}
              {status.behind > 0 && ` ↓${status.behind}`}
            </span>
          )}
          <button className="mini" title="Refresh" onClick={onRefresh}>
            ⟳
          </button>
        </div>

        <div className="sc-body">
          <div className="sc-left">
            <div className="sc-section-title">Changed files</div>
            <div className="sc-files">
              <button className="sc-file-all" onClick={() => gitDiff(cwd, null).then(setDiff)}>
                All changes
              </button>
              {(status?.files ?? []).map((f) => (
                <div key={f.path} className="sc-file" onClick={() => gitDiff(cwd, f.path).then(setDiff)}>
                  <span className={`git-badge ${f.staged ? "staged" : ""}`}>{f.state.charAt(0).toUpperCase()}</span>
                  <span className="git-path">{f.path}</span>
                </div>
              ))}
              {(!status || status.files.length === 0) && <div className="git-clean">working tree clean</div>}
            </div>

            <div className="sc-section-title">
              Checkpoints
              <button className="mini" title="Checkpoint now" onClick={() => void onCheckpoint()}>
                ＋
              </button>
            </div>
            <div className="sc-checkpoints">
              {checkpoints.length === 0 && <div className="git-clean">none yet</div>}
              {checkpoints.map((c) => (
                <div key={c.id} className="sc-cp">
                  <span className="sc-cp-msg" title={c.message}>
                    {c.message || c.id.slice(0, 8)}
                  </span>
                  <span className="sc-cp-actions">
                    <button onClick={() => gitDiffSince(cwd, c.commit).then(setDiff)}>diff</button>
                    <button onClick={() => void onRevert(c.commit)}>revert</button>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="sc-right">
            <DiffView text={diff} />
          </div>
        </div>

        <div className="sc-commit">
          <input
            className="sc-msg"
            placeholder="Commit message…"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void commit()}
          />
          <button
            className="ghost"
            title="Suggest a message from the changes"
            onClick={() => void gitSuggestCommit(cwd).then(setMsg)}
          >
            Suggest
          </button>
          <button className="modal-opt" disabled={busy} onClick={() => void commit()}>
            Commit
          </button>
          <button className="ghost" disabled={busy} onClick={() => void onPush()}>
            Push
          </button>
          <button
            className="ghost"
            disabled={busy}
            title="Push and open a pull request (gh)"
            onClick={() => {
              setBusy(true);
              void gitCreatePr(cwd, msg.trim() || "Update", "")
                .then((url) => setPrUrl(url))
                .catch((e) => setPrUrl(String(e)))
                .finally(() => setBusy(false));
            }}
          >
            Create PR
          </button>
          <button className="modal-opt cancel" onClick={onClose}>
            Done
          </button>
        </div>
        {prUrl && <p className="settings-hint">{prUrl}</p>}
      </div>
    </div>
  );
}
