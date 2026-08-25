// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { act as reactAct } from "react";
import { activateDom, button, click, dom, mount, waitFor } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { ProfileSettings, summarizeProfileActivity } = await import("../src/settings/ProfileSettings");

const report = {
  windows: [],
  by_source: [["codex", 800], ["claude_code", 300]],
  transcripts: 42,
};

const history = {
  history: {
    bucket_secs: 86_400,
    bucket_count: 4,
    start_ms: Date.UTC(2026, 0, 1),
    series: [
      { source: "codex", totals: [100, 0, 300, 400] },
      { source: "claude_code", totals: [0, 200, 0, 100] },
    ],
  },
  by_source: [
    { source: "claude_code", input_tokens: 200, cached_tokens: 0, output_tokens: 100, total_tokens: 300, estimated_cost_usd: null, unpriced_tokens: 300 },
    { source: "codex", input_tokens: 600, cached_tokens: 0, output_tokens: 200, total_tokens: 800, estimated_cost_usd: null, unpriced_tokens: 800 },
  ],
};

function setValue(element, value) {
  element.value = value;
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

afterEach(() => {
  dom.localStorage.clear();
  dom.document.body.replaceChildren();
});

describe("ProfileSettings", () => {
  test("derives honest activity statistics from local usage buckets", () => {
    const summary = summarizeProfileActivity(report, history);

    expect(summary.totalTokens).toBe(1_100);
    expect(summary.peakTokens).toBe(500);
    expect(summary.activeDays).toBe(4);
    expect(summary.currentStreak).toBe(4);
    expect(summary.transcripts).toBe(42);
    expect(summary.providers.map((provider) => provider.source)).toEqual(["codex", "claude_code"]);
  });

  test("renders the profile summary and shares the same real statistics", async () => {
    let sharedText = "";
    const view = mount(
      <I18nProvider>
        <ProfileSettings
          providerNames={{ codex: "Codex", claude_code: "Claude Code" }}
          reportLoader={async () => report}
          historyLoader={async () => history}
          share={async (_title, text) => {
            sharedText = text;
            return "shared";
          }}
        />
      </I18nProvider>,
    );

    await waitFor(() => expect(view.container.textContent).toContain("1.1k"));
    expect(view.container.textContent).toContain("Your C2 profile");
    expect(view.container.textContent).toContain("Codex");
    expect(view.container.textContent).toContain("42");

    click(button(view.container, "Share"));
    await waitFor(() => expect(sharedText).toContain("1.1k tokens"));
    expect(sharedText).toContain("4 active days");
    await waitFor(() => expect(view.container.textContent).toContain("Profile shared."));

    view.unmount();
  });

  test("validates the display name and persists a saved profile locally", async () => {
    const view = mount(
      <I18nProvider>
        <ProfileSettings
          reportLoader={async () => report}
          historyLoader={async () => history}
        />
      </I18nProvider>,
    );

    await reactAct(async () => click(button(view.container, "Edit")));
    await reactAct(async () => click(button(view.container, "Save")));

    const name = view.container.querySelector("#profile-display-name");
    expect(name?.getAttribute("aria-invalid")).toBe("true");
    expect(name?.getAttribute("aria-describedby")).toBe("profile-display-name-error");
    expect(view.container.textContent).toContain("Add a display name before saving.");

    await reactAct(async () => setValue(name, "Ada Lovelace"));
    await waitFor(() => expect(name?.getAttribute("aria-invalid")).toBeNull());
    const handle = view.container.querySelector("#profile-handle");
    await reactAct(async () => setValue(handle, "@ada"));
    await reactAct(async () => click(button(view.container, "Save")));

    await waitFor(() => expect(view.container.textContent).toContain("Ada Lovelace"));
    expect(view.container.textContent).toContain("@ada");
    expect(JSON.parse(dom.localStorage.getItem("codetwo.profile"))).toEqual({
      name: "Ada Lovelace",
      handle: "ada",
      bio: "",
    });

    view.unmount();
  });
});
