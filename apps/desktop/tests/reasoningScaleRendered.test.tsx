// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, dom, mount, restoreDom } from "./domTestHarness";

activateDom();
const {
  CollaborationModePicker,
  GoalPicker,
  ModelPicker,
  ReasoningScale,
} = await import("../src/session/Composer");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

const choices = ["Minimal", "Low", "Medium", "High", "Extra High"].map((label, index) => ({
  key: label.toLowerCase().replaceAll(" ", "-"),
  label,
  detail: label === "Extra High" ? "Deepest reasoning for complex tasks" : null,
  isDefault: label === "Medium",
  selected: index === 3,
  select: () => {},
}));

describe("ReasoningScale", () => {
  test("renders the reference slider with the current provider-owned effort", () => {
    activateDom();
    const rendered = mount(
      <ReasoningScale label="Reasoning" rows={choices} onSelect={() => {}} />,
    );

    const range = rendered.container.querySelector('input[type="range"]');
    expect(range?.getAttribute("min")).toBe("0");
    expect(range?.getAttribute("max")).toBe("4");
    expect(range?.getAttribute("aria-valuetext")).toBe("High");
    expect(range?.getAttribute("value")).toBe("3");
    expect(dom.document.activeElement).toBe(range);
    expect(rendered.container.querySelectorAll('[data-active="true"]')).toHaveLength(4);
    expect(rendered.container.querySelector(".reasoning-selector-fill")?.getAttribute("style") ?? "").toContain("75%");
    rendered.unmount();
  });

  test("forwards the exact provider-owned choice", () => {
    activateDom();
    const picked: string[] = [];
    const rendered = mount(
      <ReasoningScale
        label="Reasoning"
        rows={choices}
        onSelect={(row) => picked.push(row.key)}
      />,
    );

    const range = rendered.container.querySelector('input[type="range"]');
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(range), "value")?.set;
    if (setter) setter.call(range, "4");
    else range.value = "4";
    range.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    expect(picked).toEqual(["extra-high"]);
    rendered.unmount();
  });

  test("uses the compact nested selector when provider effort is shown in scene configuration", () => {
    activateDom();
    const rendered = mount(
      <I18nProvider>
        <ModelPicker
          models={[{ id: "grok-4.6", name: "Grok 4.6", description: null }]}
          current="grok-4.6"
          defaultModel="grok-4.6"
          provider="grok"
          onModel={() => {}}
          configOptions={[{
            id: "reasoning_effort",
            name: "Reasoning Effort",
            category: "thought_level",
            current: "xhigh",
            choices: [
              { id: "low", name: "Low Effort", description: null },
              { id: "medium", name: "Medium Effort", description: null },
              { id: "high", name: "High Effort", description: null },
              { id: "xhigh", name: "Extra High Effort", description: null },
            ],
          }]}
          onConfigOption={() => {}}
          hasSession
          compact
        />
      </I18nProvider>,
    );

    const trigger = rendered.container.querySelector(".reasoning-selector-trigger");
    expect(trigger?.textContent).toContain("Grok 4.6");
    expect(trigger?.textContent).toContain("Extra High Effort");
    expect(trigger?.classList.contains("reasoning-selector-trigger--compact")).toBe(true);
    rendered.unmount();
  });

  test("shows provider model choices before the first session is created", () => {
    activateDom();
    const rendered = mount(
      <I18nProvider>
        <ModelPicker
          models={[{ id: "grok-4.6", name: "Grok 4.6", description: null }]}
          current={null}
          defaultModel={null}
          provider="grok"
          onModel={() => {}}
          configOptions={[]}
          onConfigOption={() => {}}
          hasSession={false}
          compact
        />
      </I18nProvider>,
    );

    const trigger = rendered.container.querySelector('button[title="Model"]');
    expect(trigger?.textContent).toContain("Default model");
    rendered.unmount();
  });

  test("keeps model selection hidden for providers without an advertised model list", () => {
    activateDom();
    const rendered = mount(
      <I18nProvider>
        <ModelPicker
          models={[]}
          current={null}
          defaultModel={null}
          provider="opencode"
          onModel={() => {}}
          configOptions={[]}
          onConfigOption={() => {}}
          hasSession={false}
          compact
        />
      </I18nProvider>,
    );

    expect(rendered.container.querySelector('button[title="Model"]')).toBeNull();
    rendered.unmount();
  });
});

describe("provider-native session controls", () => {
  test("renders collaboration mode only from an advertised provider option", () => {
    activateDom();
    const absent = mount(
      <CollaborationModePicker options={[]} onChange={() => {}} />,
    );
    expect(absent.container.querySelector("button")).toBeNull();
    absent.unmount();

    const rendered = mount(
      <CollaborationModePicker
        options={[{
          id: "collaboration_mode",
          name: "Collaboration mode",
          category: "collaboration_mode",
          current: "plan",
          choices: [
            { id: "default", name: "Default", description: null },
            { id: "plan", name: "Plan", description: "Plan before implementation" },
          ],
        }]}
        onChange={() => {}}
      />,
    );
    expect(rendered.container.querySelector('button[aria-label="Collaboration mode: Plan"]')).toBeTruthy();
    rendered.unmount();
  });

  test("renders Goal only when the provider advertises the extension", () => {
    activateDom();
    const absent = mount(
      <I18nProvider>
        <GoalPicker capability={null} goal={null} onGoal={async () => {}} />
      </I18nProvider>,
    );
    expect(absent.container.querySelector("button")).toBeNull();
    absent.unmount();

    const rendered = mount(
      <I18nProvider>
        <GoalPicker
          capability={{ control_method: "_session/goal", actions: ["set"] }}
          goal={null}
          onGoal={async () => {}}
        />
      </I18nProvider>,
    );
    expect(rendered.container.querySelector('button[aria-label="Goal"]')).toBeTruthy();
    rendered.unmount();
  });
});
