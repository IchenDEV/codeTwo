// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { act as reactAct } from "react";
import { activateDom, button, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { SceneChip, ScenePicker, SourceBadge } = await import("../src/session/SceneChip");
const { ProviderPicker } = await import("../src/session/Composer");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function sceneInfo(overrides = {}) {
  return {
    reference: "builtin:develop",
    name: "develop",
    title: "Develop",
    description: "Plan-first implementation",
    icon: "🛠️",
    source: "builtin",
    keywords: [],
    has_brief: true,
    localizations: {},
    artifacts: [],
    execution: { session_mode: "auto_edit" },
    ...overrides,
  };
}

function config(overrides = {}) {
  return {
    providers: [],
    providersStatus: "ready",
    provider: "claude_code",
    onProvider: () => {},
    onReloadProviders: () => {},
    mode: "ask",
    sandbox: "workspace_write",
    modeChangeDisabled: false,
    onSessionMode: () => true,
    worktreeBase: null,
    activeWorktreeBaseline: null,
    activeWorktreeUnknown: false,
    worktreeOptions: [],
    worktreeOptionsLoading: false,
    onWorktreeBase: () => {},
    planMode: false,
    onPlan: () => {},
    memoryEnabled: true,
    memoryRead: "inherit",
    memoryWrite: "inherit",
    onMemoryPolicy: () => {},
    hasSession: false,
    scenesEnabled: true,
    scenes: [sceneInfo()],
    activeScene: sceneInfo(),
    autoScene: false,
    onAutoScene: () => {},
    onScene: () => {},
    onManageScenes: () => {},
    sceneCustomized: false,
    scenePendingFields: [],
    onRestartInScene: () => {},
    ...overrides,
  };
}

function renderChip(cfg) {
  return mount(
    <I18nProvider>
      <SceneChip
        config={cfg}
        models={[]}
        currentModel={null}
        defaultModel={null}
        onModel={() => {}}
        configOptions={[]}
        onConfigOption={() => {}}
      />
    </I18nProvider>,
  );
}

describe("ProviderPicker", () => {
  test("keeps known providers selectable and offers retry when desktop detection fails", async () => {
    activateDom();
    let retries = 0;
    const rendered = mount(
      <I18nProvider>
        <ProviderPicker
          config={config({
            providers: [],
            providersStatus: "error",
            provider: "grok",
            onReloadProviders: () => { retries += 1; },
          })}
        />
      </I18nProvider>,
    );
    const trigger = rendered.container.querySelector("button");

    await reactAct(async () => {
      trigger?.dispatchEvent(new dom.window.PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
      }));
      trigger?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();

    try {
      const popup = dom.document.body.querySelector('[data-slot="popover-content"]');
      expect(trigger?.textContent?.trim()).toBe("Grok");
      expect(popup?.textContent).toContain("Grok");
      expect(popup?.textContent).toContain("OpenAI Codex");
      button(popup, "Retry").click();
      expect(retries).toBe(1);
    } finally {
      rendered.unmount();
      await flush();
    }
  });
});

describe("SceneChip", () => {
  test("shows the active scene's title on the chip", () => {
    activateDom();
    const rendered = renderChip(config());
    expect(rendered.container.textContent).toContain("Develop");
    expect(rendered.container.textContent).not.toContain("🛠️");
    rendered.unmount();
  });

  test("shows every current posture value and wraps scene details without emoji", async () => {
    activateDom();
    const rendered = renderChip(config());
    const trigger = rendered.container.querySelector('[aria-label="Scene: Develop"]');
    expect(trigger).toBeTruthy();

    await reactAct(async () => {
      trigger?.dispatchEvent(
        new dom.window.PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 1,
        }),
      );
      trigger?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();

    const content = dom.document.body.textContent ?? "";
    expect(content).toContain("Ask first");
    expect(content).toContain("Memory on");
    expect(content).toContain("Plan first: Off");
    expect(content).toContain("No worktree");
    expect(content).not.toContain("🛠️");
    expect(dom.document.body.querySelector('[data-slot="popover-content"]')?.className).toContain(
      "w-2xl",
    );
    const detail = Array.from(dom.document.body.querySelectorAll("span")).find(
      (node) => node.textContent === "Plan-first implementation",
    );
    expect(detail?.classList.contains("whitespace-normal")).toBe(true);
    rendered.unmount();
  });

  test("falls back to the no-scene label", () => {
    activateDom();
    const rendered = renderChip(config({ activeScene: null }));
    expect(rendered.container.textContent).toContain("No scene");
  });

  test("keeps Auto visible with the agent-selected scene and enables it from the menu", async () => {
    activateDom();
    const changes = [];
    const rendered = renderChip(config({ autoScene: true, onAutoScene: (enabled) => changes.push(enabled) }));
    const trigger = rendered.container.querySelector('[aria-label="Scene: Auto · Develop"]');
    expect(trigger).toBeTruthy();

    await reactAct(async () => {
      trigger?.dispatchEvent(new dom.window.PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerId: 1 }));
      trigger?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();

    expect(dom.document.body.textContent).toContain("Agent chooses and switches scenes as the task changes");
    const autoOption = Array.from(
      dom.document.body.querySelectorAll('[data-slot="popover-content"] button'),
    ).find((candidate) => candidate.textContent?.includes("Auto scene"));
    expect(autoOption).toBeTruthy();
    await reactAct(async () => {
      autoOption?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(changes).toEqual([true]);
    rendered.unmount();
  });

  test("marks a customized scene", () => {
    activateDom();
    const rendered = renderChip(config({ sceneCustomized: true }));
    expect(rendered.container.querySelector('[aria-label="Customized"]')).toBeTruthy();
  });

  test("marks a partial soft-apply", () => {
    activateDom();
    const rendered = renderChip(config({ scenePendingFields: ["model", "worktree"] }));
    expect(rendered.container.querySelector('[aria-label="Partially applied"]')).toBeTruthy();
  });

  test("opens the complete scene manager from the scene chip", async () => {
    activateDom();
    let opened = false;
    const rendered = renderChip(config({ onManageScenes: () => { opened = true; } }));
    const trigger = rendered.container.querySelector('[aria-label="Scene: Develop"]');
    await reactAct(async () => {
      trigger?.dispatchEvent(new dom.window.PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerId: 1 }));
      trigger?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();
    button(dom.document.body, "Manage scenes").click();
    expect(opened).toBe(true);
    rendered.unmount();
  });

  test("keeps session configuration while removing every scene surface", async () => {
    activateDom();
    const rendered = renderChip(config({ scenesEnabled: false }));
    const trigger = rendered.container.querySelector(
      '[aria-label="Session configuration: Session configuration"]',
    );
    expect(trigger).toBeTruthy();

    await reactAct(async () => {
      trigger?.dispatchEvent(new dom.window.PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
      }));
      trigger?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();

    const content = dom.document.body.textContent ?? "";
    expect(content).toContain("Ask first");
    expect(content).toContain("Memory on");
    expect(content).not.toContain("Develop");
    expect(content).not.toContain("Auto scene");
    expect(content).not.toContain("Manage scenes");
    rendered.unmount();
  });

  test("removes the memory policy control when memory is disabled", async () => {
    activateDom();
    const rendered = renderChip(config({ memoryEnabled: false }));
    const trigger = rendered.container.querySelector('[aria-label="Scene: Develop"]');
    await reactAct(async () => {
      trigger?.dispatchEvent(new dom.window.PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
      }));
      trigger?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();

    expect(dom.document.body.textContent).not.toContain("Memory on");
    rendered.unmount();
  });
});

describe("SourceBadge", () => {
  test("names each source", () => {
    activateDom();
    const rendered = mount(
      <I18nProvider>
        <SourceBadge source="project" />
      </I18nProvider>,
    );
    expect(rendered.container.textContent).toBe("Project");
  });
});

describe("ScenePicker management", () => {
  test("offers create, edit, and duplicate actions without making builtins editable", async () => {
    activateDom();
    const calls = [];
    const builtin = sceneInfo();
    const user = sceneInfo({ reference: "user:review", name: "review", title: "Review", source: "user" });
    const rendered = mount(
      <I18nProvider>
        <ScenePicker
          scenes={[builtin, user]}
          active={null}
          auto={false}
          onAuto={() => {}}
          onScene={() => {}}
          onCreate={() => calls.push("create")}
          onEdit={(scene) => calls.push(`edit:${scene.reference}`)}
          onDuplicate={(scene) => calls.push(`duplicate:${scene.reference}`)}
          onClose={() => {}}
        />
      </I18nProvider>,
    );
    await flush();

    button(dom.document.body, "New scene").click();
    button(dom.document.body, "Duplicate: Develop").click();
    button(dom.document.body, "Edit: Review").click();
    expect(calls).toEqual(["create", "duplicate:builtin:develop", "edit:user:review"]);
    expect(() => button(dom.document.body, "Edit: Develop")).toThrow();
    rendered.unmount();
  });
});
