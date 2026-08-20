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

function settings(updateStatusLoader, updateCheckStarter) {
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
        memoryEnabled={false}
        onClose={() => {}}
        updateStatusLoader={updateStatusLoader}
        updateCheckStarter={updateCheckStarter}
      />
    </I18nProvider>
  );
}

describe("Settings software update row", () => {
  test("explains why an unsigned build cannot check", async () => {
    const rendered = mount(settings(
      async () => ({ state: "not-configured" }),
      async () => ({ state: "not-configured" }),
    ));
    await flush();

    expect(rendered.container.textContent).toContain("Software update");
    expect(rendered.container.textContent).toContain("signed feed or public key is not configured");
    expect(button(rendered.container, "Check now").disabled).toBe(true);
    rendered.unmount();
  });

  test("starts a real Sparkle check only from a ready build", async () => {
    let checks = 0;
    const rendered = mount(settings(
      async () => ({ state: "ready", currentVersion: "1.2.3" }),
      async () => {
        checks += 1;
        return { state: "checking", currentVersion: "1.2.3" };
      },
    ));
    await flush();

    await reactAct(async () => button(rendered.container, "Check now").click());
    await flush();
    expect(checks).toBe(1);
    expect(rendered.container.textContent).toContain("Sparkle is checking the signed update feed");
    expect(button(rendered.container, "Checking…").disabled).toBe(true);
    rendered.unmount();
  });
});
