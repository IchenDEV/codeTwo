import { PetX } from "@petx/react";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "@/components/ui/icons";
import { useT } from "@/i18n";
import { useEffect, useRef, useState } from "react";

import {
  setAppearanceSettings,
  useAppearanceSettings,
  type AppearanceSettings,
  type PetSize,
} from "../appearance";
import type { CodeTwoPetAnimation } from "./state";
import { BUILTIN_PET, petSpritesheetUrl } from "./store";

import "@petx/react/styles.css";
import "./pet.css";

export const PET_SPRITESHEET = BUILTIN_PET.spritesheetUrl;
export const PET_SIZE_PIXELS: Record<PetSize, number> = {
  small: 88,
  medium: 112,
  large: 136,
};
const WAVE_DURATION_MS = 820;

export type CodeTwoPetAppearance = Pick<
  AppearanceSettings,
  "petActivityEnabled" | "petSize" | "petSource" | "petId" | "petName"
>;

export function CodeTwoPetSprite({
  animation,
  size,
  title,
  src = PET_SPRITESHEET,
  spriteVersionNumber = 2,
  playing = true,
  frame,
}: {
  animation: CodeTwoPetAnimation | "waving";
  size: number;
  title: string;
  src?: string;
  spriteVersionNumber?: number;
  playing?: boolean;
  frame?: number;
}) {
  return (
    <PetX
      src={src}
      spriteVersionNumber={spriteVersionNumber}
      animation={animation}
      size={size}
      title={title}
      playing={playing}
      frame={frame}
    />
  );
}

export function CodeTwoPet({
  animation,
  appearance: providedAppearance,
  onHide,
}: {
  animation: CodeTwoPetAnimation;
  appearance?: CodeTwoPetAppearance;
  onHide?: () => void;
}) {
  const t = useT();
  const storedAppearance = useAppearanceSettings();
  const appearance = providedAppearance ?? storedAppearance;
  const [wave, setWave] = useState(0);
  const waveTimer = useRef<number>();

  useEffect(
    () => () => {
      if (waveTimer.current !== undefined) window.clearTimeout(waveTimer.current);
    },
    [],
  );

  const greet = () => {
    if (waveTimer.current !== undefined) window.clearTimeout(waveTimer.current);
    setWave((value) => value + 1);
    waveTimer.current = window.setTimeout(() => {
      waveTimer.current = undefined;
      setWave(0);
    }, WAVE_DURATION_MS);
  };

  const activeAnimation = wave > 0 ? "waving" : appearance.petActivityEnabled ? animation : "idle";
  const spritesheetUrl = petSpritesheetUrl(appearance.petSource, appearance.petId);

  return (
    <section className="codetwo-pet-stage" aria-label={t("pet.label")}>
      <button
        type="button"
        className="codetwo-pet-mascot"
        aria-label={t("pet.wave")}
        title={t("pet.wave")}
        onClick={greet}
      >
        <CodeTwoPetSprite
          key={`${appearance.petSource}-${appearance.petId}-${activeAnimation}-${wave}`}
          animation={activeAnimation}
          size={PET_SIZE_PIXELS[appearance.petSize]}
          src={spritesheetUrl}
          title={appearance.petName || t("pet.label")}
        />
      </button>

      <div className="codetwo-pet-controls">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={t("pet.hide")}
          title={t("pet.hide")}
          onClick={onHide ?? (() => setAppearanceSettings({ petEnabled: false }))}
        >
          <ChevronDown aria-hidden />
        </Button>
      </div>
    </section>
  );
}
