import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";

import { BunDatabase } from "./database";
import type {
  DeviceSyncProbe,
  DeviceSyncRead,
  DeviceSyncReplica,
  DeviceSyncTransport,
} from "./deviceSync";
import {
  parseDeviceSyncDocument,
  type DeviceSyncDocument,
} from "./deviceSyncDocument";
import type { RemoteDeviceSyncServer } from "./remote";

const MAX_SYNC_DOCUMENT_BYTES = 64 * 1024 * 1024;
const PEER_REQUEST_TIMEOUT_MS = 15_000;
const API_ROOT = "/api/device-sync/v1";

interface OutboundPeer {
  id: string;
  name: string;
  base_url: string;
  bearer: string;
  created_at: number;
  last_seen: number;
}

interface PersistedState {
  server_id: string;
  server_name: string;
  outbound_peers: OutboundPeer[];
}

export interface PairedSyncDevice {
  id: string;
  name: string;
  created_at: number;
  last_seen: number;
  direction: "outgoing";
  protocol: "c2";
}

export interface PairDeviceResult {
  device: PairedSyncDevice;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function atomicPrivateJson(path: string, value: unknown): void {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    chmodSync(directory, 0o700);
  } catch {
    // Windows does not implement Unix permission bits.
  }
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(temporary, 0o600);
  } catch {
    // Windows does not implement Unix permission bits.
  }
  renameSync(temporary, path);
}

function snapshotVersion(document: DeviceSyncDocument): string {
  const stable = {
    schema_version: document.schema_version,
    projects: [...document.projects].sort((left, right) => left.path.localeCompare(right.path)),
    sessions: [...document.sessions].sort((left, right) => left.id.localeCompare(right.id)),
    parts: [...document.parts].sort((left, right) => left.sync_id.localeCompare(right.sync_id)),
    memories: [...document.memories].sort((left, right) => left.id.localeCompare(right.id)),
    tombstones: [...document.tombstones].sort((left, right) =>
      left.entity.localeCompare(right.entity) || left.id.localeCompare(right.id)),
  };
  return hash(JSON.stringify(stable));
}

function requestSignal(): AbortSignal {
  return AbortSignal.timeout(PEER_REQUEST_TIMEOUT_MS);
}

async function limitedResponseJson(response: Response): Promise<Record<string, unknown>> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_SYNC_DOCUMENT_BYTES) {
    throw new Error("the paired device returned a sync document that is too large");
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_SYNC_DOCUMENT_BYTES) {
    throw new Error("the paired device returned a sync document that is too large");
  }
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("the paired device returned an invalid JSON response");
  }
  return value as Record<string, unknown>;
}

function validOutboundPeers(value: unknown): OutboundPeer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const peer = candidate as Partial<OutboundPeer>;
    if (
      typeof peer.id !== "string"
      || typeof peer.name !== "string"
      || typeof peer.base_url !== "string"
      || typeof peer.bearer !== "string"
      || typeof peer.created_at !== "number"
      || typeof peer.last_seen !== "number"
    ) return [];
    try {
      const url = new URL(peer.base_url);
      if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== peer.base_url) return [];
    } catch {
      return [];
    }
    return [{
      id: peer.id,
      name: peer.name,
      base_url: peer.base_url,
      bearer: peer.bearer,
      created_at: peer.created_at,
      last_seen: peer.last_seen,
    }];
  });
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const detail = (await response.text()).trim();
  return new Error(detail || `${fallback} (${response.status})`);
}

export class PairedDeviceSyncRuntime {
  readonly transport: DeviceSyncTransport;
  readonly server: RemoteDeviceSyncServer;
  private readonly statePath: string;
  private state: PersistedState;

