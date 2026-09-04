import { desktopCall, isElectrobun, listenDesktop } from "./container";

export interface CoreTransport {
  call<T>(name: string, args: unknown, projectPath: string | null): Promise<T>;
  listen<T>(name: string, listener: (payload: T) => void): () => void;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface LocationLike {
  hash: string;
  host: string;
  pathname: string;
  protocol: string;
  search: string;
}

interface SocketLike {
  close(): void;
  onclose: WebSocket["onclose"];
  onerror: WebSocket["onerror"];
  onmessage: WebSocket["onmessage"];
  onopen: WebSocket["onopen"];
}

export interface WebCoreTransportDependencies {
  clearPairingFragment(): void;
  createSocket(url: string): SocketLike;
  fetch(input: string, init?: RequestInit): Promise<Response>;
  location: LocationLike;
  onError(error: unknown): void;
  reconnectDelayMs: number;
  storage: StorageLike;
}

const BEARER_KEY = "codetwo.remote.bearer";

function pairingToken(hash: string): string | null {
  if (!hash.startsWith("#")) return null;
  return new URLSearchParams(hash.slice(1)).get("token");
}

async function responsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload) return payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error) return error;
  }
  return fallback;
}

/**
 * Paired browser adapter for the renderer's Core interface.
 *
 * Calls use authenticated HTTP so independent React reads remain concurrent. The existing remote
 * WebSocket remains the single engine-event stream and keeps bearer credentials out of socket URLs.
 */
