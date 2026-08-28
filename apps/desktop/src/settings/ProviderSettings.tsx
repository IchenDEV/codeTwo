import { useEffect, useState } from "react";
import { ChevronDown, Download, RefreshCw } from "@/components/ui/icons";

import {
  installProvider,
  setProviderEnabled,
  upgradeProvider,
  type ProviderInfo,
} from "../bridge";
import { ProviderIcon } from "../providers/ProviderIcon";
import { useT } from "../i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Page } from "./SettingsPrimitives";

const CAPABILITY_LABELS = {
  image_generation: "Image generation",
  computer_use: "Computer Use",
  chrome_browser: "Browser Use",
  codetwo_browser: "C2 Browser",
  sites: "Sites",
} as const;

type ProviderOperation = {
  id: string;
  action: "install" | "upgrade" | "enable" | "refresh";
};

export function ProviderSettingsPage({
  providers,
  reload,
  installer = installProvider,
  upgrader = upgradeProvider,
  enabledSaver = setProviderEnabled,
}: {
  providers: ProviderInfo[];
  reload?: () => void | Promise<ProviderInfo[]>;
  installer?: (provider: string) => Promise<ProviderInfo[]>;
  upgrader?: (provider: string) => Promise<ProviderInfo[]>;
  enabledSaver?: (provider: string, enabled: boolean) => Promise<ProviderInfo[]>;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [operation, setOperation] = useState<ProviderOperation | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    if (!reload) return;
    let active = true;
    setOperation({ id: "*", action: "refresh" });
    setError(null);
    void (async () => {
      try {
        await reload();
        if (active) setMessage({ id: "*", text: t("settings.providerChecked") });
      } catch (cause) {
        if (active) {
          setError({ id: "*", text: t("settings.providerRefreshFailed", { error: String(cause) }) });
        }
      } finally {
        if (active) setOperation(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [reload, t]);

  async function refresh() {
    if (!reload || operation) return;
    setOperation({ id: "*", action: "refresh" });
    setError(null);
    try {
      await reload();
      setMessage({ id: "*", text: t("settings.providerChecked") });
    } catch (cause) {
      setError({ id: "*", text: t("settings.providerRefreshFailed", { error: String(cause) }) });
    } finally {
      setOperation(null);
    }
  }

  async function runAction(providerId: string, action: "install" | "upgrade") {
    if (operation) return;
    const candidate = providers.find((item) => item.id === providerId);
    if (!candidate) return;
    setOperation({ id: providerId, action });
    setError(null);
    setMessage(null);
    try {
      if (action === "install") await installer(providerId);
      else await upgrader(providerId);
      setMessage({
        id: providerId,
        text: action === "install"
          ? t("settings.providerInstalled", { provider: candidate.display_name })
          : t("settings.providerUpgraded", { provider: candidate.display_name }),
      });
      await reload?.();
    } catch (cause) {
      setError({ id: providerId, text: t("settings.providerActionFailed", { error: String(cause) }) });
    } finally {
      setOperation(null);
    }
  }

  async function saveEnabled(providerId: string, enabled: boolean) {
    if (operation) return;
    const candidate = providers.find((item) => item.id === providerId);
    if (!candidate) return;
    setOperation({ id: providerId, action: "enable" });
    setError(null);
    setMessage(null);
    try {
      await enabledSaver(providerId, enabled);
      setMessage({
        id: providerId,
        text: enabled
          ? t("settings.providerEnabledMessage", { provider: candidate.display_name })
          : t("settings.providerDisabledMessage", { provider: candidate.display_name }),
      });
      await reload?.();
    } catch (cause) {
      setError({ id: providerId, text: t("settings.providerActionFailed", { error: String(cause) }) });
    } finally {
      setOperation(null);
    }
  }

  function toggle(providerId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  }

  return (
    <Page title={t("settings.providers")} description={t("settings.providersHint")}>
      <div className="mb-2 flex items-center justify-end gap-2">
        {(operation?.action === "refresh" || message?.id === "*") && (
          <span className="text-fine text-muted-foreground">
            {operation?.action === "refresh" ? t("settings.providerChecking") : message?.text}
          </span>
        )}
        <Button
          data-provider-refresh
          variant="ghost"
          size="xs"
          disabled={!reload || operation !== null}
          aria-label={t("settings.providerRefresh")}
          onClick={() => void refresh()}
        >
          {operation?.action === "refresh" ? <Spinner /> : <RefreshCw />}
          {t("settings.providerRefresh")}
        </Button>
      </div>
      {error?.id === "*" && <p className="mb-2 text-fine text-destructive">{error.text}</p>}
      <div className="space-y-1">
        {providers.map((provider) => {
          const enabled = provider.enabled !== false;
          const management = provider.management ?? {
            installed: provider.available,
            version: null,
            latest_version: null,
            update_available: null,
            check_error: null,
            install_supported: false,
            upgrade_supported: false,
            launch_mode: provider.available ? "installed" as const : "unavailable" as const,
          };
          const isExpanded = expanded.has(provider.id);
          const activeOperation = operation?.id === provider.id ? operation.action : null;
          const status = !enabled
            ? t("settings.providerDisabled")
            : management.installed
              ? management.version
                ? t("settings.providerInstalledVersion", { version: management.version })
                : t("settings.installed")
              : management.launch_mode === "on_demand"
                ? t("settings.providerReadyOnDemand")
                : t("settings.notInstalled");
          return (
            <div
              key={provider.id}
              data-provider-row={provider.id}
              className="rounded-module bg-fill-quiet/40 px-3 transition-colors hover:bg-fill-quiet/70"
            >
              <div className="flex min-h-14 items-center gap-2">
                <button
                  type="button"
                  data-provider-disclosure={provider.id}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left outline-none focus-visible:focus-ring"
                  aria-expanded={isExpanded}
                  aria-controls={`provider-details-${provider.id}`}
                  onClick={() => toggle(provider.id)}
                >
                  <span className="relative shrink-0">
                    <ProviderIcon provider={provider.id} className={cn("size-5", !enabled && "opacity-40")} />
                    <span
                      className={cn(
                        "absolute -right-0.5 -top-0.5 size-1.5 rounded-full",
                        enabled && provider.available && "bg-success",
                        enabled && !provider.available && management.launch_mode === "on_demand" && "bg-warning",
                        (!enabled || management.launch_mode === "unavailable") && "bg-border",
                      )}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-ui font-medium">{provider.display_name}</span>
                      {management.version && (
                        <span className="shrink-0 font-mono text-cap text-muted-foreground">v{management.version}</span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-fine text-muted-foreground">{status}</span>
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                </button>
                {!management.installed && management.install_supported && (
                  <Button
                    data-provider-action={`${provider.id}:install`}
                    variant="secondary"
                    size="xs"
                    disabled={operation !== null}
                    onClick={() => void runAction(provider.id, "install")}
                  >
                    {activeOperation === "install" ? <Spinner /> : <Download />}
                    {activeOperation === "install" ? t("settings.providerInstalling") : t("settings.providerInstall")}
                  </Button>
                )}
                {management.installed && management.upgrade_supported && management.update_available === true && (
                  <Button
                    data-provider-action={`${provider.id}:upgrade`}
                    variant="ghost"
                    size="xs"
                    disabled={operation !== null}
                    onClick={() => void runAction(provider.id, "upgrade")}
                  >
                    {activeOperation === "upgrade" ? <Spinner /> : <RefreshCw />}
                    {activeOperation === "upgrade"
                      ? t("settings.providerUpgrading")
                      : management.latest_version
                        ? t("settings.providerUpgradeVersion", { version: management.latest_version })
                        : t("settings.providerUpgrade")}
                  </Button>
                )}
                <Switch
                  data-provider-toggle={provider.id}
                  checked={enabled}
                  disabled={operation !== null}
                  aria-label={enabled
                    ? t("settings.providerDisableAria", { provider: provider.display_name })
                    : t("settings.providerEnableAria", { provider: provider.display_name })}
                  onCheckedChange={(checked) => void saveEnabled(provider.id, checked)}
                />
              </div>
              {(message?.id === provider.id || error?.id === provider.id) && (
                <p className={cn("ml-8 pb-2 text-fine", error?.id === provider.id ? "text-destructive" : "text-muted-foreground")}>
                  {error?.id === provider.id ? error.text : message?.text}
                </p>
              )}
              {isExpanded && (
                <div id={`provider-details-${provider.id}`} className="ml-8 pb-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-fine text-muted-foreground">
                    <span className="font-mono">{provider.id}</span>
                    <span>
                      {management.launch_mode === "installed"
                        ? t("settings.providerLocalRuntime")
                        : management.launch_mode === "on_demand"
                          ? t("settings.providerOnDemandRuntime")
                          : t("settings.providerUnavailableRuntime")}
                    </span>
                    {provider.needs_node && <span>{t("settings.needsNode")}</span>}
                  </div>
                  {provider.capabilities.filter((capability) => capability.state !== "unavailable").map((capability) => (
                    <div
                      key={capability.id}
                      data-provider-capability={`${provider.id}:${capability.id}`}
                      className="flex items-start justify-between gap-6 py-module-inset"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-hint font-medium">
                          {CAPABILITY_LABELS[capability.id]}
                          {capability.experimental && <Badge variant="outline">Experimental</Badge>}
                          {capability.version && <span className="font-mono text-cap text-muted-foreground">{capability.version}</span>}
                        </div>
                        {capability.reason && <p className="mt-0.5 text-fine leading-relaxed text-muted-foreground">{capability.reason}</p>}
                        {capability.fix && <p className="mt-0.5 text-fine leading-relaxed text-foreground/75">{capability.fix}</p>}
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-fine capitalize text-muted-foreground">
                        <span className={cn("size-1.5 rounded-full", capability.state === "ready" && "bg-success", capability.state === "unverified" && "bg-warning")} />
                        {capability.state}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Page>
  );
}
