import React from "react";
import ReactDOM from "react-dom/client";

import { TooltipProvider } from "@/components/ui/tooltip";

import App from "./App";
import { installDesktopTitlebarDoubleClick } from "./container";
import { I18nProvider } from "./i18n";
import { DesktopPetWindow } from "./pet/DesktopPet";
import { currentDesktopPlatform } from "./platform";
import { ThemeProvider } from "./theme";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { ToastProvider } from "./ui/toast";

import "./styles.css";

document.documentElement.dataset.platform = currentDesktopPlatform();

const searchParams = new URLSearchParams(window.location.search);
const showDesktopPet =
  document.querySelector(
    'meta[name="codetwo-surface"][content="desktop-pet"]'
  ) !== null;
const showDesignSystem =
  import.meta.env.DEV && searchParams.has("design-system");
const showPetPreview = import.meta.env.DEV && searchParams.has("pet-preview");
const showRichTranscript =
  import.meta.env.DEV && searchParams.has("rich-transcript");
const uiLabRoute = import.meta.env.DEV ? searchParams.get("ui-lab") : null;
const showUiLab = uiLabRoute !== null;
const uiLabThemeOverride = showUiLab
  ? searchParams.get("theme") === "light" ||
    searchParams.get("theme") === "dark"
    ? searchParams.get("theme") === "light"
      ? "light"
      : "dark"
    : "system"
  : undefined;
const uiLabLanguageOverride = showUiLab
  ? searchParams.get("lang") === "zh"
    ? "zh-CN"
    : "en"
  : undefined;
if (showDesktopPet)
  document.documentElement.classList.add("desktop-pet-window-root");

// The webview's own menu (Reload / Inspect Element) is a browser artefact, not something a desktop
// app offers. Suppressed everywhere except real text inputs, where the system menu (cut / copy /
// paste / look up) is genuinely the right one.
document.addEventListener("contextmenu", (e) => {
  const el = e.target instanceof HTMLElement ? e.target : null;
  const editable = el?.closest?.("input, textarea, [contenteditable='true']");
  // Base UI needs the un-cancelled event to position an app-owned context menu. Its trigger is a
  // deliberate desktop interaction, not the webview's Reload / Inspect Element menu.
  const appContextMenu = el?.closest?.('[data-slot="context-menu-trigger"]');
  if (!editable && !appContextMenu) e.preventDefault();
});

// Electrobun drag regions include their descendants. Mark interactive descendants explicitly so
// title-bar buttons, fields and links keep receiving clicks instead of starting a window move.
const interactiveSelector =
  "button, input, textarea, select, a, summary, [role='button'], [contenteditable='true']";
const protectInteractiveNode = (node: Node) => {
  if (!(node instanceof Element)) return;
  if (node.matches(interactiveSelector))
    node.classList.add("electrobun-webkit-app-region-no-drag");
  for (const element of node.querySelectorAll(interactiveSelector)) {
    element.classList.add("electrobun-webkit-app-region-no-drag");
  }
};
protectInteractiveNode(document.documentElement);
new MutationObserver((records) => {
  for (const record of records)
    for (const node of record.addedNodes) protectInteractiveNode(node);
}).observe(document.documentElement, { childList: true, subtree: true });

if (!showDesktopPet && currentDesktopPlatform() === "macos") {
  installDesktopTitlebarDoubleClick(document, (error) => {
    console.warn(
      "Could not perform the macOS titlebar double-click action",
      error
    );
  });
}

// ThemeProvider owns the `.dark` class on <html>, so it wraps everything that might read it.
async function render() {
  const Root = showDesktopPet
    ? DesktopPetWindow
    : showUiLab
      ? (await import("./design/ui-lab/UiLab")).UiLab
      : showPetPreview
        ? (await import("./pet/PetPreview")).PetPreview
        : showRichTranscript
          ? (await import("./session/RichTranscriptPreview"))
              .RichTranscriptPreview
          : showDesignSystem
            ? (await import("./design/DesignSystemPreview")).DesignSystemPreview
            : App;

  ReactDOM.createRoot(document.querySelector("#root")!).render(
    <React.StrictMode>
      <ThemeProvider preferenceOverride={uiLabThemeOverride}>
        <I18nProvider preferenceOverride={uiLabLanguageOverride}>
          <ErrorBoundary>
            <TooltipProvider>
              <ToastProvider>
                <Root />
              </ToastProvider>
            </TooltipProvider>
          </ErrorBoundary>
        </I18nProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}

void render();
