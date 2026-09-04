import type { Dispatch, FormEvent, SetStateAction } from "react";

import { confirmNative } from "@/bridge";
import type { Translate } from "@/i18n";
import { useToast } from "@/ui/toast";

import {
  createBoardTask,
  filterBoardTasks,
  type BoardAction,
  type BoardFilters,
  type BoardTask,
  type TaskStatus,
} from "./taskBoard";
import type { TaskEditorValue } from "./TaskEditorDialog";
import type {
  EditorState,
  InspectorTab,
  ProjectedTask,
  SessionProjection,
} from "./workspaceTypes";

interface TaskBoardActionsOptions {
  t: Translate;
  toast: ReturnType<typeof useToast>;
  tasks: readonly BoardTask[];
  filters: BoardFilters;
  editor: EditorState | null;
  selectedSession: SessionProjection | null;
  prompt: string;
  onAskSession?: (id: string, prompt: string) => void;
  dispatch: Dispatch<BoardAction>;
  setEditor: Dispatch<SetStateAction<EditorState | null>>;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
  setSelectedSessionId: Dispatch<SetStateAction<string | null>>;
  setExpandedTaskIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
  setInspectorOpen: Dispatch<SetStateAction<boolean>>;
  setInspectorTab: Dispatch<SetStateAction<InspectorTab>>;
  setPrompt: Dispatch<SetStateAction<string>>;
  clearFilters: () => void;
  keepInspectorInPlace: boolean;
}

function nextColumnOrder(
  tasks: readonly BoardTask[],
  status: TaskStatus
): number {
  return tasks.filter((task) => task.status === status).length;
}

export function useTaskBoardActions(options: TaskBoardActionsOptions) {
  const openEditor = (
    task: BoardTask | null,
    initialStatus: TaskStatus
  ): void => {
    options.setEditor({ task, initialStatus });
  };

  const saveEditor = (value: TaskEditorValue): void => {
    const editor = options.editor;
    if (!editor) return;
    if (editor.task) {
      options.dispatch({
        type: "update",
        task: {
          ...editor.task,
          ...value,
          updatedAt: Math.max(
            Date.now(),
            editor.task.createdAt,
            editor.task.updatedAt
          ),
        },
      });
    } else {
      const task = createBoardTask({
        ...value,
        order: nextColumnOrder(options.tasks, value.status),
      });
      options.dispatch({ type: "create", task });
      options.setSelectedTaskId(task.id);
      options.setExpandedTaskIds((current) => new Set(current).add(task.id));
      if (!options.keepInspectorInPlace) options.setInspectorOpen(true);
      if (filterBoardTasks([task], options.filters).length === 0) {
        options.toast(
          options.t("taskboard.createdHidden", { title: task.title }),
          "info",
          {
            label: options.t("taskboard.clearFilters"),
            run: options.clearFilters,
          }
        );
      }
    }
    options.setEditor(null);
  };

  const deleteTask = async (task: BoardTask): Promise<void> => {
    const confirmed = await confirmNative(
      options.t("taskboard.deleteConfirm", { title: task.title })
    );
    if (!confirmed) return;
    options.dispatch({ type: "delete", id: task.id });
    options.toast(
      options.t("taskboard.deleted", { title: task.title }),
      "success"
    );
  };

  const toggleTask = (projected: ProjectedTask): void => {
    options.setSelectedTaskId(projected.task.id);
    options.setSelectedSessionId(projected.currentSession?.id ?? null);
    options.setExpandedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(projected.task.id)) next.delete(projected.task.id);
      else next.add(projected.task.id);
      return next;
    });
    if (!options.keepInspectorInPlace) options.setInspectorOpen(true);
  };

  const selectTask = (projected: ProjectedTask): void => {
    options.setSelectedTaskId(projected.task.id);
    options.setSelectedSessionId(
      projected.currentSession?.id ?? projected.sessions[0]?.id ?? null
    );
    if (!options.keepInspectorInPlace) options.setInspectorOpen(true);
  };

  const selectSession = (taskId: string, sessionId: string): void => {
    options.setSelectedTaskId(taskId);
    options.setSelectedSessionId(sessionId);
    options.setExpandedTaskIds((current) => new Set(current).add(taskId));
    options.setInspectorTab("agent");
    options.setInspectorOpen(true);
  };

  const submitPrompt = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = options.prompt.trim();
    if (!value || !options.selectedSession || !options.onAskSession) return;
    options.onAskSession(options.selectedSession.id, value);
    options.setPrompt("");
  };

  const copyCheckout = (path: string): void => {
    const write = navigator.clipboard?.writeText(path);
    if (!write) {
      options.toast(options.t("taskboard.copyCheckoutFailed"), "error");
      return;
    }
    void write.then(
      () => options.toast(options.t("taskboard.checkoutCopied"), "success"),
      () => options.toast(options.t("taskboard.copyCheckoutFailed"), "error")
    );
  };

  return {
    openEditor,
    saveEditor,
    deleteTask,
    toggleTask,
    selectTask,
    selectSession,
    submitPrompt,
    copyCheckout,
  };
}
