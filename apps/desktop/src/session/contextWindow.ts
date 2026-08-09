import type { CoreEvent } from "../bridge";

/** Provider-reported context state. This is intentionally not the rolling account quota shape. */
export interface ContextWindow {
  usedTokens: number;
  contextWindow: number;
}

export type ContextWindowBySession = Record<string, ContextWindow | null>;

type ContextWindowEvent = Extract<CoreEvent, { event: "context_window" }>;

/** Reject malformed/unsafe provider numbers rather than rendering a misleading capacity. */
export function contextWindowFromEvent(event: ContextWindowEvent): ContextWindow | null {
  const usedTokens = event.used_tokens;
  const contextWindow = event.context_window;
  if (
    !Number.isSafeInteger(usedTokens) ||
    usedTokens < 0 ||
    !Number.isSafeInteger(contextWindow) ||
    contextWindow <= 0
  ) {
    return null;
  }
  return { usedTokens, contextWindow };
}

/** Keep provider state partitioned by session so background events cannot repaint the active chat. */
export function updateContextWindow(
  current: ContextWindowBySession,
  event: ContextWindowEvent,
): ContextWindowBySession {
  return { ...current, [event.session]: contextWindowFromEvent(event) };
}

export function clearContextWindow(
  current: ContextWindowBySession,
  session: string,
): ContextWindowBySession {
  if (!(session in current) || current[session] === null) return current;
  return { ...current, [session]: null };
}

export function activeContextWindow(
  current: ContextWindowBySession,
  session: string | null,
): ContextWindow | null {
  return session ? current[session] ?? null : null;
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

/** Compact labels fit the Composer row while retaining enough precision for a glance. */
export function formatContextTokens(tokens: number): string {
  if (!Number.isSafeInteger(tokens) || tokens < 0) return "—";
  if (tokens < 1_000) return String(tokens);
  if (tokens < 1_000_000) return `${trimDecimal(tokens / 1_000)}k`;
  if (tokens < 1_000_000_000) return `${trimDecimal(tokens / 1_000_000)}m`;
  return `${trimDecimal(tokens / 1_000_000_000)}b`;
}

/** Exact labels are used for the accessible/native tooltip. */
export function formatExactContextTokens(tokens: number): string {
  return Number.isSafeInteger(tokens) && tokens >= 0 ? tokens.toLocaleString("en-US") : "—";
}

export function contextWindowPercentage(value: ContextWindow): number | null {
  if (
    !Number.isSafeInteger(value.usedTokens) ||
    value.usedTokens < 0 ||
    !Number.isSafeInteger(value.contextWindow) ||
    value.contextWindow <= 0
  ) {
    return null;
  }
  return (value.usedTokens / value.contextWindow) * 100;
}

export function formatContextWindowPercentage(value: ContextWindow): string {
  const percentage = contextWindowPercentage(value);
  return percentage === null ? "—" : `${trimDecimal(percentage)}%`;
}

export interface ContextWindowDisplay {
  compact: string;
  capacity: string;
  exact: string;
  percentage: number | null;
}

export function describeContextWindow(value: ContextWindow | null): ContextWindowDisplay | null {
  if (!value || contextWindowPercentage(value) === null) return null;
  const percentage = contextWindowPercentage(value);
  return {
    compact: `${formatContextTokens(value.usedTokens)} / ${formatContextTokens(value.contextWindow)}`,
    capacity: formatContextTokens(value.contextWindow),
    exact: `${formatExactContextTokens(value.usedTokens)} / ${formatExactContextTokens(value.contextWindow)} tokens (${formatContextWindowPercentage(value)})`,
    percentage,
  };
}
