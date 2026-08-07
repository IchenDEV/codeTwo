import { ArrowDown, Loader2 } from "lucide-react";

import { TurnCard } from "./TurnCard";
import type { Turn } from "./turns";
import type { TranscriptScrollController } from "./useTranscriptScroll";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

interface TranscriptPaneProps {
  variant: "main" | "side";
  turns: readonly Turn[];
  loading: boolean;
  hasEarlier: boolean;
  loadingEarlier: boolean;
  onLoadEarlier: () => void;
  scroll: TranscriptScrollController;
}

/** One transcript renderer shared by the main column and document-mode side panel. */
export function TranscriptPane({
  variant,
  turns,
  loading,
  hasEarlier,
  loadingEarlier,
  onLoadEarlier,
  scroll,
}: TranscriptPaneProps) {
  const t = useT();
  const Root = variant === "side" ? "aside" : "section";

  return (
    <Root
      aria-label={t("transcript.label")}
      className={cn(
        "relative min-h-0",
        variant === "side"
          ? "animate-slide-in-right order-2 w-[360px] max-w-[38%] shrink-0 border-s bg-fill-quiet"
          : "order-1 flex-1",
      )}
    >
      <div
        ref={(element) => {
          scroll.viewportRef.current = element;
        }}
        aria-busy={loading}
        className="size-full overflow-y-auto overscroll-contain"
        onScroll={scroll.onScroll}
        onPointerDownCapture={scroll.onPointerDownCapture}
        onKeyDownCapture={scroll.onKeyDownCapture}
      >
        <div
          className={cn(
            "mx-auto w-full",
            variant === "side" ? "px-4 pb-4 pt-2" : "max-w-[860px] px-6 pb-2 pt-3",
          )}
        >
          {loading ? (
            <p
              role="status"
              className="flex items-center justify-center gap-2 py-12 text-ui text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("session.loading")}
            </p>
          ) : (
            <>
              {hasEarlier ? (
                <div className="flex justify-center pb-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={loadingEarlier}
                    onClick={onLoadEarlier}
                  >
                    {loadingEarlier ? (
                      <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
                    ) : null}
                    {loadingEarlier
                      ? t("transcript.loadingEarlier")
                      : t("transcript.loadEarlier")}
                  </Button>
                </div>
              ) : null}
              <ol className="m-0 list-none p-0">
                {turns.map((turn) => (
                  <li
                    key={turn.transcriptStartSeq ?? turn.id}
                    style={{ contentVisibility: "auto", containIntrinsicSize: "auto 180px" }}
                  >
                    <TurnCard turn={turn} />
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>

      {scroll.showJumpToLatest ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute bottom-4 start-1/2 -translate-x-1/2 rounded-full shadow-lg"
          onClick={scroll.jumpToLatest}
        >
          <ArrowDown data-icon="inline-start" aria-hidden />
          {t("transcript.jumpLatest")}
        </Button>
      ) : null}
    </Root>
  );
}
