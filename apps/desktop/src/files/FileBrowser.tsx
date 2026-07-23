import { useEffect, useMemo, useState } from "react";
import { listFiles } from "../bridge";

// File browser: search the workspace and drop a file into the prompt as an `@` mention, whose
// contents the core inlines at compile time.
export function FileBrowserModal({
  cwd,
  onInsert,
  onClose,
}: {
  cwd: string;
  onInsert: (path: string) => void;
  onClose: () => void;
}) {
  const [all, setAll] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listFiles(cwd, "", 500)
      .then((f) => {
        setAll(f);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [cwd]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? all.filter((p) => p.toLowerCase().includes(s)) : all;
    return list.slice(0, 300);
  }, [all, q]);

  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <div className="market-head">
          <h3>Workspace files</h3>
          <input
            className="market-search"
            autoFocus
            placeholder="Filter files…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {loading && <p className="settings-hint">Scanning…</p>}
        <div className="file-list">
          {filtered.map((p) => (
            <button key={p} className="file-row" onClick={() => onInsert(p)} title="Add to prompt">
              <span className="file-path">{p}</span>
              <span className="file-add">@</span>
            </button>
          ))}
          {!loading && filtered.length === 0 && <div className="git-clean">No matching files.</div>}
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
