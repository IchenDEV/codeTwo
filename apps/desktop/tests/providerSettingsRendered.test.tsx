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
              display_name: "OpenAI Codex",
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
});
