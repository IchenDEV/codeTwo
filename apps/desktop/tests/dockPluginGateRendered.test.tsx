// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import { activateDom, button, click, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { Dock, dockMaxWidth, shouldOverlayRailForDock } = await import("../src/dock/Dock");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});
function renderDock(
  availableSurfaces,
  tab = "home",
  open = true,
  onOpenSideChat = () => {},
) {
  return mount(
    <I18nProvider>
      <Dock
        open={open}
        tab={tab}
        availableSurfaces={availableSurfaces}
        onTab={() => {}}
        onOpenSideChat={onOpenSideChat}
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
  test("preserves the document measure after accounting for an inline rail", () => {
    expect(dockMaxWidth(1280, 288)).toBe(372);
    expect(dockMaxWidth(800)).toBe(300);
    expect(shouldOverlayRailForDock(1207, 288)).toBe(true);
    expect(shouldOverlayRailForDock(1208, 288)).toBe(false);
  });

  test("removes its resize separator from the tab order while closed", async () => {
    activateDom();
    const view = renderDock(["terminal"], "home", false);
    await flush();
    const separator = view.container.querySelector('[role="separator"]');

    expect(separator?.getAttribute("tabindex")).toBe("-1");
    expect(separator?.getAttribute("aria-disabled")).toBe("true");

    view.unmount();
  });

  test("opens side chat from the right-panel surface picker", async () => {
    activateDom();
    let opens = 0;
    const view = renderDock(
      ["trajectory", "browser", "terminal", "files", "git"],
      "home",
      true,
      () => { opens += 1; },
    );
    await flush();

    const cards = Array.from(view.container.querySelectorAll(".dock-surface-grid > button"));
    expect(cards[2]?.textContent).toContain("Terminal");
    expect(cards[3]?.getAttribute("aria-label")).toBe("Side chat");
    expect(cards.every((card) => card.classList.contains("dock-surface-card"))).toBe(true);
    expect(cards.every((card) => card.classList.contains("bg-card"))).toBe(true);
    expect(cards.every((card) => card.classList.contains("p-3"))).toBe(true);
    expect(cards.every((card) => !card.className.includes("ring-foreground"))).toBe(true);
    expect(cards.every((card) => card.querySelector("svg")?.classList.contains("size-4"))).toBe(true);
    click(button(view.container, "Side chat"));
    expect(opens).toBe(1);

    view.unmount();
  });

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
