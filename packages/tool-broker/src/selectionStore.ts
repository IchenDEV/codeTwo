import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { HOST_TOOLS_CONFIG_FILE } from "./contracts";

export type SelectionKind = "computer_use" | "browser_use";

export interface SelectionStorePort {
  set(kind: SelectionKind, providerId: string, backendId: string): void;
}

type Document = Record<string, unknown>;

function table(value: unknown): Document {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Document : {};
}

/** Atomic persistence seam; catalog and routing remain owned by ToolBroker. */
export class JsonSelectionStore implements SelectionStorePort {
  constructor(private readonly dataDir: string) {}

  set(kind: SelectionKind, providerId: string, backendId: string): void {
    mkdirSync(this.dataDir, { recursive: true });
    const path = join(this.dataDir, HOST_TOOLS_CONFIG_FILE);
    let document: Document = { schema_version: 1 };
    if (existsSync(path)) document = table(JSON.parse(readFileSync(path, "utf8")));
    if (document.schema_version !== undefined && document.schema_version !== 1) {
      throw new Error(`schema ${JSON.stringify(document.schema_version)} is unsupported; expected 1`);
    }
    document.schema_version = 1;
    const field = `${kind}_selection`;
    document[field] = {
      ...table(document[field]),
      [providerId]: backendId,
    };
    const temporary = join(
      this.dataDir,
      `.${HOST_TOOLS_CONFIG_FILE}.${process.pid}.${Date.now()}.tmp`,
    );
    writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`);
    try {
      renameSync(temporary, path);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
  }
}
