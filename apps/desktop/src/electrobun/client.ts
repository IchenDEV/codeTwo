import type {
  AppUpdateStatus,
  CodeTwoRPC,
  DesktopEvent,
  OpenDialogOptions,
  SaveDialogOptions,
} from "./rpc";

type EventListener = (payload: unknown) => void;

const listeners = new Map<string, Set<EventListener>>();

export const isElectrobun =
  typeof window !== "undefined" &&
  typeof (window as Window & { __electrobunWebviewId?: unknown }).__electrobunWebviewId === "number";

let rpcPromise: Promise<Awaited<ReturnType<typeof createClient>>> | null = null;

function dispatch({ name, payload }: DesktopEvent): void {
  for (const listener of listeners.get(name) ?? []) listener(payload);
}

async function createClient() {
  const { Electroview } = await import("electrobun/view");
  const rpc = Electroview.defineRPC<CodeTwoRPC>({
    maxRequestTime: Infinity,
    handlers: {
      requests: {},
      messages: {
        event: dispatch,
        hostStatus: (status) => dispatch({ name: "host-status", payload: status }),
      },
    },
  });
  new Electroview({ rpc });
  return rpc;
}

async function client() {
  if (!isElectrobun) throw new Error("C2 desktop APIs are unavailable in this browser");
  rpcPromise ??= createClient();
  return rpcPromise;
}

export async function desktopCall<T>(
  name: string,
  args: unknown,
  projectPath: string | null,
): Promise<T> {
  const rpc = await client();
  return (await rpc.request.call({ name, args, projectPath })) as T;
}

export function listenDesktop<T>(name: string, listener: (payload: T) => void): () => void {
  const wrapped: EventListener = (payload) => listener(payload as T);
  const group = listeners.get(name) ?? new Set<EventListener>();
  group.add(wrapped);
  listeners.set(name, group);
  if (isElectrobun) void client();
  return () => {
    group.delete(wrapped);
    if (group.size === 0) listeners.delete(name);
  };
}

export async function desktopOpenDialog(options: OpenDialogOptions): Promise<string[]> {
  return (await client()).request.dialogOpen(options);
}

export async function desktopSaveDialog(options: SaveDialogOptions): Promise<string | null> {
  return (await client()).request.dialogSave(options);
}

export async function desktopConfirm(message: string, title?: string): Promise<boolean> {
  return (await client()).request.confirm({ message, title });
}

export async function desktopOpenExternal(url: string): Promise<boolean> {
  return (await client()).request.openExternal({ url });
}

export async function desktopOpenPath(path: string): Promise<boolean> {
  return (await client()).request.openPath({ path });
}

export async function desktopShowItemInFolder(path: string): Promise<boolean> {
  return (await client()).request.showItemInFolder({ path });
}

export async function desktopSetBrowserZoom(webviewId: number, factor: number): Promise<void> {
  await (await client()).request.browserZoom({ webviewId, factor });
}

export async function desktopOpenDevtools(): Promise<void> {
  await (await client()).request.openDevtools();
}

export async function desktopUpdateStatus(): Promise<AppUpdateStatus> {
  return (await client()).request.updateStatus();
}

export async function desktopCheckForUpdates(): Promise<AppUpdateStatus> {
  return (await client()).request.updateCheck();
}
