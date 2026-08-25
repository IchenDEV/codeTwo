// @ts-nocheck
import { act as reactAct } from "react";
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, button, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { SessionHeaderActions } = await import("../src/session/SessionHeaderActions");
const {
  TOOLTIP_FIRST_OPEN_DELAY,
  TOOLTIP_INSTANT_PHASE_TIMEOUT,
  TooltipProvider,
} = await import("../src/components/ui/tooltip");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function renderActions(overrides = {}) {
  const calls: string[] = [];
  const callback = (name: string) => () => calls.push(name);
  const props = {
    canCommit: true,
    terminalActive: false,
    panelActive: false,
    onAddAction: callback("add"),
    onOpen: callback("open"),
    onOpenCursor: callback("cursor"),
    onOpenAntigravity: callback("antigravity"),
    onOpenFinder: callback("finder"),
    editorLaunchersAvailable: true,
    fileManagerLabel: "Finder",
    finderHint: "⌘O",
    onCommit: callback("commit"),
    onCheckpoint: callback("checkpoint"),
    onPush: callback("push"),
    onToggleTerminal: callback("terminal"),
    onToggleSideChat: callback("side-chat"),
    onTogglePanel: callback("panel"),
    ...overrides,
  };
  const view = mount(
    <I18nProvider>
      <TooltipProvider>
        <SessionHeaderActions {...props} />
      </TooltipProvider>
    </I18nProvider>,
  );
  return { calls, view };
}

async function press(element: Element) {
  await reactAct(async () => {
    element.dispatchEvent(new dom.window.PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
    }));
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flush();
}

describe("SessionHeaderActions", () => {
  test("uses a deliberate first tooltip delay with an adjacent instant phase", () => {
    expect(TOOLTIP_FIRST_OPEN_DELAY).toBe(600);
    expect(TOOLTIP_INSTANT_PHASE_TIMEOUT).toBe(400);
  });

  test("wires the primary actions and exposes the split menus", async () => {
    activateDom();
    const { calls, view } = renderActions();

    await press(button(view.container, "Add action"));
    await press(button(view.container, "Open"));
    await press(button(view.container, "Commit"));
    await press(button(view.container, "Toggle side chat"));
    await press(button(view.container, "Toggle terminal"));
    await press(button(view.container, "Toggle side panel"));
    expect(calls).toEqual(["add", "open", "commit", "side-chat", "terminal", "panel"]);

    await press(button(view.container, "Open · More"));
    expect(dom.document.body.textContent).toContain("Cursor");
    expect(dom.document.body.textContent).toContain("Antigravity");
    expect(dom.document.body.textContent).toContain("Finder");
    expect(dom.document.body.textContent).toContain("⌘O");

    const finderItem = Array.from(dom.document.body.querySelectorAll('[role="menuitem"]'))
      .find((item) => item.textContent?.includes("Finder"));
    if (!finderItem) throw new Error("Finder menu item not found");
    await press(finderItem);
    expect(calls).toEqual(["add", "open", "commit", "side-chat", "terminal", "panel", "finder"]);

    view.unmount();
  });

  test("disables both commit segments outside a repository", () => {
    activateDom();
    const { view } = renderActions({ canCommit: false });

    expect(button(view.container, "Commit").disabled).toBe(true);
    expect(button(view.container, "Commit · More").disabled).toBe(true);

    view.unmount();
  });

  test("shows only the file manager destination off macOS", async () => {
    activateDom();
    const { calls, view } = renderActions({
      editorLaunchersAvailable: false,
      fileManagerLabel: "File manager",
      finderHint: "Ctrl+O",
    });

    await press(button(view.container, "Open · More"));
    expect(dom.document.body.textContent).not.toContain("Cursor");
    expect(dom.document.body.textContent).not.toContain("Antigravity");
    expect(dom.document.body.textContent).toContain("File manager");
    expect(dom.document.body.textContent).toContain("Ctrl+O");

    const fileManagerItem = Array.from(dom.document.body.querySelectorAll('[role="menuitem"]'))
      .find((item) => item.textContent?.includes("File manager"));
    if (!fileManagerItem) throw new Error("File manager menu item not found");
    await press(fileManagerItem);
    expect(calls).toEqual(["finder"]);

    view.unmount();
  });

  test("runs saved project actions from the header", async () => {
    activateDom();
    const calls: string[] = [];
    const { view } = renderActions({
      actions: [{
        id: "test",
        name: "Test",
        kind: "command",
        command: "bun test",
        prompt: "",
        keybinding: "Mod+Shift+T",
        preview_url: "",
        run_on_worktree_create: false,
        open_preview: false,
      }],
      onRunAction: (action) => calls.push(action.id),
    });

    await press(button(view.container, "Test"));
    expect(calls).toEqual(["test"]);

    view.unmount();
  });
});
