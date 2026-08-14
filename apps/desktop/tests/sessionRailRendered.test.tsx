// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, click, dom, mount, restoreDom, waitFor } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { SessionRail } = await import("../src/sidebar/SessionRail");
const { ToastProvider } = await import("../src/ui/toast");

afterEach(() => {
  dom.document.body.replaceChildren();
  dom.window.localStorage.clear();
  delete dom.window.navigator.clipboard;
  restoreDom();
});

function session(id: string, title: string) {
  return {
    id,
    title,
    title_origin: "manual",
    pinned: false,
    provider: "codex",
    model: null,
    cwd: "/tmp/repo",
    worktree_path: null,
    project_path: "/tmp/repo",
    permission_mode: "ask",
    sandbox_policy: "workspace_write",
    acp_session_id: null,
    memory_read: "inherit",
    memory_write: "inherit",
    created_at: Date.now(),
    activity: { revision: 1, state: { kind: "idle" } },
  };
}

function renderRail(overrides = {}) {
  return mount(
    <I18nProvider>
      <ToastProvider>
        <SessionRail
          projects={[{ name: "repo", path: "/tmp/repo", last_opened_at: Date.now() }]}
          activeProject="/tmp/repo"
          onSelectProject={() => {}}
          onAddProject={() => {}}
          onRenameProject={() => {}}
          onRemoveProject={() => {}}
          sessions={[session("punctuation", "Punctuation"), session("meaningful", "Meaningful")]}
          archivedSessions={[]}
          previews={{ punctuation: " · ", meaningful: "A useful preview" }}
          activeSession="punctuation"
          runningSessions={new Set()}
          onSelect={() => {}}
          onNew={() => {}}
          onRename={() => {}}
          onPin={() => {}}
          onArchive={() => {}}
          displayProvider={() => "OpenAI Codex"}
          model="gpt-5.6-sol"
          provider="codex"
          onOpenMarket={() => {}}
          newHint="⌘N"
          searchHint="⌘K"
          onOpenSearch={() => {}}
          onOpenSettings={() => {}}
          collapsed={false}
          overlay={false}
          onToggleCollapse={() => {}}
          width={320}
          onWidth={() => {}}
          needsMeCount={0}
          onOpenMissionControl={() => {}}
          {...overrides}
        />
      </ToastProvider>
    </I18nProvider>,
  );
}

describe("SessionRail row layout", () => {
  test("renders useful latest conversation summaries and omits empty ones", () => {
    activateDom();
    const view = renderRail();
    const punctuation = view.container.querySelector('[data-session-id="punctuation"]');
    const meaningful = view.container.querySelector('[data-session-id="meaningful"]');

    expect(punctuation?.querySelectorAll("[data-session-line]")).toHaveLength(3);
    expect(punctuation?.querySelector('[data-session-line="preview"]')).toBeNull();
    expect(punctuation?.getAttribute("title")).toBeNull();

    expect(meaningful?.querySelectorAll("[data-session-line]")).toHaveLength(4);
    expect(meaningful?.querySelectorAll("[data-session-icon-column]")).toHaveLength(4);
    expect(meaningful?.querySelector('[data-session-line="preview"]')?.textContent).toBe(
      "A useful preview",
    );
    expect(meaningful?.querySelector("[data-session-select]")?.getAttribute("aria-describedby"))
      .toBe("session-preview-meaningful");
    expect(meaningful?.getAttribute("title")).toBe("A useful preview");

    for (const row of [punctuation, meaningful]) {
      expect(row?.querySelector('[data-session-line="status"]')?.textContent).toContain("Completed");
    }

    view.unmount();
  });

  test("uses comfortable spacing and exposes real session actions on right click", async () => {
    activateDom();
    const view = renderRail();
    const row = view.container.querySelector('[data-session-id="meaningful"]');

    expect(row?.getAttribute("data-session-density")).toBe("comfortable");
    expect(row?.parentElement?.className).toContain("gap-2");

    row?.dispatchEvent(
      new dom.window.MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 120,
        clientY: 80,
      }),
    );

    await waitFor(() => {
      expect(dom.document.body.textContent).toContain("Copy session ID");
      expect(dom.document.body.textContent).toContain("Reveal working directory");
    });

    const renameItem = [...dom.document.body.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === "Rename",
    );
    expect(renameItem).toBeTruthy();
    click(renameItem);
    await waitFor(() => {
      expect(view.container.querySelector('input[value="Meaningful"]')).toBeTruthy();
    });

    view.unmount();
  });

  test("supports keyboard selection, row navigation, and the keyboard context-menu gesture", async () => {
    activateDom();
    const selected = [];
    const view = renderRail({ onSelect: (id) => selected.push(id) });
    const first = view.container.querySelector('[data-session-id="punctuation"]');
    const second = view.container.querySelector('[data-session-id="meaningful"]');
    const firstSelect = first?.querySelector("[data-session-select]");
    const secondSelect = second?.querySelector("[data-session-select]");

    expect(firstSelect?.getAttribute("aria-current")).toBe("page");
    expect(firstSelect?.getAttribute("tabindex")).toBe("0");
    expect(first?.getAttribute("role")).toBeNull();

    firstSelect.focus();
    firstSelect.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(selected).toEqual(["punctuation"]);

    firstSelect.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(dom.document.activeElement).toBe(secondSelect);

    secondSelect.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "F10",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await waitFor(() => {
      expect(dom.document.body.textContent).toContain("Copy session ID");
    });

    view.unmount();
  });

  test("confirms clipboard actions instead of failing silently", async () => {
    activateDom();
    const copied = [];
    Object.defineProperty(dom.window.navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value) => copied.push(value) },
    });
    const view = renderRail();
    const row = view.container.querySelector('[data-session-id="meaningful"]');

    row?.dispatchEvent(
      new dom.window.MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 120,
        clientY: 80,
      }),
    );
    await waitFor(() => {
      expect(dom.document.body.textContent).toContain("Copy session ID");
    });

    const copyItem = [...dom.document.body.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === "Copy session ID",
    );
    expect(copyItem).toBeTruthy();
    click(copyItem);

    await waitFor(() => {
      expect(copied).toEqual(["meaningful"]);
      expect(dom.document.body.textContent).toContain("Session ID copied.");
    });

    view.unmount();
  });
});
