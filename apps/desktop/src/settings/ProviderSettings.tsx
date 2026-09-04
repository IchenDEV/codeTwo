import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, RefreshCw } from "@/components/ui/icons";

import {
  configureProvider,
  installProvider,
  setProviderEnabled,
  upgradeProvider,
  type ProviderInfo,
  type ProviderRuntimeConfiguration,
  type ProviderRuntimeOverride,
} from "../bridge";
import { ProviderIcon } from "../providers/ProviderIcon";
import { useT } from "../i18n";
import { groupModels } from "../session/models";
import { useProviderModelPreferences } from "../session/modelPreferences";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SearchField } from "@/components/business/search-field";
import { cn } from "@/lib/utils";
import { GroupHeading, Page } from "./SettingsPrimitives";

const CAPABILITY_LABELS = {
  image_generation: "Image generation",
  computer_use: "Computer Use",
  chrome_browser: "Browser Use",
  codetwo_browser: "C2 Browser",
  sites: "Sites",
} as const;

type ProviderOperation = {
  id: string;
  action: "install" | "upgrade" | "enable" | "configure" | "refresh";
};

function runtimeConfiguration(
  provider: ProviderInfo
): ProviderRuntimeConfiguration {
  return (
    provider.configuration ?? {
      display_name: null,
      command: null,
      args: null,
      home_path: null,
      home_environment:
        provider.id === "codex"
          ? "CODEX_HOME"
          : provider.id === "claude_code"
            ? "CLAUDE_CONFIG_DIR"
            : null,
      forwarded_environment: [],
      missing_environment: [],
      effective_command: "",
      effective_args: [],
    }
  );
}

function listFromLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function providerRuntimeOverrideFromDraft(draft: {
  displayName: string;
  command: string;
  homePath: string;
  argsOverridden: boolean;
  args: string;
  forwardedEnvironment: string;
}): ProviderRuntimeOverride {
  return {
    display_name: draft.displayName.trim() || null,
    command: draft.command.trim() || null,
    args: draft.argsOverridden ? listFromLines(draft.args) : null,
    home_path: draft.homePath.trim() || null,
    forwarded_environment: listFromLines(draft.forwardedEnvironment),
  };
}

