/**
 * A minimal Language Server Protocol client over the desktop host bridge.
 *
 * The Bun host owns the process and the stdio framing; what crosses the bridge is one JSON-RPC
 * message per event. This client owns the protocol: the initialize handshake, document sync, and
 * the requests the Monaco providers in ./providers translate.
 *
 * Deliberately not a full client. No dynamic capability registration, no workspace edits, no
 * progress UI — servers that ask get polite empty answers (see `answer`). What's implemented is
 * the working set an editor pane actually shows: completion, hover, signature help, definition,
 * references, formatting, and published diagnostics.
 */
import { lspSend, lspStart, onLspExit, onLspMessage } from "../bridge";

/* eslint-disable @typescript-eslint/no-explicit-any -- the wire format is untyped JSON */
type Json = any;

interface Pending {
  resolve: (v: Json) => void;
  reject: (e: Error) => void;
}

// The App enables this only after the active project catalog has loaded. Starting closed avoids a
// file-editor mount racing a persisted project-level disable during desktop bootstrap.
let runtimeEnabled = false;
let runtimeGeneration = 0;

/** Languages served by an external LSP server rather than Monaco's built-in workers. */
const BUILTIN_SERVER_GROUPS: Record<string, string[]> = {
  rust: ["rust"],
  python: ["python"],
  go: ["go"],
  clangd: ["c", "cpp"],
  ts: ["typescript", "javascript"],
  vue: ["vue"],
  svelte: ["svelte"],
  ruby: ["ruby"],
  php: ["php"],
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
  return { ...BUILTIN_SERVER_GROUPS, ...pluginServerGroups };
}

function groupOf(lang: string): string | null {
  for (const [group, langs] of [
    ...Object.entries(pluginServerGroups),
    ...Object.entries(BUILTIN_SERVER_GROUPS),
  ]) {
    if (langs.includes(lang)) return group;
  }
  return null;
}

export function isLspLanguage(lang: string): boolean {
  return runtimeEnabled && groupOf(lang) !== null;
}

export function pathToUri(p: string): string {
  // Percent-encode per RFC 3986 but keep "/". Matches monaco.Uri.file() output for POSIX paths.
  return `file://${p.split("/").map(encodeURIComponent).join("/")}`;
}

export function uriToPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ""));
}

export class LspClient {
  /** Live clients by backend key ("binary:cwd"). ./providers routes models here. */
  static clients = new Map<string, LspClient>();

  readonly key: string;
  readonly cwd: string;
  readonly langs: string[];
  /** Server capabilities from the initialize response — providers read trigger characters etc. */
  capabilities: Json = {};
  /** Resolves false when the handshake fails; callers then fall back to built-ins. */
  readonly ready: Promise<boolean>;

