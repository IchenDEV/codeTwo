import { asJsonObject } from "../lib/jsonValue";

export const browserHistoryStorageKey = "codetwo.browser-history:v1";

const historyVersion = 1 as const;
const maxProjects = 24;
const maxSitesPerProject = 8;
const maxProjectKeyLength = 4096;
const maxUrlLength = 2048;
const maxTitleLength = 120;

export interface RecentSite {
  url: string;
  title: string | null;
  last_visited_at: number;
}

interface ProjectHistory {
  project: string;
  sites: RecentSite[];
}

export interface BrowserHistoryState {
  version: typeof historyVersion;
  projects: ProjectHistory[];
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export const emptyBrowserHistory: BrowserHistoryState = {
  projects: [],
  version: historyVersion,
};

function cleanProject(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const project = value.trim();
  return project && project.length <= maxProjectKeyLength ? project : null;
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const title = value.replaceAll(/\s+/gu, " ").trim();
  if (!title) {
    return null;
  }
  return title.slice(0, maxTitleLength);
}

export function normalizeHistoryUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > maxUrlLength) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.username = "";
    url.password = "";
    url.hash = "";
    if (["0.0.0.0", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      url.hostname = "localhost";
    }
    const normalized = url.toString();
    return normalized.length <= maxUrlLength ? normalized : null;
  } catch {
    return null;
  }
}

function cleanTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

export function sanitizeBrowserHistory(value: unknown): BrowserHistoryState {
  const root = asJsonObject(value);
  if (root == null) {
    return emptyBrowserHistory;
  }
  if (root.version !== historyVersion) {
    return emptyBrowserHistory;
  }
  const rawProjects = root.projects;
  if (!Array.isArray(rawProjects)) {
    return emptyBrowserHistory;
  }

  const projects: ProjectHistory[] = [];
  const seenProjects = new Set<string>();
  for (const rawProject of rawProjects) {
    const projectRecord = asJsonObject(rawProject);
    if (projectRecord == null) {
      continue;
    }
    const project = cleanProject(projectRecord.project);
    const rawSites = projectRecord.sites;
    if (
      project == null ||
      project === "" ||
      seenProjects.has(project) ||
      !Array.isArray(rawSites)
    ) {
      continue;
    }

    const sites: RecentSite[] = [];
    const seenUrls = new Set<string>();
    for (const rawSite of rawSites) {
      const record = asJsonObject(rawSite);
      if (record == null) {
        continue;
      }
      const url = normalizeHistoryUrl(record.url);
      const lastVisitedAt = cleanTimestamp(record.last_visited_at);
      if (
        url == null ||
        url === "" ||
        lastVisitedAt == null ||
        seenUrls.has(url)
      ) {
        continue;
      }
      seenUrls.add(url);
      sites.push({
        last_visited_at: lastVisitedAt,
        title: cleanTitle(record.title),
        url,
      });
    }
    sites.sort((a, b) => b.last_visited_at - a.last_visited_at);
    if (sites.length === 0) {
      continue;
    }
    seenProjects.add(project);
    projects.push({ project, sites: sites.slice(0, maxSitesPerProject) });
  }

  projects.sort(
    (a, b) =>
      (b.sites[0]?.last_visited_at ?? 0) - (a.sites[0]?.last_visited_at ?? 0)
  );
  return {
    projects: projects.slice(0, maxProjects),
    version: historyVersion,
  };
}

export function recentSitesForProject(
  state: BrowserHistoryState,
  project: string | null | undefined
): RecentSite[] {
  const key = cleanProject(project);
  if (key == null || key === "") {
    return [];
  }
  return state.projects.find((entry) => entry.project === key)?.sites ?? [];
}

export function recordBrowserVisit(
  state: BrowserHistoryState,
  project: string,
  rawUrl: string,
  rawTitle: string | null,
  visitedAt: number
): BrowserHistoryState {
  const key = cleanProject(project);
  const url = normalizeHistoryUrl(rawUrl);
  const timestamp = cleanTimestamp(visitedAt);
  if (
    key == null ||
    key === "" ||
    url == null ||
    url === "" ||
    timestamp == null
  ) {
    return state;
  }

  const current = recentSitesForProject(state, key);
  const previous = current.find((site) => site.url === url);
  const site: RecentSite = {
    last_visited_at: timestamp,
    title: cleanTitle(rawTitle) ?? previous?.title ?? null,
    url,
  };
  const sites = [site, ...current.filter((entry) => entry.url !== url)].slice(
    0,
    maxSitesPerProject
  );
  const projects = [
    { project: key, sites },
    ...state.projects.filter((entry) => entry.project !== key),
  ].slice(0, maxProjects);
  return { projects, version: historyVersion };
}

export function updateBrowserVisitTitle(
  state: BrowserHistoryState,
  project: string,
  rawUrl: string,
  rawTitle: string
): BrowserHistoryState {
  const key = cleanProject(project);
  const url = normalizeHistoryUrl(rawUrl);
  const title = cleanTitle(rawTitle);
  if (
    key == null ||
    key === "" ||
    url == null ||
    url === "" ||
    title == null ||
    title === ""
  ) {
    return state;
  }
  let isChanged = false;
  const projects = state.projects.map((entry) => {
    if (entry.project !== key) {
      return entry;
    }
    const sites = entry.sites.map((site) => {
      if (site.url !== url || site.title === title) {
        return site;
      }
      isChanged = true;
      return { ...site, title };
    });
    return isChanged ? { ...entry, sites } : entry;
  });
  return isChanged ? { ...state, projects } : state;
}

export function removeBrowserVisit(
  state: BrowserHistoryState,
  project: string,
  rawUrl: string
): BrowserHistoryState {
  const key = cleanProject(project);
  const url = normalizeHistoryUrl(rawUrl);
  if (key == null || key === "" || url == null || url === "") {
    return state;
  }
  let isChanged = false;
  const projects = state.projects.flatMap((entry) => {
    if (entry.project !== key) {
      return [entry];
    }
    const sites = entry.sites.filter((site) => site.url !== url);
    if (sites.length === entry.sites.length) {
      return [entry];
    }
    isChanged = true;
    return sites.length > 0 ? [{ ...entry, sites }] : [];
  });
  return isChanged ? { ...state, projects } : state;
}

export function removeBrowserProject(
  state: BrowserHistoryState,
  project: string
): BrowserHistoryState {
  const key = cleanProject(project);
  if (key == null || key === "") {
    return state;
  }
  const projects = state.projects.filter((entry) => entry.project !== key);
  return projects.length === state.projects.length
    ? state
    : { ...state, projects };
}

export function loadBrowserHistory(
  storage: StorageLike | null | undefined
): BrowserHistoryState {
  if (!storage) {
    return emptyBrowserHistory;
  }
  try {
    const raw = storage.getItem(browserHistoryStorageKey);
    return raw != null && raw !== ""
      ? sanitizeBrowserHistory(JSON.parse(raw))
      : emptyBrowserHistory;
  } catch {
    return emptyBrowserHistory;
  }
}

export function saveBrowserHistory(
  storage: StorageLike | null | undefined,
  state: BrowserHistoryState
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(browserHistoryStorageKey, JSON.stringify(state));
  } catch {
    // Private browsing, a disabled store, or quota pressure must not break navigation.
  }
}