const ProviderRuntimeEditor = ({
  provider,
  disabled,
  saving,
  onSave,
}: {
  readonly provider: ProviderInfo;
  readonly disabled: boolean;
  readonly saving: boolean;
  readonly onSave: (configuration: ProviderRuntimeOverride) => Promise<void>;
}) => {
  const t = useT();
  const configuration = runtimeConfiguration(provider);
  const [displayName, setDisplayName] = useState(
    configuration.display_name ?? ""
  );
  const [command, setCommand] = useState(configuration.command ?? "");
  const [homePath, setHomePath] = useState(configuration.home_path ?? "");
  const [argsOverridden, setArgsOverridden] = useState(
    configuration.args !== null
  );
  const [args, setArgs] = useState((configuration.args ?? []).join("\n"));
  const [forwardedEnvironment, setForwardedEnvironment] = useState(
    configuration.forwarded_environment.join("\n")
  );

  useEffect(() => {
    const next = runtimeConfiguration(provider);
    setDisplayName(next.display_name ?? "");
    setCommand(next.command ?? "");
    setHomePath(next.home_path ?? "");
    setArgsOverridden(next.args !== null);
    setArgs((next.args ?? []).join("\n"));
    setForwardedEnvironment(next.forwarded_environment.join("\n"));
  }, [provider]);

  const nextConfiguration = useMemo<ProviderRuntimeOverride>(
    () =>
      providerRuntimeOverrideFromDraft({
        displayName,
        command,
        homePath,
        argsOverridden,
        args,
        forwardedEnvironment,
      }),
    [args, argsOverridden, command, displayName, forwardedEnvironment, homePath]
  );
  const persistedConfiguration: ProviderRuntimeOverride = {
    display_name: configuration.display_name,
    command: configuration.command,
    args: configuration.args,
    home_path: configuration.home_path,
    forwarded_environment: configuration.forwarded_environment,
  };
  const changed =
    JSON.stringify(nextConfiguration) !==
    JSON.stringify(persistedConfiguration);

  function reset() {
    setDisplayName("");
    setCommand("");
    setHomePath("");
    setArgsOverridden(false);
    setArgs("");
    setForwardedEnvironment("");
  }

  return (
    <div
      data-provider-runtime-editor={provider.id}
      className="space-y-section pt-module-inset"
    >
      <GroupHeading>{t("settings.providerRuntimeConfiguration")}</GroupHeading>
      <div className="gap-module-inset grid">
        <Field>
          <FieldLabel htmlFor={`provider-display-name-${provider.id}`}>
            {t("settings.providerDisplayName")}
          </FieldLabel>
          <Input
            id={`provider-display-name-${provider.id}`}
            size="compact"
            value={displayName}
            placeholder={provider.display_name}
            disabled={disabled}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <FieldDescription>
            {t("settings.providerDisplayNameHint")}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`provider-command-${provider.id}`}>
            {t("settings.providerRuntimeCommand")}
          </FieldLabel>
          <Input
            id={`provider-command-${provider.id}`}
            size="compact"
            value={command}
            placeholder={
              configuration.effective_command ||
              t("settings.providerRuntimeCommandPlaceholder")
            }
            disabled={disabled}
            spellCheck={false}
            onChange={(event) => setCommand(event.target.value)}
          />
          <FieldDescription>
            {t("settings.providerRuntimeCommandHint")}
          </FieldDescription>
        </Field>
        {configuration.home_environment ? <Field>
            <FieldLabel htmlFor={`provider-home-${provider.id}`}>
              {t("settings.providerConfigDirectory")}
            </FieldLabel>
            <Input
              id={`provider-home-${provider.id}`}
              size="compact"
              value={homePath}
              placeholder={`~/.${provider.id === "codex" ? "codex" : "claude"}`}
              disabled={disabled}
              spellCheck={false}
              onChange={(event) => setHomePath(event.target.value)}
            />
            <FieldDescription>
              {t("settings.providerConfigDirectoryHint", {
                variable: configuration.home_environment,
              })}
            </FieldDescription>
          </Field> : null}
        <Field>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel htmlFor={`provider-args-${provider.id}`}>
              {t("settings.providerRuntimeArguments")}
            </FieldLabel>
            <Switch
              checked={argsOverridden}
              disabled={disabled}
              aria-label={t("settings.providerOverrideArguments")}
              onCheckedChange={setArgsOverridden}
            />
          </div>
          <Textarea
            id={`provider-args-${provider.id}`}
            size="compact"
            rows={3}
            value={args}
            disabled={disabled || !argsOverridden}
            placeholder={
              configuration.effective_args.join("\n") ||
              t("settings.providerNoArguments")
            }
            spellCheck={false}
            onChange={(event) => setArgs(event.target.value)}
          />
          <FieldDescription>
            {t("settings.providerRuntimeArgumentsHint")}
          </FieldDescription>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={`provider-environment-${provider.id}`}>
          {t("settings.providerForwardedEnvironment")}
        </FieldLabel>
        <Textarea
          id={`provider-environment-${provider.id}`}
          size="compact"
          rows={3}
          value={forwardedEnvironment}
          disabled={disabled}
          placeholder="OPENAI_BASE_URL"
          spellCheck={false}
          onChange={(event) => setForwardedEnvironment(event.target.value)}
        />
        <FieldDescription>
          {t("settings.providerForwardedEnvironmentHint")}
        </FieldDescription>
        {configuration.missing_environment.length > 0 && (
          <p className="text-fine text-warning">
            {t("settings.providerMissingEnvironment", {
              variables: configuration.missing_environment.join(", "),
            })}
          </p>
        )}
      </Field>
      <div className="gap-control-group flex items-center justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={reset}
        >
          {t("settings.restoreDefaults")}
        </Button>
        <Button
          type="button"
          size="sm"
          data-provider-save={provider.id}
          disabled={disabled || !changed}
          onClick={() => void onSave(nextConfiguration)}
        >
          {saving ? <Spinner /> : null}
          {saving ? t("settings.providerSaving") : t("settings.providerSave")}
        </Button>
      </div>
    </div>
  );
}

