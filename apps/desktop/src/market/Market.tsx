import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { MarketItem } from "../bridge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

// Skill Market: browse a curated catalog and install skills into your library with one click.
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Skill Market</DialogTitle>
        </DialogHeader>

        <Input placeholder="Search skills, tags…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />

        <ScrollArea className="max-h-[55vh] pr-3">
          <div className="space-y-2">
            {filtered.map((it) => (
              <div key={it.id} className="flex items-center gap-3 rounded-xl bg-foreground/[0.04] p-3">
                <span className="w-7 text-center text-xl">{it.icon ?? "✦"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {it.name}
                    <Badge variant="secondary" className="text-cap uppercase">
                      {it.kind}
                    </Badge>
                  </div>
                  <div className="text-ui text-muted-foreground">{it.description}</div>
                  <div className="mt-0.5 text-fine text-muted-foreground/70">
                    {[it.author, ...it.tags].join(" · ")}
                  </div>
                </div>
                {it.installed ? (
                  <Button variant="outline" size="sm" onClick={() => onUninstall(it.id)} title="Uninstall">
                    <Check className="size-3.5 text-success" /> Installed
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => onInstall(it.id)}>
                    Install
                  </Button>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">No skills match “{q}”.</p>
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
