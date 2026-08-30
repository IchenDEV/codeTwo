import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { useT } from "@/i18n";

import { setAppearanceSettings, useAppearanceSettings } from "../appearance";
import {
  desktopGetPetState,
  desktopHidePet,
  desktopUpdatePetState,
  isElectrobun,
  listenDesktop,
  nativeContextMenusAvailable,
  showNativeContextMenu,
  type DesktopPetState,
  type NativeContextMenuItem,
} from "../container";
import { CodeTwoPet } from "./CodeTwoPet";
import type { CodeTwoPetAnimation } from "./state";

const PET_STATE_UPDATE_INTERVAL_MS = 160;
export const DESKTOP_PET_CLOSE_ACTION = "close";

export function desktopPetContextMenu(closeLabel: string): NativeContextMenuItem[] {
  return [{ type: "item", label: closeLabel, action: DESKTOP_PET_CLOSE_ACTION }];
}

export function DesktopPetBridge({
  animation,
  bubble,
}: {
  animation: CodeTwoPetAnimation;
  bubble: string | null;
}) {
  const appearance = useAppearanceSettings();
  const pendingState = useRef<DesktopPetState | null>(null);
  const updateTimer = useRef<number>();

  useEffect(() => {
    if (!isElectrobun) return;
    pendingState.current = {
      visible: appearance.petEnabled,
      animation,
      bubble,
      appearance: {
        petActivityEnabled: appearance.petActivityEnabled,
        petSize: appearance.petSize,
        petSource: appearance.petSource,
        petId: appearance.petId,
        petName: appearance.petName,
      },
    };
    if (updateTimer.current !== undefined) return;
    updateTimer.current = window.setTimeout(() => {
      updateTimer.current = undefined;
      const state = pendingState.current;
      if (state) void desktopUpdatePetState(state).catch(() => undefined);
    }, PET_STATE_UPDATE_INTERVAL_MS);
  }, [
    animation,
    appearance.petActivityEnabled,
    appearance.petEnabled,
    appearance.petId,
    appearance.petName,
    appearance.petSize,
    appearance.petSource,
    bubble,
  ]);

  useEffect(
    () => () => {
      if (updateTimer.current !== undefined) window.clearTimeout(updateTimer.current);
    },
    [],
  );

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
  const t = useT();
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

  const openContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    if (!nativeContextMenusAvailable) return;
    void showNativeContextMenu(desktopPetContextMenu(t("pet.close")), (action) => {
      if (action === DESKTOP_PET_CLOSE_ACTION) void desktopHidePet();
    });
  };

  return (
    <main
      className="desktop-pet-window"
      data-slot="context-menu-trigger"
      onContextMenu={openContextMenu}
    >
      <div
        className="desktop-pet-drag-handle electrobun-webkit-app-region-drag"
        aria-hidden="true"
      />
      <CodeTwoPet
        animation={state.animation}
        bubble={state.bubble}
        appearance={state.appearance}
      />
    </main>
  );
}
