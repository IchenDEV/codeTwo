// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, click, dom, mount, restoreDom, waitFor } from "./domTestHarness";

activateDom();
const { SessionNotices, pushSessionNotice, MAX_SESSION_NOTICES } = await import(
  "../src/session/SessionNotices"
);
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function notice(id, kind = "info", detail) {
  return { id, kind, title: `Notice ${id}`, detail, time: Date.now() };
}

describe("SessionNotices", () => {
  test("renders nothing when the list is empty", () => {
    activateDom();
    const rendered = mount(
      <I18nProvider>
        <SessionNotices notices={[]} onDismiss={() => {}} />
      </I18nProvider>,
    );
    expect(rendered.container.querySelector("[data-session-notices]")).toBeNull();
    rendered.unmount();
  });

  test("renders up to three notices expanded with title, detail and dismiss", async () => {
    activateDom();
    const dismissed = [];
    const rendered = mount(
      <I18nProvider>
        <SessionNotices
          notices={[notice("a", "error", "boom"), notice("b")]}
          onDismiss={(id) => dismissed.push(id)}
        />
      </I18nProvider>,
    );
    const card = rendered.container.querySelector("[data-session-notices]");
    expect(card).toBeTruthy();
    expect(card.textContent).toContain("2 notifications");
    expect(card.textContent).toContain("Notice a");
    expect(card.textContent).toContain("boom");

    const dismissButtons = [...card.querySelectorAll('button[aria-label="Dismiss"]')];
    expect(dismissButtons).toHaveLength(2);
    click(dismissButtons[0]);
    expect(dismissed).toEqual(["a"]);
    rendered.unmount();
  });

  test("collapses behind the header beyond three notices", async () => {
    activateDom();
    const notices = ["a", "b", "c", "d", "e"].map((id) => notice(id));
    const rendered = mount(
      <I18nProvider>
        <SessionNotices notices={notices} onDismiss={() => {}} />
      </I18nProvider>,
    );
    const card = rendered.container.querySelector("[data-session-notices]");
    expect(card.textContent).toContain("5 notifications");
    // Collapsed: rows are unmounted until the header is clicked.
    expect(card.textContent).not.toContain("Notice a");
    click(card.querySelector("button"));
    await waitFor(() => {
      expect(card.textContent).toContain("Notice e");
    });
    rendered.unmount();
  });

  test("pushSessionNotice replaces same-id rows and bounds the tail", () => {
    let list = [notice("a")];
    list = pushSessionNotice(list, notice("b"));
    list = pushSessionNotice(list, { ...notice("a", "error"), detail: "updated" });
    expect(list.map((item) => item.id)).toEqual(["b", "a"]);
    expect(list[1].detail).toBe("updated");

    for (let index = 0; index < MAX_SESSION_NOTICES + 5; index += 1) {
      list = pushSessionNotice(list, notice(`n${index}`));
    }
    expect(list).toHaveLength(MAX_SESSION_NOTICES);
    expect(list[list.length - 1].id).toBe(`n${MAX_SESSION_NOTICES + 4}`);
  });
});
