import { useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import type { ReactNode } from "react";

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

interface DndRenderState {
  ref: (element: Element | null) => void;
  sourceRef?: (element: Element | null) => void;
  targetRef?: (element: Element | null) => void;
  isDragging: boolean;
  isDropTarget: boolean;
}

function dndId(prefix: string, item: SidebarDragItem | undefined, location: SidebarDropLocation) {
  if (item) return `${prefix}:${item.kind}:${item.id}`;
  if (location.kind === "section") return `${prefix}:section:${location.sectionId}`;
  if (location.kind === "projects") return `${prefix}:projects:${location.sectionId ?? "root"}`;
  if (location.kind === "tasks") {
    return `${prefix}:tasks:${location.sectionId ?? "root"}:${location.projectPath ?? "none"}`;
  }
  return `${prefix}:sections`;
}

function dndGroup(item: SidebarDragItem, location: SidebarDropLocation) {
  if (item.kind === "section") return "sidebar-sections";
  if (item.kind === "project" && location.kind === "projects") {
    return `sidebar-projects:${location.sectionId ?? "root"}`;
  }
  if (item.kind === "task" && location.kind === "tasks") {
    return `sidebar-tasks:${location.sectionId ?? "root"}:${location.projectPath ?? "none"}`;
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
  children,
}: {
  item: SidebarDragItem;
  location: SidebarDropLocation;
  index: number;
  accept: SidebarDragItem["kind"] | SidebarDragItem["kind"][];
  collisionPriority?: number;
  disabled?: boolean;
  children: (state: DndRenderState) => ReactNode;
}) {
  const sortable = useSortable<SidebarDndData>({
    id: dndId("item", item, location),
    index,
    group: dndGroup(item, location),
    type: item.kind,
    accept,
    collisionPriority,
    disabled,
    data: { item, location },
  });

  return children({
    ref: sortable.ref,
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
  const acceptKey = Array.isArray(accept) ? [...accept].sort().join("-") : accept;
  const droppable = useDroppable<SidebarDndData>({
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
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SidebarDndData>;
  if (!candidate.location || typeof candidate.location !== "object") return null;
  return candidate as SidebarDndData;
}

export function sidebarSortableSnapshot(value: unknown): SidebarSortableSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SidebarSortableSnapshot>;
  if (
    typeof candidate.group !== "string"
    || typeof candidate.initialGroup !== "string"
    || typeof candidate.index !== "number"
    || typeof candidate.initialIndex !== "number"
  ) return null;
  return candidate as SidebarSortableSnapshot;
}

export function sidebarProjectSectionFromGroup(group: string): string | null | undefined {
  const prefix = "sidebar-projects:";
  if (!group.startsWith(prefix)) return undefined;
  const sectionId = group.slice(prefix.length);
  return sectionId === "root" ? null : sectionId;
}
