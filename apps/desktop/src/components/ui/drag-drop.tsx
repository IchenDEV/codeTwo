import type { ComponentProps } from "react";
import {
  DragDropProvider as DndKitProvider,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UseDroppableInput,
} from "@dnd-kit/react";
import {
  useSortable,
  type UseSortableInput,
} from "@dnd-kit/react/sortable";

/** Shared boundary for the desktop's mature drag-and-drop interaction library. */
function DragDropRoot(props: ComponentProps<typeof DndKitProvider>) {
  return <DndKitProvider {...props} />;
}

export {
  DragDropRoot,
  useDroppable as useDragDropZone,
  useSortable as useDragDropSortable,
};
export type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  UseDroppableInput,
  UseSortableInput,
};
