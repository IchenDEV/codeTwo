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
      standardVersion: "1.2.0",
      commands: [{
        id: "review.run",
        title: "Review workspace",
        description: "Review the active workspace.",
        argsSchema: { type: "object", additionalProperties: false },
      }],
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
    expect(parsed.standardVersion).toBe("1.2.0");
    expect(parsed.runtime?.scopeSupport).toEqual(["user", "project"]);
    expect(parsed.commands).toEqual([
      expect.objectContaining({ id: "review.run", title: "Review workspace" }),
    ]);
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
      extensions: { "dev.codetwo": { standardVersion: "1.2.0" } },
    })).toMatchObject({ runtime: null, commands: [], ui: [], languageServers: [] });

    expect(() => parsePluginManifest({
      ...manifest,
      extensions: {
        "dev.codetwo": {
          standardVersion: "1.2.0",
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

  test("rejects old standards and requires declared runtime commands", () => {
    expect(() => parsePluginManifest({
      ...manifest,
      extensions: {
        "dev.codetwo": {
          standardVersion: "1.0.0",
          runtime: manifest.extensions["dev.codetwo"].runtime,
          ui: manifest.extensions["dev.codetwo"].ui,
        },
      },
    })).toThrow("Unsupported C2 plugin standard");

    expect(() => parsePluginManifest({
      ...manifest,
      extensions: { "dev.codetwo": { standardVersion: "1.1.0" } },
    })).toThrow("Unsupported C2 plugin standard");

    expect(() => parsePluginManifest({
      ...manifest,
      extensions: {
        "dev.codetwo": {
          standardVersion: "1.2.0",
          runtime: manifest.extensions["dev.codetwo"].runtime,
        },
      },
    })).toThrow("require extensions.dev.codetwo.commands");

    expect(() => parsePluginManifest({
      ...manifest,
      extensions: {
        "dev.codetwo": {
          ...manifest.extensions["dev.codetwo"],
          commands: [{
            ...manifest.extensions["dev.codetwo"].commands[0],
            argsSchema: [],
          }],
        },
      },
    })).toThrow("commands[0] is invalid");

    expect(() => parsePluginManifest({
      ...manifest,
      extensions: {
        "dev.codetwo": {
          ...manifest.extensions["dev.codetwo"],
          ui: [{ ...manifest.extensions["dev.codetwo"].ui[0], command: "review.missing" }],
        },
      },
    })).toThrow("references undeclared runtime command");
  });

  test("binds a 1.2 connector to one declared runtime command", () => {
    const connector = parsePluginManifest({
      ...manifest,
      extensions: {
        "dev.codetwo": {
          ...manifest.extensions["dev.codetwo"],
          standardVersion: "1.2.0",
          connectors: [{
            id: "workspace",
            provider: "test-chat",
            command: "review.run",
            capabilities: ["connection", "conversations", "documents"],
          }],
        },
      },
    });
    expect(connector.connectors).toEqual([
      expect.objectContaining({
        id: "workspace",
        provider: "test-chat",
        command: "review.run",
        capabilities: ["connection", "conversations", "documents"],
      }),
    ]);

    expect(() => parsePluginManifest({
      ...manifest,
      extensions: {
        "dev.codetwo": {
          ...manifest.extensions["dev.codetwo"],
          standardVersion: "1.2.0",
          connectors: [{
            id: "workspace",
            provider: "test-chat",
            command: "review.missing",
            capabilities: ["conversations"],
          }],
        },
      },
    })).toThrow("references undeclared runtime command");
  });

  test("rejects bundles outside the supported C2 standards", () => {
    expect(() => parsePluginManifest({
      $schema: AGENT_PLUGIN_SCHEMA,
      name: "missing-extension",
      version: "1.0.0",
    })).toThrow("require extensions.dev.codetwo");

    expect(() => parsePluginManifest({
      ...manifest,
      extensions: { "dev.codetwo": { standardVersion: "1.3.0" } },
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
