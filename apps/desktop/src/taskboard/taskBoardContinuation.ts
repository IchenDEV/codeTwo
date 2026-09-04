interface TaskBoardPromptTarget {
  paneId: string;
  sessionId: string;
}

interface ContinueTaskBoardPromptOptions {
  target: TaskBoardPromptTarget;
  prompt: string;
  selectSession: (sessionId: string, paneId: string) => Promise<void>;
  isTargetActive: () => boolean;
  openDocumentMode: () => void;
  insertMarkdown: (markdown: string, mode: "append") => Promise<void>;
  focusEditor: () => void;
}

/** Continue only in the pane that accepted the Session navigation, preserving its existing draft. */
async function continueTaskBoardPrompt({
  target,
  prompt,
  selectSession,
  isTargetActive,
  openDocumentMode,
  insertMarkdown,
  focusEditor,
}: ContinueTaskBoardPromptOptions): Promise<boolean> {
  await selectSession(target.sessionId, target.paneId);
  if (!isTargetActive()) return false;

  openDocumentMode();
  await insertMarkdown(prompt, "append");
  if (isTargetActive()) focusEditor();
  return true;
}

export {
  continueTaskBoardPrompt,
  type ContinueTaskBoardPromptOptions,
  type TaskBoardPromptTarget,
};
