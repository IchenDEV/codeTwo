// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import { useRef } from "react";

import {
  activateDom,
  click,
  dom,
  mount,
  restoreDom,
  waitFor,
} from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { SelectionActions, SelectionToolbar } =
  await import("../src/session/SelectionActions");

afterEach(() => {
  dom.document.getSelection()?.removeAllRanges();
  dom.document.body.replaceChildren();
  restoreDom();
});

function Fixture({ onAdd, onDetails, onAsk }) {
  return (
    <I18nProvider>
      <section>
        <SelectionToolbar
          text="Selected answer text"
          onAdd={onAdd}
          onDetails={onDetails}
          onAskInSideChat={onAsk}
        />
      </section>
    </I18nProvider>
  );
}

function LiveSelectionFixture({ onAdd }) {
  const scopeRef = useRef(null);
  return (
    <I18nProvider>
      <div ref={scopeRef}>Selected answer text</div>
      <SelectionActions
        scopeRef={scopeRef}
        onAdd={onAdd}
        onDetails={() => {}}
        onAskInSideChat={() => {}}
      />
    </I18nProvider>
  );
}

describe("SelectionActions", () => {
  test("renders three actions and sends the captured transcript text", () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const calls = [];
    const view = mount(
      <Fixture
        onAdd={(text) => calls.push(["add", text])}
        onDetails={(text) => calls.push(["details", text])}
        onAsk={(text) => calls.push(["ask", text])}
      />
    );

    const toolbar = view.container.querySelector('[role="toolbar"]');
    const actions = [...toolbar.querySelectorAll("button")];
    // Some rendered suites intentionally install the key-echo translator globally; the action
    // order and callbacks are the stable contract in either localization mode.
    expect(actions).toHaveLength(3);
    expect(["Add to chat", "selection.addToChat"]).toContain(
      actions[0].textContent?.trim()
    );
    expect(["More details", "selection.moreDetails"]).toContain(
      actions[1].textContent?.trim()
    );
    expect(["Ask in side chat", "selection.askInSideChat"]).toContain(
      actions[2].textContent?.trim()
    );
    expect(toolbar.querySelectorAll('[data-slot="separator"]')).toHaveLength(2);

    actions[0].focus();
    toolbar.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
      })
    );
    expect(dom.document.activeElement).toBe(actions[1]);
    toolbar.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "End", bubbles: true })
    );
    expect(dom.document.activeElement).toBe(actions[2]);

    click(actions[1]);
    expect(calls).toEqual([["details", "Selected answer text"]]);

    view.unmount();
  });

  test("opens from a document selectionchange event", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const calls = [];
    const view = mount(
      <LiveSelectionFixture onAdd={(text) => calls.push(text)} />
    );
    const selectedText = view.container.querySelector("div").firstChild;
    const range = dom.document.createRange();
    range.selectNodeContents(selectedText);
    range.getBoundingClientRect = () => new dom.window.DOMRect(80, 80, 180, 20);
    const selection = dom.document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    dom.document.dispatchEvent(new dom.window.Event("selectionchange"));

    await waitFor(() => {
      const toolbar = dom.document.body.querySelector('[role="toolbar"]');
      expect(toolbar).not.toBeNull();
    });
    const addButton = [
      ...dom.document.body.querySelectorAll('[role="toolbar"] button'),
    ][0];
    click(addButton);
    expect(calls).toEqual(["Selected answer text"]);

    view.unmount();
  });
});
