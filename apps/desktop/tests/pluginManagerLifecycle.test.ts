// @ts-nocheck
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  applyPluginManagerChange,
  planPluginManagerChange,
} from "../src/plugins/lifecycle";

describe("unified plugin manager lifecycle", () => {
  test("plans and applies a project bundle change through the revision-bound backend API", async () => {
    const requests = [];
    const applied = [];
    const request = {
      targetKind: "plugin",
      targetId: "bundle:review",
      targetName: "Review Tools",
      scope: { kind: "project", projectPath: "/tmp/demo/" },
      desiredState: "disabled",
    };

    const plan = await planPluginManagerChange({
      request,
      plugins: [
        {
          id: "bundle:review",
          name: "Review Tools",
          source: "bundle",
          supportedScopes: ["user", "project"],
          state: {
            effectiveEnabled: true,
            override: "inherit",
            status: "active",
          },
        },
      ],
      components: [],
      planChange: async (managedRequest) => {
        requests.push(managedRequest);
        return {
          id: "backend-plan-17",
          graph_revision: 17,
          config_revision: 4,
          request: managedRequest,
          affected: ["bundle:review"],
          active_resources: [
            {
              plugin: "bundle:review",
              kind: "process",
              id: "review-worker",
              label: "Review worker",
            },
          ],
          requires_confirmation: true,
        };
      },
    });

    expect(requests).toEqual([
      {
        plugin: "bundle:review",
        scope: { kind: "project", projectPath: "/tmp/demo" },
        state: "disabled",
        component: undefined,
      },
    ]);
    expect(plan).toMatchObject({
      confirmationId: "backend-plan-17",
      graphRevision: 17,
      request,
      requiresConfirmation: true,
      affectedPlugins: [{ id: "bundle:review", name: "Review Tools" }],
      activeResources: [
        { id: "review-worker", label: "Review worker", kind: "process" },
      ],
    });

    await applyPluginManagerChange(plan, async (id) => {
      applied.push(id);
      return {
        graph_revision: 18,
        config_revision: 5,
        affected: ["bundle:review"],
      };
    });
    expect(applied).toEqual(["backend-plan-17"]);
  });

  test("routes skill and MCP component policy through the skills runtime owner", async () => {
    const requests = [];
    const request = {
      targetKind: "component",
      targetId: "skill:docs-search",
      targetName: "docs-search",
      scope: { kind: "user" },
      desiredState: "disabled",
    };

    await planPluginManagerChange({
      request,
      plugins: [
        {
          id: "skills",
          name: "Skills",
          source: "builtin",
          supportedScopes: ["user", "project"],
          state: { effectiveEnabled: true, status: "active" },
        },
      ],
      components: [
        {
          id: "skill:docs-search",
          pluginId: "bundle:docs",
          pluginName: "Docs",
          policyPluginId: "skills",
          name: "docs-search",
          kind: "mcp",
          source: "bundle",
          supportedScopes: ["user", "project"],
          state: { effectiveEnabled: true, status: "active" },
        },
      ],
      planChange: async (managedRequest) => {
        requests.push(managedRequest);
        return {
          id: "skill-plan",
          graph_revision: 1,
          config_revision: 1,
          request: managedRequest,
          affected: ["skills"],
          active_resources: [],
          requires_confirmation: false,
        };
      },
    });

    expect(requests).toEqual([
      {
        plugin: "skills",
        scope: { kind: "user" },
        state: "disabled",
        component: "skill:docs-search",
      },
    ]);
  });

  test("routes every plugin operation through the single unified App surface", () => {
    const app = readFileSync(
      resolve(import.meta.dir, "../src/App.tsx"),
      "utf-8"
    );
    const openManagerStart = app.indexOf("const openPluginManager");
    const openManagerEnd = app.indexOf(
      "const refreshPluginManagerData",
      openManagerStart
    );
    const openManager = app.slice(openManagerStart, openManagerEnd);
    const managerStart = app.indexOf("const planManagerChange");
    const managerEnd = app.indexOf("const saveManagerConfig", managerStart);
    const managerLifecycle = app.slice(managerStart, managerEnd);
    const managerSurface = app.slice(app.indexOf("<PluginManagerPage"));

    expect(managerLifecycle).toContain("planPluginManagerChange");
    expect(managerLifecycle).toContain("applyPluginManagerChange");
    expect(managerLifecycle).not.toContain("Date.now()");
    expect(managerLifecycle).not.toContain("setPluginEnabled");
    expect(managerSurface).toContain("setPluginEnabled(pluginId, enabled)");
    expect(managerSurface).toContain("applyPluginScaffold");
    expect(managerSurface).toContain("pickPluginMarketplace");
    expect(openManager).toContain("if (railOverlay) setNarrowRailOpen(false)");
    expect(app).not.toContain("<PluginHub");
    expect(app).not.toContain("showBundlePluginTools");
    expect(app).not.toContain('from "./market/Market"');
  });
});
