// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import { activateDom, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { DiffReview } = await import("../src/git/DiffReview");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

const file = {
  path: "src/a.rs",
  old_path: "src/old_a.rs",
  additions: 2,
  deletions: 1,
  hunks: [
    {
      old_start: 1,
      old_lines: 2,
      new_start: 1,
      new_lines: 3,
      lines: [
        { kind: "context", old_line: 1, new_line: 1, text: "keep" },
        { kind: "removed", old_line: 2, new_line: null, text: "gone" },
        { kind: "added", old_line: null, new_line: 2, text: "one" },
        { kind: "added", old_line: null, new_line: 3, text: "two" },
      ],
    },
  ],
};

describe("DiffReview", () => {
  test("renders one collapsible section per file with stats and line gutters", async () => {
    const view = mount(
      <DiffReview
        files={[
          file,
          {
            path: "b.txt",
            old_path: null,
            additions: 1,
            deletions: 0,
            hunks: [],
          },
        ]}
      />
    );
    await flush();

    const sections = view.container.querySelectorAll("details.diff-file");
    expect(sections.length).toBe(2);
    expect(sections[0].hasAttribute("open")).toBeTrue();

    const header = sections[0].querySelector(".diff-file-header");
    expect(header?.querySelector(".diff-file-path")?.textContent).toBe(
      "src/a.rs"
    );
    expect(header?.querySelector(".diff-file-old")?.textContent).toBe(
      "from src/old_a.rs"
    );
    expect(header?.querySelector(".diff-stat-add")?.textContent).toBe("+2");
    expect(header?.querySelector(".diff-stat-del")?.textContent).toBe("-1");

    // Four content lines plus the hunk header.
    const lines = sections[0].querySelectorAll(".diff-line");
    expect(lines.length).toBe(5);
    const removed = lines[2];
    expect(removed.className).toContain("del");
    const gutters = removed.querySelectorAll(".diff-gutter");
    expect(gutters[0].textContent).toBe("2");
    expect(gutters[1].textContent).toBe("");
    const added = lines[3];
    expect(added.className).toContain("add");
    const addedGutters = added.querySelectorAll(".diff-gutter");
    expect(addedGutters[0].textContent).toBe("");
    expect(addedGutters[1].textContent).toBe("2");

    view.unmount();
  });

  test("renders a notice alongside the file sections", async () => {
    const view = mount(
      <DiffReview
        files={[file]}
        notice={<p role="status">Preview truncated</p>}
      />
    );
    await flush();
    expect(view.container.querySelector('[role="status"]')?.textContent).toBe(
      "Preview truncated"
    );
    view.unmount();
  });
});
