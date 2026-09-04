/**
 * Intentional unknown→T boundary for desktop IPC / host RPC results.
 * Callers choose T; the wire value is unknown until this point.
 */
export function assertIpcResult(value: unknown): unknown {
  return value;
}

/**
 * DOM `CustomEvent.detail` and similar lib.dom values are typed as `any`.
 * Collapse them to unknown once before field-level guards.
 */
export function fromDomAny(value: any): unknown {
  return value;
}
