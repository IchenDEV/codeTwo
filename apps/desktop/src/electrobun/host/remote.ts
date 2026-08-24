import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";

import remoteClientHtml from "../../../../../crates/server/src/client.html" with { type: "text" };
import xtermCss from "../../../../../crates/server/assets/term/xterm.css" with { type: "text" };
import xtermJs from "../../../../../crates/server/assets/term/xterm.min.js" with { type: "text" };
import xtermFitJs from "../../../../../crates/server/assets/term/addon-fit.min.js" with { type: "text" };

import type { DesktopEvent } from "../rpc";
import { T3MobileAdapter, type T3Socket } from "./t3Mobile";

const DEFAULT_PORT = 4599;
const DEFAULT_PAIRING_TTL_SECONDS = 15 * 60;
const WS_TICKET_TTL_SECONDS = 5 * 60;
const MAX_JSON_BODY_BYTES = 16 * 1024;
const MAX_HANDOFF_BODY_BYTES = 384 * 1024 * 1024;
const MAX_SOCKET_MESSAGE_BYTES = 2 * 1024 * 1024;
const DEVICE_FILE = "remote-devices.json";
const T3_ACCESS_TTL_SECONDS = 30 * 24 * 60 * 60;
const T3_STANDARD_SCOPES = [
  "orchestration:read",
  "orchestration:operate",
  "terminal:operate",
  "review:write",
  "relay:read",
] as const;
const T3_TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const T3_BOOTSTRAP_TOKEN_TYPE = "urn:t3:params:oauth:token-type:environment-bootstrap";
const T3_ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";
const ELECTROBUN_REMOTE_CLIENT_HTML = (remoteClientHtml as unknown as string)
  .replace(" (or scan\n        the QR code)", "");

export type RemoteHostCall = (
  name: string,
  args: Record<string, unknown>,
) => unknown | Promise<unknown>;

export interface RemoteEndpoint {
  id: string;
  label: string;
  url: string;
  qr_shareable: boolean;
}

export interface RemoteStatus {
  port: number;
  endpoints: RemoteEndpoint[];
}

export interface RemotePairingLink {
  endpoint_id: string;
  url: string;
  token: string;
  expires_in: number;
  qr_svg: string;
}

export interface RemoteDeviceInfo {
  id: string;
  name: string;
  created_at: number;
  last_seen: number;
}

interface PersistedDevice extends RemoteDeviceInfo {
  token_hash: string;
  expires_at?: number | null;
  scopes?: string[];
  protocol?: "legacy" | "t3" | null;
  ephemeral_handoff?: boolean;
}

interface PersistedAuth {
  devices: PersistedDevice[];
}

interface PairingToken {
  expiresAt: number;
  protocol: "legacy" | "t3";
}

interface SocketTicket {
  deviceId: string;
  expiresAt: number;
  protocol: "legacy" | "t3";
  scopes: string[];
}

type RemoteSocketData =
  | { kind: "control"; deviceId: string }
  | { kind: "t3"; deviceId: string; scopes: string[] }
  | { kind: "terminal"; deviceId: string; terminalId: string | null; attached: boolean };

type RemoteSocket = Bun.ServerWebSocket<RemoteSocketData>;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}

function secret(): string {
  return randomBytes(32).toString("hex");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashesEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected a JSON object");
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

function terminalId(value: unknown): string {
  const id = typeof value === "string" ? value : "";
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(id)) throw new Error("invalid terminal id");
  return id;
}

function effectiveProtocol(device: PersistedDevice): "legacy" | "t3" {
  if (device.protocol === "legacy" || device.protocol === "t3") return device.protocol;
  return device.expires_at != null || (device.scopes?.length ?? 0) > 0 ? "t3" : "legacy";
}

function isTailnetAddress(address: string): boolean {
  const octets = address.split(".").map(Number);
  return octets.length === 4
    && octets[0] === 100
    && octets[1] >= 64
    && octets[1] <= 127
    && address !== "100.100.100.100";
}

function isPhysicalInterface(name: string): boolean {
  const normalized = name.toLowerCase();
  return ["en", "eth", "em", "wlan", "wlp", "wlx", "bond", "team", "usb", "rndis"]
    .some((prefix) => normalized.startsWith(prefix));
}

