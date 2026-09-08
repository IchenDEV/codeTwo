import { afterEach, expect, test } from "bun:test";

import React, { act } from "react";
import { Simulate } from "react-dom/test-utils";

import type { IssueDeliveryApi } from "../src/issues/issueDelivery";
import {
  activateDom,
  button,
  click,
  dom,
  flush,
  mount,
} from "./domTestHarness";

activateDom();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const { I18nProvider } = await import("../src/i18n");
const { IssueConnectorSettings, IssueDeliveryDialog } =
  await import("../src/issues/IssueDeliveryDialog");
afterEach(() => dom.document.body.replaceChildren());
const connector = {
  plugin_id: "linear-test",
  connector_id: "issues",
  name: "Linear",
};
const connection = {
  account: { id: "me", name: "Developer" },
  workspace: { id: "workspace", name: "Workspace" },
  teams: [
    {
      id: "team",
      key: "APP",
      name: "Application",
      states: { nodes: [{ id: "done", name: "Done", type: "completed" }] },
    },
  ],
};
const issue = {
  workspace_id: "workspace",
  id: "issue-id",
  identifier: "APP-7",
  title: "Export search results",
  url: "https://linear.app/test/issue/APP-7",
  description: "Export filtered results as CSV.",
  updated_at: "2026-09-08",
  team_id: "team",
  team_name: "Application",
  comments: [],
  attachments: [],
};
async function inputValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  await act(async () => {
    const prototype =
      input instanceof dom.window.HTMLTextAreaElement
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      input,
      value
    );
    Simulate.change(input);
  });
}
function wrap(element: React.ReactElement) {
  return <I18nProvider preferenceOverride="en">{element}</I18nProvider>;
}

test("connection submits a credential only to connect and clears the field", async () => {
  const calls: Array<{ method: string; args: unknown }> = [];
  const api: IssueDeliveryApi = async <T,>(method: string, args?: unknown) => {
    calls.push({ method, args });
    if (method === "read") throw new Error("Not connected");
    return connection as T;
  };
  const view = mount(
    wrap(
      <IssueConnectorSettings
        connector={connector}
        api={api}
        onOpen={() => {}}
      />
    )
  );
  await flush();
  const input = view.container.querySelector<HTMLInputElement>(
    'input[type="password"]'
  )!;
  await inputValue(input, "test-key-that-must-not-persist");
  await act(async () => click(button(view.container, "Connect")));
  expect(calls.find((call) => call.method === "connect")?.args).toEqual({
    connector: { plugin_id: "linear-test", connector_id: "issues" },
    token: "test-key-that-must-not-persist",
  });
  expect(view.container.textContent).toContain("Workspace · Developer");
  expect(view.container.querySelector('input[type="password"]')).toBeNull();
  expect(JSON.stringify(dom.window.localStorage)).not.toContain(
    "test-key-that-must-not-persist"
  );
  view.unmount();
});

test("selecting an issue starts with explicit repository validation and delivery permissions", async () => {
  const calls: Array<{ method: string; args: unknown }> = [];
  const api: IssueDeliveryApi = async <T,>(method: string, args?: unknown) => {
    calls.push({ method, args });
    const request = args as { operation?: string };
    if (method === "repository")
      return {
        base_branch: "main",
        validation_command: "bun test",
        repository_identity: "repo-identity",
      } as T;
    if (method === "list") return [] as T;
    if (method === "read" && request.operation === "connection.info")
      return connection as T;
    if (method === "read" && request.operation === "issues.list")
      return { items: [issue], cursor: null } as T;
    if (method === "read") return issue as T;
    if (method === "start") return { session_id: null } as T;
    throw new Error(`Unexpected method ${method}`);
  };
  const view = mount(
    wrap(
      <IssueDeliveryDialog
        connector={connector}
        projects={[{ path: "/repo", name: "Repository" }]}
        providers={[
          {
            id: "codex",
            display_name: "Codex",
            available: true,
            enabled: true,
          },
        ]}
        repository="/repo"
        api={api}
        onOpenSession={() => {}}
        onClose={() => {}}
      />
    )
  );
  await flush();
  await act(async () => click(button(dom.document, "Search")));
  await act(async () =>
    click(button(dom.document, "APP-7 · Export search results"))
  );
  expect(dom.document.body.textContent).toContain("Acceptance criteria");
  await act(async () => click(button(dom.document, "Start development")));
  const request = calls.find((call) => call.method === "start")?.args as Record<
    string,
    unknown
  >;
  expect(request.repository).toBe("/repo");
  expect(request.issue_id).toBe("issue-id");
  expect(request.validation_commands).toEqual(["bun test"]);
  expect(request.permissions).toEqual({
    push: true,
    create_pr: true,
    writeback: true,
  });
  expect(request.done_state_id).toBeNull();
  expect(request).not.toHaveProperty("token");
  view.unmount();
});

