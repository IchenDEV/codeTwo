// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, click, dom, mount, restoreDom } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { EmptySessionStarters } = await import("../src/session/EmptySessionStarters");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("EmptySessionStarters", () => {
  test("renders four real prompt starters and inserts the selected prompt", () => {
    activateDom();
    const selected: string[] = [];
    const view = mount(
      <I18nProvider>
        <EmptySessionStarters onSelect={(prompt) => selected.push(prompt)} />
      </I18nProvider>,
    );

    const starters = [...view.container.querySelectorAll("button")];
    expect(starters.map((starter) => starter.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "Explore the projectUnderstand its structure and execution flow",
      "Build a featureTurn an idea into a working implementation",
      "Review the codeFind risks and concrete improvements",
      "Fix an issueTrace the cause, repair it, and verify the result",
    ]);

    click(starters[2]);
    expect(selected).toEqual([
      "Review the current code and suggest concrete improvements, prioritizing correctness, maintainability, and user impact.",
    ]);

    view.unmount();
  });
});
