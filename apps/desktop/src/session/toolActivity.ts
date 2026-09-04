import type { ArtifactReference } from "../bridge";
import type { DockSurface, DockTab } from "../dock/Dock";
import { asJsonObject } from "../lib/jsonValue";
import type { ToolEntry, Turn } from "./turns";

/**
 * R10 dock follow (docs/archive/scenes-v1/frontend-implementation-plan.md, Item 6): map a tool call to the dock
 * surface where its effect is visible, and decide — through a pure latch reducer — whether the
 * dock may follow it. Deliberately a sibling of `agentActivity.ts`: the same conservative
 * identifier heuristics, but classifying surfaces instead of delegation, and never editing it.
 */

export interface ToolSurfaceHint {
  surface: DockSurface;
  /**
  The touched path for file tools, when the input names one.
  */
  file?: string;
}

type JsonRecord = Record<string, unknown>;

/**
ACP kinds whose whole point is looking, not acting — the dock never follows a read.
*/
const readKinds = new Set(["read", "search", "fetch", "think"]);

// Complete-token matches on normalized identifiers, exactly like agentActivity's suffix rule:
// a whole `git_commit` or `apply_patch` operation is evidence, a substring in prose is not.
const gitTool =
  /(?:^|_)git_(?:commit|branch|merge|status|checkout|rebase|stash|push|pull)(?:_|$)/u;
const gitExact = new Set([
  "commit",
  "git_commit",
  "branch",
  "create_branch",
  "git_branch",
  "merge",
  "merge_branch",
  "git_merge",
  "git_status",
]);

const fileTool =
  /(?:^|_)(?:apply_patch|str_replace|(?:edit|write|create)_file|file_(?:edit|write|create))(?:_|$)/u;
const fileExact = new Set([
  "edit",
  "write",
  "create",
  "apply_patch",
  "multi_edit",
  "str_replace",
  "str_replace_editor",
  "str_replace_based_edit_tool",
  "notebook_edit",
  "text_editor",
]);

const terminalTool =
  /(?:^|_)(?:bash|shell|zsh|exec|execute|terminal|cmd)(?:_|$)/u;
const terminalCommand = /(?:^|_)(?:run|exec|shell|execute)_commands?(?:_|$)/u;
// "Test-run" titles: a runner followed by `test`, or a runner whose only job is running tests.
const testRun =
  /(?:^|_)(?:cargo|npm|pnpm|yarn|bun|go|make|mvn|gradle|python)_tests?(?:_|$)|(?:^|_)(?:pytest|vitest|jest|ctest)(?:_|$)|(?:^|_)run_tests?(?:_|$)/u;

function normalizeIdentifier(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replaceAll(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "_")
    .replaceAll(/^_+|_+$/gu, "");
}

export interface InteractiveToolPreview {
  kind: "browser" | "computer";
  title: string;
  artifact: ArtifactReference;
}

