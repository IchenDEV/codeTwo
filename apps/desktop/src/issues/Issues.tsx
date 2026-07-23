import { useEffect, useState } from "react";
import { listGithubIssues, type Issue } from "../bridge";

// GitHub Issues (F14): list open issues for the working dir's repo (via gh) and insert one as
// prompt context.
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
    <div className="modal-backdrop">
      <div className="modal wide">
        <h3>GitHub Issues</h3>
        {loading && <p className="settings-hint">Loading via gh…</p>}
        {err && <p className="settings-hint" style={{ color: "#b91c1c" }}>{err}</p>}
        <div className="issue-list">
          {issues.map((it) => (
            <div key={`${it.source}-${it.id}`} className="issue-item">
              <div className="issue-meta">
                <a href={it.url} target="_blank" rel="noreferrer" className="issue-num">
                  #{it.id}
                </a>
                <span className="issue-title">{it.title}</span>
                <span className="issue-state">{it.state}</span>
              </div>
              <button className="market-btn" onClick={() => onInsert(it)}>
                Add to prompt
              </button>
            </div>
          ))}
          {!loading && !err && issues.length === 0 && (
            <div className="git-clean">No open issues (or this dir isn't a GitHub repo).</div>
          )}
        </div>
        <div className="modal-actions">
          <button className="modal-opt cancel" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
