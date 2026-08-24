import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DESKTOP_HOST_PROTOCOL_VERSION,
  NativeHost,
  type NativeHostProcess,
} from "../src/electrobun/nativeHost";

class FakeKernel implements NativeHostProcess {
  readonly requests: Array<Record<string, unknown>> = [];
  readonly stdout: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
  readonly stdin;
  killed = false;

  private controller!: ReadableStreamDefaultController<Uint8Array>;
  private resolveExit!: (status: number) => void;
  private closed = false;
  private finished = false;
  private input = "";

  constructor(protocolVersion = DESKTOP_HOST_PROTOCOL_VERSION) {
    this.stdout = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
      },
    });
    this.exited = new Promise<number>((resolve) => {
      this.resolveExit = resolve;
    });
    this.stdin = {
      write: (data: string) => this.write(data),
      flush: () => undefined,
      end: () => undefined,
    };
    queueMicrotask(() => {
      this.emit({
        method: "event",
        params: {
          name: "host-ready",
          payload: { protocol_version: protocolVersion, commands: ["demo.echo"] },
        },
      });
    });
  }

  kill(): void {
    this.killed = true;
    this.finish(9);
  }

  emit(message: unknown): void {
    if (!this.closed) {
      this.controller.enqueue(new TextEncoder().encode(`${JSON.stringify(message)}\n`));
    }
  }

  closeOutput(): void {
    if (this.closed) return;
    this.closed = true;
    this.controller.close();
  }

  private write(data: string): void {
    this.input += data;
    let newline = this.input.indexOf("\n");
    while (newline >= 0) {
      const line = this.input.slice(0, newline);
      this.input = this.input.slice(newline + 1);
      const request = JSON.parse(line) as {
        id: number;
        method: string;
        params?: Record<string, unknown>;
      };
      this.requests.push(request);
      if (request.method === "call") {
        if (request.params?.name === "demo.hang") {
          // The output-close test leaves this request pending.
        } else if (request.params?.name === "demo.error") {
          this.emit({ id: request.id, error: "fixture failure" });
        } else {
          this.emit({ id: request.id, result: request.params });
        }
      } else if (request.method === "shutdown") {
        this.emit({ id: request.id, result: null });
        queueMicrotask(() => this.finish(0));
      }
      newline = this.input.indexOf("\n");
    }
  }

  private finish(status: number): void {
    if (!this.closed) this.closeOutput();
    if (this.finished) return;
    this.finished = true;
    this.resolveExit(status);
  }
}

describe("Electrobun Plugin Kernel adapter", () => {
  test("maps calls, project realms, events, errors, and shutdown onto one JSON-lines process", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "codetwo-native-host-"));
    const kernel = new FakeKernel();
    const events: Array<{ name: string; payload: unknown }> = [];
    const commands: string[][] = [];
    const host = new NativeHost({
      executable: "/fixture/codetwo-desktop-host",
      dataDir,
      onEvent: (event) => events.push(event),
      spawn: (command) => {
        commands.push(command);
        return kernel;
      },
      startupTimeoutMs: 100,
      shutdownTimeoutMs: 100,
    });

    try {
      await host.start();
      expect(commands).toEqual([[
        "/fixture/codetwo-desktop-host",
        "--data-dir",
        dataDir,
      ]]);
      await expect(host.call("demo.echo", { value: 7 }, "/repo")).resolves.toEqual({
        name: "demo.echo",
        args: { value: 7 },
        project_path: "/repo",
      });
      await expect(host.call("demo.error", null, null)).rejects.toThrow("fixture failure");

      kernel.emit({ method: "event", params: { name: "demo-event", payload: { ok: true } } });
      await Promise.resolve();
      expect(events).toContainEqual({ name: "demo-event", payload: { ok: true } });

      await host.shutdown();
      expect(kernel.requests.map((request) => request.method)).toEqual([
        "call",
        "call",
        "shutdown",
      ]);
      expect(kernel.killed).toBe(false);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("fails closed when the packaged Kernel speaks a different protocol", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "codetwo-native-host-version-"));
    const kernel = new FakeKernel(DESKTOP_HOST_PROTOCOL_VERSION + 1);
    const host = new NativeHost({
      executable: "/fixture/codetwo-desktop-host",
      dataDir,
      onEvent: () => undefined,
      spawn: () => kernel,
      startupTimeoutMs: 100,
    });

    try {
      await expect(host.start()).rejects.toThrow("protocol mismatch");
      expect(kernel.killed).toBe(true);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("rejects pending work if the Kernel output stream closes", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "codetwo-native-host-output-"));
    const kernel = new FakeKernel();
    const host = new NativeHost({
      executable: "/fixture/codetwo-desktop-host",
      dataDir,
      onEvent: () => undefined,
      spawn: () => kernel,
      startupTimeoutMs: 100,
      shutdownTimeoutMs: 100,
    });

    try {
      await host.start();
      const pending = host.call("demo.hang", null, null);
      kernel.closeOutput();
      await expect(pending).rejects.toThrow("output stream closed unexpectedly");
      expect(kernel.killed).toBe(true);
      await host.shutdown();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
