import { mkdirSync } from "node:fs";

import type { DesktopEvent } from "./rpc";

export const DESKTOP_HOST_PROTOCOL_VERSION = 1;

const MAX_PROTOCOL_LINE_LENGTH = 32 * 1024 * 1024;

interface HostInput {
  write(data: string): unknown;
  flush(): unknown;
  end(): unknown;
}

export interface NativeHostProcess {
  stdin: HostInput;
  stdout: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  kill(): unknown;
}

export type NativeHostSpawner = (command: string[]) => NativeHostProcess;

export interface NativeHostOptions {
  executable: string;
  dataDir: string;
  onEvent: (event: DesktopEvent) => void;
  spawn?: NativeHostSpawner;
  startupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
}

interface HostResponse {
  id?: number;
  result?: unknown;
  error?: string;
  method?: string;
  params?: unknown;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function desktopEvent(value: unknown): DesktopEvent {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("C2 Plugin Kernel emitted an invalid event envelope");
  }
  const candidate = value as { name?: unknown; payload?: unknown };
  if (typeof candidate.name !== "string" || !candidate.name) {
    throw new Error("C2 Plugin Kernel emitted an event without a name");
  }
  return { name: candidate.name, payload: candidate.payload };
}

function assertReadyPayload(payload: unknown): void {
  if (
    payload == null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw new Error("C2 Plugin Kernel emitted an invalid readiness payload");
  }
  const ready = payload as { protocol_version?: unknown; commands?: unknown };
  if (ready.protocol_version !== DESKTOP_HOST_PROTOCOL_VERSION) {
    throw new Error(
      `C2 Plugin Kernel protocol mismatch: expected ${DESKTOP_HOST_PROTOCOL_VERSION}, received ${String(ready.protocol_version)}`
    );
  }
  if (
    !Array.isArray(ready.commands) ||
    !ready.commands.every((name) => typeof name === "string")
  ) {
    throw new Error(
      "C2 Plugin Kernel readiness payload has an invalid command catalog"
    );
  }
}

/**
 * The desktop's only business-command boundary.
 *
 * Electrobun keeps ownership of windows and native dialogs. Every product command, plugin policy,
 * process runtime and project-scoped graph crosses this one JSON-lines connection to the Rust
 * Plugin Kernel.
 */
export class NativeHost {
  private child: NativeHostProcess | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (reason: Error) => void;
  private startPromise: Promise<void> | null = null;
  private ready = false;
  private stopping = false;
  private stopped = false;
  private failure: Error | null = null;

  constructor(private readonly options: NativeHostOptions) {
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    void this.readyPromise.catch(() => {
      /* empty */
    });
  }

  async start(): Promise<void> {
    if (this.startPromise) return await this.startPromise;
    if (this.stopping || this.stopped) {
      throw new Error("C2 Plugin Kernel has already stopped");
    }
    this.startPromise = this.startProcess();
    return await this.startPromise;
  }

  async call(
    name: string,
    args: unknown,
    projectPath: string | null
  ): Promise<unknown> {
    if (!this.startPromise)
      throw new Error("C2 Plugin Kernel has not been started");
    await this.startPromise;
    return await this.request("call", {
      name,
      args,
      project_path: projectPath,
    });
  }

  async shutdown(): Promise<void> {
    const { child } = this;
    if (!child || this.stopped) return;
    this.stopping = true;

    try {
      if (this.ready && !this.failure) {
        await withTimeout(
          this.request("shutdown", null),
          this.options.shutdownTimeoutMs ?? 2000,
          "C2 Plugin Kernel shutdown timed out"
        );
      }
    } catch {
      child.kill();
    } finally {
      try {
        child.stdin.end();
      } catch {
        // The process may already have closed its pipe.
      }
    }

    const exited = await withTimeout(
      child.exited.then(() => true),
      this.options.shutdownTimeoutMs ?? 2000,
      "C2 Plugin Kernel did not exit after shutdown"
    ).catch(() => false);
    if (!exited) {
      child.kill();
      await child.exited.catch(() => {
        /* empty */
      });
    }
    this.child = null;
    this.stopped = true;
    this.rejectPending(new Error("C2 Plugin Kernel has stopped"));
  }

