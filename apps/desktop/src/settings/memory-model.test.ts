import { describe, expect, test } from "bun:test";

import type { MemoryRecord } from "../bridge";
import {
  filterMemories,
  memoryProfile,
  type MemoryFilter,
} from "./memory-model";

const NOW = 2_000_000_000_000;

function record(patch: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: crypto.randomUUID(),
    project_path: "/work",
    session_id: "session",
    layer: "L1",
    category: "fact",
    content: "Use the project formatter before tests.",
    confidence: 0.9,
    sources: [{ session_id: "session", part_seq: 1 }],
    pinned: false,
    active: true,
    created_at: NOW - 10_000,
    updated_at: NOW - 5_000,
    accessed_at: null,
    access_count: 0,
    origin: "automatic",
    forgotten_at: null,
    supersedes_id: null,
    conflict_with_id: null,
    conflict_reason: null,
    relevance: null,
    editable: false,
    ...patch,
  };
}

const base: MemoryFilter = {
  query: "",
  view: "all",
  category: "all",
  origin: "all",
  sort: "activity",
};

describe("memory management filtering", () => {
  test("keeps profiles out of the item list and pinned items first", () => {
    const ordinary = record({ id: "ordinary", updated_at: NOW });
    const pinned = record({
      id: "pinned",
      pinned: true,
      updated_at: NOW - 100,
    });
    const profile = record({
      id: "profile",
      layer: "L3",
      category: "profile",
      origin: "profile",
    });
    expect(
      filterMemories([ordinary, profile, pinned], base, NOW).map(
        (item) => item.id
      )
    ).toEqual(["pinned", "ordinary"]);
    expect(memoryProfile([ordinary, profile])).toEqual(profile);
  });

  test("separates forgotten and conflicted records from active memory", () => {
    const forgotten = record({
      id: "forgotten",
      active: false,
      forgotten_at: NOW - 20,
    });
    const conflict = record({
      id: "conflict",
      active: false,
      conflict_with_id: "correction",
    });
    expect(filterMemories([forgotten, conflict], base, NOW)).toEqual([]);
    expect(
      filterMemories(
        [forgotten, conflict],
        { ...base, view: "forgotten" },
        NOW
      ).map((item) => item.id)
    ).toEqual(["forgotten"]);
    expect(
      filterMemories(
        [forgotten, conflict],
        { ...base, view: "conflicts" },
        NOW
      ).map((item) => item.id)
    ).toEqual(["conflict"]);
  });

  test("uses deterministic content search and semantic category views", () => {
    const constraint = record({
      id: "constraint",
      category: "constraint",
      content: "Never commit generated output.",
    });
    const episode = record({
      id: "episode",
      layer: "L2",
      category: "episode",
      content: "Built the renderer.",
    });
    expect(
      filterMemories(
        [constraint, episode],
        { ...base, view: "constraints" },
        NOW
      ).map((item) => item.id)
    ).toEqual(["constraint"]);
    expect(
      filterMemories(
        [constraint, episode],
        { ...base, query: "renderer" },
        NOW
      ).map((item) => item.id)
    ).toEqual(["episode"]);
  });
});
