import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktop = resolve(import.meta.dir, "..");
const read = (path: string) => readFileSync(resolve(desktop, path), "utf8");

describe("T3 mobile remote contract", () => {
  test("keeps the renderer-to-Tauri pairing protocol explicit and defaults to T3", () => {
    const bridge = read("src/bridge.ts");
    const remotePlugin = read("src-tauri/src/remote.rs");

    expect(bridge).toContain('export type RemoteClientProtocol = "t3" | "legacy"');
    expect(bridge).toContain('clientProtocol: RemoteClientProtocol = "t3"');
    expect(bridge).toContain("client_protocol: clientProtocol,");
    expect(remotePlugin).toContain('args.client_protocol.as_deref().unwrap_or("t3")');
    expect(remotePlugin).toContain('"t3" => handle.auth.issue_t3_pairing_token(ttl)');
    expect(remotePlugin).toContain('"legacy" => handle.auth.issue_pairing_token(ttl)');
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
