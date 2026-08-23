import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BunDatabase } from "./database";

const temporaryDirectories: string[] = [];

function databaseFixture(): { directory: string; database: BunDatabase } {
  const directory = mkdtempSync(join(tmpdir(), "codetwo-session-lifecycle-"));
  temporaryDirectories.push(directory);
  return { directory, database: new BunDatabase(directory) };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("session lifecycle database", () => {
  test("keeps side chats out of history, previews, and search", () => {
    const { database } = databaseFixture();
    const durable = database.createSession({
      provider: "codex",
      model: null,
      cwd: "/workspace",
      permissionMode: "ask",
      sandboxPolicy: "workspace_write",
    });
    const sideChat = database.createSession({
      provider: "codex",
      model: null,
      cwd: "/workspace",
      permissionMode: "ask",
      sandboxPolicy: "workspace_write",
      transient: true,
    });
    const durableId = String(durable.id);
    const sideChatId = String(sideChat.id);
    database.appendPart(durableId, "user", {
      kind: "prompt",
      text: "durable search phrase",
    }, "durable search phrase");
    database.appendPart(sideChatId, "user", {
      kind: "prompt",
      text: "temporary search phrase",
    }, "temporary search phrase");

    expect(database.listSessions(false)).toEqual([
      expect.objectContaining({ id: durableId, transient: false }),
    ]);
    expect(database.sessionPreviews()).toEqual([
      [durableId, "durable search phrase"],
    ]);
    expect(database.searchSessions("search phrase", 20)).toEqual([
      expect.objectContaining({ session_id: durableId }),
    ]);
    expect(database.deleteTransientSession(durableId)).toBe(false);
    expect(database.getSession(sideChatId)).toMatchObject({ transient: true });
    database.close();
  });

  test("purges abandoned side chats when the database reopens", () => {
    const { directory, database } = databaseFixture();
    const durable = database.createSession({
      provider: "codex",
      model: null,
      cwd: "/workspace",
      permissionMode: "ask",
      sandboxPolicy: "workspace_write",
    });
    const sideChat = database.createSession({
      provider: "codex",
      model: null,
      cwd: "/workspace",
      permissionMode: "ask",
      sandboxPolicy: "workspace_write",
      transient: true,
    });
    const durableId = String(durable.id);
    const sideChatId = String(sideChat.id);
    database.appendPart(sideChatId, "user", {
      kind: "prompt",
      text: "temporary",
    });
    database.close();

    const reopened = new BunDatabase(directory);
    expect(reopened.getSession(sideChatId)).toBeNull();
    expect(reopened.getSession(durableId)).toMatchObject({ transient: false });
    reopened.close();
  });
});
