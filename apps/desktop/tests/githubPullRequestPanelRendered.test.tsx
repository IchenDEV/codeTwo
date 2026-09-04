// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import {
  activateDom,
  button,
  click,
  dom,
  mount,
  restoreDom,
  text,
  waitFor,
} from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { GitHubPullRequestPanel } =
  await import("../src/git/GitHubPullRequestPanel");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

const sourceControl = {
  remote_name: "origin",
  provider: "github",
  provider_name: "GitHub",
  host: "github.com",
  web_url: "https://github.com/acme/code-two",
  change_request_label: "PR",
  create_change_request_supported: true,
  required_cli: "gh",
  required_cli_available: true,
};

const pullRequest = {
  number: 42,
  title: "feat: review from the dock",
  url: "https://github.com/acme/code-two/pull/42",
  state: "OPEN",
  is_draft: false,
  head_ref: "codex/review-dock",
  base_ref: "main",
  additions: 24,
  deletions: 3,
  changed_files: 1,
  body: "## Summary\n\nReady for review.",
  review_decision: null,
  mergeable: "MERGEABLE",
  merge_state_status: "CLEAN",
  author: "octocat",
  comments_count: 0,
  reviews_count: 0,
  checks: [
    {
      name: "validate",
      status: "COMPLETED",
      conclusion: "SUCCESS",
      details_url: null,
      workflow_name: "Desktop",
    },
  ],
  created_at: "2026-08-23T10:00:00Z",
  updated_at: "2026-08-23T11:00:00Z",
};

describe("GitHubPullRequestPanel", () => {
  test("opens, reviews, and merges the pull request linked to the current branch", async () => {
    activateDom();
    const opened = [];
    const reviews = [];
    const merges = [];
    let refreshes = 0;
    const api = {
      sourceControl: async () => sourceControl,
      currentPullRequest: async () => pullRequest,
      pullRequestDiff: async () => ({
        text: "diff --git a/src/a.ts b/src/a.ts\n@@ -1 +1 @@\n-old\n+new",
        truncated: false,
      }),
      review: async (...args) => reviews.push(args),
      merge: async (...args) => merges.push(args),
      open: async (url) => opened.push(url),
    };
    const view = mount(
      <I18nProvider>
        <GitHubPullRequestPanel
          cwd="/repo"
          branch="codex/review-dock"
          api={api}
          onRefreshGit={() => (refreshes += 1)}
        />
      </I18nProvider>
    );

    await waitFor(() =>
      expect(
        view.container.querySelector("[data-github-pr='42']")
      ).not.toBeNull()
    );
    expect(text(view.container, "feat: review from the dock")).not.toBeNull();
    expect(text(view.container, "All passed")).not.toBeNull();
    expect(
      view.container.querySelector('[data-slot="status-badge"]')?.dataset.tone
    ).toBe("success");

    click(button(view.container, "Open PR #42 on GitHub"));
    await waitFor(() => expect(opened).toEqual([pullRequest.url]));

    click(button(view.container, "Changes 1"));
    await waitFor(() =>
      expect(
        text(view.container, "diff --git a/src/a.ts b/src/a.ts")
      ).not.toBeNull()
    );
    const addedLine = view.container.querySelector(".diff-line.add");
    const removedLine = view.container.querySelector(".diff-line.del");
    expect(addedLine?.getAttribute("aria-label")).toBe("Added line: new");
    expect(addedLine?.querySelector(".diff-line-marker")?.textContent).toBe(
      "+"
    );
    expect(addedLine?.lastElementChild?.textContent).toBe("new");
    expect(removedLine?.getAttribute("aria-label")).toBe("Removed line: old");
    expect(removedLine?.querySelector(".diff-line-marker")?.textContent).toBe(
      "-"
    );
    expect(removedLine?.lastElementChild?.textContent).toBe("old");

    expect(button(view.container, "Comment").disabled).toBe(true);
    expect(button(view.container, "Request changes").disabled).toBe(true);
    click(button(view.container, "Approve"));
    await waitFor(() =>
      expect(reviews).toEqual([["/repo", 42, "approve", ""]])
    );

    await waitFor(() =>
      expect(button(view.container, "Merge").disabled).toBe(false)
    );
    click(button(view.container, "Merge"));
    expect(merges).toEqual([]);
    await waitFor(() =>
      expect(
        dom.document.body.querySelector('[data-slot="alert-dialog-content"]')
      ).not.toBeNull()
    );
    click(
      dom.document.body.querySelector('[data-slot="alert-dialog-action"]')!
    );
    await waitFor(() => expect(merges).toEqual([["/repo", 42, "squash"]]));
    await waitFor(() => expect(refreshes).toBe(1));
    view.unmount();
  });

  test("renders a branch-specific empty state when there is no associated pull request", async () => {
    activateDom();
    const api = {
      sourceControl: async () => sourceControl,
      currentPullRequest: async () => null,
      pullRequestDiff: async () => ({ text: "", truncated: false }),
      review: async () => {},
      merge: async () => {},
      open: async () => {},
    };
    const view = mount(
      <I18nProvider>
        <GitHubPullRequestPanel cwd="/repo" branch="codex/no-pr" api={api} />
      </I18nProvider>
    );
    await waitFor(() =>
      expect(
        text(view.container, "No pull request is linked to codex/no-pr.")
      ).not.toBeNull()
    );
    view.unmount();
  });

  test("keeps draft pull requests visually neutral", async () => {
    activateDom();
    const api = {
      sourceControl: async () => sourceControl,
      currentPullRequest: async () => ({ ...pullRequest, is_draft: true }),
      pullRequestDiff: async () => ({ text: "", truncated: false }),
      review: async () => {},
      merge: async () => {},
      open: async () => {},
    };
    const view = mount(
      <I18nProvider>
        <GitHubPullRequestPanel
          cwd="/repo"
          branch="codex/review-dock"
          api={api}
        />
      </I18nProvider>
    );

    await waitFor(() =>
      expect(
        view.container.querySelector("[data-github-pr='42']")
      ).not.toBeNull()
    );
    expect(
      view.container.querySelector('[data-slot="status-badge"]')?.dataset.tone
    ).toBe("neutral");
    view.unmount();
  });
});
