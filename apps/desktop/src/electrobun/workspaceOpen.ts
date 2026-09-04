import type { WorkspaceOpenTarget } from "./rpc";

export function workspaceOpenCommand(
  path: string,
  target: WorkspaceOpenTarget,
  platform = process.platform
): string[] | null {
  if (platform !== "darwin") {
    return null;
  }

  switch (target) {
    case "cursor": {
      return ["/usr/bin/open", "-a", "Cursor", path];
    }
    case "antigravity": {
      return ["/usr/bin/open", "-a", "Antigravity", path];
    }
    case "finder": {
      return null;
    }
    default: {
      return null;
    }
  }
}
