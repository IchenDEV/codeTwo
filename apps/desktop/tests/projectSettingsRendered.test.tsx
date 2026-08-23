// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { act as reactAct } from "react";

import { activateDom, button, dom, flush, mount, restoreDom, waitFor } from "./domTestHarness";

activateDom();
const { SettingsPage } = await import("../src/settings/SettingsPage");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("Project settings", () => {
  test("exposes a complete project profile backed by real callbacks", async () => {
    const renamed = [];
    const icons = [];
    const agentDefaults = [];
    let actionsOpened = 0;
    const project = {
      path: "/tmp/codeTwo",
      name: "codeTwo",
      last_opened_at: Date.now(),
      default_worktree_mode: null,
      has_icon: false,
      icon_updated_at: 0,
      default_provider: "codex",
      default_model: "gpt-5.6-sol",
      default_reasoning_effort: "low",
    };
    const view = mount(
      <I18nProvider>
        <SettingsPage
          bindings={[]}
          capturing={null}
          onCapture={() => {}}
          providers={[{
            id: "codex",
            display_name: "OpenAI Codex",
            available: true,
            needs_node: true,
            models: [
              { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", description: null },
            ],
            capabilities: [],
          }]}
          provider="codex"
          projectPath={project.path}
          project={project}
          projects={[project]}
          onProjectWorktreeMode={async () => {}}
          onProjectRename={async (path, name) => renamed.push([path, name])}
          onProjectIcon={async (path, source) => icons.push([path, source])}
          onProjectAgentDefaults={async (...values) => agentDefaults.push(values)}
          projectIconPicker={async () => "/tmp/project.png"}
          projectActionsCount={2}
          onAddProjectAction={() => { actionsOpened += 1; }}
          memoryEnabled={false}
          initialTab="project"
          onClose={() => {}}
        />
      </I18nProvider>,
    );
    await flush();

    expect(view.container.textContent).toContain("Project profile");
    expect(view.container.textContent).toContain("New sessions");
    expect(view.container.textContent).toContain("Checkout");
    expect(view.container.textContent).toContain("2 actions configured for this project.");
    expect(view.container.textContent).toContain("Danger");
    expect(view.container.textContent).toContain("GPT-5.6 Sol");
    expect(view.container.textContent).toContain("Low");
    expect(view.container.querySelectorAll(".project-settings-control").length).toBeGreaterThanOrEqual(8);
    expect(view.container.querySelector("[data-project-icon-picker]")).not.toBeNull();
    expect(view.container.querySelector("[data-project-icon-picker] [data-project-icon]")?.getAttribute("style"))
      .toContain("width: 24px");
    expect(view.container.querySelector('[data-slot="switch"][aria-label="Scene schedules"]')).not.toBeNull();

    const name = view.container.querySelector('input[aria-label="Name"]');
    await reactAct(async () => {
      name.focus();
      name.value = "C2 Studio";
      name.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await flush();
    await reactAct(async () => {
      name.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
    });
    await waitFor(() => expect(renamed).toEqual([[project.path, "C2 Studio"]]));

    await reactAct(async () => button(view.container, "Choose image").click());
    await waitFor(() => expect(icons).toEqual([[project.path, "/tmp/project.png"]]));
    await reactAct(async () => button(view.container, "Use provider default model").click());
    await waitFor(() => expect(agentDefaults).toEqual([[project.path, "codex", null, "low"]]));
    button(view.container, "Add action").click();
    expect(actionsOpened).toBe(1);

    view.unmount();
  });
});
