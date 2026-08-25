// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { act as reactAct } from "react";

import { activateDom, button, click, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { ProjectActionDialog } = await import("../src/session/ProjectActionDialog");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

describe("ProjectActionDialog", () => {
  test("captures the full project action and enables preview only for a URL", async () => {
    activateDom();
    const saved = [];
    const view = mount(
      <I18nProvider>
        <ProjectActionDialog
          open
          actions={[]}
          bindings={[]}
          onOpenChange={() => {}}
          onSave={async (action) => saved.push(action)}
        />
      </I18nProvider>,
    );

    await flush();
    const body = dom.document.body;
    const switches = body.querySelectorAll('[data-slot="switch"]');
    expect(switches).toHaveLength(2);
    const previewSwitch = switches[1] as HTMLElement;
    expect(previewSwitch.hasAttribute("data-disabled")).toBe(true);

    setValue(body.querySelector("#action-name"), "Test");
    setValue(body.querySelector("#action-command"), "bun test");
    setValue(body.querySelector("#action-preview-url"), "http://localhost:5173");
    await flush();
    expect(previewSwitch.hasAttribute("data-disabled")).toBe(false);

    const shortcut = button(body, "Keybinding");
    await reactAct(async () => {
      shortcut.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "t",
        code: "KeyT",
        metaKey: true,
        shiftKey: true,
      }));
    });
    click(switches[0]);
    click(previewSwitch);
    await flush();
    await reactAct(async () => {
      body.querySelector("form")?.dispatchEvent(new dom.window.Event("submit", {
        bubbles: true,
        cancelable: true,
      }));
    });
    await flush();

    expect(saved).toEqual([{
      id: "test",
      name: "Test",
      kind: "command",
      command: "bun test",
      prompt: "",
      keybinding: "Mod+Shift+T",
      preview_url: "http://localhost:5173",
      run_on_worktree_create: true,
      open_preview: true,
    }]);
    view.unmount();
  });

  test("saves a reusable prompt without command-only options", async () => {
    activateDom();
    const saved = [];
    const view = mount(
      <I18nProvider>
        <ProjectActionDialog
          open
          actions={[]}
          bindings={[]}
          onOpenChange={() => {}}
          onSave={async (action) => saved.push(action)}
        />
      </I18nProvider>,
    );

    await flush();
    const body = dom.document.body;
    click(button(body, "Send prompt"));
    await flush();
    expect(body.querySelector("#action-command")).toBeNull();
    expect(body.querySelectorAll('[data-slot="switch"]')).toHaveLength(0);

    setValue(body.querySelector("#action-name"), "Review");
    setValue(body.querySelector("#action-prompt"), "Review the current changes.");
    await flush();
    await reactAct(async () => {
      body.querySelector("form")?.dispatchEvent(new dom.window.Event("submit", {
        bubbles: true,
        cancelable: true,
      }));
    });
    await flush();

    expect(saved).toEqual([{
      id: "review",
      name: "Review",
      kind: "prompt",
      command: "",
      prompt: "Review the current changes.",
      keybinding: "",
      preview_url: "",
      run_on_worktree_create: false,
      open_preview: false,
    }]);
    view.unmount();
  });
});
