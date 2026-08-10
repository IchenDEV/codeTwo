import type { CoreEvent, DocBlock, MemoryReceipt, Part, TranscriptEntry } from "../bridge";
import { isAgentActivityTitle } from "./agentActivity";

/** Only an accepted TurnStarted may dispose mutable Composer Canvas heads. */
export function canvasIdsToPurgeAfterTurnStart(
  accepted: boolean,
  canvasIds: readonly string[],
  editorUnchanged = true,
): string[] {
  return accepted && editorUnchanged
    ? Array.from(new Set(canvasIds.filter((id) => id.length > 0)))
    : [];
}

/**
 * Unmounting is the last safe lifecycle boundary for a mutable Composer head.  A live head must
 * be tombstoned before purge; a head already tombstoned by document removal can go straight to
 * purge.  Frozen revisions remain immutable in core and are not represented by this plan.
 */
export function canvasUnmountPlan(
  hasMutableHead: boolean,
  alreadyTombstoned: boolean,
): { tombstone: boolean; purge: boolean } {
  const mutable = hasMutableHead || alreadyTombstoned;
  return {
    tombstone: hasMutableHead && !alreadyTombstoned,
    purge: mutable,
  };
}

export interface CanvasFrozenRef {
  id: string;
  revision: number;
}

/** Provider-image failures are the only terminal errors that may offer a structure-only retry. */
export function isCanvasProviderImageError(message: string): boolean {
  return /provider.*image|image.*unsupported|ProviderImageUnsupported/i.test(message);
}

/** Correlate the immutable accepted request with its explicit provider retry affordance. */
export function canvasRetryRefsForTerminal(
  kind: "error" | "success",
  message: string | undefined,
  refs: readonly CanvasFrozenRef[],
): CanvasFrozenRef[] {
  if (kind !== "error" || !message || !isCanvasProviderImageError(message)) return [];
  return refs.map((ref) => ({ id: ref.id, revision: ref.revision }));
}

export function canvasAcceptedRequestKey(session: string, requestId: string): string {
  return `${session}:${requestId}`;
}

/** A provider change after an accepted Canvas failure must stage a fresh session. */
export function canvasRetryTargetSession(
  activeSession: string | null,
  forceNewSession: boolean,
): string | null {
  return forceNewSession ? null : activeSession;
}

/** Replace only Canvas references in a retry document; every non-Canvas block stays ordered and
 * byte-for-byte equivalent so an async provider failure never drops the user's instruction. */
export function canvasRetryDocument(
  doc: readonly DocBlock[],
  replacements: ReadonlyMap<string, CanvasFrozenRef>,
): DocBlock[] {
  return doc.map((block) => {
    if (block.type !== "canvas") return block;
    const replacement = replacements.get(block.id);
    return replacement
      ? { ...block, id: replacement.id, frozen_revision: replacement.revision }
      : block;
  });
}

export interface ToolEntry {
  id: string;
  title: string;
  /** First title that explicitly identified delegated activity, retained across status updates. */
  activityTitle?: string;
  status: string;
  kind?: string | null;
  agentInput?: unknown;
  /** Last durable row folded into this call; older snapshot/live updates cannot regress it. */
  lastTranscriptSeq?: number;
}

/**
 * One prompt → response cycle. The engine streams fragments; grouping them into turns is what makes
 * the transcript readable (previously every text chunk became its own row).
 */