  constructor(
    private readonly database: BunDatabase,
    dataDir: string,
    private readonly onImported: (counts: {
      projects: number;
      sessions: number;
      parts: number;
      memories: number;
    }) => void = () => {},
  ) {
    this.statePath = join(dataDir, "paired-device-sync.json");
    this.state = this.loadState();
    this.saveState();
    this.transport = new PairedDeviceSyncTransport(this);
    this.server = {
      identity: () => ({ id: this.state.server_id, name: this.state.server_name }),
      snapshot: () => this.snapshot(),
      writeSnapshot: (body) => this.writeSnapshot(body),
    };
  }

  devices(): PairedSyncDevice[] {
    return this.state.outbound_peers.map((peer) => ({
      id: `out:${peer.id}`,
      name: peer.name,
      created_at: peer.created_at,
      last_seen: peer.last_seen,
      direction: "outgoing",
      protocol: "c2",
    }));
  }

  revokeDevice(id: string): boolean {
    const rawId = id.startsWith("out:") ? id.slice("out:".length) : id;
    const updated = this.state.outbound_peers.filter((peer) => peer.id !== rawId);
    if (updated.length === this.state.outbound_peers.length) return false;
    this.state.outbound_peers = updated;
    this.saveState();
    return true;
  }

  async pairDevice(pairingUrl: string, deviceName = hostname() || "C2 device"): Promise<PairDeviceResult> {
    let url: URL;
    try {
      url = new URL(pairingUrl.trim());
    } catch {
      throw new Error("enter a valid C2 pairing link");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("C2 pairing links must use HTTP or HTTPS");
    }
    const token = new URLSearchParams(url.hash.slice(1)).get("token");
    if (!token) throw new Error("the pairing link does not contain a token");
    const baseUrl = url.origin;
    const response = await fetch(`${baseUrl}${API_ROOT}/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        device_name: deviceName,
        device_id: this.state.server_id,
      }),
      signal: requestSignal(),
    });
    if (!response.ok) throw await responseError(response, "could not pair the C2 device");
    const paired = await limitedResponseJson(response) as {
      server_id?: unknown;
      server_name?: unknown;
      device_id?: unknown;
      bearer?: unknown;
    };
    if (
      typeof paired.server_id !== "string"
      || typeof paired.server_name !== "string"
      || typeof paired.device_id !== "string"
      || typeof paired.bearer !== "string"
    ) throw new Error("the paired C2 device returned an invalid response");
    const now = nowSeconds();
    const previous = this.state.outbound_peers.find((candidate) => candidate.id === paired.server_id);
    const peer: OutboundPeer = {
      id: paired.server_id,
      name: paired.server_name,
      base_url: baseUrl,
      bearer: paired.bearer,
      created_at: previous?.created_at ?? now,
      last_seen: now,
    };
    this.state.outbound_peers = [
      ...this.state.outbound_peers.filter((candidate) => candidate.id !== peer.id),
      peer,
    ];
    this.saveState();
    return { device: this.devices().find((candidate) => candidate.id === `out:${peer.id}`)! };
  }

  configuredPeers(): OutboundPeer[] {
    return this.state.outbound_peers.map((peer) => ({ ...peer }));
  }

  markPeerSeen(id: string): void {
    const peer = this.state.outbound_peers.find((candidate) => candidate.id === id);
    if (!peer) return;
    peer.last_seen = nowSeconds();
    this.saveState();
  }

  private snapshot(): { replica: DeviceSyncReplica } {
    const document = this.database.deviceSyncSnapshot(this.state.server_id);
    return {
      replica: {
        id: `paired:${this.state.server_id}`,
        document,
        version: snapshotVersion(document),
      },
    };
  }

  private writeSnapshot(body: Record<string, unknown>): { state: "written" | "conflict"; version: string } {
    if (typeof body.expected_version !== "string") throw new Error("expected_version must be a string");
    const document = parseDeviceSyncDocument(body.document);
    const current = this.database.deviceSyncSnapshot(this.state.server_id);
    const currentVersion = snapshotVersion(current);
    if (body.expected_version !== currentVersion) return { state: "conflict", version: currentVersion };
    const imported = this.database.importDeviceSyncDocument(document);
    this.onImported(imported);
    const written = this.database.deviceSyncSnapshot(this.state.server_id);
    return { state: "written", version: snapshotVersion(written) };
  }

  private loadState(): PersistedState {
    try {
      const value = JSON.parse(readFileSync(this.statePath, "utf8")) as Partial<PersistedState>;
      try {
        chmodSync(this.statePath, 0o600);
      } catch {
        // Windows does not implement Unix permission bits.
      }
      return {
        server_id: typeof value.server_id === "string" && value.server_id ? value.server_id : crypto.randomUUID(),
        server_name: typeof value.server_name === "string" && value.server_name
          ? value.server_name
          : hostname() || "C2 device",
        outbound_peers: validOutboundPeers(value.outbound_peers),
      };
    } catch {
      return {
        server_id: crypto.randomUUID(),
        server_name: hostname() || "C2 device",
        outbound_peers: [],
      };
    }
  }

  private saveState(): void {
    atomicPrivateJson(this.statePath, this.state);
  }
}

class PairedDeviceSyncTransport implements DeviceSyncTransport {
  readonly id = "paired-devices";

  constructor(private readonly runtime: PairedDeviceSyncRuntime) {}

  async probe(): Promise<DeviceSyncProbe> {
    return this.runtime.configuredPeers().length > 0
      ? { state: "ready" }
      : { state: "unavailable", message: "Pair another C2 device in Device connections first." };
  }

  async read(): Promise<DeviceSyncRead> {
    const peers = this.runtime.configuredPeers();
    if (peers.length === 0) return { replicas: [] };
    const results = await Promise.allSettled(peers.map(async (peer) => {
      const response = await fetch(`${peer.base_url}${API_ROOT}/snapshot`, {
        headers: { authorization: `Bearer ${peer.bearer}` },
        signal: requestSignal(),
      });
      if (!response.ok) throw await responseError(response, `could not read ${peer.name}`);
      const value = await limitedResponseJson(response) as { replica?: unknown };
      if (!value.replica || typeof value.replica !== "object") {
        throw new Error(`${peer.name} returned an invalid sync snapshot`);
      }
      const replica = value.replica as Partial<DeviceSyncReplica>;
      if (replica.id !== `paired:${peer.id}` || typeof replica.version !== "string") {
        throw new Error(`${peer.name} returned an invalid replica identity`);
      }
      const document = parseDeviceSyncDocument(replica.document);
      this.runtime.markPeerSeen(peer.id);
      return { id: replica.id, version: replica.version, document } satisfies DeviceSyncReplica;
    }));
    const replicas = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    if (replicas.length === 0) {
      const reasons = results.flatMap((result) => result.status === "rejected" ? [String(result.reason)] : []);
      throw new Error(reasons.join("; ") || "No paired C2 device is reachable.");
    }
    return { replicas };
  }

  async write(document: DeviceSyncDocument, expected: DeviceSyncReplica[]): Promise<{
    state: "written" | "conflict";
    conflicts?: string[];
  }> {
    const peers = new Map(this.runtime.configuredPeers().map((peer) => [`paired:${peer.id}`, peer]));
    const results = await Promise.all(expected.map(async (replica) => {
      const peer = peers.get(replica.id);
      if (!peer) return { id: replica.id, state: "skipped" as const };
      const response = await fetch(`${peer.base_url}${API_ROOT}/snapshot`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${peer.bearer}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ document, expected_version: replica.version }),
        signal: requestSignal(),
      });
      if (response.status === 409) return { id: replica.id, state: "conflict" as const };
      if (!response.ok) throw await responseError(response, `could not write ${peer.name}`);
      this.runtime.markPeerSeen(peer.id);
      return { id: replica.id, state: "written" as const };
    }));
    const conflicts = results.filter((result) => result.state === "conflict").map((result) => result.id);
    return conflicts.length > 0 ? { state: "conflict", conflicts } : { state: "written" };
  }
}
