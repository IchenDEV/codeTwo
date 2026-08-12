import { PetX } from "@petx/react";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { setAppearanceSettings } from "../appearance";
import { VoiceButton } from "../voice/VoiceButton";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import type { CodeTwoPetAnimation } from "./state";

import "@petx/react/styles.css";
import "./pet.css";

const PET_SPRITESHEET = "/pets/naiwa/spritesheet.webp";
const WAVE_DURATION_MS = 820;

export function CodeTwoPet({
  animation,
  onVoiceText,
}: {
  animation: CodeTwoPetAnimation;
  onVoiceText: (text: string) => void;
}) {
  const t = useT();
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

  const activeAnimation = wave > 0 ? "waving" : animation;

  return (
    <section className="codetwo-pet-stage" aria-label={t("pet.label")}>
      <button
        type="button"
        className="codetwo-pet-mascot"
        aria-label={t("pet.wave")}
        title={t("pet.wave")}
        onClick={greet}
      >
        <PetX
          key={`${activeAnimation}-${wave}`}
          src={PET_SPRITESHEET}
          spriteVersionNumber={2}
          animation={activeAnimation}
          size={112}
          title={t("pet.label")}
        />
      </button>

      <div className="codetwo-pet-controls">
        <VoiceButton onText={onVoiceText} />
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