export interface Turn {
  id: number;
  /** Durable user-row boundary. Present for turns reconstructed from a transcript page. */
  transcriptStartSeq?: number;
  /** Prompt correlation id when the core/client supplied one. */
  requestId?: string;
  /** False for an optimistic local row until its matching TurnStarted arrives. */
  accepted: boolean;
  /** True when live deltas were observed from this turn's explicit TurnStarted boundary. */
  streamBoundaryKnown: boolean;
  prompt: string;
  text: string;
  /** Exact ACP text chunks; merge by boundary/count, never by substring equality. */
  textDeltas: string[];
  /** Live chunks observed since the current stream boundary, including count-skipped replays. */
  observedTextDeltas: number;
  observedThoughtDeltas: number;
  /** Persisted chunks that raced ahead of IPC delivery and should be skipped by position. */
  pendingTextDeltaSkips: number;
  pendingThoughtDeltaSkips: number;
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

export function newTurn(prompt: string, requestId?: string): Turn {
  return {
    id: nextId++,
    requestId,
    accepted: false,
    streamBoundaryKnown: false,
    prompt,
    text: "",
    textDeltas: [],
    observedTextDeltas: 0,
    observedThoughtDeltas: 0,
    pendingTextDeltaSkips: 0,
    pendingThoughtDeltaSkips: 0,
    thoughts: [],
    tools: [],
    plan: [],
    startedAt: Date.now(),
  };
}

/** Immutable Set update used by App for both its synchronous ref and rendered state. */
export function withRunningSession(
  current: ReadonlySet<string>,
  session: string,
  running: boolean,
): Set<string> {
  const next = new Set(current);
  if (running) next.add(session);
  else next.delete(session);
  return next;
}

/** Drop only the optimistic row owned by a cancelled creation request. */
export function withoutUnacceptedTurn(turns: Turn[], requestId: string): Turn[] {
  return turns.filter((turn) => turn.requestId !== requestId || turn.accepted);
}

/** Project the session-level state onto a persisted tail without treating optimism as acceptance. */
export function transcriptTailState(
  sessionRunning: boolean,
  authoritativeTurnKnown: boolean,
  latestRequestId?: string,
): { running: boolean; requestId?: string } {
  return {
    running: sessionRunning && authoritativeTurnKnown,
    requestId: sessionRunning && !authoritativeTurnKnown ? undefined : latestRequestId,
  };
}

/** Compare the submitted editor revision without depending on object key insertion order. */
export function sameDocBlocks(a: readonly DocBlock[], b: readonly DocBlock[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((left, index) => {
    const right = b[index];
    if (!right || left.type !== right.type) return false;
    switch (left.type) {
      case "text":
        return right.type === "text" && left.text === right.text;
      case "file":
      case "image":
        return right.type === left.type && left.path === right.path;
      case "session":
        return right.type === "session" && left.session_id === right.session_id;
      case "canvas":
        return (
          right.type === "canvas" &&
          left.id === right.id &&
          left.frozen_revision === right.frozen_revision &&
          left.pixel_policy === right.pixel_policy
        );
      case "skill": {
        if (right.type !== "skill" || left.skill_id !== right.skill_id) return false;
        const leftKeys = Object.keys(left.params).sort();
        const rightKeys = Object.keys(right.params).sort();
        return (
          leftKeys.length === rightKeys.length &&
          leftKeys.every((key, keyIndex) =>
            key === rightKeys[keyIndex] && left.params[key] === right.params[key],
          )
        );
      }
    }
  });
}

/** Exact content plus editor revision prevents equal-looking post-submit edits from being erased. */
export function matchesSubmittedEditorRevision(
  current: readonly DocBlock[],
  currentRevision: number,
  submitted: readonly DocBlock[],
  submittedRevision: number,
): boolean {
  return currentRevision === submittedRevision && sameDocBlocks(current, submitted);
}

/** Is this turn still in flight? */
export function isRunning(t: Turn | undefined): boolean {
  return !!t && t.endedAt === undefined;
}

type ToolUpdate = {
  id: string;
  title: string;
  status: string;
  kind?: string | null;
  agentInput?: unknown;
  transcriptSeq?: number | null;
};

/** Upsert a streamed/persisted tool call without dropping metadata on status-only updates. */
function upsertTool(tools: ToolEntry[], update: ToolUpdate): ToolEntry[] {
  const existing = tools.find((tool) => tool.id === update.id);
  if (
    existing?.lastTranscriptSeq !== undefined &&
    update.transcriptSeq != null &&
    update.transcriptSeq <= existing.lastTranscriptSeq
  ) {
    return tools;
  }
  const entry: ToolEntry = {
    ...(existing ?? {}),
    id: update.id,
    title: update.title || existing?.title || update.id,
    activityTitle:
      existing?.activityTitle || (isAgentActivityTitle(update.title) ? update.title : undefined),
    status: update.status || existing?.status || "pending",
  };
  if (update.kind != null) entry.kind = update.kind;
  if (update.agentInput != null) entry.agentInput = update.agentInput;
  if (update.transcriptSeq != null) entry.lastTranscriptSeq = update.transcriptSeq;
  return existing ? tools.map((tool) => (tool.id === update.id ? entry : tool)) : [...tools, entry];
}

/**
 * Fold a streamed event into the turn list. Text accumulates into the open turn rather than
 * appending a new row, and tool calls are upserted by id so status updates in place.
 */
export function applyEvent(
  turns: Turn[],
  ev: CoreEvent,
  activeRequestId?: string,
): Turn[] {
  // Events that don't belong to a turn.
  if (
    ev.event === "session_created" ||
    ev.event === "session_title_changed" ||
    ev.event === "session_activity_changed" ||
    ev.event === "usage" ||
    ev.event === "models" ||
    ev.event === "config_options" ||
    ev.event === "permission_request"
  ) {
    return turns;
  }

  const requestId = "request_id" in ev ? (ev.request_id ?? undefined) : undefined;

  // A start only accepts the optimistic row with the same correlation id. A foreign start owns a
  // separate row, so its output can never bind to a prompt this client lost the core-side race for.
  if (ev.event === "turn_started") {
    let match = -1;
    if (requestId) {
      for (let index = turns.length - 1; index >= 0; index -= 1) {
        if (turns[index].requestId === requestId) {
          match = index;
          break;
        }
      }
    } else {
      const tail = turns[turns.length - 1];
      if (isRunning(tail) && !tail.requestId) match = turns.length - 1;
    }
    if (match >= 0) {
      const list = [...turns];
      const accepted = {
        ...list[match],
        accepted: true,
        streamBoundaryKnown: true,
      };
      delete accepted.endedAt;
      list[match] = accepted;
      return list;
    }
    const remote = newTurn("(started elsewhere)", requestId);
    remote.accepted = true;
    remote.streamBoundaryKnown = true;
    return [...turns, remote];
  }

  if (ev.event === "error" && requestId) {
    let match = -1;
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      if (turns[index].requestId === requestId) {
        match = index;
        break;
      }
    }
    if (match >= 0) {
      const list = [...turns];
      const cur = { ...list[match], error: ev.message };
      // A non-terminal error before acceptance is a correlated rejection (normally `busy`). It
      // ends only that optimistic row; warnings after TurnStarted keep the accepted turn open.
      if (ev.terminal || !cur.accepted) cur.endedAt = Date.now();
      list[match] = cur;
      return list;
    }
    // Correlated errors with no known turn are bounded notices, never activity that can absorb
    // another client's streamed output.
    const notice = newTurn("(session notice)", requestId);
    notice.error = ev.message;
    notice.endedAt = Date.now();
    return [...turns, notice];
  }

  // A warning emitted while the session is idle is a completed notice, not a phantom running turn.
  if (ev.event === "error" && !ev.terminal && !isRunning(turns[turns.length - 1])) {
    const notice = newTurn("(session notice)");
    notice.error = ev.message;
    notice.endedAt = Date.now();
    return [...turns, notice];
  }

  // Backward compatibility for event producers that predate `turn_started`: activity after an
  // ended transcript still starts a fresh remote turn instead of mutating the previous one.
  const list = [...turns];
  let i = -1;
  if (activeRequestId) {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (isRunning(list[index]) && list[index].requestId === activeRequestId) {
        i = index;
        break;
      }
    }
    if (i < 0) {
      const remote = newTurn("(started elsewhere)", activeRequestId);
      remote.accepted = true;
      list.push(remote);
      i = list.length - 1;
    }
  }
  if (i < 0) {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (isRunning(list[index]) && list[index].accepted) {
        i = index;
        break;
      }
    }
  }
  if (i < 0) {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (isRunning(list[index])) {
        i = index;
        break;
      }
    }
  }
  if (i < 0) {
    const remote = newTurn("(started elsewhere)");
    remote.accepted = true;
    list.push(remote);
    i = list.length - 1;
  }
  const cur = { ...list[i] };

  switch (ev.event) {
    case "memory_context":
      cur.memory = ev.receipt;
      break;
    case "agent_text":
      cur.observedTextDeltas += 1;
      if (cur.pendingTextDeltaSkips > 0) {
        cur.pendingTextDeltaSkips -= 1;
      } else {
        cur.text += ev.text;
        cur.textDeltas = [...cur.textDeltas, ev.text];
      }
      break;
    case "agent_thought":
      cur.observedThoughtDeltas += 1;
      if (cur.pendingThoughtDeltaSkips > 0) {
        cur.pendingThoughtDeltaSkips -= 1;
      } else {
        cur.thoughts = [...cur.thoughts, ev.text];
      }
      break;
    case "tool_call": {
      cur.tools = upsertTool(cur.tools, {
        id: ev.id,
        title: ev.title,
        status: ev.status,
        kind: ev.kind,
        agentInput: ev.agent_input,
        transcriptSeq: ev.transcript_seq,
      });
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
      if (ev.terminal) cur.endedAt = Date.now();
      break;
  }

  list[i] = cur;
  return list;
}

