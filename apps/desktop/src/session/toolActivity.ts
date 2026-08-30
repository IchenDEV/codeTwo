import type { DockSurface, DockTab } from "../dock/Dock";
import type { ArtifactRef } from "../bridge";
import type { ToolEntry, Turn } from "./turns";

/**
 * R10 dock follow (docs/archive/scenes-v1/frontend-implementation-plan.md, Item 6): map a tool call to the dock
 * surface where its effect is visible, and decide — through a pure latch reducer — whether the
 * dock may follow it. Deliberately a sibling of `agentActivity.ts`: the same conservative
 * identifier heuristics, but classifying surfaces instead of delegation, and never editing it.
 */

export interface ToolSurfaceHint {
  surface: DockSurface;
  /** The touched path for file tools, when the input names one. */
  file?: string;
}

type JsonRecord = Record<string, unknown>;

/** ACP kinds whose whole point is looking, not acting — the dock never follows a read. */
const READ_KINDS = new Set(["read", "search", "fetch", "think"]);

// Complete-token matches on normalized identifiers, exactly like agentActivity's suffix rule:
// a whole `git_commit` or `apply_patch` operation is evidence, a substring in prose is not.
const GIT_TOOL = /(?:^|_)git_(?:commit|branch|merge|status|checkout|rebase|stash|push|pull)(?:_|$)/;
const GIT_EXACT = new Set(["commit", "git_commit", "branch", "create_branch", "git_branch", "merge", "merge_branch", "git_merge", "git_status"]);

const FILE_TOOL = /(?:^|_)(?:apply_patch|str_replace|(?:edit|write|create)_file|file_(?:edit|write|create))(?:_|$)/;
const FILE_EXACT = new Set(["edit", "write", "create", "apply_patch", "multi_edit", "str_replace", "str_replace_editor", "str_replace_based_edit_tool", "notebook_edit", "text_editor"]);

const TERMINAL_TOOL = /(?:^|_)(?:bash|shell|zsh|exec|execute|terminal|cmd)(?:_|$)/;
const TERMINAL_COMMAND = /(?:^|_)(?:run|exec|shell|execute)_commands?(?:_|$)/;
// "Test-run" titles: a runner followed by `test`, or a runner whose only job is running tests.
const TEST_RUN = /(?:^|_)(?:cargo|npm|pnpm|yarn|bun|go|make|mvn|gradle|python)_tests?(?:_|$)|(?:^|_)(?:pytest|vitest|jest|ctest)(?:_|$)|(?:^|_)run_tests?(?:_|$)/;

function normalizeIdentifier(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export interface InteractiveToolPreview {
  kind: "browser" | "computer";
  title: string;
  artifact: ArtifactRef;
}

function interactiveToolKind(tool: ToolEntry): InteractiveToolPreview["kind"] | null {
  const kind = normalizeIdentifier(tool.kind);
  const title = normalizeIdentifier(tool.title);
  if (kind === "computer_use" || title === "computer_use") return "computer";
  if (
    kind === "browser_use" ||
    kind === "codetwo_browser" ||
    kind === "chrome_browser" ||
    title === "browser_use"
  ) {
    return "browser";
  }
  return null;
}

/** The latest real screen image from Browser/Computer activity in the current agent turn. */
export function activeInteractivePreview(turns: readonly Turn[]): InteractiveToolPreview | null {
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = turns[turnIndex];
    if (!turn || turn.endedAt !== undefined) continue;

    let activeTool: Pick<InteractiveToolPreview, "kind" | "title"> | null = null;
    for (let toolIndex = turn.tools.length - 1; toolIndex >= 0; toolIndex -= 1) {
      const tool = turn.tools[toolIndex];
      const kind = tool && interactiveToolKind(tool);
      if (tool && kind) {
        activeTool = { kind, title: tool.title };
        break;
      }
    }
    if (!activeTool) continue;

    for (let toolIndex = turn.tools.length - 1; toolIndex >= 0; toolIndex -= 1) {
      const tool = turn.tools[toolIndex];
      if (!tool || interactiveToolKind(tool) !== activeTool.kind) continue;
      const outputs = tool.outputs ?? [];
      for (let outputIndex = outputs.length - 1; outputIndex >= 0; outputIndex -= 1) {
        const output = outputs[outputIndex];
        if (output?.type === "image") {
          return { ...activeTool, artifact: output.artifact };
        }
      }
    }
  }
  return null;
}

