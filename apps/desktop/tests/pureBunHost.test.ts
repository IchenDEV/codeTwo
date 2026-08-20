import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PureBunHost } from "../src/electrobun/host";
import type { DesktopEvent } from "../src/electrobun/rpc";

function fixture(): { dataDir: string; workspace: string; events: DesktopEvent[]; host: PureBunHost } {
  const dataDir = mkdtempSync(join(tmpdir(), "codetwo-bun-data-"));
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "codetwo-bun-workspace-")));
  const events: DesktopEvent[] = [];
  return {
    dataDir,
    workspace,
    events,
    host: new PureBunHost(dataDir, (event) => events.push(event)),
  };
}

async function dispose(value: ReturnType<typeof fixture>): Promise<void> {
  await value.host.shutdown();
  rmSync(value.dataDir, { recursive: true, force: true });
  rmSync(value.workspace, { recursive: true, force: true });
}

function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString();
}

describe("pure Bun desktop host", () => {
  test("persists projects and sessions while confining filesystem access", async () => {
    const value = fixture();
    try {
      await value.host.call("projects.add", { path: value.workspace }, null);
      const projects = await value.host.call("projects.list", null, null) as { path: string }[];
      expect(projects.map((project) => project.path)).toEqual([value.workspace]);

      await value.host.call(
        "workspace.write_text",
        { cwd: value.workspace, path: "notes/hello.txt", content: "hello from Bun" },
        value.workspace,
      );
      expect(await value.host.call(
        "workspace.read_text",
        { cwd: value.workspace, path: "notes/hello.txt" },
        value.workspace,
      )).toBe("hello from Bun");
      await expect(value.host.call(
        "workspace.read_text",
        { cwd: value.workspace, path: "../outside.txt" },
        value.workspace,
      )).rejects.toThrow("path escapes workspace");

      await value.host.call(
        "engine.new_session",
        {
          cwd: value.workspace,
          provider: "codex",
          initial_policy: { mode: "ask", sandbox: "workspace_write" },
        },
        value.workspace,
      );
      const sessions = await value.host.call("sessions.list", null, null) as { provider: string; cwd: string }[];
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({ provider: "codex", cwd: value.workspace });
      expect(value.events.some((event) => event.name === "engine-event")).toBe(true);

      await expect(value.host.call("canvas.create_draft", {}, value.workspace)).rejects.toThrow(
        "has not migrated canvas persistence",
      );
    } finally {
      await dispose(value);
    }
  });

  test("runs an interactive shell on Bun's native PTY", async () => {
    if (process.platform === "win32") return;
    const value = fixture();
    try {
      await value.host.call(
        "terminal.spawn",
        { id: "trial", cwd: value.workspace, rows: 24, cols: 80 },
        value.workspace,
      );
      await Bun.sleep(100);
      await value.host.call(
        "terminal.write",
        { id: "trial", data: "echo C2_PURE_BUN_PTY_OK\r" },
        value.workspace,
      );
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const dump = await value.host.call("terminal.dump", { id: "trial" }, value.workspace);
        if (String(dump).includes("C2_PURE_BUN_PTY_OK")) break;
        await Bun.sleep(25);
      }
      expect(await value.host.call("terminal.dump", { id: "trial" }, value.workspace)).toContain(
        "C2_PURE_BUN_PTY_OK",
      );
      await value.host.call(
        "terminal.resize",
        { id: "trial", rows: 36, cols: 100 },
        value.workspace,
      );
    } finally {
      await dispose(value);
    }
  });

  test("keeps staged, unstaged, combined diff, and checkpoint semantics distinct", async () => {
    const value = fixture();
    try {
      git(value.workspace, "init", "--initial-branch=main");
      git(value.workspace, "config", "user.name", "C2 Test");
      git(value.workspace, "config", "user.email", "c2-test@example.invalid");
      await value.host.call(
        "workspace.write_text",
        { cwd: value.workspace, path: "tracked.txt", content: "base\n" },
        value.workspace,
      );
      git(value.workspace, "add", "tracked.txt");
      git(value.workspace, "commit", "-m", "initial");

      await value.host.call(
        "workspace.write_text",
        { cwd: value.workspace, path: "tracked.txt", content: "base\nstaged\n" },
        value.workspace,
      );
      await value.host.call(
        "git.stage",
        { cwd: value.workspace, paths: ["tracked.txt"] },
        value.workspace,
      );
      await value.host.call(
        "workspace.write_text",
        { cwd: value.workspace, path: "tracked.txt", content: "base\nstaged\nworking\n" },
        value.workspace,
      );

      const staged = await value.host.call(
        "git.diff",
        { cwd: value.workspace, path: null, scope: "staged" },
        value.workspace,
      ) as { text: string; files: number };
      const unstaged = await value.host.call(
        "git.diff",
        { cwd: value.workspace, path: null, scope: "unstaged" },
        value.workspace,
      ) as { text: string; files: number };
      const combined = await value.host.call(
        "git.diff",
        { cwd: value.workspace, path: null, scope: "all" },
        value.workspace,
      ) as { text: string; files: number };

      expect(staged.text).toContain("+staged");
      expect(staged.text).not.toContain("+working");
      expect(staged.files).toBe(1);
      expect(unstaged.text).toContain("+working");
      expect(unstaged.files).toBe(1);
      expect(combined.text).toContain("+staged");
      expect(combined.text).toContain("+working");
      expect(combined.files).toBe(1);

      const status = await value.host.call("git.status", { cwd: value.workspace }, value.workspace) as {
        files: { path: string; staged: boolean; unstaged: boolean }[];
      };
      expect(status.files).toContainEqual(expect.objectContaining({
        path: "tracked.txt",
        staged: true,
        unstaged: true,
      }));
      expect(await value.host.call("git.diff_stat", { cwd: value.workspace }, value.workspace)).toMatchObject({
        added: 2,
        deleted: 0,
        files: 1,
      });

      const checkpoint = await value.host.call(
        "git.checkpoint",
        { cwd: value.workspace, message: "before mutation" },
        value.workspace,
      ) as { commit: string };
      expect(checkpoint.commit).toMatch(/^[0-9a-f]{40,64}$/);
      await value.host.call(
        "workspace.write_text",
        { cwd: value.workspace, path: "tracked.txt", content: "mutated\n" },
        value.workspace,
      );
      await value.host.call(
        "git.revert",
        { cwd: value.workspace, commit: checkpoint.commit },
        value.workspace,
      );
      expect(readFileSync(join(value.workspace, "tracked.txt"), "utf8")).toBe("base\nstaged\nworking\n");
    } finally {
      await dispose(value);
    }
  });
});
