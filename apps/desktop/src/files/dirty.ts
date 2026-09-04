/**
 * Which open files have unsaved edits, as a tiny external store.
 *
 * Lives outside ./monaco on purpose: the Dock's tab strip and App's close-tab guard need this
 * synchronously at startup, and importing anything from the Monaco chunk would drag megabytes of
 * editor into the boot bundle. The editor side writes here; everyone else only reads.
 */
import { useSyncExternalStore } from "react";

const dirty = new Set<string>();
const subs = new Set<() => void>();
// useSyncExternalStore compares snapshots by identity, so hand out a frozen copy per change.
let snapshot: ReadonlySet<string> = new Set();

export function dirtyKey(cwd: string, path: string): string {
  return `${cwd.replace(/\/$/, "")}/${path}`;
}

export function markDirty(key: string, value: boolean): void {
  if (value === dirty.has(key)) {
    return;
  }
  if (value) {
    dirty.add(key);
  } else {
    dirty.delete(key);
  }
  snapshot = new Set(dirty);
  for (const function_ of subs) {
    function_();
  }
}

export function isDirty(key: string): boolean {
  return dirty.has(key);
}

export function useDirtyPaths(): ReadonlySet<string> {
  return useSyncExternalStore(
    (function_) => {
      subs.add(function_);
      return () => subs.delete(function_);
    },
    () => snapshot
  );
}
