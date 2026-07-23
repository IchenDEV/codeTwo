import { useEffect, useState } from "react";
import { usageReport, type UsageReport } from "../bridge";

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtReset(secs: number): string {
  if (secs <= 0) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Usage panel (CodexBar-style): rolling 5h / week / month windows scanned from local provider
 * transcripts, with percent-of-limit and a countdown to when each window frees up.
 */
export function UsageModal({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    usageReport()
      .then((r) => {
        setReport(r);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <div className="market-head">
          <h3>Usage</h3>
          <button className="mini" title="Rescan" onClick={load}>
            ⟳
          </button>
        </div>
        {loading && <p className="settings-hint">Scanning local transcripts…</p>}

        {report && (
          <>
            <div className="usage-windows">
              {report.windows.map((w) => (
                <div key={w.label} className="usage-row">
                  <div className="usage-head">
                    <span className="usage-label">{w.label}</span>
                    <span className="usage-nums">
                      {fmtTokens(w.total_tokens)}
                      {w.limit != null && ` / ${fmtTokens(w.limit)}`}
                      {w.fraction != null && ` · ${Math.round(w.fraction * 100)}%`}
                    </span>
                  </div>
                  <div className="usage-bar">
                    <div
                      className={`usage-fill ${w.fraction != null && w.fraction >= 0.8 ? "tight" : ""}`}
                      style={{
                        width:
                          w.fraction != null
                            ? `${Math.min(100, w.fraction * 100)}%`
                            : w.total_tokens > 0
                              ? "100%"
                              : "0%",
                        opacity: w.fraction != null ? 1 : 0.35,
                      }}
                    />
                  </div>
                  <div className="usage-foot">
                    in {fmtTokens(w.input_tokens)} · out {fmtTokens(w.output_tokens)}
                    {w.cached_tokens > 0 && (
                      <> · cache-read {fmtTokens(w.cached_tokens)} (not counted)</>
                    )}{" "}
                    · frees up in {fmtReset(w.resets_in_secs)}
                  </div>
                </div>
              ))}
            </div>

            <div className="usage-sources">
              {report.by_source.length === 0 ? (
                <span className="settings-hint">
                  No local transcripts found (looked in ~/.codex/sessions and ~/.claude/projects).
                </span>
              ) : (
                report.by_source.map(([src, total]) => (
                  <span key={src} className="usage-chip">
                    {src}: {fmtTokens(total)}
                  </span>
                ))
              )}
            </div>
            <p className="settings-hint">
              Scanned {report.transcripts} transcript{report.transcripts === 1 ? "" : "s"}. Set
              CODETWO_LIMIT_5H / _WEEK / _MONTH to show percentages against your plan.
            </p>
          </>
        )}

        <div className="modal-actions">
          <button className="modal-opt cancel" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
