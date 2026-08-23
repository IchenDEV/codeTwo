// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, button, click, dom, flush, mount, restoreDom, waitFor } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { SideChatPanel } = await import("../src/session/SideChatPanel");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

const providers = [{
  id: "codex",
  display_name: "Codex",
  available: true,
  needs_node: false,
  capabilities: [],
  models: [{ id: "gpt-test", name: "GPT Test", description: null }],
}];

function panel(seed = null, onClose = () => {}, onSeedHandled = () => {}) {
  return (
    <I18nProvider>
      <SideChatPanel
        open
        width={440}
        onWidth={() => {}}
        onClose={onClose}
        provider="codex"
        providers={providers}
        cwd="/workspace"
        model="gpt-test"
        mode="ask"
        sandbox="workspace_write"
        seed={seed}
        onSeedHandled={onSeedHandled}
      />
    </I18nProvider>
  );
}

describe("SideChatPanel", () => {
  test("opens an app-lifetime chat surface and creates independent tabs", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const view = mount(panel());
    await waitFor(() => {
      expect(view.container.querySelectorAll('[role="tab"]')).toHaveLength(1);
    });

    expect(view.container.textContent).toContain("Side chat");
    expect(view.container.textContent).toContain(
      "Side chats are temporary and disappear when you close CodeTwo.",
    );
    click(button(view.container, "New side chat"));
    await flush();
    expect(view.container.querySelectorAll('[role="tab"]')).toHaveLength(2);

    view.unmount();
  });

  test("routes selected transcript text into a pristine side-chat draft", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const handled = [];
    const view = mount(panel({ id: "selection-1", text: "Explain this excerpt" }, () => {}, (id) => handled.push(id)));
    await waitFor(() => {
      const textarea = view.container.querySelector("textarea");
      expect(textarea?.value).toBe("Explain this excerpt");
    });
    expect(handled).toEqual(["selection-1"]);

    view.unmount();
  });

  test("hides without deleting the current local tab", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    let closes = 0;
    const view = mount(panel(null, () => { closes += 1; }));
    await waitFor(() => {
      expect(view.container.querySelectorAll('[role="tab"]')).toHaveLength(1);
    });
    click(button(view.container, "Hide side chat"));
    expect(closes).toBe(1);
    expect(view.container.querySelectorAll('[role="tab"]')).toHaveLength(1);

    view.unmount();
  });
});
