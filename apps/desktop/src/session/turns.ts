import type { CoreEvent, MemoryReceipt, Part, TranscriptEntry } from "../bridge";

export interface ToolEntry {
  id: string;
  title: string;
  status: string;
}

/**
 * One prompt → response cycle. The engine streams fragments; grouping them into turns is what makes
 * the transcript readable (previously every text chunk became its own row).
 */
export interface Turn {
  id: number;
  prompt: string;
  text: string;
  thoughts: string[];
  tools: ToolEntry[];
  plan: string[];
  memory?: MemoryReceipt;
  error?: string;
  stopReason?: string;
  startedAt: number;
  endedAt?: number;
}

let nextId = 1;

export function newTurn(prompt: string): Turn {
  return {
    id: nextId++,
    prompt,
    text: "",
    thoughts: [],
    tools: [],
    plan: [],
    startedAt: Date.now(),
  };
}

/** Is this turn still in flight? */
export function isRunning(t: Turn | undefined): boolean {
  return !!t && t.endedAt === undefined && t.error === undefined;
}

/**
 * Fold a streamed event into the turn list. Text accumulates into the open turn rather than
 * appending a new row, and tool calls are upserted by id so status updates in place.
 */
export function applyEvent(turns: Turn[], ev: CoreEvent): Turn[] {
  // Events that don't belong to a turn.
  if (ev.event === "session_created" || ev.event === "usage") return turns;

  // If a turn arrives with nothing open (e.g. a remote client started it), open one.
  const list = turns.length === 0 ? [newTurn("(started elsewhere)")] : [...turns];
  const i = list.length - 1;
  const cur = { ...list[i] };

  switch (ev.event) {
    case "memory_context":
      cur.memory = ev.receipt;
      break;
    case "agent_text":
      cur.text += ev.text;
      break;
    case "agent_thought":
      cur.thoughts = [...cur.thoughts, ev.text];
      break;
    case "tool_call": {
      const existing = cur.tools.findIndex((t) => t.id === ev.id);
      const entry = { id: ev.id, title: ev.title || ev.id, status: ev.status };
      cur.tools = existing >= 0
        ? cur.tools.map((t, n) => (n === existing ? { ...t, ...entry } : t))
        : [...cur.tools, entry];
      break;
    }
    case "plan":
      cur.plan = ev.entries;
      break;
    case "turn_ended":
      cur.stopReason = ev.stop_reason;
      cur.endedAt = Date.now();
      break;
    case "error":
      cur.error = ev.message;
      cur.endedAt = Date.now();
      break;
  }

  list[i] = cur;
  return list;
}

/** Rebuild turns from a persisted transcript: each user message starts a new turn. */
export function turnsFromTranscript(
  entries: TranscriptEntry[],
  receipts: MemoryReceipt[] = [],
): Turn[] {
  const out: Turn[] = [];
  const receiptBySeq = new Map(receipts.map((receipt) => [receipt.user_part_seq, receipt]));
  const push = (seq: number, part: Part, role: string) => {
    if (role === "user" && part.kind === "text") {
      out.push({ ...newTurn(part.text), memory: receiptBySeq.get(seq), endedAt: Date.now() });
      return;
    }
    if (out.length === 0) out.push({ ...newTurn("(earlier)"), endedAt: Date.now() });
    const cur = out[out.length - 1];
    switch (part.kind) {
      case "text":
        cur.text += part.text;
        break;
      case "reasoning":
        cur.thoughts.push(part.text);
        break;
      case "tool_call":
        cur.tools.push({ id: part.id, title: part.title || part.id, status: part.status });
        break;
      case "plan":
        cur.plan = part.entries;
        break;
    }
  };
  for (const [seq, role, part] of entries) push(seq, part, role);
  return out;
}
