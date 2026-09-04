import { assertIpcResult } from "../lib/ipcResult";
import type {
  AppUpdateStatus,
  AppshotCapture,
  AppshotSettings,
  CodeTwoRPC,
  DesktopPetState,
  DesktopEvent,
  NativeContextMenuRequest,
  OpenDialogOptions,
  SaveDialogOptions,
  WorkspaceOpenTarget,
} from "./rpc";

type EventListener = (payload: unknown) => void;

const listeners = new Map<string, Set<EventListener>>();

function readGlobalUnknown(name: string): unknown {
  if (typeof globalThis === "undefined") {
    return undefined;
  }
  if (!Object.prototype.hasOwnProperty.call(globalThis, name)) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(globalThis, name)?.value;
}

export const isElectrobun =
  typeof readGlobalUnknown("__electrobunWebviewId") === "number";

let rpcPromise: Promise<Awaited<ReturnType<typeof createClient>>> | null = null;

function dispatch({ name, payload }: DesktopEvent): void {
  for (const listener of listeners.get(name) ?? []) {
    listener(payload);
  }
}

async function createClient() {
  const { Electroview } = await import("electrobun/view");
  const rpc = Electroview.defineRPC<CodeTwoRPC>({
    handlers: {
      messages: {
        appshotCaptured: (capture) => {
          dispatch({ name: "appshot-captured", payload: capture });
        },
        appshotFailed: (failure) => {
          dispatch({ name: "appshot-failed", payload: failure });
        },
        event: dispatch,
        hostStatus: (status) => {
          dispatch({ name: "host-status", payload: status });
        },
      },
      requests: {},
    },
    maxRequestTime: Infinity,
  });
  new Electroview({ rpc });
  return rpc;
}

async function client() {
  if (!isElectrobun) {
    throw new Error("C2 desktop APIs are unavailable in this browser");
  }
  rpcPromise ??= createClient();
  return await rpcPromise;
}

export async function desktopCall<T>(
  name: string,
  argumentsValue: unknown,
  projectPath: string | null
): Promise<T> {
  const rpc = await client();
  // `request` is itself a function. Property access for a command named `call` resolves to
  // Function.prototype.call instead of Electrobun's proxy method, which sends an undefined RPC
  // method. Use the explicit function form for this one intentionally generic command.
  const result: unknown = await rpc.request("call", {
    args: argumentsValue,
    name,
    projectPath,
  });
  return assertIpcResult<T>(result);
}

export function listenDesktop<T>(
  name: string,
  listener: (payload: T) => void
): () => void {
  const wrapped: EventListener = (payload) => {
    listener(assertIpcResult<T>(payload));
  };
  const group = listeners.get(name) ?? new Set<EventListener>();
  group.add(wrapped);
  listeners.set(name, group);
  if (isElectrobun) {
    void client();
  }
  return () => {
    group.delete(wrapped);
    if (group.size === 0) {
      listeners.delete(name);
    }
  };
}

export async function desktopOpenDialog(
  options: OpenDialogOptions
): Promise<string[]> {
  return await (await client()).request.dialogOpen(options);
}

export async function desktopSaveDialog(
  options: SaveDialogOptions
): Promise<string | null> {
  return await (await client()).request.dialogSave(options);
}

export async function desktopConfirm(
  message: string,
  title?: string
): Promise<boolean> {
  return await (await client()).request.confirm({ message, title });
}

export async function desktopShowContextMenu(
  options: NativeContextMenuRequest
): Promise<void> {
  await (await client()).request.contextMenuShow(options);
}

export async function desktopOpenExternal(url: string): Promise<boolean> {
  return await (await client()).request.openExternal({ url });
}

export async function desktopOpenPath(path: string): Promise<boolean> {
  return await (await client()).request.openPath({ path });
}

export async function desktopOpenWorkspace(
  path: string,
  target: WorkspaceOpenTarget
): Promise<boolean> {
  return await (await client()).request.openWorkspace({ path, target });
}

export async function desktopShowItemInFolder(path: string): Promise<boolean> {
  return await (await client()).request.showItemInFolder({ path });
}

export async function desktopSetSystemBadgeCount(
  count: number
): Promise<boolean> {
  return await (await client()).request.systemBadgeSet({ count });
}

export async function desktopPerformTitlebarDoubleClick(): Promise<boolean> {
  return await (await client()).request.titlebarDoubleClick();
}

export async function desktopSystemProfileAvatar(): Promise<string | null> {
  return await (await client()).request.systemProfileAvatar();
}

export async function desktopAppshotSettings(): Promise<AppshotSettings> {
  return await (await client()).request.appshotsSettings();
}

export async function desktopUpdateAppshotSettings(
  patch: Partial<Pick<AppshotSettings, "hotkey" | "destination" | "play_sound">>
): Promise<AppshotSettings> {
  return await (await client()).request.appshotsUpdate(patch);
}

export async function desktopRequestAppshotPermissions(
  kind: "screen-recording" | "accessibility"
): Promise<AppshotSettings> {
  return await (await client()).request.appshotsRequestPermissions({ kind });
}

export async function desktopOpenAppshotPrivacySettings(
  kind: "screen-recording" | "accessibility"
): Promise<boolean> {
  return await (await client()).request.appshotsOpenPrivacySettings({ kind });
}

export async function desktopCaptureAppshot(): Promise<AppshotCapture> {
  return await (await client()).request.appshotsCapture();
}

export async function desktopGetAppshot(id: string): Promise<AppshotCapture> {
  return await (await client()).request.appshotsGet({ id });
}

export async function onDesktopAppshotCaptured(
  listener: (capture: AppshotCapture) => void
): Promise<() => void> {
  return listenDesktop("appshot-captured", listener);
}

export async function onDesktopAppshotFailed(
  listener: (failure: { message: string }) => void
): Promise<() => void> {
  return listenDesktop("appshot-failed", listener);
}

export async function desktopSetBrowserZoom(
  webviewId: number,
  factor: number
): Promise<void> {
  await (await client()).request.browserZoom({ factor, webviewId });
}

export async function desktopGetPetState(): Promise<DesktopPetState> {
  return await (await client()).request.desktopPetState();
}

export async function desktopUpdatePetState(
  state: DesktopPetState
): Promise<void> {
  await (await client()).request.desktopPetUpdate(state);
}

export async function desktopHidePet(): Promise<void> {
  await (await client()).request.desktopPetHide();
}

export async function desktopOpenDevtools(): Promise<void> {
  await (await client()).request.openDevtools();
}

export async function desktopUpdateStatus(): Promise<AppUpdateStatus> {
  return await (await client()).request.updateStatus();
}

export async function desktopCheckForUpdates(): Promise<AppUpdateStatus> {
  return await (await client()).request.updateCheck();
}