function endpointId(kind: "lan" | "tailnet", name: string, address: string): string {
  return `${kind}-${name.replace(/[^A-Za-z0-9_.-]/g, "-")}-${address.replaceAll(".", "-")}`;
}

export function pairingEndpoints(port: number): RemoteEndpoint[] {
  const lan: Array<{ name: string; address: string }> = [];
  const tailnet: Array<{ name: string; address: string }> = [];
  const seen = new Set<string>();
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const candidate of addresses ?? []) {
      if (candidate.family !== "IPv4" || candidate.internal || seen.has(candidate.address)) continue;
      seen.add(candidate.address);
      if (isTailnetAddress(candidate.address)) {
        tailnet.push({ name, address: candidate.address });
      } else if (isPhysicalInterface(name) && !candidate.address.startsWith("169.254.")) {
        lan.push({ name, address: candidate.address });
      }
    }
  }
  lan.sort((left, right) => left.name.localeCompare(right.name) || left.address.localeCompare(right.address));
  tailnet.sort((left, right) => left.name.localeCompare(right.name) || left.address.localeCompare(right.address));

  const endpoints: RemoteEndpoint[] = lan.map(({ name, address }) => ({
    id: endpointId("lan", name, address),
    label: lan.length === 1 ? "LAN" : `LAN (${name}: ${address})`,
    url: `http://${address}:${port}`,
    qr_shareable: true,
  }));
  endpoints.push(...tailnet.map(({ name, address }) => ({
    id: endpointId("tailnet", name, address),
    label: tailnet.length === 1
      ? `Tailnet candidate (${address})`
      : `Tailnet candidate (${name}: ${address})`,
    url: `http://${address}:${port}`,
    qr_shareable: true,
  })));
  endpoints.push({
    id: "loopback",
    label: "Loopback",
    url: `http://127.0.0.1:${port}`,
    qr_shareable: false,
  });
  return endpoints;
}

function responseHeaders(contentType: string): Headers {
  return new Headers({
    "cache-control": "private, no-store, max-age=0",
    "content-type": contentType,
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
  });
}

function textResponse(body: string, status = 200, contentType = "text/plain; charset=utf-8"): Response {
  return new Response(body, { status, headers: responseHeaders(contentType) });
}

function jsonResponse(value: unknown, status = 200): Response {
  return textResponse(JSON.stringify(value), status, "application/json; charset=utf-8");
}

function socketText(message: string | BufferSource): string {
  if (typeof message === "string") return message;
  if (message instanceof ArrayBuffer) return new TextDecoder().decode(message);
  return new TextDecoder().decode(new Uint8Array(message.buffer, message.byteOffset, message.byteLength));
}

function activeDevice(device: PersistedDevice, now = nowSeconds()): boolean {
  return device.expires_at == null || device.expires_at > now;
}

export class BunRemoteServer {
  private readonly authPath: string;
  private readonly pairing = new Map<string, PairingToken>();
  private readonly tickets = new Map<string, SocketTicket>();
  private devicesState: PersistedDevice[];
  private server: Bun.Server<RemoteSocketData> | null = null;
  private readonly controlSockets = new Set<RemoteSocket>();
  private readonly t3Sockets = new Set<RemoteSocket>();
  private readonly terminalSockets = new Set<RemoteSocket>();
  private readonly socketQueues = new Map<RemoteSocket, Promise<void>>();
  private readonly t3: T3MobileAdapter;

  constructor(dataDir: string, private readonly callHost: RemoteHostCall) {
    this.authPath = join(dataDir, DEVICE_FILE);
    this.devicesState = this.loadDevices();
    this.t3 = new T3MobileAdapter(dataDir, callHost);
  }

  start(port = DEFAULT_PORT): RemoteStatus {
    if (this.server) return this.status() as RemoteStatus;
    if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("remote port is invalid");
    this.server = Bun.serve<RemoteSocketData>({
      hostname: "0.0.0.0",
      port,
      fetch: (request, server) => this.handleRequest(request, server),
      websocket: {
        idleTimeout: 120,
        maxPayloadLength: MAX_SOCKET_MESSAGE_BYTES,
        perMessageDeflate: false,
        open: (socket) => this.openSocket(socket),
        message: (socket, message) => this.queueSocketMessage(socket, socketText(message)),
        close: (socket) => this.closeSocket(socket),
      },
    });
    return this.status() as RemoteStatus;
  }

