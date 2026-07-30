import type { CompiledPreview } from "../bridge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

// Compiled-prompt preview: exactly what will be sent — rules prepended, skills expanded,
// macros substituted, @-files inlined.
export function PreviewModal({ preview, onClose }: { preview: CompiledPreview; onClose: () => void }) {
  // Tolerate a partial shape rather than white-screening if a field is ever absent.
  const files = preview.files ?? [];
  const mcp = preview.mcp_servers ?? [];
  const agentSkills = preview.agent_skills ?? [];
  const unresolved = preview.unresolved ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compiled prompt preview</DialogTitle>
        </DialogHeader>

        {unresolved.length > 0 && (
          <p className="text-xs text-warning">Unresolved: {unresolved.join(", ")}</p>
        )}

        {(files.length > 0 || mcp.length > 0 || agentSkills.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f) => (
              <Badge key={f} variant="outline" className="font-mono text-cap">
                @{f}
              </Badge>
            ))}
            {mcp.map((m) => (
              <Badge key={m} variant="secondary" className="text-cap">
                mcp: {m}
              </Badge>
            ))}
            {agentSkills.map((s) => (
              <Badge key={s} variant="secondary" className="text-cap">
                skill: {s}
              </Badge>
            ))}
          </div>
        )}

        <ScrollArea className="max-h-[52vh] rounded-lg bg-muted/40">
          <pre className="whitespace-pre-wrap break-words px-4 py-3 font-mono text-hint leading-relaxed">
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
