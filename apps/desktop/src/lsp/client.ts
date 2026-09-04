/**
 * A minimal Language Server Protocol client over the desktop host bridge.
 *
 * The Rust desktop LSP plugin owns the process and stdio framing; what crosses the bridge is one JSON-RPC
 * message per event. This client owns the protocol: the initialize handshake, document sync, and
 * the requests the Monaco providers in ./providers translate.
 *
 * Deliberately not a full client. No dynamic capability registration, no workspace edits, no
 * progress UI — servers that ask get polite empty answers (see `answer`). What's implemented is
 * the working set an editor pane actually shows: completion, hover, signature help, definition,
 * references, formatting, and published diagnostics.
 */
import { lspSend, lspStart, onLspExit, onLspMessage } from "../bridge";
import {
  asJsonArray,
  asJsonObject,
  objectField,
  parseJsonPayload,
  stringField,
} from "./json";
import type { JsonObject } from "./json";

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

// The App enables this only after the active project catalog has loaded. Starting closed avoids a
// file-editor mount racing a persisted project-level disable during desktop bootstrap.
let isRuntimeEnabled = false;
let runtimeGeneration = 0;

/**
Languages served by an external LSP server rather than Monaco's built-in workers.
*/
const builtinServerGroups: Record<string, string[]> = {
  clangd: ["c", "cpp"],
  go: ["go"],
  php: ["php"],
  python: ["python"],
  ruby: ["ruby"],
  rust: ["rust"],
  svelte: ["svelte"],
  ts: ["typescript", "javascript"],
  vue: ["vue"],
  yaml: ["yaml"],
};

export interface PluginLanguageServerRegistration {
  pluginId: string;
  id: string;
  languages: string[];
}

let pluginServerGroups: Record<string, string[]> = {};
let pluginServerSignature = "[]";

function serverGroups(): Record<string, string[]> {
  return { ...builtinServerGroups, ...pluginServerGroups };
}

function groupOf(lang: string): string | null {
  for (const [group, langs] of [
    ...Object.entries(pluginServerGroups),
    ...Object.entries(builtinServerGroups),
  ]) {
    if (langs.includes(lang)) {
      return group;
    }
  }
  return null;
}

export function isLspLanguage(lang: string): boolean {
  return isRuntimeEnabled && groupOf(lang) !== null;
}