  onDiagnostics: ((uri: string, diagnostics: Json[]) => void) | null = null;

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
    const name = this.cwd.split("/").filter(Boolean).pop() ?? this.cwd;
    const result = await this.request("initialize", {
      processId: null,
      clientInfo: { name: "C2" },
      rootUri: pathToUri(this.cwd),
      rootPath: this.cwd,
      workspaceFolders: [{ uri: pathToUri(this.cwd), name }],
      capabilities: {
        textDocument: {
          synchronization: { didSave: true },
          completion: {
            completionItem: {
              snippetSupport: true,
              insertReplaceSupport: true,
              documentationFormat: ["markdown", "plaintext"],
            },
            contextSupport: true,
          },
          hover: { contentFormat: ["markdown", "plaintext"] },
          signatureHelp: {
            signatureInformation: {
              documentationFormat: ["markdown", "plaintext"],
              parameterInformation: { labelOffsetSupport: true },
            },
          },
          definition: {},
          references: {},
          formatting: {},
          publishDiagnostics: {},
        },
        workspace: { workspaceFolders: true },
        window: { workDoneProgress: true },
      },
    });
    this.capabilities = result?.capabilities ?? {};
    this.notify("initialized", {});
  }

  /** Feed one raw message from the bridge into the protocol machinery. */
  handle(payload: string): void {
    if (this.dead || !runtimeEnabled) return;
    let msg: Json;
    try {
      msg = JSON.parse(payload);
    } catch {
      return;
    }
    if (msg.method !== undefined && msg.id !== undefined) {
      this.answer(msg);
    } else if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(String(msg.error.message ?? "LSP error")));
      else p.resolve(msg.result ?? null);
    } else if (msg.method === "textDocument/publishDiagnostics") {
      this.onDiagnostics?.(msg.params?.uri ?? "", msg.params?.diagnostics ?? []);
    }
    // Other notifications (progress, logs) are noise for a pane this size.
  }

  /**
   * Server→client requests. Everything gets a well-formed answer — a server left hanging on an
   * unanswered request (rust-analyzer's progress tokens, pyright's configuration pulls) can stall
   * its whole queue, which presents as "completions never arrive", not as an error.
   */
  private answer(msg: Json): void {
    let result: Json = null;
    if (msg.method === "workspace/configuration") {
      result = (msg.params?.items ?? []).map(() => null);
    } else if (msg.method === "workspace/applyEdit") {
      result = { applied: false };
    }
    void this.send({ jsonrpc: "2.0", id: msg.id, result });
  }

  request(method: string, params: Json): Promise<Json> {
    if (this.dead || !runtimeEnabled) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      void this.send({ jsonrpc: "2.0", id, method, params }).catch((e) => {
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });
  }

  notify(method: string, params: Json): void {
    if (this.dead || !runtimeEnabled) return;
    void this.send({ jsonrpc: "2.0", method, params });
  }

  private send(msg: Json): Promise<void> {
    if (this.dead || !runtimeEnabled) return Promise.resolve();
    return lspSend(this.key, JSON.stringify(msg));
  }

  // ---- document sync ---------------------------------------------------------------------------

  isOpen(uri: string): boolean {
    return this.openVersions.has(uri);
  }

  didOpen(uri: string, languageId: string, text: string): void {
    if (this.openVersions.has(uri)) return;
    this.openVersions.set(uri, 1);
    this.notify("textDocument/didOpen", {
      textDocument: { uri, languageId, version: 1, text },
    });
  }

  /** Debounced full-document sync — batches keystrokes; `flush` forces the send before requests. */
  scheduleChange(uri: string, text: string): void {
    this.changeText.set(uri, text);
    const timer = this.changeTimer.get(uri);
    if (timer) clearTimeout(timer);
    this.changeTimer.set(
      uri,
      setTimeout(() => this.flush(uri), 150),
    );
  }

  flush(uri: string): void {
    const timer = this.changeTimer.get(uri);
    if (timer) clearTimeout(timer);
    this.changeTimer.delete(uri);
    const text = this.changeText.get(uri);
    if (text === undefined || !this.openVersions.has(uri)) return;
    this.changeText.delete(uri);
    const version = (this.openVersions.get(uri) ?? 1) + 1;
    this.openVersions.set(uri, version);
    // A change event without a range is a full-document replace — legal under any sync kind.
    this.notify("textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
  }

  didSave(uri: string): void {
    if (!this.openVersions.has(uri)) return;
    this.flush(uri);
    this.notify("textDocument/didSave", { textDocument: { uri } });
  }

  dispose(): void {
    this.dead = true;
    LspClient.clients.delete(this.key);
    for (const timer of this.changeTimer.values()) clearTimeout(timer);
    this.changeTimer.clear();
    this.changeText.clear();
    this.openVersions.clear();
    for (const p of this.pending.values()) p.reject(new Error("LSP client disposed"));
    this.pending.clear();
  }
}

/** The live client whose project contains `path` and whose server speaks `lang`, if any. */
export function clientForPath(path: string, lang: string): LspClient | null {
  if (!runtimeEnabled) return null;
  for (const client of LspClient.clients.values()) {
    if (client.langs.includes(lang) && path.startsWith(`${client.cwd}/`)) return client;
  }
  return null;
}

// ---- client acquisition ------------------------------------------------------------------------

