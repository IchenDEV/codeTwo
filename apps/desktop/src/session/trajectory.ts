import type { ToolOutput } from "../bridge";
import type { ToolEntry, Turn, TurnContentEntry } from "./turns";

export type TrajectoryKind =
  "user" | "assistant" | "reasoning" | "tool" | "memory" | "plan" | "error";

export type TrajectoryLane = "context" | "assistant" | "tool";

export interface TrajectoryRecord {
  id: string;
  index: number;
  kind: TrajectoryKind;
  lane: TrajectoryLane;
  turn: number;
  step: number;
  title: string;
  summary: string;
  status?: string;
  startAt: number;
  endAt: number;
  running: boolean;
  input?: unknown;
  output?: unknown;
}

function compact(value: string, max = 160): string {
  const text = value.replaceAll(/\s+/gu, " ").trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function toolOutputSummary(outputs: readonly ToolOutput[]): string {
  for (const output of outputs) {
    if (output.type === "text" && output.text.trim()) {
      return compact(output.text);
    }
    if (output.type === "image") {
      return output.artifact.display_name;
    }
    if (output.type === "resource_link") {
      return output.name || output.uri;
    }
  }
  return "";
}

function timeFor(entry: TurnContentEntry, fallback: number): number {
  return entry.createdAt != null && entry.createdAt > 0
    ? entry.createdAt
    : fallback;
}

function toolRecord(
  tool: ToolEntry,
  entry: TurnContentEntry,
  turn: Turn,
  turnNumber: number,
  step: number,
  now: number
): TrajectoryRecord {
  const fallback = timeFor(entry, turn.startedAt);
  const startAt =
    tool.startedAt != null && tool.startedAt > 0 ? tool.startedAt : fallback;
  const isRunning = tool.endedAt === undefined && turn.endedAt === undefined;
  const endAt = Math.max(startAt, tool.endedAt ?? (isRunning ? now : fallback));
  const output = tool.outputs ?? [];
  return {
    endAt,
    id: `turn:${turn.id}:tool:${tool.id}`,
    index: 0,
    input: tool.agentInput,
    kind: "tool",
    lane: "tool",
    output,
    running: isRunning,
    startAt,
    status: tool.status,
    step,
    summary: toolOutputSummary(output) || tool.status,
    title:
      tool.title ||
      (tool.kind != null && tool.kind !== "" ? tool.kind : "Tool"),
    turn: turnNumber,
  };
}

export function deriveTrajectory(
  turns: readonly Turn[],
  now = Date.now()
): TrajectoryRecord[] {
  const records: TrajectoryRecord[] = [];

  for (const [turnIndex, turn] of turns.entries()) {
    const turnNumber = turnIndex + 1;
    const turnEnd = Math.max(turn.startedAt, turn.endedAt ?? now);
    records.push({
      endAt: turn.startedAt,
      id: `turn:${turn.id}:user`,
      index: 0,
      input: turn.prompt,
      kind: "user",
      lane: "context",
      running: false,
      startAt: turn.startedAt,
      step: 0,
      summary: compact(turn.prompt),
      title: "User",
      turn: turnNumber,
    });

    if (turn.memory) {
      const at =
        turn.memory.created_at > 0 ? turn.memory.created_at : turn.startedAt;
      records.push({
        endAt: at,
        id: `turn:${turn.id}:memory`,
        index: 0,
        kind: "memory",
        lane: "context",
        output: turn.memory,
        running: false,
        startAt: at,
        step: 0,
        summary: `${turn.memory.items.length} items · ~${turn.memory.estimated_tokens} tokens`,
        title: "Memory context",
        turn: turnNumber,
      });
    }

    if (turn.thoughts.length > 0) {
      const reasoning = turn.thoughts.join("");
      records.push({
        endAt: turnEnd,
        id: `turn:${turn.id}:reasoning`,
        index: 0,
        kind: "reasoning",
        lane: "assistant",
        output: reasoning,
        running: turn.endedAt === undefined,
        startAt: turn.startedAt,
        step: 1,
        summary: compact(reasoning),
        title: "Reasoning",
        turn: turnNumber,
      });
    }

    if (turn.plan.length > 0) {
      records.push({
        endAt: turn.startedAt,
        id: `turn:${turn.id}:plan`,
        index: 0,
        kind: "plan",
        lane: "assistant",
        output: turn.plan,
        running: false,
        startAt: turn.startedAt,
        step: 1,
        summary: compact(turn.plan.map((entry) => entry.content).join(" · ")),
        title: "Plan",
        turn: turnNumber,
      });
    }

    const tools = new Map(turn.tools.map((tool) => [tool.id, tool]));
    let step = 1;
    let assistantSegment = 0;
    let textEntries: Extract<TurnContentEntry, { kind: "text" }>[] = [];

    const flushAssistant = (isTerminal = false) => {
      if (textEntries.length === 0) {
        return;
      }
      assistantSegment += 1;
      const text = textEntries.map((entry) => entry.text).join("");
      const startAt = timeFor(textEntries[0], turn.startedAt);
      const lastAt = timeFor(textEntries[textEntries.length - 1], startAt);
      const isRunning = !isTerminal && turn.endedAt === undefined;
      records.push({
        endAt: Math.max(startAt, isRunning ? now : lastAt),
        id: `turn:${turn.id}:assistant:${assistantSegment}`,
        index: 0,
        kind: "assistant",
        lane: "assistant",
        output: text,
        running: isRunning,
        startAt,
        step,
        summary: compact(text),
        title: "Assistant",
        turn: turnNumber,
      });
      textEntries = [];
    };

    for (const entry of turn.content) {
      if (entry.kind === "text") {
        textEntries.push(entry);
        continue;
      }
      flushAssistant(true);
      const tool = tools.get(entry.toolId);
      if (tool) {
        records.push(toolRecord(tool, entry, turn, turnNumber, step, now));
      }
      step += 1;
    }
    flushAssistant(false);

    if (turn.content.length === 0 && turn.text.trim()) {
      records.push({
        endAt: turnEnd,
        id: `turn:${turn.id}:assistant:1`,
        index: 0,
        kind: "assistant",
        lane: "assistant",
        output: turn.text,
        running: turn.endedAt === undefined,
        startAt: turn.startedAt,
        step,
        summary: compact(turn.text),
        title: "Assistant",
        turn: turnNumber,
      });
    }

    if (turn.error != null && turn.error !== "") {
      records.push({
        endAt: turnEnd,
        id: `turn:${turn.id}:error`,
        index: 0,
        kind: "error",
        lane: "assistant",
        output: turn.error,
        running: false,
        startAt: turnEnd,
        status: "failed",
        step,
        summary: compact(turn.error),
        title: "Error",
        turn: turnNumber,
      });
    }
  }

  return records.map((record, index) => ({ ...record, index: index + 1 }));
}

export function filterTrajectory(
  records: readonly TrajectoryRecord[],
  kind: TrajectoryKind | "all",
  query: string
): TrajectoryRecord[] {
  const needle = query.trim().toLocaleLowerCase();
  return records.filter((record) => {
    if (kind !== "all" && record.kind !== kind) {
      return false;
    }
    if (!needle) {
      return true;
    }
    return [
      record.title,
      record.summary,
      record.status ?? "",
      `turn ${record.turn}`,
      `step ${record.step}`,
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(needle);
  });
}

export function formatTrajectoryDuration(milliseconds: number): string {
  const value = Math.max(0, milliseconds);
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }
  if (value < 10_000) {
    return `${(value / 1000).toFixed(1)} s`;
  }
  const roundedSeconds = Math.round(value / 1000);
  if (roundedSeconds < 60) {
    return `${roundedSeconds} s`;
  }
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
