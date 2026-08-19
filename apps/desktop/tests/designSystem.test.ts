import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  checkContrastContracts,
  fingerprint,
  increases,
  scanSource,
} from "../scripts/check-design-system";

const root = resolve(import.meta.dir, "..");
const tokenSource = readFileSync(resolve(root, "src/design/tokens.css"), "utf8");
const allowlist = JSON.parse(
  readFileSync(resolve(root, "scripts/design-system-allowlist.json"), "utf8"),
);

describe("C2 design system", () => {
  test("keeps every declared light and dark contrast pair above its contract", () => {
    const results = checkContrastContracts(tokenSource);
    expect(results).toHaveLength(12);
    for (const result of results) {
      expect(result.ratio).toBeGreaterThanOrEqual(result.minimum);
    }
  });

  test("keeps the eight approved type roles in the token source", () => {
    for (const role of [
      "large-title",
      "page-title",
      "section",
      "dialog",
      "body",
      "callout",
      "metadata",
      "caption",
    ]) {
      expect(tokenSource).toContain(`--ds-type-${role}-size:`);
      expect(tokenSource).toContain(`--ds-type-${role}-leading:`);
    }
  });

  test("keeps all new design-preview implementation off the legacy debt baseline", () => {
    const violations = scanSource(root, allowlist).filter((violation) =>
      violation.path.startsWith("src/design/"),
    );
    expect(violations).toEqual([]);
  });

  test("allows legacy debt to decrease but rejects the first new occurrence", () => {
    const violation = {
      rule: "raw-color" as const,
      path: "src/example.tsx",
      line: 4,
      value: "#ffffff",
      replacement: "use a semantic color",
    };
    const accepted = {
      version: 1 as const,
      baseCommit: "test",
      counts: { [fingerprint(violation)]: 1 },
    };
    const empty = { version: 1 as const, baseCommit: "test", counts: {} };

    expect(increases([violation], accepted)).toEqual([]);
    expect(increases([violation], empty)).toEqual([violation]);
  });
});
