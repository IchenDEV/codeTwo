export type FeishuResourceTab = "messages" | "documents" | "bases";

export const FEISHU_SIDEBAR_ORDER_KEY = "codetwo.feishu.sidebarOrder.v1";
export const FEISHU_RESOURCE_TABS: readonly FeishuResourceTab[] = [
  "messages",
  "documents",
  "bases",
];

export interface FeishuSidebarOrder {
  version: 1;
  sectionOrder: FeishuResourceTab[];
  resourceOrder: Record<FeishuResourceTab, string[]>;
}

export const EMPTY_FEISHU_SIDEBAR_ORDER: FeishuSidebarOrder = {
  version: 1,
  sectionOrder: [...FEISHU_RESOURCE_TABS],
  resourceOrder: { messages: [], documents: [], bases: [] },
};

function cloneEmptyOrder(): FeishuSidebarOrder {
  return {
    version: 1,
    sectionOrder: [...FEISHU_RESOURCE_TABS],
    resourceOrder: { messages: [], documents: [], bases: [] },
  };
}

function isResourceTab(value: unknown): value is FeishuResourceTab {
  return (
    typeof value === "string" &&
    FEISHU_RESOURCE_TABS.includes(value as FeishuResourceTab)
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
    const raw = storage.getItem(FEISHU_SIDEBAR_ORDER_KEY);
    if (!raw) {
      return cloneEmptyOrder();
    }
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.version !== 1) {
      return cloneEmptyOrder();
    }
    const supplied = Array.isArray(value.sectionOrder)
      ? value.sectionOrder.filter(isResourceTab)
      : [];
    const sectionOrder = [
      ...new Set(Iterator.concat(supplied, FEISHU_RESOURCE_TABS)),
    ] as FeishuResourceTab[];
    const resourceOrder =
      value.resourceOrder && typeof value.resourceOrder === "object"
        ? (value.resourceOrder as Record<string, unknown>)
        : {};
    return {
      version: 1,
      sectionOrder,
      resourceOrder: {
        messages: cleanIds(resourceOrder.messages),
        documents: cleanIds(resourceOrder.documents),
        bases: cleanIds(resourceOrder.bases),
      },
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
    storage.setItem(FEISHU_SIDEBAR_ORDER_KEY, JSON.stringify(state));
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
  ordered.sort(
    (left, right) => positions.get(left.id)! - positions.get(right.id)!
  );
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
