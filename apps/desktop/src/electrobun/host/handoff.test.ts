import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BunDatabase } from "./database";
import { TaskHandoffManager } from "./handoff";
import { BunRemoteServer, type RemoteHostCall } from "./remote";

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

function temporaryDirectory(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString();
}

describe("task handoff", () => {
  test("moves the durable session and exact dirty Git workspace to one active target", async () => {
    const sourceRoot = temporaryDirectory("codetwo-handoff-source-");
    git(sourceRoot, "init", "-q");
    git(sourceRoot, "config", "user.email", "test@codetwo.local");
    git(sourceRoot, "config", "user.name", "C2 Test");
    writeFileSync(join(sourceRoot, "tracked.txt"), "base\n");
    git(sourceRoot, "add", "tracked.txt");
    git(sourceRoot, "commit", "-qm", "baseline");
    writeFileSync(join(sourceRoot, "tracked.txt"), "staged\n");
    git(sourceRoot, "add", "tracked.txt");
    writeFileSync(join(sourceRoot, "tracked.txt"), "staged\nunstaged\n");
    writeFileSync(join(sourceRoot, "untracked.bin"), Buffer.from([0, 1, 2, 255]));
    symlinkSync("tracked.txt", join(sourceRoot, "untracked-link"));
    const sourceStatus = git(sourceRoot, "status", "--porcelain=v1", "--untracked-files=all");

    const sourceData = temporaryDirectory("codetwo-handoff-source-data-");
    const targetData = temporaryDirectory("codetwo-handoff-target-data-");
    const targetParent = temporaryDirectory("codetwo-handoff-target-workspace-");
    const destination = join(targetParent, "restored-project");
    const sourceDatabase = new BunDatabase(sourceData);
    const targetDatabase = new BunDatabase(targetData);
    cleanups.push(() => sourceDatabase.close());
    cleanups.push(() => targetDatabase.close());
    const session = sourceDatabase.createSession({
      provider: "codex",
      model: "gpt-5.6",
      cwd: sourceRoot,
      permissionMode: "ask",
      sandboxPolicy: "workspace_write",
    });
    const sessionId = String(session.id);
    sourceDatabase.appendPart(sessionId, "user", { kind: "prompt", text: "Continue this task", display: "Continue this task" });
    sourceDatabase.appendPart(sessionId, "agent", { kind: "text", text: "Work in progress" });

    const source = new TaskHandoffManager(sourceDatabase, async () => ({
      revision: 4,
      state: { kind: "running", turn_id: "turn-1" },
    }));
    const target = new TaskHandoffManager(targetDatabase, async () => ({ revision: 0, state: { kind: "idle" } }));
    const call: RemoteHostCall = async (name, args) => {
      if (name === "handoff.accept") return target.accept(args.handoff as never, String(args.destination));
      if (name === "handoff.activate") {
        target.activate(String(args.session), String(args.handoff), Number(args.epoch));
        return true;
      }
      if (name === "handoff.rollback_target") {
        target.rollbackTarget(String(args.session), String(args.handoff), Number(args.epoch), String(args.destination));
        return true;
      }
      if (name === "workspace.default_cwd") return targetParent;
      if (name === "projects.list" || name === "sessions.list" || name === "providers.list") return [];
      throw new Error(`unexpected host call: ${name}`);
    };
    const remote = new BunRemoteServer(targetData, call);
    remote.start(0);
    cleanups.push(() => {
      remote.stop();
    });
    const pairingUrl = remote.pairingLink("loopback", "t3", 60).url;

    const result = await source.transferPairing({
      session: sessionId,
      pairing_url: pairingUrl,
      destination,
    });
    expect(result).toMatchObject({ session: sessionId, destination, state: "transferred" });
    expect(remote.devices()).toEqual([]);
    expect(() => sourceDatabase.assertSessionActive(sessionId)).toThrow("fenced by a task handoff");
    expect(sourceDatabase.getSession(sessionId)).toMatchObject({ handoff_state: "transferred" });
    expect(() => targetDatabase.assertSessionActive(sessionId)).not.toThrow();
    expect(targetDatabase.getSession(sessionId)).toMatchObject({
      id: sessionId,
      cwd: destination,
      handoff_state: "active",
      handoff_context: {
        sourceActivity: { revision: 4, state: { kind: "running", turn_id: "turn-1" } },
        transcript: [
          expect.objectContaining({ role: "user" }),
          expect.objectContaining({ role: "agent" }),
        ],
      },
    });
    expect(git(destination, "status", "--porcelain=v1", "--untracked-files=all")).toBe(sourceStatus);
    expect(readFileSync(join(destination, "tracked.txt"), "utf8")).toBe("staged\nunstaged\n");
    expect([...readFileSync(join(destination, "untracked.bin"))]).toEqual([0, 1, 2, 255]);
    expect(readFileSync(join(destination, "untracked-link"), "utf8")).toBe("staged\nunstaged\n");
    expect((targetDatabase.transcriptPage(sessionId, null, 50) as { entries: unknown[] }).entries).toHaveLength(2);
  }, 30_000);
});
