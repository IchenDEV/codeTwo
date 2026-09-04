// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import { act as reactAct } from "react";

import {
  activateDom,
  button,
  dom,
  flush,
  mount,
  restoreDom,
  waitFor,
} from "./domTestHarness";

activateDom();
const { SettingsPage } = await import("../src/settings/SettingsPage");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function status(enabled: boolean, reloaded = false) {
  return {
    enabled,
    watching: enabled,
    plugins_dir: "/tmp/codetwo/plugins",
    last_reload: reloaded
      ? { at: Date.now(), plugins: ["alpha"], success: true, error: null }
      : null,
  };
}

describe("Developer settings", () => {
  test("runs developer tools and exports redacted diagnostics", async () => {
    let enabled = false;
    let reloads = 0;
    let devtools = 0;
    let exports = 0;
    const rendered = mount(
      <I18nProvider>
        <SettingsPage
          initialTab="developer"
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
          pluginDeveloperStatusLoader={async () => status(enabled)}
          pluginDeveloperModeSaver={async (next) => {
            enabled = next;
            return status(enabled);
          }}
          pluginDeveloperReloader={async () => {
            reloads += 1;
            return status(enabled, true);
          }}
          devtoolsOpener={async () => {
            devtools += 1;
          }}
          diagnosticsExporter={async () => {
            exports += 1;
            return "saved";
          }}
        />
      </I18nProvider>
    );
    await waitFor(() =>
      expect(rendered.container.textContent).toContain("Hot reload is off")
    );

    const toggle = rendered.container.querySelector(
      '[aria-label="Developer mode"]'
    );
    expect(toggle).not.toBeNull();
    await reactAct(async () => toggle.click());
    await waitFor(() =>
      expect(rendered.container.textContent).toContain("/tmp/codetwo/plugins")
    );

    await reactAct(async () =>
      button(rendered.container, "Reload plugins").click()
    );
    await flush();
    await reactAct(async () =>
      button(rendered.container, "Open WebView DevTools").click()
    );
    await flush();
    await reactAct(async () =>
      button(rendered.container, "Export diagnostics").click()
    );
    await flush();

    expect(enabled).toBe(true);
    expect(reloads).toBe(1);
    expect(devtools).toBe(1);
    expect(exports).toBe(1);
    expect(rendered.container.textContent).toContain("alpha");
    expect(rendered.container.textContent).toContain("Diagnostics exported");
    rendered.unmount();
  });
});
