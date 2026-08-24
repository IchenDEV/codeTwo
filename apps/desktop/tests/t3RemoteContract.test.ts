import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktop = resolve(import.meta.dir, "..");
const read = (path: string) => readFileSync(resolve(desktop, path), "utf8");

describe("Electrobun remote contract", () => {
  test("adds C2 sync to the production Bun remote without replacing T3 or browser control", () => {
    const bridge = read("src/bridge.ts");
    const host = read("src/electrobun/host/index.ts");
    const remoteHost = read("src/electrobun/host/remote.ts");

    expect(bridge).toContain('export type RemoteClientProtocol = "c2" | "t3" | "legacy"');
    expect(bridge).toContain('clientProtocol: RemoteClientProtocol = "c2"');
    expect(bridge).toContain("client_protocol: clientProtocol,");
    expect(host).toContain('this.register("remote.start", (args) => this.remote.start(');
    expect(host).toContain('this.register("remote.pair_device", async (args) => {');
    expect(remoteHost).toContain('protocols: this.deviceSync ? ["c2", "t3", "legacy"] : ["t3", "legacy"]');
    expect(remoteHost).toContain('url.pathname === `${DEVICE_SYNC_API_ROOT}/snapshot`');
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
    const remoteHost = read("src/electrobun/host/remote.ts");

    expect(remoteHost).toContain('id: endpointId("lan", name, address)');
    expect(remoteHost).toContain('id: endpointId("tailnet", name, address)');
    expect(remote).toContain('endpoint.id.startsWith("tailnet-")');
    expect(remote).toContain("Verify this candidate in Tailscale");
  });
});