function mergeDeltas(
  snapshot: string[],
  live: string[],
  observedLiveCount: number,
  boundaryKnown: boolean,
): { deltas: string[]; pendingSkips: number } {
  // With an explicit TurnStarted boundary, the observed `live` sequence starts at the turn boundary
  // and the persisted snapshot contains a prefix of the same sequence. Counts preserve repeated equal
  // deltas. Persistence can also race ahead of IPC delivery; `pendingSkips` consumes those future
  // replays by position. Without that boundary, append conservatively: duplicating an uncertain
  // delta is safer than deleting distinct model output merely because the text happens to be equal.
  if (!boundaryKnown) return { deltas: [...snapshot, ...live], pendingSkips: 0 };
  return {
    deltas: [...snapshot, ...live.slice(Math.min(snapshot.length, live.length))],
    pendingSkips: Math.max(0, snapshot.length - observedLiveCount),
  };
}

/** Merge events received during an async transcript read without dropping or duplicating its tail. */
export function mergeLoadedTurns(loaded: Turn[], live: Turn[], running: boolean): Turn[] {
  if (live.length === 0) return loaded;
  if (loaded.length === 0) return live;

  const loadedTail = loaded[loaded.length - 1];
  if (!loadedTail.requestId) return [...loaded, ...live];
  const liveIndex = live.findIndex((turn) => turn.requestId === loadedTail.requestId);
  if (liveIndex < 0) return [...loaded, ...live];
  const liveTurn = live[liveIndex];

  let tools = [...loadedTail.tools];
  for (const tool of liveTurn.tools) {
    tools = upsertTool(tools, {
      ...tool,
      transcriptSeq: tool.lastTranscriptSeq,
    });
  }
  const textMerge = mergeDeltas(
    loadedTail.textDeltas,
    liveTurn.textDeltas,
    liveTurn.observedTextDeltas,
    liveTurn.streamBoundaryKnown,
  );
  const thoughtMerge = mergeDeltas(
    loadedTail.thoughts,
    liveTurn.thoughts,
    liveTurn.observedThoughtDeltas,
    liveTurn.streamBoundaryKnown,
  );
  const merged: Turn = {
    ...loadedTail,
    requestId: liveTurn.requestId,
    accepted: loadedTail.accepted || liveTurn.accepted,
    streamBoundaryKnown: liveTurn.streamBoundaryKnown,
    text: textMerge.deltas.join(""),
    textDeltas: textMerge.deltas,
    observedTextDeltas: liveTurn.observedTextDeltas,
    observedThoughtDeltas: liveTurn.observedThoughtDeltas,
    pendingTextDeltaSkips: textMerge.pendingSkips,
    pendingThoughtDeltaSkips: thoughtMerge.pendingSkips,
    thoughts: thoughtMerge.deltas,
    tools,
    plan: liveTurn.plan.length > 0 ? liveTurn.plan : loadedTail.plan,
    error: liveTurn.error ?? loadedTail.error,
    stopReason: liveTurn.stopReason ?? loadedTail.stopReason,
    endedAt: running ? undefined : (liveTurn.endedAt ?? loadedTail.endedAt),
  };
  return [
    ...loaded.slice(0, -1),
    ...live.slice(0, liveIndex),
    merged,
    ...live.slice(liveIndex + 1),
  ];
}

