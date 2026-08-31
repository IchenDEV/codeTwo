// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import { activateDom, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { SettingsPage } = await import("../src/settings/SettingsPage");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("Provider settings capabilities", () => {
  test("shows only capabilities the provider can actually expose", async () => {
    const view = mount(
      <I18nProvider>
        <SettingsPage
          bindings={[]}
          capturing={null}
          onCapture={() => {}}
          providers={[
            {
              id: "claude_code",
              display_name: "Claude Code",
              available: true,
              needs_node: true,
              models: [],
              capabilities: [
                {
                  id: "computer_use",
                  state: "unverified",
                  experimental: true,
                  reason: "Available through a provider-neutral MCP adapter.",
                },
                {
                  id: "image_generation",
                  state: "unavailable",
                  experimental: true,
                  reason: "No provider-neutral image adapter.",
                },
              ],
            },
            {
              id: "codex",
              display_name: "Codex",
              available: true,
              needs_node: true,
              models: [],
              capabilities: [
                {
                  id: "image_generation",
                  state: "ready",
                  experimental: true,
                  reason: "Available through Codex.",
                },
                {
                  id: "codetwo_browser",
                  state: "unavailable",
                  experimental: true,
                  reason: "Not exposed by this host.",
                },
              ],
            },
          ]}
          provider="codex"
          projectPath="/workspace"
          project={null}
          onProjectWorktreeMode={async () => {}}
          memoryEnabled={false}
          initialTab="providers"
          onClose={() => {}}
        />
      </I18nProvider>,
    );
    await flush();

    view.container.querySelector('[data-provider-disclosure="claude_code"]')?.click();
    view.container.querySelector('[data-provider-disclosure="codex"]')?.click();
    await flush();

    expect(view.container.querySelector('[data-provider-capability="claude_code:computer_use"]'))
      .not.toBeNull();
    expect(view.container.querySelector('[data-provider-capability="claude_code:image_generation"]'))
      .toBeNull();
    expect(view.container.querySelector('[data-provider-capability="codex:image_generation"]'))
      .not.toBeNull();
    expect(view.container.querySelector('[data-provider-capability="codex:codetwo_browser"]'))
      .toBeNull();
    expect(view.container.querySelectorAll("[data-provider-capability]")).toHaveLength(2);

    view.unmount();
  });

  test("installs, upgrades, refreshes, and enables providers from one list", async () => {
    const actions: string[] = [];
    const view = mount(
      <I18nProvider>
        <SettingsPage
          bindings={[]}
          capturing={null}
          onCapture={() => {}}
          providers={[
            {
              id: "codex",
              display_name: "Codex",
              available: true,
              enabled: true,
              needs_node: true,
              models: [],
              capabilities: [],
              management: {
                installed: false,
                version: null,
                latest_version: null,
                update_available: null,
                check_error: null,
                install_supported: true,
                upgrade_supported: false,
                launch_mode: "on_demand",
              },
            },
            {
              id: "grok",
              display_name: "Grok",
              available: true,
              enabled: true,
              needs_node: false,
              models: [],
              capabilities: [],
              management: {
                installed: true,
                version: "1.0.5",
                latest_version: "1.1.0",
                update_available: true,
                check_error: null,
                install_supported: false,
                upgrade_supported: true,
                launch_mode: "installed",
              },
            },
            {
              id: "opencode",
              display_name: "OpenCode",
              available: true,
              enabled: true,
              needs_node: false,
              models: [],
              capabilities: [],
              management: {
                installed: true,
                version: "2.0.0",
                latest_version: "2.0.0",
                update_available: false,
                check_error: null,
                install_supported: false,
                upgrade_supported: true,
                launch_mode: "installed",
              },
            },
          ]}
          provider="codex"
          projectPath="/workspace"
          project={null}
          onProjectWorktreeMode={async () => {}}
          memoryEnabled={false}
          initialTab="providers"
          onClose={() => {}}
          onReloadProviders={async () => {
            actions.push("refresh");
            return [];
          }}
          providerInstaller={async (id) => {
            actions.push(`install:${id}`);
            return [];
          }}
          providerUpgrader={async (id) => {
            actions.push(`upgrade:${id}`);
            return [];
          }}
          providerEnabledSaver={async (id, enabled) => {
            actions.push(`enabled:${id}:${enabled}`);
            return [];
          }}
        />
      </I18nProvider>,
    );
    await flush();

    expect(view.container.textContent).toContain("Ready on demand");
    expect(view.container.textContent).toContain("v1.0.5");
    expect(view.container.textContent).toContain("Update to v1.1.0");
    expect(view.container.querySelector('[data-provider-action="codex:upgrade"]')).toBeNull();
    expect(view.container.querySelector('[data-provider-action="grok:install"]')).toBeNull();
    expect(view.container.querySelector('[data-provider-action="opencode:install"]')).toBeNull();
    expect(view.container.querySelector('[data-provider-action="opencode:upgrade"]')).toBeNull();

    view.container.querySelector('[data-provider-action="codex:install"]')?.click();
    await flush();
    view.container.querySelector('[data-provider-action="grok:upgrade"]')?.click();
    await flush();
    view.container.querySelector('[data-provider-toggle="codex"]')?.click();
    await flush();
    view.container.querySelector('[data-provider-refresh]')?.click();
    await flush();

    expect(actions).toEqual([
      "refresh",
      "install:codex",
      "refresh",
      "upgrade:grok",
      "refresh",
      "enabled:codex:false",
      "refresh",
      "refresh",
    ]);

    view.unmount();
  });
});
