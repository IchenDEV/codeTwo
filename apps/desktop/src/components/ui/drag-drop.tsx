import { PointerActivationConstraints } from "@dnd-kit/dom";
import { OptimisticSortingPlugin } from "@dnd-kit/dom/sortable";
import {
  DragDropProvider as DndKitProvider,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
} from "@dnd-kit/react";
import type {
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
  UseDroppableInput,
} from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import type { UseSortableInput } from "@dnd-kit/react/sortable";
import type { ComponentProps } from "react";

/** Shared boundary for the desktop's mature drag-and-drop interaction library. */
function DragDropRoot(props: ComponentProps<typeof DndKitProvider>) {
  return <DndKitProvider {...props} />;
}

export {
  DragDropRoot,
  KeyboardSensor,
  OptimisticSortingPlugin,
  PointerActivationConstraints,
  PointerSensor,
  useDroppable as useDragDropZone,
  useSortable as useDragDropSortable,
};
export type {
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
  UseDroppableInput,
  UseSortableInput,
};
