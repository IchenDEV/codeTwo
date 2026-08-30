import { useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "@/components/ui/icons";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { openExternal } from "../bridge";
import { useLanguage, useT } from "../i18n";
import { MarkdownContent } from "../session/MarkdownContent";
import { useColorScheme } from "../theme";
import type { CollaborationConnectorCaller } from "./FeishuWorkspacePage";

interface ComponentView {
  id: string;
  url: string;
  expiresAt: number;
}

interface ComponentMessage {
  type: "codetwo-feishu-doc-component";
  id: string;
  state: "ready" | "auth-error" | "error";
  detail?: string;
}

const MOUNT_TIMEOUT_MS = 20_000;

function componentLocale(locale: string): "en-US" | "zh-CN" | "ja-JP" {
  if (locale === "zh-CN" || locale === "ja-JP") return locale;
  return "en-US";
}

function isComponentMessage(value: unknown): value is ComponentMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ComponentMessage>;
  return candidate.type === "codetwo-feishu-doc-component"
    && typeof candidate.id === "string"
    && ["ready", "auth-error", "error"].includes(candidate.state ?? "");
}

function readableFailure(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message
    .replace(/^Error:\s*/i, "")
    .replace(/^dsh-feishu-docs:\s*/i, "")
    .trim();
}

export function FeishuDocumentView({
  callCommand,
  documentUrl,
  markdown,
  markdownLoading,
}: {
  callCommand: CollaborationConnectorCaller;
  documentUrl: string;
  markdown: string;
  markdownLoading: boolean;
}) {
  const t = useT();
  const { locale } = useLanguage();
  const theme = useColorScheme();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [view, setView] = useState<ComponentView | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");
  const [failure, setFailure] = useState("");
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let live = true;
    let activeId = "";
    let authRetries = 0;
    let mountTimer: number | undefined;

    const clearMountTimer = () => {
      if (mountTimer !== undefined) window.clearTimeout(mountTimer);
      mountTimer = undefined;
    };

    const fail = (message: string) => {
      if (!live) return;
      clearMountTimer();
      setFailure(message);
      setPhase("failed");
      setView(null);
    };

    const open = async (refreshAuth = false) => {
      clearMountTimer();
      setFailure("");
      setPhase("loading");
      setView(null);
      if (!documentUrl) {
        fail(t("feishu.documentComponentUnavailable"));
        return;
      }
      try {
        const next = await callCommand<ComponentView>("document.component", {
          documentUrl,
          theme,
          locale: componentLocale(locale),
          refreshAuth,
        });
        if (!live) return;
        activeId = next.id;
        setView(next);
        mountTimer = window.setTimeout(
          () => fail(t("feishu.documentComponentTimeout")),
          MOUNT_TIMEOUT_MS,
        );
      } catch (cause) {
        fail(readableFailure(cause));
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || !isComponentMessage(event.data)) return;
      if (event.data.id !== activeId) return;
      if (event.data.state === "ready") {
        clearMountTimer();
        setPhase("ready");
        return;
      }
      if (event.data.state === "auth-error" && authRetries < 1) {
        authRetries += 1;
        void open(true);
        return;
      }
      fail(event.data.detail || t("feishu.documentComponentUnavailable"));
    };

    window.addEventListener("message", onMessage);
    void open();
    return () => {
      live = false;
      clearMountTimer();
      window.removeEventListener("message", onMessage);
    };
  }, [callCommand, documentUrl, generation, locale, t, theme]);

  if (phase === "failed") {
    return (
      <ScrollArea className="min-h-0 flex-1" data-feishu-document-fallback>
        <article className="mx-auto w-full max-w-4xl px-page py-section">
          <div className="mb-section flex items-start justify-between gap-section rounded-module bg-fill-quiet px-section py-module-inset text-ui">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{t("feishu.documentComponentFallback")}</p>
              {failure ? <p className="mt-inline break-words text-fine text-muted-foreground">{failure}</p> : null}
            </div>
            <div className="flex shrink-0 gap-inline">
              <Button size="compact" variant="secondary" onClick={() => setGeneration((current) => current + 1)}>
                <RefreshCw />{t("feishu.retry")}
              </Button>
              <Button size="compact" variant="secondary" onClick={() => void openExternal(documentUrl)}>
                <ExternalLink />{t("feishu.openInFeishu")}
              </Button>
            </div>
          </div>
          {markdownLoading ? (
            <div role="status" className="flex items-center justify-center gap-module-inset py-section text-ui text-muted-foreground">
              <Spinner />{t("feishu.loadingDocument")}
            </div>
          ) : (
            <div data-feishu-document dir="auto" className="feishu-document text-body text-foreground">
              <MarkdownContent text={markdown || t("feishu.emptyDocument")} />
            </div>
          )}
        </article>
      </ScrollArea>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-surface" data-feishu-document-component>
      {view ? (
        <iframe
          ref={iframeRef}
          key={view.id}
          src={view.url}
          title={t("feishu.documentComponentFrameTitle")}
          className="h-full w-full border-0 bg-surface"
          sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          allow="clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="no-referrer"
        />
      ) : null}
      {phase === "loading" ? (
        <div role="status" className="absolute inset-0 flex items-center justify-center gap-module-inset bg-surface text-ui text-muted-foreground">
          <Spinner />{t("feishu.documentComponentLoading")}
        </div>
      ) : null}
    </div>
  );
}
