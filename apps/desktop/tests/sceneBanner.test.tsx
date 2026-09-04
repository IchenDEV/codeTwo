// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, click, dom, mount, restoreDom } from "./domTestHarness";

activateDom();
const { SceneBanner, sceneBannerFromEvent, resolveSceneReference } =
  await import("../src/session/SceneBanner");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function sceneInfo(overrides = {}) {
  return {
    reference: "builtin:test",
    name: "test",
    title: "Test",
    description: "",
    icon: null,
    source: "builtin",
    keywords: [],
    has_brief: false,
    localizations: {},
    artifacts: [],
    ...overrides,
  };
}

const SCENES = [
  sceneInfo({
    exit: {
      next: [
        { scene: "fix", label: null, carry: ["test-report"] },
        { scene: "missing-scene", label: null, carry: [] },
      ],
    },
  }),
  sceneInfo({ reference: "builtin:fix", name: "fix", title: "Fix" }),
];

function suggestionBanner(overrides = {}) {
  return {
    session: "s1",
    sceneRef: "builtin:test",
    stateKey: "tool-1",
    kind: "suggest_scene",
    targetScene: "fix",
    carry: [],
    message: null,
    unverified: [],
    ...overrides,
  };
}

function renderBanner(banner, handlers = {}) {
  return mount(
    <I18nProvider>
      <SceneBanner
        banner={banner}
        scenes={SCENES}
        onApplyScene={handlers.onApplyScene ?? (() => {})}
        onDismiss={handlers.onDismiss ?? (() => {})}
      />
    </I18nProvider>
  );
}

function buttons(rendered) {
  return [...rendered.container.querySelectorAll("button")];
}

describe("sceneBannerFromEvent", () => {
  test("maps exit_criteria_met to a complete banner", () => {
    const banner = sceneBannerFromEvent({
      event: "exit_criteria_met",
      session: "s1",
      scene_ref: "builtin:test",
      satisfied: ["required_artifacts"],
      unverified: ["docs updated"],
      state_key: "required_artifacts:test-report@1,user_confirm",
    });
    expect(banner.kind).toBe("complete");
    expect(banner.session).toBe("s1");
    expect(banner.stateKey).toBe(
      "required_artifacts:test-report@1,user_confirm"
    );
    expect(banner.unverified).toEqual(["docs updated"]);
  });

  test("maps hook suggestions and rejects unknown kinds", () => {
    const banner = sceneBannerFromEvent({
      event: "hook_suggestion",
      session: "s1",
      scene_ref: "builtin:test",
      on: "tests_failed",
      kind: "suggest_scene",
      target_scene: "fix",
      state_key: "tool-1",
    });
    expect(banner.kind).toBe("suggest_scene");
    expect(banner.targetScene).toBe("fix");
    expect(banner.carry).toEqual([]);

    expect(
      sceneBannerFromEvent({
        event: "hook_suggestion",
        session: "s1",
        scene_ref: "builtin:test",
        on: "enter",
        kind: "run_macro",
        state_key: "x",
      })
    ).toBeNull();
  });
});

describe("resolveSceneReference", () => {
  test("resolves pinned references and bare names, degrading to null", () => {
    expect(resolveSceneReference(SCENES, "builtin:fix").name).toBe("fix");
    expect(resolveSceneReference(SCENES, "fix").reference).toBe("builtin:fix");
    expect(resolveSceneReference(SCENES, "nope")).toBeNull();
  });
});

describe("SceneBanner", () => {
  test("renders a suggestion with a start button that applies the resolved scene", () => {
    const applied = [];
    const rendered = renderBanner(suggestionBanner(), {
      onApplyScene: (reference) => applied.push(reference),
    });
    const start = buttons(rendered).find((el) =>
      el.textContent?.includes("Fix")
    );
    expect(start).toBeTruthy();
    click(start);
    expect(applied).toEqual(["builtin:fix"]);
  });

  test("dismiss wiring fires the handler", () => {
    const dismissed = [];
    const rendered = renderBanner(suggestionBanner(), {
      onDismiss: () => dismissed.push(true),
    });
    const dismiss = buttons(rendered).find(
      (el) => el.getAttribute("aria-label") && el.textContent?.trim() === ""
    );
    expect(dismiss).toBeTruthy();
    click(dismiss);
    expect(dismissed).toEqual([true]);
  });

  test("notify banners render message-only, without action buttons", () => {
    const rendered = renderBanner(
      suggestionBanner({
        kind: "notify",
        targetScene: null,
        message: "tests are red",
      })
    );
    expect(rendered.container.textContent).toContain("tests are red");
    // Only the dismiss control remains.
    expect(buttons(rendered)).toHaveLength(1);
  });

  test("complete banners offer the active scene's next suggestions, skipping unresolvable ones", () => {
    const applied = [];
    const rendered = renderBanner(
      suggestionBanner({
        kind: "complete",
        targetScene: null,
        unverified: ["manual check"],
      }),
      { onApplyScene: (reference) => applied.push(reference) }
    );
    expect(rendered.container.textContent).toContain("manual check");
    const next = buttons(rendered).filter(
      (el) => el.textContent?.trim() !== ""
    );
    // `missing-scene` resolves to nothing and is skipped; only `fix` renders.
    expect(next).toHaveLength(1);
    click(next[0]);
    expect(applied).toEqual(["builtin:fix"]);
  });
});
