import {
  accessSync,
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { DesktopEvent } from "../rpc";

const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_BINARY_BYTES = 24 * 1024 * 1024;
const MAX_COMMAND_BYTES = 2 * 1024 * 1024;

function pathInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function canonicalRoot(cwd: string): string {
  const root = realpathSync(cwd);
  if (!statSync(root).isDirectory()) throw new Error(`workspace is not a directory: ${cwd}`);
  return root;
}

export function workspacePath(cwd: string, path: string, forWrite = false): string {
  const root = canonicalRoot(cwd);
  const candidate = resolve(root, path || ".");
  if (!pathInside(root, candidate)) throw new Error(`path escapes workspace: ${path}`);
  const existing = forWrite && !exists(candidate) ? nearestExisting(dirname(candidate)) : candidate;
  const canonical = realpathSync(existing);
  if (!pathInside(root, canonical)) throw new Error(`path resolves outside workspace: ${path}`);
  return candidate;
}

function nearestExisting(path: string): string {
  let current = path;
  while (!exists(current)) {
    const parent = dirname(current);
    if (parent === current) throw new Error(`no existing parent for ${path}`);
    current = parent;
  }
  return current;
}

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

export function augmentGuiPath(): void {
  const home = process.env.HOME ?? "";
  const fallbacks = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/opt/local/bin",
    join(home, ".local/bin"),
    join(home, ".cargo/bin"),
    join(home, ".opencode/bin"),
  ];
  const current = (process.env.PATH ?? "").split(":").filter(Boolean);
  for (const entry of fallbacks) {
    if (exists(entry) && !current.includes(entry)) current.push(entry);
  }
  process.env.PATH = current.join(":");
}

export function which(command: string): string | null {
  if (command.includes("/") || command.includes("\\")) {
    try {
      accessSync(command, constants.X_OK);
      return command;
    } catch {
      return null;
    }
  }
  for (const directory of (process.env.PATH ?? "").split(":")) {
    if (!directory) continue;
    const candidate = join(directory, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep searching.
    }
  }
  return null;
}

export function listDir(cwd: string, path: string): unknown[] {
  const directory = workspacePath(cwd, path);
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== ".git")
    .map((entry) => ({
      name: entry.name,
      path: path && path !== "." ? join(path, entry.name) : entry.name,
      is_dir: entry.isDirectory(),
    }))
    .sort((left, right) => Number(right.is_dir) - Number(left.is_dir) || left.name.localeCompare(right.name));
}

