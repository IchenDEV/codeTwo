import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DeviceSyncService,
  type DeviceSyncProbe,
  type DeviceSyncRead,
  type DeviceSyncReplica,
  type DeviceSyncTransport,
} from "../src/electrobun/host/deviceSync";
import type { DeviceSyncDocument } from "../src/electrobun/host/deviceSyncDocument";
import { BunDatabase } from "../src/electrobun/host/database";

class InMemoryReplicaTransport implements DeviceSyncTransport {
  readonly id = "memory";
  private document: DeviceSyncDocument | null = null;
  private revision = 0;

  async probe(): Promise<DeviceSyncProbe> {
    return { state: "ready" };
  }

  async read(): Promise<DeviceSyncRead> {
    return {
      replicas: [{
        id: "memory:shared",
        document: this.document ? structuredClone(this.document) : null,
        version: this.revision ? String(this.revision) : null,
      }],
    };
  }

  async write(
    document: DeviceSyncDocument,
    expected: DeviceSyncReplica[],
  ): Promise<{ state: "written" | "conflict"; conflicts?: string[] }> {
    const expectedVersion = expected.find((replica) => replica.id === "memory:shared")?.version ?? null;
    const currentVersion = this.revision ? String(this.revision) : null;
    if (expectedVersion !== currentVersion) {
      return { state: "conflict", conflicts: ["memory:shared"] };
    }
    this.document = structuredClone(document);
    this.revision += 1;
    return { state: "written" };
  }
}

class PairedReplicaTransport implements DeviceSyncTransport {
  readonly id = "paired-devices";
  written: DeviceSyncDocument | null = null;

  constructor(private readonly replicas: DeviceSyncReplica[]) {}

  async probe(): Promise<DeviceSyncProbe> {
    return { state: "ready" };
  }

  async read(): Promise<DeviceSyncRead> {
    return { replicas: structuredClone(this.replicas) };
  }

  async write(
    document: DeviceSyncDocument,
    _expected: DeviceSyncReplica[],
  ): Promise<{ state: "written" }> {
    this.written = structuredClone(document);
    return { state: "written" };
  }
}

function testDatabase(root: string, name: string): BunDatabase {
  return new BunDatabase(join(root, name));
}

