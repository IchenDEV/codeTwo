import { X } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { useLanguage, useT } from "../i18n";
import type { CoreEvent } from "../bridge";
import { sceneTitle } from "./scene";
import type { SceneInfo, SceneNextSuggestion } from "./scene";

/**
 * The quiet scene banner above the composer (R8): either the completion state — "all declared
 * artifacts are in" with the scene's `exit.next` suggestions as buttons — or a hook's
 * render-only suggestion/notification. Latest event wins; dismissal is remembered per session
 * by the core (`dismiss_scene_banner`), so the same state never re-fires.
 */
export interface SceneBannerState {
  session: string;
  sceneRef: string;
  stateKey: string;
  kind: "complete" | "suggest_scene" | "suggest_next" | "notify";
  targetScene: string | null;
  carry: string[];
  message: string | null;
  unverified: string[];
  /**
  Set on pipeline-driven `suggest_next` (R9): accepting advances the instance, not just the scene.
  */
  pipelineInstance: string | null;
  toStage: string | null;
}

export function sceneBannerFromEvent(
  ev: Extract<CoreEvent, { event: "exit_criteria_met" | "hook_suggestion" }>
): SceneBannerState | null {
  if (ev.event === "exit_criteria_met") {
    return {
      carry: [],
      kind: "complete",
      message: null,
      pipelineInstance: null,
      sceneRef: ev.scene_ref,
      session: ev.session,
      stateKey: ev.state_key,
      targetScene: null,
      toStage: null,
      unverified: ev.unverified ?? [],
    };
  }
  if (
    ev.kind !== "suggest_scene" &&
    ev.kind !== "suggest_next" &&
    ev.kind !== "notify"
  ) {
    return null;
  }
  return {
    carry: ev.carry ?? [],
    kind: ev.kind,
    message: ev.message ?? null,
    pipelineInstance: ev.pipeline_instance ?? null,
    sceneRef: ev.scene_ref,
    session: ev.session,
    stateKey: ev.state_key,
    targetScene: ev.target_scene ?? null,
    toStage: ev.to_stage ?? null,
    unverified: [],
  };
}

export function resolveSceneReference(
  scenes: SceneInfo[],
  target: string
): SceneInfo | null {
  return (
    scenes.find((scene) => scene.reference === target) ??
    scenes.find((scene) => scene.name === target) ??
    null
  );
}

function bannerSuggestions(
  banner: SceneBannerState,
  scenes: SceneInfo[]
): SceneNextSuggestion[] {
  if (banner.kind === "complete") {
    const active = resolveSceneReference(scenes, banner.sceneRef);
    return active?.exit?.next ?? [];
  }
  if (banner.kind === "notify" || !banner.targetScene) {
    return [];
  }
  return [
    { carry: banner.carry, label: banner.message, scene: banner.targetScene },
  ];
}

export const SceneBanner = ({
  banner,
  scenes,
  onApplyScene,
  onAdvancePipeline,
  onAdvancePipelineNewSession,
  onDismiss,
}: {
  readonly banner: SceneBannerState;
  readonly scenes: SceneInfo[];
  readonly onApplyScene: (reference: string) => void;
  /**
  Pipeline-driven suggestions advance the instance through the command layer (R9).
  */
  readonly onAdvancePipeline?: (instanceId: string, toStage: string) => void;
  /**
  Advance the pipeline stage in a fresh session (full-apply) instead of the current one.
  */
  readonly onAdvancePipelineNewSession?: (
    instanceId: string,
    toStage: string
  ) => void;
  readonly onDismiss: () => void;
}) => {
  const t = useT();
  const { locale } = useLanguage();
  const suggestions = bannerSuggestions(banner, scenes);
  const source = resolveSceneReference(scenes, banner.sceneRef);
  const text =
    banner.kind === "complete"
      ? t("sceneBanner.complete")
      : banner.kind === "notify"
        ? (banner.message ?? "")
        : (banner.message ??
          t("sceneBanner.suggest", {
            scene: suggestions[0]
              ? (resolveSceneReference(scenes, suggestions[0].scene)?.title ??
                suggestions[0].scene)
              : "",
          }));
  return (
    <div className="shrink-0 px-4 pt-1 pb-2" data-testid="scene-banner">
      <div className="rounded-module bg-surface shadow-surface mx-auto flex w-full items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-body text-muted-foreground">
            {source && banner.kind === "complete"
              ? `${sceneTitle(source, locale)} · `
              : null}
            {text}
          </p>
          {banner.unverified.length > 0 && (
            <p className="text-metadata text-muted-foreground">
              {t("sceneBanner.unverified", {
                items: banner.unverified.join(", "),
              })}
            </p>
          )}
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {suggestions.map((suggestion) => {
                const resolved = resolveSceneReference(
                  scenes,
                  suggestion.scene
                );
                if (!resolved) {
                  return null;
                }
                const carry = suggestion.carry ?? [];
                return (
                  <Button
                    key={suggestion.scene}
                    size="sm"
                    variant="secondary"
                    title={
                      carry.length > 0
                        ? t("sceneBanner.carrying", {
                            artifacts: carry.join(", "),
                          })
                        : undefined
                    }
                    onClick={() => {
                      // A pipeline suggestion advances the instance (escalation re-checked by the
                      // command); a plain suggestion just applies the scene.
                      if (
                        banner.pipelineInstance &&
                        banner.toStage &&
                        onAdvancePipeline
                      ) {
                        onAdvancePipeline(
                          banner.pipelineInstance,
                          banner.toStage
                        );
                      } else {
                        onApplyScene(resolved.reference);
                      }
                    }}
                  >
                    {suggestion.label ??
                      t("sceneBanner.start", {
                        scene: sceneTitle(resolved, locale),
                      })}
                  </Button>
                );
              })}
              {banner.pipelineInstance &&
              banner.toStage &&
              onAdvancePipelineNewSession ? (
                <Button
                  size="sm"
                  variant="ghost"
                  title={t("sceneBanner.newSessionHint")}
                  onClick={() =>
                    onAdvancePipelineNewSession(
                      banner.pipelineInstance!,
                      banner.toStage!
                    )
                  }
                >
                  {t("sceneBanner.newSession")}
                </Button>
              ) : null}
            </div>
          )}
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          className="shrink-0"
          aria-label={t("sceneBanner.dismiss")}
          onClick={onDismiss}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
};
