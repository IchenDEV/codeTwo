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
  return (
    candidate.type === "codetwo-feishu-doc-component" &&
    typeof candidate.id === "string" &&
    ["ready", "auth-error", "error"].includes(candidate.state ?? "")
  );
}

function readableFailure(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message
    .replace(/^Error:\s*/i, "")
    .replace(/^dsh-feishu-docs:\s*/i, "")
    .trim();
}

export const FeishuDocumentView = ({
  callCommand,
  documentUrl,
  markdown,
  markdownLoading,
}: {
  readonly callCommand: CollaborationConnectorCaller;
  readonly documentUrl: string;
  readonly markdown: string;
  readonly markdownLoading: boolean;
}) => {
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
          MOUNT_TIMEOUT_MS
        );
      } catch (cause) {
        fail(readableFailure(cause));
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== iframeRef.current?.contentWindow ||
        !isComponentMessage(event.data)
      )
        return;
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
        <article className="px-page py-section mx-auto w-full max-w-4xl">
          <div className="mb-section gap-section rounded-module bg-fill-quiet px-section py-module-inset text-ui flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-foreground font-medium">
                {t("feishu.documentComponentFallback")}
              </p>
              {failure ? (
                <p className="mt-inline text-fine text-muted-foreground break-words">
                  {failure}
                </p>
              ) : null}
            </div>
            <div className="gap-inline flex shrink-0">
              <Button
                size="compact"
                variant="secondary"
                onClick={() => setGeneration((current) => current + 1)}
              >
                <RefreshCw />
                {t("feishu.retry")}
              </Button>
              <Button
                size="compact"
                variant="secondary"
                onClick={() => void openExternal(documentUrl)}
              >
                <ExternalLink />
                {t("feishu.openInFeishu")}
              </Button>
            </div>
          </div>
          {markdownLoading ? (
            <div
              role="status"
              className="gap-module-inset py-section text-ui text-muted-foreground flex items-center justify-center"
            >
              <Spinner />
              {t("feishu.loadingDocument")}
            </div>
          ) : (
            <div
              data-feishu-document
              dir="auto"
              className="feishu-document text-body text-foreground"
            >
              <MarkdownContent text={markdown || t("feishu.emptyDocument")} />
            </div>
          )}
        </article>
      </ScrollArea>
    );
  }

  return (
    <div
      className="bg-surface relative min-h-0 flex-1 overflow-hidden"
      data-feishu-document-component
    >
      {view ? (
        <iframe
          ref={iframeRef}
          key={view.id}
          src={view.url}
          title={t("feishu.documentComponentFrameTitle")}
          className="bg-surface h-full w-full border-0"
          sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          allow="clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="no-referrer"
        />
      ) : null}
      {phase === "loading" ? (
        <div
          role="status"
          className="gap-module-inset bg-surface text-ui text-muted-foreground absolute inset-0 flex items-center justify-center"
        >
          <Spinner />
          {t("feishu.documentComponentLoading")}
        </div>
      ) : null}
    </div>
  );
}
