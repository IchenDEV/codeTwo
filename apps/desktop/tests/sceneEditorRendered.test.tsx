// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { act as reactAct } from "react";

import {
  activateDom,
  button,
  dom,
  flush,
  mount,
  restoreDom,
} from "./domTestHarness";

activateDom();
const { SceneEditor } = await import("../src/session/SceneEditor.tsx");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function info(overrides = {}) {
  return {
    reference: "user:review",
    name: "review",
    title: "Review",
    description: "Review a change",
    icon: null,
    source: "user",
    plugin_id: null,
    keywords: [],
    has_brief: false,
    localizations: {},
    execution: null,
    brief: null,
    artifacts: [],
    skills: null,
    exit: null,
    ...overrides,
  };
}

function renderEditor(props = {}) {
  return mount(
    <I18nProvider>
      <SceneEditor
        request={{ kind: "create" }}
        scenes={[]}
        providers={[
          {
            id: "codex",
            display_name: "Codex",
            available: true,
            needs_node: false,
            models: [],
            capabilities: [],
          },
        ]}
        skills={[
          {
            id: "reviewer",
            name: "Reviewer",
            description: "",
            icon: null,
            kind: "fragment",
            source: null,
          },
        ]}
        cwd="/tmp/project"
        onSaved={() => {}}
        onDeleted={() => {}}
        onClose={() => {}}
        {...props}
      />
    </I18nProvider>
  );
}

function containsOne(value, alternatives) {
  expect(alternatives.some((candidate) => value.includes(candidate))).toBe(
    true
  );
}

function buttonOne(container, alternatives) {
  for (const name of alternatives) {
    try {
      return button(container, name);
    } catch {
      // Bun module mocks can leak a key-echoing useT implementation across test files.
    }
  }
  throw new Error(`button not found: ${alternatives.join(" or ")}`);
}

describe("SceneEditor rendered", () => {
  test("renders the complete editor navigation and saves a structured custom scene", async () => {
    activateDom();
    let captured = null;
    const rendered = renderEditor({
      saveScene: async (scope, cwd, previousName, scene) => {
        captured = { scope, cwd, previousName, scene };
        return info({
          reference: `${scope}:${scene.name}`,
          name: scene.name,
          title: scene.title,
          description: scene.description ?? "",
          source: scope,
        });
      },
    });
    await flush();

    const text = dom.document.body.textContent ?? "";
    containsOne(text, ["Basics", "sceneEditor.tab.identity"]);
    containsOne(text, ["Execution", "sceneEditor.tab.execution"]);
    containsOne(text, ["Skills & rules", "sceneEditor.tab.skills"]);
    containsOne(text, ["Task brief", "sceneEditor.tab.brief"]);
    containsOne(text, ["Outputs", "sceneEditor.tab.outputs"]);
    containsOne(text, ["Automation", "sceneEditor.tab.automation"]);
    containsOne(text, ["Full JSON", "sceneEditor.tab.json"]);
    expect(
      dom.document.body.querySelector('[data-slot="dialog-content"]')
    ).toBeNull();
    expect(
      dom.document.body
        .querySelector('[data-slot="tabs"]')
        ?.getAttribute("data-orientation")
    ).toBe("horizontal");
    expect(
      dom.document.body.querySelector('[data-slot="tabs"]')?.className
    ).toContain("flex-col");
    expect(
      dom.document.body.querySelector('[data-slot="tabs-list"]')?.className
    ).not.toContain("w-40");

    const title = dom.document.body.querySelector("#scene-title");
    await reactAct(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value"
      ).set;
      setValue.call(title, "Release readiness");
      title.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      title.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await reactAct(async () => {
      buttonOne(dom.document.body, ["Save scene", "sceneEditor.save"]).click();
      await Promise.resolve();
    });

    expect(captured.scope).toBe("user");
    expect(captured.cwd).toBe("/tmp/project");
    expect(captured.previousName).toBeNull();
    expect(captured.scene.title).toBe("Release readiness");
    expect(captured.scene.$schema).toContain("agent-scenes.org/schemas/1.0.0");
    rendered.unmount();
  });

  test("duplicates an immutable scene into an editable lossless document", async () => {
    activateDom();
    const source = info({ reference: "builtin:review", source: "builtin" });
    const rendered = renderEditor({
      request: { kind: "duplicate", scene: source },
      scenes: [source],
      getScene: async () => ({
        reference: source.reference,
        source: "builtin",
        scene: {
          $schema: "https://agent-scenes.org/schemas/1.0.0/scene.schema.json",
          name: "review",
          title: "Review",
          extensions: { "dev.codetwo": { retained: true } },
        },
      }),
    });
    await reactAct(async () => {
      await Promise.resolve();
    });
    await flush();

    expect(dom.document.body.querySelector("#scene-name")?.value).toBe(
      "review-copy"
    );
    expect(dom.document.body.querySelector("#scene-title")?.value).toBe(
      "Review copy"
    );
    containsOne(dom.document.body.textContent ?? "", [
      "Duplicate scene",
      "sceneEditor.duplicateTitle",
    ]);
    rendered.unmount();
  });
});
