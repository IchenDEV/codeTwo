import type { ProjectWorktreeMode, WorktreeBaselineKind } from "../bridge";

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

export function projectSwitchWorktreeBaseline(
  mode: ProjectWorktreeMode | null
): WorktreeBaselineKind | null {
  return projectWorktreeBaseline(mode) ?? null;
}

export function nextSessionWorktreeBaseline(
  mode: ProjectWorktreeMode | null,
  inherited: WorktreeBaselineKind | null | undefined
): WorktreeBaselineKind | null | undefined {
  const preferred = projectWorktreeBaseline(mode);
  return preferred === undefined ? inherited : preferred;
}
