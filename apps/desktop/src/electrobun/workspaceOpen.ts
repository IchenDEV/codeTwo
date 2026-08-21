import type { WorkspaceOpenTarget } from "./rpc";

/**
 * Build the macOS launcher command for the editors offered by the Open menu.
 * The application name is selected from this fixed allowlist; paths are passed
 * as separate argv values and never interpolated into a shell command.
 */
export function workspaceOpenCommand(
  path: string,
  target: WorkspaceOpenTarget,
  platform = process.platform,
): string[] | null {
  if (platform !== "darwin") return null;

  switch (target) {
    case "cursor":
      return ["/usr/bin/open", "-a", "Cursor", path];
    case "antigravity":
      return ["/usr/bin/open", "-a", "Antigravity", path];
    case "finder":
      return null;
    default:
      return null;
  }
}
