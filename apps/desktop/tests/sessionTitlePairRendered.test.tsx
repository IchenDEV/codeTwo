// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import { activateDom, dom, mount, restoreDom } from "./domTestHarness";

activateDom();
const { SessionTitlePair } = await import("../src/session/SessionTitlePair");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("SessionTitlePair rendered header pair", () => {
  test("prints nothing when the task already names the thread", () => {
    const rendered = mount(
      <SessionTitlePair
        taskTitle="帮我把这个项目里的图像都压缩成 WebP。"
        sessionTitle="帮我把这个项目里的图像都压缩成 WebP"
      />
    );

    expect(rendered.container.textContent).toBe("");
    expect(rendered.container.querySelectorAll("span")).toHaveLength(0);
    rendered.unmount();
  });

  test("trails a genuinely different session name after the separator", () => {
    const rendered = mount(
      <SessionTitlePair
        taskTitle="Release notes"
        sessionTitle="Fix the parser"
      />
    );
    const spans = [...rendered.container.querySelectorAll("span")];

    expect(spans).toHaveLength(2);
    expect(spans[0].textContent).toBe("/");
    expect(spans[1].textContent).toBe("Fix the parser");
    rendered.unmount();
  });

  test("prints nothing for an empty session title", () => {
    const rendered = mount(
      <SessionTitlePair taskTitle="Release notes" sessionTitle="   " />
    );

    expect(rendered.container.textContent).toBe("");
    rendered.unmount();
  });
});
