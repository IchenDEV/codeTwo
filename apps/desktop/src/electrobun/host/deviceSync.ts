import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";

import type { DesktopEvent } from "../rpc";
import { BunDatabase } from "./database";
import {
  mergeDeviceSyncDocuments,
  parseDeviceSyncDocument,
  type DeviceSyncDocument,
} from "./deviceSyncDocument";

export type DeviceSyncState =
  | "disabled"
  | "ready"
  | "syncing"
  | "unsupported"
  | "signed-out"
  | "restricted"
  | "unavailable"
  | "error";

export interface DeviceSyncStatus {
  transport: string;
  state: DeviceSyncState;
  enabled: boolean;
  available: boolean;
  last_success_at: number | null;
  message: string | null;
  imported: {
    projects: number;
    sessions: number;
    parts: number;
    memories: number;
  } | null;
}

export interface DeviceSyncProbe {
  state: "ready" | "unsupported" | "signed-out" | "restricted" | "unavailable";
  message?: string;
}

export interface DeviceSyncReplica {
  id: string;
  document: DeviceSyncDocument | null;
  version: string | null;
}

export interface DeviceSyncRead {
  replicas: DeviceSyncReplica[];
}

export interface DeviceSyncTransport {
  /** Stable adapter identity surfaced in status and settings. */
  readonly id: string;
  probe(): Promise<DeviceSyncProbe>;
  /** One transport may expose several replicas, such as multiple paired C2 devices. */
  read(): Promise<DeviceSyncRead>;
  write(document: DeviceSyncDocument, expected: DeviceSyncReplica[]): Promise<{
    state: "written" | "conflict";
    conflicts?: string[];
  }>;
}

interface DeviceSyncSettings {
  enabled: boolean;
  device_id: string;
  last_success_at: number | null;
  last_error: string | null;
  imported: DeviceSyncStatus["imported"];
}

interface HelperEvent {
  state: string;
  message?: string;
  file?: string;
  changeTag?: string;
}

const EMPTY_COUNTS = { projects: 0, sessions: 0, parts: 0, memories: 0 };
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const HELPER_TIMEOUT_MS = 30_000;
const ICLOUD_REPLICA_ID = "icloud:private-v1";

