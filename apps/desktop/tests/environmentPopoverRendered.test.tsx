// @ts-nocheck
import { act as reactAct } from "react";
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { activateDom, dom, flush, mount, restoreDom, waitFor } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { EnvironmentPopover } = await import("../src/environment/EnvironmentPopover");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function renderEnvironment(onRefresh = () => {}, preview = null, props = {}) {
  return mount(
    <I18nProvider>
      <EnvironmentPopover
        project="mini-game"
        projectPath="/tmp/mini-game"
        projects={[]}
        git={null}
        diffStat={{ added: 0, deleted: 0 }}
        onRefresh={onRefresh}
        onSelectProject={() => {}}
        onAddProject={() => {}}
        onOpenSourceControl={() => {}}
        onOpenSettings={() => {}}
        turns={[]}
        preview={preview}
        {...props}
      />
    </I18nProvider>,
  );
}

describe("EnvironmentPopover layout", () => {
  test("remains mounted in the session header", () => {
    const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

    expect(appSource).toContain('from "./environment/EnvironmentPopover"');
    expect(appSource).toContain("<EnvironmentPopover");
  });

  test("stays out of the reading surface until requested and dismisses on outside press", async () => {
    activateDom();
    let refreshes = 0;
    const outside = dom.document.createElement("button");
    outside.textContent = "Reading surface";
    dom.document.body.append(outside);
    const view = renderEnvironment(() => {
      refreshes += 1;
    });

    expect(dom.document.body.querySelector('[data-slot="popover-content"]')).toBeNull();

    const trigger = view.container.querySelector('[aria-label="Project environment"]');
    expect(trigger).toBeTruthy();
    expect(trigger?.getAttribute("data-variant")).toBe("ghost");
    expect(trigger?.classList.contains("text-muted-foreground")).toBe(true);
    expect(trigger?.classList.contains("hover:text-muted-foreground")).toBe(true);
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

    const content = dom.document.body.querySelector('[data-slot="popover-content"]');
    expect(content).toBeTruthy();
    expect(trigger?.getAttribute("data-variant")).toBe("ghost");
    expect(trigger?.classList.contains("bg-fill-rest")).toBe(true);
    expect(trigger?.classList.contains("text-primary")).toBe(false);
    expect(content?.className).toContain("max-h-(--available-height)");
    expect(content?.className).toContain("overflow-y-auto");
    expect(content?.textContent).toContain("Changes");
    expect(content?.textContent).toContain("Local");
    expect(content?.textContent).toContain("Commit or push");
    expect(content?.textContent).not.toContain("Checkpoint now");
    expect(content?.textContent).not.toContain("Copy path");
    expect(content?.textContent).not.toContain("Tools");
    expect(content?.textContent).not.toContain("Issues");
    expect(content?.textContent).not.toContain("Usage");
    expect(content?.textContent).not.toContain("Plugin Hub");
    expect(content?.querySelector('[aria-label="Settings"]')).toBeTruthy();
    expect(refreshes).toBe(1);

    await reactAct(async () => {
      outside.dispatchEvent(
        new dom.window.PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 2,
        }),
      );
      outside.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    await waitFor(() => {
      expect(dom.document.body.querySelector('[data-slot="popover-content"]')).toBeNull();
    });
    view.unmount();
  });

  test("hangs the current Browser Use screenshot below the environment rows", async () => {
    activateDom();
    const view = renderEnvironment(() => {}, {
      kind: "browser",
      title: "Open example.com",
      artifact: {
        id: "browser-shot-2",
        mime_type: "image/png",
        bytes: 1024,
        width: 1280,
        height: 720,
        display_name: "example.com.png",
      },
    });

    const trigger = view.container.querySelector('[aria-label="Project environment"]');
    await reactAct(async () => {
      trigger?.dispatchEvent(
        new dom.window.PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 3,
        }),
      );
      trigger?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();

    const preview = dom.document.body.querySelector('[data-tool-preview="browser"]');
    expect(preview).toBeTruthy();
    expect(preview?.getAttribute("data-artifact-id")).toBe("browser-shot-2");
    expect(preview?.textContent).toContain("Browser Use");
    expect(preview?.textContent).toContain("Open example.com");
    view.unmount();
  });

  test("shows the current task list inside the environment popover", async () => {
    activateDom();
    const turn = {
      id: 1,
      accepted: true,
      streamBoundaryKnown: true,
      prompt: "Implement task progress",
      text: "",
      textDeltas: [],
      observedTextDeltas: 0,
      observedThoughtDeltas: 0,
      pendingTextDeltaSkips: 0,
      pendingThoughtDeltaSkips: 0,
      thoughts: [],
      tools: [],
      plan: [
        { content: "Inspect the event path", status: "completed" },
        { content: "Add tasks to quick info", status: "in_progress" },
        { content: "Run renderer checks", status: "pending" },
      ],
      startedAt: 1,
    };
    const view = renderEnvironment(() => {}, null, { turns: [turn] });

    const trigger = view.container.querySelector('[aria-label="Project environment"]');
    await reactAct(async () => {
      trigger?.dispatchEvent(
        new dom.window.PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 4,
        }),
      );
      trigger?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();

    const content = dom.document.body.querySelector('[data-slot="popover-content"]');
    const tasks = content?.querySelector("[data-task-plan-panel]");
    expect(tasks).toBeTruthy();
    expect(tasks?.textContent).toContain("Current tasks");
    expect(tasks?.textContent).toContain("Step 2 / 3");
    expect(tasks?.querySelectorAll("[data-task-plan-status]")).toHaveLength(3);
    expect(tasks?.querySelector('[data-task-plan-status="in_progress"]')?.textContent)
      .toContain("Add tasks to quick info");
    expect(view.container.querySelector('[data-dock-placement="right"]')).toBeNull();

    view.unmount();
  });
});
