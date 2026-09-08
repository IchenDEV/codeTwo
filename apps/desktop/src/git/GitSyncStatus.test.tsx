import { afterEach, describe, expect, test } from "bun:test";

import { activateDom, dom, mount } from "../../tests/domTestHarness";
import { I18nProvider } from "../i18n";
import { GitSyncStatus } from "./GitSyncStatus";

activateDom();

afterEach(() => {
  dom.document.body.replaceChildren();
});

describe("GitSyncStatus", () => {
  test("keeps ahead and behind meaning available to assistive technology", () => {
    const view = mount(
      <I18nProvider>
        <GitSyncStatus ahead={2} behind={3} />
      </I18nProvider>
    );

    expect(
      view.container.querySelector('[aria-label="2 commits ahead"]')
    ).not.toBeNull();
    expect(
      view.container.querySelector('[aria-label="3 commits behind"]')
    ).not.toBeNull();
    expect(view.container.querySelectorAll("svg[aria-hidden]")).toHaveLength(2);

    view.unmount();
  });

  test("renders nothing when the branch is synchronized", () => {
    const view = mount(<GitSyncStatus ahead={0} behind={0} />);
    expect(view.container.childElementCount).toBe(0);
    view.unmount();
  });
});
