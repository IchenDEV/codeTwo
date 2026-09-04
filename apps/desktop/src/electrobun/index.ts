import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

import Electrobun, {
  ApplicationMenu,
  BrowserView,
  BrowserWindow,
  ContextMenu,
  PATHS,
  Screen,
  Utils,
} from "electrobun/bun";

import { asJsonObject, numberField } from "../lib/jsonValue";
import { macOSApplicationMenu } from "./applicationMenu";
import { AppshotManager } from "./appshots";
import {
  nativeContextMenuAction,
  nativeContextMenuConfig,
} from "./contextMenuHost";
import { NativeHost } from "./nativeHost";
import type {
  CodeTwoRPC,
  DesktopPetState,
  DesktopEvent,
  DialogFilter,
  OpenDialogOptions,
  SaveDialogOptions,
  WorkspaceOpenTarget,
} from "./rpc";
import { readSystemProfileAvatar } from "./systemProfile";
import { getAppUpdateStatus, startAppUpdateCheck } from "./update";
import {
  configureMacOSWindowEffects,
  performMacOSTitlebarDoubleClick,
  setMacOSSystemBadgeCount,
} from "./windowEffects";
import { workspaceOpenCommand } from "./workspaceOpen";

function filterExtensions(filters: DialogFilter[] | undefined): string {
  const extensions = filters?.flatMap((filter) => filter.extensions) ?? [];
  return extensions.length > 0 ? extensions.join(",") : "*";
}

async function openDialog(options: OpenDialogOptions): Promise<string[]> {
  const selected = await Utils.openFileDialog({
    allowedFileTypes: filterExtensions(options.filters),
    allowsMultipleSelection: options.multiple ?? false,
    canChooseDirectory: options.directory ?? false,
    canChooseFiles: options.directory !== true,
  });
  return selected.filter(Boolean);
}

async function processText(
  command: string[],
  env?: Record<string, string>
): Promise<string | null> {
  try {
    const process = Bun.spawn(command, {
      env: { ...Bun.env, ...env },
      stderr: "ignore",
      stdout: "pipe",
    });
    const output = await new Response(process.stdout).text();
    return (await process.exited) === 0 ? output.trim() || null : null;
  } catch {
    return null;
  }
}

async function saveDialog(options: SaveDialogOptions): Promise<string | null> {
  const defaultPath =
    options.defaultPath != null && options.defaultPath !== ""
      ? options.defaultPath
      : "untitled";
  const title =
    options.title != null && options.title !== "" ? options.title : "Save";
  if (process.platform === "darwin") {
    const script = [
      "on run argv",
      "try",
      "set chosenFile to choose file name with prompt (item 1 of argv) default name (item 2 of argv)",
      "return POSIX path of chosenFile",
      "on error number -128",
      'return ""',
      "end try",
      "end run",
    ].join("\n");
    return processText([
      "/usr/bin/osascript",
      "-e",
      script,
      "--",
      title,
      basename(defaultPath),
    ]);
  }
  if (process.platform === "win32") {
    const extension = extname(defaultPath).slice(1);
    const filter = extension
      ? `${extension.toUpperCase()} (*.${extension})|*.${extension}|All files (*.*)|*.*`
      : "All files (*.*)|*.*";
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.SaveFileDialog",
      "$dialog.Title = $env:CODETWO_SAVE_TITLE",
      "$dialog.FileName = $env:CODETWO_SAVE_NAME",
      "$dialog.Filter = $env:CODETWO_SAVE_FILTER",
      "if ($dialog.ShowDialog() -eq 'OK') { Write-Output $dialog.FileName }",
    ].join("; ");
    return processText(["powershell.exe", "-NoProfile", "-Command", script], {
      CODETWO_SAVE_FILTER: filter,
      CODETWO_SAVE_NAME: basename(defaultPath),
      CODETWO_SAVE_TITLE: title,
    });
  }
  return processText([
    "zenity",
    "--file-selection",
    "--save",
    "--confirm-overwrite",
    `--title=${title}`,
    `--filename=${join(Utils.paths.documents, basename(defaultPath))}`,
  ]);
}

