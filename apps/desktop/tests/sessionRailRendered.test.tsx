// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import {
  activateDom,
  click,
  dom,
  mount,
  restoreDom,
  waitFor,
} from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { SessionRail } = await import("../src/sidebar/SessionRail");
const { SIDEBAR_SECTIONS_STORAGE_KEY } =
  await import("../src/sidebar/sidebarSections");
const { SIDEBAR_PROJECTS_STORAGE_KEY } =
  await import("../src/sidebar/sidebarProjects");
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
          projects={[
            { name: "repo", path: "/tmp/repo", last_opened_at: Date.now() },
          ]}
          sessions={[
            session("punctuation", "Punctuation"),
            session("meaningful", "Meaningful"),
          ]}
          archivedSessions={[]}
          previews={{ punctuation: " · ", meaningful: "A useful preview" }}
          activeSession="punctuation"
          runningSessions={new Set()}
          onSelect={() => {}}
          onNew={() => {}}
          quickChatOpen={false}
          onToggleQuickChat={() => {}}
          onRename={() => {}}
          onPin={() => {}}
          onArchive={() => {}}
          displayProvider={() => "Codex"}
          onOpenMarket={() => {}}
          onOpenAutomations={() => {}}
          deviceConnectionsAvailable={false}
          deviceConnectionsOpen={false}
          onOpenDeviceConnections={() => {}}
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
          quickQuota={{
            provider: "codex",
            remainingPercent: 42,
            windowMinutes: 10_080,
            resetsAt: null,
          }}
          quickQuotaLoading={false}
          quickQuotaProviderName="Codex"
          onOpenUsage={() => {}}
          {...overrides}
        />
      </ToastProvider>
    </I18nProvider>
  );
}