export function listFiles(cwd: string, query: string, limit: number): string[] {
  const root = canonicalRoot(cwd);
  const needle = query.trim().toLocaleLowerCase();
  const output: string[] = [];
  const visit = (directory: string): void => {
    if (output.length >= limit) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (output.length >= limit) return;
      if ([".git", "node_modules", "target", "dist", "build"].includes(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else {
        const rel = relative(root, absolute);
        if (!needle || rel.toLocaleLowerCase().includes(needle)) output.push(rel);
      }
    }
  };
  visit(root);
  return output;
}

export function createFile(cwd: string, path: string): void {
  const target = workspacePath(cwd, path, true);
  if (exists(target)) throw new Error(`path already exists: ${path}`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, "", { flag: "wx" });
}

export function createDir(cwd: string, path: string): void {
  const target = workspacePath(cwd, path, true);
  if (exists(target)) throw new Error(`path already exists: ${path}`);
  mkdirSync(target, { recursive: false });
}

export function readText(cwd: string, path: string): string {
  const target = workspacePath(cwd, path);
  const size = statSync(target).size;
  if (size > MAX_TEXT_BYTES) throw new Error(`text file is too large: ${path}`);
  const bytes = readFileSync(target);
  if (bytes.includes(0)) throw new Error(`file appears to be binary: ${path}`);
  return bytes.toString("utf8");
}

export function readBinary(cwd: string, path: string): number[] {
  const target = workspacePath(cwd, path);
  const size = statSync(target).size;
  if (size > MAX_BINARY_BYTES) throw new Error(`binary file is too large: ${path}`);
  return Array.from(readFileSync(target));
}

export function writeText(cwd: string, path: string, content: string): void {
  const target = workspacePath(cwd, path, true);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

export function renamePath(cwd: string, from: string, to: string): void {
  const source = workspacePath(cwd, from);
  const target = workspacePath(cwd, to, true);
  if (exists(target)) throw new Error(`destination already exists: ${to}`);
  mkdirSync(dirname(target), { recursive: true });
  renameSync(source, target);
}

export function copyPath(cwd: string, from: string, to: string): void {
  const source = workspacePath(cwd, from);
  const target = workspacePath(cwd, to, true);
  if (exists(target)) throw new Error(`destination already exists: ${to}`);
  if (statSync(source).isDirectory()) throw new Error("directory copies are not supported by the pure Bun host");
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target, constants.COPYFILE_EXCL);
}

export function deletePath(cwd: string, path: string): void {
  const target = workspacePath(cwd, path);
  if (target === canonicalRoot(cwd)) throw new Error("refusing to delete the workspace root");
  rmSync(target, { recursive: true, force: false });
}

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runProcess(
  command: string[],
  cwd?: string,
  timeoutMs = 30_000,
  env?: Record<string, string>,
): Promise<ProcessResult> {
  const child = Bun.spawn(command, {
    cwd,
    env: { ...Bun.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => child.kill(), timeoutMs);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return {
      stdout: stdout.slice(0, MAX_COMMAND_BYTES),
      stderr: stderr.slice(0, MAX_COMMAND_BYTES),
      exitCode,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function git(cwd: string, args: string[], acceptFailure = false): Promise<string> {
  const result = await runProcess(["git", ...args], cwd);
  if (result.exitCode !== 0 && !acceptFailure) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args[0]} failed`);
  }
  return result.stdout;
}

export async function gitIsRepo(cwd: string): Promise<boolean> {
  return (await runProcess(["git", "rev-parse", "--is-inside-work-tree"], cwd)).exitCode === 0;
}

function statusName(code: string): string {
  const value = code.trim();
  if (value === "??") return "untracked";
  if (value.includes("R")) return "renamed";
  if (value.includes("A")) return "added";
  if (value.includes("D")) return "deleted";
  if (value.includes("U")) return "conflicted";
  return "modified";
}

export async function gitStatus(cwd: string): Promise<unknown> {
  if (!(await gitIsRepo(cwd))) {
    return { is_repo: false, branch: "", ahead: 0, behind: 0, files: [] };
  }
  const raw = await git(cwd, ["status", "--porcelain=v1", "--branch", "-z"]);
  const records = raw.split("\0").filter(Boolean);
  const branchLine = records.shift() ?? "## HEAD";
  const branchMatch = /^## ([^.\s]+)(?:\.\.\.[^\s]+)?(?: \[(.*)])?/.exec(branchLine);
  const tracking = branchMatch?.[2] ?? "";
  const ahead = Number(/ahead (\d+)/.exec(tracking)?.[1] ?? 0);
  const behind = Number(/behind (\d+)/.exec(tracking)?.[1] ?? 0);
  const files: unknown[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const code = record.slice(0, 2);
    const path = record.slice(3);
    let originalPath: string | null = null;
    if (code.includes("R") && records[index + 1]) originalPath = records[++index];
    files.push({
      path,
      original_path: originalPath,
      staged: code[0] !== " " && code[0] !== "?",
      unstaged: code[1] !== " ",
      state: statusName(code),
      staged_state: code[0] !== " " && code[0] !== "?" ? statusName(code[0]) : null,
      unstaged_state: code[1] !== " " ? statusName(code[1]) : null,
    });
  }
  return {
    is_repo: true,
    branch: branchMatch?.[1] ?? "HEAD",
    ahead,
    behind,
    files,
  };
}

export async function gitDiff(
  cwd: string,
  path: string | null,
  scope: "all" | "staged" | "unstaged",
  since?: string,
): Promise<unknown> {
  const args = ["diff", "--no-ext-diff", "--no-color"];
  if (scope === "staged") args.push("--cached");
  if (since) args.push(since);
  else if (scope === "all") {
    const head = await runProcess(["git", "rev-parse", "--verify", "HEAD"], cwd);
    if (head.exitCode === 0) args.push("HEAD");
    else args.push("--cached");
  }
  if (path) args.push("--", path);
  const value = await git(cwd, args);
  const encoded = new TextEncoder().encode(value);
  const truncated = encoded.byteLength > MAX_COMMAND_BYTES;
  const text = truncated ? new TextDecoder().decode(encoded.slice(0, MAX_COMMAND_BYTES)) : value;
  const fileArgs = args.filter((arg) => arg !== "--no-ext-diff" && arg !== "--no-color");
  fileArgs.splice(1, 0, "--name-only");
  const files = await git(cwd, fileArgs);
  return {
    text,
    truncated,
    truncation_reason: truncated ? "byte_limit" : null,
    returned_bytes: new TextEncoder().encode(text).byteLength,
    files: files.split("\n").filter(Boolean).length,
  };
}

export async function gitDiffStat(cwd: string): Promise<unknown> {
  const head = await runProcess(["git", "rev-parse", "--verify", "HEAD"], cwd);
  const output = await git(cwd, ["diff", "--numstat", ...(head.exitCode === 0 ? ["HEAD"] : ["--cached"])]);
  let added = 0;
  let deleted = 0;
  let files = 0;
  for (const line of output.split("\n")) {
    if (!line) continue;
    const [a, d] = line.split("\t");
    added += Number(a) || 0;
    deleted += Number(d) || 0;
    files += 1;
  }
  return { added, deleted, files, truncated: false, truncation_reason: null };
}

export async function gitStage(cwd: string, paths: string[]): Promise<void> {
  if (paths.length > 0) await git(cwd, ["add", "--", ...paths]);
}

export async function gitUnstage(cwd: string, paths: string[]): Promise<void> {
  if (paths.length > 0) await git(cwd, ["restore", "--staged", "--", ...paths]);
}

export async function gitCheckpoint(cwd: string, message: string): Promise<unknown> {
  const commit = (await git(cwd, ["stash", "create", message], true)).trim();
  if (!commit) return null;
  const id = crypto.randomUUID();
  const refname = `refs/codetwo/checkpoints/${id}`;
  await git(cwd, ["update-ref", refname, commit]);
  return { id, refname, commit, message };
}

export async function gitCheckpoints(cwd: string): Promise<unknown[]> {
  const output = await git(
    cwd,
    ["for-each-ref", "--format=%(refname)%09%(objectname)%09%(subject)", "refs/codetwo/checkpoints"],
    true,
  );
  return output.split("\n").filter(Boolean).map((line) => {
    const [refname, commit, message] = line.split("\t");
    const segments = refname.split("/");
    return { id: segments[segments.length - 1], refname, commit, message };
  });
}

export async function gitSourceControl(cwd: string): Promise<unknown> {
  if (!(await gitIsRepo(cwd))) return null;
  const remote = (await git(cwd, ["remote", "get-url", "origin"], true)).trim();
  if (!remote) return null;
  const host = remote.match(/(?:@|https?:\/\/)([^/:]+)/)?.[1] ?? "";
  const provider = host.includes("github")
    ? "github"
    : host.includes("gitlab")
      ? "gitlab"
      : host.includes("bitbucket")
        ? "bitbucket"
        : host.includes("dev.azure") || host.includes("visualstudio")
          ? "azure-devops"
          : "unknown";
  const webUrl = remote
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\.git$/, "");
  const requiredCli = provider === "github" ? "gh" : provider === "gitlab" ? "glab" : null;
  return {
    remote_name: "origin",
    provider,
    provider_name: provider,
    host,
    web_url: webUrl,
    change_request_label: provider === "gitlab" ? "MR" : provider === "github" ? "PR" : "change request",
    create_change_request_supported: provider === "github" || provider === "gitlab",
    required_cli: requiredCli,
    required_cli_available: requiredCli ? which(requiredCli) !== null : false,
  };
}

export async function worktreeBaselines(cwd: string): Promise<unknown[]> {
  const resolveRef = async (kind: "current" | "origin_default", ref: string): Promise<unknown> => {
    const result = await runProcess(["git", "rev-parse", "--verify", `${ref}^{commit}`], cwd);
    if (result.exitCode !== 0) {
      return { kind, resolved: null, unavailable_reason: result.stderr.trim() || "Git ref is unavailable" };
    }
    return {
      kind,
      resolved: { kind, reference: ref, sha: result.stdout.trim() },
      unavailable_reason: null,
    };
  };
  let defaultRef = "origin/HEAD";
  const symbolic = await runProcess(["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd);
  if (symbolic.exitCode === 0 && symbolic.stdout.trim()) defaultRef = symbolic.stdout.trim();
  return Promise.all([resolveRef("current", "HEAD"), resolveRef("origin_default", defaultRef)]);
}

interface TerminalSession {
  process: Bun.Subprocess;
  terminal: Bun.Terminal;
  output: string;
  projectPath: string | null;
}

export class TerminalManager {
  private readonly sessions = new Map<string, TerminalSession>();

  constructor(private readonly emit: (event: DesktopEvent) => void) {}

  async spawn(args: Record<string, unknown>, projectPath: string | null): Promise<unknown> {
    const id = String(args.id ?? "");
    if (!id) throw new Error("terminal id is required");
    const existing = this.sessions.get(id);
    if (existing) return { created: false, restore: existing.output };
    const cwd = typeof args.cwd === "string" ? args.cwd : process.env.HOME ?? process.cwd();
    const shell = process.env.SHELL || "/bin/zsh";
    const tmuxSession = typeof args.tmux_session === "string" ? args.tmux_session.trim() : "";
    if (tmuxSession && !/^[A-Za-z0-9_.-]+$/.test(tmuxSession)) {
      throw new Error("tmux session names may contain only letters, numbers, dot, underscore, and dash");
    }
    if (tmuxSession && !which("tmux")) throw new Error("tmux is not installed");
    const command = tmuxSession
      ? ["tmux", "new-session", "-A", "-s", tmuxSession]
      : [shell, "-l"];
    const decoder = new TextDecoder();
    let pendingOutput = "";
    const terminal = new Bun.Terminal({
      cols: Math.max(1, Math.floor(typeof args.cols === "number" ? args.cols : 80)),
      rows: Math.max(1, Math.floor(typeof args.rows === "number" ? args.rows : 24)),
      name: "xterm-256color",
      data: (_terminal, bytes) => {
        const data = decoder.decode(bytes, { stream: true });
        const session = this.sessions.get(id);
        if (!session) {
          pendingOutput += data;
          return;
        }
        this.appendTerminalOutput(id, session, data);
      },
    });
    const child = Bun.spawn(command, {
      cwd,
      env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
      terminal,
    });
    const session: TerminalSession = { process: child, terminal, output: "", projectPath };
    this.sessions.set(id, session);
    if (pendingOutput) {
      this.appendTerminalOutput(id, session, pendingOutput);
      pendingOutput = "";
    }
    this.emit({ name: "pty-title", payload: { id, title: basename(cwd), project_path: projectPath } });
    void child.exited.then(() => {
      if (this.sessions.get(id) !== session) return;
      this.sessions.delete(id);
      terminal.close();
      this.emit({ name: "pty-exit", payload: { id, project_path: projectPath } });
    });
    return { created: true, restore: "" };
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`terminal not found: ${id}`);
    session.terminal.write(data);
  }

  resize(id: string, rows: number, cols: number): void {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`terminal not found: ${id}`);
    session.terminal.resize(Math.max(1, Math.floor(cols)), Math.max(1, Math.floor(rows)));
  }

  dump(id: string): string {
    return this.sessions.get(id)?.output ?? "";
  }

  kill(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    session.process.kill();
    session.terminal.close();
  }

  setRuntimeEnabled(enabled: boolean, projectPath: string | null): void {
    if (enabled) return;
    for (const [id, session] of this.sessions) {
      if (projectPath && session.projectPath !== projectPath) continue;
      this.kill(id);
    }
  }

  shutdown(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }

  private appendTerminalOutput(id: string, session: TerminalSession, data: string): void {
    session.output = (session.output + data).slice(-1024 * 1024);
    this.emit({ name: "pty-output", payload: { id, data, project_path: session.projectPath } });
  }
}

interface LspSession {
  key: string;
  cwd: string;
  pluginId: string | null;
  process: Bun.Subprocess<"pipe", "pipe", "ignore">;
}

const LSP_COMMANDS: Record<string, string[]> = {
  rust: ["rust-analyzer"],
  python: ["pyright-langserver", "--stdio"],
  typescript: ["typescript-language-server", "--stdio"],
  javascript: ["typescript-language-server", "--stdio"],
  go: ["gopls"],
  c: ["clangd"],
  cpp: ["clangd"],
  vue: ["vue-language-server", "--stdio"],
  svelte: ["svelteserver", "--stdio"],
  ruby: ["ruby-lsp"],
  php: ["intelephense", "--stdio"],
  yaml: ["yaml-language-server", "--stdio"],
};

export interface LspServerLaunch {
  id: string;
  pluginId: string;
  command: string[];
  env: Record<string, string>;
}

export class LspManager {
  private readonly sessions = new Map<string, LspSession>();

  constructor(private readonly emit: (event: DesktopEvent) => void) {}

  start(cwd: string, language: string, launch: LspServerLaunch | null = null): string | null {
    const command = launch?.command ?? LSP_COMMANDS[language.toLocaleLowerCase()];
    if (!command || command.length === 0 || (!launch && !which(command[0]))) return null;
    const canonicalCwd = realpathSync(cwd);
    const key = `${launch?.id ?? command[0]}:${canonicalCwd}`;
    if (this.sessions.has(key)) return key;
    const child = Bun.spawn(command, {
      cwd,
      env: { ...process.env, ...(launch?.env ?? {}) },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
    });
    const session = { key, cwd: canonicalCwd, pluginId: launch?.pluginId ?? null, process: child };
    this.sessions.set(key, session);
    void this.read(session, child.stdout);
    void child.exited.then(() => {
      if (this.sessions.get(key) !== session) return;
      this.sessions.delete(key);
      this.emit({ name: "lsp-exit", payload: key });
    });
    return key;
  }

  send(key: string, payload: string): void {
    const session = this.sessions.get(key);
    if (!session) throw new Error(`language server not found: ${key}`);
    const bytes = new TextEncoder().encode(payload);
    session.process.stdin.write(`Content-Length: ${bytes.byteLength}\r\n\r\n`);
    session.process.stdin.write(bytes);
    session.process.stdin.flush();
  }

  setRuntimeEnabled(enabled: boolean, projectPath: string | null): void {
    if (enabled) return;
    for (const [key, session] of this.sessions) {
      if (projectPath && !pathInside(realpathSync(projectPath), session.cwd)) continue;
      this.sessions.delete(key);
      session.process.kill();
    }
  }

  invalidateRouting(): void {
    for (const [key, session] of this.sessions) {
      this.sessions.delete(key);
      session.process.kill();
    }
  }

  shutdown(): void {
    for (const session of this.sessions.values()) session.process.kill();
    this.sessions.clear();
  }

  private async read(session: LspSession, stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    let buffer = new Uint8Array();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const combined = new Uint8Array(buffer.byteLength + value.byteLength);
      combined.set(buffer);
      combined.set(value, buffer.byteLength);
      buffer = combined;
      while (true) {
        const headerEnd = findBytes(buffer, [13, 10, 13, 10]);
        if (headerEnd < 0) break;
        const header = new TextDecoder().decode(buffer.slice(0, headerEnd));
        const length = Number(/Content-Length:\s*(\d+)/i.exec(header)?.[1] ?? -1);
        const bodyStart = headerEnd + 4;
        if (length < 0 || buffer.byteLength < bodyStart + length) break;
        const payload = new TextDecoder().decode(buffer.slice(bodyStart, bodyStart + length));
        buffer = buffer.slice(bodyStart + length);
        this.emit({ name: "lsp-message", payload: { key: session.key, payload } });
      }
    }
  }
}

function findBytes(haystack: Uint8Array, needle: number[]): number {
  outer: for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

export function fileLanguage(path: string): string {
  return extname(path).slice(1).toLocaleLowerCase();
}
