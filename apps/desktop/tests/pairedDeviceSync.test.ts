import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BunDatabase } from "../src/electrobun/host/database";
import { DeviceSyncService } from "../src/electrobun/host/deviceSync";
import { PairedDeviceSyncRuntime } from "../src/electrobun/host/pairedDeviceSync";
import { BunRemoteServer } from "../src/electrobun/host/remote";

describe("paired-device sync over the production HTTP transport", () => {
  test("pairs two isolated instances, converges concurrent changes, rejects stale writes, and revokes access", async () => {
    const root = mkdtempSync(join(tmpdir(), "codetwo-paired-device-network-"));
    const serverDir = join(root, "server");
    const clientDir = join(root, "client");
    const serverDatabase = new BunDatabase(serverDir);
    const clientDatabase = new BunDatabase(clientDir);
    let serverRuntime = new PairedDeviceSyncRuntime(serverDatabase, serverDir);
    const clientRuntime = new PairedDeviceSyncRuntime(clientDatabase, clientDir);
    const clientService = new DeviceSyncService(clientDatabase, clientDir, () => {}, clientRuntime.transport);
    let remote = new BunRemoteServer(serverDir, async () => true, serverRuntime.server);

    try {
      const network = remote.start(0);
      expect(network.port).toBeGreaterThan(0);
      expect(network.protocols).toEqual(["c2", "t3", "legacy"]);
      const link = remote.pairingLink("loopback", "c2", 60);
      expect(link.url).toContain(`127.0.0.1:${network.port}/pair#token=`);

      const paired = await clientRuntime.pairDevice(link.url, "Client C2");
      expect(paired.device.direction).toBe("outgoing");
      expect(remote.devices()).toEqual([
        expect.objectContaining({ name: "Client C2", protocol: "c2" }),
      ]);
      await expect(clientRuntime.pairDevice(link.url, "Replay")).rejects.toThrow("invalid or expired pairing token");
      const replacementLink = remote.pairingLink("loopback", "c2", 60);
      await clientRuntime.pairDevice(replacementLink.url, "Client C2");
      expect(remote.devices()).toHaveLength(1);

      const clientState = JSON.parse(readFileSync(join(clientDir, "paired-device-sync.json"), "utf8")) as {
        outbound_peers: Array<{ bearer: string }>;
      };
      const rawBearer = clientState.outbound_peers[0]?.bearer;
      expect(rawBearer).toBeString();
      const serverState = readFileSync(join(serverDir, "remote-devices.json"), "utf8");
      expect(serverState).toContain("token_hash");
      expect(serverState).toContain('"network_enabled": true');
      expect(serverState).not.toContain(rawBearer!);
      expect(serverState).not.toContain(link.token);
      if (process.platform !== "win32") {
        expect(statSync(join(serverDir, "remote-devices.json")).mode & 0o777).toBe(0o600);
        expect(statSync(join(clientDir, "paired-device-sync.json")).mode & 0o777).toBe(0o600);
      }

      remote.shutdown();
      serverRuntime = new PairedDeviceSyncRuntime(serverDatabase, serverDir);
      remote = new BunRemoteServer(serverDir, async () => true, serverRuntime.server);
      expect(remote.restore()?.port).toBe(network.port);
      expect(remote.status()?.port).toBe(network.port);
      expect((await clientRuntime.transport.read()).replicas).toHaveLength(1);

      serverDatabase.addProject("/shared", "Shared");
      const session = serverDatabase.createSession({
        provider: "codex",
        model: null,
        cwd: "/shared",
        permissionMode: "ask",
        sandboxPolicy: "workspace_write",
      });
      const sessionId = String(session.id);
      serverDatabase.appendPart(sessionId, "user", { kind: "prompt", text: "server seed" }, "server seed");
      const memory = serverDatabase.addMemory("/shared", "constraint", "paired transport", true) as { id: string };

      expect(await clientService.setEnabled(true)).toMatchObject({ state: "ready", transport: "paired-devices" });
      expect(clientDatabase.listProjects()).toHaveLength(1);
      expect(clientDatabase.listSessions()).toHaveLength(1);
      expect(clientDatabase.listMemories("/shared", 10)).toHaveLength(1);

      const tieTimestamp = Date.now() + 1_000;
      const serverTie = serverDatabase.deviceSyncSnapshot("server-tie");
      serverTie.sessions[0] = { ...serverTie.sessions[0]!, title: "A title", updated_at: tieTimestamp };
      serverDatabase.importDeviceSyncDocument(serverTie);
      const clientTie = clientDatabase.deviceSyncSnapshot("client-tie");
      clientTie.sessions[0] = { ...clientTie.sessions[0]!, title: "Z title", updated_at: tieTimestamp };
      clientDatabase.importDeviceSyncDocument(clientTie);
      expect((await clientService.syncNow()).state).toBe("ready");
      expect(serverDatabase.deviceSyncSnapshot("server-check").sessions[0]?.title).toBe("Z title");
      expect(clientDatabase.deviceSyncSnapshot("client-check").sessions[0]?.title).toBe("Z title");

      serverDatabase.appendPart(sessionId, "agent", { kind: "text", text: "from server" }, "from server");
      clientDatabase.appendPart(sessionId, "agent", { kind: "text", text: "from client" }, "from client");
      expect((await clientService.syncNow()).state).toBe("ready");

      const serverTexts = serverDatabase.deviceSyncSnapshot("server-check").parts
        .map((part) => JSON.parse(part.part_json) as { text?: string })
        .map((part) => part.text);
      const clientTexts = clientDatabase.deviceSyncSnapshot("client-check").parts
        .map((part) => JSON.parse(part.part_json) as { text?: string })
        .map((part) => part.text);
      expect(serverTexts).toEqual(expect.arrayContaining(["server seed", "from server", "from client"]));
      expect(clientTexts).toEqual(expect.arrayContaining(["server seed", "from server", "from client"]));

      serverDatabase.deleteMemory(memory.id);
      expect((await clientService.syncNow()).state).toBe("ready");
      expect(clientDatabase.listMemories("/shared", 10)).toHaveLength(0);

      const stale = await clientRuntime.transport.read();
      serverDatabase.appendPart(sessionId, "agent", { kind: "text", text: "raced" }, "raced");
      expect(await clientRuntime.transport.write(
        clientDatabase.deviceSyncSnapshot("client-check"),
        stale.replicas,
      )).toEqual({ state: "conflict", conflicts: [stale.replicas[0]!.id] });

      const inbound = remote.devices().find((device) => device.protocol === "c2");
      expect(inbound).toBeDefined();
      expect(remote.revokeDevice(inbound!.id)).toBe(true);
      const revoked = await clientService.syncNow();
      expect(revoked.state).toBe("error");
      expect(revoked.message).toContain("revoked device credential");
    } finally {
      await clientService.setEnabled(false);
      await clientService.shutdown();
      remote.stop();
      clientDatabase.close();
      serverDatabase.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("does not report the paired transport as available before a device is configured", async () => {
    const root = mkdtempSync(join(tmpdir(), "codetwo-paired-device-empty-"));
    const database = new BunDatabase(root);
    const runtime = new PairedDeviceSyncRuntime(database, root);
    try {
      expect(await runtime.transport.probe()).toEqual({
        state: "unavailable",
        message: "Pair another C2 device in Device connections first.",
      });
    } finally {
      database.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
