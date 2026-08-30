export const SIDEBAR_SECTIONS_STORAGE_KEY = "codetwo.rail.taskSections.v1";

export interface SidebarTaskSection {
  id: string;
  name: string;
  collapsed: boolean;
}

export interface SidebarTaskSectionsState {
  version: 1;
  sections: SidebarTaskSection[];
  assignments: Record<string, string>;
}

export const EMPTY_SIDEBAR_TASK_SECTIONS: SidebarTaskSectionsState = {
  version: 1,
  sections: [],
  assignments: {},
};

function cleanSectionName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 48);
}

function cloneEmptyState(): SidebarTaskSectionsState {
  return { version: 1, sections: [], assignments: {} };
}

export function loadSidebarTaskSections(
  storage: Pick<Storage, "getItem"> | null,
): SidebarTaskSectionsState {
  if (!storage) return cloneEmptyState();

  try {
    const raw = storage.getItem(SIDEBAR_SECTIONS_STORAGE_KEY);
    if (!raw) return cloneEmptyState();
    const value = JSON.parse(raw) as Partial<SidebarTaskSectionsState> | null;
    if (!value || value.version !== 1 || !Array.isArray(value.sections)) {
      return cloneEmptyState();
    }

    const ids = new Set<string>();
    const names = new Set<string>();
    const sections: SidebarTaskSection[] = [];
    for (const candidate of value.sections.slice(0, 100)) {
      if (!candidate || typeof candidate !== "object") continue;
      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      const name = typeof candidate.name === "string" ? cleanSectionName(candidate.name) : "";
      const comparableName = name.toLocaleLowerCase();
      if (!id || id.startsWith("system:") || !name || ids.has(id) || names.has(comparableName)) {
        continue;
      }
      ids.add(id);
      names.add(comparableName);
      sections.push({ id, name, collapsed: candidate.collapsed === true });
    }

    const assignments: Record<string, string> = {};
    if (value.assignments && typeof value.assignments === "object") {
      for (const [taskId, sectionId] of Object.entries(value.assignments)) {
        if (taskId && typeof sectionId === "string" && ids.has(sectionId)) {
          assignments[taskId] = sectionId;
        }
      }
    }
    return { version: 1, sections, assignments };
  } catch {
    return cloneEmptyState();
  }
}

export function saveSidebarTaskSections(
  storage: Pick<Storage, "setItem"> | null,
  state: SidebarTaskSectionsState,
): void {
  if (!storage) return;
  try {
    storage.setItem(SIDEBAR_SECTIONS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A private or full store makes Sections session-only; Tasks themselves remain untouched.
  }
}

export function createSidebarTaskSection(
  state: SidebarTaskSectionsState,
  name: string,
  id: string,
  taskId?: string,
): SidebarTaskSectionsState {
  const cleaned = cleanSectionName(name);
  const comparableName = cleaned.toLocaleLowerCase();
  const existing = state.sections.find(
    (section) => section.name.toLocaleLowerCase() === comparableName,
  );
  if (!cleaned || !id || id.startsWith("system:")) return state;
  if (existing) return taskId ? assignTaskSection(state, taskId, existing.id) : state;

  return {
    ...state,
    sections: [...state.sections, { id, name: cleaned, collapsed: false }],
    assignments: taskId ? { ...state.assignments, [taskId]: id } : state.assignments,
  };
}

export function renameSidebarTaskSection(
  state: SidebarTaskSectionsState,
  id: string,
  name: string,
): SidebarTaskSectionsState {
  const cleaned = cleanSectionName(name);
  const comparableName = cleaned.toLocaleLowerCase();
  if (
    !cleaned ||
    state.sections.some(
      (section) => section.id !== id && section.name.toLocaleLowerCase() === comparableName,
    )
  ) {
    return state;
  }

  let changed = false;
  const sections = state.sections.map((section) => {
    if (section.id !== id || section.name === cleaned) return section;
    changed = true;
    return { ...section, name: cleaned };
  });
  return changed ? { ...state, sections } : state;
}

export function setSidebarTaskSectionCollapsed(
  state: SidebarTaskSectionsState,
  id: string,
  collapsed: boolean,
): SidebarTaskSectionsState {
  let changed = false;
  const sections = state.sections.map((section) => {
    if (section.id !== id || section.collapsed === collapsed) return section;
    changed = true;
    return { ...section, collapsed };
  });
  return changed ? { ...state, sections } : state;
}

export function assignTaskSection(
  state: SidebarTaskSectionsState,
  taskId: string,
  sectionId: string | null,
): SidebarTaskSectionsState {
  if (!taskId) return state;
  if (sectionId && !state.sections.some((section) => section.id === sectionId)) return state;
  if ((state.assignments[taskId] ?? null) === sectionId) return state;

  const assignments = { ...state.assignments };
  if (sectionId) assignments[taskId] = sectionId;
  else delete assignments[taskId];
  return { ...state, assignments };
}

export function deleteSidebarTaskSection(
  state: SidebarTaskSectionsState,
  id: string,
): SidebarTaskSectionsState {
  if (!state.sections.some((section) => section.id === id)) return state;
  const assignments = Object.fromEntries(
    Object.entries(state.assignments).filter(([, sectionId]) => sectionId !== id),
  );
  return {
    ...state,
    sections: state.sections.filter((section) => section.id !== id),
    assignments,
  };
}
