import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { GlobalShortcut, Utils } from "electrobun/bun";

import {
  captureMacOSAppshot,
  macOSAppshotPermissions,
  macOSCommandKeyState,
  requestMacOSAppshotPermissions,
} from "./appshots.native";
import type {
  AppshotCapture,
  AppshotDestination,
  AppshotHotkey,
  AppshotSettings,
} from "./rpc";

const defaultSettings = {
  destination: "automatic",
  hotkey: "both-command",
  play_sound: true,
} as const satisfies Pick<
  AppshotSettings,
  "hotkey" | "destination" | "play_sound"
>;

const hotkeyAccelerators: Partial<Record<AppshotHotkey, string>> = {
  "command-option-2": "CommandOrControl+Alt+2",
  "command-shift-2": "CommandOrControl+Shift+2",
};

const captureRetentionMs = 7 * 24 * 60 * 60 * 1000;
const maxStoredCaptures = 40;
const captureIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type StoredSettings = Pick<
  AppshotSettings,
  "hotkey" | "destination" | "play_sound"
>;

function isHotkey(value: unknown): value is AppshotHotkey {
  return (
    value === "both-command" ||
    value === "command-shift-2" ||
    value === "command-option-2"
  );
}

function isDestination(value: unknown): value is AppshotDestination {
  return value === "automatic" || value === "current" || value === "new";
}

export function normalizeAppshotSettings(value: unknown): StoredSettings {
  const settings =
    Boolean(value) && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    destination: isDestination(settings.destination)
      ? settings.destination
      : defaultSettings.destination,
    hotkey: isHotkey(settings.hotkey)
      ? settings.hotkey
      : defaultSettings.hotkey,
    play_sound:
      typeof settings.play_sound === "boolean"
        ? settings.play_sound
        : defaultSettings.play_sound,
  };
}

export class AppshotManager {
  private readonly settingsPath: string;
  private readonly capturesDir: string;
  private settings: StoredSettings;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private dualCommandLatched = false;
  private registeredAccelerator: string | null = null;
  private capturing = false;

  constructor(
    dataDirectory: string,
    private readonly bundleIdentifier: string,
    private readonly onCapture: (capture: AppshotCapture) => void,
    private readonly onFailure: (message: string) => void,
    private readonly activate: () => void
  ) {
    this.settingsPath = join(dataDirectory, "appshots.json");
    this.capturesDir = join(dataDirectory, "appshots");
    mkdirSync(this.capturesDir, { mode: 0o700, recursive: true });
    chmodSync(this.capturesDir, 0o700);
    try {
      this.settings = normalizeAppshotSettings(
        JSON.parse(readFileSync(this.settingsPath, "utf8"))
      );
    } catch {
      this.settings = { ...defaultSettings };
    }
    this.cleanupCaptures();
    this.applyHotkey();
  }

  getSettings(): AppshotSettings {
    const permissions = macOSAppshotPermissions();
    return {
      ...this.settings,
      accessibility: permissions.accessibility,
      available: permissions.available,
      hotkey_registered: this.hotkeyRegistered(),
      screen_recording: permissions.screenRecording,
      unavailable_reason: permissions.available
        ? null
        : "Appshots require macOS 14 or later.",
    };
  }

