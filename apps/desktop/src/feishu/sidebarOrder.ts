import { asJsonObject } from "../lib/jsonValue";

export type FeishuResourceTab = "messages" | "documents" | "bases";

export const feishuSidebarOrderKey = "codetwo.feishu.sidebarOrder.v1";
export const feishuResourceTabs: readonly FeishuResourceTab[] = [
  "messages",
  "documents",
  "bases",
];

export interface FeishuSidebarOrder {
  version: 1;
  sectionOrder: FeishuResourceTab[];
  resourceOrder: Record<FeishuResourceTab, string[]>;
}

export const emptyFeishuSidebarOrder: FeishuSidebarOrder = {
  resourceOrder: { bases: [], documents: [], messages: [] },
  sectionOrder: [...feishuResourceTabs],
  version: 1,
};

function cloneEmptyOrder(): FeishuSidebarOrder {
  return {
    resourceOrder: { bases: [], documents: [], messages: [] },
    sectionOrder: [...feishuResourceTabs],
    version: 1,
  };
}

function isResourceTab(value: unknown): value is FeishuResourceTab {
  return (
    typeof value === "string" && feishuResourceTabs.some((tab) => tab === value)
  );
}

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  return value
    .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
    .map((id) => id.trim())
    .filter((id) => {
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    })
    .slice(0, 2000);
}

export function loadFeishuSidebarOrder(
  storage: Pick<Storage, "getItem"> | null
): FeishuSidebarOrder {
  if (!storage) {
    return cloneEmptyOrder();
  }
  try {
    const raw = storage.getItem(feishuSidebarOrderKey);
    if (raw == null || raw === "") {
      return cloneEmptyOrder();
    }
    const value = asJsonObject(JSON.parse(raw) as unknown);
    if (value == null || value.version !== 1) {
      return cloneEmptyOrder();
    }
    const supplied = Array.isArray(value.sectionOrder)
      ? value.sectionOrder.filter(isResourceTab)
      : [];
    const sectionOrderSet = new Set<FeishuResourceTab>();
    for (const tab of supplied) {
      sectionOrderSet.add(tab);
    }
    for (const tab of feishuResourceTabs) {
      sectionOrderSet.add(tab);
    }
    const sectionOrder = [...sectionOrderSet];
    const resourceOrder = asJsonObject(value.resourceOrder) ?? {};
    return {
      resourceOrder: {
        bases: cleanIds(resourceOrder.bases),
        documents: cleanIds(resourceOrder.documents),
        messages: cleanIds(resourceOrder.messages),
      },
      sectionOrder,
      version: 1,
    };
  } catch {
    return cloneEmptyOrder();
  }
}

export function saveFeishuSidebarOrder(
  storage: Pick<Storage, "setItem"> | null,
  state: FeishuSidebarOrder
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(feishuSidebarOrderKey, JSON.stringify(state));
  } catch {
    // Private/full storage keeps the current renderer order without affecting remote resources.
  }
}

export function sortFeishuResources<T extends { id: string }>(
  resources: readonly T[],
  orderedIds: readonly string[]
): T[] {
  if (orderedIds.length === 0) {
    return [...resources];
  }
  const positions = new Map(orderedIds.map((id, index) => [id, index]));
  const unordered: T[] = [];
  const ordered: T[] = [];
  for (const resource of resources) {
    if (positions.has(resource.id)) {
      ordered.push(resource);
    } else {
      unordered.push(resource);
    }
  }
  ordered.sort((left, right) => {
    const leftPosition = positions.get(left.id) ?? 0;
    const rightPosition = positions.get(right.id) ?? 0;
    return leftPosition - rightPosition;
  });
  return [...unordered, ...ordered];
}

export function moveFeishuSection(
  state: FeishuSidebarOrder,
  tab: FeishuResourceTab,
  beforeTab: FeishuResourceTab | null
): FeishuSidebarOrder {
  if (tab === beforeTab || !state.sectionOrder.includes(tab)) {
    return state;
  }
  const sectionOrder = state.sectionOrder.filter(
    (candidate) => candidate !== tab
  );
  const index =
    beforeTab === null ? sectionOrder.length : sectionOrder.indexOf(beforeTab);
  if (index < 0) {
    return state;
  }
  sectionOrder.splice(index, 0, tab);
  if (
    sectionOrder.every(
      (candidate, position) => candidate === state.sectionOrder[position]
    )
  ) {
    return state;
  }
  return { ...state, sectionOrder };
}

export function moveFeishuResource(
  state: FeishuSidebarOrder,
  tab: FeishuResourceTab,
  resourceId: string,
  beforeResourceId: string | null,
  visibleResourceIds: readonly string[]
): FeishuSidebarOrder {
  if (!resourceId) {
    return state;
  }
  const resourceOrder = visibleResourceIds.filter(
    (id, index) => id !== resourceId && visibleResourceIds.indexOf(id) === index
  );
  const index =
    beforeResourceId === null
      ? resourceOrder.length
      : resourceOrder.indexOf(beforeResourceId);
  if (index < 0) {
    return state;
  }
  resourceOrder.splice(index, 0, resourceId);
  return {
    ...state,
    resourceOrder: { ...state.resourceOrder, [tab]: resourceOrder },
  };
}