function interactiveToolKind(
  tool: ToolEntry
): InteractiveToolPreview["kind"] | null {
  const kind = normalizeIdentifier(tool.kind);
  const title = normalizeIdentifier(tool.title);
  if (kind === "computer_use" || title === "computer_use") {
    return "computer";
  }
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

export function activeInteractivePreview(
  turns: readonly Turn[]
): InteractiveToolPreview | null {
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = turns[turnIndex];
    if (turn == null || turn.endedAt !== undefined) {
      continue;
    }

    let activeTool: Pick<InteractiveToolPreview, "kind" | "title"> | null =
      null;
    for (
      let toolIndex = turn.tools.length - 1;
      toolIndex >= 0;
      toolIndex -= 1
    ) {
      const tool = turn.tools[toolIndex];
      if (tool == null) {
        continue;
      }
      const kind = interactiveToolKind(tool);
      if (kind != null) {
        activeTool = { kind, title: tool.title };
        break;
      }
    }
    if (!activeTool) {
      continue;
    }

    for (
      let toolIndex = turn.tools.length - 1;
      toolIndex >= 0;
      toolIndex -= 1
    ) {
      const tool = turn.tools[toolIndex];
      if (tool == null || interactiveToolKind(tool) !== activeTool.kind) {
        continue;
      }
      const outputs = tool.outputs ?? [];
      for (
        let outputIndex = outputs.length - 1;
        outputIndex >= 0;
        outputIndex -= 1
      ) {
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
  const direct = asJsonObject(value);
  if (direct != null) {
    return direct;
  }
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  if (!text.startsWith("{") || !text.endsWith("}")) {
    return null;
  }
  try {
    return asJsonObject(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

function inputRecord(value: unknown): JsonRecord | null {
  const outer = parsedRecord(value);
  if (!outer) {
    return null;
  }
  for (const key of ["arguments", "args", "input", "params"]) {
    const nested = parsedRecord(outer[key]);
    if (nested) {
      return { ...outer, ...nested };
    }
  }
  return outer;
}

function filePathFrom(value: unknown): string | undefined {
  const record = inputRecord(value);
  if (!record) {
    return undefined;
  }
  for (const key of ["file_path", "filePath", "path", "filename", "fileName"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

function isGitTool(id: string): boolean {
  return id.length > 0 && (gitExact.has(id) || gitTool.test(id));
}

function isFileTool(id: string): boolean {
  return id.length > 0 && (fileExact.has(id) || fileTool.test(id));
}

function isTerminalTool(id: string): boolean {
  return (
    id.length > 0 &&
    (terminalTool.test(id) || terminalCommand.test(id) || testRun.test(id))
  );
}

export function classifyToolSurface(tool: {
  kind?: string | null;
  title: string;
  agentInput?: unknown;
}): ToolSurfaceHint | null {
  const kind = normalizeIdentifier(tool.kind);
  const title = normalizeIdentifier(tool.title);
  if (readKinds.has(kind)) {
    return null;
  }
  // Git before terminal: `git commit` run through a shell tool belongs on the git surface.
  if (isGitTool(title) || isGitTool(kind)) {
    return { surface: "git" };
  }
  if (kind === "edit" || isFileTool(title)) {
    const file = filePathFrom(tool.agentInput);
    return file != null && file !== ""
      ? { file, surface: "files" }
      : { surface: "files" };
  }
  if (kind === "execute" || isTerminalTool(title)) {
    return { surface: "terminal" };
  }
  return null;
}

export interface FollowState {
  /**
  Set by any manual dock action; auto-follow stays silent until the run ends.
  */
  manualLatched: boolean;
  /**
  The surface auto-follow last chose (or recorded while the dock was closed).
  */
  autoTab: DockSurface | null;
  /**
  Epoch ms of the last emitted switch, for the debounce window.
  */
  lastSwitchAt: number;
}

export const initialFollowState: FollowState = {
  autoTab: null,
  lastSwitchAt: 0,
  manualLatched: false,
};

export type FollowEvent =
  | { kind: "tool"; hint: ToolSurfaceHint; now: number; dockOpen: boolean }
  | { kind: "manual"; tab: DockTab | null }
  | { kind: "run_ended" }
  | { kind: "session_switched" };

/**
Emitted switches must be at least this far apart — the dock is a place, not a slideshow.
*/
const switchDebounceMs = 2000;

export function followReduce(
  s: FollowState,
  e: FollowEvent
): { state: FollowState; setTab?: DockSurface } {
  switch (e.kind) {
    case "manual": {
      return { state: { ...s, autoTab: null, manualLatched: true } };
    }
    case "run_ended": {
      return { state: { ...s, autoTab: null, manualLatched: false } };
    }
    case "session_switched": {
      return { state: initialFollowState };
    }
    case "tool": {
      if (s.manualLatched) {
        return { state: s };
      }
      const { surface } = e.hint;
      if (!e.dockOpen) {
        return { state: { ...s, autoTab: surface } };
      }
      if (surface === s.autoTab) {
        return { state: s };
      }
      // Debounced attempts leave state untouched so the switch still happens once the window
      // passes — recording the surface here would make the next event a same-surface no-op.
      if (e.now - s.lastSwitchAt < switchDebounceMs) {
        return { state: s };
      }
      return {
        setTab: surface,
        state: { autoTab: surface, lastSwitchAt: e.now, manualLatched: false },
      };
    }
  }
}
