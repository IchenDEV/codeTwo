// @ts-nocheck
import { act as reactAct } from "react";
import { afterEach, describe, expect, test } from "bun:test";

import { activateDom, button, dom, flush, mount, restoreDom, text } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { GitDockContent } = await import("../src/git/GitDockContent");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

async function press(element: Element) {
  await reactAct(async () => {
    element.dispatchEvent(new dom.window.PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
    }));
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flush();
}

const status = {
  is_repo: true,
  branch: "codex/next-action",
  ahead: 2,
  behind: 0,
  files: [],
};

const action = {
  primary: { id: "push", destination: "push" },
  alternatives: [
    { id: "source_control", destination: "source_control" },
    { id: "view_pull_request", destination: "pull_request" },
  ],
  reason: { id: "ahead", count: 2 },
  changeRequestLabel: "PR",
};

describe("GitDockContent", () => {
  test("renders and dispatches the shared next-action projection", async () => {
    activateDom();
    const calls: string[] = [];
    const view = mount(
      <I18nProvider>
        <GitDockContent
          status={status}
          action={action}
          onOpenSourceControl={() => calls.push("source-control")}
          onPush={() => calls.push("push")}
          onOpenPullRequest={() => calls.push("pull-request")}
          onCleanupWorktree={() => calls.push("cleanup")}
        />
      </I18nProvider>,
    );

    expect(text(view.container, "2 local commits have not been pushed.")).not.toBeNull();
    await press(button(view.container, "Push"));
    expect(calls).toEqual(["push"]);

    await press(button(view.container, "More Git actions"));
    const sourceControl = Array.from(dom.document.body.querySelectorAll('[role="menuitem"]'))
      .find((item) => item.textContent?.includes("Source control"));
    if (!sourceControl) throw new Error("Source control alternative not found");
    await press(sourceControl);
    expect(calls).toEqual(["push", "source-control"]);

    view.unmount();
  });

  test("keeps an unavailable projection explicit without an action menu", () => {
    activateDom();
    const view = mount(
      <I18nProvider>
        <GitDockContent
          status={{ ...status, is_repo: false }}
          action={{
            primary: { id: "unavailable", destination: "none", disabled: true },
            alternatives: [],
            reason: { id: "not_repository" },
            changeRequestLabel: "change request",
          }}
          onOpenSourceControl={() => {}}
          onPush={() => {}}
          onOpenPullRequest={() => {}}
          onCleanupWorktree={() => {}}
        />
      </I18nProvider>,
    );

    const unavailableButton = button(view.container, "Source control unavailable");
    expect(unavailableButton.disabled).toBe(true);
    expect(unavailableButton.dataset.variant).toBe("secondary");
    expect(text(view.container, "The current workspace is not a Git repository.")).not.toBeNull();
    expect(view.container.querySelector('[aria-label="More Git actions"]')).toBeNull();
    view.unmount();
  });
});
