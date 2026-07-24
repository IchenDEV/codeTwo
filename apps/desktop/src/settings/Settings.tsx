import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import type { KeymapEntry } from "../bridge";
import { formatCombo, MOD_LABEL } from "../keys";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// A flat list of 20 shortcuts is hard to scan, so group them by what they touch. Any action not
// listed here still shows up under "Other", so a new binding is never hidden.
const GROUPS: { title: string; actions: string[] }[] = [
  { title: "Prompt", actions: ["run", "cancel", "open_skill_picker", "focus_editor"] },
  { title: "Sessions", actions: ["new_session", "prev_session", "next_session"] },
  { title: "Panels", actions: ["toggle_terminal", "toggle_browser", "toggle_git", "close_panel"] },
  { title: "Git", actions: ["refresh_git", "open_source_control"] },
  {
    title: "Open",
    actions: ["open_command_palette", "open_market", "open_files", "open_issues", "open_usage", "open_settings"],
  },
  { title: "Modes", actions: ["cycle_permission_mode"] },
];

// Settings: view + rebind keyboard shortcuts. Click a key to capture the next chord.
export function SettingsModal({
  bindings,
  capturing,
  onCapture,
  onReset,
  onClose,
}: {
  bindings: KeymapEntry[];
  capturing: string | null;
  onCapture: (action: string) => void;
  onReset?: (action: string) => void;
  onClose: () => void;
}) {
  const byAction = useMemo(() => new Map(bindings.map((b) => [b[0], b])), [bindings]);

  // Which combos are bound more than once — a rebind can silently shadow another action.
  const conflicts = useMemo(() => {
    const seen = new Map<string, number>();
    for (const [, key] of bindings) seen.set(key, (seen.get(key) ?? 0) + 1);
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [bindings]);

  const known = new Set(GROUPS.flatMap((g) => g.actions));
  const groups = [
    ...GROUPS,
    { title: "Other", actions: bindings.map((b) => b[0]).filter((a) => !known.has(a)) },
  ].filter((g) => g.actions.length > 0);

  const row = (action: string) => {
    const entry = byAction.get(action);
    if (!entry) return null;
    const [, key, label] = entry;
    return (
      <div key={action} className="flex items-center justify-between py-1.5">
        <span className="text-[13px]">{label}</span>
        <div className="flex items-center gap-1">
          {conflicts.has(key) && capturing !== action && (
            <span className="text-[10px] text-warning" title="Same shortcut is bound to another action">
              conflict
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "min-w-24 justify-center font-mono text-[11.5px]",
              capturing === action && "border-primary text-primary",
              conflicts.has(key) && capturing !== action && "border-warning/60",
            )}
            onClick={() => onCapture(action)}
          >
            {capturing === action ? "press keys…" : formatCombo(key)}
          </Button>
          {onReset && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              title="Reset to default"
              onClick={() => onReset(action)}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Keybindings</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          <b>Mod</b> is {MOD_LABEL}. Click a shortcut, then press the new chord. <b>Esc</b> while
          capturing cancels.
        </p>

        <ScrollArea className="max-h-[56vh] pr-3">
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.title}>
                <h3 className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.title}
                </h3>
                <div className="divide-y">{g.actions.map(row)}</div>
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
