import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react"

const NARROW_BOARD_WIDTH_REM = 48

export function useTaskBoardViewport(pageRef: RefObject<HTMLElement | null>) {
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [isNarrow, setIsNarrow] = useState(false)
  const restoreInspectorFocus = useRef(false)
  const wasNarrow = useRef<boolean | null>(null)

  useLayoutEffect(() => {
    const page = pageRef.current
    if (!page || typeof ResizeObserver === "undefined") return
    const updateLayout = (): void => {
      const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const narrow = page.clientWidth <= NARROW_BOARD_WIDTH_REM * rootFontSize
      if (narrow && wasNarrow.current !== true) setInspectorOpen(false)
      setIsNarrow(narrow)
      wasNarrow.current = narrow
    }
    updateLayout()
    const observer = new ResizeObserver(updateLayout)
    observer.observe(page)
    return () => observer.disconnect()
  }, [pageRef])

  useEffect(() => {
    if (!inspectorOpen && restoreInspectorFocus.current) {
      restoreInspectorFocus.current = false
      pageRef.current
        ?.querySelector<HTMLButtonElement>("[data-task-board-show-inspector]")
        ?.focus()
    }
  }, [inspectorOpen, pageRef])

  const closeInspector = (): void => {
    restoreInspectorFocus.current = true
    setInspectorOpen(false)
  }
  const openInspectorForSelection = (): void => {
    if (!isNarrow) setInspectorOpen(true)
  }

  return {
    inspectorOpen,
    isNarrow,
    setInspectorOpen,
    closeInspector,
    openInspectorForSelection,
  }
}
