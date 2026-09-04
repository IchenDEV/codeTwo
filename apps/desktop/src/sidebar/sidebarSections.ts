import { asJsonObject } from "../lib/jsonValue";

export const sidebarSectionsStorageKey = "codetwo.rail.taskSections.v2";
export const legacySidebarSectionsStorageKey = "codetwo.rail.taskSections.v1";
export const unsectionedTaskOrderKey = "unsectioned";

export function projectTaskOrderKey(path: string): string {
  return `project:${encodeURIComponent(path)}`;
}

export interface SidebarTaskSection {
  id: string;
  name: string;
  collapsed: boolean;
}

export interface SidebarTaskSectionsState {
  version: 2;
  sections: SidebarTaskSection[];
  assignments: Record<string, string>;
  taskOrder: Record<string, string[]>;
}

export const emptySidebarTaskSections: SidebarTaskSectionsState = {
  assignments: {},
  sections: [],
  taskOrder: {},
  version: 2,
};

function cleanSectionName(value: string): string {
  return value.trim().replaceAll(/\s+/gu, " ").slice(0, 48);
}

function cloneEmptyState(): SidebarTaskSectionsState {
  return { assignments: {}, sections: [], taskOrder: {}, version: 2 };
}

function cleanTaskOrder(
  value: unknown,
  validSectionIds: ReadonlySet<string>
): Record<string, string[]> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string[]> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (
      key !== unsectionedTaskOrderKey &&
      !key.startsWith("project:") &&
      !validSectionIds.has(key)
    ) {
      continue;
    }
    if (!Array.isArray(candidate)) {
      continue;
    }
    const seen = new Set<string>();
    const ids = candidate
      .filter(
        (id): id is string => typeof id === "string" && Boolean(id.trim())
      )
      .map((id) => id.trim())
      .filter((id) => {
        if (seen.has(id)) {
          return false;
        }
        seen.add(id);
        return true;
      })
      .slice(0, 2000);
    if (ids.length > 0) {
      result[key] = ids;
    }
  }
  return result;
}

function parseSidebarTaskSections(
  raw: string
): SidebarTaskSectionsState | null {
  const value = asJsonObject(JSON.parse(raw) as unknown);
  if (
    value == null ||
    (value.version !== 1 && value.version !== 2) ||
    !Array.isArray(value.sections)
  ) {
    return null;
  }

  const ids = new Set<string>();
  const names = new Set<string>();
  const sections: SidebarTaskSection[] = [];
  for (const candidate of value.sections.slice(0, 100)) {
    const row = asJsonObject(candidate);
    if (row == null) {
      continue;
    }
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? cleanSectionName(row.name) : "";
    const comparableName = name.toLocaleLowerCase();
    if (
      !id ||
      id.startsWith("system:") ||
      !name ||
      ids.has(id) ||
      names.has(comparableName)
    ) {
      continue;
    }
    ids.add(id);
    names.add(comparableName);
    sections.push({ collapsed: row.collapsed === true, id, name });
  }

  const assignments: Record<string, string> = {};
  const rawAssignments = asJsonObject(value.assignments);
  if (rawAssignments != null) {
    for (const [taskId, sectionId] of Object.entries(rawAssignments)) {
      if (
        taskId !== "" &&
        typeof sectionId === "string" &&
        ids.has(sectionId)
      ) {
        assignments[taskId] = sectionId;
      }
    }
  }
  return {
    assignments,
    sections,
    taskOrder: value.version === 2 ? cleanTaskOrder(value.taskOrder, ids) : {},
    version: 2,
  };
}

export function loadSidebarTaskSections(
  storage: Pick<Storage, "getItem"> | null
): SidebarTaskSectionsState {
  if (!storage) {
    return cloneEmptyState();
  }

  try {
    const current = storage.getItem(sidebarSectionsStorageKey);
    if (current != null && current !== "") {
      return parseSidebarTaskSections(current) ?? cloneEmptyState();
    }
    const legacy = storage.getItem(legacySidebarSectionsStorageKey);
    return legacy != null && legacy !== ""
      ? (parseSidebarTaskSections(legacy) ?? cloneEmptyState())
      : cloneEmptyState();
  } catch {
    return cloneEmptyState();
  }
}

export function saveSidebarTaskSections(
  storage: Pick<Storage, "setItem"> | null,
  state: SidebarTaskSectionsState
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(sidebarSectionsStorageKey, JSON.stringify(state));
  } catch {
    // A private or full store makes Sections session-only; Tasks themselves remain untouched.
  }
}

export function createSidebarTaskSection(
  state: SidebarTaskSectionsState,
  name: string,
  id: string,
  taskId?: string
): SidebarTaskSectionsState {
  const cleaned = cleanSectionName(name);
  const comparableName = cleaned.toLocaleLowerCase();
  const existing = state.sections.find(
    (section) => section.name.toLocaleLowerCase() === comparableName
  );
  if (!cleaned || !id || id.startsWith("system:")) {
    return state;
  }
  if (existing) {
    return taskId != null && taskId !== ""
      ? assignTaskSection(state, taskId, existing.id)
      : state;
  }

  return {
    ...state,
    assignments:
      taskId != null && taskId !== ""
        ? { ...state.assignments, [taskId]: id }
        : state.assignments,
    sections: [...state.sections, { collapsed: false, id, name: cleaned }],
  };
}

