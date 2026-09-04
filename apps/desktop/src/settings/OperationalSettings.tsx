import { useEffect, useRef, useState } from "react";

import { SettingToggle } from "@/components/business/setting-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bug, Download, Globe, RefreshCw, Trash2 } from "@/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { TooltipButton } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  browserPermissions,
  browserRevokePermission,
  exportRedactedDiagnostics,
  getBrowserUseSettings,
  getComputerUseSettings,
  getDeviceSyncStatus,
  getPluginDeveloperStatus,
  onPluginsChanged,
  openDevtools,
  reloadDevelopmentPlugins,
  selectBrowserUseBackend,
  selectComputerUseBackend,
  setAgentBrowserAccess,
  setDeviceSyncEnabled,
  setPluginDeveloperMode,
  syncDeviceDataNow,
} from "../bridge";
import type {
  BrowserUseSettings,
  ComputerUseSettings,
  DiagnosticsExportResult,
  DeviceSyncStatus,
  PluginDeveloperStatus,
} from "../bridge";
import { useT } from "../i18n";
import { GroupHeading, Page, Row } from "./SettingsPrimitives";

interface BackendCopy {
  title: string;
  description: string;
  scope: string;
  access?: string;
  accessHint?: string;
  backend: string;
  automatic: string;
  disabled: string;
  backends: string;
  loading: string;
  available: string;
  unavailable: string;
  loadFailed: (error: unknown) => string;
  testId: string;
}

