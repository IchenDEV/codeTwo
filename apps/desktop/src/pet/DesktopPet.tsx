import { useEffect, useState } from "react";

import { setAppearanceSettings, useAppearanceSettings } from "../appearance";
import {
  desktopGetPetState,
  desktopHidePet,
  desktopUpdatePetState,
  isElectrobun,
  listenDesktop,
  type DesktopPetState,
} from "../container";
import { CodeTwoPet } from "./CodeTwoPet";
import type { CodeTwoPetAnimation } from "./state";

export function DesktopPetBridge({ animation }: { animation: CodeTwoPetAnimation }) {
  const appearance = useAppearanceSettings();

  useEffect(() => {
    if (!isElectrobun) return;
    void desktopUpdatePetState({
      visible: appearance.petEnabled,
      animation,
      appearance: {
        petActivityEnabled: appearance.petActivityEnabled,
        petSize: appearance.petSize,
        petSource: appearance.petSource,
        petId: appearance.petId,
        petName: appearance.petName,
      },
    }).catch(() => undefined);
  }, [
    animation,
    appearance.petActivityEnabled,
    appearance.petEnabled,
    appearance.petId,
    appearance.petName,
    appearance.petSize,
    appearance.petSource,
  ]);

  useEffect(() => {
    if (!isElectrobun) return;
    const stopHidden = listenDesktop("desktop-pet-hidden", () => {
      setAppearanceSettings({ petEnabled: false });
    });
    return () => {
      stopHidden();
    };
  }, []);

  return null;
}

export function DesktopPetWindow() {
  const [state, setState] = useState<DesktopPetState | null>(null);

  useEffect(() => {
    let active = true;
    const stop = listenDesktop<DesktopPetState>("desktop-pet-state", setState);
    void desktopGetPetState()
      .then((value) => {
        if (active) setState(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      stop();
    };
  }, []);

  if (!state) return null;

  return (
    <main className="desktop-pet-window">
      <div
        className="desktop-pet-drag-handle electrobun-webkit-app-region-drag"
        aria-hidden="true"
      />
      <CodeTwoPet
        animation={state.animation}
        appearance={state.appearance}
        onHide={() => void desktopHidePet()}
      />
    </main>
  );
}
