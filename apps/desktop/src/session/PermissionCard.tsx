import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CircleAlert } from "@/components/ui/icons";

import type { PermissionContext, PermissionContextKind } from "../bridge";
import { useT } from "../i18n";
import type { Translate } from "../i18n";
import type { PermissionQueueItem } from "./sessionEvents";

function contextLabel(kind: PermissionContextKind, t: Translate): string {
  switch (kind) {
    case "mcp_elicitation": {
      return t("permission.kind.externalTool");
    }
    case "website_access": {
      return t("permission.kind.websiteAccess");
    }
    case "sensitive_web_action": {
      return t("permission.kind.sensitiveWebAction");
    }
    case "computer_use_application": {
      return t("permission.kind.appControl");
    }
    case "sites_mutation": {
      return t("permission.kind.siteChange");
    }
    case "sites_production": {
      return t("permission.kind.productionDeploy");
    }
    case "acp": {
      return t("permission.kind.command");
    }
  }
}

function PermissionDetails({
  context,
}: {
  readonly context: PermissionContext;
}) {
  const t = useT();
  const details = [
    [t("permission.server"), context.server],
    [t("permission.tool"), context.tool],
    [t("permission.site"), context.origin],
    [t("permission.application"), context.application],
    [t("permission.risk"), context.risk],
  ].filter((detail): detail is [string, string] => Boolean(detail[1]));

  if (context.kind === "acp") {
    return null;
  }
  return (
    <div className="text-metadata text-muted-foreground space-y-1">
      <p className="text-foreground font-medium">
        {contextLabel(context.kind, t)}
      </p>
      {details.map(([label, value]) => (
        <p key={label}>
          {label}: {value}
        </p>
      ))}
      <p>{t("permission.requiredEvenFullAccess")}</p>
    </div>
  );
}

export function PermissionCard({
  request,
  pendingCount,
  onAnswer,
}: {
  readonly request: PermissionQueueItem;
  readonly pendingCount: number;
  readonly onAnswer: (optionId: string | null) => Promise<void> | void;
}) {
  const t = useT();
  const [answering, setAnswering] = useState(false);

  const answer = async (optionId: string | null) => {
    if (answering) {
      return;
    }
    setAnswering(true);
    try {
      await onAnswer(optionId);
    } finally {
      setAnswering(false);
    }
  };

  return (
    <div className="shrink-0 px-6 pt-3 pb-1" data-testid="permission-card">
      <section
        className="rounded-module bg-card shadow-raised mx-auto w-full max-w-3xl border px-4 py-3"
        aria-labelledby="permission-card-title"
        aria-busy={answering}
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <CircleAlert
            className="text-warning mt-0.5 size-4 shrink-0"
            aria-hidden
          />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h2
                  id="permission-card-title"
                  className="text-body font-semibold"
                >
                  {t("permission.requested")}
                </h2>
                {pendingCount > 1 && (
                  <span className="text-metadata text-muted-foreground">
                    {t("permission.pendingCount", { count: pendingCount })}
                  </span>
                )}
              </div>
              <p className="text-metadata text-muted-foreground">
                {t("permission.sessionScope")}
              </p>
            </div>

            <pre className="rounded-control bg-fill-quiet text-body max-h-40 overflow-auto px-3 py-2 font-mono break-words whitespace-pre-wrap">
              {request.title}
            </pre>

            {request.context ? (
              <PermissionDetails context={request.context} />
            ) : null}

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
