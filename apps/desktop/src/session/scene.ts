import { SESSION_MODES, type SessionMode } from "./mode";
import type { MemoryAccess } from "../bridge";

/**
 * Agent Scenes 1.0.0 wire shapes and pure helpers (see docs/scenes.md).
 *
 * Like `mode.ts`, this file is pure logic so the binding matrix, the escalation ordering, and the
 * cycling ring can be unit-tested without a DOM or a bridge.
 */

export type SceneSource = "builtin" | "user" | "project" | "plugin";

/** One typed fill-in slot — shared vocabulary between Macro skills and scene briefs. */
export interface SceneSlotDef {
  id: string;
  label: string;
  kind: "text" | "multiline" | "select" | "file" | "artifact";
  options?: string[];
  required?: boolean;
  default?: string;
}

export interface SceneBrief {
  template: string;
  slots?: SceneSlotDef[];
  clarify?: "multi_choice" | "free_form" | "off";
}

export interface SceneArtifactDef {
  id: string;
  title: string;
  kind: "document" | "plan" | "report" | "test_report" | "checklist" | "diff" | "link" | "custom";
  required?: boolean;
  template?: string;
  description?: string;
}

export interface SceneExecution {
  providers?: string[];
  model?: string;
  reasoning_effort?: string;
  session_mode?: SessionMode;
  memory_preset?: MemoryPresetId;
  worktree?: "off" | "current" | "origin_default";
  plan_first?: boolean;
}

export interface SceneSkills {
  pinned?: string[];
  inline?: { name: string; text: string; icon?: string }[];
  suppress_unpinned?: boolean;
}

/** One resolved scene as `list_scenes` reports it. */
export interface SceneInfo {
  reference: string;
  name: string;
  title: string;
  description: string;
  icon?: string | null;
  source: SceneSource;
  plugin_id?: string | null;
  keywords: string[];
  has_brief: boolean;
  localizations: Record<string, { title?: string | null; description?: string | null }>;
  execution?: SceneExecution | null;
  brief?: SceneBrief | null;
  artifacts: SceneArtifactDef[];
  skills?: SceneSkills | null;
}

export type MemoryPresetId = "standard" | "read_only" | "private" | "learn_only";

/** Mirrors core `memory_preset_policy`, in the frontend's (read, write) vocabulary. */
export const MEMORY_PRESET_POLICY: Record<
  MemoryPresetId,
  { read: MemoryAccess; write: MemoryAccess }
> = {
  standard: { read: "inherit", write: "inherit" },
  read_only: { read: "allow", write: "deny" },
  private: { read: "deny", write: "deny" },
  learn_only: { read: "deny", write: "allow" },
};

/** The live per-session posture a scene's set fields are compared against. */
export interface LivePosture {
  mode: SessionMode;
  memoryRead: MemoryAccess;
  memoryWrite: MemoryAccess;
  planFirst: boolean;
  provider: string;
  model: string | null;
}

/** Display title for the UI locale, falling back to the authored title. */
export function sceneTitle(scene: SceneInfo, locale: string): string {
  return scene.localizations[locale]?.title ?? scene.title;
}

/**
 * Has the user overridden any field this scene sets? Unset scene fields mean "inherit" and can
 * never count as customized.
 */
export function sceneCustomized(scene: SceneInfo, live: LivePosture): boolean {
  const execution = scene.execution;
  if (!execution) return false;
  if (execution.session_mode !== undefined && execution.session_mode !== live.mode) return true;
  if (execution.memory_preset !== undefined) {
    const preset = MEMORY_PRESET_POLICY[execution.memory_preset];
    if (preset.read !== live.memoryRead || preset.write !== live.memoryWrite) return true;
  }
  if (execution.plan_first !== undefined && execution.plan_first !== live.planFirst) return true;
  if (
    execution.providers !== undefined &&
    execution.providers.length > 0 &&
    execution.providers[0] !== live.provider
  ) {
    return true;
  }
  if (execution.model !== undefined && live.model !== null && execution.model !== live.model) {
    return true;
  }
  return false;
}

/**
 * Which scene fields a soft-apply cannot honor (binding matrix, docs/scenes.md §Binding):
 * providers/model/reasoning_effort bind at session creation; worktree is immutable per session.
 * When the live value already matches, the field is not pending.
 */
export function softApplyPending(scene: SceneInfo, live: LivePosture | null): string[] {
  const execution = scene.execution;
  if (!execution) return [];
  const pending: string[] = [];
  if (execution.providers !== undefined && execution.providers.length > 0) {
    if (!live || execution.providers[0] !== live.provider) pending.push("providers");
  }
  if (execution.model !== undefined) {
    if (!live || live.model === null || execution.model !== live.model) pending.push("model");
  }
  if (execution.reasoning_effort !== undefined) pending.push("reasoning_effort");
  if (execution.worktree !== undefined) pending.push("worktree");
  return pending;
}

/**
 * Does applying this scene loosen permissions? Ordering per `SESSION_MODES` (loosest last).
 * Loosening always needs an explicit user confirmation naming both modes — never silent.
 */
export function escalationNeeded(
  scene: SceneInfo,
  currentMode: SessionMode,
): { from: SessionMode; to: SessionMode } | null {
  const target = scene.execution?.session_mode;
  if (!target) return null;
  const rank = (m: SessionMode) => SESSION_MODES.findIndex((entry) => entry.id === m);
  if (rank(target) > rank(currentMode)) return { from: currentMode, to: target };
  return null;
}

/**
 * The next scene reference for the cycle shortcut. An empty ring falls back to every resolved
 * scene in listing order. Wraps; null when there is nothing else to cycle to.
 */
export function nextSceneInRing(
  ring: readonly string[],
  scenes: readonly SceneInfo[],
  active: string | null,
): string | null {
  const order = ring.length > 0 ? ring : scenes.map((s) => s.reference);
  if (order.length === 0) return null;
  const index = active === null ? -1 : order.indexOf(active);
  const next = order[(index + 1) % order.length];
  return next === active ? null : next;
}
