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

describe("Worktrees settings", () => {
  test("loads every project and exposes conversation and discard actions", async () => {
    const projects = [
      {
        path: "/repo/codeTwo",
        name: "codeTwo",
        last_opened_at: 2,
        default_worktree_mode: null,
      },
      {
        path: "/repo/docs",
        name: "Docs",
        last_opened_at: 1,
        default_worktree_mode: null,
      },
    ];
    const listed = [];
    const discarded = [];
    const confirmations = [];
    const opened = [];
    const savedSettings = [];
    let currentSettings = {
      root: "/tmp/c2-worktrees",
      fetch_upstream: false,
      auto_delete: false,
      auto_delete_limit: 15,
    };
    const sessionEntry = {
      path: "/repo/.codetwo-worktrees/codeTwo-one",
      branch: "refs/heads/codetwo/one",
      kind: "session",
      registered: true,
      checkout_present: true,
      session_id: "session-1",
      session_title: "Fix renderer",
      session_archived: false,
      worktree_discarded: false,
    };
    const view = mount(
      <I18nProvider>
        <SettingsPage
          bindings={[]}
          capturing={null}
          onCapture={() => {}}
          providers={[]}
          provider="codex"
          projectPath={projects[0].path}
          project={projects[0]}
          projects={projects}
          onProjectWorktreeMode={async () => {}}
          onOpenSession={(session) => opened.push(session)}
          worktreeLister={async (path) => {
            listed.push(path);
            return path === projects[0].path ? [sessionEntry] : [];
          }}
          worktreeSettingsLoader={async () => currentSettings}
          worktreeSettingsSaver={async (settings) => {
            savedSettings.push(settings);
            currentSettings = settings;
            return settings;
          }}
          sessionWorktreeDiscarder={async (session) => {
            discarded.push(session);
            return { removed_checkout: true };
          }}
          worktreeDiscardConfirmer={async (message) => {
            confirmations.push(message);
            return true;
          }}
          memoryEnabled={false}
          initialTab="worktrees"
          onClose={() => {}}
        />
      </I18nProvider>,
    );

    await waitFor(() => expect(listed).toEqual(projects.map((project) => project.path)));
    await flush();
    expect(view.container.textContent).toContain("Review isolated checkouts across your projects");
    expect(view.container.textContent).toContain("Worktree root");
    expect(view.container.textContent).toContain("Fetch upstream before creating worktrees");
    expect(view.container.textContent).toContain("Automatically delete old worktrees");
    expect(view.container.textContent).toContain("Auto-delete limit");
    expect(view.container.querySelector('input[aria-label="Auto-delete limit"]')?.disabled).toBe(true);
    expect(view.container.querySelector('input[aria-label="Worktree root"]')?.value).toBe("/tmp/c2-worktrees");
    expect(view.container.textContent).toContain("codeTwo");
    expect(view.container.textContent).toContain("Docs");
    expect(view.container.textContent).toContain("Fix renderer");
    expect(view.container.textContent).toContain("codetwo/one");
    expect(view.container.textContent).toContain("Worktrees: 1");
    expect(view.container.textContent).toContain("No worktrees.");

    await reactAct(async () => {
      view.container.querySelector('[data-slot="switch"][aria-label="Fetch upstream before creating worktrees"]').click();
    });
    await waitFor(() => expect(savedSettings.at(-1)?.fetch_upstream).toBe(true));

    await reactAct(async () => {
      view.container.querySelector('[data-slot="switch"][aria-label="Automatically delete old worktrees"]').click();
    });
    await waitFor(() => expect(savedSettings.at(-1)?.auto_delete).toBe(true));
    await waitFor(() => {
      expect(view.container.querySelector('input[aria-label="Auto-delete limit"]')?.disabled).toBe(false);
      expect(view.container.querySelector('input[aria-label="Worktree root"]')?.disabled).toBe(false);
    });

    await reactAct(async () => button(view.container, "Open conversation").click());
    expect(opened).toEqual(["session-1"]);

    await reactAct(async () => button(view.container, "Discard").click());
    await waitFor(() => expect(discarded).toEqual(["session-1"]));
    expect(confirmations[0]).toContain(sessionEntry.path);
    expect(listed.slice(0, projects.length)).toEqual(projects.map((project) => project.path));
    expect(listed.at(-1)).toBe(projects[0].path);

    view.unmount();
  });
});