async function openWorkspace(
  path: string,
  target: WorkspaceOpenTarget
): Promise<boolean> {
  if (target === "finder") {
    return Utils.openPath(path);
  }
  const command = workspaceOpenCommand(path, target);
  if (!command) {
    return false;
  }

  try {
    const child = Bun.spawn(command, {
      stderr: "ignore",
      stdin: "ignore",
      stdout: "ignore",
    });
    return (await child.exited) === 0;
  } catch {
    return false;
  }
}

const queuedEvents: DesktopEvent[] = [];
let isRendererReady = false;
let rpc: ReturnType<typeof BrowserView.defineRPC<CodeTwoRPC>>;
let desktopPetRpc: ReturnType<typeof BrowserView.defineRPC<CodeTwoRPC>>;
let appshots: AppshotManager;
const applicationName = process.env.CODETWO_APP_NAME ?? "C2";
if (process.platform === "darwin") {
  ApplicationMenu.setApplicationMenu(macOSApplicationMenu());
}
const dataDirectory =
  process.env.CODETWO_DATA_DIR ??
  join(
    Utils.paths.appData,
    process.env.CODETWO_APP_IDENTIFIER ?? "dev.codetwo.app.dev"
  );
const desktopPetPositionPath = join(dataDirectory, "desktop-pet-window.json");
const desktopPetWidth = 184;
const desktopPetHeights = { large: 204, medium: 180, small: 156 } as const;
const desktopPetBubbleHeight = 64;
let desktopPetState: DesktopPetState = {
  animation: "idle",
  appearance: {
    petActivityEnabled: true,
    petId: "naiwa",
    petName: "Naiwa",
    petSize: "medium",
    petSource: "builtin",
  },
  bubble: null,
  visible: false,
};
let desktopPetWindow: BrowserWindow | null = null;
let isDesktopPetRendererReady = false;
let desktopPetProgrammaticPosition: { x: number; y: number } | null = null;

function desktopPetHeight() {
  return (
    desktopPetHeights[desktopPetState.appearance.petSize] +
    (desktopPetState.bubble != null && desktopPetState.bubble !== ""
      ? desktopPetBubbleHeight
      : 0)
  );
}

function desktopPetFrame() {
  const display = Screen.getPrimaryDisplay().workArea;
  const height = desktopPetHeight();
  const fallback = {
    x: display.x + display.width - desktopPetWidth - 24,
    y: display.y + display.height - height - 24,
  };
  try {
    const saved = asJsonObject(
      JSON.parse(readFileSync(desktopPetPositionPath, "utf8")) as unknown
    );
    const x = numberField(saved, "x", Number.NaN);
    const y = numberField(saved, "y", Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error("invalid");
    }
    const workArea = Screen.getAllDisplays()
      .map((item) => item.workArea)
      .find((area) => {
        return (
          x >= area.x - desktopPetWidth / 2 &&
          x <= area.x + area.width - desktopPetWidth / 2 &&
          y >= area.y - height / 2 &&
          y <= area.y + area.height - height / 2
        );
      });
    if (!workArea) {
      return { ...fallback, height, width: desktopPetWidth };
    }
    return {
      height,
      width: desktopPetWidth,
      x: Math.min(
        workArea.x + workArea.width - desktopPetWidth,
        Math.max(workArea.x, x)
      ),
      y: Math.min(
        workArea.y + workArea.height - height,
        Math.max(workArea.y, y)
      ),
    };
  } catch {
    return { ...fallback, height, width: desktopPetWidth };
  }
}

function applyDesktopPetState() {
  if (!desktopPetWindow) {
    return;
  }
  const frame = desktopPetWindow.getFrame();
  const height = desktopPetHeight();
  if (frame.width !== desktopPetWidth || frame.height !== height) {
    const y = frame.y + frame.height - height;
    desktopPetProgrammaticPosition = { x: frame.x, y };
    desktopPetWindow.setFrame(frame.x, y, desktopPetWidth, height);
  }
  if (isDesktopPetRendererReady && desktopPetState.visible) {
    desktopPetWindow.showInactive();
  } else {
    desktopPetWindow.hide();
  }
  desktopPetRpc.send.event({
    name: "desktop-pet-state",
    payload: desktopPetState,
  });
}

