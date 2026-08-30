// @ts-nocheck
import { describe, expect, test } from "bun:test";

import { listPlugins } from "../src/bridge";
import {
  buildPluginManagerCatalog,
  normalizePluginProjectPath,
  pluginManagerComponentEnabled,
  toManagedPluginScope,
} from "../src/plugins/catalog";

function entry(id, overrides = {}) {
  return {
    id,
    description: `${id} description`,
    metadata: {
      origin: "built_in",
      role: "built_in",
      category: "other",
      scope_support: ["user", "project"],
      essential: false,
      default_enabled: true,
    },
    dependencies: { required: [], optional: [] },
    state: "inherit",
    enabled: true,
    running: true,
    status: "active",
    missing: [],
    error: null,
    config: {},
    schema: null,
    available: false,
    components: {},
    commands: [],
    services: [],
    ...overrides,
  };
}

const emptyCatalog = {
  graph_revision: 1,
  config_revision: 1,
  recovery: { kind: "normal" },
  plugins: [],
};

const emptyCounts = {
  skills: 0,
  subagents: 0,
  mcp_servers: 0,
  scaffolds: 0,
  commands: 0,
  runtime_commands: 0,
  hooks: 0,
  lsp_servers: 0,
  monitors: 0,
  apps: 0,
  ui: 0,
  connectors: 0,
  scenes: 0,
  pipelines: 0,
  runtime: 0,
};

function bundleRecord(overrides = {}) {
  return {
    id: "fixture",
    name: "Fixture",
    version: "1.0.0",
    description: "Fixture bundle",
    author: "C2",
    source: "Local",
    repository: "",
    standard_version: "1.2.0",
    enabled: true,
    trusted: true,
    scope: "user",
    counts: emptyCounts,
    scaffolds: [],
    extension_components: [],
    runtime_commands: [],
    ui_contributions: [],
    connector_contributions: [],
    lsp_servers: [],
    diagnostics: [],
    ...overrides,
    counts: { ...emptyCounts, ...overrides.counts },
  };
}

