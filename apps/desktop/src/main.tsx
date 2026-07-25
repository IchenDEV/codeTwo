import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { ToastProvider } from "./ui/toast";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./theme";
import "./styles.css";

// The webview's own menu (Reload / Inspect Element) is a browser artefact, not something a desktop
// app offers. Suppressed everywhere except real text inputs, where the system menu (cut / copy /
// paste / look up) is genuinely the right one.
document.addEventListener("contextmenu", (e) => {
  const el = e.target as HTMLElement | null;
  const editable = el?.closest?.("input, textarea, [contenteditable='true']");
  if (!editable) e.preventDefault();
});

// ThemeProvider owns the `.dark` class on <html>, so it wraps everything that might read it.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <ErrorBoundary>
          <TooltipProvider delayDuration={300}>
            <ToastProvider>
              <App />
            </ToastProvider>
          </TooltipProvider>
        </ErrorBoundary>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
