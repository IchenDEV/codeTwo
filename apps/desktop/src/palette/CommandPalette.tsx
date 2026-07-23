import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

// Command palette (Mod+K): fuzzy-search over actions, sessions, and scripts.
export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  return (
    <CommandDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Command palette"
      description="Search actions, sessions, and scripts"
    >
      <CommandInput placeholder="Type a command…" />
      <CommandList>
        <CommandEmpty>No commands.</CommandEmpty>
        {commands.map((c) => (
          <CommandItem
            key={c.id}
            value={`${c.label} ${c.hint ?? ""}`}
            onSelect={() => {
              onClose();
              c.run();
            }}
          >
            <span>{c.label}</span>
            {c.hint && <CommandShortcut>{c.hint}</CommandShortcut>}
          </CommandItem>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
