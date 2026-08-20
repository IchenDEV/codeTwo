// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { act as reactAct } from "react";
import { activateDom, dom, flush, mount, restoreDom, waitFor } from "./domTestHarness";

activateDom();
const { SettingsPage } = await import("../src/settings/SettingsPage");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

const providers = [
  {
    id: "claude_code",
    display_name: "Claude Code",
    available: true,
    needs_node: true,
    models: [],
    capabilities: [],
  },
  {
    id: "codex",
    display_name: "OpenAI Codex",
    available: true,
    needs_node: true,
    models: [],
    capabilities: [],
  },
];

const initialSettings = {
  selections: { claude_code: "automatic" },
  backends: [
    {
      id: "cua",
      display_name: "Cua Driver",
      available: true,
      reason: "cua-driver is available on PATH.",
      providers: [],
      exclude_providers: [],
    },
    {
      id: "remote-lab",
      display_name: "Remote Lab",
      available: false,
      reason: "Remote Lab is not running.",
      providers: ["claude_code"],
      exclude_providers: [],
    },
  ],
  errors: [],
};

function settings(loader, saver) {
  return (
    <I18nProvider>
      <SettingsPage
        bindings={[]}
        capturing={null}
        onCapture={() => {}}
        providers={providers}
        provider="claude_code"
        projectPath="/workspace"
        project={null}
        onProjectWorktreeMode={async () => {}}
        memoryEnabled={false}
        initialTab="computer-use"
        onClose={() => {}}
        computerUseSettingsLoader={loader}
        computerUseSelectionSaver={saver}
      />
    </I18nProvider>
  );
}

async function openSelect(trigger) {
  await reactAct(async () => {
    trigger.dispatchEvent(new dom.window.PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
    }));
    trigger.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flush();
}

async function selectItem(item) {
  await reactAct(async () => {
    item.dispatchEvent(new dom.window.PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
    }));
    item.dispatchEvent(new dom.window.PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
    }));
    item.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flush();
}

describe("Computer Use settings", () => {
  test("lets the user choose one backend per provider and explains session scope", async () => {
    const saved = [];
    const view = mount(settings(
      async () => initialSettings,
      async (provider, backend) => {
        saved.push([provider, backend]);
        return { ...initialSettings, selections: { ...initialSettings.selections, [provider]: backend } };
      },
    ));

    await waitFor(() => {
      expect(view.container.textContent).toContain("Changes apply to new sessions");
      expect(view.container.textContent).toContain("Cua Driver");
      expect(view.container.textContent).toContain("Remote Lab is not running");
    });

    const trigger = view.container.querySelector('[data-computer-use-provider="claude_code"]');
    expect(trigger?.textContent).toContain("Automatic");
    await openSelect(trigger);
    const remote = Array.from(dom.document.body.querySelectorAll('[data-slot="select-item"]'))
      .find((item) => item.textContent?.trim() === "Remote Lab");
    expect(remote?.getAttribute("data-disabled")).not.toBeNull();
    const cua = Array.from(dom.document.body.querySelectorAll('[data-slot="select-item"]'))
      .find((item) => item.textContent?.trim() === "Cua Driver");
    await selectItem(cua);

    expect(saved).toEqual([["claude_code", "cua"]]);
    expect(trigger?.textContent).toContain("Cua Driver");
    view.unmount();
  });
});
