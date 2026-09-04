import { TriangleAlert } from "@/components/ui/icons";
import { useEffect, useMemo, useRef, useState } from "react";

import { confirmNative, openExternal, readVisualization } from "../bridge";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import {
  VISUALIZATION_THEME_VARIABLES,
  visualizationDocument,
  type VisualizationReference,
} from "./visualization";

function safeWebLink(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function currentTheme(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const root = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    VISUALIZATION_THEME_VARIABLES.map((name) => [
      name,
      root.getPropertyValue(name).trim(),
    ])
  );
}

function frameToken(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `visual-${Math.random().toString(36).slice(2)}`
  );
}

const messageSubscribers = new Set<(event: MessageEvent) => void>();

function routeVisualizationMessage(event: MessageEvent): void {
  for (const subscriber of messageSubscribers) subscriber(event);
}

function subscribeVisualizationMessages(
  subscriber: (event: MessageEvent) => void
): () => void {
  messageSubscribers.add(subscriber);
  if (messageSubscribers.size === 1)
    window.addEventListener("message", routeVisualizationMessage);
  return () => {
    messageSubscribers.delete(subscriber);
    if (messageSubscribers.size === 0) {
      window.removeEventListener("message", routeVisualizationMessage);
    }
  };
}

export const VisualizationFrame = ({
  reference,
  loader = readVisualization,
}: {
  readonly reference: VisualizationReference;
  readonly loader?: (path: string) => Promise<string>;
}) => {
  const t = useT();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const confirmingLinkRef = useRef(false);
  const token = useMemo(frameToken, []);
  const [fragment, setFragment] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [height, setHeight] = useState(220);
  const [theme, setTheme] = useState(currentTheme);

  useEffect(() => {
    let active = true;
    setFragment(null);
    setFailed(false);
    void loader(reference.path)
      .then((value) => {
        if (active) setFragment(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [loader, reference.path]);

  useEffect(() => {
    const root = document.documentElement;
    const refresh = () => setTheme(currentTheme());
    const observer = new MutationObserver(refresh);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    // ThemeProvider applies its root class/tokens in an effect. It can finish before this child
    // observer is attached, so take one authoritative post-mount sample as well.
    refresh();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = event.data as Record<string, unknown> | null;
      if (
        !message ||
        message.token !== token ||
        typeof message.type !== "string"
      )
        return;
      if (
        message.type === "codetwo-visualize-size" &&
        typeof message.height === "number"
      ) {
        setHeight(Math.min(1600, Math.max(96, Math.ceil(message.height))));
        return;
      }
      if (
        message.type === "codetwo-visualize-follow-up" &&
        typeof message.prompt === "string" &&
        message.prompt.trim().length > 0 &&
        message.prompt.length <= 32_768
      ) {
        window.dispatchEvent(
          new CustomEvent("codetwo-visualize-follow-up", {
            detail: {
              prompt: message.prompt,
              title:
                typeof message.title === "string"
                  ? message.title.slice(0, 250)
                  : undefined,
            },
          })
        );
        return;
      }
      if (
        message.type === "codetwo-visualize-open-link" &&
        typeof message.url === "string"
      ) {
        const link = safeWebLink(message.url);
        if (link && !confirmingLinkRef.current) {
          confirmingLinkRef.current = true;
          void confirmNative(
            t("visualization.openLink", { url: link }),
            t("visualization.openLinkTitle")
          )
            .then((accepted) => {
              if (accepted) void openExternal(link);
            })
            .finally(() => {
              confirmingLinkRef.current = false;
            });
        }
      }
    };
    return subscribeVisualizationMessages(receive);
  }, [t, token]);

  const source = useMemo(
    () =>
      fragment === null ? null : visualizationDocument(fragment, theme, token),
    [fragment, theme, token]
  );

  if (failed) {
    return (
      <p
        role="alert"
        className="rounded-control bg-destructive/10 text-callout text-destructive my-3 flex items-center gap-2 px-3 py-2"
      >
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
        {t("visualization.unavailable")}
      </p>
    );
  }
  if (!source) {
    return (
      <p
        role="status"
        className="text-callout text-muted-foreground my-3 flex items-center gap-2"
      >
        <Spinner className="size-3.5" />
        {t("visualization.loading")}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "codetwo-visualize my-4 min-w-0",
        reference.mode === "wide" && "is-wide"
      )}
      data-mode={reference.mode ?? "normal"}
    >
      <iframe
        ref={iframeRef}
        title={reference.title ?? t("visualization.title")}
        srcDoc={source}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        frameBorder={0}
        className="block w-full bg-transparent"
        style={{ height }}
      />
    </div>
  );
}
