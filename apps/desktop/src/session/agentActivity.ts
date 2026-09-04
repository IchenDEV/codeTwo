import { asJsonObject } from "../lib/jsonValue";
import type { ToolEntry } from "./turns";

export interface AgentActivity {
  id: string;
  title: string;
  role: string;
  status: string;
  task: string | null;
  startedAt?: number;
  endedAt?: number;
}

export type AgentActivityState = "active" | "pending" | "completed" | "failed";

type JsonRecord = Record<string, unknown>;

const directAgentTools = new Set([
  "agent",
  "delegate",
  "delegate_task",
  "run_agent",
  "run_subagent",
  "run_workflow",
  "spawn_agent",
  "spawn_subagent",
  "start_agent",
  "start_subagent",
  "start_workflow",
  "subagent",
  "workflow",
  "workflow_task",
]);

const suffixAgentTools = [
  "delegate_task",
  "run_agent",
  "run_subagent",
  "run_workflow",
  "spawn_agent",
  "spawn_subagent",
  "start_agent",
  "start_subagent",
  "start_workflow",
  "workflow_task",
] as const;

const agentAction =
  /^(?:create|delegate|invoke|launch|run|spawn|start)_(?:agent|subagent|workflow)$/u;
const namespacedAgentAction =
  /(?:^|_)(?:collab|collaboration|workflow)_(?:create|delegate|invoke|launch|run|spawn|start)?_?(?:agent|subagent|task|workflow)$/u;
