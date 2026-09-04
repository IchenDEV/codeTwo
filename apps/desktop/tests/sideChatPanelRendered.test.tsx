import { afterEach, describe, expect, test } from "bun:test";
// @ts-nocheck
import { readFileSync } from "node:fs";

import { StrictMode } from "react";

import {
  activateDom,
  button,
  click,
  dom,
  flush,
  mount,
  restoreDom,
  waitFor,
} from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { QuickChatPanel, SideChatPanel, transientMemoryPolicy } =
  await import("../src/session/SideChatPanel");
const styles = readFileSync(
  new URL("../src/styles.css", import.meta.url),
  "utf-8"
);
const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf-8"
);

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

const providers = [
  {
    id: "codex",
    display_name: "Codex",
    available: true,
    needs_node: false,
    capabilities: [],
    models: [{ id: "gpt-test", name: "GPT Test", description: null }],
  },
];

function panel(
  seed = null,
  onClose = () => {},
  onSeedHandled = () => {},
  open = true,
  providerList = providers,
  selectedModel = "gpt-test"
) {
  return (
    <I18nProvider>
      <SideChatPanel
        open={open}
        onClose={onClose}
        provider="codex"
        providers={providerList}
        cwd="/workspace"
        model={selectedModel}
        mode="ask"
        sandbox="workspace_write"
        seed={seed}
        onSeedHandled={onSeedHandled}
      />
    </I18nProvider>
  );
}

function quickPanel(
  seed = null,
  onClose = () => {},
  onSeedHandled = () => {},
  open = true,
  providerList = providers,
  selectedModel = "gpt-test"
) {
  return (
    <I18nProvider>
      <QuickChatPanel
        open={open}
        onClose={onClose}
        provider="codex"
        providers={providerList}
        cwd="/workspace"
        model={selectedModel}
        mode="ask"
        sandbox="workspace_write"
        seed={seed}
        onSeedHandled={onSeedHandled}
      />
    </I18nProvider>
  );
}

