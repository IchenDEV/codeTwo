import type { ReactNode } from "react";

import {
  useDragDropSortable,
  useDragDropZone,
} from "@/components/ui/drag-drop";
import type { UseSortableInput } from "@/components/ui/drag-drop";

export type SidebarDragItem =
  | { kind: "task"; id: string }
  | { kind: "section"; id: string }
  | { kind: "project"; id: string };

export type SidebarDropLocation =
  | { kind: "sections" }
  | { kind: "section"; sectionId: string }
  | { kind: "projects"; sectionId: string | null }
  | { kind: "tasks"; sectionId: string | null; projectPath: string | null };

export interface SidebarDndData {
  item?: SidebarDragItem;
  location: SidebarDropLocation;
}

export interface SidebarSortableSnapshot {
  group: string;
  initialGroup: string;
  index: number;
  initialIndex: number;
}

export type SidebarFinalizedDestination =
  | { kind: "sections"; index: number }
  | { kind: "projects"; sectionId: string | null; index: number }
  | {
      kind: "tasks";
      sectionId: string | null;
      projectPath: string | null;
      index: number;
    };

interface DndRenderState {
  ref: (element: Element | null) => void;
  handleRef?: (element: Element | null) => void;
  sourceRef?: (element: Element | null) => void;
  targetRef?: (element: Element | null) => void;
  isDragging: boolean;
  isDropTarget: boolean;
}

function dndId(
  prefix: string,
  item: SidebarDragItem | undefined,
  location: SidebarDropLocation
) {
  if (item) return `${prefix}:${item.kind}:${item.id}`;
  if (location.kind === "section")
    return `${prefix}:section:${location.sectionId}`;
  if (location.kind === "projects")
    return `${prefix}:projects:${location.sectionId ?? "root"}`;
  if (location.kind === "tasks") {
    return `${prefix}:tasks:${location.sectionId ?? "root"}:${location.projectPath ?? "none"}`;
  }
  return `${prefix}:sections`;
}

function dndGroup(item: SidebarDragItem, location: SidebarDropLocation) {
  if (item.kind === "section") return "sidebar-sections";
  if (item.kind === "project" && location.kind === "projects") {
    return `sidebar-projects:${encodeURIComponent(location.sectionId ?? "")}`;
  }
  if (item.kind === "task" && location.kind === "tasks") {
    return `sidebar-tasks:${encodeURIComponent(location.sectionId ?? "")}:${encodeURIComponent(location.projectPath ?? "")}`;
  }
  return `sidebar-${item.kind}`;
}

export function SidebarSortable({
  item,
  location,
  index,
  accept,
  collisionPriority = 0,
  disabled = false,
  sensors,
  children,
}: {
  item: SidebarDragItem;
  location: SidebarDropLocation;
  index: number;
  accept: SidebarDragItem["kind"] | SidebarDragItem["kind"][];
  collisionPriority?: number;
  disabled?: boolean;
  /** Per-item sensor overrides, e.g. a distance threshold when the whole row is the handle. */
  sensors?: UseSortableInput<SidebarDndData>["sensors"];
  children: (state: DndRenderState) => ReactNode;
}) {
  const sortable = useDragDropSortable<SidebarDndData>({
    id: dndId("item", item, location),
    index,
    group: dndGroup(item, location),
    type: item.kind,
    accept,
    collisionPriority,
    disabled,
    sensors,
    data: { item, location },
  });

  return children({
    ref: sortable.ref,
    handleRef: sortable.handleRef,
    sourceRef: sortable.sourceRef,
    targetRef: sortable.targetRef,
    isDragging: sortable.isDragging,
    isDropTarget: sortable.isDropTarget,
  });
}

export function SidebarDropZone({
  location,
  accept,
  collisionPriority = -1,
  children,
}: {
  location: SidebarDropLocation;
  accept: SidebarDragItem["kind"] | SidebarDragItem["kind"][];
  collisionPriority?: number;
  children: (state: DndRenderState) => ReactNode;
}) {
  const acceptKey = Array.isArray(accept)
    ? [...accept].toSorted().join("-")
    : accept;
  const droppable = useDragDropZone<SidebarDndData>({
    id: dndId(`zone:${acceptKey}`, undefined, location),
    accept,
    collisionPriority,
    data: { location },
  });

  return children({
    ref: droppable.ref,
    isDragging: false,
    isDropTarget: droppable.isDropTarget,
  });
}

