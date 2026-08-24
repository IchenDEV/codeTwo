import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { BunDatabase } from "./database";

const HANDOFF_VERSION = 1;
const MAX_BUNDLE_BYTES = 256 * 1024 * 1024;
const MARKER_FILE = "codetwo-handoff.json";

interface UntrackedEntry {
  path: string;
  kind: "file" | "symlink";
  mode: number;
  data: string;
}

interface WorkspaceBundle {
  baseline: string;
  repositoryBundle: string;
  stagedPatch: string;
  worktreePatch: string;
  untracked: UntrackedEntry[];
  relativeCwd: string;
}

export interface PortableTaskHandoff {
  version: 1;
  id: string;
  epoch: number;
  sessionId: string;
  createdAt: string;
  session: Record<string, unknown>;
  parts: unknown[];
  sourceActivity: unknown;
  workspace: WorkspaceBundle;
  checksum: string;
}

export interface HandoffTransferInput {
  session: string;
  target_url: string;
  bearer: string;
  destination: string;
}

export interface HandoffPairingTransferInput {
  session: string;
  pairing_url: string;
  destination: string;
}

function command(cwd: string, executable: string, args: string[], input?: string): string {
  const result = spawnSync(executable, args, {
    cwd,
    input,
    encoding: "utf8",
    maxBuffer: MAX_BUNDLE_BYTES,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_LFS_SKIP_SMUDGE: "1" },
  });
  if (result.status !== 0) {
    throw new Error(`${executable} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  }
  return result.stdout;
}

function git(cwd: string, args: string[], input?: string): string {
  return command(cwd, "git", args, input);
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function portablePath(path: string): string {
  if (!path || path.includes("\0") || isAbsolute(path)) throw new Error(`unsafe handoff path: ${path}`);
  const normalized = path.split("/").join(sep);
  if (!inside(resolve("/handoff-root"), resolve("/handoff-root", normalized))) {
    throw new Error(`handoff path escapes the workspace: ${path}`);
  }
  return normalized;
}

function checksum(bundle: Omit<PortableTaskHandoff, "checksum">): string {
  return createHash("sha256").update(JSON.stringify(bundle)).digest("hex");
}

function verifyChecksum(bundle: PortableTaskHandoff): void {
  const { checksum: supplied, ...unsigned } = bundle;
  if (supplied !== checksum(unsigned)) throw new Error("task handoff checksum does not match its payload");
}

function captureWorkspace(cwd: string): WorkspaceBundle {
  const root = realpathSync(git(cwd, ["rev-parse", "--show-toplevel"]).trim());
  const baseline = git(root, ["rev-parse", "HEAD"]).trim();
  if (!/^[0-9a-f]{40,64}$/i.test(baseline)) throw new Error("workspace has no transferable Git baseline");
  const submodulePaths = git(root, ["ls-files", "-s"])
    .split("\n")
    .flatMap((line) => {
      const match = line.match(/^160000\s+[0-9a-f]+\s+\d+\t(.+)$/i);
      return match ? [match[1]] : [];
    });
  const porcelain = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const dirtySubmodule = submodulePaths.find((path) => porcelain.split("\n").some((line) => line.slice(3) === path));
  if (dirtySubmodule) throw new Error(`dirty submodule cannot be transferred losslessly: ${dirtySubmodule}`);

  const scratch = mkdtempSync(join(tmpdir(), "codetwo-handoff-capture-"));
  const repositoryPath = join(scratch, "repository.bundle");
  try {
    git(root, ["bundle", "create", repositoryPath, "HEAD"]);
    const repository = readFileSync(repositoryPath);
    const names = git(root, ["ls-files", "--others", "--exclude-standard", "-z"])
      .split("\0")
      .filter(Boolean);
    const untracked: UntrackedEntry[] = names.map((name) => {
      const path = portablePath(name);
      const source = resolve(root, path);
      if (!inside(root, source)) throw new Error(`untracked path escapes the workspace: ${name}`);
      const stat = lstatSync(source);
      if (stat.isSymbolicLink()) {
        return { path: name, kind: "symlink", mode: stat.mode & 0o777, data: readlinkSync(source) };
      }
      if (!stat.isFile()) throw new Error(`unsupported untracked workspace entry: ${name}`);
      return { path: name, kind: "file", mode: stat.mode & 0o777, data: readFileSync(source).toString("base64") };
    });
    return {
      baseline,
      repositoryBundle: repository.toString("base64"),
      stagedPatch: git(root, ["diff", "--cached", "--binary", "--full-index", baseline]),
      worktreePatch: git(root, ["diff", "--binary", "--full-index"]),
      untracked,
      relativeCwd: relative(root, realpathSync(resolve(cwd))) || ".",
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function markerPath(destination: string): string {
  return join(destination, ".git", MARKER_FILE);
}

function markerMatches(destination: string, handoff: PortableTaskHandoff): boolean {
  try {
    const marker = JSON.parse(readFileSync(markerPath(destination), "utf8")) as Record<string, unknown>;
    return marker.id === handoff.id && marker.checksum === handoff.checksum;
  } catch {
    return false;
  }
}

function applyWorkspace(handoff: PortableTaskHandoff, requestedDestination: string): string {
  const destination = resolve(requestedDestination);
  if (existsSync(destination)) {
    if (!markerMatches(destination, handoff)) throw new Error(`handoff destination already exists: ${destination}`);
    return resolve(destination, portablePath(handoff.workspace.relativeCwd));
  }
  mkdirSync(dirname(destination), { recursive: true });
  const scratch = mkdtempSync(join(tmpdir(), "codetwo-handoff-accept-"));
  const repositoryPath = join(scratch, "repository.bundle");
  const staging = join(dirname(destination), `.${basename(destination)}.codetwo-${handoff.id}`);
  if (existsSync(staging)) throw new Error(`handoff staging path already exists: ${staging}`);
  try {
    const repository = Buffer.from(handoff.workspace.repositoryBundle, "base64");
    if (repository.byteLength === 0 || repository.byteLength > MAX_BUNDLE_BYTES) {
      throw new Error("repository bundle is empty or too large");
    }
    writeFileSync(repositoryPath, repository, { mode: 0o600 });
    git(dirname(staging), ["clone", "--no-local", repositoryPath, staging]);
    git(staging, ["checkout", "--detach", handoff.workspace.baseline]);
    if (handoff.workspace.stagedPatch) {
      git(staging, ["apply", "--binary", "--index", "-"], handoff.workspace.stagedPatch);
    }
    if (handoff.workspace.worktreePatch) {
      git(staging, ["apply", "--binary", "-"], handoff.workspace.worktreePatch);
    }
    for (const entry of handoff.workspace.untracked) {
      const rel = portablePath(entry.path);
      const target = resolve(staging, rel);
      if (!inside(staging, target) || existsSync(target)) throw new Error(`unsafe or conflicting untracked path: ${entry.path}`);
      mkdirSync(dirname(target), { recursive: true });
      if (entry.kind === "symlink") {
        symlinkSync(entry.data, target);
      } else {
        const bytes = Buffer.from(entry.data, "base64");
        writeFileSync(target, bytes, { mode: entry.mode });
        chmodSync(target, entry.mode);
      }
    }
    const resumedCwd = resolve(staging, portablePath(handoff.workspace.relativeCwd));
    if (!existsSync(resumedCwd) || !lstatSync(resumedCwd).isDirectory()) {
      throw new Error("transferred session working directory does not exist in the restored workspace");
    }
    writeFileSync(markerPath(staging), `${JSON.stringify({ id: handoff.id, checksum: handoff.checksum })}\n`, { mode: 0o600 });
    renameSync(staging, destination);
    return resolve(destination, portablePath(handoff.workspace.relativeCwd));
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) throw new Error(`remote handoff failed (${response.status}): ${text || response.statusText}`);
  const value = text ? JSON.parse(text) : {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("remote handoff returned an invalid response");
  return value as Record<string, unknown>;
}

export class TaskHandoffManager {
  constructor(
    private readonly database: BunDatabase,
    private readonly quiesce: (sessionId: string) => Promise<unknown>,
  ) {}

  async prepare(sessionId: string): Promise<PortableTaskHandoff> {
    const sourceActivity = await this.quiesce(sessionId);
    const id = randomUUID();
    const prepared = this.database.prepareHandoff(sessionId, id);
    try {
      const unsigned = {
        version: HANDOFF_VERSION,
        id,
        epoch: prepared.epoch,
        sessionId,
        createdAt: new Date().toISOString(),
        session: prepared.session,
        parts: prepared.parts,
        sourceActivity,
        workspace: captureWorkspace(String(prepared.session.cwd)),
      } satisfies Omit<PortableTaskHandoff, "checksum">;
      return { ...unsigned, checksum: checksum(unsigned) };
    } catch (error) {
      this.database.rollbackSourceHandoff(sessionId, id, prepared.epoch);
      throw error;
    }
  }

  accept(handoff: PortableTaskHandoff, destination: string): { session: string; handoff: string; epoch: number } {
    if (handoff.version !== HANDOFF_VERSION) throw new Error(`unsupported handoff version: ${handoff.version}`);
    verifyChecksum(handoff);
    const cwd = applyWorkspace(handoff, destination);
    try {
      this.database.acceptHandoff({
        handoffId: handoff.id,
        epoch: handoff.epoch,
        session: handoff.session,
        parts: handoff.parts,
        cwd,
        context: {
          sourceActivity: handoff.sourceActivity,
          transcript: handoff.parts,
          transferredAt: handoff.createdAt,
        },
      });
      return { session: handoff.sessionId, handoff: handoff.id, epoch: handoff.epoch };
    } catch (error) {
      if (markerMatches(resolve(destination), handoff)) rmSync(resolve(destination), { recursive: true, force: true });
      throw error;
    }
  }

  activate(sessionId: string, handoffId: string, epoch: number): void {
    this.database.activateTargetHandoff(sessionId, handoffId, epoch);
  }

  rollbackTarget(sessionId: string, handoffId: string, epoch: number, destination: string): void {
    this.database.rollbackTargetHandoff(sessionId, handoffId, epoch);
    const target = resolve(destination);
    if (existsSync(target)) {
      const marker = JSON.parse(readFileSync(markerPath(target), "utf8")) as Record<string, unknown>;
      if (marker.id !== handoffId) throw new Error("refusing to remove a workspace owned by another handoff");
      rmSync(target, { recursive: true, force: true });
    }
  }

  async transfer(input: HandoffTransferInput): Promise<Record<string, unknown>> {
    const handoff = await this.prepare(input.session);
    const baseUrl = input.target_url.replace(/\/$/, "");
    const headers = {
      authorization: `Bearer ${input.bearer}`,
      "content-type": "application/json",
    };
    let accepted = false;
    try {
      const acceptedResponse = await responseJson(await fetch(`${baseUrl}/api/codetwo/handoffs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ handoff, destination: input.destination }),
      }));
      if (acceptedResponse.session !== handoff.sessionId || acceptedResponse.handoff !== handoff.id) {
        throw new Error("remote handoff acceptance did not match the prepared task");
      }
      accepted = true;
      this.database.commitSourceHandoff(handoff.sessionId, handoff.id, handoff.epoch);
      await responseJson(await fetch(`${baseUrl}/api/codetwo/handoffs/${encodeURIComponent(handoff.id)}/activate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ session: handoff.sessionId, epoch: handoff.epoch }),
      }));
      return {
        session: handoff.sessionId,
        handoff: handoff.id,
        epoch: handoff.epoch,
        destination: input.destination,
        state: "transferred",
      };
    } catch (error) {
      if (accepted) {
        try {
          await responseJson(await fetch(`${baseUrl}/api/codetwo/handoffs/${encodeURIComponent(handoff.id)}/rollback`, {
            method: "POST",
            headers,
            body: JSON.stringify({ session: handoff.sessionId, epoch: handoff.epoch, destination: input.destination }),
          }));
        } catch (rollbackError) {
          throw new Error(
            `handoff outcome is indeterminate; source remains fenced to prevent two writers: ${error instanceof Error ? error.message : String(error)}; target rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
          );
        }
      }
      this.database.rollbackSourceHandoff(handoff.sessionId, handoff.id, handoff.epoch);
      throw error;
    }
  }

  async transferPairing(input: HandoffPairingTransferInput): Promise<Record<string, unknown>> {
    let pairing: URL;
    try {
      pairing = new URL(input.pairing_url.trim());
    } catch {
      throw new Error("pairing URL is invalid");
    }
    if (pairing.protocol !== "http:" && pairing.protocol !== "https:") {
      throw new Error("pairing URL must use HTTP or HTTPS");
    }
    const token = new URLSearchParams(pairing.hash.slice(1)).get("token")
      ?? pairing.searchParams.get("token")
      ?? "";
    if (!token) throw new Error("pairing URL does not contain a token");
    const hostedTarget = pairing.searchParams.get("host");
    const base = hostedTarget ? new URL(hostedTarget) : new URL(pairing.origin);
    base.pathname = "/";
    base.search = "";
    base.hash = "";
    const baseUrl = base.toString().replace(/\/$/, "");
    const descriptor = await fetch(`${baseUrl}/.well-known/t3/environment`);
    if (!descriptor.ok) throw new Error(`target is not a compatible C2/T3 programming agent (${descriptor.status})`);
    const exchange = await responseJson(await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        subject_token: token,
        subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap",
        requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
        scope: "orchestration:operate",
        client_label: "C2 task transfer",
        client_device_type: "handoff",
        client_os: process.platform,
      }),
    }));
    const bearer = typeof exchange.access_token === "string" ? exchange.access_token : "";
    if (!bearer) throw new Error("target did not return a task-transfer credential");
    return this.transfer({
      session: input.session,
      target_url: baseUrl,
      bearer,
      destination: input.destination,
    });
  }
}
