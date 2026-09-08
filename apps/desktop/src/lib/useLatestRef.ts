import { useCallback, useRef } from "react";

/**
 * Keep a ref pointed at the latest value. On React 18 this syncs during render
 * (the documented "latest ref" pattern) so effects can call unstable callbacks
 * without re-subscribing every render.
 */
export function useLatestRef<T>(value: T): { readonly current: T } {
  const reference = useRef(value);
  reference.current = value;
  return reference;
}

/** Stable subscription callback that dispatches to the latest render's implementation. */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result
): (...args: Args) => Result {
  const latest = useLatestRef(callback);
  return useCallback((...args: Args) => latest.current(...args), [latest]);
}
