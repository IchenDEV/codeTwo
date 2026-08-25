// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import { activateDom, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { Dock } = await import("../src/dock/Dock");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});
function renderDock(availableSurfaces, tab = "home") {
  return mount(
    <I18nProvider>
      <Dock
        open
        tab={tab}
        availableSurfaces={availableSurfaces}
        onTab={() => {}}
        onClose={() => {}}
        cwd={null}
        projectPath={null}
        sessionKey="test"
        git={null}
        onRefreshGit={() => {}}
        onOpenSourceControl={() => {}}
        browserUrl="about:blank"
        onNavigate={() => {}}
        onAnnotate={() => {}}
        onInsertFile={() => {}}
        onOpenFile={() => {}}
        onSendText={() => {}}
        openFiles={[]}
        activeFile={null}
        fileReveal={null}
        onActiveFile={() => {}}
        onCloseFile={() => {}}
        turns={[]}
        usage={null}
        hasEarlier={false}
        loadingEarlier={false}
        onLoadEarlier={() => {}}
        width={440}
        onWidth={() => {}}
      />
    </I18nProvider>,
  );
}

describe("Dock plugin component gate", () => {
  test("advertises the terminal in the horizontally resizable right panel", async () => {
    activateDom();
    const view = renderDock(["terminal"], "home");
    await flush();

    const panel = view.container.querySelector('[data-dock-placement="right"]');
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains("dock-panel-side")).toBe(true);
    expect(panel?.classList.contains("border-l")).toBe(true);
    expect(panel?.getAttribute("style")).toMatch(/^width: \d+px;$/);
    expect(panel?.getAttribute("style")).not.toContain("height");
    expect(panel?.querySelector('[data-dock-resize="horizontal"]')).not.toBeNull();
    expect(view.container.textContent).toContain("Terminal");

    view.unmount();
  });

  test("advertises only enabled surfaces and refuses to mount a disabled requested tab", async () => {
    activateDom();
    const view = renderDock(["files"], "terminal");
    await flush();

    expect(view.container.textContent).toContain("Files");
    expect(view.container.textContent).not.toContain("Browser");
    expect(view.container.textContent).not.toContain("Terminal");
    expect(view.container.textContent).not.toContain("Source control");
    expect(view.container.querySelector('[data-slot="tabs-content"][data-value="terminal"]')).toBeNull();

    view.unmount();
  });

  test("renders trajectory as a right-panel module", async () => {
    activateDom();
    const home = renderDock(["trajectory"], "home");
    await flush();

    expect(home.container.textContent).toContain("Execution trajectory");
    expect(home.container.textContent).toContain("Inspect the session timeline");
    home.unmount();

    const module = renderDock(["trajectory"], "trajectory");
    await flush();

    expect(module.container.querySelector('[role="tabpanel"]')).not.toBeNull();
    expect(module.container.querySelector('[aria-label="Execution trajectory"]')).not.toBeNull();
    expect(module.container.textContent).toContain("No events match this view.");
    module.unmount();
  });
});