const ProviderModels = ({ provider }: { readonly provider: ProviderInfo }) => {
  const t = useT();
  const [search, setSearch] = useState("");
  const { hidden, setVisible, showAll } = useProviderModelPreferences(
    provider.id
  );
  const models = useMemo(() => groupModels(provider.models), [provider.models]);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = normalizedSearch
    ? models.filter((model) =>
        `${model.label}\n${model.key}`
          .toLocaleLowerCase()
          .includes(normalizedSearch)
      )
    : models;

  if (models.length === 0) return null;
  return (
    <div
      data-provider-models={provider.id}
      className="space-y-module-inset pt-section"
    >
      <div className="gap-control-group flex flex-wrap items-center justify-between">
        <GroupHeading>{t("settings.providerModels")}</GroupHeading>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={hidden.size === 0}
          onClick={showAll}
        >
          {t("settings.providerShowAllModels")}
        </Button>
      </div>
      <SearchField
        label={t("settings.providerSearchModels")}
        placeholder={t("settings.providerSearchModels")}
        value={search}
        clearLabel={t("settings.providerClearModelSearch")}
        onClear={() => setSearch("")}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="divide-border/60 divide-y">
        {filtered.map((model) => {
          const visible = !hidden.has(model.key);
          return (
            <div
              key={model.key}
              data-provider-model={`${provider.id}:${model.key}`}
              className="min-h-control-field py-inline flex items-center gap-4"
            >
              <div className="min-w-0 flex-1">
                <p className="text-ui truncate font-medium">{model.label}</p>
                <p className="text-cap text-muted-foreground truncate font-mono">
                  {model.key}
                </p>
              </div>
              <Switch
                checked={visible}
                aria-label={
                  visible
                    ? t("settings.providerHideModel", { model: model.label })
                    : t("settings.providerShowModel", { model: model.label })
                }
                onCheckedChange={(checked) => setVisible(model.key, checked)}
              />
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="py-section text-fine text-muted-foreground text-center">
            {t("settings.providerNoMatchingModels")}
          </p>
        )}
      </div>
      <p className="text-fine text-muted-foreground">
        {t("settings.providerModelsHint")}
      </p>
    </div>
  );
}

export const ProviderSettingsPage = ({
  providers,
  reload,
  installer = installProvider,
  upgrader = upgradeProvider,
  enabledSaver = setProviderEnabled,
  configurationSaver = configureProvider,
}: {
  readonly providers: ProviderInfo[];
  readonly reload?: () => void | Promise<ProviderInfo[]>;
  readonly installer?: (provider: string) => Promise<ProviderInfo[]>;
  readonly upgrader?: (provider: string) => Promise<ProviderInfo[]>;
  readonly enabledSaver?: (
    provider: string,
    enabled: boolean
  ) => Promise<ProviderInfo[]>;
  readonly configurationSaver?: (
    provider: string,
    configuration: ProviderRuntimeOverride
  ) => Promise<ProviderInfo[]>;
}) => {
  const t = useT();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [operation, setOperation] = useState<ProviderOperation | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string } | null>(
    null
  );
  const [error, setError] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    if (!reload) return;
    let active = true;
    setOperation({ id: "*", action: "refresh" });
    setError(null);
    void (async () => {
      try {
        await reload();
        if (active)
          setMessage({ id: "*", text: t("settings.providerChecked") });
      } catch (cause) {
        if (active) {
          setError({
            id: "*",
            text: t("settings.providerRefreshFailed", { error: String(cause) }),
          });
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
      setError({
        id: "*",
        text: t("settings.providerRefreshFailed", { error: String(cause) }),
      });
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
        text:
          action === "install"
            ? t("settings.providerInstalled", {
                provider: candidate.display_name,
              })
            : t("settings.providerUpgraded", {
                provider: candidate.display_name,
              }),
      });
      await reload?.();
    } catch (cause) {
      setError({
        id: providerId,
        text: t("settings.providerActionFailed", { error: String(cause) }),
      });
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
          ? t("settings.providerEnabledMessage", {
              provider: candidate.display_name,
            })
          : t("settings.providerDisabledMessage", {
              provider: candidate.display_name,
            }),
      });
      await reload?.();
    } catch (cause) {
      setError({
        id: providerId,
        text: t("settings.providerActionFailed", { error: String(cause) }),
      });
    } finally {
      setOperation(null);
    }
  }

  async function saveConfiguration(
    providerId: string,
    configuration: ProviderRuntimeOverride
  ) {
    if (operation) return;
    const candidate = providers.find((item) => item.id === providerId);
    if (!candidate) return;
    setOperation({ id: providerId, action: "configure" });
    setError(null);
    setMessage(null);
    try {
      await configurationSaver(providerId, configuration);
      setMessage({
        id: providerId,
        text: t("settings.providerConfigured", {
          provider: candidate.display_name,
        }),
      });
      await reload?.();
    } catch (cause) {
      setError({
        id: providerId,
        text: t("settings.providerActionFailed", { error: String(cause) }),
      });
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
    <Page
      title={t("settings.providers")}
      description={t("settings.providersHint")}
    >
      <div className="mb-2 flex items-center justify-end gap-2">
        {(operation?.action === "refresh" || message?.id === "*") && (
          <span className="text-callout text-muted-foreground">
            {operation?.action === "refresh"
              ? t("settings.providerChecking")
              : message?.text}
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
      {error?.id === "*" && (
        <p className="text-callout text-destructive mb-2">{error.text}</p>
      )}
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
            launch_mode: provider.available
              ? ("installed" as const)
              : ("unavailable" as const),
          };
          const isExpanded = expanded.has(provider.id);
          const activeOperation =
            operation?.id === provider.id ? operation.action : null;
          const status = !enabled
            ? t("settings.providerDisabled")
            : management.installed
              ? management.version
                ? t("settings.providerInstalledVersion", {
                    version: management.version,
                  })
                : t("settings.installed")
              : management.launch_mode === "on_demand"
                ? t("settings.providerReadyOnDemand")
                : t("settings.notInstalled");
          return (
            <div
              key={provider.id}
              data-provider-row={provider.id}
              className="rounded-module bg-fill-quiet/40 hover:bg-fill-quiet/70 px-3 transition-colors"
            >
              <div className="flex min-h-14 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="row"
                  focusStyle="inset"
                  data-provider-disclosure={provider.id}
                  className="min-w-0 flex-1 gap-3 py-3"
                  aria-expanded={isExpanded}
                  aria-controls={`provider-details-${provider.id}`}
                  onClick={() => toggle(provider.id)}
                >
                  <span className="relative shrink-0">
                    <ProviderIcon
                      provider={provider.id}
                      className={cn("size-5", !enabled && "opacity-40")}
                    />
                    <span
                      className={cn(
                        "absolute -top-0.5 -right-0.5 size-1.5 rounded-full",
                        enabled && provider.available && "bg-success",
                        enabled &&
                          !provider.available &&
                          management.launch_mode === "on_demand" &&
                          "bg-warning",
                        (!enabled ||
                          management.launch_mode === "unavailable") &&
                          "bg-border"
                      )}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="text-body truncate font-medium">
                        {provider.display_name}
                      </span>
                      {management.version ? <span className="text-metadata text-muted-foreground shrink-0 font-mono">
                          v{management.version}
                        </span> : null}
                    </span>
                    <span className="text-callout text-muted-foreground mt-0.5 block truncate">
                      {status}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "text-muted-foreground size-4 shrink-0 transition-transform",
                      isExpanded && "rotate-180"
                    )}
                  />
                </Button>
                {!management.installed && management.install_supported ? <Button
                    data-provider-action={`${provider.id}:install`}
                    variant="secondary"
                    size="xs"
                    disabled={operation !== null}
                    onClick={() => void runAction(provider.id, "install")}
                  >
                    {activeOperation === "install" ? <Spinner /> : <Download />}
                    {activeOperation === "install"
                      ? t("settings.providerInstalling")
                      : t("settings.providerInstall")}
                  </Button> : null}
                {management.installed &&
                  management.upgrade_supported &&
                  management.update_available === true ? <Button
                      data-provider-action={`${provider.id}:upgrade`}
                      variant="ghost"
                      size="xs"
                      disabled={operation !== null}
                      onClick={() => void runAction(provider.id, "upgrade")}
                    >
                      {activeOperation === "upgrade" ? (
                        <Spinner />
                      ) : (
                        <RefreshCw />
                      )}
                      {activeOperation === "upgrade"
                        ? t("settings.providerUpgrading")
                        : management.latest_version
                          ? t("settings.providerUpgradeVersion", {
                              version: management.latest_version,
                            })
                          : t("settings.providerUpgrade")}
                    </Button> : null}
                <Switch
                  data-provider-toggle={provider.id}
                  checked={enabled}
                  disabled={operation !== null}
                  aria-label={
                    enabled
                      ? t("settings.providerDisableAria", {
                          provider: provider.display_name,
                        })
                      : t("settings.providerEnableAria", {
                          provider: provider.display_name,
                        })
                  }
                  onCheckedChange={(checked) =>
                    void saveEnabled(provider.id, checked)
                  }
                />
              </div>
              {(message?.id === provider.id || error?.id === provider.id) && (
                <p
                  className={cn(
                    "text-callout ml-8 pb-2",
                    error?.id === provider.id
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {error?.id === provider.id ? error.text : message?.text}
                </p>
              )}
              {isExpanded ? <div
                  id={`provider-details-${provider.id}`}
                  className="ml-8 pb-3"
                >
                  <div className="text-callout text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono">{provider.id}</span>
                    <span>
                      {management.launch_mode === "installed"
                        ? t("settings.providerLocalRuntime")
                        : management.launch_mode === "on_demand"
                          ? t("settings.providerOnDemandRuntime")
                          : t("settings.providerUnavailableRuntime")}
                    </span>
                    {provider.needs_node ? <span>{t("settings.needsNode")}</span> : null}
                  </div>
                  <ProviderRuntimeEditor
                    provider={provider}
                    disabled={operation !== null}
                    saving={activeOperation === "configure"}
                    onSave={(configuration) =>
                      saveConfiguration(provider.id, configuration)
                    }
                  />
                  <ProviderModels provider={provider} />
                  {provider.capabilities.some(
                    (capability) => capability.state !== "unavailable"
                  ) && (
                    <GroupHeading>
                      {t("settings.providerCapabilities")}
                    </GroupHeading>
                  )}
                  {provider.capabilities
                    .filter((capability) => capability.state !== "unavailable")
                    .map((capability) => (
                      <div
                        key={capability.id}
                        data-provider-capability={`${provider.id}:${capability.id}`}
                        className="py-module-inset flex items-start justify-between gap-6"
                      >
                        <div className="min-w-0">
                          <div className="text-metadata flex flex-wrap items-center gap-1.5 font-medium">
                            {CAPABILITY_LABELS[capability.id]}
                            {capability.experimental ? <Badge variant="outline">Experimental</Badge> : null}
                            {capability.version ? <span className="text-metadata text-muted-foreground font-mono">
                                {capability.version}
                              </span> : null}
                          </div>
                          {capability.reason ? <p className="text-callout text-muted-foreground mt-0.5">
                              {capability.reason}
                            </p> : null}
                          {capability.fix ? <p className="text-callout text-foreground/75 mt-0.5">
                              {capability.fix}
                            </p> : null}
                        </div>
                        <span className="text-callout text-muted-foreground flex shrink-0 items-center gap-1.5 pt-0.5 capitalize">
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              capability.state === "ready" && "bg-success",
                              capability.state === "unverified" && "bg-warning"
                            )}
                          />
                          {capability.state}
                        </span>
                      </div>
                    ))}
                </div> : null}
            </div>
          );
        })}
      </div>
    </Page>
  );
}
