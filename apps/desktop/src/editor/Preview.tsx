import type { CompiledPreview } from "../bridge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

// Compiled-prompt preview: exactly what will be sent — rules prepended, skills expanded,
// macros substituted, @-files inlined.
export function PreviewModal({ preview, onClose }: { preview: CompiledPreview; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compiled prompt preview</DialogTitle>
        </DialogHeader>

        {preview.unresolved.length > 0 && (
          <p className="text-xs text-warning">Unresolved: {preview.unresolved.join(", ")}</p>
        )}

        {(preview.files.length > 0 || preview.mcp_servers.length > 0 || preview.agent_skills.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {preview.files.map((f) => (
              <Badge key={f} variant="outline" className="font-mono text-[10px]">
                @{f}
              </Badge>
            ))}
            {preview.mcp_servers.map((m) => (
              <Badge key={m} variant="secondary" className="text-[10px]">
                mcp: {m}
              </Badge>
            ))}
            {preview.agent_skills.map((s) => (
              <Badge key={s} variant="secondary" className="text-[10px]">
                skill: {s}
              </Badge>
            ))}
          </div>
        )}

        <ScrollArea className="max-h-[52vh] rounded-md border bg-muted/40">
          <pre className="whitespace-pre-wrap break-words px-4 py-3 font-mono text-[12.5px] leading-relaxed">
            {preview.prompt || "(empty)"}
          </pre>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
