// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { act as reactAct } from "react";

import { activateDom, button, click, dom, flush, mount, waitFor } from "./domTestHarness";

activateDom();
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { I18nProvider } = await import("../src/i18n");
const { PullRequestsPage } = await import("../src/github/PullRequestsPage");
const { associateTaskPullRequest, createBoardTask } = await import("../src/taskboard/taskBoard");
const { githubPullRequestReference } = await import("../src/github/pullRequests");

const mounted = [];
let restoreCanvasContext = null;

function disableCanvasDrawing() {
  const getContext = dom.HTMLCanvasElement.prototype.getContext;
  dom.HTMLCanvasElement.prototype.getContext = () => null;
  restoreCanvasContext = () => {
    dom.HTMLCanvasElement.prototype.getContext = getContext;
  };
}

afterEach(async () => {
  for (const view of mounted.splice(0)) await reactAct(async () => view.unmount());
  await flush();
  restoreCanvasContext?.();
  restoreCanvasContext = null;
  dom.document.body.replaceChildren();
});

const summary = {
  id: "https://github.com/acme/repo/pull/7",
  number: 7,
  title: "Build the GitHub panel",
  url: "https://github.com/acme/repo/pull/7",
  repository: { name: "repo", nameWithOwner: "acme/repo" },
  author: { login: "octocat" },
  isDraft: false,
  updatedAt: "2026-08-24T10:00:00Z",
  createdAt: "2026-08-23T10:00:00Z",
  labels: [],
  commentsCount: 2,
  authored: true,
  reviewRequested: false,
  reviewed: false,
};

const detail = {
  ...summary,
  body: "## What changed\n\n- Added real pull request data",
  additions: 120,
  deletions: 8,
  changedFiles: 1,
  baseRefName: "main",
  headRefName: "feature/github-panel",
  state: "OPEN",
  mergeStateStatus: "CLEAN",
  mergeable: "MERGEABLE",
  reviewDecision: "",
  reviewers: [],
  checks: [{ name: "test", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: null }],
  files: [{ path: "src/github.ts", additions: 120, deletions: 8, changeType: "MODIFIED" }],
};

const reviewingSummary = {
  ...summary,
  id: "https://github.com/acme/repo/pull/8",
  number: 8,
  title: "Review the GitHub panel",
  url: "https://github.com/acme/repo/pull/8",
  authored: false,
  reviewed: true,
};

const reviewingDetail = {
  ...detail,
  ...reviewingSummary,
  body: "## Review notes\n\n- Uses the filtered selection",
};

describe("PullRequestsPage", () => {
  test("loads real data projections, switches code view, and starts chat", async () => {
    activateDom();
    disableCanvasDrawing();
    dom.window.localStorage.setItem("codetwo.language", "en");
    let chatted = null;
    const view = mount(
      <I18nProvider>
        <PullRequestsPage
          loadPullRequests={async () => [summary]}
          loadPullRequest={async () => detail}
          onChat={(value) => { chatted = value; }}
        />
      </I18nProvider>,
    );
    mounted.push(view);

    expect(view.container.querySelector(".pull-requests-list-pane h1")?.textContent).toBe("Pull requests");
    expect(view.container.querySelector(".pull-requests-list-pane h1")?.className).toContain("text-dialog");
    await waitFor(() => {
      expect(dom.document.body.textContent).toContain("Build the GitHub panel");
      expect(dom.document.body.textContent).toContain("feature/github-panel");
    });
    expect(dom.document.body.textContent).toContain("1 checks passed");
    expect(dom.document.body.textContent).toContain("Added real pull request data");

    click(button(dom.document.body, "Code"));
    await flush();
    expect(dom.document.body.textContent).toContain("src/github.ts");

    click(button(dom.document.body, "Chat"));
    expect(chatted).toEqual(detail);
  });

  test("keeps the selected detail inside the filtered result set", async () => {
    activateDom();
    disableCanvasDrawing();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const view = mount(
      <I18nProvider>
        <PullRequestsPage
          loadPullRequests={async () => [summary, reviewingSummary]}
          loadPullRequest={async (item) => item.id === reviewingSummary.id ? reviewingDetail : detail}
          onChat={() => {}}
        />
      </I18nProvider>,
    );
    mounted.push(view);

    await waitFor(() => expect(dom.document.body.textContent).toContain("feature/github-panel"));
    click(button(dom.document.body, "Reviewing"));

    await waitFor(() => {
      expect(dom.document.body.textContent).toContain("Review the GitHub panel");
      expect(dom.document.body.textContent).toContain("Uses the filtered selection");
    });
  });

  test("links to the rendered active task with its revision", async () => {
    activateDom();
    disableCanvasDrawing();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const activeTask = createBoardTask(
      { title: "Ship the GitHub panel" },
      { id: "task-active", now: 1 },
    );
    let command = null;
    const view = mount(
      <I18nProvider>
        <PullRequestsPage
          loadPullRequests={async () => [summary]}
          loadPullRequest={async () => detail}
          onChat={() => {}}
          tasks={[activeTask]}
          activeTaskId={activeTask.id}
          onLinkTask={(value, target) => { command = { value, target }; }}
        />
      </I18nProvider>,
    );
    mounted.push(view);

    await waitFor(() => expect(dom.document.body.textContent).toContain("feature/github-panel"));
    click(button(dom.document.body, "Link to task"));
    expect(command).toEqual({
      value: detail,
      target: { id: "task-active", revision: 0 },
    });
  });

  test("opens and revision-guards an existing task link", async () => {
    activateDom();
    disableCanvasDrawing();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const task = createBoardTask(
      { title: "Ship the GitHub panel" },
      { id: "task-linked", now: 1 },
    );
    const linked = associateTaskPullRequest(
      [task],
      task.id,
      githubPullRequestReference(detail),
      2,
    )[0];
    let opened = null;
    let unlinked = null;
    const view = mount(
      <I18nProvider>
        <PullRequestsPage
          loadPullRequests={async () => [summary]}
          loadPullRequest={async () => detail}
          onChat={() => {}}
          tasks={[linked]}
          onOpenTask={(id) => { opened = id; }}
          onUnlinkTask={(value, link) => { unlinked = { value, link }; }}
        />
      </I18nProvider>,
    );
    mounted.push(view);

    await waitFor(() => expect(dom.document.body.textContent).toContain("feature/github-panel"));
    click(button(dom.document.body, "Open task"));
    expect(opened).toBe("task-linked");
    click(button(dom.document.body, "Unlink task"));
    expect(unlinked).toEqual({
      value: detail,
      link: { id: "task-linked", revision: 1 },
    });
  });
});
