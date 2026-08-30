import { useEffect, useMemo, useState } from "react";
import { AtSign } from "@/components/ui/icons";
import { listFiles } from "../bridge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

// File browser: search the workspace and drop a file into the prompt as an `@` mention.
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
    return (s ? all.filter((p) => p.toLowerCase().includes(s)) : all).slice(0, 300);
  }, [all, q]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Workspace files</DialogTitle>
        </DialogHeader>

        <Input placeholder="Filter files…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {loading && <p className="text-metadata text-muted-foreground">Scanning…</p>}

        <ScrollArea className="max-h-[52vh] pr-3">
          <div className="space-y-0.5">
            {filtered.map((p) => (
              <Button
                key={p}
                type="button"
                variant="ghost"
                size="row"
                focusStyle="inset"
                onClick={() => onInsert(p)}
                title="Add to prompt"
                className="w-full justify-between px-module-inset py-1.5 font-mono text-metadata"
              >
                <span className="truncate">{p}</span>
                <AtSign className="size-3.5 shrink-0 text-primary" />
              </Button>
            ))}
            {!loading && filtered.length === 0 && (
              <p className="p-2 text-body text-muted-foreground">No matching files.</p>
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
