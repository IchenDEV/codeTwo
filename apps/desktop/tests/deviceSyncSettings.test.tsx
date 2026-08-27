// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { act as reactAct } from "react";
import { activateDom, button, dom, flush, mount, restoreDom, waitFor } from "./domTestHarness";

activateDom();
const { SettingsPage } = await import("../src/settings/SettingsPage");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function status(enabled: boolean) {
  return {
    transport: "paired-devices",
    state: "ready",
    enabled,
    available: true,
    last_success_at: null,
    message: null,
    imported: { projects: 0, sessions: 0, parts: 0, memories: 0 },
  };
}

describe("Settings device sync", () => {
  test("enables paired-device transport and starts a manual device sync", async () => {
    let enabled = false;
    let syncs = 0;
    const rendered = mount(
      <I18nProvider>
        <SettingsPage
          initialTab="sync"
          bindings={[]}
          capturing={null}
          onCapture={() => {}}
          providers={[]}
          provider=""
          projectPath="/workspace"
          project={null}
          onProjectWorktreeMode={async () => {}}
          memoryEnabled={false}
          deviceSyncEnabled
          onClose={() => {}}
          deviceSyncStatusLoader={async () => status(enabled)}
          deviceSyncEnabledSaver={async (next) => {
            enabled = next;
            return status(enabled);
          }}
          deviceSyncStarter={async () => {
            syncs += 1;
            return { ...status(true), last_success_at: Date.now() };
          }}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(rendered.container.textContent).toContain("Ready to sync"));

    const toggle = rendered.container.querySelector('[data-slot="setting-toggle"] [data-slot="switch"]');
    expect(rendered.container.querySelector('[data-slot="setting-row-label"]')?.textContent)
      .toBe("Paired C2 devices");
    expect(toggle).not.toBeNull();
    await reactAct(async () => toggle.click());
    await waitFor(() => expect(button(rendered.container, "Sync now").disabled).toBe(false));
    await reactAct(async () => button(rendered.container, "Sync now").click());
    await flush();

    expect(enabled).toBe(true);
    expect(syncs).toBe(1);
    expect(rendered.container.textContent).toContain("Last synced");
    expect(rendered.container.textContent).toContain("Project files");
    expect(rendered.container.textContent).not.toContain("iCloud");
    rendered.unmount();
  });
});
