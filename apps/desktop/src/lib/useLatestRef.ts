import { useRef } from "react";

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
