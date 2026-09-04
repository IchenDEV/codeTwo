/**
 * Intentional unknown→T boundary for desktop IPC / host RPC results.
 * Callers choose T; the wire value is unknown until this point.
 */
export function assertIpcResult<T>(value: unknown): T {
  return value as T;
}

/**
 * DOM `CustomEvent.detail` and similar lib.dom values are typed as `any`.
 * Collapse them to unknown once before field-level guards.
 */
export function fromDomAny(value: any): unknown {
  return value;
}
