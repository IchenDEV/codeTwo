import { useCallback, useEffect, useRef, useState } from "react";

import { pluginSnapshot } from "../bridge";
import type { ManagedPluginScope, PluginSnapshot } from "../bridge";

/** Commit inventory and policy together, and never let an older refresh replace a newer one. */
export function usePluginSnapshot(fetchSnapshot = pluginSnapshot) {
  const [snapshot, setSnapshot] = useState<PluginSnapshot | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );
  const refresh = useCallback(
    async (scopes: ManagedPluginScope[]) => {
      const request = ++generation.current;
      const next = await fetchSnapshot(scopes);
      if (request === generation.current) setSnapshot(next);
      return next;
    },
    [fetchSnapshot]
  );
  return { snapshot, refresh };
}
