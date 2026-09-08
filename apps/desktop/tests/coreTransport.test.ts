import { describe, expect, test } from "bun:test";

import { createWebCoreTransport } from "../src/coreTransport";
import type { WebCoreTransportDependencies } from "../src/coreTransport";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class FakeSocket {
  onclose: WebSocket["onclose"] = null;
  onerror: WebSocket["onerror"] = null;
  onmessage: WebSocket["onmessage"] = null;
  onopen: WebSocket["onopen"] = null;
  closed = false;

  close(): void {
    this.closed = true;
    this.onclose?.call(this as unknown as WebSocket, {} as CloseEvent);
  }
}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 500
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline)
      throw new Error("condition did not become true");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function dependencies(
  fetcher: WebCoreTransportDependencies["fetch"],
  storage = new MemoryStorage()
) {
  const sockets: { url: string; socket: FakeSocket }[] = [];
  let fragmentClears = 0;
  const value: WebCoreTransportDependencies = {
    clearPairingFragment: () => {
      fragmentClears += 1;
    },
    createSocket: (url) => {
      const socket = new FakeSocket();
      sockets.push({ url, socket });
      queueMicrotask(() =>
        socket.onopen?.call(socket as unknown as WebSocket, {} as Event)
      );
      return socket;
    },
    fetch: fetcher,
    location: {
      hash: "#token=one-time-token",
      host: "127.0.0.1:1420",
      pathname: "/",
      protocol: "http:",
      search: "",
    },
    onError: (error) => {
      throw error;
    },
    reconnectDelayMs: 0,
    storage,
  };
  return { value, sockets, fragmentClears: () => fragmentClears };
}

describe("paired Web Core transport", () => {
  test("pairs once and keeps independent command calls concurrent", async () => {
    const requests: { input: string; init?: RequestInit }[] = [];
    const storage = new MemoryStorage();
    storage.setItem("codetwo.remote.bearer", "stale-bearer");
    let releasePairing!: () => void;
    const pairingGate = new Promise<void>((resolve) => {
      releasePairing = resolve;
    });
    const setup = dependencies(async (input, init) => {
      requests.push({ input, init });
      if (input === "/api/pair") {
        await pairingGate;
        return jsonResponse({ bearer: "paired-bearer" });
      }
      const body = JSON.parse(String(init?.body)) as { name: string };
      return jsonResponse({ result: body.name });
    }, storage);
    const transport = createWebCoreTransport(setup.value);

    const first = transport.call<string>("sessions.list", null, null);
    const second = transport.call<string>("projects.list", null, null);
    await Promise.resolve();
    expect(
      requests.filter((request) => request.input === "/api/pair")
    ).toHaveLength(1);
    releasePairing();

    expect(Promise.all([first, second])).resolves.toEqual([
      "sessions.list",
      "projects.list",
    ]);
    expect(setup.fragmentClears()).toBe(1);
    expect(
      requests.filter((request) => request.input === "/api/web-ui/call")
    ).toHaveLength(2);
    for (const request of requests.filter(
      (item) => item.input === "/api/web-ui/call"
    )) {
      expect(new Headers(request.init?.headers).get("Authorization")).toBe(
        "Bearer paired-bearer"
      );
    }
  });

  test("uses a fresh ticket whenever the shared engine event stream reconnects", async () => {
    const storage = new MemoryStorage();
    storage.setItem("codetwo.remote.bearer", "saved-bearer");
    const requests: { input: string; init?: RequestInit }[] = [];
    let ticketRequests = 0;
    const setup = dependencies(async (input, init) => {
      requests.push({ input, init });
      if (input === "/api/ws-ticket") {
        ticketRequests += 1;
        if (ticketRequests === 2)
          return jsonResponse({ error: "Core is restarting" }, 503);
        return jsonResponse({ ticket: `single-use-ticket-${ticketRequests}` });
      }
      throw new Error(`unexpected request: ${input}`);
    }, storage);
    setup.value.location.hash = "";
    setup.value.onError = () => {};
    const transport = createWebCoreTransport(setup.value);
    const events: unknown[] = [];
    const unlisten = transport.listen("engine-event", (event) =>
      events.push(event)
    );

    await waitUntil(() => setup.sockets.length === 1);
    expect(setup.sockets).toHaveLength(1);
    expect(setup.sockets[0]?.url).toBe(
      "ws://127.0.0.1:1420/ws?ticket=single-use-ticket-1"
    );
    expect(new Headers(requests[0]?.init?.headers).get("Authorization")).toBe(
      "Bearer saved-bearer"
    );

    setup.sockets[0]?.socket.onmessage?.({
      data: JSON.stringify({
        kind: "event",
        event: { event: "agent_text", session: "session-1", text: "hello" },
      }),
    });
    expect(events).toEqual([
      { event: "agent_text", session: "session-1", text: "hello" },
    ]);

    setup.sockets[0]?.socket.onclose?.call(
      setup.sockets[0]?.socket as unknown as WebSocket,
      {} as CloseEvent
    );
    await waitUntil(() => setup.sockets.length === 2);
    expect(setup.sockets).toHaveLength(2);
    expect(setup.sockets[1]?.url).toBe(
      "ws://127.0.0.1:1420/ws?ticket=single-use-ticket-3"
    );
    expect(
      requests.filter((request) => request.input === "/api/ws-ticket")
    ).toHaveLength(3);

    unlisten();
    expect(setup.sockets[1]?.socket.closed).toBe(true);
  });

  test("fails closed when no stored bearer or one-time pairing token exists", async () => {
    const setup = dependencies(async () => {
      throw new Error("fetch should not run");
    });
    setup.value.location.hash = "";
    const transport = createWebCoreTransport(setup.value);

    expect(transport.call("sessions.list", null, null)).rejects.toThrow(
      "not paired"
    );
  });
});
