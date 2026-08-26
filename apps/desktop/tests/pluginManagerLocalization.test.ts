import { describe, expect, test } from "bun:test";

import { zhCN, type StringKey } from "../src/i18n/strings";
import {
  createPluginManagerLabels,
  localizePluginManagerCatalog,
} from "../src/plugins/localization";

const t = (key: StringKey, vars?: Record<string, string | number>) => {
  const template = zhCN[key];
  return vars
    ? template.replace(/\{(\w+)\}/g, (whole, name) =>
        name in vars ? String(vars[name]) : whole,
      )
    : template;
};

describe("plugin manager localization", () => {
  test("translates manager chrome, statuses, and known contribution labels", () => {
    const labels = createPluginManagerLabels(t);

    expect(labels.title).toBe("功能与插件");
    expect(labels.status.active).toBe("运行中");
    expect(labels.sourceNames.host).toBe("宿主功能");
    expect(labels.contribution("runtime", "Process runtime")).toBe(
      "进程运行时",
    );
    expect(labels.componentKind("composerAction")).toBe("输入区操作");
    expect(labels.reviewSource).toBe("检查源码");
    expect(labels.trustBeforeEnabling).toBe("信任后才能启用");
    expect(labels.changeApplied("记忆", "disabled")).toBe(
      "记忆 现已设为已停用。",
    );
  });

  test("translates first-party catalog metadata without rewriting third-party identity", () => {
    const model = localizePluginManagerCatalog(
      {
        plugins: [
          {
            id: "core",
            name: "Core",
            description: "Runtime",
            source: "host",
            category: "foundation",
            supportedScopes: ["user"],
            state: { effectiveEnabled: true, status: "active" },
          },
          {
            id: "bundle:review-tools",
            name: "Review Tools",
            description: "Release review workflow",
            source: "bundle",
            category: "developer_tools",
            supportedScopes: ["user"],
            state: { effectiveEnabled: true, status: "active" },
          },
        ],
        components: [
          {
            id: "plugin-manager.page",
            pluginId: "kernel",
            pluginName: "Kernel",
            name: "Plugin manager",
            description: "Recovery plane",
            kind: "page",
            source: "host",
            supportedScopes: ["user"],
            state: { effectiveEnabled: true, status: "active" },
          },
          {
            id: "bundle:review-tools:extension:ui:Review",
            pluginId: "bundle:review-tools",
            pluginName: "Review Tools",
            name: "Review",
            description: "review.ts",
            kind: "ui",
            source: "bundle",
            supportedScopes: ["user"],
            state: { effectiveEnabled: true, status: "active" },
          },
        ],
        marketplaceItems: [],
        marketplaceSources: [],
      },
      t,
    );

    expect(model.plugins[0]).toMatchObject({
      name: "核心",
      category: "基础能力",
    });
    expect(model.components[0]).toMatchObject({
      name: "插件管理器",
      pluginName: "内核",
    });
    expect(model.plugins[1]).toMatchObject({
      name: "Review Tools",
      description: "Release review workflow",
    });
    expect(model.components[1]).toMatchObject({
      name: "Review",
      pluginName: "Review Tools",
    });
  });
});