function parsedRecord(value: unknown): JsonRecord | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonRecord;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text.startsWith("{") || !text.endsWith("}")) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonRecord) : null;
  } catch {
    return null;
  }
}

/** Providers nest the real arguments one level down as often as not. */
function inputRecord(value: unknown): JsonRecord | null {
  const outer = parsedRecord(value);
  if (!outer) return null;
  for (const key of ["arguments", "args", "input", "params"]) {
    const nested = parsedRecord(outer[key]);
    if (nested) return { ...outer, ...nested };
  }
  return outer;
}

function filePathFrom(value: unknown): string | undefined {
  const record = inputRecord(value);
  if (!record) return undefined;
  for (const key of ["file_path", "filePath", "path", "filename", "fileName"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function isGitTool(id: string): boolean {
  return id.length > 0 && (GIT_EXACT.has(id) || GIT_TOOL.test(id));
}

function isFileTool(id: string): boolean {
  return id.length > 0 && (FILE_EXACT.has(id) || FILE_TOOL.test(id));
}

function isTerminalTool(id: string): boolean {
  return (
    id.length > 0 &&
    (TERMINAL_TOOL.test(id) || TERMINAL_COMMAND.test(id) || TEST_RUN.test(id))
  );
}

/**
 * Which dock surface a tool call lands on, or null when the dock should not move. Conservative on
 * purpose: reads, searches, and anything unrecognized return null — a wrong follow costs the user
 * their place, a missed one costs nothing.
 */
export function classifyToolSurface(tool: {
  kind?: string | null;
  title: string;
  agentInput?: unknown;
}): ToolSurfaceHint | null {
  const kind = normalizeIdentifier(tool.kind);
  const title = normalizeIdentifier(tool.title);
  if (READ_KINDS.has(kind)) return null;
  // Git before terminal: `git commit` run through a shell tool belongs on the git surface.
  if (isGitTool(title) || isGitTool(kind)) return { surface: "git" };
  if (kind === "edit" || isFileTool(title)) {
    const file = filePathFrom(tool.agentInput);
    return file ? { surface: "files", file } : { surface: "files" };
  }
  if (kind === "execute" || isTerminalTool(title)) return { surface: "terminal" };
  return null;
}

export interface FollowState {
  /** Set by any manual dock action; auto-follow stays silent until the run ends. */
  manualLatched: boolean;
  /** The surface auto-follow last chose (or recorded while the dock was closed). */
  autoTab: DockSurface | null;
  /** Epoch ms of the last emitted switch, for the debounce window. */
  lastSwitchAt: number;
}

export const initialFollowState: FollowState = {
  manualLatched: false,
  autoTab: null,
  lastSwitchAt: 0,
};

export type FollowEvent =
  | { kind: "tool"; hint: ToolSurfaceHint; now: number; dockOpen: boolean }
  | { kind: "manual"; tab: DockTab | null }
  | { kind: "run_ended" }
  | { kind: "session_switched" };

/** Emitted switches must be at least this far apart — the dock is a place, not a slideshow. */
const SWITCH_DEBOUNCE_MS = 2000;

/**
 * The follow latch. A manual dock action means "I chose this view": it latches immediately and
 * only a run ending (running → idle | failed) or a session switch releases it — `awaiting_input`
 * does not, because the run the user opted out of is still the same run. Auto-follow never opens
 * a closed dock; it records the surface so the UI can badge it, and emits nothing.
 */
export function followReduce(
  s: FollowState,
  e: FollowEvent,
): { state: FollowState; setTab?: DockSurface } {
  switch (e.kind) {
    case "manual":
      return { state: { ...s, manualLatched: true, autoTab: null } };
    case "run_ended":
      return { state: { ...s, manualLatched: false, autoTab: null } };
    case "session_switched":
      return { state: initialFollowState };
    case "tool": {
      if (s.manualLatched) return { state: s };
      const surface = e.hint.surface;
      if (!e.dockOpen) {
        return { state: { ...s, autoTab: surface } };
      }
      if (surface === s.autoTab) return { state: s };
      // Debounced attempts leave state untouched so the switch still happens once the window
      // passes — recording the surface here would make the next event a same-surface no-op.
      if (e.now - s.lastSwitchAt < SWITCH_DEBOUNCE_MS) return { state: s };
      return {
        state: { manualLatched: false, autoTab: surface, lastSwitchAt: e.now },
        setTab: surface,
      };
    }
  }
}