test("disconnected trackers retain existing tasks and sync failure state", async () => {
  const run = {
    id: "run",
    plugin_id: "linear-test",
    connector_id: "issues",
    repository: "/repo",
    repository_identity: "repo-identity",
    session_id: "session",
    issue,
    stage: "review",
    error: null,
    acceptance: issue.description,
    pending_issue: null,
    verification: null,
    pull_request: {
      number: 9,
      url: "https://github.com/test/repo/pull/9",
      state: "OPEN",
    },
    sync_pending: true,
    sync_error: "Reconnect this tracker.",
  };
  const opened: string[] = [];
  const api: IssueDeliveryApi = async <T,>(method: string) => {
    if (method === "list")
      return [
        {
          ...run,
          id: "older-run",
          session_id: "older-session",
          stage: "closed",
        },
        run,
      ] as T;
    if (method === "repository")
      return {
        base_branch: "main",
        validation_command: "bun test",
        repository_identity: "repo-identity",
      } as T;
    throw new Error("Offline");
  };
  const view = mount(
    wrap(
      <IssueDeliveryDialog
        connector={connector}
        projects={[{ path: "/repo", name: "Repository" }]}
        providers={[]}
        repository="/repo"
        api={api}
        onOpenSession={(id) => opened.push(id)}
        onClose={() => {}}
      />
    )
  );
  await flush();
  await act(async () => click(button(dom.document, "APP-7 · Awaiting review")));
  expect(dom.document.body.textContent).toContain("Reconnect this tracker.");
  expect(dom.document.body.textContent).toContain("Sync pending");
  await act(async () => click(button(dom.document, "Open task")));
  expect(opened).toEqual(["session"]);
  expect(dom.document.body.textContent).not.toContain("Start development");
  view.unmount();
});

test("a new attempt returns to the authorization form before any start request", async () => {
  const calls: Array<{ method: string; args: unknown }> = [];
  const run = {
    id: "finished",
    plugin_id: "linear-test",
    connector_id: "issues",
    repository: "/repo",
    repository_identity: "repo-identity",
    session_id: "old-session",
    issue,
    stage: "closed",
    error: null,
    acceptance: issue.description,
    pending_issue: null,
    verification: null,
    pull_request: null,
    sync_pending: false,
    sync_error: null,
    permissions: { push: false, create_pr: false, writeback: false },
    validation_commands: ["bun test"],
  };
  const api: IssueDeliveryApi = async <T,>(method: string, args?: unknown) => {
    calls.push({ method, args });
    if (method === "list") return [run] as T;
    if (method === "repository")
      return {
        base_branch: "main",
        validation_command: "bun test",
        repository_identity: "repo-identity",
      } as T;
    if (method === "read") return connection as T;
    if (method === "start") return { session_id: null } as T;
    throw new Error("Unexpected method");
  };
  const view = mount(
    wrap(
      <IssueDeliveryDialog
        connector={connector}
        projects={[{ path: "/repo", name: "Repository" }]}
        providers={[
          {
            id: "codex",
            display_name: "Codex",
            available: true,
            enabled: true,
          },
        ]}
        repository="/repo"
        api={api}
        onOpenSession={() => {}}
        onClose={() => {}}
      />
    )
  );
  await flush();
  await act(async () =>
    click(button(dom.document, "APP-7 · PR closed without merge"))
  );
  await act(async () => click(button(dom.document, "Start a new attempt")));
  expect(calls.filter((call) => call.method === "start")).toHaveLength(0);
  expect(dom.document.body.textContent).toContain(
    "Allow pushing this task branch"
  );
  await act(async () => click(button(dom.document, "Start development")));
  const request = calls.find((call) => call.method === "start")?.args as Record<
    string,
    unknown
  >;
  expect(request.new_attempt).toBe(true);
  expect(request.permissions).toEqual({
    push: false,
    create_pr: false,
    writeback: false,
  });
  view.unmount();
});
