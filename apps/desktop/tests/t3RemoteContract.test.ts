import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktop = resolve(import.meta.dir, "..");
const read = (path: string) => readFileSync(resolve(desktop, path), "utf8");

describe("Electrobun remote contract", () => {
  test("routes browser pairing into the live Bun remote service", () => {
    const bridge = read("src/bridge.ts");
    const host = read("src/electrobun/host/index.ts");

    expect(bridge).toContain('export type RemoteClientProtocol = "t3" | "legacy"');
    expect(bridge).toContain('clientProtocol: RemoteClientProtocol = "legacy"');
    expect(bridge).toContain("client_protocol: clientProtocol,");
    expect(host).toContain('this.register("remote.start", (args) => this.remote.start(');
    expect(host).toContain('this.register("remote.pairing_link", (args) => this.remote.pairingLink(');
  });

  test("presents both the T3 Mobile and browser clients supported by the Electrobun runtime", () => {
    const remote = read("src/remote/Remote.tsx");

    expect(remote).toContain("T3 Code mobile");
    expect(remote).toContain("Browser remote");
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