function persistDesktopPetPosition(x: number, y: number) {
  try {
    mkdirSync(dataDirectory, { mode: 0o700, recursive: true });
    const normalizedY =
      y +
      (desktopPetState.bubble != null && desktopPetState.bubble !== ""
        ? desktopPetBubbleHeight
        : 0);
    writeFileSync(
      desktopPetPositionPath,
      `${JSON.stringify({ x, y: normalizedY })}\n`,
      {
        mode: 0o600,
      }
    );
  } catch {
    // A read-only app-data directory should not make the companion unusable for this run.
  }
}
const hostExecutable =
  process.platform === "win32"
    ? "codetwo-desktop-host.exe"
    : "codetwo-desktop-host";
const host = new NativeHost({
  dataDirectory,
  executable: join(PATHS.RESOURCES_FOLDER, "app", "bin", hostExecutable),
  onEvent: (event) => {
    if (isRendererReady) {
      rpc.send.event(event);
    } else {
      queuedEvents.push(event);
    }
  },
});

try {
  await host.start();
} catch (error) {
  await Utils.showMessageBox({
    buttons: ["Quit"],
    message: error instanceof Error ? error.message : String(error),
    title: `${applicationName} could not start`,
    type: "error",
  });
  Utils.quit();
  throw error;
}

rpc = BrowserView.defineRPC<CodeTwoRPC>({
  handlers: {
    messages: {},
    requests: {
      appshotsCapture: async () => {
        const capture = await appshots.capture();
        rpc.send.appshotCaptured(capture);
        mainWindow.show();
        return capture;
      },
      appshotsGet: ({ id }) => appshots.getCapture(id),
      appshotsOpenPrivacySettings: ({ kind }) =>
        appshots.openPrivacySettings(kind),
      appshotsRequestPermissions: ({ kind }) =>
        appshots.requestPermissions(kind),
      appshotsSettings: () => appshots.getSettings(),
      appshotsUpdate: (patch) => appshots.updateSettings(patch),
      browserZoom: ({ webviewId, factor }) => {
        BrowserView.getById(webviewId)?.setPageZoom(factor);
      },
      call: ({
        name,
        args,
        projectPath,
      }: {
        name: string;
        args: unknown;
        projectPath: string | null;
      }) => host.call(name, args, projectPath),
      confirm: async ({ message, title }) => {
        const result = await Utils.showMessageBox({
          buttons: ["Cancel", "Continue"],
          cancelId: 0,
          defaultId: 0,
          message,
          title: title ?? applicationName,
          type: "warning",
        });
        return result.response === 1;
      },
      contextMenuShow: ({ requestId, items }) => {
        ContextMenu.showContextMenu(nativeContextMenuConfig(items, requestId));
      },
      desktopPetUpdate: (state) => {
        desktopPetState = state;
        applyDesktopPetState();
      },
      dialogOpen: openDialog,
      dialogSave: saveDialog,
      openDevtools: () => mainWindow.webview.openDevTools(),
      openExternal: ({ url }) => Utils.openExternal(url),
      openPath: ({ path }) => Utils.openPath(path),
      openWorkspace: ({ path, target }) => openWorkspace(path, target),
      showItemInFolder: ({ path }) => {
        Utils.showItemInFolder(path);
        return true;
      },
      systemBadgeSet: ({ count }) => setMacOSSystemBadgeCount(count),
      systemProfileAvatar: readSystemProfileAvatar,
      titlebarDoubleClick: () =>
        performMacOSTitlebarDoubleClick(mainWindow.ptr),
      updateCheck: startAppUpdateCheck,
      updateStatus: getAppUpdateStatus,
    },
  },
  maxRequestTime: Infinity,
});

desktopPetRpc = BrowserView.defineRPC<CodeTwoRPC>({
  handlers: {
    messages: {},
    requests: {
      contextMenuShow: ({ requestId, items }) => {
        ContextMenu.showContextMenu(nativeContextMenuConfig(items, requestId));
      },
      desktopPetHide: () => {
        desktopPetState = { ...desktopPetState, visible: false };
        applyDesktopPetState();
        rpc.send.event({ name: "desktop-pet-hidden", payload: null });
      },
      desktopPetState: () => desktopPetState,
    },
  },
  maxRequestTime: Infinity,
});

ContextMenu.on("context-menu-clicked", (event) => {
  const action = nativeContextMenuAction(event);
  if (!action) {
    return;
  }
  rpc.send.event({ name: "native-context-menu-action", payload: action });
  desktopPetRpc.send.event({
    name: "native-context-menu-action",
    payload: action,
  });
});