export function createWebCoreTransport(
  dependencies: WebCoreTransportDependencies
): CoreTransport {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const bootstrapToken = pairingToken(dependencies.location.hash);
  let bearer = bootstrapToken ? null : dependencies.storage.getItem(BEARER_KEY);
  if (bootstrapToken) dependencies.storage.removeItem(BEARER_KEY);
  let bearerRequest: Promise<string> | null = null;
  let socket: SocketLike | null = null;
  let socketRequest: Promise<void> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const hasListeners = () => {
    for (const group of listeners.values()) if (group.size > 0) return true;
    return false;
  };

  const clearBearer = () => {
    bearer = null;
    dependencies.storage.removeItem(BEARER_KEY);
  };

  const ensureBearer = (): Promise<string> => {
    if (bearer) return Promise.resolve(bearer);
    if (bearerRequest) return bearerRequest;
    bearerRequest = (async () => {
      const token = pairingToken(dependencies.location.hash);
      if (!token) {
        throw new Error(
          "C2 Web UI is not paired. Open a fresh browser pairing link."
        );
      }
      dependencies.clearPairingFragment();
      const response = await dependencies.fetch("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, device_name: "C2 Web UI" }),
      });
      const payload = await responsePayload(response);
      if (!response.ok) {
        throw new Error(errorMessage(payload, "C2 Web UI pairing failed"));
      }
      const next =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as { bearer?: unknown }).bearer
          : null;
      if (typeof next !== "string" || !next) {
        throw new Error("C2 Web UI pairing returned no bearer credential");
      }
      bearer = next;
      dependencies.storage.setItem(BEARER_KEY, next);
      return next;
    })().finally(() => {
      bearerRequest = null;
    });
    return bearerRequest;
  };

  const scheduleReconnect = () => {
    if (reconnectTimer !== null || !hasListeners()) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void ensureSocket().catch(reportConnectionError);
    }, dependencies.reconnectDelayMs);
  };

  function reportConnectionError(error: unknown) {
    // Keep retrying ordinary outages while a reusable bearer still exists. A rejected bearer or
    // missing pairing link fails closed until the user opens a fresh one.
    if (bearer || pairingToken(dependencies.location.hash)) scheduleReconnect();
    dependencies.onError(error);
  }

  const ensureSocket = (): Promise<void> => {
    if (socket) return Promise.resolve();
    if (socketRequest) return socketRequest;
    socketRequest = (async () => {
      const authorization = await ensureBearer();
      const response = await dependencies.fetch("/api/ws-ticket", {
        method: "POST",
        headers: { Authorization: `Bearer ${authorization}` },
      });
      const payload = await responsePayload(response);
      if (response.status === 401) clearBearer();
      if (!response.ok) {
        throw new Error(
          errorMessage(payload, "C2 Web UI ticket request failed")
        );
      }
      const ticket =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as { ticket?: unknown }).ticket
          : null;
      if (typeof ticket !== "string" || !ticket) {
        throw new Error("C2 Web UI ticket request returned no ticket");
      }
      const protocol =
        dependencies.location.protocol === "https:" ? "wss:" : "ws:";
      const next = dependencies.createSocket(
        `${protocol}//${dependencies.location.host}/ws?ticket=${encodeURIComponent(ticket)}`
      );
      await new Promise<void>((resolve, reject) => {
        next.onopen = () => {
          if (!hasListeners()) {
            next.close();
            resolve();
            return;
          }
          socket = next;
          resolve();
        };
        next.onerror = () => {
          next.close();
          reject(new Error("C2 Web UI event connection failed"));
        };
        next.onmessage = ({ data }) => {
          try {
            const message =
              typeof data === "string" ? (JSON.parse(data) as unknown) : data;
            if (
              !message ||
              typeof message !== "object" ||
              Array.isArray(message)
            )
              return;
            const envelope = message as { kind?: unknown; event?: unknown };
            if (envelope.kind !== "event") return;
            for (const listener of listeners.get("engine-event") ?? []) {
              listener(envelope.event);
            }
          } catch (error) {
            dependencies.onError(error);
          }
        };
        next.onclose = () => {
          if (socket === next) socket = null;
          scheduleReconnect();
        };
      });
    })().finally(() => {
      socketRequest = null;
    });
    return socketRequest;
  };

  return {
    async call<T>(
      name: string,
      args: unknown,
      projectPath: string | null
    ): Promise<T> {
      const authorization = await ensureBearer();
      const response = await dependencies.fetch("/api/web-ui/call", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authorization}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, args, project_path: projectPath }),
      });
      const payload = await responsePayload(response);
      if (response.status === 401) clearBearer();
      if (!response.ok) {
        throw new Error(
          errorMessage(payload, `C2 Web UI command ${name} failed`)
        );
      }
      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        !("result" in payload)
      ) {
        throw new Error(
          `C2 Web UI command ${name} returned an invalid response`
        );
      }
      return (payload as { result: T }).result;
    },

    listen<T>(name: string, listener: (payload: T) => void): () => void {
      const wrapped = listener as (payload: unknown) => void;
      const group =
        listeners.get(name) ?? new Set<(payload: unknown) => void>();
      group.add(wrapped);
      listeners.set(name, group);
      void ensureSocket().catch(reportConnectionError);
      return () => {
        group.delete(wrapped);
        if (group.size === 0) listeners.delete(name);
        if (hasListeners()) return;
        if (reconnectTimer !== null) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        socket?.close();
        socket = null;
      };
    },
  };
}

const desktopCoreTransport: CoreTransport = {
  call: desktopCall,
  listen: listenDesktop,
};

function webModeRequested(): boolean {
  if (typeof window === "undefined") return false;
  return (
    import.meta.env.MODE === "web" ||
    new URLSearchParams(window.location.search).has("web-core")
  );
}

function browserWebTransport(): CoreTransport | null {
  if (!webModeRequested()) return null;
  return createWebCoreTransport({
    clearPairingFragment: () => {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    },
    createSocket: (url) => new WebSocket(url),
    fetch: (input, init) => fetch(input, init),
    location,
    onError: (error) => console.error("C2 Web UI transport error", error),
    reconnectDelayMs: 1_500,
    storage: localStorage,
  });
}

const selectedTransport = isElectrobun
  ? desktopCoreTransport
  : browserWebTransport();

/** True when product commands have a real Core behind them, independent of the desktop shell. */
export const coreAvailable = selectedTransport !== null;

export function coreCall<T>(
  name: string,
  args: unknown,
  projectPath: string | null
): Promise<T> {
  if (!selectedTransport)
    throw new Error("C2 Core is unavailable in this browser preview");
  return selectedTransport.call<T>(name, args, projectPath);
}

export function listenCore<T>(
  name: string,
  listener: (payload: T) => void
): () => void {
  return selectedTransport?.listen(name, listener) ?? (() => {});
}
