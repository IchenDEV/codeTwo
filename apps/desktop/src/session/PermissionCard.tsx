import { CircleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useT, type Translate } from "../i18n";
import type { PermissionContext, PermissionContextKind } from "../bridge";
import type { PermissionQueueItem } from "./sessionEvents";

function contextLabel(kind: PermissionContextKind, t: Translate): string {
  switch (kind) {
    case "mcp_elicitation":
      return t("permission.kind.externalTool");
    case "website_access":
      return t("permission.kind.websiteAccess");
    case "sensitive_web_action":
      return t("permission.kind.sensitiveWebAction");
    case "computer_use_application":
      return t("permission.kind.appControl");
    case "sites_mutation":
      return t("permission.kind.siteChange");
    case "sites_production":
      return t("permission.kind.productionDeploy");
    case "acp":
      return t("permission.kind.command");
  }
}

function PermissionDetails({ context }: { context: PermissionContext }) {
  const t = useT();
  const details = [
    [t("permission.server"), context.server],
    [t("permission.tool"), context.tool],
    [t("permission.site"), context.origin],
    [t("permission.application"), context.application],
    [t("permission.risk"), context.risk],
  ].filter((detail): detail is [string, string] => Boolean(detail[1]));

  if (context.kind === "acp") return null;
  return (
    <div className="space-y-1 text-hint text-muted-foreground">
      <p className="font-medium text-foreground">{contextLabel(context.kind, t)}</p>
      {details.map(([label, value]) => (
        <p key={label}>
          {label}: {value}
        </p>
      ))}
      <p>{t("permission.requiredEvenFullAccess")}</p>
    </div>
  );
}

/** A non-modal approval surface anchored to the chat that owns the request. */
export function PermissionCard({
  request,
  pendingCount,
  onAnswer,
}: {
  request: PermissionQueueItem;
  pendingCount: number;
  onAnswer: (optionId: string | null) => Promise<void> | void;
}) {
  const t = useT();
  const [answering, setAnswering] = useState(false);

  const answer = async (optionId: string | null) => {
    if (answering) return;
    setAnswering(true);
    try {
      await onAnswer(optionId);
    } finally {
      setAnswering(false);
    }
  };

  return (
    <div className="shrink-0 px-6 pb-1 pt-3" data-testid="permission-card">
      <section
        className="mx-auto w-full max-w-3xl border bg-card px-4 py-3 shadow-raised"
        style={{ borderRadius: "var(--ds-radius-module)" }}
        aria-labelledby="permission-card-title"
        aria-busy={answering}
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h2 id="permission-card-title" className="text-ui font-semibold">
                  {t("permission.requested")}
                </h2>
                {pendingCount > 1 && (
                  <span className="text-cap text-muted-foreground">
                    {t("permission.pendingCount", { count: pendingCount })}
                  </span>
                )}
              </div>
              <p className="text-hint text-muted-foreground">
                {t("permission.sessionScope")}
              </p>
            </div>

            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-(--ds-radius-control) bg-fill-quiet px-3 py-2 font-mono text-ui">
              {request.title}
            </pre>

            {request.context && <PermissionDetails context={request.context} />}

            <div className="flex flex-wrap items-center gap-2">
              {request.options.map(([id, label]) => (
                <Button
                  key={id}
                  size="sm"
                  variant="secondary"
                  disabled={answering}
                  onClick={() => void answer(id)}
                >
                  {label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                disabled={answering}
                onClick={() => void answer(null)}
              >
                {t("permission.cancel")}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
