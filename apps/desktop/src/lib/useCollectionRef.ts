import { useRef } from "react";
import type { MutableRefObject } from "react";

/**
 * Lazy Map ref — avoids allocating a new Map on every render via `useRef(new Map())`.
 */
export function useMapRef<K, V>(): MutableRefObject<Map<K, V>> {
  const reference = useRef<Map<K, V> | null>(null);
  reference.current ??= new Map();
  return reference as MutableRefObject<Map<K, V>>;
}

/**
 * Lazy Set ref — same rationale as `useMapRef`.
 */
export function useSetRef<T>(): MutableRefObject<Set<T>> {
  const reference = useRef<Set<T> | null>(null);
  reference.current ??= new Set();
  return reference as MutableRefObject<Set<T>>;
}
