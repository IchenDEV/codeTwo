import type { CoreEvent } from "../bridge";

/**
One slice of the context window occupied by a named category.
*/
export interface ContextCategory {
  id: string;
  tokens: number;
}

/**
Provider-reported context state. This is intentionally not the rolling account quota shape.
*/
export interface ContextWindow {
  usedTokens: number;
  contextWindow: number;
  /**
  Per-category breakdown when the provider reports detailed occupancy.
  */
  breakdown: ContextCategory[] | null;
}

export type ContextWindowBySession = Record<string, ContextWindow | null>;

type ContextWindowEvent = Extract<CoreEvent, { event: "context_window" }>;

export function contextWindowFromEvent(
  event: ContextWindowEvent
): ContextWindow | null {
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
  const rawBreakdown = event.breakdown;
  let breakdown: ContextCategory[] | null = null;
  if (Array.isArray(rawBreakdown) && rawBreakdown.length > 0) {
    breakdown = rawBreakdown
      .filter((entry): entry is { id: string; tokens: number } => {
        return (
          typeof entry?.id === "string" &&
          entry.id.length > 0 &&
          Number.isSafeInteger(entry?.tokens) &&
          entry.tokens >= 0
        );
      })
      .map(({ id, tokens }) => ({ id, tokens }));
    if (breakdown.length === 0) {
      breakdown = null;
    }
  }
  return { breakdown, contextWindow, usedTokens };
}

export function updateContextWindow(
  current: ContextWindowBySession,
  event: ContextWindowEvent
): ContextWindowBySession {
  return { ...current, [event.session]: contextWindowFromEvent(event) };
}

export function clearContextWindow(
  current: ContextWindowBySession,
  session: string
): ContextWindowBySession {
  if (!(session in current) || current[session] === null) {
    return current;
  }
  return { ...current, [session]: null };
}

export function activeContextWindow(
  current: ContextWindowBySession,
  session: string | null
): ContextWindow | null {
  return session != null && session !== "" ? (current[session] ?? null) : null;
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/u, "");
}

export function formatContextTokens(tokens: number): string {
  if (!Number.isSafeInteger(tokens) || tokens < 0) {
    return "—";
  }
  if (tokens < 1000) {
    return String(tokens);
  }
  if (tokens < 1_000_000) {
    return `${trimDecimal(tokens / 1000)}k`;
  }
  if (tokens < 1_000_000_000) {
    return `${trimDecimal(tokens / 1_000_000)}m`;
  }
  return `${trimDecimal(tokens / 1_000_000_000)}b`;
}

export function formatExactContextTokens(tokens: number): string {
  return Number.isSafeInteger(tokens) && tokens >= 0
    ? tokens.toLocaleString("en-US")
    : "—";
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

export function describeContextWindow(
  value: ContextWindow | null
): ContextWindowDisplay | null {
  if (!value || contextWindowPercentage(value) === null) {
    return null;
  }
  const percentage = contextWindowPercentage(value);
  return {
    capacity: formatContextTokens(value.contextWindow),
    compact: `${formatContextTokens(value.usedTokens)} / ${formatContextTokens(value.contextWindow)}`,
    exact: `${formatExactContextTokens(value.usedTokens)} / ${formatExactContextTokens(value.contextWindow)} tokens (${formatContextWindowPercentage(value)})`,
    percentage,
  };
}