export function pathToUri(p: string): string {
  const normalized = p.replaceAll("\\", "/");
  if (normalized.startsWith("//")) {
    const [authority, ...segments] = normalized.slice(2).split("/");
    return `file://${encodeURIComponent(authority)}/${segments.map(encodeURIComponent).join("/")}`;
  }
  const path = /^[a-z]:\//iu.test(normalized) ? `/${normalized}` : normalized;
  return `file://${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function uriToPath(uri: string): string {
  const unc = uri.match(/^file:\/\/([^/]+)(\/.*)?$/u);
  if (unc) {
    const rest = decodeURIComponent(unc[2] ?? "").replaceAll("/", "\\");
    return `\\\\${decodeURIComponent(unc[1])}${rest}`;
  }
  const decoded = decodeURIComponent(uri.replace(/^file:\/\//u, ""));
  if (/^\/[a-z]:\//iu.test(decoded)) {
    return decoded.slice(1).replaceAll("/", "\\");
  }
  return decoded;
}

export class LspClient {
  /**
  Live clients by backend key ("binary:cwd"). ./providers routes models here.
  */
  static clients = new Map<string, LspClient>();

  readonly key: string;
  readonly cwd: string;
  readonly langs: string[];
  /**
  Server capabilities from the initialize response — providers read trigger characters etc.
  */
  capabilities: JsonObject = {};
  /**
  Resolves false when the handshake fails; callers then fall back to built-ins.
  */
  readonly ready: Promise<boolean>;

  onDiagnostics: ((uri: string, diagnostics: unknown[]) => void) | null = null;

  private nextId = 1;
  private pending = new Map<number, Pending>();
  private openVersions = new Map<string, number>();
  private changeTimer = new Map<string, ReturnType<typeof setTimeout>>();
  private changeText = new Map<string, string>();
  private dead = false;

  constructor(key: string, cwd: string, langs: string[]) {
    this.key = key;
    this.cwd = cwd;
    this.langs = langs;
    LspClient.clients.set(key, this);
    this.ready = this.initialize()
      .then(() => true)
      .catch(() => {
        this.dispose();
        return false;
      });
  }

  private async initialize(): Promise<void> {
    const name = this.cwd.split(/[\\/]/u).filter(Boolean).pop() ?? this.cwd;
    const result = await this.request("initialize", {
      capabilities: {
        textDocument: {
          completion: {
            completionItem: {
              documentationFormat: ["markdown", "plaintext"],
              insertReplaceSupport: true,
              snippetSupport: true,
            },
            contextSupport: true,
          },
          definition: {},
          formatting: {},
          hover: { contentFormat: ["markdown", "plaintext"] },
          publishDiagnostics: {},
          references: {},
          signatureHelp: {
            signatureInformation: {
              documentationFormat: ["markdown", "plaintext"],
              parameterInformation: { labelOffsetSupport: true },
            },
          },
          synchronization: { didSave: true },
        },
        window: { workDoneProgress: true },
        workspace: { workspaceFolders: true },
      },
      clientInfo: { name: "C2" },
      processId: null,
      rootPath: this.cwd,
      rootUri: pathToUri(this.cwd),
      workspaceFolders: [{ name, uri: pathToUri(this.cwd) }],
    });
    this.capabilities = objectField(asJsonObject(result), "capabilities") ?? {};
    this.notify("initialized", {});
  }

  /**
  Feed one raw message from the bridge into the protocol machinery.
  */
  handle(payload: string): void {
    if (this.dead || !isRuntimeEnabled) {
      return;
    }
    let msgValue: unknown;
    try {
      msgValue = parseJsonPayload(payload);
    } catch {
      return;
    }
    const msg = asJsonObject(msgValue);
    if (msg == null) {
      return;
    }
    if (msg.method !== undefined && msg.id !== undefined) {
      this.answer(msg);
    } else if (msg.id !== undefined) {
      const id = typeof msg.id === "number" ? msg.id : Number(msg.id);
      if (!Number.isFinite(id)) {
        return;
      }
      const pending = this.pending.get(id);
      if (!pending) {
        return;
      }
      this.pending.delete(id);
      const error = asJsonObject(msg.error);
      if (error == null) {
        pending.resolve(msg.result ?? null);
      } else {
        pending.reject(
          new Error(String(stringField(error, "message") ?? "LSP error"))
        );
      }
    } else if (msg.method === "textDocument/publishDiagnostics") {
      const params = objectField(msg, "params");
      const diagnostics = asJsonArray(params?.diagnostics) ?? [];
      this.onDiagnostics?.(stringField(params, "uri") ?? "", diagnostics);
    }
    // Other notifications (progress, logs) are noise for a pane this size.
  }

  /**
   * Server→client requests. Everything gets a well-formed answer — a server left hanging on an
   * unanswered request (rust-analyzer's progress tokens, pyright's configuration pulls) can stall
   * its whole queue, which presents as "completions never arrive", not as an error.
   */
  private answer(msg: JsonObject): void {
    let result: unknown = null;
    if (msg.method === "workspace/configuration") {
      const items = asJsonArray(objectField(msg, "params")?.items) ?? [];
      result = items.map(() => null);
    } else if (msg.method === "workspace/applyEdit") {
      result = { applied: false };
    }
    void this.send({ id: msg.id, jsonrpc: "2.0", result });
  }

  request(method: string, params: JsonObject): Promise<unknown> {
    if (this.dead || !isRuntimeEnabled) {
      return Promise.resolve(null);
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
      void this.send({ id, jsonrpc: "2.0", method, params }).catch((error) => {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  notify(method: string, params: JsonObject): void {
    if (this.dead || !isRuntimeEnabled) {
      return;
    }
    void this.send({ jsonrpc: "2.0", method, params });
  }

  private send(msg: JsonObject): Promise<void> {
    if (this.dead || !isRuntimeEnabled) {
      return Promise.resolve();
    }
    return lspSend(this.key, JSON.stringify(msg));
  }

  // ---- document sync ---------------------------------------------------------------------------

  isOpen(uri: string): boolean {
    return this.openVersions.has(uri);
  }

  didOpen(uri: string, languageId: string, text: string): void {
    if (this.openVersions.has(uri)) {
      return;
    }
    this.openVersions.set(uri, 1);
    this.notify("textDocument/didOpen", {
      textDocument: { languageId, text, uri, version: 1 },
    });
  }

  /**
  Debounced full-document sync — batches keystrokes; `flush` forces the send before requests.
  */
  scheduleChange(uri: string, text: string): void {
    this.changeText.set(uri, text);
    const timer = this.changeTimer.get(uri);
    if (timer) {
      clearTimeout(timer);
    }
    this.changeTimer.set(
      uri,
      setTimeout(() => this.flush(uri), 150)
    );
  }

  flush(uri: string): void {
    const timer = this.changeTimer.get(uri);
    if (timer) {
      clearTimeout(timer);
    }
    this.changeTimer.delete(uri);
    const text = this.changeText.get(uri);
    if (text === undefined || !this.openVersions.has(uri)) {
      return;
    }
    this.changeText.delete(uri);
    const version = (this.openVersions.get(uri) ?? 1) + 1;
    this.openVersions.set(uri, version);
    // A change event without a range is a full-document replace — legal under any sync kind.
    this.notify("textDocument/didChange", {
      contentChanges: [{ text }],
      textDocument: { uri, version },
    });
  }

  didSave(uri: string): void {
    if (!this.openVersions.has(uri)) {
      return;
    }
    this.flush(uri);
    this.notify("textDocument/didSave", { textDocument: { uri } });
  }

  dispose(): void {
    this.dead = true;
    LspClient.clients.delete(this.key);
    for (const timer of this.changeTimer.values()) {
      clearTimeout(timer);
    }
    this.changeTimer.clear();
    this.changeText.clear();
    this.openVersions.clear();
    for (const p of this.pending.values()) {
      p.reject(new Error("LSP client disposed"));
    }
    this.pending.clear();
  }
}

export function clientForPath(path: string, lang: string): LspClient | null {
  if (!isRuntimeEnabled) {
    return null;
  }
  for (const client of LspClient.clients.values()) {
    if (client.langs.includes(lang) && path.startsWith(`${client.cwd}/`)) {
      return client;
    }
  }
  return null;
}

// ---- client acquisition ------------------------------------------------------------------------

/**
One in-flight/complete acquisition per (cwd, server group); null is a cached "not installed".
*/
const acquisitions = new Map<string, Promise<LspClient | null>>();
let isListening = false;
type RuntimeEnabledListener = (workspace: string | undefined) => void;
const runtimeEnabledListeners = new Set<RuntimeEnabledListener>();

export function configurePluginLanguageServers(
  servers: PluginLanguageServerRegistration[]
): void {
  const normalized = servers
    .map((server) => {
      return {
        id: server.id,
        languages: [
          ...new Set(
            server.languages.map((language) => language.toLocaleLowerCase())
          ),
        ].sort(),
        pluginId: server.pluginId,
      };
    })
    .sort((left, right) => {
      return (
        left.pluginId.localeCompare(right.pluginId) ||
        left.id.localeCompare(right.id)
      );
    });
  const signature = JSON.stringify(normalized);
  if (signature === pluginServerSignature) {
    return;
  }
  pluginServerSignature = signature;
  const providers = new Map<string, number>();
  for (const server of normalized) {
    for (const language of server.languages) {
      providers.set(language, (providers.get(language) ?? 0) + 1);
    }
  }
  pluginServerGroups = Object.fromEntries(
    normalized.flatMap((server) => {
      const languages = server.languages.filter(
        (language) => providers.get(language) === 1
      );
      return languages.length > 0
        ? [[`plugin:${server.pluginId}:${server.id}`, languages]]
        : [];
    })
  );
  runtimeGeneration += 1;
  acquisitions.clear();
  for (const client of [...LspClient.clients.values()]) {
    client.dispose();
  }
  if (isRuntimeEnabled) {
    for (const listener of runtimeEnabledListeners) {
      listener(undefined);
    }
  }
}

export function setLspRuntimeEnabled(
  isEnabled: boolean,
  workspace?: string
): void {
  if (isRuntimeEnabled === isEnabled) {
    return;
  }
  isRuntimeEnabled = isEnabled;
  runtimeGeneration += 1;
  acquisitions.clear();
  if (!isEnabled) {
    for (const client of [...LspClient.clients.values()]) {
      client.dispose();
    }
    return;
  }
  for (const listener of runtimeEnabledListeners) {
    listener(workspace);
  }
}

export function isLspRuntimeEnabled(): boolean {
  return isRuntimeEnabled;
}

export function onLspRuntimeEnabled(
  listener: RuntimeEnabledListener
): () => void {
  runtimeEnabledListeners.add(listener);
  return () => runtimeEnabledListeners.delete(listener);
}

async function ensureListeners(): Promise<void> {
  if (isListening) {
    return;
  }
  isListening = true;
  await onLspMessage(({ key, payload }) =>
    LspClient.clients.get(key)?.handle(payload)
  );
  await onLspExit((key) => {
    LspClient.clients.get(key)?.dispose();
    // Drop the acquisition cache lines that produced this client, so reopening a file respawns.
    for (const [k, v] of acquisitions) {
      void v.then((c) => {
        if (c?.key === key) {
          acquisitions.delete(k);
        }
      });
    }
  });
}

export async function getClient(
  cwd: string,
  lang: string
): Promise<LspClient | null> {
  if (!isRuntimeEnabled) {
    return null;
  }
  const group = groupOf(lang);
  if (group == null || group === "") {
    return null;
  }
  const cacheKey = `${cwd}::${group}`;
  let acq = acquisitions.get(cacheKey);
  if (!acq) {
    const generation = runtimeGeneration;
    // Never cache a rejection: a null is "no LSP for now", a rejected promise would be forever.
    acq = (async () => {
      try {
        await ensureListeners();
        if (!isRuntimeEnabled || generation !== runtimeGeneration) {
          return null;
        }
        const key = await lspStart(cwd, lang);
        if (
          key == null ||
          key === "" ||
          !isRuntimeEnabled ||
          generation !== runtimeGeneration
        ) {
          return null;
        }
        const client =
          LspClient.clients.get(key) ??
          new LspClient(key, cwd, serverGroups()[group]);
        return (await client.ready) ? client : null;
      } catch {
        return null;
      }
    })();
    acquisitions.set(cacheKey, acq);
  }
  return acq;
}
