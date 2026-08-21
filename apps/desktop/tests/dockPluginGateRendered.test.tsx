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
function renderDock(availableSurfaces, tab = "home", placement = "right") {
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
        placement={placement}
        width={440}
        onWidth={() => {}}
        height={280}
        onHeight={() => {}}
      />
    </I18nProvider>,
  );
}

describe("Dock plugin component gate", () => {
  test("renders the terminal as a vertically resizable bottom panel", async () => {
    activateDom();
    const view = renderDock(["terminal"], "home", "bottom");
    await flush();

    const panel = view.container.querySelector('[data-dock-placement="bottom"]');
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains("dock-panel-bottom")).toBe(true);
    expect(panel?.classList.contains("border-l")).toBe(false);
    expect(panel?.getAttribute("style")).toContain("height: 280px");
    expect(panel?.querySelector('[data-dock-resize="vertical"]')).not.toBeNull();

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
});
