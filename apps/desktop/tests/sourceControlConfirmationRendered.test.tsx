// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import {
  activateDom,
  button,
  click,
  dom,
  mount,
  restoreDom,
  waitFor,
} from "./domTestHarness";

activateDom();
const { SourceControlModal } = await import("../src/git/SourceControl");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("SourceControlModal confirmation", () => {
  test("requires the managed destructive dialog before reverting a checkpoint", async () => {
    activateDom();
    const reverted: string[] = [];
    const view = mount(
      <SourceControlModal
        cwd="/repo"
        status={{
          is_repo: true,
          branch: "main",
          ahead: 0,
          behind: 0,
          files: [],
        }}
        statusLoading={false}
        checkpoints={[
          { id: "checkpoint-1", commit: "abc123", message: "Before refactor" },
        ]}
        checkpointsLoading={false}
        onCommit={async () => {}}
        onPush={async () => {}}
        onCheckpoint={async () => {}}
        onRevert={async (commit) => reverted.push(commit)}
        onRefresh={() => {}}
        onClose={() => {}}
      />
    );

    await waitFor(() =>
      expect(button(dom.document.body, "Revert")).not.toBeNull()
    );
    click(button(dom.document.body, "Revert"));
    expect(reverted).toEqual([]);
    await waitFor(() =>
      expect(dom.document.body.textContent).toContain("Revert checkpoint?")
    );
    click(button(dom.document.body, "Revert tracked files"));
    await waitFor(() => expect(reverted).toEqual(["abc123"]));
    view.unmount();
  });
});
