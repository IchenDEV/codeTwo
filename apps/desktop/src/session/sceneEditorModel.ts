import { assertIpcResult } from "../lib/ipcResult";
import type {
  SceneDocument,
  SceneExitCriterion,
  SceneHook,
  SceneInfo,
} from "./scene";

/**
Frozen schema id shared by structured and raw-JSON editing.
*/
export const sceneSchemaId =
  "https://agent-scenes.org/schemas/1.0.0/scene.schema.json";

const slugPattern = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u;
const artifactPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;

export interface SceneDraftIssue {
  field: string;
  key: string;
  vars?: Record<string, string | number>;
}

export function splitSceneList(value: string): string[] {
  return value
    .split(/[\n,]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function joinSceneList(value: readonly string[] | undefined): string {
  return (value ?? []).join(", ");
}

export function slugSceneName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9.-]+/gu, "-")
    .replaceAll(/-{2,}/gu, "-")
    .replaceAll(/\.{2,}/gu, ".")
    .replaceAll(/^[^a-z0-9]+|[^a-z0-9]+$/gu, "")
    .slice(0, 64);
}

function nextAvailableName(
  base: string,
  existing: ReadonlySet<string>
): string {
  const seed = slugSceneName(base) || "custom-scene";
  if (!existing.has(seed)) {
    return seed;
  }
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${seed}-${suffix}`.slice(0, 64).replace(/-$/u, "");
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
  return `custom-${Date.now()}`;
}

export function createSceneDocument(
  existingScenes: readonly SceneInfo[]
): SceneDocument {
  const existing = new Set(existingScenes.map((scene) => scene.name));
  return {
    $schema: sceneSchemaId,
    artifacts: [],
    constraints: { guardrails: [], tools: { allow: [], deny: [] } },
    description: "",
    execution: {},
    extensions: {},
    hooks: [],
    keywords: [],
    localizations: {},
    name: nextAvailableName("custom-scene", existing),
    skills: { inline: [], pinned: [], suppress_unpinned: false },
    title: "New scene",
    version: "1.0.0",
  };
}

export function duplicateSceneDocument(
  source: SceneDocument,
  existingScenes: readonly SceneInfo[]
): SceneDocument {
  const copy = structuredClone(source);
  const existing = new Set(existingScenes.map((scene) => scene.name));
  copy.$schema = sceneSchemaId;
  copy.name = nextAvailableName(`${source.name}-copy`, existing);
  copy.title = `${source.title} copy`;
  return copy;
}

export function defaultExitCriterion(): SceneExitCriterion {
  return { kind: "required_artifacts" };
}

export function defaultSceneHook(): SceneHook {
  return { action: { kind: "notify", message: "" }, on: "turn_end" };
}

export function validateSceneDocument(scene: SceneDocument): SceneDraftIssue[] {
  const issues: SceneDraftIssue[] = [];
  if (scene.$schema !== sceneSchemaId) {
    issues.push({ field: "$schema", key: "sceneEditor.errorSchema" });
  }
  if (!slugPattern.test(scene.name) || scene.name.length > 64) {
    issues.push({ field: "name", key: "sceneEditor.errorName" });
  }
  if (!scene.title.trim()) {
    issues.push({ field: "title", key: "sceneEditor.errorTitle" });
  } else if (scene.title.length > 80) {
    issues.push({ field: "title", key: "sceneEditor.errorTitleLength" });
  }

  const slotIds = new Set<string>();
  if (scene.brief) {
    if (!scene.brief.template.trim()) {
      issues.push({
        field: "brief.template",
        key: "sceneEditor.errorBriefTemplate",
      });
    }
    for (const [index, slot] of (scene.brief.slots ?? []).entries()) {
      if (!slugPattern.test(slot.id) || slot.id.length > 64) {
        issues.push({
          field: `brief.slots.${index}.id`,
          key: "sceneEditor.errorSlotId",
          vars: { index: index + 1 },
        });
      } else if (slotIds.has(slot.id)) {
        issues.push({
          field: `brief.slots.${index}.id`,
          key: "sceneEditor.errorSlotDuplicate",
          vars: { id: slot.id },
        });
      }
      slotIds.add(slot.id);
      if (!slot.label.trim()) {
        issues.push({
          field: `brief.slots.${index}.label`,
          key: "sceneEditor.errorSlotLabel",
          vars: { index: index + 1 },
        });
      }
      if (slot.kind === "select" && (slot.options ?? []).length === 0) {
        issues.push({
          field: `brief.slots.${index}.options`,
          key: "sceneEditor.errorSlotOptions",
          vars: { id: slot.id || index + 1 },
        });
      }
    }
  }

  const artifactIds = new Set<string>();
  for (const [index, artifact] of (scene.artifacts ?? []).entries()) {
    if (!artifactPattern.test(artifact.id) || artifact.id.length > 64) {
      issues.push({
        field: `artifacts.${index}.id`,
        key: "sceneEditor.errorArtifactId",
        vars: { index: index + 1 },
      });
    } else if (artifactIds.has(artifact.id)) {
      issues.push({
        field: `artifacts.${index}.id`,
        key: "sceneEditor.errorArtifactDuplicate",
        vars: { id: artifact.id },
      });
    }
    artifactIds.add(artifact.id);
    if (!artifact.title.trim()) {
      issues.push({
        field: `artifacts.${index}.title`,
        key: "sceneEditor.errorArtifactTitle",
        vars: { index: index + 1 },
      });
    }
  }

  for (const [index, criterion] of (scene.exit?.criteria ?? []).entries()) {
    if (
      criterion.kind === "checklist_complete" &&
      (criterion.artifact == null || criterion.artifact === "")
    ) {
      issues.push({
        field: `exit.criteria.${index}.artifact`,
        key: "sceneEditor.errorChecklistArtifact",
      });
    }
    if (
      criterion.kind === "custom" &&
      (criterion.description?.trim() ?? "") === ""
    ) {
      issues.push({
        field: `exit.criteria.${index}.description`,
        key: "sceneEditor.errorCustomCriterion",
      });
    }
  }

  for (const [index, hook] of (scene.hooks ?? []).entries()) {
    if (
      hook.on === "schedule" &&
      hook.schedule?.trim().split(/\s+/u).length !== 5
    ) {
      issues.push({
        field: `hooks.${index}.schedule`,
        key: "sceneEditor.errorSchedule",
      });
    }
    if (
      hook.action.kind === "suggest_scene" &&
      (hook.action.scene?.trim() ?? "") === ""
    ) {
      issues.push({
        field: `hooks.${index}.action.scene`,
        key: "sceneEditor.errorHookScene",
      });
    }
    if (
      hook.action.kind === "run_macro" &&
      (hook.action.macro?.trim() ?? "") === ""
    ) {
      issues.push({
        field: `hooks.${index}.action.macro`,
        key: "sceneEditor.errorHookMacro",
      });
    }
    if (
      hook.action.kind === "notify" &&
      (hook.action.message?.trim() ?? "") === ""
    ) {
      issues.push({
        field: `hooks.${index}.action.message`,
        key: "sceneEditor.errorHookMessage",
      });
    }
  }
  return issues;
}

export function parseSceneJson(value: string): {
  scene: SceneDocument | null;
  error: string | null;
} {
  try {
    const scene = assertIpcResult<SceneDocument>(JSON.parse(value) as unknown);
    return { error: null, scene };
  } catch (error) {
    return {
      error: Error.isError(error) ? error.message : String(error),
      scene: null,
    };
  }
}

export function formatSceneJson(scene: SceneDocument): string {
  return `${JSON.stringify(scene, null, 2)}\n`;
}