  updateSettings(patch: Partial<StoredSettings>): AppshotSettings {
    this.settings = normalizeAppshotSettings({ ...this.settings, ...patch });
    writeFileSync(
      this.settingsPath,
      `${JSON.stringify(this.settings, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 }
    );
    this.applyHotkey();
    return this.getSettings();
  }

  requestPermissions(
    kind: "screen-recording" | "accessibility"
  ): AppshotSettings {
    requestMacOSAppshotPermissions(kind);
    return this.getSettings();
  }

  openPrivacySettings(kind: "screen-recording" | "accessibility"): boolean {
    const pane =
      kind === "screen-recording"
        ? "Privacy_ScreenCapture"
        : "Privacy_Accessibility";
    return Utils.openExternal(
      `x-apple.systempreferences:com.apple.preference.security?${pane}`
    );
  }

  async capture(): Promise<AppshotCapture> {
    if (this.capturing) {
      throw new Error("An Appshot capture is already in progress.");
    }
    this.capturing = true;
    const id = crypto.randomUUID();
    const imagePath = join(this.capturesDir, `${id}.png`);
    const metadataPath = join(this.capturesDir, `${id}.json`);
    try {
      const result = captureMacOSAppshot(imagePath, this.bundleIdentifier);
      if (!result.ok) {
        rmSync(imagePath, { force: true });
        throw new Error(
          result.message ?? "Could not capture the frontmost window."
        );
      }
      chmodSync(imagePath, 0o600);
      const capturedAt = new Date().toISOString();
      const metadata = {
        app_name: result.app_name ?? "Application",
        captured_at: capturedAt,
        height: result.height ?? 0,
        id,
        text: result.text ?? "",
        text_truncated: result.text_truncated === true,
        width: result.width ?? 0,
        window_title: result.window_title ?? "Window",
      };
      writeFileSync(metadataPath, `${JSON.stringify(metadata)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      const capture: AppshotCapture = {
        app_name: metadata.app_name,
        captured_at: capturedAt,
        destination: this.settings.destination,
        height: result.height ?? 0,
        id,
        preview_data_url: `data:image/png;base64,${readFileSync(imagePath).toString("base64")}`,
        text_length: metadata.text.length,
        text_truncated: metadata.text_truncated,
        width: result.width ?? 0,
        window_title: metadata.window_title,
      };
      if (this.settings.play_sound) {
        const player = Bun.spawn(
          ["/usr/bin/afplay", "/System/Library/Sounds/Glass.aiff"],
          { stderr: "ignore", stdin: "ignore", stdout: "ignore" }
        );
        void player.exited;
      }
      this.cleanupCaptures();
      return capture;
    } finally {
      this.capturing = false;
    }
  }

  getCapture(id: string): AppshotCapture {
    if (!captureIdPattern.test(id)) {
      throw new Error("Appshot id is invalid.");
    }
    const imagePath = join(this.capturesDir, `${id}.png`);
    const metadataPath = join(this.capturesDir, `${id}.json`);
    const imageStat = lstatSync(imagePath);
    const metadataStat = lstatSync(metadataPath);
    if (imageStat.isSymbolicLink() || !imageStat.isFile()) {
      throw new Error("Appshot image is invalid.");
    }
    if (metadataStat.isSymbolicLink() || !metadataStat.isFile()) {
      throw new Error("Appshot metadata is invalid.");
    }
    if (imageStat.size === 0 || imageStat.size > 20 * 1024 * 1024) {
      throw new Error("Appshot image is invalid.");
    }
    if (metadataStat.size === 0 || metadataStat.size > 1024 * 1024) {
      throw new Error("Appshot metadata is invalid.");
    }
    const image = readFileSync(imagePath);
    const rawMetadata = readFileSync(metadataPath, "utf8");
    const value = JSON.parse(rawMetadata) as Record<string, unknown>;
    if (value.id !== id) {
      throw new Error("Appshot metadata does not match the image.");
    }
    const appName =
      typeof value.app_name === "string" ? value.app_name : "Application";
    const windowTitle =
      typeof value.window_title === "string" ? value.window_title : "Window";
    const text = typeof value.text === "string" ? value.text : "";
    return {
      app_name: appName,
      captured_at:
        typeof value.captured_at === "string" ? value.captured_at : "",
      destination: "current",
      height:
        typeof value.height === "number" && Number.isFinite(value.height)
          ? value.height
          : 0,
      id,
      kind: "appshot",
      preview_data_url: `data:image/png;base64,${image.toString("base64")}`,
      text_length: text.length,
      text_truncated: value.text_truncated === true,
      width:
        typeof value.width === "number" && Number.isFinite(value.width)
          ? value.width
          : 0,
      window_title: windowTitle,
    };
  }

  shutdown(): void {
    this.clearHotkey();
  }

  private hotkeyRegistered(): boolean {
    const permissions = macOSAppshotPermissions();
    if (!permissions.available) {
      return false;
    }
    if (this.settings.hotkey === "both-command") {
      return permissions.accessibility && this.pollTimer !== null;
    }
    return (
      this.registeredAccelerator !== null &&
      GlobalShortcut.isRegistered(this.registeredAccelerator)
    );
  }

  private applyHotkey(): void {
    this.clearHotkey();
    if (!macOSAppshotPermissions().available) {
      return;
    }
    if (this.settings.hotkey === "both-command") {
      this.pollTimer = setInterval(() => {
        const isBothPressed = macOSCommandKeyState() === 3;
        if (isBothPressed && !this.dualCommandLatched) {
          this.dualCommandLatched = true;
          void this.captureFromHotkey();
        } else if (!isBothPressed) {
          this.dualCommandLatched = false;
        }
      }, 35);
      return;
    }
    const accelerator = hotkeyAccelerators[this.settings.hotkey];
    if (
      accelerator != null &&
      accelerator !== "" &&
      GlobalShortcut.register(accelerator, () => void this.captureFromHotkey())
    ) {
      this.registeredAccelerator = accelerator;
    }
  }

  private clearHotkey(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    this.pollTimer = null;
    this.dualCommandLatched = false;
    if (
      this.registeredAccelerator != null &&
      this.registeredAccelerator !== ""
    ) {
      GlobalShortcut.unregister(this.registeredAccelerator);
    }
    this.registeredAccelerator = null;
  }

  private async captureFromHotkey(): Promise<void> {
    try {
      const capture = await this.capture();
      this.onCapture(capture);
      this.activate();
    } catch (error) {
      this.onFailure(Error.isError(error) ? error.message : String(error));
      this.activate();
    }
  }

  private cleanupCaptures(): void {
    const now = Date.now();
    const entries = readdirSync(this.capturesDir)
      .flatMap((name) => {
        const path = join(this.capturesDir, name);
        try {
          return [{ modified: statSync(path).mtimeMs, name, path }];
        } catch {
          return [];
        }
      })
      .sort((left, right) => right.modified - left.modified);
    for (const [index, entry] of entries.entries()) {
      if (
        (index >= maxStoredCaptures * 2 ||
          now - entry.modified > captureRetentionMs) &&
        existsSync(entry.path)
      ) {
        rmSync(entry.path, { force: true });
      }
    }
  }
}
