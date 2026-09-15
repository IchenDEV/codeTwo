// @ts-nocheck
import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  activateDom,
  button,
  click,
  dom,
  flush,
  mount,
  restoreDom,
} from "./domTestHarness";

const now = Date.now();
const automations = [
  {
    id: "a1",
    name: "Nightly triage",
    prompt: "Triage the queue",
    project_path: "/tmp/mini-game",
    provider: "codex",
    cron: "0 9 * * *",
    timezone: "UTC",
    enabled: true,
    use_worktree: false,
    permission_mode: "ask",
    sandbox_policy: "workspace_write",
    next_run_at: now,
    last_run_at: now,
    created_at: now,
    updated_at: now,
  },
];
const runs = [
  {
    id: "r1",
    automation_id: "a1",
    session_id: null,
    status: "failed",
    scheduled_for: now,
    started_at: now,
    finished_at: now,
    error: "provider exited 1",
    prompt: "Triage the queue",
  },
];
const rerunCalls: string[] = [];

mock.module("../src/bridge", () => ({
  listAutomations: async () => automations,
  listAutomationRuns: async () => runs,
  onAutomationChanged: async () => () => {},
  onAutomationAlert: async () => () => {},
  rerunAutomation: async (id: string) => {
    rerunCalls.push(id);
    return runs[0];
  },
  runAutomationNow: async () => runs[0],
  createAutomation: async () => automations[0],
  updateAutomation: async () => automations[0],
  deleteAutomation: async () => true,
  setAutomationEnabled: async () => automations[0],
  confirmNative: async () => true,
  providerLabel: () => "Codex",
}));

activateDom();
const { AutomationsPage } = await import("../src/automation/AutomationsPage");
const { I18nProvider } = await import("../src/i18n");
const { ToastProvider } = await import("../src/ui/toast");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("AutomationsPage run history", () => {
  test("exposes a per-run replay control that calls the rerun command", async () => {
    rerunCalls.length = 0;
    const view = mount(
      <I18nProvider>
        <ToastProvider>
          <AutomationsPage
            projects={[
              {
                name: "mini-game",
                path: "/tmp/mini-game",
                last_opened_at: now,
              },
            ]}
            providers={[
              { id: "codex", display_name: "Codex", available: true },
            ]}
            defaultProject="/tmp/mini-game"
            defaultProvider="codex"
            onAddProject={() => {}}
            onOpenSession={() => {}}
          />
        </ToastProvider>
      </I18nProvider>
    );
    await flush();

    click(button(view.container, "Runs"));
    await flush();

    const replay = view.container.querySelector(
      'button[aria-label="Run again"]'
    );
    expect(replay).not.toBeNull();
    click(replay);
    await flush();

    expect(rerunCalls).toEqual(["r1"]);

    view.unmount();
  });
});
