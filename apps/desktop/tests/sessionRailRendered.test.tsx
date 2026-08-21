// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, click, dom, mount, restoreDom, waitFor } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { SessionRail } = await import("../src/sidebar/SessionRail");
const { ToastProvider } = await import("../src/ui/toast");

let restoreCanvasContext: (() => void) | null = null;

function disableCanvasDrawing(): void {
  // Other canvas suites install purpose-specific partial contexts. The activity-orb contract tests
  // only need the canvas element and state metadata, so keep this suite on the supported no-context path.
  const getContext = dom.HTMLCanvasElement.prototype.getContext;
  dom.HTMLCanvasElement.prototype.getContext = () => null;
  restoreCanvasContext = () => {
    dom.HTMLCanvasElement.prototype.getContext = getContext;
  };
}

afterEach(() => {
  restoreCanvasContext?.();
  restoreCanvasContext = null;
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
          onOpenMarket={() => {}}
          onOpenAutomations={() => {}}
          newHint="⌘N"
          searchHint="⌘K"
          onOpenSearch={() => {}}
          onOpenSettings={() => {}}
          collapsed={false}
          overlay={false}
          onToggleCollapse={() => {}}
          width={320}
          onWidth={() => {}}
          taskBoardOpen={false}
          onOpenTaskBoard={() => {}}
          automationsOpen={false}
          pluginHubOpen={false}
          quickQuota={{ remainingPercent: 42, windowMinutes: 10_080, resetsAt: null }}
          quickQuotaLoading={false}
          quickQuotaProviderName="OpenAI Codex"
          onOpenUsage={() => {}}
          {...overrides}
        />
      </ToastProvider>
    </I18nProvider>,
  );
}

describe("SessionRail row layout", () => {
  test("omits the sidebar wordmark while keeping the collapse control", () => {
    activateDom();
    const view = renderRail();

    expect(view.container.textContent).not.toContain("C2");
    expect(view.container.querySelector('button[aria-label="Collapse the sidebar"]')).toBeTruthy();

    view.unmount();
  });

  test("groups primary features into compact labeled navigation rows", () => {
    activateDom();
    const opened = [];
    const view = renderRail({
      taskBoardOpen: true,
      automationsOpen: true,
      onNew: () => opened.push("new"),
      onOpenTaskBoard: () => opened.push("tasks"),
      onOpenAutomations: () => opened.push("scheduled"),
      onOpenMarket: () => opened.push("plugins"),
      onOpenUsage: () => opened.push("usage"),
      onOpenSettings: () => opened.push("settings"),
    });
    const features = view.container.querySelector("[data-rail-features]");
    const rows = [...(features?.querySelectorAll("button") ?? [])];

    expect(rows.map((row) => row.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "New session",
      "Task board",
      "Scheduled tasks",
      "Plugins",
      "Quota left42%",
      "Settings",
    ]);
    expect(features?.querySelector('[data-rail-feature="task-board"]')?.getAttribute("aria-current"))
      .toBe("page");
    expect(features?.querySelector('[data-rail-feature="scheduled-tasks"]')?.getAttribute("aria-current"))
      .toBe("page");
    expect(view.container.textContent).not.toContain("gpt-5.6-sol");
    for (const row of rows) click(row);
    expect(opened).toEqual(["new", "tasks", "scheduled", "plugins", "usage", "settings"]);
    expect(features?.querySelector('[data-rail-feature="mission-control"]')).toBeNull();
    expect(features?.querySelector('[data-rail-feature="usage"] [role="progressbar"]')?.getAttribute("aria-valuenow"))
      .toBe("42");

    view.unmount();
  });

  test("renders useful latest conversation summaries and omits empty ones", () => {
    activateDom();
    const view = renderRail();
    const punctuation = view.container.querySelector('[data-session-id="punctuation"]');
    const meaningful = view.container.querySelector('[data-session-id="meaningful"]');

    expect(punctuation?.querySelectorAll("[data-session-line]")).toHaveLength(3);
    expect(punctuation?.querySelector('[data-session-line="preview"]')).toBeNull();
    expect(punctuation?.getAttribute("title")).toBeNull();

    expect(meaningful?.querySelectorAll("[data-session-line]")).toHaveLength(4);
    expect(meaningful?.querySelectorAll("[data-session-icon-column]")).toHaveLength(3);
    expect(meaningful?.querySelector('[data-session-line="preview"]')?.textContent).toBe(
      "A useful preview",
    );
    expect(meaningful?.querySelector("[data-session-select]")?.getAttribute("aria-describedby"))
      .toBe("session-preview-meaningful");
    expect(meaningful?.getAttribute("title")).toBe("A useful preview");

    for (const row of [punctuation, meaningful]) {
      const provider = row?.querySelector('[data-session-line="provider"]');
      const status = row?.querySelector('[data-session-line="status"]');
      expect(status?.textContent).toContain("Completed");
      expect(provider?.contains(status ?? null)).toBe(true);
      expect(status?.className).toContain("ml-auto");
    }

    view.unmount();
  });

  test("uses semantic activity orbs for running sessions and sidebar loading", () => {
    activateDom();
    disableCanvasDrawing();
    const view = renderRail({
      runningSessions: new Set(["meaningful"]),
      quickQuota: null,
      quickQuotaLoading: true,
    });
    const running = view.container.querySelector('[data-session-id="meaningful"]');
    const runningOrb = running?.querySelector('[data-session-line="status"] canvas');
    const quotaOrb = view.container.querySelector(
      '[data-rail-feature="usage"] canvas[data-activity-state="searching"]',
    );

    expect(runningOrb?.getAttribute("data-activity-state")).toBe("working");
    expect(runningOrb?.style.width).toBe("14px");
    expect(running?.querySelector('[data-session-line="status"]')?.getAttribute("aria-label"))
      .toBe("Working");
    expect(quotaOrb?.style.width).toBe("14px");
    expect(view.container.querySelector('[data-rail-feature="usage"]')?.getAttribute("aria-busy"))
      .toBe("true");

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
