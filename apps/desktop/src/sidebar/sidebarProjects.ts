export const SIDEBAR_PROJECTS_STORAGE_KEY = "codetwo.rail.projects.v1";
export const ROOT_PROJECT_ORDER_KEY = "root";

export interface SidebarProjectsState {
  version: 1;
  assignments: Record<string, string>;
  order: Record<string, string[]>;
  collapsed: Record<string, boolean>;
}

function emptyState(): SidebarProjectsState {
  return { version: 1, assignments: {}, order: {}, collapsed: {} };
}

function cleanPathLists(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string[]> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!key || !Array.isArray(candidate)) {
      continue;
    }
    const paths = [
      ...new Set(
        candidate
          .filter(
            (path): path is string =>
              typeof path === "string" && Boolean(path.trim())
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
    const raw = storage.getItem(SIDEBAR_PROJECTS_STORAGE_KEY);
    if (!raw) {
      return emptyState();
    }
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.version !== 1) {
      return emptyState();
    }
    const assignments =
      value.assignments &&
      typeof value.assignments === "object" &&
      !Array.isArray(value.assignments)
        ? (Object.fromEntries(
            Object.entries(value.assignments).filter(
              ([path, sectionId]) =>
                path && typeof sectionId === "string" && Boolean(sectionId)
            )
          ) as Record<string, string>)
        : {};
    const collapsed =
      value.collapsed &&
      typeof value.collapsed === "object" &&
      !Array.isArray(value.collapsed)
        ? (Object.fromEntries(
            Object.entries(value.collapsed).filter(
              ([path, isCollapsed]) => path && isCollapsed === true
            )
          ) as Record<string, boolean>)
        : {};
    return {
      version: 1,
      assignments,
      order: cleanPathLists(value.order),
      collapsed,
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
    storage.setItem(SIDEBAR_PROJECTS_STORAGE_KEY, JSON.stringify(state));
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
  return sectionId ?? ROOT_PROJECT_ORDER_KEY;
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
  if (sectionId) {
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
  collapsed: boolean
): SidebarProjectsState {
  if ((state.collapsed[path] ?? false) === collapsed) {
    return state;
  }
  const next = { ...state.collapsed };
  if (collapsed) {
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
  if (released.length === 0 && !state.order[sectionId]) {
    return state;
  }
  const assignments = Object.fromEntries(
    Object.entries(state.assignments).filter(
      ([, assigned]) => assigned !== sectionId
    )
  );
  const order = { ...state.order };
  const root = order[ROOT_PROJECT_ORDER_KEY] ?? [];
  const moved = order[sectionId] ?? released;
  order[ROOT_PROJECT_ORDER_KEY] = [...new Set(Iterator.concat(root, moved))];
  delete order[sectionId];
  return { ...state, assignments, order };
}
