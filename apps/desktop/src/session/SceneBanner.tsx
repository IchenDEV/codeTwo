import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage, useT } from "../i18n";
import type { CoreEvent } from "../bridge";
import { sceneTitle, type SceneInfo, type SceneNextSuggestion } from "./scene";

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
}

/** Project the two banner-worthy core events into banner state; anything else is `null`. */
export function sceneBannerFromEvent(
  ev: Extract<CoreEvent, { event: "exit_criteria_met" | "hook_suggestion" }>,
): SceneBannerState | null {
  if (ev.event === "exit_criteria_met") {
    return {
      session: ev.session,
      sceneRef: ev.scene_ref,
      stateKey: ev.state_key,
      kind: "complete",
      targetScene: null,
      carry: [],
      message: null,
      unverified: ev.unverified ?? [],
    };
  }
  if (ev.kind !== "suggest_scene" && ev.kind !== "suggest_next" && ev.kind !== "notify") {
    return null;
  }
  return {
    session: ev.session,
    sceneRef: ev.scene_ref,
    stateKey: ev.state_key,
    kind: ev.kind,
    targetScene: ev.target_scene ?? null,
    carry: ev.carry ?? [],
    message: ev.message ?? null,
    unverified: [],
  };
}

/** A suggestion's target may be a bare scene name or a pinned reference; resolve either. */
export function resolveSceneReference(scenes: SceneInfo[], target: string): SceneInfo | null {
  return (
    scenes.find((scene) => scene.reference === target) ??
    scenes.find((scene) => scene.name === target) ??
    null
  );
}

/** The suggestions the banner offers: `exit.next` when complete, else the hook's target. */
function bannerSuggestions(banner: SceneBannerState, scenes: SceneInfo[]): SceneNextSuggestion[] {
  if (banner.kind === "complete") {
    const active = resolveSceneReference(scenes, banner.sceneRef);
    return active?.exit?.next ?? [];
  }
  if (banner.kind === "notify" || !banner.targetScene) return [];
  return [{ scene: banner.targetScene, label: banner.message, carry: banner.carry }];
}

export function SceneBanner({
  banner,
  scenes,
  onApplyScene,
  onDismiss,
}: {
  banner: SceneBannerState;
  scenes: SceneInfo[];
  onApplyScene: (reference: string) => void;
  onDismiss: () => void;
}) {
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
    <div className="shrink-0 px-4 pb-2 pt-1" data-testid="scene-banner">
      <div
        className="mx-auto flex w-full items-start gap-3 border bg-card px-4 py-3"
        style={{ borderRadius: "var(--ds-radius-module)" }}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-ui text-muted-foreground">
            {source && banner.kind === "complete" ? `${sceneTitle(source, locale)} · ` : null}
            {text}
          </p>
          {banner.unverified.length > 0 && (
            <p className="text-hint text-muted-foreground">
              {t("sceneBanner.unverified", { items: banner.unverified.join(", ") })}
            </p>
          )}
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {suggestions.map((suggestion) => {
                const resolved = resolveSceneReference(scenes, suggestion.scene);
                if (!resolved) return null;
                const carry = suggestion.carry ?? [];
                return (
                  <Button
                    key={suggestion.scene}
                    size="sm"
                    variant="secondary"
                    title={
                      carry.length > 0
                        ? t("sceneBanner.carrying", { artifacts: carry.join(", ") })
                        : undefined
                    }
                    onClick={() => onApplyScene(resolved.reference)}
                  >
                    {suggestion.label ??
                      t("sceneBanner.start", { scene: sceneTitle(resolved, locale) })}
                  </Button>
                );
              })}
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
}