function BackendSettingsPage({
  copy,
  loader,
  saver,
  accessSaver,
}: {
  copy: BackendCopy;
  loader: () => Promise<ComputerUseSettings>;
  saver: (backend: string) => Promise<ComputerUseSettings>;
  accessSaver?: (enabled: boolean) => Promise<BrowserUseSettings>;
}) {
  const [settings, setSettings] = useState<ComputerUseSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copyRef = useRef(copy);
  copyRef.current = copy;

  useEffect(() => {
    let active = true;
    setError(null);
    void loader()
      .then((next) => {
        if (active) setSettings(next);
      })
      .catch((error: unknown) => {
        if (active) setError(copyRef.current.loadFailed(error));
      });
    return () => {
      active = false;
    };
  }, [loader]);

  const selection = settings?.selections["*"] ?? "automatic";
  const selectionLabel =
    selection === "automatic"
      ? copy.automatic
      : selection === "disabled"
        ? copy.disabled
        : (settings?.backends.find((backend) => backend.id === selection)
            ?.display_name ?? selection);

  async function save(backend: string) {
    setSaving(true);
    setError(null);
    try {
      setSettings(await saver(backend));
    } catch (error) {
      setError(copy.loadFailed(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveAccess(enabled: boolean) {
    if (!accessSaver) return;
    setSaving(true);
    setError(null);
    try {
      setSettings(await accessSaver(enabled));
    } catch (error) {
      setError(copy.loadFailed(error));
    } finally {
      setSaving(false);
    }
  }

  const accessEnabled =
    (settings as BrowserUseSettings | null)?.access_enabled ?? false;

  return (
    <Page title={copy.title} description={copy.description}>
      <p className="text-metadata text-muted-foreground pb-2">{copy.scope}</p>
      {error != null && error !== "" && (
        <p className="text-metadata text-destructive pb-2">{error}</p>
      )}
      {settings?.errors.map((message) => (
        <p key={message} className="text-metadata text-destructive pb-2">
          {message}
        </p>
      ))}
      {settings ? (
        <>
          {accessSaver && (
            <Row label={copy.access ?? ""} hint={copy.accessHint}>
              <Switch
                data-agent-browser-access
                aria-label={copy.access}
                checked={accessEnabled}
                disabled={saving}
                onCheckedChange={(enabled) => void saveAccess(enabled)}
              />
            </Row>
          )}
          <Row label={copy.backend}>
            <Select
              value={selection}
              disabled={saving || (accessSaver !== undefined && !accessEnabled)}
              onValueChange={(backend) => {
                if (backend != null && backend !== "") void save(backend);
              }}
            >
              <SelectTrigger
                data-computer-use-selection={
                  copy.testId === "computer-use" ? "" : undefined
                }
                data-browser-use-selection={
                  copy.testId === "browser-use" ? "" : undefined
                }
                aria-label={copy.backend}
                size="sm"
                className="w-52 justify-between"
              >
                <SelectValue>{selectionLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectGroup>
                  <SelectItem value="automatic">{copy.automatic}</SelectItem>
                  <SelectItem value="disabled">{copy.disabled}</SelectItem>
                  {settings.backends.map((backend) => (
                    <SelectItem
                      key={backend.id}
                      value={backend.id}
                      disabled={!backend.available}
                    >
                      {backend.display_name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Row>

          <GroupHeading>{copy.backends}</GroupHeading>
          {settings.backends.map((backend) => (
            <Row
              key={backend.id}
              compact
              label={backend.display_name}
              hint={
                backend.reason ?? (
                  <span className="font-mono">{backend.id}</span>
                )
              }
            >
              <span className="text-callout text-muted-foreground flex items-center gap-1.5">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    backend.available ? "bg-success" : "bg-border"
                  )}
                />
                {backend.available ? copy.available : copy.unavailable}
              </span>
            </Row>
          ))}
        </>
      ) : (
        <p className="py-section text-body text-muted-foreground">
          {copy.loading}
        </p>
      )}
    </Page>
  );
}

export function ComputerUseSettingsPage({
  loader = getComputerUseSettings,
  saver = selectComputerUseBackend,
}: {
  loader?: () => Promise<ComputerUseSettings>;
  saver?: (backend: string) => Promise<ComputerUseSettings>;
}) {
  const t = useT();
  return (
    <BackendSettingsPage
      loader={loader}
      saver={saver}
      copy={{
        title: t("settings.computerUse"),
        description: t("settings.computerUseHint"),
        scope: t("settings.computerUseNewSession"),
        backend: t("settings.computerUseBackend"),
        automatic: t("settings.computerUseAutomatic"),
        disabled: t("settings.computerUseDisabled"),
        backends: t("settings.computerUseBackends"),
        loading: t("settings.computerUseLoading"),
        available: t("settings.computerUseAvailable"),
        unavailable: t("settings.computerUseUnavailable"),
        loadFailed: (error) =>
          t("settings.computerUseLoadFailed", { error: String(error) }),
        testId: "computer-use",
      }}
    />
  );
}

export function BrowserUseSettingsPage({
  loader = getBrowserUseSettings,
  saver = selectBrowserUseBackend,
  accessSaver = setAgentBrowserAccess,
}: {
  loader?: () => Promise<BrowserUseSettings>;
  saver?: (backend: string) => Promise<BrowserUseSettings>;
  accessSaver?: (enabled: boolean) => Promise<BrowserUseSettings>;
}) {
  const t = useT();
  return (
    <BackendSettingsPage
      loader={loader}
      saver={saver}
      accessSaver={accessSaver}
      copy={{
        title: t("settings.browserUse"),
        description: t("settings.browserUseHint"),
        scope: t("settings.browserUseNewSession"),
        access: t("settings.agentBrowserAccess"),
        accessHint: t("settings.agentBrowserAccessHint"),
        backend: t("settings.browserUseBackend"),
        automatic: t("settings.browserUseAutomatic"),
        disabled: t("settings.browserUseDisabled"),
        backends: t("settings.browserUseBackends"),
        loading: t("settings.browserUseLoading"),
        available: t("settings.browserUseAvailable"),
        unavailable: t("settings.browserUseUnavailable"),
        loadFailed: (error) =>
          t("settings.browserUseLoadFailed", { error: String(error) }),
        testId: "browser-use",
      }}
    />
  );
}

function syncHint(
  t: ReturnType<typeof useT>,
  status: DeviceSyncStatus | null
): string {
  switch (status?.state) {
    case "disabled": {
      return status.available
        ? t("settings.syncReady")
        : t("settings.syncUnavailable");
    }
    case "ready": {
      return status.last_success_at == null
        ? t("settings.syncReady")
        : t("settings.syncLastSuccess", {
            time: new Intl.DateTimeFormat(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(status.last_success_at),
          });
    }
    case "syncing": {
      return t("settings.syncing");
    }
    case "signed-out": {
      return t("settings.syncSignedOut");
    }
    case "restricted": {
      return t("settings.syncRestricted");
    }
    case "unsupported": {
      return t("settings.syncUnsupported");
    }
    case "unavailable": {
      return t("settings.syncUnavailable");
    }
    case "error": {
      return status.message ?? t("settings.syncUnavailable");
    }
    case undefined: {
      throw new Error("Not implemented yet: undefined case");
    }
    default: {
      return status?.available === true
        ? t("settings.syncReady")
        : t("settings.syncLoading");
    }
  }
}

export function DeviceSyncSettingsPage({
  loader = getDeviceSyncStatus,
  enabledSaver = setDeviceSyncEnabled,
  syncStarter = syncDeviceDataNow,
}: {
  loader?: () => Promise<DeviceSyncStatus>;
  enabledSaver?: (enabled: boolean) => Promise<DeviceSyncStatus>;
  syncStarter?: () => Promise<DeviceSyncStatus>;
}) {
  const t = useT();
  const [status, setStatus] = useState<DeviceSyncStatus | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void loader()
      .then((next) => {
        if (active) setStatus(next);
      })
      .catch((error: unknown) => {
        if (active) {
          setStatus({
            transport: "paired-devices",
            state: "error",
            enabled: false,
            available: false,
            last_success_at: null,
            message: String(error),
            imported: null,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [loader]);

  async function saveEnabled(enabled: boolean) {
    setSaving(true);
    try {
      setStatus(await enabledSaver(enabled));
    } catch (error) {
      setStatus((current) => ({
        transport: current?.transport ?? "paired-devices",
        state: "error",
        enabled: current?.enabled ?? false,
        available: current?.available ?? false,
        last_success_at: current?.last_success_at ?? null,
        message: String(error),
        imported: current?.imported ?? null,
      }));
    } finally {
      setSaving(false);
    }
  }

  async function startSync() {
    setStatus((current) =>
      current ? { ...current, state: "syncing" } : current
    );
    try {
      setStatus(await syncStarter());
    } catch (error) {
      setStatus((current) =>
        current
          ? { ...current, state: "error", message: String(error) }
          : current
      );
    }
  }

  return (
    <Page title={t("settings.sync")} description={t("settings.syncHint")}>
      <SettingToggle
        label={t("settings.pairedDeviceSync")}
        description={syncHint(t, status)}
        checked={status?.enabled ?? false}
        disabled={
          saving ||
          status?.state === "syncing" ||
          (!(status?.enabled ?? false) && !(status?.available ?? false))
        }
        onCheckedChange={(checked) => void saveEnabled(checked)}
      />
      <Row label={t("settings.syncNow")} hint={t("settings.syncNowHint")}>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={
            status?.enabled !== true || status.state === "syncing" || saving
          }
          onClick={() => void startSync()}
        >
          {status?.state === "syncing" ? (
            <Spinner />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {status?.state === "syncing"
            ? t("settings.syncingButton")
            : t("settings.syncNowButton")}
        </Button>
      </Row>
      <GroupHeading>{t("settings.syncScope")}</GroupHeading>
      <p className="text-metadata text-muted-foreground pt-1.5">
        {t("settings.syncScopeHint")}
      </p>
    </Page>
  );
}

export function DeveloperSettingsPage({
  loader = getPluginDeveloperStatus,
  modeSaver = setPluginDeveloperMode,
  reloader = reloadDevelopmentPlugins,
  devtoolsOpener = openDevtools,
  diagnosticsExporter = exportRedactedDiagnostics,
}: {
  loader?: () => Promise<PluginDeveloperStatus>;
  modeSaver?: (enabled: boolean) => Promise<PluginDeveloperStatus>;
  reloader?: () => Promise<PluginDeveloperStatus>;
  devtoolsOpener?: () => Promise<void>;
  diagnosticsExporter?: () => Promise<DiagnosticsExportResult>;
}) {
  const t = useT();
  const [status, setStatus] = useState<PluginDeveloperStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnosticsExporting, setDiagnosticsExporting] = useState(false);
  const [diagnosticsMessage, setDiagnosticsMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {
      /* empty */
    };
    const refresh = () => {
      void loader()
        .then((next) => {
          if (active) {
            setStatus(next);
            setError(null);
          }
        })
        .catch((error: unknown) => {
          if (active)
            setError(
              t("settings.developerLoadFailed", { error: String(error) })
            );
        });
    };
    refresh();
    void onPluginsChanged(refresh).then((stop) => {
      if (active) unsubscribe = stop;
      else stop();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [loader, t]);

  async function saveMode(enabled: boolean) {
    setSaving(true);
    setError(null);
    try {
      setStatus(await modeSaver(enabled));
    } catch (error) {
      setError(t("settings.developerSaveFailed", { error: String(error) }));
    } finally {
      setSaving(false);
    }
  }

  async function reload() {
    setReloading(true);
    setError(null);
    try {
      setStatus(await reloader());
    } catch (error) {
      setError(t("settings.developerReloadFailed", { error: String(error) }));
    } finally {
      setReloading(false);
    }
  }

  async function showDevtools() {
    setError(null);
    try {
      await devtoolsOpener();
    } catch (error) {
      setError(t("settings.developerDevtoolsFailed", { error: String(error) }));
    }
  }

  async function exportDiagnostics() {
    setDiagnosticsExporting(true);
    setDiagnosticsMessage(null);
    setError(null);
    try {
      const result = await diagnosticsExporter();
      if (result === "saved")
        setDiagnosticsMessage(t("settings.diagnosticsExported"));
      else if (result === "unsupported")
        setError(t("settings.diagnosticsUnsupported"));
    } catch (error) {
      setError(t("settings.diagnosticsExportFailed", { error: String(error) }));
    } finally {
      setDiagnosticsExporting(false);
    }
  }

  const statusText = status
    ? status.enabled
      ? status.watching
        ? t("settings.pluginHotReloadWatching", { path: status.plugins_dir })
        : t("settings.pluginHotReloadUnavailable")
      : t("settings.pluginHotReloadOff")
    : t("settings.pluginHotReloadLoading");
  const reloadRecord = status?.last_reload;
  const reloadDetail =
    reloadRecord?.success === true
      ? t("settings.pluginHotReloadLastSuccess", {
          plugins: reloadRecord.plugins.length
            ? reloadRecord.plugins.join(", ")
            : t("settings.allInstalledPlugins"),
          time: new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(reloadRecord.at),
        })
      : reloadRecord?.error != null && reloadRecord.error !== ""
        ? t("settings.pluginHotReloadLastError", { error: reloadRecord.error })
        : null;

  return (
    <Page
      title={t("settings.developer")}
      description={t("settings.developerHint")}
    >
      <Row
        label={t("settings.developerMode")}
        hint={t("settings.developerModeHint")}
      >
        <Switch
          checked={status?.enabled ?? false}
          disabled={saving}
          onCheckedChange={(checked) => void saveMode(checked)}
          aria-label={t("settings.developerMode")}
        />
      </Row>
      <GroupHeading>{t("settings.pluginDevelopment")}</GroupHeading>
      <Row
        label={t("settings.pluginHotReload")}
        hint={
          <span aria-live="polite">
            <span className="block">{statusText}</span>
            {reloadDetail != null && reloadDetail !== "" && (
              <span
                className="mt-0.5 block"
                role={reloadRecord?.success === true ? undefined : "alert"}
              >
                {reloadDetail}
              </span>
            )}
          </span>
        }
      >
        <Button
          variant="outline"
          size="sm"
          disabled={reloading || saving}
          onClick={() => void reload()}
        >
          {reloading ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          {reloading
            ? t("settings.reloadingPlugins")
            : t("settings.reloadPlugins")}
        </Button>
      </Row>
      <Row
        label={t("settings.webviewDevtools")}
        hint={t("settings.webviewDevtoolsHint")}
      >
        <Button variant="outline" size="sm" onClick={() => void showDevtools()}>
          <Bug data-icon="inline-start" />
          {t("settings.openWebviewDevtools")}
        </Button>
      </Row>
      <GroupHeading>{t("settings.supportDiagnostics")}</GroupHeading>
      <Row
        label={t("settings.exportDiagnostics")}
        hint={
          <span aria-live="polite">
            {diagnosticsMessage ?? t("settings.exportDiagnosticsHint")}
          </span>
        }
      >
        <Button
          variant="outline"
          size="sm"
          disabled={diagnosticsExporting}
          aria-busy={diagnosticsExporting}
          onClick={() => void exportDiagnostics()}
        >
          {diagnosticsExporting ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Download data-icon="inline-start" />
          )}
          {diagnosticsExporting
            ? t("settings.exportingDiagnostics")
            : t("settings.exportDiagnosticsAction")}
        </Button>
      </Row>
      {error != null && error !== "" && (
        <p className="text-metadata text-destructive pt-2" role="alert">
          {error}
        </p>
      )}
    </Page>
  );
}

export function BrowserPermissionsSettingsPage() {
  const [origins, setOrigins] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void browserPermissions().then((next) => {
      if (active) setOrigins(next);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Page
      title="Browser"
      description="Experimental website permissions granted permanently to C2 Browser. Sensitive actions and downloads always require one-time approval."
    >
      <Row
        icon={<Globe className="text-muted-foreground size-5" />}
        label="Default browser adapter"
        hint="Ordinary requests use C2 Browser. Explicit Chrome, existing-tab, or existing-login requests use Chrome."
      >
        <Badge variant="outline">Experimental</Badge>
      </Row>
      <GroupHeading>Permanent website access</GroupHeading>
      {origins.length === 0 ? (
        <p className="py-section text-body text-muted-foreground">
          No origins have permanent access.
        </p>
      ) : (
        origins.map((origin) => (
          <Row
            key={origin}
            compact
            label={origin}
            hint="Website content remains untrusted."
          >
            <TooltipButton
              label="Revoke"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive size-7"
              onClick={() => {
                void browserRevokePermission(origin).then(() => {
                  setOrigins((current) =>
                    current.filter((item) => item !== origin)
                  );
                });
              }}
            >
              <Trash2 className="size-3.5" />
            </TooltipButton>
          </Row>
        ))
      )}
    </Page>
  );
}
