import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  LspClient,
  clientForPath,
  getClient,
  isLspLanguage,
  isLspRuntimeEnabled,
  onLspRuntimeEnabled,
  setLspRuntimeEnabled,
} from "../src/lsp/client";
import { synchronizeLspRuntimePolicy } from "../src/lsp/runtimePolicy";

beforeEach(() => {
  setLspRuntimeEnabled(true);
});

afterEach(() => {
  setLspRuntimeEnabled(false);
  setLspRuntimeEnabled(true);
});

describe("LSP component policy", () => {
  test("disposes live clients and removes language-server routing when disabled", async () => {
    const client = new LspClient("typescript-language-server:/workspace", "/workspace", [
      "typescript",
      "javascript",
    ]);
    expect(clientForPath("/workspace/src/App.tsx", "typescript")).toBe(client);

    setLspRuntimeEnabled(false);

    expect(isLspRuntimeEnabled()).toBe(false);
    expect(isLspLanguage("typescript")).toBe(false);
    expect(clientForPath("/workspace/src/App.tsx", "typescript")).toBeNull();
    expect(LspClient.clients.size).toBe(0);
    expect(await client.ready).toBe(false);
  });

  test("does not acquire a client while the runtime component is disabled", async () => {
    setLspRuntimeEnabled(false);
    expect(await getClient("/workspace", "typescript")).toBeNull();
    expect(LspClient.clients.size).toBe(0);
  });

  test("opens the renderer gate only after the backend realm resumes", async () => {
    setLspRuntimeEnabled(false);
    let finishResume: (() => void) | undefined;
    const backendResumed = new Promise<void>((resolve) => {
      finishResume = resolve;
    });
    const workspaces: (string | undefined)[] = [];
    const unsubscribe = onLspRuntimeEnabled((workspace) => workspaces.push(workspace));

    const synchronization = synchronizeLspRuntimePolicy(
      {
        catalogReady: true,
        pluginEnabled: true,
        componentEnabled: true,
        projectPath: "/workspace",
        workspace: "/workspace",
      },
      async (enabled) => {
        expect(enabled).toBe(true);
        await backendResumed;
      },
    );

    expect(isLspRuntimeEnabled()).toBe(false);
    expect(await getClient("/workspace", "typescript")).toBeNull();
    expect(workspaces).toEqual([]);

    finishResume?.();
    await synchronization;

    expect(isLspRuntimeEnabled()).toBe(true);
    expect(workspaces).toEqual(["/workspace"]);
    unsubscribe();
  });

  test("does not reopen for a stale project synchronization", async () => {
    setLspRuntimeEnabled(false);
    let current = true;
    let finishResume: (() => void) | undefined;
    const backendResumed = new Promise<void>((resolve) => {
      finishResume = resolve;
    });
    const synchronization = synchronizeLspRuntimePolicy(
      {
        catalogReady: true,
        pluginEnabled: true,
        componentEnabled: true,
        projectPath: "/old-project",
        workspace: "/old-project",
      },
      async () => backendResumed,
      () => current,
    );

    current = false;
    finishResume?.();
    await synchronization;

    expect(isLspRuntimeEnabled()).toBe(false);
  });

  test("serializes rapid policy updates within one project realm", async () => {
    setLspRuntimeEnabled(false);
    let firstIsCurrent = true;
    let finishFirst: (() => void) | undefined;
    const firstBackendUpdate = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    let markFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const calls: boolean[] = [];
    const enabled = synchronizeLspRuntimePolicy(
      {
        catalogReady: true,
        pluginEnabled: true,
        componentEnabled: true,
        projectPath: "/workspace",
        workspace: "/workspace",
      },
      async (value) => {
        calls.push(value);
        markFirstStarted?.();
        await firstBackendUpdate;
      },
      () => firstIsCurrent,
    );

    firstIsCurrent = false;
    const disabled = synchronizeLspRuntimePolicy(
      {
        catalogReady: true,
        pluginEnabled: true,
        componentEnabled: false,
        projectPath: "/workspace",
        workspace: "/workspace",
      },
      async (value) => {
        calls.push(value);
      },
    );

    await firstStarted;
    expect(calls).toEqual([true]);
    expect(isLspRuntimeEnabled()).toBe(false);

    finishFirst?.();
    await Promise.all([enabled, disabled]);

    expect(calls).toEqual([true, false]);
    expect(isLspRuntimeEnabled()).toBe(false);
  });
});
