import Electrobun, { BrowserView, BrowserWindow, ContextMenu, Screen, Utils } from "electrobun/bun";
import { basename, extname, join } from "node:path";

import type {
  CodeTwoRPC,
  DesktopEvent,
  DialogFilter,
  OpenDialogOptions,
  SaveDialogOptions,
  WorkspaceOpenTarget,
} from "./rpc";
import { PureBunHost } from "./host";
import { nativeContextMenuAction, nativeContextMenuConfig } from "./contextMenuHost";
import { getAppUpdateStatus, startAppUpdateCheck } from "./update";
import { configureMacOSWindowEffects } from "./windowEffects";
import { workspaceOpenCommand } from "./workspaceOpen";

function filterExtensions(filters: DialogFilter[] | undefined): string {
  const extensions = filters?.flatMap((filter) => filter.extensions) ?? [];
  return extensions.length > 0 ? extensions.join(",") : "*";
}

async function openDialog(options: OpenDialogOptions): Promise<string[]> {
  const selected = await Utils.openFileDialog({
    allowedFileTypes: filterExtensions(options.filters),
    canChooseFiles: !options.directory,
    canChooseDirectory: options.directory ?? false,
    allowsMultipleSelection: options.multiple ?? false,
  });
  return selected.filter(Boolean);
}

async function processText(command: string[], env?: Record<string, string>): Promise<string | null> {
  try {
    const process = Bun.spawn(command, { stdout: "pipe", stderr: "ignore", env: { ...Bun.env, ...env } });
    const output = await new Response(process.stdout).text();
    return (await process.exited) === 0 ? output.trim() || null : null;
  } catch {
    return null;
  }
}

async function saveDialog(options: SaveDialogOptions): Promise<string | null> {
  const defaultPath = options.defaultPath || "untitled";
  const title = options.title || "Save";
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
    return processText(["/usr/bin/osascript", "-e", script, "--", title, basename(defaultPath)]);
  }
  if (process.platform === "win32") {
    const extension = extname(defaultPath).slice(1);
    const filter = extension ? `${extension.toUpperCase()} (*.${extension})|*.${extension}|All files (*.*)|*.*` : "All files (*.*)|*.*";
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.SaveFileDialog",
      "$dialog.Title = $env:CODETWO_SAVE_TITLE",
      "$dialog.FileName = $env:CODETWO_SAVE_NAME",
      "$dialog.Filter = $env:CODETWO_SAVE_FILTER",
      "if ($dialog.ShowDialog() -eq 'OK') { Write-Output $dialog.FileName }",
    ].join("; ");
    return processText(["powershell.exe", "-NoProfile", "-Command", script], {
      CODETWO_SAVE_TITLE: title,
      CODETWO_SAVE_NAME: basename(defaultPath),
      CODETWO_SAVE_FILTER: filter,
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

async function openWorkspace(path: string, target: WorkspaceOpenTarget): Promise<boolean> {
  if (target === "finder") return Utils.openPath(path);
  const command = workspaceOpenCommand(path, target);
  if (!command) return false;

  try {
    const child = Bun.spawn(command, { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    return (await child.exited) === 0;
  } catch {
    return false;
  }
}

const queuedEvents: DesktopEvent[] = [];
let rendererReady = false;
let rpc: ReturnType<typeof BrowserView.defineRPC<CodeTwoRPC>>;
const applicationName = process.env.CODETWO_APP_NAME ?? "C2";
const dataDir =
  process.env.CODETWO_DATA_DIR ??
  join(Utils.paths.appData, process.env.CODETWO_APP_IDENTIFIER ?? "dev.codetwo.app.dev");
const host = new PureBunHost(dataDir, (event) => {
  if (rendererReady) rpc.send.event(event);
  else queuedEvents.push(event);
});

rpc = BrowserView.defineRPC<CodeTwoRPC>({
  maxRequestTime: Infinity,
  handlers: {
    requests: {
      call: ({
        name,
        args,
        projectPath,
      }: {
        name: string;
        args: unknown;
        projectPath: string | null;
      }) => host.call(name, args, projectPath),
      dialogOpen: openDialog,
      dialogSave: saveDialog,
      confirm: async ({ message, title }) => {
        const result = await Utils.showMessageBox({
          type: "warning",
          title: title ?? applicationName,
          message,
          buttons: ["Cancel", "Continue"],
          defaultId: 0,
          cancelId: 0,
        });
        return result.response === 1;
      },
      contextMenuShow: ({ requestId, items }) => {
        ContextMenu.showContextMenu(nativeContextMenuConfig(items, requestId));
      },
      openExternal: ({ url }) => Utils.openExternal(url),
      openPath: ({ path }) => Utils.openPath(path),
      openWorkspace: ({ path, target }) => openWorkspace(path, target),
      showItemInFolder: ({ path }) => {
        Utils.showItemInFolder(path);
        return true;
      },
      browserZoom: ({ webviewId, factor }) => {
        BrowserView.getById(webviewId)?.setPageZoom(factor);
      },
      openDevtools: () => mainWindow.webview.openDevTools(),
      updateStatus: getAppUpdateStatus,
      updateCheck: startAppUpdateCheck,
    },
    messages: {},
  },
});

ContextMenu.on("context-menu-clicked", (event) => {
  const action = nativeContextMenuAction(event);
  if (!action) return;
  rpc.send.event({ name: "native-context-menu-action", payload: action });
});

const display = Screen.getPrimaryDisplay().workArea;
const width = 1200;
const height = 800;
const mainWindow = new BrowserWindow({
  title: applicationName,
  frame: {
    x: Math.max(display.x, display.x + Math.round((display.width - width) / 2)),
    y: Math.max(display.y, display.y + Math.round((display.height - height) / 2)),
    width,
    height,
  },
  url: "views://main/index.html",
  renderer: "native",
  rpc,
  titleBarStyle: "hiddenInset",
  transparent: process.platform === "darwin",
  sandbox: false,
});
if (process.platform === "darwin") {
  const windowEffectsStatus = configureMacOSWindowEffects(mainWindow.ptr);
  if (!windowEffectsStatus.shadow) {
    console.warn("The macOS system window shadow could not be restored");
  }
  if (!windowEffectsStatus.backdrop) {
    console.warn("The macOS system backdrop could not be installed");
  }
}

mainWindow.webview.on("dom-ready", () => {
  if (process.platform === "darwin") {
    mainWindow.webview.executeJavascript(
      'document.documentElement.classList.add("macos-window-glass")',
    );
  }
  rendererReady = true;
  rpc.send.hostStatus({ ready: true });
  for (const event of queuedEvents.splice(0)) rpc.send.event(event);
});

Electrobun.events.on(`new-window-open-${mainWindow.webview.id}`, (event) => {
  const detail = (event as { data?: { detail?: unknown } }).data?.detail;
  const url =
    typeof detail === "string"
      ? detail
      : typeof detail === "object" && detail !== null && typeof (detail as { url?: unknown }).url === "string"
        ? (detail as { url: string }).url
        : null;
  if (url) Utils.openExternal(url);
});

let shuttingDown = false;
Electrobun.events.on("before-quit", (event) => {
  if (shuttingDown) return;
  event.response = { allow: false };
  shuttingDown = true;
  void host.shutdown().finally(() => Utils.quit());
});
