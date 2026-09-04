import { describe, expect, test } from "bun:test";

import type { SceneDocument, SceneInfo } from "../src/session/scene";
import {
  sceneSchemaId,
  createSceneDocument,
  duplicateSceneDocument,
  formatSceneJson,
  parseSceneJson,
  splitSceneList,
  validateSceneDocument,
} from "../src/session/sceneEditorModel";

function info(name: string): SceneInfo {
  return {
    reference: `user:${name}`,
    name,
    title: name,
    description: "",
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
  };
}

function validScene(): SceneDocument {
  return {
    $schema: sceneSchemaId,
    name: "release-review",
    title: "Release review",
    brief: {
      template: "Review {{target}}",
      slots: [{ id: "target", label: "Target", kind: "text", required: true }],
    },
    artifacts: [
      { id: "report", title: "Review report", kind: "report", required: true },
    ],
    exit: {
      criteria: [{ kind: "required_artifacts" }, { kind: "user_confirm" }],
    },
  };
}

describe("scene editor draft helpers", () => {
  test("creates and duplicates collision-free editable documents", () => {
    const scenes = [info("custom-scene"), info("research-copy")];
    expect(createSceneDocument(scenes).name).toBe("custom-scene-2");

    const copy = duplicateSceneDocument(
      { ...validScene(), name: "research", title: "Research" },
      scenes
    );
    expect(copy.name).toBe("research-copy-2");
    expect(copy.title).toBe("Research copy");
    expect(copy.$schema).toBe(sceneSchemaId);
  });

  test("validates nested slots, artifacts, criteria, and hooks", () => {
    const scene = validScene();
    scene.name = "../escape";
    scene.brief!.slots = [
      { id: "bad_slot", label: "", kind: "select", options: [] },
      { id: "bad_slot", label: "Duplicate", kind: "text" },
    ];
    scene.artifacts = [
      { id: "bad.id", title: "", kind: "custom" },
      { id: "bad.id", title: "Duplicate", kind: "custom" },
    ];
    scene.exit = {
      criteria: [{ kind: "checklist_complete" }, { kind: "custom" }],
    };
    scene.hooks = [
      {
        on: "schedule",
        schedule: "not cron",
        action: { kind: "notify", message: "" },
      },
    ];

    const keys = validateSceneDocument(scene).map((issue) => issue.key);
    expect(keys).toContain("sceneEditor.errorName");
    expect(keys).toContain("sceneEditor.errorSlotId");
    expect(keys).toContain("sceneEditor.errorSlotOptions");
    expect(keys).toContain("sceneEditor.errorArtifactId");
    expect(keys).toContain("sceneEditor.errorChecklistArtifact");
    expect(keys).toContain("sceneEditor.errorCustomCriterion");
    expect(keys).toContain("sceneEditor.errorSchedule");
    expect(keys).toContain("sceneEditor.errorHookMessage");
  });

  test("round-trips the lossless advanced JSON editor", () => {
    const scene = validScene();
    scene.extensions = { "dev.codetwo": { arbitrary: [1, 2, 3] } };
    const raw = formatSceneJson(scene);
    expect(parseSceneJson(raw)).toEqual({ scene, error: null });
    expect(parseSceneJson("{").scene).toBeNull();
    expect(splitSceneList("codex, claude\n reviewer ")).toEqual([
      "codex",
      "claude",
      "reviewer",
    ]);
  });
});
