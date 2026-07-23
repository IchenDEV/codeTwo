import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useColorScheme } from "./theme";
import "./styles.css";

/** shadcn keys dark styles off a `.dark` class; mirror the OS appearance onto <html>. */
function Root() {
  const scheme = useColorScheme();
  useEffect(() => {
    document.documentElement.classList.toggle("dark", scheme === "dark");
  }, [scheme]);

  return (
    <TooltipProvider delayDuration={300}>
      <App />
    </TooltipProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
