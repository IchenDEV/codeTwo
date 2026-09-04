import type { CSSProperties } from "react";

/**
 * Build a React style object that may include CSS custom properties (`--*`).
 * React's CSSProperties index signature does not admit arbitrary custom props
 * without a boundary cast; keep that cast here instead of at call sites.
 */
export function cssVars(
  vars: Record<string, string | number | undefined>
): CSSProperties {
  return vars as CSSProperties;
}
