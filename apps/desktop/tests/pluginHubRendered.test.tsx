// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, button, click, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { PluginHub } = await import("../src/market/Market");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function renderHub() {
  return mount(
    <I18nProvider>
      <PluginHub
        plugins={[]}
        skills={[]}
        items={[]}
        cwd="/tmp/mini-game"
        onUse={() => {}}
        onInstallMarket={async () => {}}
        onUninstallSkill={async () => {}}
        onImportGithub={async () => {
          throw new Error("not used");
        }}
        onOpenMarketplace={async () => null}
        onInstallMarketplacePlugin={async () => {
          throw new Error("not used");
        }}
        onUninstallPlugin={async () => {}}
        onSetPluginEnabled={async () => {}}
        onSetPluginTrusted={async () => {}}
        onApplyScaffold={async () => ({ files: 0 })}
        onNew={() => {}}
        onClose={() => {}}
      />
    </I18nProvider>,
  );
}

describe("PluginHub layout", () => {
  test("renders as an open Codex-style content page instead of a dialog", async () => {
    activateDom();
    const view = renderHub();

    const page = view.container.querySelector("[data-plugin-hub-page]");
    const content = view.container.querySelector("[data-plugin-hub-content]");
    const header = content?.querySelector("header");
    const title = header?.querySelector("h1");
    const description = header?.querySelector("p");
    const search = view.container.querySelector("[data-plugin-hub-search]");
    const tabs = view.container.querySelector("[data-plugin-hub-tabs]");

    expect(page?.tagName).toBe("MAIN");
    expect(page?.className).toContain("flex-1");
    expect(content?.className).toContain("max-w-4xl");
    expect(header?.className).toContain("flex-col");
    expect(header?.className).toContain("sm:flex-row");
    expect(title?.className).toContain("text-display");
    expect(title?.className).toContain("tracking-tight");
    expect(description?.className).toContain("max-w-2xl");
    expect(description?.className).toContain("leading-relaxed");
    expect(search?.getAttribute("type")).toBe("search");
    expect(tabs?.getAttribute("role")).toBe("tablist");
    expect(tabs?.querySelectorAll('[role="tab"]').length).toBe(3);
    expect(dom.document.querySelector('[role="dialog"]')).toBeNull();
    expect(
      Array.from(view.container.querySelectorAll("button")).some(
        (candidate) => candidate.textContent?.trim() === "Done",
      ),
    ).toBeFalse();

    await flush();
    view.unmount();
  });

  test("reveals GitHub installation inline without opening another dialog", async () => {
    activateDom();
    const view = renderHub();

    click(button(view.container, "Install from GitHub"));
    await flush();

    expect(view.container.querySelector("[data-plugin-hub-github-form]")).not.toBeNull();
    expect(dom.document.querySelector('[role="dialog"]')).toBeNull();

    view.unmount();
  });
});
