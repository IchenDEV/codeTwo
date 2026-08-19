// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { ProviderQuotaMeter, UsagePanel, quotaProviderFor } = await import("../src/usage/Usage");
const { quickQuotaProviderFor, quickQuotaSummary } = await import("../src/usage/quickQuota");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("UsagePanel", () => {
  test("uses the active provider, then falls back to recent Codex activity", () => {
    expect(quickQuotaProviderFor("grok", "claude", ["codex"])).toBe("claude");
    expect(quickQuotaProviderFor("grok", null, ["codex"])).toBe("codex");
    expect(quickQuotaProviderFor("grok", null, [])).toBe("grok");
  });

  test("uses the most constrained provider window for the rail shortcut", () => {
    const summary = quickQuotaSummary({
      provider: "codex",
      status: "available",
      reason: null,
      source: "codex_app_server",
      plan: "pro",
      limit_name: "codex",
      windows: [
        { used_percent: 18.4, window_minutes: 300, resets_at: 100 },
        { used_percent: 63.7, window_minutes: 10_080, resets_at: 200 },
      ],
      credits: null,
      fetched_at_ms: Date.now(),
    });

    expect(summary).toEqual({
      remainingPercent: 36,
      windowMinutes: 10_080,
      resetsAt: 200,
    });
  });

  test("prefers Codex quota when local activity belongs to Codex", () => {
    expect(
      quotaProviderFor("grok", {
        windows: [],
        by_source: [["codex", 42]],
        transcripts: 1,
      }),
    ).toBe("codex");
  });

  test("renders the existing usage report as an embedded settings panel", async () => {
    activateDom();
    const view = mount(
      <I18nProvider>
        <UsagePanel provider="codex" providerName="Codex" />
      </I18nProvider>,
    );

    expect(view.container.querySelector("h1")?.textContent).toBe("Usage");
    expect(view.container.textContent).toContain("current provider quota");
    expect(view.container.textContent).toContain("Provider quota");
    expect(view.container.querySelector('[title="Rescan"]')).toBeTruthy();
    expect(view.container.textContent).toContain("7d");
    expect(view.container.textContent).toContain("30d");
    expect(dom.document.body.querySelector('[data-slot="dialog-content"]')).toBeNull();

    await flush();
    expect(view.container.textContent).toContain("Remaining amount unknown");
    expect(view.container.querySelector('[role="progressbar"]')).toBeNull();
    view.unmount();
  });

  test("visualizes provider-reported capacity as the amount remaining", () => {
    activateDom();
    const now = 1_800_000_000_000;
    const view = mount(
      <I18nProvider>
        <ProviderQuotaMeter
          now={now}
          window={{
            used_percent: 27,
            window_minutes: 300,
            resets_at: now / 1_000 + 90 * 60,
          }}
        />
      </I18nProvider>,
    );

    expect(view.container.textContent).toContain("73% left");
    expect(view.container.textContent).toContain("27% used");
    const meter = view.container.querySelector('[role="progressbar"]');
    expect(meter?.getAttribute("aria-valuenow")).toBe("73");
    expect(meter?.getAttribute("aria-label")).toContain("Capacity remaining");
    expect(meter?.firstElementChild?.getAttribute("style")).toContain("width: 73%");

    view.unmount();
  });
});
