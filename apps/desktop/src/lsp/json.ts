/**
 * Narrow helpers for untyped LSP JSON-RPC payloads.
 * Prefer these over `any` / unchecked `as` so no-unsafe-* stays meaningful.
 */

export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function asJsonObject(value: unknown): JsonObject | null {
  return isJsonObject(value) ? value : null;
}

export function asJsonArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

export function stringField(
  object: JsonObject | null | undefined,
  key: string
): string | null {
  const value = object?.[key];
  return typeof value === "string" ? value : null;
}

export function numberField(
  object: JsonObject | null | undefined,
  key: string,
  fallback = 0
): number {
  const value = object?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function booleanField(
  object: JsonObject | null | undefined,
  key: string
): boolean | null {
  const value = object?.[key];
  return typeof value === "boolean" ? value : null;
}

export function objectField(
  object: JsonObject | null | undefined,
  key: string
): JsonObject | null {
  return asJsonObject(object?.[key]);
}

export function arrayField(
  object: JsonObject | null | undefined,
  key: string
): unknown[] | null {
  return asJsonArray(object?.[key]);
}

export function parseJsonPayload(payload: string): unknown {
  // JSON.parse is typed as `any` in lib.es5; wrap once at the wire boundary.
  return JSON.parse(payload) as unknown;
}
