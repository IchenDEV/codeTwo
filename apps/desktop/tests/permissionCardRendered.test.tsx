// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import {
  activateDom,
  button,
  click,
  dom,
  flush,
  mount,
  restoreDom,
} from "./domTestHarness";

activateDom();
const { PermissionCard } = await import("../src/session/PermissionCard");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function renderCard(onAnswer = () => {}) {
  return mount(
    <I18nProvider>
      <PermissionCard
        request={{
          session: "session-a",
          requestId: "permission-1",
          title: "gh pr list --state open",
          options: [
            ["allow-once", "Allow once"],
            ["allow-session", "Allow for session"],
            ["reject", "Reject"],
          ],
          context: { kind: "acp" },
        }}
        pendingCount={2}
        onAnswer={onAnswer}
      />
    </I18nProvider>
  );
}

describe("PermissionCard", () => {
  test("renders the request inline instead of as a dialog", () => {
    const rendered = renderCard();

    expect(rendered.container.querySelector('[role="dialog"]')).toBeNull();
    expect(
      rendered.container.querySelector('[data-testid="permission-card"]')
    ).not.toBeNull();
    expect(rendered.container.textContent).toContain("gh pr list --state open");
    expect(rendered.container.textContent).toContain(
      "Session-wide approvals apply only to this chat."
    );
    expect(rendered.container.textContent).toContain("2 requests pending");
  });

  test("answers a permission option and cancel explicitly", async () => {
    const answers = [];
    const rendered = renderCard((optionId) => answers.push(optionId));

    click(button(rendered.container, "Allow for session"));
    await flush();
    click(button(rendered.container, "Cancel"));
    await flush();

    expect(answers).toEqual(["allow-session", null]);
  });
});
