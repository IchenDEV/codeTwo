// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import { act as reactAct } from "react";

import {
  activateDom,
  dom,
  flush,
  mount,
  restoreDom,
  waitFor,
} from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const {
  ProviderQuotaMeter,
  UsagePanel,
  quotaProviderFor,
  quotaProviderOptions,
} = await import("../src/usage/Usage");
const { quickQuotaProviderFor, quickQuotaSummary } =
  await import("../src/usage/quickQuota");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

async function openSelect(trigger) {
  await reactAct(async () => {
    trigger.dispatchEvent(
      new dom.window.PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
      })
    );
    trigger.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })
    );
  });
  await flush();
}

async function selectItem(item) {
  await reactAct(async () => {
    item.dispatchEvent(
      new dom.window.PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
      })
    );
    item.dispatchEvent(
      new dom.window.PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
      })
    );
    item.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })
    );
  });
  await flush();
}

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
      provider: "codex",
      remainingPercent: 36,
      windowMinutes: 10_080,
      resetsAt: 200,
    });
  });

  test("defaults to the current provider and preserves registry order without duplicates", () => {
    expect(quotaProviderFor("grok", null)).toBe("grok");
    expect(quotaProviderFor("grok", "codex")).toBe("codex");
    expect(
      quotaProviderOptions("grok", "Grok", {
        codex: "Codex",
        grok: "Grok",
        claude_code: "Claude Code",
      })
    ).toEqual([
      { id: "grok", name: "Grok" },
      { id: "codex", name: "Codex" },
      { id: "claude_code", name: "Claude Code" },
    ]);
  });

  test("renders the existing usage report as an embedded settings panel", async () => {
    activateDom();
    const view = mount(
      <I18nProvider>
        <UsagePanel provider="codex" providerName="Codex" />
      </I18nProvider>
    );

    expect(view.container.querySelector("h1")?.textContent).toBe("Usage");
    expect(view.container.textContent).toContain("quota for any provider");
    expect(view.container.textContent).toContain("Provider quota");
    expect(
      view.container.querySelector('button[aria-label="Rescan"]')
    ).toBeTruthy();
    expect(view.container.textContent).toContain("7d");
    expect(view.container.textContent).toContain("30d");
    expect(
      dom.document.body.querySelector('[data-slot="dialog-content"]')
    ).toBeNull();

    await flush();
    expect(view.container.textContent).toContain("Remaining amount unknown");
    expect(view.container.querySelector('[role="progressbar"]')).toBeNull();
    view.unmount();
  });

  test("lets the user inspect quota for another provider", async () => {
    activateDom();
    const view = mount(
      <I18nProvider>
        <UsagePanel
          provider="codex"
          providerName="Codex"
          providerNames={{
            codex: "Codex",
            grok: "Grok",
            claude_code: "Claude Code",
          }}
        />
      </I18nProvider>
    );

    const trigger = view.container.querySelector(
      "[data-quota-provider-select]"
    );
    expect(trigger?.getAttribute("aria-label")).toBe("Choose a quota provider");
    expect(trigger?.textContent).toContain("Codex");

    await openSelect(trigger);
    const items = [
      ...dom.document.body.querySelectorAll('[data-slot="select-item"]'),
    ];
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      "Codex",
      "Grok",
      "Claude Code",
    ]);
    expect(items[0]?.firstElementChild?.className).toContain("flex");
    expect(items[0]?.firstElementChild?.className).toContain("items-center");
    await selectItem(items.find((item) => item.textContent?.trim() === "Grok"));

    await waitFor(() => {
      expect(trigger?.textContent).toContain("Grok");
      expect(view.container.textContent).toContain(
        "Grok does not expose a safe machine-readable quota interface"
      );
    });
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
            resets_at: now / 1000 + 90 * 60,
          }}
        />
      </I18nProvider>
    );

    expect(view.container.textContent).toContain("73% left");
    expect(view.container.textContent).toContain("27% used");
    const meter = view.container.querySelector('[role="progressbar"]');
    expect(meter?.getAttribute("aria-valuenow")).toBe("73");
    expect(meter?.getAttribute("aria-label")).toContain("Capacity remaining");
    expect(meter?.dataset.tone).toBe("success");
    expect(
      meter
        ?.querySelector('[data-slot="progress-indicator"]')
        ?.getAttribute("style")
    ).toContain("width: 73%");

    view.unmount();
  });
});