export function sidebarDndData(value: unknown): SidebarDndData | null {
  if (value == null || typeof value !== "object") return null;
  const candidate = value as Partial<SidebarDndData>;
  if (!candidate.location || typeof candidate.location !== "object")
    return null;
  return candidate as SidebarDndData;
}

export function sidebarTaskContainerCollisionPriority(
  hasNestedTaskRows: boolean
): number {
  return hasNestedTaskRows ? 1 : 3;
}

function sidebarDragTargetIsCompatible(
  source: SidebarDragItem,
  target: SidebarDndData
): boolean {
  if (source.kind === "section") {
    return (
      target.location.kind === "sections" || target.item?.kind === "section"
    );
  }
  if (source.kind === "project") {
    return (
      target.location.kind === "projects" || target.location.kind === "section"
    );
  }
  return target.location.kind === "tasks" || target.location.kind === "section";
}

export function sidebarRememberedDragTarget(
  source: SidebarDragItem | null,
  value: unknown,
  previous: SidebarDndData | null
): SidebarDndData | null {
  const target = sidebarDndData(value);
  if (!source || !target || !sidebarDragTargetIsCompatible(source, target))
    return null;
  if (target.item?.kind === source.kind && target.item.id === source.id)
    return previous;
  return target;
}

export function sidebarSortableSnapshot(
  value: unknown
): SidebarSortableSnapshot | null {
  if (value == null || typeof value !== "object") return null;
  const candidate = value as Partial<SidebarSortableSnapshot>;
  if (
    typeof candidate.group !== "string" ||
    typeof candidate.initialGroup !== "string" ||
    typeof candidate.index !== "number" ||
    typeof candidate.initialIndex !== "number"
  )
    return null;
  return {
    group: candidate.group,
    initialGroup: candidate.initialGroup,
    index: candidate.index,
    initialIndex: candidate.initialIndex,
  };
}

export function sidebarProjectSectionFromGroup(
  group: string
): string | null | undefined {
  const prefix = "sidebar-projects:";
  if (!group.startsWith(prefix)) return undefined;
  const sectionId = decodeURIComponent(group.slice(prefix.length));
  return sectionId === "" ? null : sectionId;
}

export function sidebarTaskLocationFromGroup(
  group: string
): Extract<SidebarDropLocation, { kind: "tasks" }> | undefined {
  const prefix = "sidebar-tasks:";
  if (!group.startsWith(prefix)) return undefined;
  const separator = group.indexOf(":", prefix.length);
  if (separator === -1) return undefined;
  const sectionId = decodeURIComponent(group.slice(prefix.length, separator));
  const projectPath = decodeURIComponent(group.slice(separator + 1));
  return {
    kind: "tasks",
    sectionId: sectionId === "" ? null : sectionId,
    projectPath: projectPath === "" ? null : projectPath,
  };
}

export function sidebarBeforeIdAtFinalIndex(
  destinationIds: readonly string[],
  sourceId: string,
  finalIndex: number
): string | null {
  const remaining = destinationIds.filter((id) => id !== sourceId);
  const boundedIndex = Math.min(Math.max(0, finalIndex), remaining.length);
  return remaining[boundedIndex] ?? null;
}

/** Translate dnd-kit's authoritative final sortable state into a sidebar destination. */
export function sidebarFinalizedDestination(
  item: SidebarDragItem,
  snapshot: SidebarSortableSnapshot | null
): SidebarFinalizedDestination | undefined {
  if (
    !snapshot ||
    (snapshot.group === snapshot.initialGroup &&
      snapshot.index === snapshot.initialIndex)
  )
    return undefined;

  if (item.kind === "section") {
    return snapshot.group === "sidebar-sections"
      ? { kind: "sections", index: snapshot.index }
      : undefined;
  }
  if (item.kind === "project") {
    const sectionId = sidebarProjectSectionFromGroup(snapshot.group);
    return sectionId === undefined
      ? undefined
      : { kind: "projects", sectionId, index: snapshot.index };
  }
  const location = sidebarTaskLocationFromGroup(snapshot.group);
  return location ? { ...location, index: snapshot.index } : undefined;
}
