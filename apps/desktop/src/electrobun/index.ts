import Electrobun, { BrowserView, BrowserWindow, PATHS, Screen, Utils } from "electrobun/bun";
import { basename, extname, join } from "node:path";
import { mkdirSync } from "node:fs";

import type {
  CodeTwoRPC,
  DesktopEvent,
  DialogFilter,
  OpenDialogOptions,
  SaveDialogOptions,
} from "./rpc";

interface HostResponse {
  id?: number;
  result?: unknown;
  error?: string;
  method?: string;
  params?: DesktopEvent;
}

class NativeHost {
  private child: Bun.Subprocess<"pipe", "pipe", "inherit"> | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private ready = false;
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;

  constructor(private readonly onEvent: (event: DesktopEvent) => void) {
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
  }

  async start(): Promise<void> {
    const executable = process.platform === "win32" ? "codetwo-desktop-host.exe" : "codetwo-desktop-host";
    const hostPath = join(PATHS.RESOURCES_FOLDER, "app", "bin", executable);
    const dataDir = join(Utils.paths.appData, "dev.codetwo.app");
    mkdirSync(dataDir, { recursive: true });

    this.child = Bun.spawn([hostPath, "--data-dir", dataDir], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
    });
    void this.readOutput(this.child.stdout);
    void this.child.exited.then((code) => {
      const error = new Error(`C2 native host exited with status ${code}`);
      if (!this.ready) this.rejectReady(error);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.readyPromise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("C2 native host did not become ready")), 60_000);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async call(name: string, args: unknown, projectPath: string | null): Promise<unknown> {
    await this.readyPromise;
    return this.request("call", { name, args, project_path: projectPath });
  }

  async shutdown(): Promise<void> {
    const child = this.child;
    if (!child) return;
    try {
      await Promise.race([
        this.request("shutdown", null),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("native host shutdown timed out")), 2_000),
        ),
      ]);
      child.stdin.end();
      const exited = await Promise.race([
        child.exited.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 3_000)),
      ]);
      if (!exited) {
        child.kill();
        await child.exited;
      }
    } catch {
      child.kill();
    } finally {
      this.child = null;
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const child = this.child;
    if (!child) return Promise.reject(new Error("C2 native host is not running"));
    const id = this.nextId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    child.stdin.flush();
    return promise;
  }

  private async readOutput(stdout: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    const reader = stdout.getReader();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) this.handleLine(line);
        newline = buffer.indexOf("\n");
      }
    }
    const tail = (buffer + decoder.decode()).trim();
    if (tail) this.handleLine(tail);
  }

  private handleLine(line: string): void {
    let message: HostResponse;
    try {
      message = JSON.parse(line) as HostResponse;
    } catch (error) {
      console.error("C2 native host emitted invalid protocol data", error, line);
      return;
    }

    if (message.method === "event" && message.params) {
      if (message.params.name === "host-ready") {
        this.ready = true;
        this.resolveReady();
      }
      this.onEvent(message.params);
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
  }
}

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

const queuedEvents: DesktopEvent[] = [];
let rendererReady = false;
let rpc: ReturnType<typeof BrowserView.defineRPC<CodeTwoRPC>>;
const host = new NativeHost((event) => {
  if (rendererReady) rpc.send.event(event);
  else queuedEvents.push(event);
});

try {
  await host.start();
} catch (error) {
  await Utils.showMessageBox({
    type: "error",
    title: "C2 could not start",
    message: error instanceof Error ? error.message : String(error),
    buttons: ["Quit"],
  });
  Utils.quit();
  throw error;
}

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
          title: title ?? "C2",
          message,
          buttons: ["Cancel", "Continue"],
          defaultId: 0,
          cancelId: 0,
        });
        return result.response === 1;
      },
      openExternal: ({ url }) => Utils.openExternal(url),
      openPath: ({ path }) => Utils.openPath(path),
      showItemInFolder: ({ path }) => {
        Utils.showItemInFolder(path);
        return true;
      },
      browserZoom: ({ webviewId, factor }) => {
        BrowserView.getById(webviewId)?.setPageZoom(factor);
      },
      openDevtools: () => mainWindow.webview.openDevTools(),
    },
    messages: {},
  },
});

const display = Screen.getPrimaryDisplay().workArea;
const width = 1200;
const height = 800;
const mainWindow = new BrowserWindow({
  title: "C2",
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
  trafficLightOffset: { x: 14, y: 27 },
  sandbox: false,
});

mainWindow.webview.on("dom-ready", () => {
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
