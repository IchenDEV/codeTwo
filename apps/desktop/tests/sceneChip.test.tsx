// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, dom, mount, restoreDom } from "./domTestHarness";

activateDom();
const { SceneChip, SourceBadge } = await import("../src/session/SceneChip");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function sceneInfo(overrides = {}) {
  return {
    reference: "builtin:develop",
    name: "develop",
    title: "Develop",
    description: "Plan-first implementation",
    icon: "🛠️",
    source: "builtin",
    keywords: [],
    has_brief: true,
    localizations: {},
    artifacts: [],
    execution: { session_mode: "auto_edit" },
    ...overrides,
  };
}

function config(overrides = {}) {
  return {
    providers: [],
    provider: "claude_code",
    onProvider: () => {},
    mode: "ask",
    sandbox: "workspace_write",
    modeChangeDisabled: false,
    onSessionMode: () => true,
    worktreeBase: null,
    activeWorktreeBaseline: null,
    activeWorktreeUnknown: false,
    worktreeOptions: [],
    worktreeOptionsLoading: false,
    onWorktreeBase: () => {},
    planMode: false,
    onPlan: () => {},
    memoryRead: "inherit",
    memoryWrite: "inherit",
    onMemoryPolicy: () => {},
    hasSession: false,
    scenes: [sceneInfo()],
    activeScene: sceneInfo(),
    onScene: () => {},
    sceneCustomized: false,
    scenePendingFields: [],
    onRestartInScene: () => {},
    ...overrides,
  };
}

function renderChip(cfg) {
  return mount(
    <I18nProvider>
      <SceneChip
        config={cfg}
        models={[]}
        currentModel={null}
        defaultModel={null}
        onModel={() => {}}
        configOptions={[]}
        onConfigOption={() => {}}
      />
    </I18nProvider>,
  );
}

describe("SceneChip", () => {
  test("shows the active scene's title on the chip", () => {
    activateDom();
    const rendered = renderChip(config());
    expect(rendered.container.textContent).toContain("Develop");
  });

  test("falls back to the no-scene label", () => {
    activateDom();
    const rendered = renderChip(config({ activeScene: null }));
    expect(rendered.container.textContent).toContain("No scene");
  });

  test("marks a customized scene", () => {
    activateDom();
    const rendered = renderChip(config({ sceneCustomized: true }));
    expect(rendered.container.querySelector('[aria-label="Customized"]')).toBeTruthy();
  });

  test("marks a partial soft-apply", () => {
    activateDom();
    const rendered = renderChip(config({ scenePendingFields: ["model", "worktree"] }));
    expect(rendered.container.querySelector('[aria-label="Partially applied"]')).toBeTruthy();
  });
});

describe("SourceBadge", () => {
  test("names each source", () => {
    activateDom();
    const rendered = mount(
      <I18nProvider>
        <SourceBadge source="project" />
      </I18nProvider>,
    );
    expect(rendered.container.textContent).toBe("Project");
  });
});
