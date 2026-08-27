// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { useState } from "react";
import { activateDom, button, click, dom, flush, mount } from "./domTestHarness";

activateDom();
const { PageHeader } = await import("../src/components/business/page-header");
const { QuotaProgress } = await import("../src/components/business/quota-progress");
const { SearchField } = await import("../src/components/business/search-field");
const { SelectableRow } = await import("../src/components/business/selectable-row");
const { SettingToggle } = await import("../src/components/business/setting-toggle");
const { StatusBadge } = await import("../src/components/business/status-badge");
const {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} = await import("../src/components/ui/empty");

afterEach(() => {
  dom.document.body.replaceChildren();
});

describe("design-system business components", () => {
  test("provides semantic page and empty-state structure", () => {
    const view = mount(
      <>
        <PageHeader title="Automations" description="Schedule recurring work." />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><span aria-hidden="true">A</span></EmptyMedia>
            <EmptyTitle>No automations</EmptyTitle>
            <EmptyDescription>Create one to get started.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>,
    );

    expect(view.container.querySelector('[data-slot="page-header"]')?.tagName).toBe("HEADER");
    expect(view.container.querySelector('[data-slot="page-header-title"]')?.tagName).toBe("H1");
    expect(view.container.querySelector('[data-slot="empty-title"]')?.tagName).toBe("H2");
    expect(view.container.querySelector('[data-slot="empty-description"]')?.tagName).toBe("P");

    view.unmount();
  });

  test("labels search inputs and returns focus after clearing", async () => {
    let clears = 0;
    function SearchExample() {
      const [value, setValue] = useState("daily");
      return (
        <SearchField
          label="Search automations"
          clearLabel="Clear search"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          onClear={() => {
            clears += 1;
            setValue("");
          }}
        />
      );
    }
    const view = mount(<SearchExample />);

    const input = view.container.querySelector("input");
    const label = view.container.querySelector("label");
    expect(input?.getAttribute("type")).toBe("search");
    expect(input?.id).toBeTruthy();
    expect(label?.getAttribute("for")).toBe(input?.id);

    const clear = button(view.container, "Clear search");
    clear.focus();
    click(clear);
    await flush();

    expect(clears).toBe(1);
    expect(input?.value).toBe("");
    expect(dom.document.activeElement).toBe(input);
    expect(view.container.querySelector('[aria-label="Clear search"]')).toBeNull();

    view.unmount();
  });

  test("standardizes picker selection, descriptions, metadata, and disabled state", () => {
    let selections = 0;
    const view = mount(
      <>
        <SelectableRow
          selected
          label="Current ref"
          accessibilityContext="Worktree baseline"
          description="main @ 3befbb7d"
          leading={<span>Git</span>}
          meta={<span>Current</span>}
          onSelect={() => { selections += 1; }}
        />
        <SelectableRow
          selected={false}
          disabled
          label="Unavailable ref"
          onSelect={() => { selections += 1; }}
        />
      </>,
    );

    const selected = button(view.container, "Current ref, Worktree baseline");
    const disabled = button(view.container, "Unavailable ref");
    const describedBy = selected.getAttribute("aria-describedby")?.split(" ") ?? [];

    expect(selected.getAttribute("type")).toBe("button");
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(selected.getAttribute("data-selected")).toBe("true");
    expect(selected.querySelector('[data-slot="selectable-row-indicator"] svg')).not.toBeNull();
    expect(selected.querySelector('[data-slot="selectable-row-leading"]')?.textContent).toBe("Git");
    expect(selected.querySelector('[data-slot="selectable-row-description"]')?.textContent).toBe("main @ 3befbb7d");
    expect(selected.querySelector('[data-slot="selectable-row-meta"]')?.textContent).toBe("Current");
    expect(describedBy).toHaveLength(3);
    expect(describedBy.every((id) => dom.document.getElementById(id))).toBe(true);

    click(selected);
    click(disabled);
    expect(selections).toBe(1);
    expect(disabled.disabled).toBe(true);
    expect(disabled.getAttribute("aria-pressed")).toBe("false");

    view.unmount();
  });

  test("maps status tones without creating a live region", () => {
    const view = mount(
      <>
        <StatusBadge tone="neutral">Paused</StatusBadge>
        <StatusBadge tone="success">Active</StatusBadge>
        <StatusBadge tone="warning">Pending</StatusBadge>
        <StatusBadge tone="destructive">Failed</StatusBadge>
      </>,
    );

    const badges = [...view.container.querySelectorAll('[data-slot="status-badge"]')];
    expect(badges.map((badge) => badge.getAttribute("data-tone"))).toEqual([
      "neutral",
      "success",
      "warning",
      "destructive",
    ]);
    expect(badges.every((badge) => badge.className.includes("bg-canvas"))).toBe(true);
    expect(badges[1]?.className).toContain("text-status-success");
    expect(badges[2]?.className).toContain("text-status-warning");
    expect(badges[3]?.className).toContain("text-status-destructive");
    expect(view.container.querySelector('[role="status"]')).toBeNull();

    view.unmount();
  });

  test("associates setting labels and descriptions with one immediate boolean control", async () => {
    let changes = 0;
    function SettingExample() {
      const [checked, setChecked] = useState(false);
      return (
        <>
          <SettingToggle
            label="Capture useful context"
            description="Save durable context after completed work."
            checked={checked}
            onCheckedChange={(next) => {
              changes += 1;
              setChecked(next);
            }}
          />
          <SettingToggle
            label="Unavailable setting"
            checked={false}
            disabled
            onCheckedChange={() => { changes += 1; }}
          />
        </>
      );
    }
    const view = mount(<SettingExample />);
    const rows = view.container.querySelectorAll('[data-slot="setting-toggle"]');
    const control = rows[0]?.querySelector('[data-slot="switch"]');
    const label = rows[0]?.querySelector('[data-slot="setting-row-label"]');
    const description = rows[0]?.querySelector('[data-slot="setting-row-description"]');
    const disabled = rows[1]?.querySelector('[data-slot="switch"]');

    expect(rows).toHaveLength(2);
    const hiddenInput = dom.document.getElementById(label?.getAttribute("for") ?? "");
    expect(hiddenInput?.tagName).toBe("INPUT");
    expect(hiddenInput?.getAttribute("type")).toBe("checkbox");
    expect(control?.getAttribute("aria-labelledby")).toBe(label?.id);
    expect(control?.getAttribute("aria-describedby")).toBe(description?.id);
    expect(disabled?.hasAttribute("data-disabled")).toBe(true);

    click(control);
    click(disabled);
    await flush();
    expect(control?.hasAttribute("data-checked")).toBe(true);
    expect(changes).toBe(1);

    view.unmount();
  });

  test("clamps quota progress and owns shared warning thresholds", () => {
    const view = mount(
      <>
        <QuotaProgress label="Empty quota" remainingPercent={-4} />
        <QuotaProgress label="Critical quota" remainingPercent={5} />
        <QuotaProgress label="Past critical threshold" remainingPercent={5.4} />
        <QuotaProgress label="Warning quota" remainingPercent={20} />
        <QuotaProgress label="Past warning threshold" remainingPercent={20.4} />
        <QuotaProgress label="Healthy quota" remainingPercent={72.6} density="rail" />
        <QuotaProgress label="Full quota" remainingPercent={140} />
        <QuotaProgress label="Invalid quota" remainingPercent={Number.NaN} />
      </>,
    );
    const meters = [...view.container.querySelectorAll('[data-slot="quota-progress"]')];

    expect(meters.map((meter) => meter.getAttribute("aria-valuenow"))).toEqual([
      "0",
      "5",
      "5",
      "20",
      "20",
      null,
      "100",
      "0",
    ]);
    expect(meters.map((meter) => meter.getAttribute("data-tone"))).toEqual([
      "destructive",
      "destructive",
      "warning",
      "warning",
      "success",
      "success",
      "success",
      "destructive",
    ]);
    expect(meters[5]?.getAttribute("data-density")).toBe("rail");
    expect(meters[5]?.tagName).toBe("SPAN");
    expect(meters[5]?.getAttribute("aria-hidden")).toBe("true");
    expect(meters[5]?.getAttribute("role")).toBeNull();
    expect(meters[5]?.querySelector("div")).toBeNull();
    expect(meters[5]?.querySelector('[data-slot="progress-indicator"]')?.getAttribute("style"))
      .toContain("width: 73%");

    view.unmount();
  });

  test("removes the legacy picker row implementations", () => {
    const composer = readFileSync(new URL("../src/session/Composer.tsx", import.meta.url), "utf8");
    const sceneChip = readFileSync(new URL("../src/session/SceneChip.tsx", import.meta.url), "utf8");

    expect(composer).not.toContain("function CheckoutOptionRow");
    expect(composer).not.toContain("function MenuRow");
    expect(composer).not.toContain("<MenuRow");
    expect(sceneChip).not.toContain("MenuRow");
  });

  test("removes the legacy setting-toggle rows", () => {
    const projectAction = readFileSync(new URL("../src/session/ProjectActionDialog.tsx", import.meta.url), "utf8");
    const memorySettings = readFileSync(new URL("../src/settings/MemorySettings.tsx", import.meta.url), "utf8");

    expect(projectAction).not.toContain("function SwitchRow");
    expect(memorySettings).not.toContain("function ToggleRow");
    expect(projectAction).not.toContain("<SwitchRow");
    expect(memorySettings).not.toContain("<ToggleRow");
  });
});
