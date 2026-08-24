import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DesktopEvent } from "../rpc";
import { BunRemoteServer, type RemoteHostCall } from "./remote";
import { TerminalManager } from "./system";

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

function temporaryDataDir(): string {
  const dataDir = mkdtempSync(join(tmpdir(), "codetwo-remote-test-"));
  cleanups.push(() => rmSync(dataDir, { recursive: true, force: true }));
  return dataDir;
}

function loopbackUrl(remote: BunRemoteServer): string {
  const endpoint = remote.status()?.endpoints.find((candidate) => candidate.id === "loopback");
  if (!endpoint) throw new Error("loopback endpoint missing");
  return endpoint.url;
}

async function pair(remote: BunRemoteServer, deviceName = "Test browser") {
  const link = remote.pairingLink("loopback", "legacy", 60);
  const response = await fetch(`${loopbackUrl(remote)}/api/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: link.token, device_name: deviceName }),
  });
  expect(response.status).toBe(200);
  const paired = await response.json() as { device_id: string; bearer: string };
  return { ...paired, token: link.token };
}

async function ticket(baseUrl: string, bearer: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/ws-ticket`, {
    method: "POST",
    headers: { authorization: `Bearer ${bearer}` },
  });
  expect(response.status).toBe(200);
  return (await response.json() as { ticket: string }).ticket;
}

