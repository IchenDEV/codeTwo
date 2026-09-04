import { asJsonObject } from "../lib/jsonValue";

export const sidebarProjectsStorageKey = "codetwo.rail.projects.v1";
export const rootProjectOrderKey = "root";

export interface SidebarProjectsState {
  version: 1;
  assignments: Record<string, string>;
  order: Record<string, string[]>;
  collapsed: Record<string, boolean>;
}

function emptyState(): SidebarProjectsState {
  return { assignments: {}, collapsed: {}, order: {}, version: 1 };
}

function cleanPathLists(value: unknown): Record<string, string[]> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string[]> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (key === "" || !Array.isArray(candidate)) {
      continue;
    }
    const paths = [
      ...new Set(
        candidate
          .filter(
            (path): path is string =>
              typeof path === "string" && path.trim() !== ""
          )
          .map((path) => path.trim())
      ),
    ].slice(0, 2000);
    if (paths.length > 0) {
      result[key] = paths;
    }
  }
  return result;
}

export function loadSidebarProjects(
  storage: Pick<Storage, "getItem"> | null
): SidebarProjectsState {
  if (!storage) {
    return emptyState();
  }
  try {
    const raw = storage.getItem(sidebarProjectsStorageKey);
    if (raw == null || raw === "") {
      return emptyState();
    }
    const value = asJsonObject(JSON.parse(raw) as unknown);
    if (value == null || value.version !== 1) {
      return emptyState();
    }
    const assignments: Record<string, string> = {};
    const assignmentsObject = asJsonObject(value.assignments);
    if (assignmentsObject != null) {
      for (const [path, sectionId] of Object.entries(assignmentsObject)) {
        if (path !== "" && typeof sectionId === "string" && sectionId !== "") {
          assignments[path] = sectionId;
        }
      }
    }
    const collapsed: Record<string, boolean> = {};
    const collapsedObject = asJsonObject(value.collapsed);
    if (collapsedObject != null) {
      for (const [path, isCollapsed] of Object.entries(collapsedObject)) {
        if (path !== "" && isCollapsed === true) {
          collapsed[path] = true;
        }
      }
    }
    return {
      assignments,
      collapsed,
      order: cleanPathLists(value.order),
      version: 1,
    };
  } catch {
    return emptyState();
  }
}

export function saveSidebarProjects(
  storage: Pick<Storage, "setItem"> | null,
  state: SidebarProjectsState
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(sidebarProjectsStorageKey, JSON.stringify(state));
  } catch {
    // A private/full store makes this renderer-only without changing Project or Task data.
  }
}

export function sortSidebarProjects<T extends { path: string }>(
  projects: readonly T[],
  orderedPaths: readonly string[] | undefined
): T[] {
  if (!orderedPaths || orderedPaths.length === 0) {
    return [...projects];
  }
  const positions = new Map(orderedPaths.map((path, index) => [path, index]));
  const unordered: T[] = [];
  const ordered: T[] = [];
  for (const project of projects) {
    if (positions.has(project.path)) {
      ordered.push(project);
    } else {
      unordered.push(project);
    }
  }
  ordered.sort(
    (left, right) => positions.get(left.path)! - positions.get(right.path)!
  );
  return [...unordered, ...ordered];
}

function orderKey(sectionId: string | null): string {
  return sectionId ?? rootProjectOrderKey;
}

export function moveSidebarProject(
  state: SidebarProjectsState,
  path: string,
  sectionId: string | null,
  beforePath: string | null,
  destinationPaths: readonly string[]
): SidebarProjectsState {
  if (!path) {
    return state;
  }
  const destination = destinationPaths.filter(
    (candidate, index) =>
      candidate !== path && destinationPaths.indexOf(candidate) === index
  );
  const index =
    beforePath === null ? destination.length : destination.indexOf(beforePath);
  if (index < 0) {
    return state;
  }
  destination.splice(index, 0, path);

  const assignments = { ...state.assignments };
  if (sectionId != null && sectionId !== "") {
    assignments[path] = sectionId;
  } else {
    delete assignments[path];
  }
  const order = Object.fromEntries(
    Object.entries(state.order)
      .map(
        ([key, paths]) =>
          [key, paths.filter((candidate) => candidate !== path)] as const
      )
      .filter(([, paths]) => paths.length > 0)
  );
  order[orderKey(sectionId)] = destination;
  return { ...state, assignments, order };
}

export function setSidebarProjectCollapsed(
  state: SidebarProjectsState,
  path: string,
  isCollapsed: boolean
): SidebarProjectsState {
  if ((state.collapsed[path] ?? false) === isCollapsed) {
    return state;
  }
  const next = { ...state.collapsed };
  if (isCollapsed) {
    next[path] = true;
  } else {
    delete next[path];
  }
  return { ...state, collapsed: next };
}

export function releaseSidebarSectionProjects(
  state: SidebarProjectsState,
  sectionId: string
): SidebarProjectsState {
  const released = Object.entries(state.assignments)
    .filter(([, assigned]) => assigned === sectionId)
    .map(([path]) => path);
  if (released.length === 0 && !Boolean(state.order[sectionId])) {
    return state;
  }
  const assignments = Object.fromEntries(
    Object.entries(state.assignments).filter(
      ([, assigned]) => assigned !== sectionId
    )
  );
  const order = { ...state.order };
  const root = order[rootProjectOrderKey] ?? [];
  const moved = order[sectionId] ?? released;
  const mergedRoot = new Set<string>();
  for (const path of root) {
    mergedRoot.add(path);
  }
  for (const path of moved) {
    mergedRoot.add(path);
  }
  order[rootProjectOrderKey] = [...mergedRoot];
  delete order[sectionId];
  return { ...state, assignments, order };
}
