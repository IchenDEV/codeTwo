import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { usageReport, type UsageReport } from "../bridge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
 * Usage panel: rolling 5h / week / month windows scanned from local provider transcripts, with
 * percent-of-limit and a countdown to when each window frees up.
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Usage
            <Button variant="ghost" size="icon" className="size-6" onClick={load} title="Rescan">
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            </Button>
          </DialogTitle>
        </DialogHeader>

        {loading && !report && <p className="text-xs text-muted-foreground">Scanning local transcripts…</p>}

        {report && (
          <>
            <div className="space-y-4">
              {report.windows.map((w) => (
                <div key={w.label}>
                  <div className="flex items-baseline justify-between text-ui">
                    <span className="font-semibold">{w.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {fmtTokens(w.total_tokens)}
                      {w.limit != null && ` / ${fmtTokens(w.limit)}`}
                      {w.fraction != null && ` · ${Math.round(w.fraction * 100)}%`}
                    </span>
                  </div>
                  <div className="my-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full bg-primary transition-all",
                        w.fraction != null && w.fraction >= 0.8 && "bg-warning",
                      )}
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
                  <div className="font-mono text-fine text-muted-foreground">
                    in {fmtTokens(w.input_tokens)} · out {fmtTokens(w.output_tokens)}
                    {w.cached_tokens > 0 && <> · cache-read {fmtTokens(w.cached_tokens)} (not counted)</>} ·
                    frees up in {fmtReset(w.resets_in_secs)}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {report.by_source.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No local transcripts found (looked in ~/.codex/sessions and ~/.claude/projects).
                </p>
              ) : (
                report.by_source.map(([src, total]) => (
                  <Badge key={src} variant="secondary" className="font-mono text-fine">
                    {src}: {fmtTokens(total)}
                  </Badge>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Scanned {report.transcripts} transcript{report.transcripts === 1 ? "" : "s"}. Set
              CODETWO_LIMIT_5H / _WEEK / _MONTH to show percentages.
            </p>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