async function t3Ticket(baseUrl: string, bearer: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/websocket-ticket`, {
    method: "POST",
    headers: { authorization: `Bearer ${bearer}` },
  });
  expect(response.status).toBe(200);
  return (await response.json() as { ticket: string }).ticket;
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => reject(new Error(`timed out opening ${url}`)), 5_000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve(socket);
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error(`could not open ${url}`));
    }, { once: true });
  });
}

function nextJson<T>(socket: WebSocket, timeoutMs = 5_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error("timed out waiting for a WebSocket frame"));
    }, timeoutMs);
    const onMessage = (event: MessageEvent) => {
      clearTimeout(timeout);
      resolve(JSON.parse(String(event.data)) as T);
    };
    socket.addEventListener("message", onMessage, { once: true });
  });
}

function jsonFramesWithMarkers(socket: WebSocket, markers: string[], timeoutMs = 5_000): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const values: unknown[] = [];
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error(`timed out waiting for WebSocket markers: ${markers.join(", ")}`));
    }, timeoutMs);
    const onMessage = (event: MessageEvent) => {
      values.push(JSON.parse(String(event.data)));
      const text = JSON.stringify(values);
      if (!markers.every((marker) => text.includes(marker))) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      resolve(values);
    };
    socket.addEventListener("message", onMessage);
  });
}

function waitForData(socket: WebSocket, marker: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error(`timed out waiting for terminal marker ${marker}; output=${JSON.stringify(output)}`));
    }, 10_000);
    const onMessage = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as { kind?: string; data?: string; message?: string };
      if (message.kind === "error") {
        clearTimeout(timeout);
        socket.removeEventListener("message", onMessage);
        reject(new Error(message.message ?? "remote terminal error"));
        return;
      }
      if (message.kind !== "data") return;
      output += message.data ?? "";
      if (!output.includes(marker)) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      resolve(output);
    };
    socket.addEventListener("message", onMessage);
  });
}

function waitForClose(socket: WebSocket): Promise<CloseEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("timed out waiting for socket close")), 5_000);
    socket.addEventListener("close", (event) => {
      clearTimeout(timeout);
      resolve(event);
    }, { once: true });
  });
}

describe("Bun remote control server", () => {
  test("speaks the T3 Mobile OAuth and Effect RPC protocol without crossing legacy credentials", async () => {
    const cwd = temporaryDataDir();
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const sessions: Array<Record<string, unknown>> = [];
    let remote: BunRemoteServer;
    const terminal = new TerminalManager((event) => remote.publish(event));
    const call: RemoteHostCall = async (name, args) => {
      calls.push({ name, args });
      if (name === "workspace.default_cwd") return cwd;
      if (name === "projects.list") return [{ path: cwd, name: "Remote project" }];
      if (name === "providers.list") {
        return [{
          id: "codex",
          display_name: "Codex",
          available: true,
          enabled: true,
          models: [{ id: "gpt-5.6", name: "GPT-5.6" }],
        }];
      }
      if (name === "sessions.list") return sessions;
      if (name === "sessions.archived") return [];
      if (name === "sessions.search") return [];
      if (name === "sessions.transcript") return { entries: [], next_before: null };
      if (name === "terminal.spawn") return terminal.spawn(args, null);
      if (name === "terminal.write") return terminal.write(String(args.id), String(args.data ?? ""));
      if (name === "terminal.resize") return terminal.resize(String(args.id), Number(args.rows), Number(args.cols));
      if (name === "terminal.clear") return terminal.clear(String(args.id));
      if (name === "terminal.kill") return terminal.kill(String(args.id));
      if (name === "workspace.list_files") return ["mobile.txt"];
      if (name === "workspace.read_text") return "mobile file\n";
      if (name === "workspace.write_text") return true;
      if (name === "workspace.search") return { matches: [], truncated: false };
      if (name === "git.status") return { is_repo: false, branch: "", ahead: 0, behind: 0, files: [] };
      if (name === "engine.new_session") {
        sessions.push({
          id: "core-session-1",
          title: "Mobile task",
          provider: "codex",
          model: "gpt-5.6",
          cwd,
          project_path: cwd,
          permission_mode: "ask",
          sandbox_policy: "workspace_write",
          activity: { revision: 0, state: { kind: "idle" } },
          created_at: Date.now(),
        });
        return true;
      }
      return true;
    };
    remote = new BunRemoteServer(cwd, call);
    remote.start(0);
    cleanups.push(() => {
      remote.stop();
      terminal.shutdown();
    });
    const baseUrl = loopbackUrl(remote);

    const descriptor = await (await fetch(`${baseUrl}/.well-known/t3/environment`)).json() as {
      environmentId: string;
      capabilities: { connectionProbe: boolean };
    };
    expect(descriptor.environmentId).toHaveLength(36);
    expect(descriptor.capabilities.connectionProbe).toBe(true);

    const bootstrap = remote.pairingLink("loopback", "t3", 60);
    const legacyRedemption = await fetch(`${baseUrl}/api/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: bootstrap.token, device_name: "Wrong protocol" }),
    });
    expect(legacyRedemption.status).toBe(401);
    const exchange = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        subject_token: bootstrap.token,
        subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap",
        requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
        client_label: "Official mobile client",
      }),
    });
    expect(exchange.status).toBe(200);
    const { access_token: bearer, scope } = await exchange.json() as { access_token: string; scope: string };
    expect(scope).toContain("orchestration:operate");
    expect((await (await fetch(`${baseUrl}/api/auth/session`, {
      headers: { authorization: `Bearer ${bearer}` },
    })).json() as { authenticated: boolean }).authenticated).toBe(true);
    expect((await fetch(`${baseUrl}/api/ws-ticket`, {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}` },
    })).status).toBe(401);

    const wsTicket = await t3Ticket(baseUrl, bearer);
    expect((await fetch(`${baseUrl}/ws?ticket=${wsTicket}`)).status).toBe(401);
    const socket = await openSocket(`${baseUrl.replace("http://", "ws://")}/ws?wsTicket=${wsTicket}`);
    const pong = nextJson<{ _tag: string }>(socket);
    socket.send(JSON.stringify({ _tag: "Ping" }));
    expect(await pong).toEqual({ _tag: "Pong" });

    const config = nextJson<{ _tag: string; requestId: string; exit: { value: { providers: unknown[] } } }>(socket);
    socket.send(JSON.stringify({ _tag: "Request", id: "config-1", tag: "server.getConfig", payload: {} }));
    expect(await config).toMatchObject({
      _tag: "Exit",
      requestId: "config-1",
      exit: { _tag: "Success", value: { providers: [{ instanceId: "codex", installed: true }] } },
    });

    const terminalMetadata = nextJson<{ _tag: string; requestId: string; values: unknown[] }>(socket);
    socket.send(JSON.stringify({ _tag: "Request", id: "terminal-metadata-1", tag: "subscribeTerminalMetadata", payload: {} }));
    expect(await terminalMetadata).toEqual({
      _tag: "Chunk",
      requestId: "terminal-metadata-1",
      values: [{ type: "snapshot", terminals: [] }],
    });
    socket.send(JSON.stringify({ _tag: "Interrupt", requestId: "terminal-metadata-1" }));

    const vcs = nextJson<{ requestId: string; values: Array<{ _tag: string; local: { isRepo: boolean } }> }>(socket);
    socket.send(JSON.stringify({ _tag: "Request", id: "vcs-1", tag: "subscribeVcsStatus", payload: { cwd } }));
    expect(await vcs).toMatchObject({
      _tag: "Chunk",
      requestId: "vcs-1",
      values: [{ _tag: "snapshot", local: { isRepo: false }, remote: null }],
    });
    socket.send(JSON.stringify({ _tag: "Interrupt", requestId: "vcs-1" }));

    const archived = nextJson<{ requestId: string; exit: { value: { threads: unknown[] } } }>(socket);
    socket.send(JSON.stringify({
      _tag: "Request",
      id: "archived-1",
      tag: "orchestration.getArchivedShellSnapshot",
      payload: {},
    }));
    expect((await archived).exit.value.threads).toEqual([]);

    const search = nextJson<{ requestId: string; exit: { value: { matches: unknown[] } } }>(socket);
    socket.send(JSON.stringify({
      _tag: "Request",
      id: "search-1",
      tag: "orchestration.searchThreads",
      payload: { query: "mo", limit: 5 },
    }));
    expect((await search).exit.value.matches).toEqual([]);

    const shellFrame = nextJson<{
      _tag: string;
      requestId: string;
      values: Array<{ snapshot: { projects: Array<{ id: string }> } }>;
    }>(socket);
    socket.send(JSON.stringify({
      _tag: "Request",
      id: "shell-1",
      tag: "orchestration.subscribeShell",
      payload: {},
    }));
    const shell = await shellFrame;
    const projectId = shell.values[0].snapshot.projects[0].id;
    expect(projectId).toStartWith("codetwo-project-");

    const dispatched = nextJson<{ exit: { value: { sequence: number } } }>(socket);
    socket.send(JSON.stringify({
      _tag: "Request",
      id: "dispatch-1",
      tag: "orchestration.dispatchCommand",
      payload: {
        type: "thread.turn.start",
        commandId: "mobile-command-1",
        threadId: "mobile-thread-1",
        message: { messageId: "mobile-message-1", role: "user", text: "Implement the feature", attachments: [] },
        runtimeMode: "approval-required",
        interactionMode: "default",
        bootstrap: {
          createThread: {
            projectId,
            title: "Mobile task",
            modelSelection: { instanceId: "codex", model: "gpt-5.6" },
            runtimeMode: "approval-required",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdAt: new Date().toISOString(),
          },
        },
        createdAt: new Date().toISOString(),
      },
    }));
    expect((await dispatched).exit.value.sequence).toBeGreaterThan(0);
    expect(calls).toContainEqual({
      name: "engine.prompt",
      args: {
        session: "core-session-1",
        doc: [{ type: "text", text: "Implement the feature" }],
        request_id: "t3:mobile-command-1",
      },
    });

    writeFileSync(join(cwd, "mobile.txt"), "mobile file\n");
    const file = nextJson<{
      exit: { value: { relativePath: string; contents: string; byteLength: number; truncated: boolean } };
    }>(socket);
    socket.send(JSON.stringify({
      _tag: "Request",
      id: "file-1",
      tag: "projects.readFile",
      payload: { cwd, relativePath: "mobile.txt" },
    }));
    expect((await file).exit.value).toEqual({
      relativePath: "mobile.txt",
      contents: "mobile file\n",
      byteLength: 12,
      truncated: false,
    });

    const terminalAttached = nextJson<{
      _tag: string;
      requestId: string;
      values: Array<{ type: string; snapshot: { terminalId: string } }>;
    }>(socket);
    socket.send(JSON.stringify({
      _tag: "Request",
      id: "terminal-attach-1",
      tag: "terminal.attach",
      payload: { threadId: "mobile-thread-1", terminalId: "term-1", cwd, rows: 24, cols: 80 },
    }));
    expect(await terminalAttached).toMatchObject({
      _tag: "Chunk",
      requestId: "terminal-attach-1",
      values: [{ type: "snapshot", snapshot: { terminalId: "term-1", status: "running" } }],
    });
    socket.send(JSON.stringify({ _tag: "Ack", requestId: "terminal-attach-1" }));
    const terminalFrames = jsonFramesWithMarkers(socket, ["T3_TERMINAL_OK", "terminal-write-1"]);
    socket.send(JSON.stringify({
      _tag: "Request",
      id: "terminal-write-1",
      tag: "terminal.write",
      payload: { threadId: "mobile-thread-1", terminalId: "term-1", data: "printf 'T3_TERMINAL_OK\\n'\n" },
    }));
    const written = await terminalFrames;
    expect(JSON.stringify(written)).toContain("T3_TERMINAL_OK");
    expect(JSON.stringify(written)).toContain("terminal-write-1");

    const closed = waitForClose(socket);
    const device = remote.devices().find((candidate) => candidate.name === "Official mobile client");
    expect(device).toBeDefined();
    expect(remote.revokeDevice(device!.id)).toBe(true);
    expect((await closed).code).toBe(4001);
  }, 20_000);

  test("keeps paired browser credentials valid across listener restarts", async () => {
    const dataDir = temporaryDataDir();
    const call: RemoteHostCall = async (name) => name === "sessions.list" ? [] : true;
    const first = new BunRemoteServer(dataDir, call);
    first.start(0);
    const paired = await pair(first, "Persistent controller");
    first.stop();

    const restarted = new BunRemoteServer(dataDir, call);
    restarted.start(0);
    cleanups.push(() => {
      restarted.stop();
    });
    expect(restarted.devices()).toEqual([
      expect.objectContaining({ id: paired.device_id, name: "Persistent controller" }),
    ]);
    expect(await ticket(loopbackUrl(restarted), paired.bearer)).toHaveLength(64);
  });

  test("pairs once, exposes live sessions, and actively closes a revoked device", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const call: RemoteHostCall = async (name, args) => {
      calls.push({ name, args });
      if (name === "sessions.list") return [{ id: "session-1", title: "Live session" }];
      if (name === "sessions.transcript") return { entries: [], next_before: null };
      return true;
    };
    const remote = new BunRemoteServer(temporaryDataDir(), call);
    remote.start(0);
    cleanups.push(() => {
      remote.stop();
    });

    const baseUrl = loopbackUrl(remote);
    const shell = await (await fetch(baseUrl)).text();
    expect(shell).toContain("C2 remote");
    expect(shell).not.toContain("scan\n        the QR code");
    const paired = await pair(remote, "Local controller");
    const replay = await fetch(`${baseUrl}/api/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: paired.token, device_name: "Replay" }),
    });
    expect(replay.status).toBe(401);

    const wsTicket = await ticket(baseUrl, paired.bearer);
    const socket = await openSocket(`${baseUrl.replace("http://", "ws://")}/ws?ticket=${wsTicket}`);
    expect(await nextJson<{ kind: string; sessions: Array<{ id: string; title: string }> }>(socket)).toEqual({
      kind: "sessions",
      sessions: [{ id: "session-1", title: "Live session" }],
    });

    const transcript = nextJson<{ kind: string; request_id: string }>(socket);
    socket.send(JSON.stringify({ req: "transcript", session: "session-1", limit: 20, request_id: "page-1" }));
    expect(await transcript).toMatchObject({ kind: "transcript", request_id: "page-1" });
    expect(calls).toContainEqual({
      name: "sessions.transcript",
      args: { session: "session-1", before: null, limit: 20 },
    });

    const closed = waitForClose(socket);
    expect(remote.revokeDevice(paired.device_id)).toBe(true);
    expect((await closed).code).toBe(4001);
    expect(remote.devices()).toEqual([]);

    const rejected = await fetch(`${baseUrl}/api/ws-ticket`, {
      method: "POST",
      headers: { authorization: `Bearer ${paired.bearer}` },
    });
    expect(rejected.status).toBe(401);
  }, 15_000);

  test("controls two independent terminals and reattaches without respawning", async () => {
    const dataDir = temporaryDataDir();
    let remote: BunRemoteServer;
    const terminal = new TerminalManager((event: DesktopEvent) => remote.publish(event));
    const call: RemoteHostCall = async (name, args) => {
      if (name === "terminal.spawn") return terminal.spawn(args, null);
      if (name === "terminal.write") return terminal.write(String(args.id), String(args.data ?? ""));
      if (name === "terminal.resize") return terminal.resize(String(args.id), Number(args.rows), Number(args.cols));
      if (name === "terminal.dump") return terminal.dump(String(args.id));
      if (name === "terminal.kill") return terminal.kill(String(args.id));
      if (name === "terminal.list") return terminal.list();
      if (name === "sessions.list") return [];
      throw new Error(`unexpected call: ${name}`);
    };
    remote = new BunRemoteServer(dataDir, call);
    remote.start(0);
    cleanups.push(() => {
      remote.stop();
      terminal.shutdown();
    });

    const baseUrl = loopbackUrl(remote);
    const paired = await pair(remote);
    const socketA = await openSocket(
      `${baseUrl.replace("http://", "ws://")}/ws/terminal?ticket=${await ticket(baseUrl, paired.bearer)}`,
    );
    const attachedA = nextJson<{ kind: string; created: boolean }>(socketA);
    socketA.send(JSON.stringify({ op: "attach", id: "remote-a", cwd: dataDir, rows: 24, cols: 80 }));
    expect(await attachedA).toMatchObject({ kind: "attached", id: "remote-a", created: true });

    const socketB = await openSocket(
      `${baseUrl.replace("http://", "ws://")}/ws/terminal?ticket=${await ticket(baseUrl, paired.bearer)}`,
    );
    const attachedB = nextJson<{ kind: string; created: boolean }>(socketB);
    socketB.send(JSON.stringify({ op: "attach", id: "remote-b", cwd: dataDir, rows: 32, cols: 100 }));
    expect(await attachedB).toMatchObject({ kind: "attached", id: "remote-b", created: true });

    const outputA = waitForData(socketA, "REMOTE_A_OK");
    const outputB = waitForData(socketB, "REMOTE_B_OK");
    socketA.send(JSON.stringify({ op: "input", data: "printf 'REMOTE_A_OK\\n'\n" }));
    socketB.send(JSON.stringify({ op: "input", data: "printf 'REMOTE_B_OK\\n'\n" }));
    expect(await outputA).toContain("REMOTE_A_OK");
    expect(await outputB).toContain("REMOTE_B_OK");

    const listing = await fetch(`${baseUrl}/api/terminals`, {
      headers: { authorization: `Bearer ${paired.bearer}` },
    });
    expect(await listing.json()).toEqual([
      { id: "remote-a", title: expect.any(String) },
      { id: "remote-b", title: expect.any(String) },
    ]);

    socketA.close();
    await waitForClose(socketA);
    const reattached = await openSocket(
      `${baseUrl.replace("http://", "ws://")}/ws/terminal?ticket=${await ticket(baseUrl, paired.bearer)}`,
    );
    const attachedAgain = nextJson<{ kind: string; created: boolean; restore: string }>(reattached);
    reattached.send(JSON.stringify({ op: "attach", id: "remote-a", cwd: dataDir, rows: 24, cols: 80 }));
    expect(await attachedAgain).toMatchObject({
      kind: "attached",
      id: "remote-a",
      created: false,
      restore: expect.stringContaining("REMOTE_A_OK"),
    });

    const closedB = waitForClose(socketB);
    const closedAgain = waitForClose(reattached);
    expect(remote.revokeDevice(paired.device_id)).toBe(true);
    expect((await closedB).code).toBe(4001);
    expect((await closedAgain).code).toBe(4001);
  }, 30_000);
});
