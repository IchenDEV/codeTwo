import { afterEach, expect, test } from "bun:test";

import { act } from "react";

import type { PluginSnapshot } from "../src/bridge";
import { usePluginSnapshot } from "../src/plugins/usePluginSnapshot";
import { activateDom, dom, mount } from "./domTestHarness";

activateDom();
afterEach(() => dom.document.body.replaceChildren());

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function snapshot(revision: number): PluginSnapshot {
  return {
    bundles: [],
    catalogs: [
      {
        scope: { kind: "user" },
        catalog: {
          graph_revision: revision,
          config_revision: revision,
          recovery: { kind: "normal" },
          plugins: [],
        },
      },
    ],
  };
}

test("snapshot commits atomically and ignores a superseded response", async () => {
  const old = deferred<PluginSnapshot>();
  const latest = deferred<PluginSnapshot>();
  let calls = 0;
  const fetch = () => (++calls === 1 ? old.promise : latest.promise);
  let refresh!: ReturnType<typeof usePluginSnapshot>["refresh"];
  function Probe() {
    const state = usePluginSnapshot(fetch);
    refresh = state.refresh;
    return (
      <div>
        {state.snapshot?.catalogs[0].catalog.config_revision ?? "loading"}
      </div>
    );
  }
  const view = mount(<Probe />);
  const first = refresh([{ kind: "user" }]);
  const second = refresh([{ kind: "user" }]);
  await act(async () => {
    latest.resolve(snapshot(2));
    await second;
  });
  expect(view.container.textContent).toBe("2");
  await act(async () => {
    old.resolve(snapshot(1));
    await first;
  });
  expect(view.container.textContent).toBe("2");
  view.unmount();
});

test("failed refresh preserves the previous complete snapshot", async () => {
  let calls = 0;
  const fetch = async () => {
    if (++calls === 1) return snapshot(1);
    throw new Error("offline");
  };
  let refresh!: ReturnType<typeof usePluginSnapshot>["refresh"];
  function Probe() {
    const state = usePluginSnapshot(fetch);
    refresh = state.refresh;
    return (
      <div>
        {state.snapshot?.catalogs[0].catalog.config_revision ?? "loading"}
      </div>
    );
  }
  const view = mount(<Probe />);
  await act(async () => {
    await refresh([{ kind: "user" }]);
  });
  await expect(refresh([{ kind: "user" }])).rejects.toThrow("offline");
  expect(view.container.textContent).toBe("1");
  view.unmount();
});
