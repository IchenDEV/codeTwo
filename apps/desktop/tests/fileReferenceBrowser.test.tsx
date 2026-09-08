// @ts-nocheck
import { afterEach, expect, test } from "bun:test";

import { Simulate } from "react-dom/test-utils";

import { activateDom, dom, mount, restoreDom, waitFor } from "./domTestHarness";
activateDom();
const { I18nProvider } = await import("../src/i18n");
const { FileBrowserModal } = await import("../src/files/FileBrowser");
afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});
test("file references search beyond the initial listing and exclude OS metadata", async () => {
  activateDom();
  const requests = [];
  const loadFiles = async (_cwd, query, limit) => {
    requests.push({ query, limit });
    return query
      ? ["outside-initial-list.ts", ".DS_Store"]
      : ["README.md", ".DS_Store"];
  };
  const view = mount(
    <I18nProvider>
      <FileBrowserModal
        cwd="/project"
        loadFiles={loadFiles}
        onInsert={() => {}}
        onClose={() => {}}
      />
    </I18nProvider>
  );
  await waitFor(() =>
    expect(dom.document.body.textContent).toContain("README.md")
  );
  expect(dom.document.body.textContent).not.toContain(".DS_Store");
  const input = dom.document.querySelector("input");
  input.value = "outside";
  Simulate.change(input);
  await waitFor(() =>
    expect(dom.document.body.textContent).toContain("outside-initial-list.ts")
  );
  expect(requests.at(-1)).toEqual({ query: "outside", limit: 300 });
  expect(dom.document.body.textContent).not.toContain("README.md");
  view.unmount();
});