  private async startProcess(): Promise<void> {
    mkdirSync(this.options.dataDir, { recursive: true });
    try {
      this.child = (this.options.spawn ?? defaultSpawn)([
        this.options.executable,
        "--data-dir",
        this.options.dataDir,
      ]);
    } catch (error) {
      const startupError = new Error(
        `C2 Plugin Kernel could not be launched: ${asError(error).message}`
      );
      this.fail(startupError);
      throw startupError;
    }

    const { child } = this;
    void this.readOutput(child.stdout).catch((error: unknown) => {
      this.fail(asError(error));
      child.kill();
    });
    void child.exited.then(
      (status) => this.handleExit(status),
      (error: unknown) => this.fail(asError(error))
    );

    try {
      await withTimeout(
        this.readyPromise,
        this.options.startupTimeoutMs ?? 60_000,
        "C2 Plugin Kernel did not become ready"
      );
    } catch (error) {
      const startupError = asError(error);
      this.fail(startupError);
      child.kill();
      throw startupError;
    }
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    const { child } = this;
    if (!child) throw new Error("C2 Plugin Kernel is not running");
    if (this.failure) throw this.failure;
    if (this.stopping && method !== "shutdown") {
      throw new Error("C2 Plugin Kernel is stopping");
    }

    const id = (this.nextId += 1);
    const response = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    try {
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      child.stdin.flush();
    } catch (error) {
      this.pending.delete(id);
      return await Promise.reject(asError(error));
    }
    return await response;
  }

  private async readOutput(stdout: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    const reader = stdout.getReader();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > MAX_PROTOCOL_LINE_LENGTH && !buffer.includes("\n")) {
        throw new Error(
          "C2 Plugin Kernel exceeded the desktop protocol line limit"
        );
      }
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        if (newline > MAX_PROTOCOL_LINE_LENGTH) {
          throw new Error(
            "C2 Plugin Kernel exceeded the desktop protocol line limit"
          );
        }
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) this.handleLine(line);
        newline = buffer.indexOf("\n");
      }
    }
    const tail = (buffer + decoder.decode()).trim();
    if (tail.length > MAX_PROTOCOL_LINE_LENGTH) {
      throw new Error(
        "C2 Plugin Kernel exceeded the desktop protocol line limit"
      );
    }
    if (tail) this.handleLine(tail);
    if (!this.stopping && !this.stopped) {
      throw new Error("C2 Plugin Kernel output stream closed unexpectedly");
    }
  }

  private handleLine(line: string): void {
    let message: HostResponse;
    try {
      message = JSON.parse(line) as HostResponse;
    } catch (error) {
      throw new Error(
        `C2 Plugin Kernel emitted invalid protocol data: ${asError(error).message}`,
        { cause: error }
      );
    }

    if (message.method === "event") {
      const event = desktopEvent(message.params);
      if (event.name === "host-ready") {
        assertReadyPayload(event.payload);
        this.ready = true;
        this.resolveReady();
      }
      try {
        this.options.onEvent(event);
      } catch (error) {
        console.error("C2 desktop event handler failed", error);
      }
      return;
    }

    if (typeof message.id !== "number") {
      throw new TypeError(
        "C2 Plugin Kernel emitted a response without a numeric id"
      );
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (typeof message.error === "string")
      pending.reject(new Error(message.error));
    else pending.resolve(message.result);
  }

  private handleExit(status: number): void {
    if (this.stopping || this.stopped) {
      this.rejectPending(new Error("C2 Plugin Kernel has stopped"));
      return;
    }
    this.fail(new Error(`C2 Plugin Kernel exited with status ${status}`));
  }

  private fail(reason: Error): void {
    if (this.failure) return;
    this.failure = reason;
    this.rejectReady(reason);
    this.rejectPending(reason);
  }

  private rejectPending(reason: Error): void {
    for (const request of this.pending.values()) request.reject(reason);
    this.pending.clear();
  }
}

function defaultSpawn(command: string[]): NativeHostProcess {
  return Bun.spawn(command, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
  });
}
