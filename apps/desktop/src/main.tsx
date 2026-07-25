import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { ToastProvider } from "./ui/toast";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./theme";
import "./styles.css";

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
