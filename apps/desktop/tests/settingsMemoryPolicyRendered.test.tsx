// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { act as reactAct } from "react";
import { activateDom, button, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { SettingsPage } = await import("../src/settings/SettingsPage");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function settings(memoryEnabled) {
  return (
    <I18nProvider>
      <SettingsPage
        bindings={[]}
        capturing={null}
        onCapture={() => {}}
        providers={[]}
        provider=""
        projectPath="/workspace"
        project={null}
        onProjectWorktreeMode={async () => {}}
        memoryEnabled={memoryEnabled}
        initialTab="memory"
        onClose={() => {}}
      />
    </I18nProvider>
  );
}

describe("Settings memory component policy", () => {
  test("hides the tab and closes an open memory page immediately", async () => {
    activateDom();
    const rendered = mount(settings(false));
    await flush();

    expect(() => button(rendered.container, "Memory")).toThrow();
    expect(rendered.container.textContent).toContain("General");

    rendered.rerender(settings(true));
    await flush();
    await reactAct(async () => button(rendered.container, "Memory").click());
    await flush();
    expect(rendered.container.textContent).toContain("Enable memory");

    rendered.rerender(settings(false));
    expect(rendered.container.textContent).not.toContain("Enable memory");
    await flush();
    expect(rendered.container.textContent).toContain("General");
    rendered.unmount();
  });
});