  stop(): boolean {
    if (!this.server) return true;
    for (const socket of [...this.controlSockets, ...this.t3Sockets, ...this.terminalSockets]) {
      try {
        socket.close(1001, "remote access turned off");
      } catch {
        // The peer may already be gone.
      }
    }
    this.controlSockets.clear();
    this.t3Sockets.clear();
    this.terminalSockets.clear();
    this.socketQueues.clear();
    this.pairing.clear();
    this.tickets.clear();
    this.server.stop(true);
    this.server = null;
    return true;
  }

  status(): RemoteStatus | null {
    if (!this.server) return null;
    const port = this.server.port;
    if (port == null) throw new Error("remote listener has no bound port");
    return { port, endpoints: pairingEndpoints(port) };
  }

  pairingLink(
    requestedEndpointId: string | null | undefined,
    protocol: string,
    requestedTtlSeconds?: number | null,
  ): RemotePairingLink {
    const status = this.status();
    if (!status) throw new Error("remote access is turned off");
    if (protocol !== "legacy" && protocol !== "t3") throw new Error(`unsupported remote protocol: ${protocol}`);
    const endpoint = requestedEndpointId
      ? status.endpoints.find((candidate) => candidate.id === requestedEndpointId)
      : status.endpoints.find((candidate) => candidate.qr_shareable) ?? status.endpoints[0];
    if (!endpoint) throw new Error(`unknown pairing endpoint: ${requestedEndpointId ?? ""}`);
    const ttl = integer(requestedTtlSeconds, DEFAULT_PAIRING_TTL_SECONDS, 1, 60 * 60);
    const token = secret();
    this.pruneEphemeral();
    this.pairing.set(hash(token), { expiresAt: nowSeconds() + ttl, protocol });
    const url = `${endpoint.url.replace(/\/$/, "")}/pair#token=${encodeURIComponent(token)}`;
    return {
      endpoint_id: endpoint.id,
      url,
      token,
      expires_in: ttl,
      // Loopback links are intentionally not encoded. LAN links remain copyable until a bundled
      // QR encoder is added; an empty value keeps the renderer from showing a misleading image.
      qr_svg: "",
    };
  }

  devices(): RemoteDeviceInfo[] {
    this.pruneDevices();
    return this.devicesState
      .map(({ id, name, created_at, last_seen }) => ({ id, name, created_at, last_seen }))
      .sort((left, right) => left.created_at - right.created_at || left.id.localeCompare(right.id));
  }

  revokeDevice(id: string): boolean {
    const updated = this.devicesState.filter((device) => device.id !== id);
    if (updated.length === this.devicesState.length) return false;
    this.persistDevices(updated);
    this.devicesState = updated;
    for (const [ticket, issued] of this.tickets) {
      if (issued.deviceId === id) this.tickets.delete(ticket);
    }
    for (const socket of [...this.controlSockets, ...this.t3Sockets, ...this.terminalSockets]) {
      if (socket.data.deviceId !== id) continue;
      try {
        socket.close(4001, "device revoked");
      } catch {
        // The socket close event will finish local cleanup if it is still live.
      }
    }
    return true;
  }

  publish(event: DesktopEvent): void {
    this.t3.publish(event);
    if (event.name === "engine-event") {
      for (const socket of this.controlSockets) this.send(socket, { kind: "event", event: event.payload });
      return;
    }
    if (event.name !== "pty-output" && event.name !== "pty-title" && event.name !== "pty-exit") return;
    const payload = object(event.payload);
    const id = typeof payload.id === "string" ? payload.id : null;
    if (!id) return;
    for (const socket of this.terminalSockets) {
      const data = socket.data;
      if (data.kind !== "terminal" || !data.attached || data.terminalId !== id) continue;
      if (event.name === "pty-output") {
        this.send(socket, { kind: "data", data: String(payload.data ?? "") });
      } else if (event.name === "pty-title") {
        this.send(socket, { kind: "title", title: String(payload.title ?? "") });
      } else {
        this.send(socket, { kind: "exit" });
      }
    }
  }

