import type { ProjectWorktreeMode, WorktreeBaselineKind } from "../bridge";

/**
 * Resolve a project preference for a new draft.
 *
 * `undefined` means "follow the current draft/session context"; `null` is the explicit
 * local-checkout mode. Keeping those states distinct prevents an automatic project from silently
 * disabling a baseline the user chose in the composer.
 */
export function projectWorktreeBaseline(
  mode: ProjectWorktreeMode | null
): WorktreeBaselineKind | null | undefined {
  if (mode === null) {
    return undefined;
  }
  if (mode === "local") {
    return null;
  }
  return mode;
}

/**
Switching projects opens a fresh draft, so automatic mode starts at C2's local default.
*/
export function projectSwitchWorktreeBaseline(
  mode: ProjectWorktreeMode | null
): WorktreeBaselineKind | null {
  return projectWorktreeBaseline(mode) ?? null;
}

/**
A New action follows its session's baseline kind; creation resolves a fresh local ref + SHA.
*/
export function nextSessionWorktreeBaseline(
  mode: ProjectWorktreeMode | null,
  inherited: WorktreeBaselineKind | null | undefined
): WorktreeBaselineKind | null | undefined {
  const preferred = projectWorktreeBaseline(mode);
  return preferred === undefined ? inherited : preferred;
}