export function renameSidebarTaskSection(
  state: SidebarTaskSectionsState,
  id: string,
  name: string
): SidebarTaskSectionsState {
  const cleaned = cleanSectionName(name);
  const comparableName = cleaned.toLocaleLowerCase();
  if (
    !cleaned ||
    state.sections.some(
      (section) =>
        section.id !== id && section.name.toLocaleLowerCase() === comparableName
    )
  ) {
    return state;
  }

  let isChanged = false;
  const sections = state.sections.map((section) => {
    if (section.id !== id || section.name === cleaned) {
      return section;
    }
    isChanged = true;
    return { ...section, name: cleaned };
  });
  return isChanged ? { ...state, sections } : state;
}

export function setSidebarTaskSectionCollapsed(
  state: SidebarTaskSectionsState,
  id: string,
  isCollapsed: boolean
): SidebarTaskSectionsState {
  let isChanged = false;
  const sections = state.sections.map((section) => {
    if (section.id !== id || section.collapsed === isCollapsed) {
      return section;
    }
    isChanged = true;
    return { ...section, collapsed: isCollapsed };
  });
  return isChanged ? { ...state, sections } : state;
}

export function moveSidebarTaskSection(
  state: SidebarTaskSectionsState,
  id: string,
  beforeId: string | null
): SidebarTaskSectionsState {
  const currentIndex = state.sections.findIndex((section) => section.id === id);
  if (currentIndex === -1 || id === beforeId) {
    return state;
  }
  const sections = state.sections.filter((section) => section.id !== id);
  const nextIndex =
    beforeId === null
      ? sections.length
      : sections.findIndex((section) => section.id === beforeId);
  if (nextIndex < 0) {
    return state;
  }
  sections.splice(nextIndex, 0, state.sections[currentIndex]);
  if (
    sections.every((section, index) => section.id === state.sections[index]?.id)
  ) {
    return state;
  }
  return { ...state, sections };
}

export function assignTaskSection(
  state: SidebarTaskSectionsState,
  taskId: string,
  sectionId: string | null
): SidebarTaskSectionsState {
  if (!taskId) {
    return state;
  }
  if (
    sectionId != null &&
    sectionId !== "" &&
    state.sections.every((section) => section.id !== sectionId)
  ) {
    return state;
  }
  if ((state.assignments[taskId] ?? null) === sectionId) {
    return state;
  }

  const assignments = { ...state.assignments };
  if (sectionId != null && sectionId !== "") {
    assignments[taskId] = sectionId;
  } else {
    delete assignments[taskId];
  }
  return { ...state, assignments };
}

function taskOrderKey(sectionId: string | null): string {
  return sectionId ?? unsectionedTaskOrderKey;
}

export function sortSidebarTasks<T extends { id: string }>(
  tasks: readonly T[],
  orderedIds: readonly string[] | undefined
): T[] {
  if (!orderedIds || orderedIds.length === 0) {
    return [...tasks];
  }
  const positions = new Map(orderedIds.map((id, index) => [id, index]));
  const unordered: T[] = [];
  const ordered: T[] = [];
  for (const task of tasks) {
    if (positions.has(task.id)) {
      ordered.push(task);
    } else {
      unordered.push(task);
    }
  }
  ordered.sort(
    (left, right) => positions.get(left.id)! - positions.get(right.id)!
  );
  // New Tasks remain recency-first until the user explicitly moves them.
  return [...unordered, ...ordered];
}

export function moveSidebarTask(
  state: SidebarTaskSectionsState,
  taskId: string,
  sectionId: string | null,
  beforeTaskId: string | null,
  destinationTaskIds: readonly string[],
  destinationOrderKey = taskOrderKey(sectionId)
): SidebarTaskSectionsState {
  if (
    !taskId ||
    (sectionId != null &&
      sectionId !== "" &&
      state.sections.every((section) => section.id !== sectionId))
  ) {
    return state;
  }
  const destination = destinationTaskIds.filter(
    (id, index) => id !== taskId && destinationTaskIds.indexOf(id) === index
  );
  const index =
    beforeTaskId === null
      ? destination.length
      : destination.indexOf(beforeTaskId);
  if (index < 0) {
    return state;
  }
  destination.splice(index, 0, taskId);

  const assignments = { ...state.assignments };
  if (sectionId != null && sectionId !== "") {
    assignments[taskId] = sectionId;
  } else {
    delete assignments[taskId];
  }
  const taskOrder = Object.fromEntries(
    Object.entries(state.taskOrder)
      .map(([key, ids]) => [key, ids.filter((id) => id !== taskId)] as const)
      .filter(([, ids]) => ids.length > 0)
  );
  taskOrder[destinationOrderKey] = destination;
  return { ...state, assignments, taskOrder };
}

export function deleteSidebarTaskSection(
  state: SidebarTaskSectionsState,
  id: string
): SidebarTaskSectionsState {
  if (state.sections.every((section) => section.id !== id)) {
    return state;
  }
  const releasedTaskIds = Object.entries(state.assignments)
    .filter(([, sectionId]) => sectionId === id)
    .map(([taskId]) => taskId);
  const assignments = Object.fromEntries(
    Object.entries(state.assignments).filter(
      ([, sectionId]) => sectionId !== id
    )
  );
  const taskOrder = { ...state.taskOrder };
  const currentRoot = taskOrder[unsectionedTaskOrderKey] ?? [];
  const moved = taskOrder[id] ?? releasedTaskIds;
  const seen = new Set(currentRoot);
  taskOrder[unsectionedTaskOrderKey] = [
    ...currentRoot,
    ...moved.filter((taskId) => !seen.has(taskId)),
  ];
  delete taskOrder[id];
  if (taskOrder[unsectionedTaskOrderKey].length === 0) {
    delete taskOrder[unsectionedTaskOrderKey];
  }
  return {
    ...state,
    assignments,
    sections: state.sections.filter((section) => section.id !== id),
    taskOrder,
  };
}
