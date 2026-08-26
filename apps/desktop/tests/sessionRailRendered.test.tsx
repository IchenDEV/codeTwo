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
          onNewTemporary={() => {}}
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
          pullRequestsOpen={false}
          onOpenPullRequests={() => {}}
          automationsOpen={false}
          pluginManagerOpen={false}
          quickQuota={{ provider: "codex", remainingPercent: 42, windowMinutes: 10_080, resetsAt: null }}
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
  test("keeps resize tracking native to the separator and releases it when the pointer is cancelled", () => {
    activateDom();
    const widths: number[] = [];
    const view = renderRail({ onWidth: (width: number) => widths.push(width) });
    const grip = view.container.querySelector<HTMLElement>(".rail-grip");
    let capturedPointer: number | null = null;

    expect(grip).toBeTruthy();
    if (!grip) throw new Error("missing rail resize grip");
    expect(grip.tabIndex).toBe(0);
    expect(grip.getAttribute("role")).toBe("separator");
    expect(grip.getAttribute("aria-orientation")).toBe("vertical");
    expect(grip.getAttribute("aria-valuemin")).toBe("220");
    expect(grip.getAttribute("aria-valuemax")).toBe("420");
    expect(grip.getAttribute("aria-valuenow")).toBe("320");

    grip.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "ArrowRight",
      }),
    );
    expect(widths.at(-1)).toBe(330);

    grip.setPointerCapture = (pointerId) => {
      capturedPointer = pointerId;
    };
    grip.hasPointerCapture = (pointerId) => capturedPointer === pointerId;
    grip.releasePointerCapture = (pointerId) => {
      if (capturedPointer === pointerId) capturedPointer = null;
    };

    grip.dispatchEvent(
      new dom.window.PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 320,
        pointerId: 7,
      }),
    );
    expect(capturedPointer).toBe(7);
    expect(dom.document.body.classList.contains("resizing-h")).toBe(true);

    grip.dispatchEvent(
      new dom.window.PointerEvent("pointermove", {
        bubbles: true,
        clientX: 360,
        pointerId: 7,
      }),
    );
    expect(widths.at(-1)).toBe(360);

    grip.dispatchEvent(
      new dom.window.PointerEvent("pointercancel", {
        bubbles: true,
        pointerId: 7,
      }),
    );
    expect(capturedPointer).toBeNull();
    expect(dom.document.body.classList.contains("resizing-h")).toBe(false);

    view.unmount();
  });

  test("keeps search and collapse compact in the window-controls row", () => {
    activateDom();
    const opened = [];
    const view = renderRail({ onOpenSearch: () => opened.push("search") });
    const header = view.container.querySelector("[data-rail-header]");
    const search = header?.querySelector("[data-rail-search]");

    expect(view.container.textContent).not.toContain("C2");
    expect(search).toBeTruthy();
    expect(header?.querySelector('button[aria-label="Collapse the sidebar"]')).toBeTruthy();
    expect(view.container.querySelector("kbd")).toBeNull();

    click(search);
    expect(opened).toEqual(["search"]);

    view.unmount();
  });

  test("groups primary features into compact labeled navigation rows", () => {
    activateDom();
    const opened = [];
    const view = renderRail({
      taskBoardOpen: true,
      automationsOpen: true,
      onNew: () => opened.push("new"),
      onOpenPullRequests: () => opened.push("pull-requests"),
      onOpenTaskBoard: () => opened.push("tasks"),
      onOpenAutomations: () => opened.push("scheduled"),
      onOpenMarket: () => opened.push("plugins"),
      onOpenUsage: () => opened.push("usage"),
      onOpenSettings: () => opened.push("settings"),
    });
    const features = view.container.querySelector("[data-rail-features]");
    const rows = [...(features?.querySelectorAll(
      ':scope > button, :scope > [data-rail-feature="new-task"] > button:first-child',
    ) ?? [])];
    const sessionScroll = view.container.querySelector("[data-rail-session-scroll]");
    const utilities = view.container.querySelector("[data-rail-utilities]");
    const utilityRows = [...(utilities?.querySelectorAll(":scope > button") ?? [])];

    expect(rows.map((row) => row.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "New task",
      "Pull requests",
      "Task board",
      "Scheduled tasks",
      "Plugins",
    ]);
    expect(utilityRows.map((row) => row.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "Quota left42%",
      "Settings",
    ]);
    expect(sessionScroll?.nextElementSibling).toBe(utilities);
    expect(features?.querySelector('[data-rail-feature="task-board"]')?.getAttribute("aria-current"))
      .toBe("page");
    expect(features?.querySelector('[data-rail-feature="scheduled-tasks"]')?.getAttribute("aria-current"))
      .toBe("page");
    expect(view.container.textContent).not.toContain("gpt-5.6-sol");
    for (const row of [...rows, ...utilityRows]) click(row);
    expect(opened).toEqual(["new", "pull-requests", "tasks", "scheduled", "plugins", "usage", "settings"]);
    expect(features?.querySelector('[data-rail-feature="mission-control"]')).toBeNull();
    expect(utilities?.querySelector('[data-rail-feature="usage"] [role="progressbar"]')?.getAttribute("aria-valuenow"))
      .toBe("42");
    expect(utilities?.querySelector('[data-rail-feature="usage"] [data-quota-provider]')?.getAttribute("data-quota-provider"))
      .toBe("codex");
    for (const feature of [
      ...(features?.querySelectorAll(":scope > [data-rail-feature]") ?? []),
      ...utilityRows,
    ]) {
      expect(feature.className).toContain("h-(--ds-control-normal)");
      expect(feature.className).toContain(
        feature.getAttribute("aria-current") === "page" ? "text-foreground" : "text-foreground/75",
      );
    }

    view.unmount();
  });

  test("combines tracked and temporary creation in one source-list control", () => {
    activateDom();
    const created = [];
    const view = renderRail({
      onNew: () => created.push("task"),
      onNewTemporary: () => created.push("temporary"),
    });

    const control = view.container.querySelector('[data-rail-feature="new-task"]');
    const primary = control?.querySelector("button:first-of-type");
    const quickSession = control?.querySelector('button[data-rail-quick-session]');

    expect(control?.getAttribute("role")).toBe("group");
    expect(control?.className).toContain("h-(--ds-control-normal)");
    expect(control?.className).toContain("hover:bg-accent/55");
    expect(primary?.textContent?.trim()).toBe("New task");
    expect(quickSession?.getAttribute("aria-label")).toBe("Temporary session");

    click(primary);
    click(quickSession);
    expect(created).toEqual(["task", "temporary"]);
    expect(dom.document.body.querySelector('[role="menu"]')).toBeNull();

    view.unmount();
  });

  test("uses Codex-like readable neutral hierarchy for session section controls", () => {
    activateDom();
    const view = renderRail({
      archivedSessions: [session("archived", "Archived task")],
    });

    const recent = view.container.querySelector('[data-rail-section-label="recent"]');
    const project = view.container.querySelector("[data-rail-project-switcher]");
    const activeGroup = view.container.querySelector("[data-rail-group-label]");
    const archived = view.container.querySelector("[data-rail-archive-toggle]");

    for (const label of [recent, activeGroup, archived]) {
      expect(label?.className).toContain("text-ui");
      expect(label?.className).toContain("font-normal");
      expect(label?.className).toContain("text-foreground/55");
      expect(label?.className).not.toContain("font-medium");
      expect(label?.className).not.toContain("uppercase");
      expect(label?.className).not.toContain("tracking-");
    }
    expect(project?.className).toContain("text-ui");
    expect(project?.className).toContain("text-foreground/60");

    view.unmount();
  });

  test("renders project choices as checked menu rows with their paths", async () => {
    activateDom();
    disableCanvasDrawing();
    const selected = [];
    const runningSession = {
      ...session("running-other", "Background task"),
      cwd: "/tmp/other",
      project_path: "/tmp/other",
    };
    const view = renderRail({
      projects: [
        { name: "repo", path: "/tmp/repo", last_opened_at: Date.now() },
        { name: "other", path: "/tmp/other", last_opened_at: Date.now() - 60_000 },
      ],
      activeProject: "/tmp/repo",
      sessions: [session("idle-repo", "Idle task"), runningSession],
      runningSessions: new Set([runningSession.id]),
      onSelectProject: (path) => selected.push(path),
    });

    click(view.container.querySelector('button[title="/tmp/repo"]'));
    await waitFor(() => {
      const choices = [...dom.document.body.querySelectorAll('[role="menuitemradio"]')];
      expect(choices).toHaveLength(2);
      expect(choices[0]?.textContent).toContain("/tmp/repo");
      expect(choices[0]?.getAttribute("data-checked")).not.toBeNull();
      expect(choices[0]?.querySelector('[data-slot="dropdown-menu-radio-item-indicator"]'))
        .toBeTruthy();
      expect(choices[1]?.textContent).toContain("/tmp/other");
      expect(choices[0]?.querySelector("[data-project-running]")).toBeNull();
      expect(choices[1]?.querySelector("[data-project-running]")?.getAttribute("aria-label"))
        .toBe("Working");
    });

    click(dom.document.body.querySelectorAll('[role="menuitemradio"]')[1]);
    expect(selected).toEqual(["/tmp/other"]);

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

  test("omits previews that merely restate the session title", () => {
    activateDom();
    const view = renderRail({
      sessions: [session("echo", "Paste support")],
      previews: { echo: "Paste support" },
      activeSession: "echo",
    });
    const row = view.container.querySelector('[data-session-id="echo"]');

    expect(row?.querySelectorAll("[data-session-line]")).toHaveLength(3);
    expect(row?.querySelector('[data-session-line="preview"]')).toBeNull();
    expect(row?.getAttribute("title")).toBeNull();

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
    const activeRow = view.container.querySelector('[data-session-id="punctuation"]');

    expect(row?.getAttribute("data-session-density")).toBe("comfortable");
    expect(row?.parentElement?.className).toContain("gap-2");
    expect(activeRow?.className).toContain("bg-fill-hover");
    expect(activeRow?.className.split(/\s+/)).not.toContain("bg-accent");

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

  test("finishes the archive exit before moving a session", async () => {
    activateDom();
    const archived = [];
    const view = renderRail({ onArchive: (id, value) => archived.push([id, value]) });
    const row = view.container.querySelector('[data-session-id="meaningful"]');
    const archive = row?.querySelector('button[aria-label="Archive"]');

    click(archive);
    await waitFor(() => {
      expect(row?.getAttribute("data-session-archive-motion")).toBe("archive");
      expect(row?.getAttribute("aria-busy")).toBe("true");
    });
    expect(archived).toEqual([]);

    row?.dispatchEvent(new dom.Event("animationend", { bubbles: true }));
    await waitFor(() => expect(archived).toEqual([["meaningful", true]]));
    await waitFor(() => {
      expect(row?.getAttribute("data-session-archive-motion")).toBeNull();
      expect(row?.getAttribute("aria-busy")).toBeNull();
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
