import { useState } from "react";

import {
  CircleAlert,
  ExternalLink,
  PackageCheck,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "@/components/ui/icons";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/business/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { openExternal } from "../bridge";

import type {
  PluginManagerBundle,
  PluginManagerLabels,
  PluginManagerScope,
} from "./types";

export function BundleAdministration({
  pluginName,
  bundle,
  scope,
  labels,
  busyAction,
  onSetTrusted,
  onUninstall,
}: {
  pluginName: string;
  bundle: PluginManagerBundle;
  scope: PluginManagerScope;
  labels: PluginManagerLabels;
  busyAction: string | null;
  onSetTrusted?: (pluginId: string, trusted: boolean) => Promise<void>;
  onUninstall?: (pluginId: string, keepData: boolean) => Promise<void>;
}) {
  const [uninstallOpen, setUninstallOpen] = useState(false);
  const [keepData, setKeepData] = useState(true);
  const userScope = scope.kind === "user";
  const trustKey = `bundle-trust:${bundle.id}`;
  const uninstallKey = `bundle-uninstall:${bundle.id}`;
  const trustBusy = busyAction === trustKey;
  const uninstallBusy = busyAction === uninstallKey;
  const repositoryUrl = (() => {
    const repository = bundle.repository?.trim();
    if (!repository) return null;
    try {
      const url = new URL(repository);
      return url.protocol === "https:" || url.protocol === "http:"
        ? url.href
        : null;
    } catch {
      return null;
    }
  })();

  const confirmUninstall = async () => {
    if (!onUninstall || uninstallBusy) return;
    try {
      await onUninstall(bundle.id, keepData);
    } finally {
      setUninstallOpen(false);
    }
  };

  return (
    <>
      <section
        data-bundle-administration
        aria-labelledby={`bundle-management-${bundle.id}`}
        className="flex flex-col gap-4 rounded-(--ds-radius-module) bg-fill-quiet p-3"
      >
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <PackageCheck
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h3
                id={`bundle-management-${bundle.id}`}
                className="text-title font-medium"
              >
                {labels.bundleManagement}
              </h3>
              <p className="mt-1 break-words text-fine leading-relaxed text-muted-foreground">
                {bundle.repository || labels.installedBundle}
              </p>
            </div>
          </div>
          {bundle.requiresTrust ? (
            <StatusBadge tone={bundle.trusted ? "success" : "destructive"}>
              {bundle.trusted ? (
                <ShieldCheck aria-hidden="true" />
              ) : (
                <ShieldAlert aria-hidden="true" />
              )}
              {bundle.trusted ? labels.trusted : labels.notTrusted}
            </StatusBadge>
          ) : (
            <Badge variant="secondary">{labels.dataOnly}</Badge>
          )}
        </div>

        {!userScope ? (
          <p className="text-hint leading-relaxed text-muted-foreground">
            {labels.bundleManagementUserOnly}
          </p>
        ) : bundle.requiresTrust && !bundle.trusted ? (
          <p className="flex items-start gap-2 text-hint leading-relaxed text-muted-foreground">
            <ShieldAlert
              className="mt-0.5 size-4 shrink-0 text-warning"
              aria-hidden="true"
            />
            <span>{labels.trustRequired}</span>
          </p>
        ) : null}

        {bundle.contributions.length ? (
          <div className="flex flex-col gap-2">
            <h4 className="text-hint font-medium text-muted-foreground">
              {labels.contributions}
            </h4>
            <div className="flex flex-wrap gap-2">
              {bundle.contributions.map((contribution) => (
                <Badge key={contribution.id} variant="secondary">
                  <span className="tabular-nums">{contribution.count}</span>{" "}
                  {labels.contribution(contribution.id, contribution.label)}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {bundle.diagnostics.length ? (
          <div className="flex flex-col gap-2">
            <h4 className="text-hint font-medium text-muted-foreground">
              {labels.diagnostics}
            </h4>
            <ul className="flex flex-col gap-2">
              {bundle.diagnostics.map((diagnostic, index) => (
                <li
                  key={`${diagnostic.component ?? "bundle"}:${index}`}
                  className={
                    diagnostic.level === "error"
                      ? "flex items-start gap-2 text-ui text-destructive"
                      : "flex items-start gap-2 text-ui text-muted-foreground"
                  }
                >
                  <CircleAlert
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    {diagnostic.message}
                    {diagnostic.component ? (
                      <span className="block text-fine">
                        {diagnostic.component}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {userScope ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {repositoryUrl ? (
                <Button
                  type="button"
                  size="compact"
                  variant="secondary"
                  disabled={trustBusy || uninstallBusy}
                  onClick={() => void openExternal(repositoryUrl)}
                >
                  <ExternalLink data-icon="inline-start" />
                  {labels.reviewSource}
                </Button>
              ) : null}
              {bundle.requiresTrust && onSetTrusted ? (
                <Button
                  type="button"
                  size="compact"
                  variant={bundle.trusted ? "secondary" : "default"}
                  disabled={trustBusy || uninstallBusy}
                  onClick={() => void onSetTrusted(bundle.id, !bundle.trusted)}
                >
                  {trustBusy ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <ShieldCheck data-icon="inline-start" />
                  )}
                  {bundle.trusted ? labels.revokeTrust : labels.trustPlugin}
                </Button>
              ) : null}
            </div>
            {onUninstall ? (
              <Button
                type="button"
                size="compact"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={trustBusy || uninstallBusy}
                onClick={() => setUninstallOpen(true)}
              >
                <Trash2 data-icon="inline-start" />
                {labels.uninstall}
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      <AlertDialog
        open={uninstallOpen}
        onOpenChange={(open) => !uninstallBusy && setUninstallOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {labels.uninstallTitle(pluginName)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {labels.uninstallDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field orientation="horizontal">
            <Checkbox
              id={`keep-plugin-data-${bundle.id}`}
              checked={keepData}
              disabled={uninstallBusy}
              onCheckedChange={(checked) => setKeepData(checked === true)}
            />
            <FieldLabel htmlFor={`keep-plugin-data-${bundle.id}`}>
              {labels.keepPluginData}
            </FieldLabel>
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={uninstallBusy}>
              {labels.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={uninstallBusy}
              onClick={(event) => {
                event.preventDefault();
                void confirmUninstall();
              }}
            >
              {uninstallBusy ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              {labels.uninstall}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
