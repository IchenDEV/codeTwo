import { describe, expect, test } from "bun:test";

import {
  browserHistoryStorageKey,
  emptyBrowserHistory,
  loadBrowserHistory,
  normalizeHistoryUrl,
  recentSitesForProject,
  recordBrowserVisit,
  removeBrowserProject,
  removeBrowserVisit,
  sanitizeBrowserHistory,
  saveBrowserHistory,
  updateBrowserVisitTitle,
} from "../src/browser/history";
import type { StorageLike } from "../src/browser/history";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("per-project browser history", () => {
  test("normalizes aliases and strips credentials and fragments", () => {
    expect(
      normalizeHistoryUrl("http://user:secret@127.0.0.1:3000/path#token")
    ).toBe("http://localhost:3000/path");
    expect(normalizeHistoryUrl("file:///tmp/private")).toBeNull();
    expect(normalizeHistoryUrl("not a url")).toBeNull();
  });

  test("deduplicates by normalized URL while preserving a useful title", () => {
    let state = recordBrowserVisit(
      emptyBrowserHistory,
      "/repo/a",
      "http://127.0.0.1:3000/",
      "Dashboard",
      10
    );
    state = recordBrowserVisit(
      state,
      "/repo/a",
      "http://localhost:3000",
      null,
      20
    );
    state = recordBrowserVisit(
      state,
      "/repo/b",
      "https://example.com/docs",
      "Docs",
      30
    );

    expect(recentSitesForProject(state, "/repo/a")).toEqual([
      {
        url: "http://localhost:3000/",
        title: "Dashboard",
        last_visited_at: 20,
      },
    ]);
    expect(recentSitesForProject(state, "/repo/b")[0]?.title).toBe("Docs");
  });

  test("updates titles without changing recency and removes only the selected project entry", () => {
    let state = recordBrowserVisit(
      emptyBrowserHistory,
      "/repo/a",
      "https://example.com/",
      null,
      10
    );
    state = recordBrowserVisit(
      state,
      "/repo/b",
      "https://example.com/",
      "Other",
      20
    );
    state = updateBrowserVisitTitle(
      state,
      "/repo/a",
      "https://example.com/",
      "  Example   Home "
    );
    expect(recentSitesForProject(state, "/repo/a")[0]).toEqual({
      url: "https://example.com/",
      title: "Example Home",
      last_visited_at: 10,
    });

    state = removeBrowserVisit(state, "/repo/a", "https://example.com/");
    expect(recentSitesForProject(state, "/repo/a")).toEqual([]);
    expect(recentSitesForProject(state, "/repo/b")).toHaveLength(1);

    state = removeBrowserProject(state, "/repo/b");
    expect(recentSitesForProject(state, "/repo/b")).toEqual([]);
  });

  test("sanitizes malformed persisted data and round-trips through a versioned key", () => {
    const storage = new MemoryStorage();
    storage.values.set(
      browserHistoryStorageKey,
      JSON.stringify({
        version: 1,
        projects: [
          {
            project: "/repo/a",
            sites: [
              { url: "javascript:alert(1)", title: "bad", last_visited_at: 1 },
              {
                url: "https://example.com/#secret",
                title: " Good ",
                last_visited_at: 2,
              },
            ],
          },
          { project: "", sites: [] },
        ],
      })
    );

    const loaded = loadBrowserHistory(storage);
    expect(loaded.version).toBe(1);
    expect(recentSitesForProject(loaded, "/repo/a")).toEqual([
      { url: "https://example.com/", title: "Good", last_visited_at: 2 },
    ]);
    saveBrowserHistory(storage, loaded);
    expect(
      sanitizeBrowserHistory(
        JSON.parse(storage.values.get(browserHistoryStorageKey)!)
      )
    ).toEqual(loaded);
    expect(sanitizeBrowserHistory({ ...loaded, version: 99 })).toEqual(
      emptyBrowserHistory
    );
  });
});
