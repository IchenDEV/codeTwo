import { useRef } from "react";
import { ArrowDown, Loader2 } from "lucide-react";

import { TurnCard } from "./TurnCard";
import { SelectionActions } from "./SelectionActions";
import type { Turn } from "./turns";
import type { TranscriptScrollController } from "./useTranscriptScroll";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { useAppearanceSettings } from "../appearance";
import { CodeTwoPet } from "../pet/CodeTwoPet";
import type { CodeTwoPetAnimation } from "../pet/state";

interface TranscriptPaneProps {
  variant: "main" | "side";
  turns: readonly Turn[];
  loading: boolean;
  hasEarlier: boolean;
  loadingEarlier: boolean;
  onLoadEarlier: () => void;
  scroll: TranscriptScrollController;
  /** R4 plan-as-document affordances, threaded through to each turn's Plan detail. */
  onOpenPlanAsDocument?: (entries: string[]) => void;
  onPinPlanArtifact?: (markdown: string) => void;
  canPinPlan?: boolean;
  /** R2 "Save as template…" in each turn's prompt menu. Absent → the menu stays hidden. */
  onSaveTemplate?: (promptText: string) => void;
  petAnimation: CodeTwoPetAnimation;
  onVoiceText: (text: string) => void;
  onAddSelection: (text: string) => void;
  onExplainSelection: (text: string) => void;
  onAskSelectionInSideChat: (text: string) => void;
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
  onOpenPlanAsDocument,
  onPinPlanArtifact,
  canPinPlan,
  onSaveTemplate,
  petAnimation,
  onVoiceText,
  onAddSelection,
  onExplainSelection,
  onAskSelectionInSideChat,
}: TranscriptPaneProps) {
  const t = useT();
  const appearance = useAppearanceSettings();
  const Root = variant === "side" ? "aside" : "section";
  const selectionScopeRef = useRef<HTMLDivElement | null>(null);

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
          selectionScopeRef.current = element;
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
            variant === "side" ? "px-4 pb-6 pt-4" : "max-w-3xl px-8 pb-8 pt-6",
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
                    <TurnCard
                      turn={turn}
                      onOpenPlanAsDocument={onOpenPlanAsDocument}
                      onPinPlanArtifact={onPinPlanArtifact}
                      canPinPlan={canPinPlan}
                      onSaveTemplate={onSaveTemplate}
                    />
                  </li>
                ))}
              </ol>
              {variant === "main" && appearance.petEnabled ? (
                <CodeTwoPet animation={petAnimation} onVoiceText={onVoiceText} />
              ) : null}
            </>
          )}
        </div>
      </div>

      <SelectionActions
        scopeRef={selectionScopeRef}
        onAdd={onAddSelection}
        onDetails={onExplainSelection}
        onAskInSideChat={onAskSelectionInSideChat}
      />

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
