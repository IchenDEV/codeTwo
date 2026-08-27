import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

mock.module("electrobun/bun", () => ({
  GlobalShortcut: {
    isRegistered: () => false,
    register: () => false,
    unregister: () => undefined,
  },
  Utils: { openExternal: () => true },
}));

mock.module("../src/electrobun/appshots.native", () => ({
  captureMacOSAppshot: () => ({ ok: false }),
  macOSAppshotPermissions: () => ({
    available: false,
    screenRecording: false,
    accessibility: false,
  }),
  macOSCommandKeyState: () => 0,
  requestMacOSAppshotPermissions: () => undefined,
}));

const { AppshotManager } = await import("../src/electrobun/appshots");

const temporaryDirectories: string[] = [];

function managerFixture() {
  const dataDir = mkdtempSync(join(tmpdir(), "codetwo-appshots-"));
  temporaryDirectories.push(dataDir);
  return {
    dataDir,
    capturesDir: join(dataDir, "appshots"),
    manager: new AppshotManager(dataDir, "dev.codetwo.test", () => {}, () => {}, () => {}),
  };
}

function writeCapture(capturesDir: string, id: string, metadataId = id) {
  writeFileSync(join(capturesDir, `${id}.png`), Buffer.from([1, 2, 3]));
  writeFileSync(join(capturesDir, `${id}.json`), JSON.stringify({
    id: metadataId,
    app_name: "Preview",
    window_title: "Draft image",
    text: "visible text",
    text_truncated: false,
    captured_at: "2026-08-27T00:00:00.000Z",
    width: 320,
    height: 180,
  }));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("stored Appshots", () => {
  test("reloads a private capture by opaque id", () => {
    const { capturesDir, manager } = managerFixture();
    const id = "00000000-0000-4000-8000-000000000001";
    writeCapture(capturesDir, id);

    expect(manager.getCapture(id)).toEqual({
      id,
      kind: "appshot",
      app_name: "Preview",
      window_title: "Draft image",
      captured_at: "2026-08-27T00:00:00.000Z",
      text_length: 12,
      text_truncated: false,
      width: 320,
      height: 180,
      preview_data_url: "data:image/png;base64,AQID",
      destination: "current",
    });
    manager.shutdown();
  });

  test("rejects traversal, mismatched metadata, and symlinked capture files", () => {
    const { dataDir, capturesDir, manager } = managerFixture();
    expect(() => manager.getCapture("../../escape")).toThrow("Appshot id is invalid");

    const mismatched = "00000000-0000-4000-8000-000000000002";
    writeCapture(capturesDir, mismatched, "00000000-0000-4000-8000-000000000099");
    expect(() => manager.getCapture(mismatched)).toThrow(
      "Appshot metadata does not match the image",
    );

    const linked = "00000000-0000-4000-8000-000000000003";
    const external = join(dataDir, "external.png");
    writeFileSync(external, Buffer.from([4, 5, 6]));
    writeFileSync(join(capturesDir, `${linked}.json`), JSON.stringify({ id: linked }));
    symlinkSync(external, join(capturesDir, `${linked}.png`));
    expect(() => manager.getCapture(linked)).toThrow("Appshot image is invalid");
    manager.shutdown();
  });
});
