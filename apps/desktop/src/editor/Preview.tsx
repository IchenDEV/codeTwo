import type { CompiledPreview } from "../bridge";
import { canvasExportDataUrl } from "../session/promptPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

// Compiled-prompt preview: exactly what will be sent — rules prepended, skills expanded,
// macros substituted, @-files inlined.
export const PreviewModal = ({
  preview,
  onClose,
}: {
  readonly preview: CompiledPreview;
  readonly onClose: () => void;
}) => {
  // Tolerate a partial shape rather than white-screening if a field is ever absent.
  const files = preview.files ?? [];
  const mcp = preview.mcp_servers ?? [];
  const agentSkills = preview.agent_skills ?? [];
  const subagents = preview.subagents ?? [];
  const unresolved = preview.unresolved ?? [];
  const canvases = preview.canvases ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compiled prompt preview</DialogTitle>
        </DialogHeader>

        {unresolved.length > 0 && (
          <p className="text-metadata text-warning">
            Unresolved: {unresolved.join(", ")}
          </p>
        )}

        {(files.length > 0 ||
          mcp.length > 0 ||
          agentSkills.length > 0 ||
          subagents.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f) => (
              <Badge
                key={f}
                variant="outline"
                className="text-metadata font-mono"
              >
                @{f}
              </Badge>
            ))}
            {mcp.map((m) => (
              <Badge key={m} variant="secondary" className="text-metadata">
                mcp: {m}
              </Badge>
            ))}
            {agentSkills.map((s) => (
              <Badge key={s} variant="secondary" className="text-metadata">
                skill: {s}
              </Badge>
            ))}
            {subagents.map((agent) => (
              <Badge key={agent} variant="secondary" className="text-metadata">
                subagent: {agent}
              </Badge>
            ))}
          </div>
        )}

        {canvases.length > 0 && (
          <div
            className="canvas-ui-module bg-fill-quiet flex flex-col gap-3 p-3"
            aria-label="Canvas previews"
          >
            {canvases.map((canvas) => (
              <section
                key={`${canvas.id}:${canvas.frozenRevision}`}
                className="flex flex-col gap-2"
              >
                <div className="text-callout text-muted-foreground flex items-center justify-between gap-2">
                  <h3 className="text-foreground min-w-0 truncate font-medium">
                    {canvas.title || "Canvas"}
                  </h3>
                  <span className="shrink-0 font-mono">
                    rev {canvas.frozenRevision}
                  </span>
                </div>
                <p className="text-callout break-words whitespace-pre-wrap">
                  {canvas.summary}
                </p>
                {canvas.exports.length > 0 && (
                  <div
                    className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                    aria-label="Canvas images"
                  >
                    {canvas.exports.map((item) => (
                      <figure
                        key={item.id}
                        className="canvas-ui-control bg-surface overflow-hidden"
                      >
                        <img
                          src={canvasExportDataUrl(item)}
                          alt={`${canvas.title || "Canvas"} ${item.kind}${item.index === null || item.index === undefined ? "" : ` ${item.index + 1}`}`}
                          className="block h-auto w-full"
                        />
                      </figure>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        <ScrollArea className="max-h-dialog-content rounded-module bg-fill-quiet">
          <pre className="text-metadata px-4 py-3 font-mono break-words whitespace-pre-wrap">
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
};
