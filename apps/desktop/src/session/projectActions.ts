import type { KeymapEntry, ProjectScript } from "../bridge";

export interface ProjectActionDraft {
  name: string;
  kind: "command" | "prompt";
  command: string;
  prompt: string;
  keybinding: string;
  preview_url: string;
  run_on_worktree_create: boolean;
  open_preview: boolean;
}

export type ProjectActionIssue =
  | "name_required"
  | "command_required"
  | "prompt_required"
  | "preview_invalid"
  | "keybinding_conflict";

export function projectActionId(name: string, actions: ProjectScript[]): string {
  const stem = name
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56) || "action";
  const ids = new Set(actions.map((action) => action.id));
  if (!ids.has(stem)) return stem;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${stem}-${suffix}`;
    if (!ids.has(candidate)) return candidate;
  }
  return `${stem}-${Date.now()}`;
}

export function projectActionIssue(
  draft: ProjectActionDraft,
  bindings: KeymapEntry[],
  actions: ProjectScript[],
): { issue: ProjectActionIssue; conflict?: string } | null {
  if (!draft.name.trim()) return { issue: "name_required" };
  if (draft.kind === "prompt") {
    if (!draft.prompt.trim()) return { issue: "prompt_required" };
  } else if (!draft.command.trim()) {
    return { issue: "command_required" };
  }
  if (draft.kind === "command" && draft.preview_url.trim()) {
    try {
      const url = new URL(draft.preview_url.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { issue: "preview_invalid" };
      }
    } catch {
      return { issue: "preview_invalid" };
    }
  }
  if (draft.keybinding) {
    const builtin = bindings.find(([, key]) => key === draft.keybinding);
    if (builtin) return { issue: "keybinding_conflict", conflict: builtin[2] };
    const action = actions.find((candidate) => candidate.keybinding === draft.keybinding);
    if (action) {
      return { issue: "keybinding_conflict", conflict: action.name || action.id };
    }
  }
  return null;
}

export function projectActionBindings(actions: ProjectScript[]): KeymapEntry[] {
  return actions.flatMap((action) =>
    action.keybinding
      ? [[`project_action:${action.id}`, action.keybinding, action.name || action.id] as KeymapEntry]
      : [],
  );
}