describe("device sync", () => {
  test("reports a missing iCloud entitlement before the user opts in", async () => {
    const root = mkdtempSync(join(tmpdir(), "codetwo-device-sync-restricted-"));
    const database = testDatabase(root, "database");
    const transport: DeviceSyncTransport = {
      id: "icloud",
      probe: async () => ({ state: "restricted", message: "missing entitlement" }),
      read: async () => ({ replicas: [] }),
      write: async () => ({ state: "written" }),
    };
    const service = new DeviceSyncService(database, join(root, "database"), () => {}, transport);
    try {
      expect(await service.status()).toMatchObject({
        state: "restricted",
        enabled: false,
        available: false,
      });
    } finally {
      await service.shutdown();
      database.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("merges concurrent transcript additions and propagates memory deletion", async () => {
    const root = mkdtempSync(join(tmpdir(), "codetwo-device-sync-test-"));
    const transport = new InMemoryReplicaTransport();
    const first = testDatabase(root, "first");
    const second = testDatabase(root, "second");
    const events: string[] = [];
    const firstService = new DeviceSyncService(first, join(root, "first"), (event) => events.push(event.name), transport);
    const secondService = new DeviceSyncService(second, join(root, "second"), () => {}, transport);

    try {
      first.addProject("/workspace", "Workspace");
      const session = first.createSession({
        provider: "codex",
        model: null,
        cwd: "/workspace",
        permissionMode: "ask",
        sandboxPolicy: "workspace_write",
      });
      const sessionId = String(session.id);
      first.appendPart(sessionId, "user", { kind: "prompt", text: "hello" }, "hello");
      const memory = first.addMemory("/workspace", "constraint", "Use CloudKit private storage", true) as { id: string };

      expect((await firstService.setEnabled(true)).state).toBe("ready");
      expect((await secondService.setEnabled(true)).state).toBe("ready");
      expect(second.listProjects()).toHaveLength(1);
      expect(second.listSessions()).toHaveLength(1);
      expect(second.listMemories("/workspace", 10)).toHaveLength(1);

      first.appendPart(sessionId, "agent", { kind: "text", text: "from first" }, "from first");
      second.appendPart(sessionId, "agent", { kind: "text", text: "from second" }, "from second");
      expect((await secondService.syncNow()).state).toBe("ready");
      expect((await firstService.syncNow()).state).toBe("ready");

      const mergedParts = first.deviceSyncSnapshot("first-device").parts
        .filter((part) => part.session_id === sessionId)
        .map((part) => JSON.parse(part.part_json).text);
      expect(mergedParts).toEqual(expect.arrayContaining(["hello", "from first", "from second"]));
      expect(new Set(first.deviceSyncSnapshot("first-device").parts.map((part) => part.sync_id)).size).toBe(3);

      first.deleteMemory(memory.id);
      await firstService.syncNow();
      await secondService.syncNow();
      expect(second.listMemories("/workspace", 10)).toHaveLength(0);
      expect(events).toContain("device-sync-changed");
    } finally {
      await firstService.setEnabled(false);
      await secondService.setEnabled(false);
      await firstService.shutdown();
      await secondService.shutdown();
      first.close();
      second.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("merges several paired-device replicas through the same conflict engine", async () => {
    const root = mkdtempSync(join(tmpdir(), "codetwo-device-sync-paired-"));
    const local = testDatabase(root, "local");
    const firstPeer = testDatabase(root, "first-peer");
    const secondPeer = testDatabase(root, "second-peer");
    let service: DeviceSyncService | null = null;
    try {
      const firstSession = firstPeer.createSession({
        provider: "codex",
        model: null,
        cwd: "/first",
        permissionMode: "ask",
        sandboxPolicy: "workspace_write",
      });
      firstPeer.appendPart(String(firstSession.id), "user", { kind: "prompt", text: "first" }, "first");
      const secondSession = secondPeer.createSession({
        provider: "codex",
        model: null,
        cwd: "/second",
        permissionMode: "ask",
        sandboxPolicy: "workspace_write",
      });
      secondPeer.appendPart(String(secondSession.id), "user", { kind: "prompt", text: "second" }, "second");

      const transport = new PairedReplicaTransport([
        { id: "paired:first", document: firstPeer.deviceSyncSnapshot("first"), version: "4" },
        { id: "paired:second", document: secondPeer.deviceSyncSnapshot("second"), version: "7" },
      ]);
      service = new DeviceSyncService(local, join(root, "local"), () => {}, transport);

      expect(await service.setEnabled(true)).toMatchObject({ state: "ready", transport: "paired-devices" });
      expect(local.listSessions()).toHaveLength(2);
      expect(transport.written?.parts.map((part) => JSON.parse(part.part_json).text)).toEqual(
        expect.arrayContaining(["first", "second"]),
      );
    } finally {
      if (service) {
        await service.setEnabled(false);
        await service.shutdown();
      }
      local.close();
      firstPeer.close();
      secondPeer.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("keeps app-lifetime side chats out of the device snapshot", () => {
    const root = mkdtempSync(join(tmpdir(), "codetwo-device-sync-transient-"));
    const database = testDatabase(root, "database");
    try {
      const persistent = database.createSession({
        provider: "codex",
        model: null,
        cwd: "/workspace",
        permissionMode: "ask",
        sandboxPolicy: "workspace_write",
      });
      const transient = database.createSession({
        provider: "codex",
        model: null,
        cwd: "/workspace",
        permissionMode: "ask",
        sandboxPolicy: "workspace_write",
        transient: true,
      });
      database.appendPart(String(persistent.id), "user", { kind: "prompt", text: "keep" }, "keep");
      database.appendPart(String(transient.id), "user", { kind: "prompt", text: "discard" }, "discard");

      const snapshot = database.deviceSyncSnapshot("test-device");
      expect(snapshot.sessions.map((session) => session.id)).toEqual([persistent.id]);
      expect(snapshot.parts.map((part) => part.session_id)).toEqual([persistent.id]);
    } finally {
      database.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