const display = Screen.getPrimaryDisplay().workArea;
const width = 1200;
const height = 800;
const mainWindow = new BrowserWindow({
  frame: {
    height,
    width,
    x: Math.max(display.x, display.x + Math.round((display.width - width) / 2)),
    y: Math.max(
      display.y,
      display.y + Math.round((display.height - height) / 2)
    ),
  },
  renderer: "native",
  rpc,
  sandbox: false,
  title: applicationName,
  titleBarStyle: "hiddenInset",
  transparent: process.platform === "darwin",
  url: "views://main/index.html",
});
desktopPetWindow = new BrowserWindow({
  activate: false,
  frame: desktopPetFrame(),
  hidden: true,
  passthrough: false,
  renderer: "native",
  rpc: desktopPetRpc,
  sandbox: false,
  styleMask: {
    Closable: false,
    FullSizeContentView: true,
    Miniaturizable: false,
    NonactivatingPanel: process.platform === "darwin",
    Resizable: false,
    Titled: false,
    UtilityWindow: true,
  },
  title: `${applicationName} Pet`,
  titleBarStyle: "hidden",
  transparent: true,
  url: "views://main/desktop-pet.html",
});
desktopPetWindow.setAlwaysOnTop(true);
desktopPetWindow.setVisibleOnAllWorkspaces(true);
desktopPetWindow.webview.on("dom-ready", () => {
  isDesktopPetRendererReady = true;
  applyDesktopPetState();
});
desktopPetWindow.on("move", (event) => {
  const payload = asJsonObject(event);
  const position = asJsonObject(payload?.data);
  const x = numberField(position, "x", Number.NaN);
  const y = numberField(position, "y", Number.NaN);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    if (
      desktopPetProgrammaticPosition &&
      x === desktopPetProgrammaticPosition.x &&
      y === desktopPetProgrammaticPosition.y
    ) {
      desktopPetProgrammaticPosition = null;
      return;
    }
    desktopPetProgrammaticPosition = null;
    persistDesktopPetPosition(x, y);
  }
});
mainWindow.on("close", () => desktopPetWindow?.close());
appshots = new AppshotManager(
  dataDirectory,
  process.env.CODETWO_APP_IDENTIFIER ?? "dev.codetwo.app.dev",
  (capture) => rpc.send.appshotCaptured(capture),
  (message) => rpc.send.appshotFailed({ message }),
  () => mainWindow.show()
);
if (process.platform === "darwin") {
  const windowEffectsStatus = configureMacOSWindowEffects(mainWindow.ptr);
  if (!windowEffectsStatus.shadow) {
    console.warn("The macOS system window shadow could not be restored");
  }
  if (!windowEffectsStatus.backdrop) {
    console.warn("The macOS system backdrop could not be installed");
  }
  // AppKit can reset standard-window-button frames during its own resize layout pass. Reapply the
  // same fixed position afterward; the 46px titlebar has no runtime geometry to measure.
  mainWindow.on("resize", () => mainWindow.setWindowButtonPosition(22, 16));
}

mainWindow.webview.on("dom-ready", () => {
  if (process.platform === "darwin") {
    mainWindow.webview.executeJavascript(
      'document.documentElement.classList.add("macos-window-glass")'
    );
    // Center the 14px native controls in the shared 46px Codex-aligned title row.
    mainWindow.setWindowButtonPosition(22, 16);
  }
  isRendererReady = true;
  rpc.send.hostStatus({ ready: true });
  for (const event of queuedEvents.splice(0)) {
    rpc.send.event(event);
  }
});

Electrobun.events.on(`new-window-open-${mainWindow.webview.id}`, (event) => {
  const payload = asJsonObject(event);
  const detailValue = asJsonObject(payload?.data)?.detail;
  const detailObject = asJsonObject(detailValue);
  const url =
    typeof detailValue === "string"
      ? detailValue
      : typeof detailObject?.url === "string"
        ? detailObject.url
        : null;
  if (url != null && url !== "") {
    Utils.openExternal(url);
  }
});

let isShuttingDown = false;
Electrobun.events.on("before-quit", (event: { response?: unknown }) => {
  if (isShuttingDown) {
    return;
  }
  event.response = { allow: false };
  isShuttingDown = true;
  appshots.shutdown();
  void host.shutdown().finally(() => Utils.quit());
});
