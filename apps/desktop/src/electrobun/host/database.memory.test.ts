import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BunDatabase } from "./database";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("memory management database", () => {
  test("keeps correction lineage, redacts evidence by default, and never deletes source sessions", () => {
    const directory = mkdtempSync(join(tmpdir(), "codetwo-memory-"));
    temporaryDirectories.push(directory);
    const database = new BunDatabase(directory);
    const projectPath = "/work";
    const session = database.createSession({
      provider: "codex",
      cwd: projectPath,
      permissionMode: "ask",
      sandboxPolicy: "workspace_write",
    }) as { id: string };
    const partSeq = database.appendPart(session.id, "user", {
      kind: "text",
      text: "Always use Bun. Authorization: Bearer secret-value",
    });

    const direct = new Database(database.path, { strict: true });
    const automaticId = crypto.randomUUID();
    const now = Date.now();
    direct
      .query(
        `INSERT INTO memories(
         id,project_path,session_id,layer,category,content,keywords_json,confidence,
         sources_json,pinned,active,created_at,updated_at,access_count,origin
       ) VALUES(?,?,?,'L1','constraint','Always use Bun','[]',0.9,?,0,1,?,?,0,'automatic')`,
      )
      .run(
        automaticId,
        projectPath,
        session.id,
        JSON.stringify([{ session_id: session.id, part_seq: partSeq }]),
        now,
        now,
      );
    direct.close(false);

    const correction = database.correctMemory(
      automaticId,
      "constraint",
      "Never use Bun",
    ) as {
      id: string;
      origin: string;
      supersedes_id: string;
      pinned: boolean;
    };
    expect(correction.origin).toBe("user_correction");
    expect(correction.supersedes_id).toBe(automaticId);
    expect(correction.pinned).toBe(true);

    const managed = database.listManagedMemories(projectPath, 20) as Array<{
      id: string;
      active: boolean;
      forgotten_at: number | null;
    }>;
    const original = managed.find((record) => record.id === automaticId);
    expect(original?.active).toBe(false);
    expect(original?.forgotten_at).not.toBeNull();

    const redacted = database.memoryEvidence(correction.id, false) as Array<{
      excerpt: string;
      redacted: boolean;
    }>;
    const revealed = database.memoryEvidence(correction.id, true) as Array<{
      excerpt: string;
      redacted: boolean;
    }>;
    expect(redacted[0]?.excerpt).not.toContain("secret-value");
    expect(redacted[0]?.redacted).toBe(true);
    expect(revealed[0]?.excerpt).toContain("secret-value");

    database.deleteMemory(correction.id);
    expect(database.getSession(session.id)?.id).toBe(session.id);
    expect(
      (
        database.listManagedMemories(projectPath, 20) as Array<{ id: string }>
      ).some((record) => record.id === correction.id),
    ).toBe(false);
    database.close();
  });

  test("stores only validated per-project policy values", () => {
    const directory = mkdtempSync(join(tmpdir(), "codetwo-memory-policy-"));
    temporaryDirectories.push(directory);
    const database = new BunDatabase(directory);
    database.setMemoryProjectPolicy("/work", {
      capture: "deny",
      inject: "allow",
      include_external_context: "inherit",
    });
    expect(database.memoryProjectPolicy("/work")).toEqual({
      project_path: "/work",
      capture: "deny",
      inject: "allow",
      include_external_context: "inherit",
    });
    expect(() =>
      database.setMemoryProjectPolicy("/work", { capture: "sometimes" }),
    ).toThrow();
    database.close();
  });
});
