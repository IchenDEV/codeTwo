import { useEffect, useState } from "react"

import type {
  TaskBoardTranscriptPreview,
  TranscriptPreviewState,
} from "./workspaceTypes"

export function useTaskBoardTranscript(
  sessionId: string | null,
  loadTranscript?: (id: string) => Promise<TaskBoardTranscriptPreview>,
): TranscriptPreviewState {
  const [transcript, setTranscript] = useState<TranscriptPreviewState>({
    sessionId: null,
    status: "idle",
    preview: null,
  })

  useEffect(() => {
    if (!sessionId) {
      setTranscript({ sessionId: null, status: "idle", preview: null })
      return
    }
    if (!loadTranscript) {
      setTranscript({
        sessionId,
        status: "success",
        preview: { entries: [], latestTurnSeq: null },
      })
      return
    }
    let active = true
    setTranscript({ sessionId, status: "loading", preview: null })
    void loadTranscript(sessionId).then(
      (preview) => {
        if (active) setTranscript({ sessionId, status: "success", preview })
      },
      () => {
        if (active) setTranscript({ sessionId, status: "error", preview: null })
      },
    )
    return () => {
      active = false
    }
  }, [loadTranscript, sessionId])

  return transcript
}
