// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import { activateDom, click, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { Statusline } = await import("../src/session/Statusline");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

const contextWindow = {
  usedTokens: 170_000,
  contextWindow: 200_000,
  breakdown: null,
};

describe("provider-native context compaction", () => {
  test("only renders the action when the live provider advertises it", async () => {
    const unavailable = mount(
      <I18nProvider>
        <Statusline contextWindow={contextWindow} usage={null} />
      </I18nProvider>,
    );
    click(unavailable.container.querySelector('[role="meter"]'));
    await flush();
    expect(dom.document.body.textContent).not.toContain("Compact context");
    unavailable.unmount();

    let compacted = 0;
    const available = mount(
      <I18nProvider>
        <Statusline
          contextWindow={contextWindow}
          usage={null}
          onCompact={() => compacted += 1}
        />
      </I18nProvider>,
    );
    click(available.container.querySelector('[role="meter"]'));
    await flush();
    const action = Array.from(dom.document.body.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Compact context"));
    expect(action).toBeDefined();
    click(action);
    await flush();
    expect(compacted).toBe(1);
    available.unmount();
  });

  test("protects an unsent draft and explains why compaction is unavailable", async () => {
    const rendered = mount(
      <I18nProvider>
        <Statusline
          contextWindow={contextWindow}
          usage={null}
          onCompact={() => {}}
          compactDisabled
          compactDisabledReason="Send or clear the current draft before compacting."
        />
      </I18nProvider>,
    );
    click(rendered.container.querySelector('[role="meter"]'));
    await flush();
    const action = Array.from(dom.document.body.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Compact context"));
    expect(action?.hasAttribute("disabled")).toBe(true);
    expect(dom.document.body.textContent).toContain(
      "Send or clear the current draft before compacting.",
    );
    rendered.unmount();
  });
});
