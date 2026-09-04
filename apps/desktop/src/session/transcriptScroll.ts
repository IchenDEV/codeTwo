export const transcriptEdgeThreshold = 48;

export interface TranscriptScrollMetrics {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

export interface TranscriptScrollAnchor {
  element: HTMLElement;
  scrollHeight: number;
  scrollTop: number;
}

export function transcriptDistanceFromEnd({
  clientHeight,
  scrollHeight,
  scrollTop,
}: TranscriptScrollMetrics): number {
  return Math.max(0, scrollHeight - clientHeight - scrollTop);
}

export function isTranscriptNearEnd(
  metrics: TranscriptScrollMetrics,
  threshold = transcriptEdgeThreshold
): boolean {
  return transcriptDistanceFromEnd(metrics) <= threshold;
}

export function scrollTopAfterPrepend(
  anchor: Pick<TranscriptScrollAnchor, "scrollHeight" | "scrollTop">,
  nextScrollHeight: number
): number {
  return Math.max(
    0,
    anchor.scrollTop + (nextScrollHeight - anchor.scrollHeight)
  );
}
