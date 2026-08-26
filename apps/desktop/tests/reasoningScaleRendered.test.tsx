// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, click, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const {
  CollaborationModePicker,
  GoalPicker,
  ModelPicker,
} = await import("../src/session/Composer");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("ModelPicker", () => {
  test("uses separate model and reasoning menus and forwards the provider-owned choice", async () => {
    activateDom();
    const selected: Array<[string, string]> = [];
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
          onConfigOption={(configId, value) => selected.push([configId, value])}
          hasSession
        />
      </I18nProvider>,
    );

    const modelTrigger = rendered.container.querySelector<HTMLButtonElement>('button[title="Model"]');
    const effortTrigger = rendered.container.querySelector<HTMLButtonElement>('button[title="Reasoning"]');
    expect(modelTrigger?.textContent).toContain("Grok 4.6");
    expect(effortTrigger?.textContent).toContain("Extra High Effort");
    expect(rendered.container.querySelector('input[type="range"]')).toBeNull();

    if (!effortTrigger) throw new Error("reasoning trigger did not render");
    click(effortTrigger);
    await flush();
    const low = Array.from(
      dom.document.body.querySelectorAll<HTMLButtonElement>('[data-slot="popover-content"] button'),
    ).find((button) => button.textContent?.includes("Low Effort"));
    if (!low) throw new Error("low effort option did not render");
    click(low);
    await flush();
    expect(selected).toEqual([["reasoning_effort", "low"]]);
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
        />
      </I18nProvider>,
    );

    expect(rendered.container.querySelector('button[title="Model"]')).toBeNull();
    rendered.unmount();
  });

  test("locks the model selector while the current turn is running", () => {
    activateDom();
    const selected: string[] = [];
    const rendered = mount(
      <I18nProvider>
        <ModelPicker
          models={[
            { id: "fast", name: "Fast", description: null },
            { id: "deep", name: "Deep", description: null },
          ]}
          current="fast"
          defaultModel="fast"
          provider="grok"
          onModel={(model) => selected.push(model)}
          configOptions={[]}
          onConfigOption={() => {}}
          hasSession
          disabled
        />
      </I18nProvider>,
    );

    const trigger = rendered.container.querySelector<HTMLButtonElement>('button[title="Model"]');
    expect(trigger?.disabled).toBe(true);
    trigger?.click();
    expect(selected).toEqual([]);
    rendered.unmount();
  });

  test("keeps a long model list inside the available popover height", async () => {
    activateDom();
    const rendered = mount(
      <I18nProvider>
        <ModelPicker
          models={Array.from({ length: 40 }, (_, index) => ({
            id: `model-${index}`,
            name: `Model ${index}`,
            description: null,
          }))}
          current={null}
          defaultModel={null}
          provider="opencode"
          onModel={() => {}}
          configOptions={[]}
          onConfigOption={() => {}}
          hasSession={false}
        />
      </I18nProvider>,
    );

    const trigger = rendered.container.querySelector<HTMLButtonElement>('button[title="Model"]');
    if (!trigger) throw new Error("model trigger did not render");
    click(trigger);
    await flush();

    const popup = dom.document.body.querySelector('[data-slot="popover-content"]');
    const modelList = popup?.querySelector("[data-model-picker-list]");
    expect(popup?.className).toContain("max-h-(--available-height)");
    expect(popup?.className).toContain("overflow-hidden");
    expect(modelList?.className).toContain("min-h-0");
    expect(modelList?.className).toContain("flex-1");
    expect(modelList?.className).toContain("max-h-80");
    expect(modelList?.className).toContain("overflow-y-auto");
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
