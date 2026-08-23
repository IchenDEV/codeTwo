import { describe, expect, test } from "bun:test";

import {
  AGENT_PLUGIN_SCHEMA,
  parsePluginManifest,
  pluginUiComponentId,
} from "../src/pluginModel";

const manifest = {
  $schema: AGENT_PLUGIN_SCHEMA,
  name: "review-tools",
  version: "1.2.0",
  description: "Review the active workspace.",
  author: { name: "C2" },
  extensions: {
    "dev.codetwo": {
      standardVersion: "1.0.0",
      runtime: {
        command: "node",
        args: ["dist/plugin.js"],
        scopeSupport: ["project"],
      },
      ui: [{
        id: "review",
        slot: "session.header",
        label: "Review",
        command: "review.run",
      }],
    },
  },
};

describe("C2 plugin package model", () => {
  test("normalizes runtime and UI contributions into one distribution contract", () => {
    const parsed = parsePluginManifest(manifest);
    expect(parsed.standardVersion).toBe("1.0.0");
    expect(parsed.runtime?.scopeSupport).toEqual(["user", "project"]);
    expect(parsed.ui).toEqual([
      expect.objectContaining({ id: "review", command: "review.run", order: 0 }),
    ]);
    expect(pluginUiComponentId("review-tools", "review"))
      .toBe("bundle:review-tools:ui:review");
  });

  test("accepts data-only C2 plugins and rejects invalid contributions", () => {
    expect(parsePluginManifest({
      $schema: AGENT_PLUGIN_SCHEMA,
      name: "scene-pack",
      version: "1.0.0",
      extensions: { "dev.codetwo": { standardVersion: "1.0.0" } },
    })).toMatchObject({ runtime: null, ui: [], languageServers: [] });

    expect(() => parsePluginManifest({
      ...manifest,
      extensions: {
        "dev.codetwo": {
          standardVersion: "1.0.0",
          ui: manifest.extensions["dev.codetwo"].ui,
        },
      },
    })).toThrow("UI action contributions require");

    expect(() => parsePluginManifest({
      ...manifest,
      extensions: {
        "dev.codetwo": {
          ...manifest.extensions["dev.codetwo"],
          ui: [
            ...manifest.extensions["dev.codetwo"].ui,
            ...manifest.extensions["dev.codetwo"].ui,
          ],
        },
      },
    })).toThrow("duplicate ids");
  });

  test("rejects bundles outside the exact current standard", () => {
    expect(() => parsePluginManifest({
      $schema: AGENT_PLUGIN_SCHEMA,
      name: "missing-extension",
      version: "1.0.0",
    })).toThrow("require extensions.dev.codetwo");

    expect(() => parsePluginManifest({
      ...manifest,
      extensions: { "dev.codetwo": { standardVersion: "1.1.0" } },
    })).toThrow("Unsupported C2 plugin standard");

    expect(() => parsePluginManifest({
      ...manifest,
      extensions: {
        "dev.codetwo": {
          ...manifest.extensions["dev.codetwo"],
          runtimePath: "plugin.js",
        },
      },
    })).toThrow("Unknown C2 plugin fields");
  });
});
