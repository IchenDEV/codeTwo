import { useMemo, useState } from "react";
import type { MarketItem } from "../bridge";

// Skill Market (F5): browse a curated catalog and install skills into your library with one click.
export function MarketModal({
  items,
  onInstall,
  onUninstall,
  onClose,
}: {
  items: MarketItem[];
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(s) ||
        it.description.toLowerCase().includes(s) ||
        it.tags.some((t) => t.toLowerCase().includes(s)),
    );
  }, [items, q]);

  return (
    <div className="modal-backdrop">
      <div className="modal wide market">
        <div className="market-head">
          <h3>Skill Market</h3>
          <input
            className="market-search"
            placeholder="Search skills, tags…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <div className="market-list">
          {filtered.map((it) => (
            <div key={it.id} className="market-item">
              <span className="market-icon">{it.icon ?? "✦"}</span>
              <div className="market-meta">
                <div className="market-name">
                  {it.name} <span className="market-kind">{it.kind}</span>
                </div>
                <div className="market-desc">{it.description}</div>
                <div className="market-tags">{[it.author, ...it.tags].join(" · ")}</div>
              </div>
              {it.installed ? (
                <button className="market-btn installed" onClick={() => onUninstall(it.id)} title="Uninstall">
                  Installed ✓
                </button>
              ) : (
                <button className="market-btn" onClick={() => onInstall(it.id)}>
                  Install
                </button>
              )}
            </div>
          ))}
          {filtered.length === 0 && <div className="market-empty">No skills match “{q}”.</div>}
        </div>
        <div className="modal-actions">
          <button className="modal-opt" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