/** One in-flight/complete acquisition per (cwd, server group); null is a cached "not installed". */
const acquisitions = new Map<string, Promise<LspClient | null>>();
let listening = false;
type RuntimeEnabledListener = (workspace: string | undefined) => void;
const runtimeEnabledListeners = new Set<RuntimeEnabledListener>();

/** Replace the manifest-provided language routing table and reconnect mounted editor models. */
export function configurePluginLanguageServers(servers: PluginLanguageServerRegistration[]): void {
  const normalized = servers
    .map((server) => ({
      pluginId: server.pluginId,
      id: server.id,
      languages: [...new Set(server.languages.map((language) => language.toLocaleLowerCase()))].sort(),
    }))
    .sort((left, right) =>
      left.pluginId.localeCompare(right.pluginId) || left.id.localeCompare(right.id));
  const signature = JSON.stringify(normalized);
  if (signature === pluginServerSignature) return;
  pluginServerSignature = signature;
  const providers = new Map<string, number>();
  for (const server of normalized) {
    for (const language of server.languages) providers.set(language, (providers.get(language) ?? 0) + 1);
  }
  pluginServerGroups = Object.fromEntries(normalized.flatMap((server) => {
    const languages = server.languages.filter((language) => providers.get(language) === 1);
    return languages.length > 0 ? [[`plugin:${server.pluginId}:${server.id}`, languages]] : [];
  }));
  runtimeGeneration += 1;
  acquisitions.clear();
  for (const client of [...LspClient.clients.values()]) client.dispose();
  if (runtimeEnabled) {
    for (const listener of runtimeEnabledListeners) listener(undefined);
  }
}

/** Apply the active project component policy without ever calling the unloadable LSP commands. */
export function setLspRuntimeEnabled(enabled: boolean, workspace?: string): void {
  if (runtimeEnabled === enabled) return;
  runtimeEnabled = enabled;
  runtimeGeneration += 1;
  acquisitions.clear();
  if (!enabled) {
    for (const client of [...LspClient.clients.values()]) client.dispose();
    return;
  }
  for (const listener of runtimeEnabledListeners) listener(workspace);
}

export function isLspRuntimeEnabled(): boolean {
  return runtimeEnabled;
}

/** Reconnect mounted editor models after a suspended component is resumed. */
export function onLspRuntimeEnabled(listener: RuntimeEnabledListener): () => void {
  runtimeEnabledListeners.add(listener);
  return () => runtimeEnabledListeners.delete(listener);
}

async function ensureListeners(): Promise<void> {
  if (listening) return;
  listening = true;
  await onLspMessage(({ key, payload }) => LspClient.clients.get(key)?.handle(payload));
  await onLspExit((key) => {
    LspClient.clients.get(key)?.dispose();
    // Drop the acquisition cache lines that produced this client, so reopening a file respawns.
    for (const [k, v] of acquisitions) {
      void v.then((c) => {
        if (c?.key === key) acquisitions.delete(k);
      });
    }
  });
}

/**
 * The client serving `lang` under `cwd`, spawning the server on first ask. Resolves null when no
 * server binary is installed or the handshake failed — callers treat that as "no LSP here".
 */
export async function getClient(cwd: string, lang: string): Promise<LspClient | null> {
  if (!runtimeEnabled) return null;
  const group = groupOf(lang);
  if (!group) return null;
  const cacheKey = `${cwd}::${group}`;
  let acq = acquisitions.get(cacheKey);
  if (!acq) {
    const generation = runtimeGeneration;
    // Never cache a rejection: a null is "no LSP for now", a rejected promise would be forever.
    acq = (async () => {
      try {
        await ensureListeners();
        if (!runtimeEnabled || generation !== runtimeGeneration) return null;
        const key = await lspStart(cwd, lang);
        if (!key || !runtimeEnabled || generation !== runtimeGeneration) return null;
        const client = LspClient.clients.get(key) ?? new LspClient(key, cwd, serverGroups()[group]);
        return (await client.ready) ? client : null;
      } catch {
        return null;
      }
    })();
    acquisitions.set(cacheKey, acq);
  }
  return acq;
}
