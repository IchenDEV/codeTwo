import { PetX } from "@petx/react";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { setAppearanceSettings, useAppearanceSettings, type PetSize } from "../appearance";
import { VoiceButton } from "../voice/VoiceButton";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
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
  voiceEnabled,
  onVoiceText,
}: {
  animation: CodeTwoPetAnimation;
  voiceEnabled: boolean;
  onVoiceText: (text: string) => void;
}) {
  const t = useT();
  const appearance = useAppearanceSettings();
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
        {voiceEnabled ? <VoiceButton onText={onVoiceText} /> : null}
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={t("pet.hide")}
          title={t("pet.hide")}
          onClick={() => setAppearanceSettings({ petEnabled: false })}
        >
          <ChevronDown aria-hidden />
        </Button>
      </div>
    </section>
  );
}