/** Rebuild turns from a persisted transcript: each user message starts a new turn. */
export function turnsFromTranscript(
  entries: readonly (TranscriptEntry | readonly [string, Part])[],
  lastTurnRunning = false,
  lastTurnRequestId?: string,
  receipts: readonly MemoryReceipt[] = [],
): Turn[] {
  const out: Turn[] = [];
  const receiptBySeq = new Map(receipts.map((receipt) => [receipt.user_part_seq, receipt]));
  const push = (part: Part, role: string, seq?: number) => {
    if (role === "user" && (part.kind === "text" || part.kind === "prompt")) {
      out.push({
        ...newTurn(part.text),
        transcriptStartSeq: seq,
        accepted: true,
        memory: seq === undefined ? undefined : receiptBySeq.get(seq),
        endedAt: Date.now(),
      });
      return;
    }
    if (out.length === 0) {
      out.push({ ...newTurn("(earlier)"), accepted: true, endedAt: Date.now() });
    }
    const cur = out[out.length - 1];
    switch (part.kind) {
      case "text":
        cur.text += part.text;
        cur.textDeltas.push(part.text);
        break;
      case "prompt":
        cur.text += part.text;
        cur.textDeltas.push(part.text);
        break;
      case "reasoning":
        cur.thoughts.push(part.text);
        break;
      case "tool_call":
        cur.tools = upsertTool(cur.tools, {
          id: part.id,
          title: part.title,
          status: part.status,
          kind: part.tool_kind,
          agentInput: part.agent_input,
          transcriptSeq: seq,
        });
        break;
      case "plan":
        cur.plan = part.entries;
        break;
    }
  };
  for (const entry of entries) {
    if ("part" in entry) push(entry.part, entry.role, entry.seq);
    else push(entry[1], entry[0]);
  }
  if (out.length > 0 && lastTurnRequestId) {
    out[out.length - 1].requestId = lastTurnRequestId;
  }
  if (lastTurnRunning && out.length > 0) delete out[out.length - 1].endedAt;
  return out;
}

/** Prepend an older, non-overlapping page without touching the live tail merge machinery. */
export function prependTranscriptTurns(current: Turn[], older: Turn[]): Turn[] {
  if (older.length === 0) return current;
  const durableStarts = new Set(
    current
      .map((turn) => turn.transcriptStartSeq)
      .filter((seq): seq is number => seq !== undefined),
  );
  return [
    ...older.filter(
      (turn) => turn.transcriptStartSeq === undefined || !durableStarts.has(turn.transcriptStartSeq),
    ),
    ...current,
  ];
}
