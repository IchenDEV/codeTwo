interface TaskBoardPromptTarget {
  paneId: string
  sessionId: string
}

interface ContinueTaskBoardPromptOptions {
  target: TaskBoardPromptTarget
  prompt: string
  selectSession: (sessionId: string, paneId: string) => Promise<void>
  isTargetActive: () => boolean
  openDocumentMode: () => void
  insertMarkdown: (markdown: string, mode: "append") => Promise<void>
  focusEditor: () => void
}

/**
 * Continue a TaskBoard prompt only in the pane that accepted the Session navigation. Appending is
 * deliberate: a destination Session may already own an unsent Composer draft.
 */
async function continueTaskBoardPrompt({
  target,
  prompt,
  selectSession,
  isTargetActive,
  openDocumentMode,
  insertMarkdown,
  focusEditor,
}: ContinueTaskBoardPromptOptions): Promise<boolean> {
  await selectSession(target.sessionId, target.paneId)
  if (!isTargetActive()) return false

  openDocumentMode()
  await insertMarkdown(prompt, "append")
  if (isTargetActive()) focusEditor()
  return true
}

/** Project only durable user/agent text into the bounded TaskBoard preview. */
function taskBoardTranscriptPreview(
  entries: readonly TranscriptEntry[],
  limit = 4,
): TaskBoardTranscriptPreview {
  const lines: TaskBoardTranscriptLine[] = []
  let latestTurnSeq: number | null = null

  for (const entry of entries) {
    if (entry.role === "user" && (entry.part.kind === "text" || entry.part.kind === "prompt")) {
      latestTurnSeq = entry.seq
    }
    if (entry.part.kind !== "text" && entry.part.kind !== "prompt") continue
    const value = entry.part.kind === "prompt" ? entry.part.display || entry.part.text : entry.part.text
    if (!value.trim()) continue
    const previous = lines[lines.length - 1]
    if (previous?.role === entry.role) {
      previous.text = `${previous.text}${value}`.slice(0, 1200)
      continue
    }
    lines.push({ seq: entry.seq, role: entry.role, text: value.trimStart().slice(0, 1200) })
  }

  return {
    entries: lines.slice(-Math.max(1, limit)).map((line) => ({
      ...line,
      text: line.text.trim(),
    })),
    latestTurnSeq,
  }
}

export {
  continueTaskBoardPrompt,
  taskBoardTranscriptPreview,
  type ContinueTaskBoardPromptOptions,
  type TaskBoardPromptTarget,
}
import type { TranscriptEntry } from "../bridge"
import type {
  TaskBoardTranscriptLine,
  TaskBoardTranscriptPreview,
} from "./workspaceTypes"