function enclosingAppBundle(executablePath: string): string | null {
  let candidate = resolve(executablePath);
  while (true) {
    if (extname(candidate) === ".app") return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
}

function helperEvent(output: string): HelperEvent | null {
  const lines = output.trim().split("\n");
  const line = lines[lines.length - 1];
  if (!line) return null;
  try {
    return JSON.parse(line) as HelperEvent;
  } catch {
    return null;
  }
}

async function runHelper(command: string[]): Promise<{ event: HelperEvent | null; stderr: string; exitCode: number }> {
  const child = Bun.spawn(command, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const timeout = setTimeout(() => child.kill(), HELPER_TIMEOUT_MS);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { event: helperEvent(stdout), stderr: stderr.trim(), exitCode };
  } finally {
    clearTimeout(timeout);
  }
}

export class ICloudCloudKitTransport implements DeviceSyncTransport {
  readonly id = "icloud";

  private paths(): { helper: string; container: string } | null {
    const application = process.env.CODETWO_APP_BUNDLE_PATH ?? enclosingAppBundle(process.execPath);
    const container = process.env.CODETWO_ICLOUD_CONTAINER_IDENTIFIER;
    if (!application || !container) return null;
    const helper = process.env.CODETWO_ICLOUD_HELPER_PATH ?? join(
      application,
      "Contents",
      "Helpers",
      "CodeTwoCloudSyncHelper.app",
      "Contents",
      "MacOS",
      "CodeTwoCloudSyncHelper",
    );
    return { helper, container };
  }

  async probe(): Promise<DeviceSyncProbe> {
    if (process.platform !== "darwin") {
      return { state: "unsupported", message: "iCloud sync is available on macOS only." };
    }
    const paths = this.paths();
    if (!paths) {
      return { state: "unavailable", message: "Run the packaged C2 app to use iCloud sync." };
    }
    if (!existsSync(paths.helper)) {
      return { state: "unavailable", message: "This build does not include the iCloud helper." };
    }
    const result = await runHelper([paths.helper, "status", "--container", paths.container]);
    const state = result.event?.state;
    if (result.exitCode === 0 && state === "ready") return { state: "ready" };
    if (state === "signed-out" || state === "restricted" || state === "unavailable") {
      return { state, message: result.event?.message };
    }
    return {
      state: "unavailable",
      message: result.event?.message ?? (result.stderr || "The iCloud helper could not start."),
    };
  }

  async read(): Promise<DeviceSyncRead> {
    const paths = this.paths();
    if (!paths) throw new Error("iCloud helper is unavailable");
    const staging = mkdtempSync(join(tmpdir(), "codetwo-icloud-read-"));
    const destination = join(staging, "snapshot.json");
    try {
      const result = await runHelper([
        paths.helper,
        "download",
        "--container",
        paths.container,
        "--destination",
        destination,
      ]);
      if (result.exitCode !== 0 || result.event?.state !== "downloaded") {
        throw new Error(result.event?.message ?? (result.stderr || "Could not read C2 data from iCloud"));
      }
      if (!result.event.file) {
        return {
          replicas: [{
            id: ICLOUD_REPLICA_ID,
            document: null,
            version: result.event.changeTag ?? null,
          }],
        };
      }
      const document = parseDeviceSyncDocument(JSON.parse(readFileSync(destination, "utf8")));
      return {
        replicas: [{
          id: ICLOUD_REPLICA_ID,
          document,
          version: result.event.changeTag ?? null,
        }],
      };
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  }

  async write(document: DeviceSyncDocument, expected: DeviceSyncReplica[]): Promise<{
    state: "written" | "conflict";
    conflicts?: string[];
  }> {
    const paths = this.paths();
    if (!paths) throw new Error("iCloud helper is unavailable");
    const staging = mkdtempSync(join(tmpdir(), "codetwo-icloud-write-"));
    const source = join(staging, "snapshot.json");
    try {
      writeFileSync(source, `${JSON.stringify(document)}\n`, "utf8");
      const command = [
        paths.helper,
        "upload",
        "--container",
        paths.container,
        "--source",
        source,
      ];
      const expectedVersion = expected.find((replica) => replica.id === ICLOUD_REPLICA_ID)?.version ?? null;
      if (expectedVersion) command.push("--expected-change-tag", expectedVersion);
      const result = await runHelper(command);
      if (result.event?.state === "conflict") {
        return { state: "conflict", conflicts: [ICLOUD_REPLICA_ID] };
      }
      if (result.exitCode !== 0 || result.event?.state !== "written") {
        throw new Error(result.event?.message ?? (result.stderr || "Could not save C2 data to iCloud"));
      }
      return { state: "written" };
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  }
}

export class DeviceSyncService {
  private readonly settingsPath: string;
  private settings: DeviceSyncSettings;
  private running: Promise<DeviceSyncStatus> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private startup: ReturnType<typeof setTimeout> | null = null;
  private runtimeEnabled = false;

  constructor(
    private readonly database: BunDatabase,
    dataDir: string,
    private readonly onEvent: (event: DesktopEvent) => void,
    private readonly transport: DeviceSyncTransport,
  ) {
    this.settingsPath = join(dataDir, "device-sync.json");
    this.settings = this.loadSettings();
  }

  start(): void {
    if (this.runtimeEnabled) return;
    this.runtimeEnabled = true;
    if (!this.settings.enabled) return;
    this.startup = setTimeout(() => void this.syncNow(), 1_500);
    this.interval = setInterval(() => void this.syncNow(), SYNC_INTERVAL_MS);
  }

  pause(): void {
    this.runtimeEnabled = false;
    if (this.startup) clearTimeout(this.startup);
    if (this.interval) clearInterval(this.interval);
    this.startup = null;
    this.interval = null;
  }

  async shutdown(): Promise<void> {
    if (this.startup) clearTimeout(this.startup);
    if (this.interval) clearInterval(this.interval);
    this.startup = null;
    this.interval = null;
    if (this.running) await this.running.catch(() => undefined);
    else if (this.runtimeEnabled && this.settings.enabled) await this.syncNow().catch(() => undefined);
    this.runtimeEnabled = false;
  }

  async status(): Promise<DeviceSyncStatus> {
    if (this.running) return this.baseStatus("syncing", true, null);
    const probe = await this.transport.probe();
    if (!this.settings.enabled) {
      return probe.state === "ready"
        ? this.baseStatus("disabled", true, null)
        : this.baseStatus(probe.state, false, probe.message ?? null);
    }
    if (probe.state !== "ready") return this.baseStatus(probe.state, false, probe.message ?? null);
    if (this.settings.last_error) return this.baseStatus("error", true, this.settings.last_error);
    return this.baseStatus("ready", true, null);
  }

  async setEnabled(enabled: boolean): Promise<DeviceSyncStatus> {
    if (!enabled) {
      this.settings.enabled = false;
      this.settings.last_error = null;
      this.saveSettings();
      if (this.startup) clearTimeout(this.startup);
      if (this.interval) clearInterval(this.interval);
      this.startup = null;
      this.interval = null;
      return this.status();
    }

    const probe = await this.transport.probe();
    if (probe.state !== "ready") return this.baseStatus(probe.state, false, probe.message ?? null);
    this.settings.enabled = true;
    this.settings.last_error = null;
    this.saveSettings();
    if (this.runtimeEnabled && !this.interval) {
      this.interval = setInterval(() => void this.syncNow(), SYNC_INTERVAL_MS);
    }
    return this.syncNow();
  }

  async syncNow(): Promise<DeviceSyncStatus> {
    if (!this.settings.enabled) return this.status();
    if (this.running) return this.running;
    this.running = this.performSync().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async performSync(): Promise<DeviceSyncStatus> {
    this.onEvent({ name: "device-sync-status", payload: this.baseStatus("syncing", true, null) });
    try {
      const probe = await this.transport.probe();
      if (probe.state !== "ready") {
        const status = this.baseStatus(probe.state, false, probe.message ?? null);
        this.onEvent({ name: "device-sync-status", payload: status });
        return status;
      }

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const remote = await this.transport.read();
        const local = this.database.deviceSyncSnapshot(this.settings.device_id);
        const merged = mergeDeviceSyncDocuments([
          local,
          ...remote.replicas.flatMap((replica) => replica.document ? [replica.document] : []),
        ], this.settings.device_id);
        const imported = this.database.importDeviceSyncDocument(merged);
        const written = await this.transport.write(merged, remote.replicas);
        if (written.state === "conflict") continue;

        this.settings.last_success_at = Date.now();
        this.settings.last_error = null;
        this.settings.imported = imported;
        this.saveSettings();
        const status = this.baseStatus("ready", true, null);
        this.onEvent({ name: "device-sync-changed", payload: imported });
        this.onEvent({ name: "device-sync-status", payload: status });
        return status;
      }
      throw new Error("Another device changed the sync data while C2 was syncing. Try again.");
    } catch (error) {
      this.settings.last_error = error instanceof Error ? error.message : String(error);
      this.saveSettings();
      const status = this.baseStatus("error", true, this.settings.last_error);
      this.onEvent({ name: "device-sync-status", payload: status });
      return status;
    }
  }

  private loadSettings(): DeviceSyncSettings {
    try {
      const value = JSON.parse(readFileSync(this.settingsPath, "utf8")) as Partial<DeviceSyncSettings>;
      return {
        enabled: value.enabled === true,
        device_id: typeof value.device_id === "string" && value.device_id ? value.device_id : crypto.randomUUID(),
        last_success_at: typeof value.last_success_at === "number" ? value.last_success_at : null,
        last_error: typeof value.last_error === "string" ? value.last_error : null,
        imported: value.imported ?? null,
      };
    } catch {
      return {
        enabled: false,
        device_id: crypto.randomUUID(),
        last_success_at: null,
        last_error: null,
        imported: null,
      };
    }
  }

  private saveSettings(): void {
    mkdirSync(dirname(this.settingsPath), { recursive: true });
    const temporary = `${this.settingsPath}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(this.settings, null, 2)}\n`, "utf8");
    renameSync(temporary, this.settingsPath);
  }

  private baseStatus(state: DeviceSyncState, available: boolean, message: string | null): DeviceSyncStatus {
    return {
      transport: this.transport.id,
      state,
      enabled: this.settings.enabled,
      available,
      last_success_at: this.settings.last_success_at,
      message,
      imported: this.settings.imported ?? { ...EMPTY_COUNTS },
    };
  }
}