describe("SideChatPanel", () => {
  test("keeps Codex recall as an explicit transient-chat opt-in", () => {
    expect(transientMemoryPolicy("codex")).toEqual(["allow", "deny"]);
    expect(transientMemoryPolicy("claude-code")).toEqual(["inherit", "deny"]);
  });

  test("routes Quick Chat to the floating panel and Side Chat to the right Dock", () => {
    expect(appSource).toContain("<QuickChatPanel");
    expect(appSource).toContain("open={quickChatOpen}");
    expect(appSource).toContain('"side-chat": (');
    expect(appSource).toContain("<SideChatPanel");
    expect(appSource).toContain('open={dockTab === "side-chat"}');
    expect(appSource).toContain('manualDockTab("side-chat")');
    expect(appSource).not.toContain("setSideChatOpen");
  });

  test("keeps Quick Chat and Side Chat as separately named placement surfaces", async () => {
    activateDom();
    const quick = mount(quickPanel());
    const side = mount(panel());
    await flush();

    expect(
      quick.container
        .querySelector('[role="dialog"]')
        ?.getAttribute("aria-label")
    ).toBe("Quick Chat");
    expect(quick.container.querySelector(".quick-chat-panel")).not.toBeNull();
    expect(
      side.container.querySelector('[aria-label="Side chat"]')
    ).not.toBeNull();
    expect(side.container.querySelector(".quick-chat-panel")).toBeNull();
    expect(side.container.querySelector('[role="dialog"]')).toBeNull();
    expect(
      side.container.querySelector("[data-transient-chat-tabs]")
    ).toBeNull();

    quick.unmount();
    side.unmount();
  });

  test("creates exactly one Side Chat conversation under React Strict Mode", async () => {
    activateDom();
    const view = mount(<StrictMode>{panel()}</StrictMode>);
    await flush();

    const side = view.container.querySelector('[data-chat-surface="side"]');
    expect(side?.dataset.chatCount).toBe("1");
    expect(side?.querySelectorAll("textarea")).toHaveLength(1);
    expect(side?.querySelectorAll('[role="tab"]')).toHaveLength(0);

    view.unmount();
  });

  test("shows the selected model on both transient surfaces when the provider list is not loaded", async () => {
    activateDom();
    const providersWithoutModels = [{ ...providers[0], models: [] }];
    const quick = mount(
      quickPanel(
        null,
        () => {},
        () => {},
        true,
        providersWithoutModels
      )
    );
    const side = mount(
      panel(
        null,
        () => {},
        () => {},
        true,
        providersWithoutModels
      )
    );
    await flush();

    expect(
      quick.container.querySelector('button[title="Model"]')?.textContent
    ).toContain("gpt-test");
    expect(
      side.container.querySelector('button[title="Model"]')?.textContent
    ).toContain("gpt-test");

    quick.unmount();
    side.unmount();
  });

  test("keeps a model selector on both transient surfaces before any model metadata arrives", async () => {
    activateDom();
    const providersWithoutModels = [{ ...providers[0], models: [] }];
    const quick = mount(
      quickPanel(
        null,
        () => {},
        () => {},
        true,
        providersWithoutModels,
        null
      )
    );
    const side = mount(
      panel(
        null,
        () => {},
        () => {},
        true,
        providersWithoutModels,
        null
      )
    );
    await flush();

    expect(
      quick.container.querySelector('button[title="Model"]')?.textContent
    ).toContain("Default model");
    expect(
      side.container.querySelector('button[title="Model"]')?.textContent
    ).toContain("Default model");

    quick.unmount();
    side.unmount();
  });

  test("selects an advertised model before the first Quick Chat or Side Chat prompt", async () => {
    activateDom();
    const providerList = [
      {
        ...providers[0],
        models: [
          { id: "gpt-test", name: "GPT Test", description: null },
          { id: "gpt-next", name: "GPT Next", description: null },
        ],
      },
    ];

    const chooseNextModel = async (view) => {
      const trigger = view.container.querySelector<HTMLButtonElement>(
        'button[title="Model"]'
      );
      if (trigger == null) throw new Error("model trigger did not render");
      click(trigger);
      await flush();
      const nextModel = [
        ...dom.document.body.querySelectorAll<HTMLButtonElement>(
          '[data-slot="popover-content"] button'
        ),
      ].find((candidate) => candidate.textContent?.includes("GPT Next"));
      if (nextModel == null) throw new Error("alternate model did not render");
      click(nextModel);
      await flush();
      expect(trigger.textContent).toContain("GPT Next");
    };

    const quick = mount(
      quickPanel(
        null,
        () => {},
        () => {},
        true,
        providerList
      )
    );
    await flush();
    await chooseNextModel(quick);
    quick.unmount();

    const side = mount(
      panel(
        null,
        () => {},
        () => {},
        true,
        providerList
      )
    );
    await flush();
    await chooseNextModel(side);
    side.unmount();
  });

  test("keeps the complete conversation control row on both transient chat surfaces", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");

    for (const renderPanel of [quickPanel, panel]) {
      const view = mount(renderPanel());
      await flush();

      const addButton = button(view.container, "Add to the conversation");
      const imageInput =
        view.container.querySelector<HTMLInputElement>('input[type="file"]');
      let imagePickerOpens = 0;
      if (!imageInput) throw new Error("transient image input did not render");
      imageInput.click = () => {
        imagePickerOpens += 1;
      };
      click(addButton);
      expect(imagePickerOpens).toBe(1);

      expect(button(view.container, "Mode: Ask first")).not.toBeNull();
      expect(
        button(
          view.container,
          "Voice input — hold to talk, or click to toggle dictation"
        )
      ).not.toBeNull();
      expect(button(view.container, "Send message")).not.toBeNull();
      expect(
        view.container.querySelector('button[title="Model"]')
      ).not.toBeNull();

      view.unmount();
    }
  });

  test("changes the permission posture before the first transient prompt", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const view = mount(quickPanel());
    await flush();

    const trigger = button(view.container, "Mode: Ask first");
    click(trigger);
    await flush();
    const fullAccess = [
      ...dom.document.body.querySelectorAll<HTMLButtonElement>(
        '[data-slot="popover-content"] button'
      ),
    ].find((candidate) => candidate.textContent?.includes("Full access"));
    if (fullAccess == null) throw new Error("full-access mode did not render");
    click(fullAccess);
    await flush();

    expect(trigger.getAttribute("aria-label")).toBe("Mode: Full access");
    view.unmount();
  });

  test("uses restrained elevation for the floating panel and its composer", async () => {
    activateDom();
    const view = mount(quickPanel());
    await flush();

    const floatingPanel = view.container.querySelector(".quick-chat-panel");
    const composer = view.container.querySelector(
      "[data-transient-chat-composer]"
    );
    expect(floatingPanel?.className).toContain("shadow-raised");
    expect(floatingPanel?.className).not.toContain("shadow-modal");
    expect(composer?.className).toContain("shadow-control");
    expect(composer?.className).not.toContain("shadow-raised");

    view.unmount();
  });

  test("uses a quiet surface state instead of a blue focus ring for transient composers", async () => {
    activateDom();

    for (const renderPanel of [quickPanel, panel]) {
      const view = mount(renderPanel());
      await flush();

      const composer = view.container.querySelector<HTMLElement>(
        "[data-transient-chat-composer]"
      );
      const textarea = composer?.querySelector<HTMLTextAreaElement>("textarea");
      expect(composer?.className).toContain("focus-within:bg-fill-hover");
      expect(composer?.className).not.toContain(
        "focus-within:focus-ring-inset"
      );
      expect(textarea?.className).not.toContain("focus-visible:focus-ring");
      expect(textarea?.className).not.toContain(
        "focus-visible:focus-ring-inset"
      );

      view.unmount();
    }
  });

  test("moves Quick Chat by its header, clamps it to the viewport, and releases cancellation", async () => {
    activateDom();
    Object.defineProperty(dom.window, "innerWidth", {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(dom.window, "innerHeight", {
      configurable: true,
      value: 1000,
    });
    const view = mount(quickPanel());
    await flush();
    const floatingPanel =
      view.container.querySelector<HTMLElement>(".quick-chat-panel");
    const dragHandle = view.container.querySelector<HTMLElement>(
      "[data-quick-chat-drag-handle]"
    );
    let capturedPointer: number | null = null;

    expect(floatingPanel).not.toBeNull();
    expect(dragHandle).not.toBeNull();
    if (!floatingPanel || !dragHandle)
      throw new Error("missing Quick Chat drag surface");

    floatingPanel.getBoundingClientRect = () => ({
      bottom: 860,
      height: 720,
      left: 280,
      right: 920,
      top: 140,
      width: 640,
      x: 280,
      y: 140,
      toJSON: () => ({}),
    });
    dragHandle.setPointerCapture = (pointerId) => {
      capturedPointer = pointerId;
    };
    dragHandle.hasPointerCapture = (pointerId) => capturedPointer === pointerId;
    dragHandle.releasePointerCapture = (pointerId) => {
      if (capturedPointer === pointerId) capturedPointer = null;
    };

    dragHandle.dispatchEvent(
      new dom.window.PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 400,
        clientY: 200,
        pointerId: 9,
      })
    );
    dragHandle.dispatchEvent(
      new dom.window.PointerEvent("pointermove", {
        bubbles: true,
        clientX: 520,
        clientY: 310,
        pointerId: 9,
      })
    );
    await flush();
    expect(capturedPointer).toBe(9);
    expect(floatingPanel.style.getPropertyValue("--quick-chat-offset-x")).toBe(
      "120px"
    );
    expect(floatingPanel.style.getPropertyValue("--quick-chat-offset-y")).toBe(
      "110px"
    );

    dragHandle.dispatchEvent(
      new dom.window.PointerEvent("pointermove", {
        bubbles: true,
        clientX: 2000,
        clientY: 2000,
        pointerId: 9,
      })
    );
    await flush();
    expect(floatingPanel.style.getPropertyValue("--quick-chat-offset-x")).toBe(
      "272px"
    );
    expect(floatingPanel.style.getPropertyValue("--quick-chat-offset-y")).toBe(
      "132px"
    );

    dragHandle.dispatchEvent(
      new dom.window.PointerEvent("pointercancel", {
        bubbles: true,
        pointerId: 9,
      })
    );
    expect(capturedPointer).toBeNull();
    expect(dom.document.body.classList.contains("moving-quick-chat")).toBe(
      false
    );

    const headerButton = dragHandle.querySelector<HTMLElement>("button");
    headerButton?.dispatchEvent(
      new dom.window.PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        pointerId: 10,
      })
    );
    expect(capturedPointer).toBeNull();

    view.unmount();
  });

  test("restores the empty-session heading when a right panel changes the content width", () => {
    expect(appSource).toContain(
      "const heroScrollRef = useRef<HTMLDivElement | null>(null)"
    );
    expect(appSource).toContain("heroScrollRef.current?.scrollTo({ top: 0 })");
    expect(appSource).toContain(
      "[dockTab, docMode, sessionLoading, turns.length]"
    );
    expect(appSource).toContain("ref={heroScrollRef}");
  });

  test("uses the semantic panel and control radius hierarchy for Quick Chat", () => {
    expect(styles).toContain("border-radius: var(--ds-radius-module);");
    expect(styles).toContain("padding: var(--ds-radius-control);");
    expect(styles).toContain("border-radius: var(--ds-radius-control);");
    expect(styles).not.toContain("--quick-chat-panel-radius");
  });

  test("keeps Quick Chat mounted as a nonmodal floating panel while hidden", () => {
    activateDom();
    const view = mount(
      quickPanel(
        null,
        () => {},
        () => {},
        false
      )
    );
    const floatingPanel = view.container.querySelector(".quick-chat-panel");

    expect(floatingPanel?.getAttribute("role")).toBe("dialog");
    expect(floatingPanel?.getAttribute("aria-modal")).toBe("false");
    expect(floatingPanel?.getAttribute("aria-hidden")).toBe("true");
    expect(floatingPanel?.hasAttribute("inert")).toBe(true);
    expect(floatingPanel?.className).toContain("fixed");
    expect(view.container.querySelector('[role="separator"]')).toBeNull();

    view.unmount();
  });

  test("restores keyboard navigation when the panel opens", () => {
    activateDom();
    const view = mount(quickPanel());
    const aside = view.container.querySelector('[role="dialog"]');

    expect(aside?.hasAttribute("inert")).toBe(false);
    expect(aside?.getAttribute("aria-hidden")).toBe("false");

    view.unmount();
  });

  test("opens an app-lifetime Quick Chat surface and creates independent tabs", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const view = mount(quickPanel());
    await waitFor(() => {
      expect(view.container.querySelectorAll('[role="tab"]')).toHaveLength(1);
    });

    expect(view.container.textContent).toContain("Quick Chat");
    expect(view.container.textContent).toContain(
      "Quick Chats are temporary and disappear when you close CodeTwo."
    );
    expect(
      view.container
        .querySelector(".quick-chat-panel")
        ?.hasAttribute("data-open")
    ).toBe(true);
    click(button(view.container, "New Quick Chat"));
    await flush();
    expect(view.container.querySelectorAll('[role="tab"]')).toHaveLength(2);

    view.unmount();
  });

  test("routes selected transcript text into a pristine side-chat draft", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const handled = [];
    const view = mount(
      panel(
        { id: "selection-1", text: "Explain this excerpt" },
        () => {},
        (id) => handled.push(id)
      )
    );
    await waitFor(() => {
      const textarea = view.container.querySelector("textarea");
      expect(textarea?.value).toBe("Explain this excerpt");
    });
    expect(handled).toEqual(["selection-1"]);

    view.unmount();
  });

  test("replaces the current Side Chat when a new excerpt arrives instead of hiding extra tabs", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const handled = [];
    const onSeedHandled = (id) => handled.push(id);
    const view = mount(
      panel(
        { id: "selection-1", text: "First excerpt" },
        () => {},
        onSeedHandled
      )
    );
    await waitFor(() => {
      expect(view.container.querySelector("textarea")?.value).toBe(
        "First excerpt"
      );
    });

    view.rerender(
      panel(
        { id: "selection-2", text: "Second excerpt" },
        () => {},
        onSeedHandled
      )
    );
    await waitFor(() => {
      expect(view.container.querySelector("textarea")?.value).toBe(
        "Second excerpt"
      );
    });

    const side = view.container.querySelector('[data-chat-surface="side"]');
    expect(side?.dataset.chatCount).toBe("1");
    expect(side?.querySelectorAll('[role="tab"]')).toHaveLength(0);
    expect(handled).toEqual(["selection-1", "selection-2"]);

    view.unmount();
  });

  test("hides without deleting the current local tab", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    let closes = 0;
    const view = mount(
      quickPanel(null, () => {
        closes += 1;
      })
    );
    await waitFor(() => {
      expect(view.container.querySelectorAll('[role="tab"]')).toHaveLength(1);
    });
    click(button(view.container, "Hide Quick Chat"));
    expect(closes).toBe(1);
    expect(view.container.querySelectorAll('[role="tab"]')).toHaveLength(1);

    view.unmount();
  });

  test("closes the floating panel with Escape", async () => {
    activateDom();
    let closes = 0;
    const view = mount(
      quickPanel(null, () => {
        closes += 1;
      })
    );
    await waitFor(() => {
      expect(view.container.querySelectorAll('[role="tab"]')).toHaveLength(1);
    });

    dom.window.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape",
      })
    );
    expect(closes).toBe(1);

    view.unmount();
  });
});
