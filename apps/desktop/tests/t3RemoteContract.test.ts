import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktop = resolve(import.meta.dir, "..");
const read = (path: string) => readFileSync(resolve(desktop, path), "utf8");

describe("T3 mobile remote contract", () => {
  test("keeps the renderer pairing protocol explicit and fails closed in the Bun trial", () => {
    const bridge = read("src/bridge.ts");
    const host = read("src/electrobun/host/index.ts");

    expect(bridge).toContain('export type RemoteClientProtocol = "t3" | "legacy"');
    expect(bridge).toContain('clientProtocol: RemoteClientProtocol = "t3"');
    expect(bridge).toContain("client_protocol: clientProtocol,");
    expect(host).toContain('this.register("remote.start", () => this.unsupported("remote.start", "remote server"))');
    expect(host).toContain('this.register("remote.pairing_link", () => null)');
  });

  test("exposes T3 and legacy clients without conflating their pairing codes", () => {
    const remote = read("src/remote/Remote.tsx");

    expect(remote).toContain('<SelectItem value="t3">T3 Code mobile</SelectItem>');
    expect(remote).toContain('<SelectItem value="legacy">C2 browser</SelectItem>');
    expect(remote).toContain("remotePairingLink(endpointId ?? undefined, protocol)");
  });

  test("treats physical LAN and Tailscale as distinct phone-reachable targets", () => {
    const remote = read("src/remote/Remote.tsx");

    expect(remote).toContain('endpoint.id.startsWith("lan-")');
    expect(remote).toContain('endpoint.id.startsWith("tailnet-")');
    expect(remote).toContain("Best-effort 100.64/10 match");
    expect(remote).toContain("Verify this address in Tailscale");
  });
});