  private loadDevices(): PersistedDevice[] {
    if (!existsSync(this.authPath)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.authPath, "utf8")) as PersistedAuth;
      if (!Array.isArray(parsed.devices)) return [];
      return parsed.devices.filter((device) => (
        typeof device?.id === "string"
        && typeof device.name === "string"
        && typeof device.token_hash === "string"
        && typeof device.created_at === "number"
        && typeof device.last_seen === "number"
      ));
    } catch {
      return [];
    }
  }

  private persistDevices(devices: PersistedDevice[]): void {
    mkdirSync(dirname(this.authPath), { recursive: true });
    const temporary = `${this.authPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify({ devices }, null, 2)}\n`, { mode: 0o600 });
      chmodSync(temporary, 0o600);
      renameSync(temporary, this.authPath);
    } catch (error) {
      try {
        unlinkSync(temporary);
      } catch {
        // There may be no temporary file if creation failed.
      }
      throw new Error(`could not persist remote devices: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private pruneDevices(): void {
    const updated = this.devicesState.filter((device) => activeDevice(device));
    if (updated.length === this.devicesState.length) return;
    this.persistDevices(updated);
    this.devicesState = updated;
  }

  private pruneEphemeral(): void {
    const now = nowSeconds();
    for (const [tokenHash, pairing] of this.pairing) {
      if (pairing.expiresAt <= now) this.pairing.delete(tokenHash);
    }
    for (const [ticket, issued] of this.tickets) {
      if (issued.expiresAt <= now || !this.devicesState.some((device) => device.id === issued.deviceId && activeDevice(device, now))) {
        this.tickets.delete(ticket);
      }
    }
  }

  private authorizeBearer(bearer: string, protocol: "legacy" | "t3"): PersistedDevice | null {
    this.pruneDevices();
    const bearerHash = hash(bearer);
    const index = this.devicesState.findIndex((device) => (
      effectiveProtocol(device) === protocol && hashesEqual(device.token_hash, bearerHash)
    ));
    if (index < 0) return null;
    const now = nowSeconds();
    if (this.devicesState[index].last_seen !== now) {
      const updated = this.devicesState.map((device, candidate) => candidate === index
        ? { ...device, last_seen: now }
        : device);
      this.persistDevices(updated);
      this.devicesState = updated;
    }
    return this.devicesState[index];
  }

  private takeTicket(ticket: string, protocol: "legacy" | "t3"): SocketTicket | null {
    this.pruneEphemeral();
    const issued = this.tickets.get(ticket);
    if (!issued || issued.protocol !== protocol) return null;
    this.tickets.delete(ticket);
    const authorized = this.devicesState.some((device) => (
      device.id === issued.deviceId && effectiveProtocol(device) === protocol && activeDevice(device)
    ));
    return authorized ? issued : null;
  }

  private async requestJson(request: Request): Promise<Record<string, unknown>> {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_JSON_BODY_BYTES) throw new Error("request body is too large");
    const text = await request.text();
    if (text.length > MAX_JSON_BODY_BYTES) throw new Error("request body is too large");
    return object(JSON.parse(text));
  }

  private async requestLargeJson(request: Request): Promise<Record<string, unknown>> {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_HANDOFF_BODY_BYTES) throw new Error("task handoff is too large");
    const text = await request.text();
    if (text.length > MAX_HANDOFF_BODY_BYTES) throw new Error("task handoff is too large");
    return object(JSON.parse(text));
  }

  private requireDevice(request: Request, protocol: "legacy" | "t3"): PersistedDevice | null {
    const authorization = request.headers.get("authorization") ?? "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match ? this.authorizeBearer(match[1].trim(), protocol) : null;
  }

  private async handleRequest(
    request: Request,
    server: Bun.Server<RemoteSocketData>,
  ): Promise<Response | undefined> {
    const url = new URL(request.url);
    if (url.pathname === "/ws" || url.pathname === "/ws/terminal") {
      const t3Ticket = url.searchParams.get("wsTicket");
      const protocol = t3Ticket !== null ? "t3" : "legacy";
      if (url.pathname === "/ws/terminal" && protocol === "t3") {
        return textResponse("T3 terminal uses the Effect RPC terminal methods", 400);
      }
      const ticket = t3Ticket ?? url.searchParams.get("ticket") ?? "";
      const issued = this.takeTicket(ticket, protocol);
      if (!issued) return textResponse("invalid or expired ticket", 401);
      const data: RemoteSocketData = protocol === "t3"
        ? { kind: "t3", deviceId: issued.deviceId, scopes: issued.scopes }
        : url.pathname === "/ws"
          ? { kind: "control", deviceId: issued.deviceId }
          : { kind: "terminal", deviceId: issued.deviceId, terminalId: null, attached: false };
      if (server.upgrade(request, { data })) return undefined;
      return textResponse("websocket upgrade failed", 400);
    }

    if (request.method === "GET" && ["/", "/pair", "/terminal"].includes(url.pathname)) {
      return textResponse(ELECTROBUN_REMOTE_CLIENT_HTML, 200, "text/html; charset=utf-8");
    }
    if (request.method === "GET" && url.pathname === "/health") return textResponse("ok");
    if (request.method === "GET" && url.pathname === "/.well-known/t3/environment") {
      return jsonResponse(this.t3.descriptor());
    }
    if (request.method === "GET" && url.pathname === "/term/xterm.css") {
      return textResponse(xtermCss as unknown as string, 200, "text/css; charset=utf-8");
    }
    if (request.method === "GET" && url.pathname === "/term/xterm.min.js") {
      return textResponse(xtermJs, 200, "text/javascript; charset=utf-8");
    }
    if (request.method === "GET" && url.pathname === "/term/addon-fit.min.js") {
      return textResponse(xtermFitJs, 200, "text/javascript; charset=utf-8");
    }
    if (request.method === "POST" && url.pathname === "/api/pair") return this.pairRequest(request);

    if (request.method === "POST" && url.pathname === "/oauth/token") return this.t3TokenExchange(request);
    if (request.method === "GET" && url.pathname === "/api/auth/session") return this.t3AuthSession(request);
    if (request.method === "POST" && url.pathname === "/api/auth/websocket-ticket") {
      return this.t3WebSocketTicket(request);
    }
    if (request.method === "GET" && url.pathname === "/api/orchestration/shell") {
      const device = this.requireT3Scope(request, "orchestration:read");
      if (device instanceof Response) return device;
      return jsonResponse(await this.t3.shellSnapshot());
    }
    const t3Thread = url.pathname.match(/^\/api\/orchestration\/threads\/([^/]+)$/);
    if (request.method === "GET" && t3Thread) {
      const device = this.requireT3Scope(request, "orchestration:read");
      if (device instanceof Response) return device;
      try {
        return jsonResponse(await this.t3.threadSnapshot(decodeURIComponent(t3Thread[1])));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return textResponse(message, message.startsWith("unknown thread:") ? 404 : 500);
      }
    }
    if (request.method === "POST" && url.pathname === "/api/orchestration/dispatch") {
      const device = this.requireT3Scope(request, "orchestration:operate");
      if (device instanceof Response) return device;
      try {
        const command = await this.requestJson(request);
        return jsonResponse(await this.t3.dispatchCommand(command));
      } catch (error) {
        return textResponse(error instanceof Error ? error.message : String(error), 400);
      }
    }
    if (request.method === "POST" && url.pathname === "/api/codetwo/handoffs") {
      const device = this.requireT3Scope(request, "orchestration:operate");
      if (device instanceof Response) return device;
      try {
        const body = await this.requestLargeJson(request);
        return jsonResponse(await this.callHost("handoff.accept", {
          handoff: object(body.handoff),
          destination: typeof body.destination === "string" ? body.destination : "",
        }));
      } catch (error) {
        return textResponse(error instanceof Error ? error.message : String(error), 400);
      }
    }
    const activateHandoff = url.pathname.match(/^\/api\/codetwo\/handoffs\/([^/]+)\/activate$/);
    if (request.method === "POST" && activateHandoff) {
      const device = this.requireT3Scope(request, "orchestration:operate");
      if (device instanceof Response) return device;
      try {
        const body = await this.requestJson(request);
        await this.callHost("handoff.activate", {
          session: typeof body.session === "string" ? body.session : "",
          handoff: decodeURIComponent(activateHandoff[1]),
          epoch: body.epoch,
        });
        const response = jsonResponse({ state: "active" });
        if (device.ephemeral_handoff === true) this.revokeDevice(device.id);
        return response;
      } catch (error) {
        return textResponse(error instanceof Error ? error.message : String(error), 409);
      }
    }
    const rollbackHandoff = url.pathname.match(/^\/api\/codetwo\/handoffs\/([^/]+)\/rollback$/);
    if (request.method === "POST" && rollbackHandoff) {
      const device = this.requireT3Scope(request, "orchestration:operate");
      if (device instanceof Response) return device;
      try {
        const body = await this.requestJson(request);
        await this.callHost("handoff.rollback_target", {
          session: typeof body.session === "string" ? body.session : "",
          handoff: decodeURIComponent(rollbackHandoff[1]),
          epoch: body.epoch,
          destination: typeof body.destination === "string" ? body.destination : "",
        });
        return jsonResponse({ state: "rolled_back" });
      } catch (error) {
        return textResponse(error instanceof Error ? error.message : String(error), 409);
      }
    }

    const device = this.requireDevice(request, "legacy");
    if (!device) return textResponse("invalid bearer", 401);
    if (request.method === "POST" && url.pathname === "/api/ws-ticket") {
      const ticket = secret();
      this.pruneEphemeral();
      this.tickets.set(ticket, {
        deviceId: device.id,
        expiresAt: nowSeconds() + WS_TICKET_TTL_SECONDS,
        protocol: "legacy",
        scopes: [],
      });
      return jsonResponse({ ticket, expires_in: WS_TICKET_TTL_SECONDS });
    }
    if (request.method === "GET" && url.pathname === "/api/terminals") {
      return jsonResponse(await this.callHost("terminal.list", {}));
    }
    const kill = url.pathname.match(/^\/api\/terminals\/([^/]+)\/kill$/);
    if (request.method === "POST" && kill) {
      const id = terminalId(decodeURIComponent(kill[1]));
      const terminals = await this.callHost("terminal.list", {}) as Array<{ id?: unknown }>;
      if (!terminals.some((terminal) => terminal.id === id)) return textResponse("no such terminal", 404);
      await this.callHost("terminal.kill", { id });
      return new Response(null, { status: 204, headers: responseHeaders("text/plain; charset=utf-8") });
    }
    if (request.method === "GET" && url.pathname === "/api/canvas/feature") {
      return jsonResponse({ feature: "CODETWO_CANVAS_INPUT_V1", enabled: false, status: "not production-enabled" });
    }
    if (url.pathname.startsWith("/api/canvas/") || url.pathname.startsWith("/canvas")) {
      return textResponse("canvas remote access is not production-enabled", 403);
    }
    return textResponse("not found", 404);
  }

  private requireT3Scope(request: Request, scope: string): PersistedDevice | Response {
    const device = this.requireDevice(request, "t3");
    if (!device) return textResponse("invalid bearer", 401);
    if (!(device.scopes ?? []).includes(scope)) return textResponse(`missing ${scope}`, 403);
    return device;
  }

  private async t3TokenExchange(request: Request): Promise<Response> {
    try {
      const contentLength = Number(request.headers.get("content-length") ?? "0");
      if (contentLength > MAX_JSON_BODY_BYTES) throw new Error("request body is too large");
      const raw = await request.text();
      if (raw.length > MAX_JSON_BODY_BYTES) throw new Error("request body is too large");
      const form = new URLSearchParams(raw);
      if (
        form.get("grant_type") !== T3_TOKEN_EXCHANGE_GRANT
        || form.get("subject_token_type") !== T3_BOOTSTRAP_TOKEN_TYPE
        || form.get("requested_token_type") !== T3_ACCESS_TOKEN_TYPE
      ) {
        return textResponse("unsupported token exchange", 400);
      }
      const requested = (form.get("scope") ?? "").split(/\s+/).filter(Boolean);
      if (requested.some((scope) => !T3_STANDARD_SCOPES.includes(scope as typeof T3_STANDARD_SCOPES[number]))) {
        return textResponse("unsupported scope", 400);
      }
      const scopes = requested.length > 0 ? requested : [...T3_STANDARD_SCOPES];
      const token = form.get("subject_token") ?? "";
      const tokenHash = hash(token);
      this.pruneEphemeral();
      const pairing = this.pairing.get(tokenHash);
      if (!pairing || pairing.protocol !== "t3" || pairing.expiresAt <= nowSeconds()) {
        return textResponse("invalid or expired pairing token", 401);
      }
      const bearer = secret();
      const now = nowSeconds();
      const label = form.get("client_label")?.trim();
      const kind = form.get("client_device_type")?.trim() || "mobile";
      const os = form.get("client_os")?.trim() || "unknown";
      const device: PersistedDevice = {
        id: randomUUID(),
        name: (label || `T3 Code ${kind} (${os})`).slice(0, 100),
        token_hash: hash(bearer),
        created_at: now,
        last_seen: now,
        expires_at: now + T3_ACCESS_TTL_SECONDS,
        scopes,
        protocol: "t3",
        ephemeral_handoff: kind === "handoff",
      };
      const updated = [...this.devicesState, device];
      this.persistDevices(updated);
      this.devicesState = updated;
      this.pairing.delete(tokenHash);
      return jsonResponse({
        access_token: bearer,
        issued_token_type: T3_ACCESS_TOKEN_TYPE,
        token_type: "Bearer",
        expires_in: T3_ACCESS_TTL_SECONDS,
        scope: scopes.join(" "),
      });
    } catch (error) {
      return textResponse(error instanceof Error ? error.message : String(error), 400);
    }
  }

  private t3AuthSession(request: Request): Response {
    const device = this.requireDevice(request, "t3");
    if (!device) return jsonResponse({ authenticated: false, auth: this.t3.authDescriptor() });
    return jsonResponse({
      authenticated: true,
      auth: this.t3.authDescriptor(),
      scopes: device.scopes ?? [],
      sessionMethod: "bearer-access-token",
      ...(device.expires_at == null ? {} : { expiresAt: new Date(device.expires_at * 1_000).toISOString() }),
    });
  }

  private t3WebSocketTicket(request: Request): Response {
    const device = this.requireDevice(request, "t3");
    if (!device) return textResponse("invalid bearer", 401);
    const ticket = secret();
    const expiresAt = nowSeconds() + WS_TICKET_TTL_SECONDS;
    this.pruneEphemeral();
    this.tickets.set(ticket, {
      deviceId: device.id,
      expiresAt,
      protocol: "t3",
      scopes: device.scopes ?? [],
    });
    return jsonResponse({ ticket, expiresAt: new Date(expiresAt * 1_000).toISOString() });
  }

  private async pairRequest(request: Request): Promise<Response> {
    try {
      const body = await this.requestJson(request);
      const token = typeof body.token === "string" ? body.token : "";
      const tokenHash = hash(token);
      this.pruneEphemeral();
      const pairing = this.pairing.get(tokenHash);
      if (!pairing || pairing.protocol !== "legacy" || pairing.expiresAt <= nowSeconds()) {
        return textResponse("invalid or expired pairing token", 401);
      }
      const bearer = secret();
      const now = nowSeconds();
      const rawName = typeof body.device_name === "string" ? body.device_name.trim() : "";
      const device: PersistedDevice = {
        id: randomUUID(),
        name: rawName.slice(0, 100) || "Device",
        token_hash: hash(bearer),
        created_at: now,
        last_seen: now,
        expires_at: null,
        scopes: [],
        protocol: "legacy",
      };
      const updated = [...this.devicesState, device];
      this.persistDevices(updated);
      this.devicesState = updated;
      this.pairing.delete(tokenHash);
      return jsonResponse({ device_id: device.id, bearer });
    } catch (error) {
      return textResponse(error instanceof Error ? error.message : String(error), 400);
    }
  }

  private openSocket(socket: RemoteSocket): void {
    if (socket.data.kind === "terminal") {
      this.terminalSockets.add(socket);
      return;
    }
    if (socket.data.kind === "t3") {
      this.t3Sockets.add(socket);
      this.t3.open(socket as T3Socket, socket.data.scopes);
      return;
    }
    this.controlSockets.add(socket);
    void this.sendSessions(socket);
  }

  private closeSocket(socket: RemoteSocket): void {
    this.controlSockets.delete(socket);
    this.t3Sockets.delete(socket);
    this.t3.close(socket as T3Socket);
    this.terminalSockets.delete(socket);
    this.socketQueues.delete(socket);
  }

  private queueSocketMessage(socket: RemoteSocket, text: string): void {
    const previous = this.socketQueues.get(socket) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        if (socket.data.kind === "control") await this.handleControlMessage(socket, text);
        else if (socket.data.kind === "t3") await this.t3.handle(socket as T3Socket, text);
        else await this.handleTerminalMessage(socket, text);
      })
      .catch((error) => {
        this.send(socket, { kind: "error", message: error instanceof Error ? error.message : String(error) });
      });
    this.socketQueues.set(socket, next);
  }

  private async sendSessions(socket: RemoteSocket): Promise<void> {
    try {
      this.send(socket, { kind: "sessions", sessions: await this.callHost("sessions.list", {}) });
    } catch (error) {
      this.send(socket, { kind: "sessions_error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  private async handleControlMessage(socket: RemoteSocket, text: string): Promise<void> {
    const message = object(JSON.parse(text));
    if (message.req === "sessions") {
      await this.sendSessions(socket);
      return;
    }
    if (message.req === "transcript") {
      const session = typeof message.session === "string" ? message.session : "";
      const requestId = typeof message.request_id === "string" ? message.request_id : undefined;
      try {
        const page = object(await this.callHost("sessions.transcript", {
          session,
          before: typeof message.before === "number" ? message.before : null,
          limit: integer(message.limit, 20, 1, 100),
        }));
        this.send(socket, { kind: "transcript", session, request_id: requestId, ...page });
      } catch (error) {
        this.send(socket, {
          kind: "transcript_error",
          session,
          request_id: requestId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    const op = typeof message.op === "string" ? message.op : "";
    const command = this.commandForOperation(op);
    const args = { ...message };
    delete args.op;
    try {
      await this.callHost(command, args);
    } catch (error) {
      this.send(socket, {
        kind: "event",
        event: {
          event: "error",
          session: typeof message.session === "string" ? message.session : null,
          message: error instanceof Error ? error.message : String(error),
          terminal: true,
          request_id: typeof message.request_id === "string" ? message.request_id : null,
        },
      });
    }
  }

  private commandForOperation(operation: string): string {
    const commands: Record<string, string> = {
      new_session: "engine.new_session",
      prompt: "engine.prompt",
      cancel: "engine.cancel",
      answer_permission: "engine.answer_permission",
      answer_elicitation: "engine.answer_elicitation",
      set_permission_mode: "engine.set_permission_mode",
      set_sandbox: "engine.set_sandbox",
      set_execution_policy: "engine.set_execution_policy",
      set_model: "engine.set_model",
      set_config_option: "engine.set_config_option",
    };
    const command = commands[operation];
    if (!command) throw new Error(`unsupported remote operation: ${operation || "missing"}`);
    return command;
  }

  private async handleTerminalMessage(socket: RemoteSocket, text: string): Promise<void> {
    if (socket.data.kind !== "terminal") return;
    const message = object(JSON.parse(text));
    const operation = typeof message.op === "string" ? message.op : "";
    if (!socket.data.attached) {
      if (operation !== "attach") throw new Error("expected an attach frame first");
      const id = terminalId(message.id);
      socket.data.terminalId = id;
      const result = object(await this.callHost("terminal.spawn", {
        id,
        cwd: typeof message.cwd === "string" ? message.cwd : undefined,
        rows: integer(message.rows, 24, 1, 1_000),
        cols: integer(message.cols, 80, 1, 1_000),
        tmux_session: typeof message.tmux_session === "string" ? message.tmux_session : undefined,
      }));
      const terminals = await this.callHost("terminal.list", {}) as Array<{ id?: unknown; title?: unknown }>;
      const title = terminals.find((terminal) => terminal.id === id)?.title;
      this.send(socket, {
        kind: "attached",
        id,
        created: result.created === true,
        restore: typeof result.restore === "string" ? result.restore : "",
        title: typeof title === "string" ? title : "",
      });
      socket.data.attached = true;
      return;
    }
    const id = socket.data.terminalId;
    if (!id) throw new Error("terminal is not attached");
    if (operation === "input") {
      await this.callHost("terminal.write", { id, data: String(message.data ?? "") });
      return;
    }
    if (operation === "resize") {
      await this.callHost("terminal.resize", {
        id,
        rows: integer(message.rows, 24, 1, 1_000),
        cols: integer(message.cols, 80, 1, 1_000),
      });
      return;
    }
    if (operation === "kill") {
      await this.callHost("terminal.kill", { id });
      return;
    }
    throw new Error(`unsupported terminal operation: ${operation || "missing"}`);
  }

  private send(socket: RemoteSocket, value: unknown): void {
    try {
      socket.send(JSON.stringify(value));
    } catch {
      // A disconnected peer is cleaned up by the close callback.
    }
  }
}