describe("unified plugin catalog adapter", () => {
  test("keeps the browser preview aligned with Docker's static command manifest", async () => {
    const preview = (await listPlugins()).find((plugin) => plugin.id === "docker-tools-preview");
    const manifest = await Bun.file(
      new URL("../../../packs/docker/plugin.json", import.meta.url),
    ).json();
    const declared = manifest.extensions["dev.codetwo"].commands.map(({ id, title }) => ({
      id,
      title,
    }));

    expect(preview?.standard_version).toBe("1.2.0");
    expect(preview?.counts).toMatchObject({ commands: 0, runtime_commands: declared.length });
    expect(preview?.runtime_commands?.map(({ id, title }) => ({ id, title }))).toEqual(declared);
  });

  test("normalizes project paths and maps the serde scope boundary", () => {
    expect(normalizePluginProjectPath("/tmp/demo///")).toBe("/tmp/demo");
    expect(normalizePluginProjectPath("/")).toBe("/");
    expect(toManagedPluginScope({ kind: "project", projectPath: "/tmp/demo/" })).toEqual({
      kind: "project",
      projectPath: "/tmp/demo",
    });
  });

  test("merges built-in, host, bundle, skill, and marketplace descriptors without executable UI", () => {
    const catalog = {
      ...emptyCatalog,
      plugins: [
        entry("kernel", {
          metadata: {
            origin: "built_in",
            role: "core",
            category: "foundation",
            scope_support: ["user"],
            essential: true,
            default_enabled: true,
          },
        }),
        entry("browser", {
          metadata: {
            origin: "host",
            role: "built_in",
            category: "interface",
            scope_support: ["user"],
            essential: false,
            default_enabled: true,
          },
          commands: ["browser.navigate"],
          services: ["browser"],
        }),
        entry("device-sync", {
          metadata: {
            origin: "host",
            role: "built_in",
            category: "integration",
            scope_support: ["user"],
            essential: false,
            default_enabled: true,
          },
          services: ["device-sync"],
        }),
        entry("skills"),
      ],
    };
    const bundle = bundleRecord({
      id: "review",
      name: "Review Tools",
      version: "1.0.0",
      description: "Review bundle",
      author: "C2",
      source: "GitHub · c2/review",
      repository: "https://example.test/review",
      enabled: true,
      trusted: true,
      scope: "user",
      counts: { runtime: 1, runtime_commands: 1, skills: 2, connectors: 1 },
      scaffolds: [],
      extension_components: [{ kind: "lsp", name: "rust", path: "plugin.json#extensions.dev.codetwo.languageServers", status: "ready" }],
      runtime_commands: [{
        id: "review.run",
        title: "Review workspace",
        description: "Review this workspace.",
        argsSchema: null,
      }],
      connector_contributions: [{
        id: "workspace",
        provider: "test-chat",
        command: "review.run",
        capabilities: ["conversations" as const],
      }],
      diagnostics: [],
    });
    const model = buildPluginManagerCatalog({
      catalog,
      bundles: [bundle],
      skills: [{ id: "review-skill", name: "Review", description: "Review", kind: "agent_skill", source: "Plugin · Review Tools", icon: null }],
      market: [{ id: "browser-tool", name: "Browser tool", description: "Browser", author: "C2", tags: ["mcp"], icon: null, kind: "mcp", installed: false }],
      scope: { kind: "user" },
    });

    expect(model.plugins.map((plugin) => [plugin.id, plugin.source])).toContainEqual(["browser", "host"]);
    expect(model.plugins.find((plugin) => plugin.id === "kernel")).toBeUndefined();
    expect(model.plugins.map((plugin) => [plugin.id, plugin.source])).toContainEqual(["bundle:review", "bundle"]);
    expect(model.plugins.find((plugin) => plugin.id === "browser")).toMatchObject({
      commands: ["browser.navigate"],
      services: ["browser"],
    });
    expect(model.plugins.find((plugin) => plugin.id === "bundle:review")?.bundle).toMatchObject({
      id: "review",
      repository: "https://example.test/review",
      trusted: true,
      requiresTrust: true,
      runtimeManaged: false,
      contributions: [
        { id: "runtime", label: "Process runtime", count: 1 },
        { id: "skills", label: "Skills", count: 2 },
        { id: "runtime_commands", label: "Runtime commands", count: 1 },
        { id: "connectors", label: "Connectors", count: 1 },
      ],
    });
    expect(model.plugins.find((plugin) => plugin.id === "bundle:review")?.commands)
      .toEqual(["review.run"]);
    expect(model.components.find((component) => component.id === "plugin-manager.page")).toBeUndefined();
    expect(model.components.find((component) => component.id === "device-sync.settings")).toMatchObject({
      pluginId: "device-sync",
      kind: "settingsSection",
      slot: "settings.sections",
    });
    expect(model.components.find((component) => component.id === "bundle:review:extension:lsp:rust")?.slot).toBe("plugin.json#extensions.dev.codetwo.languageServers");
    expect(model.components.some((component) => component.kind === "connector")).toBe(false);
    expect(model.components.find((component) => component.id === "skill:review-skill")).toMatchObject({
      pluginId: "bundle:review",
      policyPluginId: "skills",
      manageable: true,
      supportedScopes: ["user", "project"],
    });
    expect(model.marketplaceItems[0]).toMatchObject({ id: "market:browser-tool", installable: true });
  });

  test("inherits component policy independently before applying the project plugin gate", () => {
    const userCatalog = {
      ...emptyCatalog,
      plugins: [entry("browser", { enabled: false, components: { "browser.dock": "enabled" } })],
    };
    const projectCatalog = {
      ...emptyCatalog,
      plugins: [entry("browser", { state: "enabled", enabled: true, components: {} })],
    };
    const model = buildPluginManagerCatalog({
      catalog: projectCatalog,
      userCatalog,
      bundles: [
        bundleRecord({
          id: "review-tools-local",
          name: "Review Tools",
          version: "0.9.0",
          description: "Review bundle",
          author: null,
          source: "Marketplace · Local tools",
          repository: "/tmp/review-tools",
          enabled: true,
          trusted: true,
          scope: "user",
          counts: {},
          components: [],
          scaffolds: [],
          extension_components: [],
          runtime_commands: [],
          ui_contributions: [],
          lsp_servers: [],
          diagnostics: [],
        }),
      ],
      skills: [],
      market: [],
      scope: { kind: "project", projectPath: "/tmp/demo" },
    });

    expect(model.components.find((component) => component.id === "browser.dock")?.state).toMatchObject({
      effectiveEnabled: true,
      override: "inherit",
    });
    expect(pluginManagerComponentEnabled(model.components, "browser.dock")).toBe(true);
    expect(pluginManagerComponentEnabled(model.components, "browser.dock", false)).toBe(false);
  });

  test("fails every renderer component closed until the active catalog is ready", () => {
    expect(pluginManagerComponentEnabled([], "browser.dock", false)).toBe(false);
    expect(pluginManagerComponentEnabled([], "voice.composer", false)).toBe(false);
    expect(pluginManagerComponentEnabled([], "plugin-manager.page", false)).toBe(false);
  });

  test("does not misrepresent bundle install provenance as project-local lifecycle support", () => {
    const bundle = bundleRecord({
      id: "local-tools",
      name: "Local tools bundle",
      version: "1.0.0",
      description: "Existing record with local provenance",
      author: "C2",
      source: "Local",
      repository: "/tmp/plugin",
      enabled: true,
      trusted: true,
      scope: "local",
        counts: {},
      scaffolds: [],
      extension_components: [{ kind: "hook", name: "session", path: "hooks.json", status: "unsupported" }],
      diagnostics: [],
    });
    const model = buildPluginManagerCatalog({
      catalog: emptyCatalog,
      bundles: [bundle],
      skills: [],
      market: [],
      scope: { kind: "project", projectPath: "/tmp/demo" },
    });

    expect(model.plugins[0]?.supportedScopes).toEqual(["user"]);
    expect(model.components[0]?.supportedScopes).toEqual(["user"]);
    expect(model.components[0]?.state.status).toBe("unsupported");
  });

  test("uses managed project policy only for the bundle process runtime", () => {
    const bundle = bundleRecord({
      id: "review",
      name: "Review Tools",
      version: "1.0.0",
      description: "Review bundle",
      author: "C2",
      source: "GitHub · c2/review",
      repository: "https://example.test/review",
      // Installation state remains global descriptor data. It must not override project policy.
      enabled: true,
      trusted: true,
      scope: "user",
      counts: { runtime: 1 },
      scaffolds: [],
      extension_components: [{ kind: "lsp", name: "rust", path: "plugin.json#extensions.dev.codetwo.languageServers", status: "ready" }],
      ui_contributions: [{
        id: "review",
        slot: "session.header",
        label: "Review",
        description: "Review this workspace.",
        command: "review.run",
        input: null,
        order: 0,
      }],
      diagnostics: [],
    });
    const metadata = {
      origin: "third_party",
      role: "extension",
      category: "developer_tools",
      scope_support: ["user", "project"],
      essential: false,
      default_enabled: true,
    };
    const extensionId = "bundle:review:extension:lsp:rust";
    const uiId = "bundle:review:ui:review";
    const userCatalog = {
      ...emptyCatalog,
      plugins: [entry("bundle:review", {
        metadata,
        state: "enabled",
        enabled: true,
        components: { [uiId]: "enabled" },
      })],
    };
    const projectCatalog = {
      ...emptyCatalog,
      plugins: [entry("bundle:review", {
        metadata,
        state: "disabled",
        enabled: false,
        running: false,
        status: "disposed",
        components: { [uiId]: "disabled" },
      })],
    };

    const model = buildPluginManagerCatalog({
      catalog: projectCatalog,
      userCatalog,
      bundles: [bundle],
      skills: [{
        id: "review-skill",
        name: "Review",
        description: "Review",
        kind: "agent_skill",
        source: "Plugin · Review Tools",
        icon: null,
      }],
      market: [],
      scope: { kind: "project", projectPath: "/tmp/demo" },
    });

    const bundlePlugins = model.plugins.filter((plugin) => plugin.id === "bundle:review");
    expect(bundlePlugins).toHaveLength(1);
    expect(bundlePlugins[0]).toMatchObject({
      name: "Review Tools",
      version: "1.0.0",
      author: "C2",
      sourceLabel: "GitHub · c2/review",
      supportedScopes: ["user", "project"],
      state: { effectiveEnabled: false, override: "disabled", status: "disabled" },
      bundle: { id: "review", requiresTrust: true, runtimeManaged: true },
    });
    expect(model.components.find((component) => component.id === extensionId)).toMatchObject({
      manageable: false,
      supportedScopes: ["user"],
      state: { effectiveEnabled: true, status: "active" },
    });
    expect(model.components.find((component) => component.id === uiId)).toMatchObject({
      manageable: true,
      supportedScopes: ["user", "project"],
      state: { effectiveEnabled: false, override: "disabled", status: "disabled" },
    });
    expect(model.components.find((component) => component.id === "skill:review-skill")).toMatchObject({
      pluginId: "bundle:review",
      manageable: false,
      supportedScopes: ["user"],
      state: { effectiveEnabled: true, status: "active" },
    });
  });

  test("includes local marketplace bundles and skill actions in the unified model", () => {
    const model = buildPluginManagerCatalog({
      catalog: emptyCatalog,
      bundles: [],
      skills: [
        {
          id: "release-review",
          name: "Release review",
          description: "Review a release.",
          kind: "agent_skill",
          source: "GitHub · c2/release-review",
          icon: null,
        },
      ],
      market: [
        {
          id: "release-review",
          name: "Release review",
          description: "Review a release.",
          author: "C2",
          tags: ["review"],
          icon: null,
          kind: "skill",
          installed: true,
        },
      ],
      localMarketplace: {
        name: "local-tools",
        display_name: "Local tools",
        description: "Local plugin bundles.",
        manifest_path: "/tmp/marketplace.json",
        root: "/tmp",
        diagnostics: [
          { code: "preview", message: "Preview catalog", entry: null },
        ],
        plugins: [
          {
            name: "review-tools",
            display_name: "Review Tools",
            description: "Review bundle",
            version: "1.0.0",
            category: "development",
            installation_policy: "allowed",
            authentication_policy: "none",
            default_enabled: true,
            source: { kind: "local", path: "./review-tools" },
            installable: true,
            diagnostic: null,
          },
        ],
      },
      scope: { kind: "user" },
    });

    expect(
      model.components.find(
        (component) => component.id === "skill:release-review",
      )?.skill,
    ).toEqual({ id: "release-review", removable: true });
    expect(model.marketplaceItems[0]).toMatchObject({
      id: "marketplace:local-tools:review-tools",
      name: "Review Tools",
      installed: false,
      installable: true,
      marketplace: {
        manifestPath: "/tmp/marketplace.json",
        pluginName: "review-tools",
      },
    });
    expect(model.marketplaceSources).toEqual([
      {
        id: "/tmp/marketplace.json",
        name: "Local tools",
        description: "Local plugin bundles.",
        diagnostics: ["Preview catalog"],
      },
    ]);
  });
});