function dragAndDrop(source: Element, target: Element) {
  const values = new Map<string, string>();
  const dataTransfer = {
    effectAllowed: "none",
    dropEffect: "none",
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? "",
  };
  const dispatch = (node: Element, type: string) => {
    const event = new dom.window.Event(type, {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    node.dispatchEvent(event);
  };
  dispatch(source, "dragstart");
  dispatch(target, "dragover");
  dispatch(target, "drop");
  dispatch(source, "dragend");
}

describe("SessionRail row layout", () => {
  test("renders external resource Sections in the same flat scroll flow", () => {
    activateDom();
    const view = renderRail({
      resourceSections: <section>Feishu resources</section>,
    });

    const sessionScroll = view.container.querySelector(
      "[data-rail-session-scroll]"
    );
    const resources = Array.from(
      sessionScroll?.querySelectorAll("section") ?? []
    ).find((section) => section.textContent?.includes("Feishu resources"));
    expect(resources).toBeTruthy();
    expect(sessionScroll?.contains(resources ?? null)).toBe(true);
    expect(
      view.container.querySelector("[data-rail-project-switcher]")
    ).toBeNull();
    expect(view.container.textContent).toContain("Punctuation");
    expect(
      view.container.querySelector(
        '[data-rail-utilities] [aria-label="Settings"]'
      )
    ).toBeTruthy();

    view.unmount();
  });

  test("keeps pinned Tasks ahead of global recency without inventing a Highlight Section", () => {
    activateDom();
    const pinned = {
      ...session("pinned", "Pinned chat"),
      pinned: true,
      created_at: 50,
      last_active_at: 50,
    };
    const revived = {
      ...session("revived", "Revived chat"),
      created_at: 100,
      last_active_at: 300,
    };
    const newer = {
      ...session("newer", "Newer chat"),
      created_at: 200,
      last_active_at: 200,
    };
    const view = renderRail({
      sessions: [newer, pinned, revived],
      activeSession: null,
      previews: {},
    });

    const text = view.container.textContent ?? "";
    expect(text.indexOf("Pinned chat")).toBeLessThan(
      text.indexOf("Revived chat")
    );
    expect(text.indexOf("Revived chat")).toBeLessThan(
      text.indexOf("Newer chat")
    );
    expect(
      view.container.querySelector(
        '[data-task-section-toggle="system:highlight"]'
      )
    ).toBeNull();

    view.unmount();
  });

  test("shows every Project as an ordered folder with its own Tasks", () => {
    activateDom();
    dom.window.localStorage.setItem("rail.archivedOpen", "1");
    const local = { ...session("local", "Local task"), last_active_at: 200 };
    const other = {
      ...session("other", "Other project task"),
      cwd: "/tmp/other",
      project_path: "/tmp/other",
      last_active_at: 300,
    };
    const archivedOther = {
      ...session("archived-other", "Archived other task"),
      cwd: "/tmp/other",
      project_path: "/tmp/other",
      created_at: 400,
    };
    const view = renderRail({
      projects: [
        { name: "repo", path: "/tmp/repo", last_opened_at: 10 },
        { name: "other", path: "/tmp/other", last_opened_at: 20 },
      ],
      sessions: [local, other],
      archivedSessions: [archivedOther],
      activeSession: null,
      previews: {},
    });

    const projectPaths = Array.from(
      view.container.querySelectorAll("[data-project-group]")
    ).map((group) => group.getAttribute("data-project-group"));
    expect(projectPaths).toEqual(["/tmp/other", "/tmp/repo"]);
    expect(
      view.container.querySelector(
        '[data-project-content="/tmp/other"] [data-session-id="other"]'
      )
    ).toBeTruthy();
    expect(
      view.container.querySelector(
        '[data-project-content="/tmp/repo"] [data-session-id="local"]'
      )
    ).toBeTruthy();
    expect(
      view.container.querySelector(
        '[data-rail-archive-list] [data-session-id="archived-other"]'
      )
    ).toBeTruthy();
    expect(
      view.container.querySelectorAll("[data-project-group]")
    ).toHaveLength(2);

    view.unmount();
  });

  test("keeps explicit Sections separate from the ordinary unsectioned feed", async () => {
    activateDom();
    disableCanvasDrawing();
    dom.window.localStorage.setItem(
      SIDEBAR_SECTIONS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        sections: [{ id: "work", name: "Work", collapsed: false }],
        assignments: { running: "work" },
      })
    );
    const pinned = { ...session("pinned", "Pinned task"), pinned: true };
    const running = {
      ...session("running", "Running task"),
      last_active_at: 300,
    };
    const idle = { ...session("idle", "Flat task"), last_active_at: 200 };
    const view = renderRail({
      sessions: [idle, pinned, running],
      runningSessions: new Set(["running"]),
      activeSession: null,
      previews: {},
    });

    const work = view.container.querySelector(
      '[data-task-section-content="work"]'
    );
    const flat = view.container.querySelector(
      '[data-project-content="/tmp/repo"]'
    );
    expect(
      view.container.querySelector(
        '[data-task-section-content="system:highlight"]'
      )
    ).toBeNull();
    expect(work?.textContent).toContain("Running task");
    expect(flat?.textContent).toContain("Pinned task");
    expect(flat?.textContent).toContain("Flat task");

    const ids = Array.from(
      view.container.querySelectorAll("[data-session-id]")
    ).map((row) => row.getAttribute("data-session-id"));
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);

    const workToggle = view.container.querySelector(
      '[data-task-section-toggle="work"]'
    );
    expect(workToggle?.children[0]?.textContent).toBe("Work");
    expect(workToggle?.children[1]?.tagName).toBe("svg");
    expect(workToggle?.className).toContain("px-surface-inset");
    expect(workToggle?.parentElement?.className).toContain("pr-2");
    expect(workToggle?.parentElement?.className).not.toContain("px-2");

    const runningRow = view.container.querySelector(
      '[data-session-id="running"]'
    );
    runningRow?.dispatchEvent(
      new dom.window.MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
      })
    );
    await waitFor(() => {
      expect(
        dom.document.body.querySelector(
          '[data-slot="context-menu-sub-trigger"]'
        )?.textContent
      ).toContain("Section");
    });

    view.unmount();
  });

  test("applies direct drag ordering to Tasks and Projects", async () => {
    activateDom();
    const first = { ...session("first", "First task"), last_active_at: 300 };
    const second = { ...session("second", "Second task"), last_active_at: 200 };
    const view = renderRail({
      projects: [
        { name: "repo", path: "/tmp/repo", last_opened_at: 1 },
        { name: "other", path: "/tmp/other", last_opened_at: 2 },
      ],
      sessions: [first, second],
      activeSession: null,
      previews: {},
    });

    dragAndDrop(
      view.container.querySelector(
        '[data-session-id="second"] [data-session-drag-handle]'
      ),
      view.container.querySelector('[data-session-id="first"]')
    );
    await waitFor(() => {
      expect(
        Array.from(
          view.container.querySelectorAll(
            '[data-project-content="/tmp/repo"] [data-session-id]'
          )
        ).map((row) => row.getAttribute("data-session-id"))
      ).toEqual(["second", "first"]);
    });

    dragAndDrop(
      view.container.querySelector('[data-project-drag-handle="/tmp/repo"]'),
      view.container.querySelector('[data-project-header="/tmp/other"]')
    );
    await waitFor(() => {
      expect(
        Array.from(
          view.container.querySelectorAll(
            '[data-project-list="root"] > [data-project-group]'
          )
        ).map((group) => group.getAttribute("data-project-group"))
      ).toEqual(["/tmp/repo", "/tmp/other"]);
    });
    expect(
      view.container
        .querySelector('[data-session-id="second"] [data-session-drag-handle]')
        ?.getAttribute("draggable")
    ).toBe("true");
    expect(
      view.container
        .querySelector(
          '[data-session-id="second"] [data-session-drag-handle] svg'
        )
        ?.getAttribute("class")
    ).toContain("pointer-events-none");

    view.unmount();
  });

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
      })
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
      })
    );
    expect(capturedPointer).toBe(7);
    expect(dom.document.body.classList.contains("resizing-h")).toBe(true);

    grip.dispatchEvent(
      new dom.window.PointerEvent("pointermove", {
        bubbles: true,
        clientX: 360,
        pointerId: 7,
      })
    );
    expect(widths.at(-1)).toBe(360);

    grip.dispatchEvent(
      new dom.window.PointerEvent("pointercancel", {
        bubbles: true,
        pointerId: 7,
      })
    );
    expect(capturedPointer).toBeNull();
    expect(dom.document.body.classList.contains("resizing-h")).toBe(false);

    view.unmount();
  });

  test("keeps collapse in the title row and exposes search as a labeled launcher", () => {
    activateDom();
    const opened = [];
    const view = renderRail({ onOpenSearch: () => opened.push("search") });
    const header = view.container.querySelector("[data-rail-header]");
    const search = view.container.querySelector("[data-rail-search]");

    expect(view.container.textContent).not.toContain("C2");
    expect(search).toBeTruthy();
    expect(header?.querySelector("[data-rail-search]")).toBeNull();
    expect(
      header?.querySelector('button[aria-label="Collapse the sidebar"]')
    ).toBeTruthy();
    expect(search?.textContent).toContain("Search chats");
    expect(search?.querySelector("kbd")?.textContent).toBe("⌘K");

    click(search);
    expect(opened).toEqual(["search"]);

    view.unmount();
  });

  test("groups primary features into Codex-aligned labeled navigation rows", () => {
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
    const rows = [
      ...(features?.querySelectorAll(
        ':scope > [data-rail-feature="new-task"] > button:first-child, :scope > [data-rail-feature]:not([data-rail-feature="new-task"]) > [data-slot="navigation-row"]'
      ) ?? []),
    ];
    const sessionScroll = view.container.querySelector(
      "[data-rail-session-scroll]"
    );
    const utilities = view.container.querySelector("[data-rail-utilities]");
    const utilityButtons = [
      ...(utilities?.querySelectorAll(
        ':scope > [data-rail-feature] > [data-slot="rail-utility-button"]'
      ) ?? []),
    ];

    expect(
      rows.map((row) => {
        const copy = row.cloneNode(true) as HTMLElement;
        copy
          .querySelectorAll('[role="progressbar"] [role="presentation"]')
          .forEach((node) => node.remove());
        return copy.textContent?.replace(/\s+/g, " ").trim();
      })
    ).toEqual([
      "New task",
      "Pull requests",
      "Task board",
      "Scheduled tasks",
      "Plugins",
    ]);
    expect(
      utilityButtons.map((button) => button.getAttribute("aria-label"))
    ).toEqual([
      "Settings",
      "Codex · Weekly limit · 42% left · Open Usage settings",
    ]);
    expect(utilities?.getAttribute("data-layout")).toBe("icon-toolbar");
    expect(sessionScroll?.nextElementSibling).toBe(utilities);
    expect(
      features
        ?.querySelector(
          '[data-rail-feature="task-board"] [data-slot="navigation-row"]'
        )
        ?.getAttribute("aria-current")
    ).toBe("page");
    expect(
      features
        ?.querySelector(
          '[data-rail-feature="scheduled-tasks"] [data-slot="navigation-row"]'
        )
        ?.getAttribute("aria-current")
    ).toBe("page");
    expect(
      features
        ?.querySelector(
          '[data-rail-feature="task-board"] [data-slot="navigation-row-leading"]'
        )
        ?.getAttribute("class")
    ).toContain("text-current");
    expect(
      features
        ?.querySelector(
          '[data-rail-feature="pull-requests"] [data-slot="navigation-row-leading"]'
        )
        ?.getAttribute("class")
    ).toContain("text-muted-foreground");
    expect(view.container.textContent).not.toContain("gpt-5.6-sol");
    for (const row of [...rows, ...utilityButtons]) click(row);
    expect(opened).toEqual([
      "new",
      "pull-requests",
      "tasks",
      "scheduled",
      "plugins",
      "settings",
      "usage",
    ]);
    expect(
      features?.querySelector('[data-rail-feature="mission-control"]')
    ).toBeNull();
    const quotaButton = utilities?.querySelector(
      '[data-rail-feature="usage"] [data-slot="rail-utility-button"]'
    );
    expect(quotaButton?.getAttribute("aria-label")).toBe(
      "Codex · Weekly limit · 42% left · Open Usage settings"
    );
    expect(quotaButton?.querySelector('[role="progressbar"]')).toBeNull();
    expect(
      utilities
        ?.querySelector('[data-rail-feature="usage"] [data-quota-provider]')
        ?.getAttribute("data-quota-provider")
    ).toBe("codex");
    for (const row of rows.slice(1)) {
      expect(row.getAttribute("data-slot")).toBe("navigation-row");
      expect(row.className).toContain("min-h-navigation-row");
      expect(row.className).toContain("rounded-control");
    }
    for (const button of utilityButtons) {
      expect(button.className).toContain("size-control");
      expect(button.className).toContain("rounded-full");
      expect(button.textContent?.trim()).toBe("");
    }

    view.unmount();
  });

  test("keeps device connections in the lower-left utility group with a phone icon", () => {
    activateDom();
    const opened = [];
    const view = renderRail({
      deviceConnectionsAvailable: true,
      deviceConnectionsOpen: true,
      onOpenDeviceConnections: () => opened.push("device-connections"),
    });

    const features = view.container.querySelector("[data-rail-features]");
    const utilities = view.container.querySelector("[data-rail-utilities]");
    const button = utilities?.querySelector(
      '[data-rail-feature="device-connections"] [data-slot="rail-utility-button"]'
    );

    expect(
      features?.querySelector('[data-rail-feature="device-connections"]')
    ).toBeNull();
    expect(button?.textContent?.trim()).toBe("");
    expect(button?.getAttribute("aria-label")).toBe("Device connections");
    expect(button?.getAttribute("aria-current")).toBe("page");
    expect(button?.getAttribute("data-selected")).toBe("true");
    expect(button?.className).toContain("rounded-full");
    expect(
      button?.querySelector('[data-device-connections-icon="phone"]')
    ).toBeTruthy();
    expect(
      button?.parentElement?.previousElementSibling?.getAttribute(
        "data-rail-feature"
      )
    ).toBe("usage");
    click(button);
    expect(opened).toEqual(["device-connections"]);

    view.unmount();
  });

  test("removes the device-connections row when its plugin component is unavailable", () => {
    activateDom();
    const view = renderRail({ deviceConnectionsAvailable: false });

    expect(
      view.container.querySelector('[data-rail-feature="device-connections"]')
    ).toBeNull();

    view.unmount();
  });

  test("keeps one Quick Chat action beside the tracked Task action", () => {
    activateDom();
    const created = [];
    const view = renderRail({
      onNew: () => created.push("task"),
      onToggleQuickChat: () => created.push("quick-chat"),
    });

    const control = view.container.querySelector(
      '[data-rail-feature="new-task"]'
    );
    const primary = control?.querySelector("button:first-of-type");
    const quickChat = control?.querySelector("button[data-rail-quick-chat]");

    expect(control?.getAttribute("role")).toBe("group");
    expect(control?.className).toContain("h-control");
    expect(control?.className).toContain("hover:bg-fill-hover");
    expect(primary?.textContent?.trim()).toBe("New task");
    expect(control?.querySelectorAll("button")).toHaveLength(2);
    expect(control?.querySelector("[data-rail-quick-session]")).toBeNull();
    expect(control?.querySelector("[data-rail-side-chat]")).toBeNull();
    expect(quickChat?.getAttribute("aria-label")).toBe("Toggle Quick Chat");
    expect(quickChat?.getAttribute("aria-pressed")).toBe("false");

    click(primary);
    click(quickChat);
    expect(created).toEqual(["task", "quick-chat"]);
    expect(dom.document.body.querySelector('[role="menu"]')).toBeNull();

    view.unmount();
  });

  test("treats a user-created Highlight like every other editable Section", async () => {
    activateDom();
    dom.window.localStorage.setItem(
      SIDEBAR_SECTIONS_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        sections: [{ id: "highlight", name: "Highlight", collapsed: false }],
        assignments: {},
        taskOrder: {},
      })
    );
    dom.window.localStorage.setItem(
      SIDEBAR_PROJECTS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        assignments: { "/tmp/repo": "highlight" },
        order: { highlight: ["/tmp/repo"] },
        collapsed: {},
      })
    );
    const view = renderRail({
      sessions: [{ ...session("highlight", "Highlighted task"), pinned: true }],
      archivedSessions: [session("archived", "Archived task")],
    });

    const recent = view.container.querySelector(
      '[data-rail-section-label="recent"]'
    );
    const project = view.container.querySelector(
      "[data-rail-project-switcher]"
    );
    const highlight = view.container.querySelector(
      '[data-task-section-toggle="highlight"]'
    );
    const archived = view.container.querySelector("[data-rail-archive-toggle]");

    expect(recent).toBeNull();
    expect(project).toBeNull();
    expect(view.container.querySelector("[data-new-task-section]")).toBeNull();

    for (const label of [highlight, archived]) {
      expect(label?.className).toContain("text-body");
      expect(label?.className).toContain("font-normal");
      expect(label?.className).toContain("text-foreground/55");
      expect(label?.className).toContain("px-surface-inset");
      expect(label?.className).not.toContain("px-4");
      expect(label?.className).not.toContain("font-medium");
      expect(label?.className).not.toContain("uppercase");
      expect(label?.className).not.toContain("tracking-");
    }
    expect(highlight?.children[0]?.textContent).toBe("Highlight");
    expect(highlight?.children[1]?.tagName).toBe("svg");
    expect(
      view.container.querySelector(
        '[data-task-section-content="highlight"] [data-project-group="/tmp/repo"]'
      )
    ).toBeTruthy();
    expect(
      view.container.querySelector('[data-task-section-actions="highlight"]')
    ).toBeTruthy();
    expect(
      view.container.querySelector(
        '[data-task-section-toggle="system:highlight"]'
      )
    ).toBeNull();
    expect(archived?.children[0]?.textContent).toBe("Archived");
    expect(archived?.children[1]?.tagName).toBe("svg");

    click(
      view.container.querySelector('[data-task-section-actions="highlight"]')
    );
    await waitFor(() => {
      const menu = dom.document.body.querySelector('[role="menu"]');
      expect(menu?.textContent).toContain("Edit section");
      expect(menu?.textContent).toContain("Archive all tasks");
      expect(menu?.textContent).toContain("Delete section");
    });

    view.unmount();
  });

  test("shows a recent conversation between the title and workspace only when it is useful", () => {
    activateDom();
    const view = renderRail();
    const punctuation = view.container.querySelector(
      '[data-session-id="punctuation"]'
    );
    const meaningful = view.container.querySelector(
      '[data-session-id="meaningful"]'
    );

    expect(punctuation?.querySelectorAll("[data-session-line]")).toHaveLength(
      2
    );
    expect(
      punctuation?.querySelector('[data-session-line="preview"]')
    ).toBeNull();
    expect(punctuation?.getAttribute("title")).toBeNull();

    expect(meaningful?.querySelectorAll("[data-session-line]")).toHaveLength(3);
    expect(
      meaningful?.querySelector('[data-session-line="preview"]')?.textContent
    ).toBe("A useful preview");
    expect(
      meaningful?.querySelector('[data-session-line="preview"]')?.className
    ).toContain("truncate");
    expect(
      meaningful
        ?.querySelector("[data-session-select]")
        ?.getAttribute("aria-describedby")
    ).toBe("session-preview-meaningful");
    expect(meaningful?.getAttribute("title")).toBe("A useful preview");

    for (const row of [punctuation, meaningful]) {
      const workspace = row?.querySelector('[data-session-line="workspace"]');
      expect(
        view.container.querySelector('[data-project-toggle="/tmp/repo"]')
          ?.textContent
      ).toContain("repo");
      expect(workspace?.firstElementChild?.textContent).toBe("");
      expect(
        workspace?.querySelector('[data-session-checkout-kind="checkout"]')
      ).toBeTruthy();
      expect(workspace?.querySelector("svg")).toBeTruthy();
      expect(row?.querySelector('[data-session-line="provider"]')).toBeNull();
      expect(row?.querySelector("[data-session-status]")).toBeNull();
      expect(row?.querySelector("[data-session-actions]")?.className).toContain(
        "hidden"
      );
      expect(row?.querySelector("[data-session-actions]")?.className).toContain(
        "group-hover:flex"
      );
      expect(row?.querySelector("[data-session-actions]")?.className).toContain(
        "group-focus-within:flex"
      );
    }

    const meaningfulLines = Array.from(
      meaningful?.querySelectorAll("[data-session-line]") ?? []
    ).map((line) => line.getAttribute("data-session-line"));
    expect(meaningfulLines).toEqual(["title", "preview", "workspace"]);

    view.unmount();
  });

  test("keeps provider identity accessible without adding provider branding to the row", () => {
    activateDom();
    const openCodeSession = {
      ...session("opencode", "OpenCode task"),
      provider: "opencode2",
    };
    const view = renderRail({
      sessions: [openCodeSession],
      activeSession: openCodeSession.id,
      previews: {},
      displayProvider: () => "OpenCode 2 (Beta)",
    });
    const row = view.container.querySelector('[data-session-id="opencode"]');

    expect(row?.textContent).not.toContain("OpenCode 2 (Beta)");
    expect(
      row?.querySelector("[data-session-select]")?.getAttribute("aria-label")
    ).toContain("OpenCode 2 (Beta)");
    expect(row?.querySelectorAll("[data-session-line]")).toHaveLength(2);

    view.unmount();
  });

  test("shows regular checkout/worktree provenance and the linked PR outcome", async () => {
    activateDom();
    const regular = session("regular", "Regular checkout");
    const isolated = {
      ...session("isolated", "Isolated worktree"),
      cwd: "/tmp/repo-worktree",
      worktree_path: "/tmp/repo-worktree",
      last_active_at: Date.now() + 1,
    };
    const loadPullRequest = async (path: string) => ({
      number: path.endsWith("worktree") ? 84 : 83,
      title: "Sidebar status",
      url: `https://github.com/example/repo/pull/${path.endsWith("worktree") ? 84 : 83}`,
      state: path.endsWith("worktree") ? "MERGED" : "OPEN",
      is_draft: false,
      head_ref: "feature",
      base_ref: "main",
      additions: 1,
      deletions: 0,
      changed_files: 1,
      body: "",
      review_decision: null,
      mergeable: "MERGEABLE",
      merge_state_status: "CLEAN",
      author: "author",
      comments_count: 0,
      reviews_count: 0,
      checks: path.endsWith("worktree")
        ? []
        : [
            {
              name: "test",
              status: "COMPLETED",
              conclusion: "FAILURE",
              details_url: null,
              workflow_name: null,
            },
          ],
      created_at: "2026-08-31T00:00:00Z",
      updated_at: "2026-08-31T00:00:00Z",
    });
    const view = renderRail({
      sessions: [regular, isolated],
      previews: {},
      activeSession: null,
      loadPullRequest,
    });

    expect(
      view.container.querySelector(
        '[data-session-id="isolated"] [data-session-checkout-kind="worktree"]'
      )?.textContent
    ).toContain("Worktree");
    expect(
      view.container.querySelector(
        '[data-session-id="regular"] [data-session-checkout-kind="checkout"]'
      )?.textContent
    ).toContain("Checkout");

    await waitFor(() => {
      expect(
        view.container.querySelector(
          '[data-session-id="isolated"] [data-session-pull-request="merged"]'
        )?.textContent
      ).toContain("#84 Merged");
      expect(
        view.container.querySelector(
          '[data-session-id="regular"] [data-session-pull-request="ci_failed"]'
        )?.textContent
      ).toContain("#83 CI failed");
    });

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

    expect(row?.querySelectorAll("[data-session-line]")).toHaveLength(2);
    expect(row?.querySelector('[data-session-line="preview"]')).toBeNull();
    expect(row?.querySelector("#session-preview-echo")).toBeNull();
    expect(
      row
        ?.querySelector("[data-session-select]")
        ?.getAttribute("aria-describedby")
    ).toBeNull();
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
    const running = view.container.querySelector(
      '[data-session-id="meaningful"]'
    );
    const runningOrb = running?.querySelector("[data-session-status] canvas");
    const quotaOrb = view.container.querySelector(
      '[data-rail-feature="usage"] canvas[data-activity-state="searching"]'
    );

    expect(runningOrb?.getAttribute("data-activity-state")).toBe("working");
    expect(runningOrb?.style.width).toBe("14px");
    expect(
      running
        ?.querySelector("[data-session-status]")
        ?.getAttribute("aria-label")
    ).toBe("Working");
    expect(
      view.container.querySelector(
        '[data-session-id="punctuation"] [data-session-status]'
      )
    ).toBeNull();
    expect(quotaOrb?.style.width).toBe("14px");
    expect(
      view.container
        .querySelector(
          '[data-rail-feature="usage"] [data-slot="rail-utility-button"]'
        )
        ?.getAttribute("aria-busy")
    ).toBe("true");

    view.unmount();
  });

  test("keeps awaiting-input and failed states visible without restoring routine status copy", () => {
    activateDom();
    const awaiting = {
      ...session("awaiting", "Awaiting task"),
      activity: {
        revision: 2,
        state: { kind: "awaiting_input", turn_id: "turn-1", pending: [] },
      },
    };
    const failed = {
      ...session("failed", "Failed task"),
      activity: {
        revision: 2,
        state: {
          kind: "failed",
          turn_id: "turn-2",
          reason: "provider_error",
          message: "Provider stopped",
        },
      },
    };
    const view = renderRail({
      sessions: [awaiting, failed],
      activeSession: null,
      previews: {},
    });
    const awaitingStatus = view.container.querySelector(
      '[data-session-id="awaiting"] [data-session-status]'
    );
    const failedStatus = view.container.querySelector(
      '[data-session-id="failed"] [data-session-status]'
    );

    expect(awaitingStatus?.getAttribute("aria-label")).toBe("Awaiting input");
    expect(awaitingStatus?.className).toContain("text-warning");
    expect(awaitingStatus?.querySelector(".bg-warning")).toBeTruthy();
    expect(failedStatus?.getAttribute("aria-label")).toBe("Failed");
    expect(failedStatus?.getAttribute("title")).toBe("Provider stopped");
    expect(failedStatus?.className).toContain("text-destructive");
    expect(
      view.container.querySelectorAll('[data-session-line="workspace"]')
    ).toHaveLength(2);

    view.unmount();
  });

  test("uses compact spacing and exposes real session actions on right click", async () => {
    activateDom();
    const view = renderRail();
    const row = view.container.querySelector('[data-session-id="meaningful"]');
    const activeRow = view.container.querySelector(
      '[data-session-id="punctuation"]'
    );

    expect(row?.getAttribute("data-session-density")).toBe("compact");
    expect(row?.parentElement?.className).toContain("gap-0.5");
    expect(activeRow?.className).toContain("bg-fill-hover");
    expect(activeRow?.className).toContain("rounded-control");
    expect(activeRow?.className.split(/\s+/)).not.toContain("bg-accent");
    expect(row?.className).toContain("hover:bg-fill-quiet");
    expect(row?.className).toContain("focus-within:bg-fill-quiet");
    expect(
      row
        ?.querySelector("[data-session-actions]")
        ?.querySelector('button[aria-label="Pin"]')
    ).toBeTruthy();

    row?.dispatchEvent(
      new dom.window.MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 120,
        clientY: 80,
      })
    );

    await waitFor(() => {
      expect(dom.document.body.textContent).toContain("Copy session ID");
      expect(dom.document.body.textContent).toContain(
        "Reveal working directory"
      );
    });

    const renameItem = [
      ...dom.document.body.querySelectorAll('[role="menuitem"]'),
    ].find((item) => item.textContent?.trim() === "Rename");
    expect(renameItem).toBeTruthy();
    click(renameItem);
    await waitFor(() => {
      expect(
        view.container.querySelector('input[value="Meaningful"]')
      ).toBeTruthy();
    });

    view.unmount();
  });

  test("finishes the archive exit before moving a session", async () => {
    activateDom();
    const archived = [];
    const view = renderRail({
      onArchive: (id, value) => archived.push([id, value]),
    });
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
    const first = view.container.querySelector(
      '[data-session-id="punctuation"]'
    );
    const second = view.container.querySelector(
      '[data-session-id="meaningful"]'
    );
    const firstSelect = first?.querySelector("[data-session-select]");
    const secondSelect = second?.querySelector("[data-session-select]");

    expect(firstSelect?.getAttribute("aria-current")).toBe("page");
    expect(firstSelect?.getAttribute("tabindex")).toBe("0");
    expect(first?.getAttribute("role")).toBeNull();

    firstSelect.focus();
    firstSelect.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    expect(selected).toEqual(["punctuation"]);

    firstSelect.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
      })
    );
    expect(dom.document.activeElement).toBe(secondSelect);

    secondSelect.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "F10",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    await waitFor(() => {
      expect(dom.document.body.textContent).toContain("Copy session ID");
    });

    view.unmount();
  });

  test("switches session tabs with an immediate row-local selection surface", () => {
    activateDom();
    const view = renderRail();
    const list = view.container.querySelector("[data-session-list]");
    const activeRow = view.container.querySelector(
      '[data-session-id="punctuation"]'
    );
    const inactiveRow = view.container.querySelector(
      '[data-session-id="meaningful"]'
    );

    expect(list?.getAttribute("data-session-selection")).toBe("instant");
    expect(activeRow?.className.split(/\s+/)).toContain("bg-fill-hover");
    expect(activeRow?.className).not.toContain("transition-[background-color");
    expect(inactiveRow?.className.split(/\s+/)).not.toContain("bg-fill-hover");

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
      })
    );
    await waitFor(() => {
      expect(dom.document.body.textContent).toContain("Copy session ID");
    });

    const copyItem = [
      ...dom.document.body.querySelectorAll('[role="menuitem"]'),
    ].find((item) => item.textContent?.trim() === "Copy session ID");
    expect(copyItem).toBeTruthy();
    click(copyItem);

    await waitFor(() => {
      expect(copied).toEqual(["meaningful"]);
      expect(dom.document.body.textContent).toContain("Session ID copied.");
    });

    view.unmount();
  });
});
