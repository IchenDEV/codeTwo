import { describe, expect, test } from "bun:test";

import { filterMemories, memoryProfile } from "./memory-model";
import type { MemoryFilter } from "./memory-model";
import type { MemoryRecord } from "../bridge";

const NOW = 2_000_000_000_000;

function record(patch: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    access_count: 0,
    accessed_at: null,
    active: true,
    category: "fact",
    confidence: 0.9,
    conflict_reason: null,
    conflict_with_id: null,
    content: "Use the project formatter before tests.",
    created_at: NOW - 10_000,
    editable: false,
    forgotten_at: null,
    id: crypto.randomUUID(),
    layer: "L1",
    origin: "automatic",
    pinned: false,
    project_path: "/work",
    relevance: null,
    session_id: "session",
    sources: [{ part_seq: 1, session_id: "session" }],
    supersedes_id: null,
    updated_at: NOW - 5000,
    ...patch,
  };
}

const base: MemoryFilter = {
  category: "all",
  origin: "all",
  query: "",
  sort: "activity",
  view: "all",
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
      category: "profile",
      id: "profile",
      layer: "L3",
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
      active: false,
      forgotten_at: NOW - 20,
      id: "forgotten",
    });
    const conflict = record({
      active: false,
      conflict_with_id: "correction",
      id: "conflict",
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
      category: "constraint",
      content: "Never commit generated output.",
      id: "constraint",
    });
    const episode = record({
      category: "episode",
      content: "Built the renderer.",
      id: "episode",
      layer: "L2",
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
