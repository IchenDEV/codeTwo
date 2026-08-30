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
    display_name: "Codex",
    available: true,
    needs_node: true,
    models: [],
    capabilities: [],
  },
];

const initialSettings = {
  selections: { "*": "automatic" },
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
  test("lets the user choose one global backend and explains session scope", async () => {
    const saved = [];
    const view = mount(settings(
      async () => initialSettings,
      async (backend) => {
        saved.push(backend);
        return { ...initialSettings, selections: { "*": backend } };
      },
    ));

    await waitFor(() => {
      expect(view.container.textContent).toContain("Changes apply to new sessions");
      expect(view.container.textContent).toContain("Cua Driver");
      expect(view.container.textContent).toContain("Remote Lab is not running");
    });

    expect(view.container.querySelectorAll("[data-computer-use-selection]")).toHaveLength(1);
    expect(view.container.textContent).not.toContain("Claude Code");
    const trigger = view.container.querySelector("[data-computer-use-selection]");
    expect(trigger?.textContent).toContain("Automatic");
    await openSelect(trigger);
    const remote = Array.from(dom.document.body.querySelectorAll('[data-slot="select-item"]'))
      .find((item) => item.textContent?.trim() === "Remote Lab");
    expect(remote?.getAttribute("data-disabled")).not.toBeNull();
    const cua = Array.from(dom.document.body.querySelectorAll('[data-slot="select-item"]'))
      .find((item) => item.textContent?.trim() === "Cua Driver");
    await selectItem(cua);

    expect(saved).toEqual(["cua"]);
    expect(trigger?.textContent).toContain("Cua Driver");
    view.unmount();
  });
});

describe("Browser Use settings", () => {
  test("lets the user choose one global backend while preserving backend compatibility metadata", async () => {
    const browserSettings = {
      access_enabled: true,
      selections: { "*": "automatic" },
      backends: [
        {
          id: "openai-browser",
          display_name: "OpenAI Browser / Chrome",
          available: true,
          reason: "The signed Codex-native OpenAI Browser runtime is available.",
          providers: ["codex"],
          exclude_providers: [],
        },
        {
          id: "playwright",
          display_name: "Playwright MCP",
          available: true,
          reason: null,
          providers: [],
          exclude_providers: [],
        },
      ],
      errors: [],
    };
    const saved = [];
    const accessSaved = [];
    const view = mount(
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
          initialTab="browser-use"
          onClose={() => {}}
          browserUseSettingsLoader={async () => browserSettings}
          browserUseSelectionSaver={async (backend) => {
            saved.push(backend);
            return { ...browserSettings, selections: { "*": backend } };
          }}
          browserUseAccessSaver={async (enabled) => {
            accessSaved.push(enabled);
            return { ...browserSettings, access_enabled: enabled };
          }}
        />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(view.container.textContent).toContain("OpenAI Browser / Chrome");
      expect(view.container.textContent).toContain("Playwright MCP");
      expect(view.container.textContent).toContain("Control browser access for agents");
    });
    expect(view.container.querySelectorAll("[data-browser-use-selection]")).toHaveLength(1);
    expect(view.container.textContent).not.toContain("Claude Code");
    const trigger = view.container.querySelector("[data-browser-use-selection]");
    await openSelect(trigger);
    expect(dom.document.body.textContent).toContain("No external backend");
    const openAiBrowser = Array.from(dom.document.body.querySelectorAll('[data-slot="select-item"]'))
      .find((item) => item.textContent?.trim() === "OpenAI Browser / Chrome");
    expect(openAiBrowser).toBeDefined();
    const playwright = Array.from(dom.document.body.querySelectorAll('[data-slot="select-item"]'))
      .find((item) => item.textContent?.trim() === "Playwright MCP");
    await selectItem(playwright);

    expect(saved).toEqual(["playwright"]);
    expect(trigger?.textContent).toContain("Playwright MCP");

    const access = view.container.querySelector("[data-agent-browser-access]");
    expect(access?.getAttribute("aria-checked")).toBe("true");
    await reactAct(async () => {
      access?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(accessSaved).toEqual([false]);
    expect(access?.getAttribute("aria-checked")).toBe("false");
    expect(trigger?.hasAttribute("disabled")).toBe(true);
    view.unmount();
  });
});
