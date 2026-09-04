import type { MemoryRecord } from "../bridge";

export type MemoryView =
  | "all"
  | "pinned"
  | "constraints"
  | "facts"
  | "episodes"
  | "recent"
  | "forgotten"
  | "conflicts";

export type MemorySort = "activity" | "updated" | "used";

export interface MemoryFilter {
  query: string;
  view: MemoryView;
  category: string;
  origin: string;
  sort: MemorySort;
}

export const memoryCategories = [
  "constraint",
  "preference",
  "fact",
  "relationship",
  "event",
  "episode",
] as const;

export function memoryActivityAt(record: MemoryRecord): number {
  return Math.max(record.updated_at, record.accessed_at ?? 0);
}

function matchesView(
  record: MemoryRecord,
  view: MemoryView,
  recentSince: number
): boolean {
  if (record.layer === "L3") {
    return false;
  }
  if (view === "forgotten") {
    return !record.active && record.forgotten_at !== null;
  }
  if (view === "conflicts") {
    return record.conflict_with_id !== null;
  }
  if (!record.active || record.conflict_with_id !== null) {
    return false;
  }
  switch (view) {
    case "pinned": {
      return record.pinned;
    }
    case "constraints": {
      return (
        record.category === "constraint" || record.category === "preference"
      );
    }
    case "facts": {
      return ["fact", "relationship", "event"].includes(record.category);
    }
    case "episodes": {
      return record.category === "episode" || record.layer === "L2";
    }
    case "recent": {
      return record.accessed_at !== null && record.accessed_at >= recentSince;
    }
    default: {
      return true;
    }
  }
}

export function filterMemories(
  records: readonly MemoryRecord[],
  filter: MemoryFilter,
  now = Date.now()
): MemoryRecord[] {
  const query = filter.query.trim().toLocaleLowerCase();
  const recentSince = now - 30 * 24 * 60 * 60 * 1000;
  return records
    .filter((record) => matchesView(record, filter.view, recentSince))
    .filter(
      (record) =>
        filter.category === "all" || record.category === filter.category
    )
    .filter(
      (record) => filter.origin === "all" || record.origin === filter.origin
    )
    .filter((record) => {
      if (!query) {
        return true;
      }
      return [record.content, record.category, record.origin].some((value) =>
        value.toLocaleLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      if (filter.view === "all" && left.pinned !== right.pinned) {
        return left.pinned ? -1 : 1;
      }
      if (filter.sort === "used") {
        return (
          right.access_count - left.access_count ||
          memoryActivityAt(right) - memoryActivityAt(left)
        );
      }
      if (filter.sort === "updated") {
        return right.updated_at - left.updated_at;
      }
      return memoryActivityAt(right) - memoryActivityAt(left);
    });
}

export function memoryProfile(
  records: readonly MemoryRecord[]
): MemoryRecord | null {
  return (
    records.find((record) => record.layer === "L3" && record.active) ?? null
  );
}

export function originLabelKey(
  origin: MemoryRecord["origin"]
):
  | "memory.origin.manual"
  | "memory.origin.automatic"
  | "memory.origin.userCorrection"
  | "memory.origin.profile" {
  switch (origin) {
    case "manual": {
      return "memory.origin.manual";
    }
    case "user_correction": {
      return "memory.origin.userCorrection";
    }
    case "profile": {
      return "memory.origin.profile";
    }
    default: {
      return "memory.origin.automatic";
    }
  }
}
