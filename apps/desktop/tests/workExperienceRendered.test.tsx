// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import {
  activateDom,
  button,
  click,
  dom,
  flush,
  mount,
  restoreDom,
  text,
  waitFor,
} from "./domTestHarness";

activateDom();
const {
  WorkInspector,
  WorkTaskRail,
  useWorkExperience,
} = await import("../src/work/WorkExperience");
const { modelPickerAvailable } = await import("../src/session/Composer");
const { TooltipProvider } = await import("../src/components/ui/tooltip");
const { Simulate } = await import("react-dom/test-utils");
const EMPTY_PROJECTS: never[] = [];

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("Work experience rendered behavior", () => {
  test("offers provider models before the first session exists", () => {
    const models = [{ id: "gpt-5.6-sol", name: "GPT-5.6 Sol", description: "Frontier" }];
    expect(modelPickerAvailable(false, models)).toBe(true);
    expect(modelPickerAvailable(false, [])).toBe(false);
    expect(modelPickerAvailable(true, [])).toBe(true);
  });

  test("keeps Work task state around a shared conversation surface and saves the Brief", async () => {
    activateDom();
    const now = Date.now();
    const workspace = {
      entity: {
        id: "workspace-1",
        name: "mini-game",
        root_path: "/projects/mini-game",
        kind: "external",
        created_at: now,
        updated_at: now,
      },
      revision: 1,
    };
    const task = {
      entity: {
        id: "task-1",
        workspace_id: workspace.entity.id,
        title: "Launch landing page",
        experience: "work",
        status: "active",
        current_brief_revision: null,
        created_at: now,
        updated_at: now,
        archived: false,
      },
      revision: 1,
    };
    const saved: Array<{ taskId: string; value: string; expected: number | null }> = [];
    const switched: string[] = [];
    const api = {
      listWorkspaces: async () => ({ items: [workspace], next_cursor: null, high_water: 1 }),
      ensureWorkspace: async () => workspace,
      listTasks: async () => ({ items: [task], next_cursor: null, high_water: 1 }),
      createTask: async () => task,
      renameTask: async () => task,
      getBrief: async () => null,
      saveBrief: async (taskId: string, value: string, expected: number | null) => {
        saved.push({ taskId, value, expected });
        return {
          brief: {
            entity: {
              id: "brief-1",
              task_id: taskId,
              revision: 1,
              blocks: [{ type: "text", text: value }],
              source: "desktop",
              created_at: now,
            },
            revision: 1,
          },
          task: {
            entity: { ...task.entity, current_brief_revision: 1, updated_at: now },
            revision: 2,
          },
        };
      },
      listRuns: async () => ({ items: [], next_cursor: null, high_water: 1 }),
      listDeliverables: async () => ({ items: [], next_cursor: null, high_water: 1 }),
      listChanges: async () => ({ items: [], next_cursor: null, high_water: 1 }),
    };

    function Harness() {
      const work = useWorkExperience({
        projects: EMPTY_PROJECTS,
        activeProject: null,
        onSelectProject: () => {},
        api,
      });
      return (
        <div className="flex">
          <WorkTaskRail
            work={work}
            collapsed={false}
            overlay={false}
            onToggleCollapse={() => {}}
            onExperience={(experience) => switched.push(experience)}
            onAddProject={() => {}}
            onOpenSettings={() => {}}
            provider="codex"
            providerLabel="OpenAI Codex"
            onOpenMarket={() => {}}
          />
          <main aria-label="Shared conversation">
            <p>Shared transcript and Composer</p>
            <button type="button">Model controls</button>
          </main>
          <WorkInspector
            work={work}
            open
            width={360}
            onClose={() => {}}
            onSelectRun={() => {}}
            onOpenFile={() => {}}
          />
        </div>
      );
    }

    const rendered = mount(<TooltipProvider><Harness /></TooltipProvider>);

    await waitFor(() => expect(text(dom.document.body, "Launch landing page")).toBeTruthy());
    expect(text(dom.document.body, "Shared transcript and Composer")).toBeTruthy();
    expect(button(dom.document.body, "Work").getAttribute("aria-selected")).toBe("true");
    click(button(dom.document.body, "Code"));
    expect(switched).toEqual(["code"]);

    click(button(dom.document.body, "Edit"));
    await flush();
    const textarea = dom.document.body.querySelector('textarea[aria-label="Work brief"]') as HTMLTextAreaElement;
    Simulate.change(textarea, {
      target: { value: "Ship the responsive launch page with keyboard navigation." },
    });
    await flush();
    await waitFor(() => expect(button(dom.document.body, "Save").disabled).toBe(false));
    click(button(dom.document.body, "Save"));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual({
      taskId: "task-1",
      value: "Ship the responsive launch page with keyboard navigation.",
      expected: null,
    });
    await waitFor(() => expect(text(dom.document.body, "Brief saved")).toBeTruthy());
    rendered.unmount();
  });
});