const labeledAgentTitle =
  /^(?:agent|subagent|delegate|workflow)(?:\s*[:#-]|\s+\()/iu;
const verbAgentTitle =
  /^(?:create|delegate|invoke|launch|run|spawn|start)(?:\s+(?:an?|the))?\s+(?:agent|subagent|sub-agent|workflow)(?:\s*[:#-]|\s+\(|\s*$)/iu;

function normalizeIdentifier(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replaceAll(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "_")
    .replaceAll(/^_+|_+$/gu, "");
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

function stringValue(
  record: JsonRecord | null,
  keys: readonly string[]
): string | null {
  if (record == null) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
}

function isAgentToolIdentifier(value: string | null | undefined): boolean {
  const id = normalizeIdentifier(value);
  if (id === "") {
    return false;
  }
  if (
    directAgentTools.has(id) ||
    agentAction.test(id) ||
    namespacedAgentAction.test(id)
  ) {
    return true;
  }
  // Provider namespaces vary (`functions.spawn_agent`, `mcp__codex__spawn_agent`), but the final
  // operation name is stable. Requiring a complete suffix avoids matching prose such as
  // "read AGENTS.md" or ordinary tools whose description happens to mention an agent.
  return suffixAgentTools.some((name) => id.endsWith(`_${name}`));
}

export function isAgentActivityTitle(
  value: string | null | undefined
): boolean {
  const title = value?.trim() ?? "";
  return (
    isAgentToolIdentifier(title) ||
    labeledAgentTitle.test(title) ||
    verbAgentTitle.test(title)
  );
}

function signalTitle(tool: ToolEntry): string | null {
  for (const title of [tool.activityTitle, tool.title]) {
    if (isAgentActivityTitle(title)) {
      return title ?? null;
    }
  }
  return null;
}

export function isAgentActivityTool(tool: ToolEntry): boolean {
  const title = signalTitle(tool);
  if (isAgentToolIdentifier(tool.kind) || (title != null && title !== "")) {
    return true;
  }

  const input = inputRecord(tool.agentInput);
  if (!input) {
    return false;
  }

  // These keys are specific to the common Codex/Claude subagent calls. `task_name` is included
  // because Codex's spawn_agent contract uses it together with a delegated `message`.
  const agentType = stringValue(input, [
    "agent_type",
    "agentType",
    "subagent_type",
    "subagentType",
  ]);
  if (agentType != null && agentType !== "") {
    return true;
  }
  const taskName = stringValue(input, ["task_name", "taskName"]);
  const taskMessage = stringValue(input, ["message", "prompt", "task"]);
  if (
    taskName != null &&
    taskName !== "" &&
    taskMessage != null &&
    taskMessage !== ""
  ) {
    return true;
  }

  const operation = stringValue(input, [
    "tool",
    "tool_name",
    "toolName",
    "operation",
    "action",
  ]);
  if (isAgentToolIdentifier(operation)) {
    return true;
  }

  // Some workflow/collaboration adapters put a namespace in `name` and the actual assignment in a
  // separate field. Keep this paired condition narrow so a normal named task is not promoted.
  const name = stringValue(input, ["name", "workflow"]);
  const objective = stringValue(input, [
    "message",
    "prompt",
    "task",
    "objective",
  ]);
  return isAgentToolIdentifier(name) && objective != null && objective !== "";
}

function compact(value: string, max: number): string {
  const text = value.replaceAll(/\s+/gu, " ").trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function humanize(value: string): string {
  const words = value
    .replaceAll(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replaceAll(/[_-]+/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
  if (!words) {
    return "Agent";
  }
  return words.replaceAll(/\b\w/gu, (letter) => letter.toUpperCase());
}

function fallbackRole(tool: ToolEntry): string {
  const signal = `${normalizeIdentifier(tool.kind)}_${normalizeIdentifier(signalTitle(tool) ?? tool.title)}`;
  if (signal.includes("workflow")) {
    return "Workflow";
  }
  if (signal.includes("delegate")) {
    return "Delegate";
  }
  if (signal.includes("task")) {
    return "Task";
  }
  return "Agent";
}

function activityFromTool(tool: ToolEntry): AgentActivity {
  const input = inputRecord(tool.agentInput);
  const role = stringValue(input, [
    "agent_type",
    "agentType",
    "subagent_type",
    "subagentType",
    "role",
  ]);
  const taskName = stringValue(input, ["task_name", "taskName"]);
  const named =
    taskName ?? stringValue(input, ["title", "name", "description"]);
  const assignment = stringValue(input, [
    "message",
    "prompt",
    "task",
    "objective",
    "instructions",
    "description",
  ]);

  const rawToolTitle = signalTitle(tool) ?? (tool.title || tool.id);
  const toolOperation = rawToolTitle.split(/[.:/]/u).pop() ?? rawToolTitle;
  const toolTitle = compact(
    isAgentToolIdentifier(rawToolTitle)
      ? humanize(toolOperation)
      : rawToolTitle,
    72
  );
  const title =
    named != null && named !== "" && !isAgentToolIdentifier(named)
      ? compact(
          taskName != null && taskName !== "" ? humanize(named) : named,
          72
        )
      : toolTitle;
  const summary =
    assignment != null && assignment !== "" ? compact(assignment, 160) : null;

  const activity: AgentActivity = {
    id: tool.id,
    role:
      role != null && role !== ""
        ? compact(humanize(role), 36)
        : fallbackRole(tool),
    status: tool.status,
    task:
      summary != null && summary !== "" && summary !== title ? summary : null,
    title,
  };
  if (tool.startedAt !== undefined) {
    activity.startedAt = tool.startedAt;
  }
  if (tool.endedAt !== undefined) {
    activity.endedAt = tool.endedAt;
  }
  return activity;
}

export function agentActivityState(status: string): AgentActivityState {
  const value = normalizeIdentifier(status);
  if (["completed", "done", "success", "succeeded"].includes(value)) {
    return "completed";
  }
  if (
    ["cancelled", "canceled", "denied", "error", "failed", "rejected"].includes(
      value
    )
  ) {
    return "failed";
  }
  if (["pending", "queued", "scheduled", "waiting"].includes(value)) {
    return "pending";
  }
  return "active";
}

export function deriveAgentRoster(
  tools: readonly ToolEntry[]
): AgentActivity[] {
  return tools.filter(isAgentActivityTool).map(activityFromTool);
}
