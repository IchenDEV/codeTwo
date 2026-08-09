export const BROWSER_HISTORY_STORAGE_KEY = "codetwo.browser-history:v1";

const HISTORY_VERSION = 1 as const;
const MAX_PROJECTS = 24;
const MAX_SITES_PER_PROJECT = 8;
const MAX_PROJECT_KEY_LENGTH = 4096;
const MAX_URL_LENGTH = 2048;
const MAX_TITLE_LENGTH = 120;

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
  version: typeof HISTORY_VERSION;
  projects: ProjectHistory[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const EMPTY_BROWSER_HISTORY: BrowserHistoryState = {
  version: HISTORY_VERSION,
  projects: [],
};

function cleanProject(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const project = value.trim();
  return project && project.length <= MAX_PROJECT_KEY_LENGTH ? project : null;
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.replace(/\s+/g, " ").trim();
  if (!title) return null;
  return title.slice(0, MAX_TITLE_LENGTH);
}

/** Keep persisted history navigable and never retain credentials or fragments. */
export function normalizeHistoryUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    url.hash = "";
    if (["0.0.0.0", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      url.hostname = "localhost";
    }
    const normalized = url.toString();
    return normalized.length <= MAX_URL_LENGTH ? normalized : null;
  } catch {
    return null;
  }
}

function cleanTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Re-validate every persisted value so malformed or older data never reaches the Browser UI. */
export function sanitizeBrowserHistory(value: unknown): BrowserHistoryState {
  if (!value || typeof value !== "object") return EMPTY_BROWSER_HISTORY;
  if ((value as { version?: unknown }).version !== HISTORY_VERSION) {
    return EMPTY_BROWSER_HISTORY;
  }
  const rawProjects = (value as { projects?: unknown }).projects;
  if (!Array.isArray(rawProjects)) return EMPTY_BROWSER_HISTORY;

  const projects: ProjectHistory[] = [];
  const seenProjects = new Set<string>();
  for (const rawProject of rawProjects) {
    if (!rawProject || typeof rawProject !== "object") continue;
    const project = cleanProject((rawProject as { project?: unknown }).project);
    const rawSites = (rawProject as { sites?: unknown }).sites;
    if (!project || seenProjects.has(project) || !Array.isArray(rawSites)) continue;

    const sites: RecentSite[] = [];
    const seenUrls = new Set<string>();
    for (const rawSite of rawSites) {
      if (!rawSite || typeof rawSite !== "object") continue;
      const record = rawSite as { url?: unknown; title?: unknown; last_visited_at?: unknown };
      const url = normalizeHistoryUrl(record.url);
      const lastVisitedAt = cleanTimestamp(record.last_visited_at);
      if (!url || !lastVisitedAt || seenUrls.has(url)) continue;
      seenUrls.add(url);
      sites.push({ url, title: cleanTitle(record.title), last_visited_at: lastVisitedAt });
    }
    sites.sort((a, b) => b.last_visited_at - a.last_visited_at);
    if (sites.length === 0) continue;
    seenProjects.add(project);
    projects.push({ project, sites: sites.slice(0, MAX_SITES_PER_PROJECT) });
  }

  projects.sort(
    (a, b) => (b.sites[0]?.last_visited_at ?? 0) - (a.sites[0]?.last_visited_at ?? 0),
  );
  return { version: HISTORY_VERSION, projects: projects.slice(0, MAX_PROJECTS) };
}

export function recentSitesForProject(
  state: BrowserHistoryState,
  project: string | null | undefined,
): RecentSite[] {
  const key = cleanProject(project);
  if (!key) return [];
  return state.projects.find((entry) => entry.project === key)?.sites ?? [];
}

export function recordBrowserVisit(
  state: BrowserHistoryState,
  project: string,
  rawUrl: string,
  rawTitle: string | null,
  visitedAt: number,
): BrowserHistoryState {
  const key = cleanProject(project);
  const url = normalizeHistoryUrl(rawUrl);
  const timestamp = cleanTimestamp(visitedAt);
  if (!key || !url || !timestamp) return state;

  const current = recentSitesForProject(state, key);
  const previous = current.find((site) => site.url === url);
  const site: RecentSite = {
    url,
    title: cleanTitle(rawTitle) ?? previous?.title ?? null,
    last_visited_at: timestamp,
  };
  const sites = [site, ...current.filter((entry) => entry.url !== url)].slice(
    0,
    MAX_SITES_PER_PROJECT,
  );
  const projects = [
    { project: key, sites },
    ...state.projects.filter((entry) => entry.project !== key),
  ].slice(0, MAX_PROJECTS);
  return { version: HISTORY_VERSION, projects };
}

export function updateBrowserVisitTitle(
  state: BrowserHistoryState,
  project: string,
  rawUrl: string,
  rawTitle: string,
): BrowserHistoryState {
  const key = cleanProject(project);
  const url = normalizeHistoryUrl(rawUrl);
  const title = cleanTitle(rawTitle);
  if (!key || !url || !title) return state;
  let changed = false;
  const projects = state.projects.map((entry) => {
    if (entry.project !== key) return entry;
    const sites = entry.sites.map((site) => {
      if (site.url !== url || site.title === title) return site;
      changed = true;
      return { ...site, title };
    });
    return changed ? { ...entry, sites } : entry;
  });
  return changed ? { ...state, projects } : state;
}

export function removeBrowserVisit(
  state: BrowserHistoryState,
  project: string,
  rawUrl: string,
): BrowserHistoryState {
  const key = cleanProject(project);
  const url = normalizeHistoryUrl(rawUrl);
  if (!key || !url) return state;
  let changed = false;
  const projects = state.projects.flatMap((entry) => {
    if (entry.project !== key) return [entry];
    const sites = entry.sites.filter((site) => site.url !== url);
    if (sites.length === entry.sites.length) return [entry];
    changed = true;
    return sites.length > 0 ? [{ ...entry, sites }] : [];
  });
  return changed ? { ...state, projects } : state;
}

export function removeBrowserProject(
  state: BrowserHistoryState,
  project: string,
): BrowserHistoryState {
  const key = cleanProject(project);
  if (!key) return state;
  const projects = state.projects.filter((entry) => entry.project !== key);
  return projects.length === state.projects.length ? state : { ...state, projects };
}

export function loadBrowserHistory(storage: StorageLike | null | undefined): BrowserHistoryState {
  if (!storage) return EMPTY_BROWSER_HISTORY;
  try {
    const raw = storage.getItem(BROWSER_HISTORY_STORAGE_KEY);
    return raw ? sanitizeBrowserHistory(JSON.parse(raw)) : EMPTY_BROWSER_HISTORY;
  } catch {
    return EMPTY_BROWSER_HISTORY;
  }
}

export function saveBrowserHistory(
  storage: StorageLike | null | undefined,
  state: BrowserHistoryState,
): void {
  if (!storage) return;
  try {
    storage.setItem(BROWSER_HISTORY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing, a disabled store, or quota pressure must not break navigation.
  }
}
