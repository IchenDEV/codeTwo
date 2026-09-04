import { describe, expect, test } from "bun:test";

import { PluginHostActionController } from "../src/electrobun/pluginHostActions";
import type {
  HostActionAdapter,
  HostActionItem,
} from "../src/electrobun/pluginHostActions";

class FakeActionAdapter implements HostActionAdapter {
  items: HostActionItem[] = [];
  disposed = false;

  render(items: HostActionItem[]): boolean {
    this.items = items;
    return true;
  }

  dispose(): void {
    this.disposed = true;
  }
}

const installed = [{
  id: "agent-session-monitor",
  enabled: true,
  trusted: true,
  ui_contributions: [{
    id: "agent-sessions",
    slot: "host.actions",
    label: "Agent sessions",
    order: 0,
  }],
}];

const catalog = {
  plugins: [{
    id: "bundle:agent-session-monitor",
    enabled: true,
    running: true,
    components: {},
  }],
};

describe("plugin host actions", () => {
  test("reuses UI contributions to render actions and route clicks", async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const adapter = new FakeActionAdapter();
    const controller = new PluginHostActionController(async (name, args) => {
      calls.push({ name, args });
      if (name === "plugins.list") return installed;
      if (name === "plugins.catalog") return catalog;
      if ((args as { context?: { operation?: string } }).context?.operation === "render") {
        return {
          items: [{
            id: "session-1",
            label: "Fix flaky test",
            detail: "RUNNING",
            state: "running",
            enabled: true,
            input: { session: "session-1" },
            accessibilityLabel: "Fix flaky test, running",
          }],
        };
      }
      return true;
    }, adapter);

    await controller.start();
    expect(adapter.items).toEqual([expect.objectContaining({
      contributionKey: "agent-session-monitor:agent-sessions",
      id: "session-1",
      state: "running",
    })]);

    controller.invoke("agent-session-monitor:agent-sessions", "session-1");
    await Bun.sleep(0);
    expect(calls.at(-1)).toEqual({
      name: "plugins.invoke_ui",
      args: {
        plugin_id: "agent-session-monitor",
        contribution_id: "agent-sessions",
        context: { operation: "invoke", input: { session: "session-1" } },
      },
    });
  });

  test("rejects executable-looking documents and coalesces engine refreshes", async () => {
    let renders = 0;
    const adapter = new FakeActionAdapter();
    const controller = new PluginHostActionController(async (name) => {
      if (name === "plugins.list") return installed;
      if (name === "plugins.catalog") return catalog;
      renders += 1;
      return { items: [{ id: "bad", label: "Bad", html: "<button>" }] };
    }, adapter);
    await controller.start();
    expect(adapter.items).toEqual([]);

    controller.handleHostEvent({ name: "engine-event", payload: {} });
    controller.handleHostEvent({ name: "engine-event", payload: {} });
    await Bun.sleep(80);
    expect(renders).toBe(2);

    controller.dispose();
    expect(adapter.disposed).toBe(true);
  });
});
