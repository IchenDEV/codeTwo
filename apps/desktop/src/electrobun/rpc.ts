import type { RPCSchema } from "electrobun/view";

export interface DesktopEvent {
  name: string;
  payload: unknown;
}

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogOptions {
  title?: string;
  directory?: boolean;
  multiple?: boolean;
  filters?: DialogFilter[];
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: DialogFilter[];
}

export type NativeContextMenuItem =
  | { type: "separator" }
  | {
      type: "item";
      label: string;
      action: string;
      enabled?: boolean;
      checked?: boolean;
      submenu?: NativeContextMenuItem[];
    };

export interface NativeContextMenuRequest {
  requestId: string;
  items: NativeContextMenuItem[];
}

export interface NativeContextMenuAction {
  requestId: string;
  action: string;
}

export type WorkspaceOpenTarget = "cursor" | "antigravity" | "finder";

export type AppUpdateState =
  | "unsupported"
  | "unavailable"
  | "not-configured"
  | "ready"
  | "checking";

export interface AppUpdateStatus {
  state: AppUpdateState;
  currentVersion?: string;
  message?: string;
}

export type CodeTwoRPC = {
  bun: RPCSchema<{
    requests: {
      call: {
        params: { name: string; args: unknown; projectPath: string | null };
        response: unknown;
      };
      dialogOpen: { params: OpenDialogOptions; response: string[] };
      dialogSave: { params: SaveDialogOptions; response: string | null };
      confirm: { params: { message: string; title?: string }; response: boolean };
      contextMenuShow: { params: NativeContextMenuRequest; response: void };
      openExternal: { params: { url: string }; response: boolean };
      openPath: { params: { path: string }; response: boolean };
      openWorkspace: {
        params: { path: string; target: WorkspaceOpenTarget };
        response: boolean;
      };
      showItemInFolder: { params: { path: string }; response: boolean };
      browserZoom: { params: { webviewId: number; factor: number }; response: void };
      openDevtools: { params: undefined; response: void };
      updateStatus: { params: undefined; response: AppUpdateStatus };
      updateCheck: { params: undefined; response: AppUpdateStatus };
    };
    messages: Record<never, never>;
  }>;
  webview: RPCSchema<{
    requests: Record<never, never>;
    messages: {
      event: DesktopEvent;
      hostStatus: { ready: boolean; error?: string };
    };
  }>;
};
