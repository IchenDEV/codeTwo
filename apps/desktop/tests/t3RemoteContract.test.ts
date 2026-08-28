import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktop = resolve(import.meta.dir, "..");
const read = (path: string) => readFileSync(resolve(desktop, path), "utf8");

describe("Rust Plugin Kernel remote contract", () => {
  test("keeps C2 sync, T3, and browser pairing explicit end to end", () => {
    const bridge = read("src/bridge.ts");
    const remotePlugin = read("src-host/src/remote.rs");
    const deviceSyncPlugin = read("src-host/src/device_sync.rs");
    const server = read("../../crates/server/src/lib.rs");

    expect(bridge).toContain('export type RemoteClientProtocol = "c2" | "t3" | "legacy"');
    expect(bridge).toContain('clientProtocol: RemoteClientProtocol = "c2"');
    expect(bridge).toContain("client_protocol: clientProtocol,");
    expect(remotePlugin).toContain('args.client_protocol.as_deref().unwrap_or("c2")');
    expect(remotePlugin).toContain('"c2" if service.device_sync.is_some() => auth.issue_c2_pairing_token(ttl)');
    expect(remotePlugin).toContain('"t3" => auth.issue_t3_pairing_token(ttl)');
    expect(remotePlugin).toContain('"legacy" => auth.issue_pairing_token(ttl)');
    expect(remotePlugin).toContain('ctx.command("remote.pair_device"');
    expect(deviceSyncPlugin).toContain('ctx.command("device_sync.sync_now"');
    expect(server).toContain('"/api/device-sync/v1/snapshot"');
  });

  test("routes task transfer through the Rust handoff plugin and native agent", () => {
    const bridge = read("src/bridge.ts");
    const handoff = read("../../crates/plugins/src/app/plugins/handoff.rs");
    const agent = read("../../crates/server/src/bin/codetwo-agent.rs");

    expect(bridge).toContain('call<TaskHandoffResult>("handoff.transfer_pairing"');
    expect(handoff).toContain('ctx.command("handoff.transfer_pairing"');
    expect(agent).toContain("bind_and_serve_with_canvas(");
  });

  test("presents every protocol supported by the live remote server", () => {
    const remote = read("src/remote/Remote.tsx");

    expect(remote).toContain('return status.protocols?.length ? status.protocols : ["t3", "legacy"]');
    expect(remote).toContain('if (protocol === "t3") return "T3 Code mobile"');
    expect(remote).toContain('return "Browser remote"');
    expect(remote).toContain("remotePairingLink(endpointId ?? undefined, requestedProtocol)");
    expect(remote).toContain("pairRemoteDevice(pairingUrl)");
  });

  test("reuses the remote server's physical LAN and Tailscale endpoints for C2 sync", () => {
    const remote = read("src/remote/Remote.tsx");
    const server = read("../../crates/server/src/lib.rs");

    expect(server).toContain('id: format!("lan-{interface}-{}"');
    expect(server).toContain('id: format!("tailnet-{interface}-{}"');
    expect(remote).toContain('endpoint.id.startsWith("tailnet-")');
    expect(remote).toContain("Verify this candidate in Tailscale");
  });
});
