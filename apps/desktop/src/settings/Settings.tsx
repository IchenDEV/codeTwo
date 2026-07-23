import type { KeymapEntry } from "../bridge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Settings: view + rebind keyboard shortcuts. Click a key to capture the next chord.
export function SettingsModal({
  bindings,
  capturing,
  onCapture,
  onClose,
}: {
  bindings: KeymapEntry[];
  capturing: string | null;
  onCapture: (action: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Keybindings</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          “Mod” is ⌘ on macOS, Ctrl elsewhere. Click a shortcut to change it.
        </p>

        <ScrollArea className="max-h-[52vh] pr-3">
          <div className="divide-y">
            {bindings.map(([action, key, label]) => (
              <div key={action} className="flex items-center justify-between py-2">
                <span className="text-[13px]">{label}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "min-w-28 font-mono text-[11.5px]",
                    capturing === action && "border-primary text-primary",
                  )}
                  onClick={() => onCapture(action)}
                >
                  {capturing === action ? "press keys…" : key}
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
