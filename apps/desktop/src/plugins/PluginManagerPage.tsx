import { useMemo, useState } from "react";

import {
  Blocks,
  Boxes,
  Check,
  CircleAlert,
  Download,
  GitFork,
  Loader2,
  MonitorCog,
  Package,
  RefreshCw,
  Store,
  X,
} from "lucide-react";

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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { BundleAdministration } from "./BundleAdministration";
import { SchemaConfigEditor } from "./SchemaConfigEditor";
import type {
  PluginManagerChangePlan,
  PluginManagerChangeRequest,
  PluginManagerComponent,
  PluginManagerDesiredState,
  PluginManagerLabels,
  PluginManagerMarketplaceItem,
  PluginManagerPageProps,
  PluginManagerPlugin,
  PluginManagerProject,
  PluginManagerScope,
  PluginManagerScopedState,
  PluginManagerSource,
  PluginManagerStatus,
} from "./types";

const DEFAULT_LABELS: PluginManagerLabels = {
  title: "Plugins",
  description: "Manage built-in features, desktop host integrations, and installed bundles in one place.",
  plugins: "Plugins",
  components: "Components",
  marketplace: "Marketplace",
  userScope: "User",
  projectScope: (project) => project.label,
  search: "Search plugins, components, and marketplace…",
  noResults: "No matching items.",
  enabled: "Enabled",
  disabled: "Disabled",
  inherit: "Inherit",
  required: "Required",
  userOnly: "User scope only",
  projectOnly: "Project scope only",
  configuration: "Configuration",
  form: "Form",
  advancedJson: "Advanced JSON",
  saveConfiguration: "Save configuration",
  saving: "Saving…",
  install: "Install",
  installed: "Installed",
  unavailable: "Unavailable",
  refresh: "Refresh",
  bundleTools: "Bundle tools",
  advancedBundleTools: "Advanced tools",
  installFromGithub: "Install from GitHub",
  githubRepository: "GitHub repository",
  githubHint: "Use owner/repository or a GitHub /tree/ URL. Installation never executes plugin code; trust is granted separately.",
  closeInstaller: "Close GitHub installer",
  installingPlugin: "Installing…",
  bundleInstalled: (result) => `${result.name}${result.version ? ` ${result.version}` : ""} installed. Review its source and trust requirements before enabling code.`,
  managedInBundleTools: "Managed at bundle level",
  bundleManagement: "Bundle management",
  bundleManagementUserOnly: "Installation, trust, and removal are managed in User scope.",
  trustRequired: "This bundle contains executable contributions. Review its source before allowing it to run with your user permissions.",
  trusted: "Trusted",
  notTrusted: "Not trusted",
  trustPlugin: "Trust plugin",
  revokeTrust: "Revoke trust",
  contributions: "Contributions",
  diagnostics: "Diagnostics",
  uninstall: "Uninstall",
  uninstallTitle: (pluginName) => `Uninstall ${pluginName}?`,
  uninstallDescription: "The plugin will stop and its installed files will be removed. Keeping data makes a later reinstall recoverable.",
  keepPluginData: "Keep plugin data for reinstall",
  resetDefaults: "Reset to defaults",
  restoredLastGood: "Invalid plugin settings were replaced with the last known-good configuration.",
  safeMode: "Plugin safe mode is active. Only the management plane is guaranteed to be available.",
  dependencies: "Dependencies",
  missingDependencies: "Missing dependencies",
  commands: "Commands",
  services: "Services",
  activeResources: "Active resources",
  confirmTitle: "Apply plugin change?",
  confirm: "Apply change",
  cancel: "Cancel",
};

const STATUS_LABELS: Record<PluginManagerStatus, string> = {
  disabled: "Disabled",
  pending: "Pending",
  loading: "Loading",
  active: "Active",
  failed: "Failed",
  disposed: "Unloaded",
};

const SOURCE_LABELS: Record<PluginManagerSource, string> = {
  builtin: "Built-in",
  host: "Desktop host",
  bundle: "Bundle",
};

function sourceIcon(source: PluginManagerSource) {
  if (source === "builtin") return <Boxes className="size-4" aria-hidden="true" />;
  if (source === "host") return <MonitorCog className="size-4" aria-hidden="true" />;
  return <Package className="size-4" aria-hidden="true" />;
}

function sourceLabel(source: PluginManagerSource, custom?: string | null): string {
  return custom || SOURCE_LABELS[source];
}

function statusVariant(status: PluginManagerStatus): "default" | "secondary" | "destructive" | "ghost" {
  if (status === "failed") return "destructive";
  if (status === "active") return "default";
  if (status === "disabled" || status === "disposed") return "ghost";
  return "secondary";
}

function StatusSummary({ state }: { state: PluginManagerScopedState }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={statusVariant(state.status)}>{STATUS_LABELS[state.status]}</Badge>
      {state.missingDependencies?.length ? (
        <Badge variant="destructive">
          <CircleAlert />
          {state.missingDependencies.length} missing
        </Badge>
      ) : null}
    </div>
  );
}

function scopeSupportsProject(supportedScopes: Array<"user" | "project">): boolean {
  return supportedScopes.includes("project");
}

function scopeValue(scope: PluginManagerScope, projects: PluginManagerProject[]): string {
  if (scope.kind === "user") return "user";
  const index = projects.findIndex((project) => project.path === scope.projectPath);
  return index >= 0 ? `project:${index}` : "project:current";
}

function ScopeSelector({
  scope,
  projects,
  labels,
  onChange,
}: {
  scope: PluginManagerScope;
  projects: PluginManagerProject[];
  labels: PluginManagerLabels;
  onChange: (scope: PluginManagerScope) => void;
}) {
  const currentProject = scope.kind === "project" && !projects.some((project) => project.path === scope.projectPath)
    ? { path: scope.projectPath, label: scope.projectPath }
    : null;
  const items = [
    { value: "user", label: labels.userScope },
    ...projects.map((project, index) => ({ value: `project:${index}`, label: labels.projectScope(project) })),
    ...(currentProject ? [{ value: "project:current", label: labels.projectScope(currentProject) }] : []),
  ];

  return (
    <Field className="w-full sm:w-auto">
      <FieldLabel htmlFor="plugin-manager-scope" className="sr-only">
        Scope
      </FieldLabel>
      <Select
        items={items}
        value={scopeValue(scope, projects)}
        onValueChange={(value) => {
          if (value === "user") {
            onChange({ kind: "user" });
            return;
          }
          if (value === "project:current" && currentProject) {
            onChange({ kind: "project", projectPath: currentProject.path });
            return;
          }
          const index = Number(value?.replace("project:", ""));
          const project = projects[index];
          if (project) onChange({ kind: "project", projectPath: project.path });
        }}
      >
        <SelectTrigger id="plugin-manager-scope" className="w-full sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function GithubInstaller({
  repository,
  labels,
  busy,
  error,
  onRepositoryChange,
  onClose,
  onSubmit,
}: {
  repository: string;
  labels: PluginManagerLabels;
  busy: boolean;
  error: string | null;
  onRepositoryChange: (repository: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <form
      data-plugin-github-installer
      className="flex flex-col gap-3 rounded-(--ds-radius-module) bg-fill-quiet p-3"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-title font-medium">{labels.installFromGithub}</h2>
          <p id="plugin-github-hint" className="max-w-2xl text-fine leading-relaxed text-muted-foreground">
            {labels.githubHint}
          </p>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          title={labels.closeInstaller}
          aria-label={labels.closeInstaller}
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <Field>
        <FieldLabel htmlFor="plugin-github-repository">{labels.githubRepository}</FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            id="plugin-github-repository"
            value={repository}
            placeholder="owner/repository"
            aria-describedby={error ? "plugin-github-hint plugin-github-error" : "plugin-github-hint"}
            aria-invalid={error ? true : undefined}
            onChange={(event) => onRepositoryChange(event.currentTarget.value)}
          />
          <Button type="submit" className="shrink-0" disabled={busy}>
            {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Download data-icon="inline-start" />}
            {busy ? labels.installingPlugin : labels.install}
          </Button>
        </div>
        {error ? (
          <p id="plugin-github-error" role="alert" className="flex items-start gap-2 text-ui text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}
      </Field>
    </form>
  );
}

function StateControl({
  id,
  name,
  kind,
  required,
  supportedScopes,
  state,
  scope,
  labels,
  disabled,
  onChange,
}: {
  id: string;
  name: string;
  kind: "plugin" | "component";
  required?: boolean;
  supportedScopes: Array<"user" | "project">;
  state: PluginManagerScopedState;
  scope: PluginManagerScope;
  labels: PluginManagerLabels;
  disabled: boolean;
  onChange: (request: PluginManagerChangeRequest) => void;
}) {
  if (required) return <Badge variant="secondary">{labels.required}</Badge>;

  if (scope.kind === "user" && !supportedScopes.includes("user")) {
    return <span className="text-fine text-muted-foreground">{labels.projectOnly}</span>;
  }

  if (scope.kind === "project") {
    if (!scopeSupportsProject(supportedScopes)) {
      return <span className="text-fine text-muted-foreground">{labels.userOnly}</span>;
    }
    const value = state.override ?? "inherit";
    const projectStates: Array<{ value: PluginManagerDesiredState; label: string }> = [
      { value: "inherit", label: labels.inherit },
      { value: "enabled", label: labels.enabled },
      { value: "disabled", label: labels.disabled },
    ];
    return (
      <Select
        items={projectStates}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (!next || next === value) return;
          onChange({ targetKind: kind, targetId: id, targetName: name, scope, desiredState: next });
        }}
      >
        <SelectTrigger size="sm" aria-label={`${name} project state`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          <SelectGroup>
            <SelectItem value="inherit">{labels.inherit}</SelectItem>
            <SelectItem value="enabled">{labels.enabled}</SelectItem>
            <SelectItem value="disabled">{labels.disabled}</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  }

  return (
    <Field orientation="horizontal" className="w-auto">
      <Checkbox
        id={`${kind}-state-${id}`}
        checked={state.effectiveEnabled}
        disabled={disabled}
        onCheckedChange={(checked) =>
          onChange({
            targetKind: kind,
            targetId: id,
            targetName: name,
            scope,
            desiredState: checked === true ? "enabled" : "disabled",
          })
        }
      />
      <FieldLabel htmlFor={`${kind}-state-${id}`}>
        {state.effectiveEnabled ? labels.enabled : labels.disabled}
      </FieldLabel>
    </Field>
  );
}

function DetailList({ title, values }: { title: string; values?: string[] }) {
  if (!values?.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-hint font-medium text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <Badge key={value} variant="secondary">
            {value}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function PluginList({
  plugins,
  selectedId,
  labels,
  onSelect,
}: {
  plugins: PluginManagerPlugin[];
  selectedId: string | null;
  labels: PluginManagerLabels;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2" aria-label="Plugin list">
      {plugins.map((plugin) => (
        <Button
          key={plugin.id}
          type="button"
          variant={plugin.id === selectedId ? "secondary" : "ghost"}
          className="h-auto w-full justify-start px-3 py-3 text-left whitespace-normal"
          aria-pressed={plugin.id === selectedId}
          onClick={() => onSelect(plugin.id)}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-(--ds-radius-control) bg-fill-quiet text-muted-foreground">
            {sourceIcon(plugin.source)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{plugin.name}</span>
              <Badge variant={statusVariant(plugin.state.status)}>{STATUS_LABELS[plugin.state.status]}</Badge>
              {plugin.bundle?.requiresTrust && !plugin.bundle.trusted ? (
                <Badge variant="destructive">{labels.notTrusted}</Badge>
              ) : null}
            </span>
            <span className="truncate text-fine text-muted-foreground">
              {sourceLabel(plugin.source, plugin.sourceLabel)}
            </span>
          </span>
        </Button>
      ))}
    </div>
  );
}

function PluginDetails({
  plugin,
  scope,
  labels,
  busy,
  busyAction,
  onRequestChange,
  onSetBundleEnabled,
  onSetBundleTrusted,
  onUninstallBundle,
  onSaveConfig,
  onReset,
}: {
  plugin: PluginManagerPlugin;
  scope: PluginManagerScope;
  labels: PluginManagerLabels;
  busy: boolean;
  busyAction: string | null;
  onRequestChange: (request: PluginManagerChangeRequest) => void;
  onSetBundleEnabled?: (pluginId: string, enabled: boolean) => Promise<void>;
  onSetBundleTrusted?: (pluginId: string, trusted: boolean) => Promise<void>;
  onUninstallBundle?: (pluginId: string, keepData: boolean) => Promise<void>;
  onSaveConfig: PluginManagerPageProps["onSaveConfig"];
  onReset?: (pluginId: string, scope: PluginManagerScope) => void;
}) {
  const configurable =
    plugin.configurable ?? (plugin.configSchema !== undefined || plugin.state.config !== undefined);
  return (
    <Card data-plugin-details className="gap-4 py-4">
      <CardHeader className="gap-1 px-4">
        <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-title">
          <span className="truncate">{plugin.name}</span>
          {plugin.version ? <Badge variant="secondary">v{plugin.version}</Badge> : null}
          <Badge variant="secondary">{sourceLabel(plugin.source, plugin.sourceLabel)}</Badge>
        </CardTitle>
        <CardDescription>{plugin.description || "No description provided."}</CardDescription>
        <CardAction>
          {plugin.bundle && !plugin.bundle.runtimeManaged && !onSetBundleEnabled ? (
            <span className="text-fine text-muted-foreground">{labels.managedInBundleTools}</span>
          ) : (
            <StateControl
              id={plugin.id}
              name={plugin.name}
              kind="plugin"
              required={plugin.required}
              supportedScopes={plugin.supportedScopes}
              state={plugin.state}
              scope={scope}
              labels={labels}
              disabled={busy || Boolean(plugin.bundle?.requiresTrust && !plugin.bundle.trusted)}
              onChange={(request) => {
                if (plugin.bundle && !plugin.bundle.runtimeManaged && scope.kind === "user" && onSetBundleEnabled) {
                  void onSetBundleEnabled(plugin.bundle.id, request.desiredState === "enabled");
                  return;
                }
                onRequestChange(request);
              }}
            />
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4">
        <StatusSummary state={plugin.state} />
        {plugin.state.error ? (
          <p role="alert" className="flex items-start gap-2 text-ui text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{plugin.state.error}</span>
          </p>
        ) : null}
        {plugin.bundle ? (
          <BundleAdministration
            pluginName={plugin.name}
            bundle={plugin.bundle}
            scope={scope}
            labels={labels}
            busyAction={busyAction}
            onSetTrusted={onSetBundleTrusted}
            onUninstall={onUninstallBundle}
          />
        ) : null}
        <DetailList title={labels.missingDependencies} values={plugin.state.missingDependencies} />
        <DetailList title={labels.dependencies} values={plugin.dependencies} />
        <DetailList title={labels.commands} values={plugin.commands} />
        <DetailList title={labels.services} values={plugin.services} />
        {plugin.state.activeResources?.length ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-hint font-medium text-muted-foreground">{labels.activeResources}</h3>
            <ul className="flex flex-col gap-1 text-ui">
              {plugin.state.activeResources.map((resource) => (
                <li key={resource.id}>
                  {resource.label}
                  {resource.kind ? <span className="text-muted-foreground"> · {resource.kind}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {configurable ? (
          <>
            <Separator />
            <section className="flex flex-col gap-4" aria-labelledby={`plugin-config-title-${plugin.id}`}>
              <div className="flex flex-col gap-1">
                <h3 id={`plugin-config-title-${plugin.id}`} className="text-title font-medium">
                  {labels.configuration}
                </h3>
                <p className="text-fine text-muted-foreground">
                  Changes are validated by the host before the plugin reloads.
                </p>
              </div>
              <SchemaConfigEditor
                key={`${plugin.id}:${scope.kind === "project" ? scope.projectPath : "user"}`}
                config={plugin.state.config}
                schema={plugin.configSchema}
                labels={labels}
                onSave={(config) => onSaveConfig({ pluginId: plugin.id, scope, config })}
              />
            </section>
          </>
        ) : null}
      </CardContent>
      <CardFooter className="justify-between gap-3 px-4 text-fine text-muted-foreground">
        <span>
          {plugin.author ? `${plugin.author} · ` : ""}
          {plugin.category || plugin.id}
        </span>
        {onReset && plugin.source !== "bundle" ? (
          <Button type="button" size="compact" variant="outline" disabled={busy} onClick={() => onReset(plugin.id, scope)}>
            {labels.resetDefaults}
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function ComponentList({
  components,
  selectedId,
  onSelect,
}: {
  components: PluginManagerComponent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2" aria-label="Component list">
      {components.map((component) => (
        <Button
          key={component.id}
          type="button"
          variant={component.id === selectedId ? "secondary" : "ghost"}
          className="h-auto w-full justify-start px-3 py-3 text-left whitespace-normal"
          aria-pressed={component.id === selectedId}
          onClick={() => onSelect(component.id)}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-(--ds-radius-control) bg-fill-quiet text-muted-foreground">
            <Blocks className="size-4" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate font-medium">{component.name}</span>
            <span className="truncate text-fine text-muted-foreground">
              {component.kind} · {component.pluginName}
            </span>
          </span>
        </Button>
      ))}
    </div>
  );
}

function ComponentDetails({
  component,
  scope,
  labels,
  busy,
  onRequestChange,
}: {
  component: PluginManagerComponent;
  scope: PluginManagerScope;
  labels: PluginManagerLabels;
  busy: boolean;
  onRequestChange: (request: PluginManagerChangeRequest) => void;
}) {
  return (
    <Card data-component-details className="gap-4 py-4">
      <CardHeader className="gap-1 px-4">
        <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-title">
          <span className="truncate">{component.name}</span>
          <Badge variant="secondary">{component.kind}</Badge>
        </CardTitle>
        <CardDescription>{component.description || "No description provided."}</CardDescription>
        <CardAction>
          {component.manageable === false ? (
            <span className="text-fine text-muted-foreground">{labels.managedInBundleTools}</span>
          ) : (
            <StateControl
              id={component.id}
              name={component.name}
              kind="component"
              required={component.required}
              supportedScopes={component.supportedScopes}
              state={component.state}
              scope={scope}
              labels={labels}
              disabled={busy}
              onChange={onRequestChange}
            />
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4">
        <StatusSummary state={component.state} />
        {component.state.error ? (
          <p role="alert" className="flex items-start gap-2 text-ui text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{component.state.error}</span>
          </p>
        ) : null}
        <DetailList title={labels.missingDependencies} values={component.state.missingDependencies} />
        <div className="flex flex-col gap-1 text-ui">
          <span>
            Plugin: <span className="text-muted-foreground">{component.pluginName}</span>
          </span>
          <span>
            Source: <span className="text-muted-foreground">{sourceLabel(component.source, component.sourceLabel)}</span>
          </span>
          {component.slot ? (
            <span>
              UI slot: <span className="text-muted-foreground">{component.slot}</span>
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function MarketplaceList({
  items,
  scope,
  labels,
  busyId,
  onInstall,
}: {
  items: PluginManagerMarketplaceItem[];
  scope: PluginManagerScope;
  labels: PluginManagerLabels;
  busyId: string | null;
  onInstall: PluginManagerPageProps["onInstallMarketplaceItem"];
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const scopeSupported = item.supportedScopes.includes(scope.kind);
        const disabled = item.installed || !item.installable || !scopeSupported || busyId === item.id;
        return (
          <Card key={item.id} className="gap-3 py-4">
            <CardHeader className="gap-1 px-4">
              <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-title">
                <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{item.name}</span>
                {item.version ? <Badge variant="secondary">v{item.version}</Badge> : null}
                <Badge variant="secondary">{item.kind}</Badge>
              </CardTitle>
              <CardDescription>{item.description || "No description provided."}</CardDescription>
              <CardAction>
                <Button
                  type="button"
                  size="compact"
                  variant={item.installed ? "secondary" : "default"}
                  disabled={disabled}
                  onClick={() => void onInstall({ itemId: item.id, scope })}
                >
                  {busyId === item.id ? (
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <Download data-icon="inline-start" />
                  )}
                  {item.installed
                    ? labels.installed
                    : item.installable && scopeSupported
                      ? labels.install
                      : labels.unavailable}
                </Button>
              </CardAction>
            </CardHeader>
            {item.diagnostic ? (
              <CardContent className="px-4">
                <p role="status" className="flex items-start gap-2 text-ui text-destructive">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{item.diagnostic}</span>
                </p>
              </CardContent>
            ) : null}
            <CardFooter className="px-4 text-fine text-muted-foreground">
              {[item.author, item.sourceLabel].filter(Boolean).join(" · ") || item.id}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}

function ChangeConfirmation({
  plan,
  labels,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  plan: PluginManagerChangePlan | null;
  labels: PluginManagerLabels;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={Boolean(plan)} onOpenChange={(open) => !open && !busy && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{labels.confirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>{plan?.summary}</AlertDialogDescription>
        </AlertDialogHeader>
        {plan?.affectedPlugins?.length ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-hint font-medium text-muted-foreground">Affected plugins</h3>
            <ul className="flex flex-col gap-1 text-ui">
              {plan.affectedPlugins.map((plugin) => (
                <li key={plugin.id}>
                  {plugin.name}
                  {plugin.desiredState ? <span className="text-muted-foreground"> · {plugin.desiredState}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {plan?.activeResources?.length ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-hint font-medium text-muted-foreground">{labels.activeResources}</h3>
            <ul className="flex flex-col gap-1 text-ui">
              {plan.activeResources.map((resource) => (
                <li key={resource.id}>{resource.label}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {plan?.warnings?.map((warning) => (
          <p key={warning} className="text-ui text-destructive">
            {warning}
          </p>
        ))}
        {error ? (
          <p role="alert" className="text-ui text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{labels.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant={plan?.request.desiredState === "disabled" ? "destructive" : "default"}
            disabled={busy}
            onClick={() => onConfirm()}
          >
            {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
            {labels.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Data-only plugin management surface. It never imports or renders code supplied by a bundle;
 * integrations provide descriptors and lifecycle callbacks through props.
 */
export function PluginManagerPage({
  plugins,
  components,
  marketplaceItems,
  scope,
  projects = [],
  initialTab = "plugins",
  recovery,
  labels: labelOverrides,
  onScopeChange,
  onPlanChange,
  onApplyChange,
  onSaveConfig,
  onInstallMarketplaceItem,
  onRefreshMarketplace,
  onImportGithub,
  onSetBundleEnabled,
  onSetBundleTrusted,
  onUninstallBundle,
  onOpenBundleTools,
  onResetPlugin,
}: PluginManagerPageProps) {
  const labels = useMemo(() => ({ ...DEFAULT_LABELS, ...labelOverrides }), [labelOverrides]);
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState("");
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(plugins[0]?.id ?? null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(components[0]?.id ?? null);
  const [busyTarget, setBusyTarget] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PluginManagerChangePlan | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [githubInstallerOpen, setGithubInstallerOpen] = useState(false);
  const [githubRepository, setGithubRepository] = useState("");
  const [githubError, setGithubError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const visiblePlugins = useMemo(
    () =>
      plugins.filter((plugin) =>
        [plugin.name, plugin.description, plugin.author, plugin.category, sourceLabel(plugin.source, plugin.sourceLabel)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      ),
    [normalizedQuery, plugins],
  );
  const visibleComponents = useMemo(
    () =>
      components.filter((component) =>
        [component.name, component.description, component.kind, component.pluginName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      ),
    [components, normalizedQuery],
  );
  const visibleMarketplace = useMemo(
    () =>
      marketplaceItems.filter((item) =>
        [item.name, item.description, item.kind, item.author, item.sourceLabel]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      ),
    [marketplaceItems, normalizedQuery],
  );

  const selectedPlugin =
    visiblePlugins.find((plugin) => plugin.id === selectedPluginId) ?? visiblePlugins[0] ?? null;
  const selectedComponent =
    visibleComponents.find((component) => component.id === selectedComponentId) ?? visibleComponents[0] ?? null;

  const requestChange = async (request: PluginManagerChangeRequest) => {
    const key = `${request.targetKind}:${request.targetId}`;
    setBusyTarget(key);
    setActionError(null);
    setActionNotice(null);
    try {
      const plan = await onPlanChange(request);
      if (plan.requiresConfirmation) {
        setPendingPlan(plan);
      } else {
        await onApplyChange(plan);
        setActionNotice(`${request.targetName} is now ${request.desiredState}.`);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyTarget(null);
    }
  };

  const applyPlan = async () => {
    if (!pendingPlan || applyingPlan) return;
    setApplyingPlan(true);
    setActionError(null);
    try {
      await onApplyChange(pendingPlan);
      setActionNotice(`${pendingPlan.request.targetName} is now ${pendingPlan.request.desiredState}.`);
      setPendingPlan(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setApplyingPlan(false);
    }
  };

  const install = async (request: Parameters<typeof onInstallMarketplaceItem>[0]) => {
    setInstallingId(request.itemId);
    setActionError(null);
    setActionNotice(null);
    try {
      await onInstallMarketplaceItem(request);
      setActionNotice("Marketplace item installed.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setInstallingId(null);
    }
  };

  const refresh = async () => {
    if (!onRefreshMarketplace || refreshing) return;
    setRefreshing(true);
    setActionError(null);
    setActionNotice(null);
    try {
      await onRefreshMarketplace();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setRefreshing(false);
    }
  };

  const resetPlugin = async (pluginId: string, resetScope: PluginManagerScope) => {
    if (!onResetPlugin) return;
    setBusyTarget(`plugin:${pluginId}`);
    setActionError(null);
    setActionNotice(null);
    try {
      await onResetPlugin(pluginId, resetScope);
      setActionNotice("Plugin settings reset to defaults.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyTarget(null);
    }
  };

  const runBundleAction = async (key: string, action: () => Promise<void>, success: string) => {
    setBusyTarget(key);
    setActionError(null);
    setActionNotice(null);
    try {
      await action();
      setActionNotice(success);
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusyTarget(null);
    }
  };

  const importGithub = async () => {
    if (!onImportGithub || busyTarget === "bundle-import") return;
    const repository = githubRepository.trim();
    if (!repository) {
      setGithubError("Enter an owner/repository name or GitHub URL.");
      return;
    }
    setBusyTarget("bundle-import");
    setGithubError(null);
    setActionError(null);
    setActionNotice(null);
    try {
      const result = await onImportGithub(repository);
      setTab("plugins");
      setSelectedPluginId(`bundle:${result.pluginId}`);
      setGithubRepository("");
      setGithubInstallerOpen(false);
      setActionNotice(labels.bundleInstalled(result));
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyTarget(null);
    }
  };

  const tabCounts = {
    plugins: plugins.length,
    components: components.length,
    marketplace: marketplaceItems.length,
  };

  return (
    <main data-plugin-manager-page className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as typeof tab)}
        className="min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden"
      >
        <header className="min-w-0 shrink-0 bg-card">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 pt-6">
            <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-col gap-1">
                <h1 className="text-display font-semibold tracking-tight">{labels.title}</h1>
                <p className="max-w-2xl text-hint leading-relaxed text-muted-foreground">{labels.description}</p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                {onImportGithub ? (
                  <Button
                    type="button"
                    size="compact"
                    aria-expanded={githubInstallerOpen}
                    aria-controls="plugin-github-installer"
                    onClick={() => {
                      setGithubInstallerOpen((open) => !open);
                      setGithubError(null);
                    }}
                  >
                    <GitFork data-icon="inline-start" />
                    {labels.installFromGithub}
                  </Button>
                ) : null}
                {onOpenBundleTools ? (
                  <Button type="button" variant="secondary" size="compact" onClick={onOpenBundleTools}>
                    <Package data-icon="inline-start" />
                    {labels.advancedBundleTools}
                  </Button>
                ) : null}
                <ScopeSelector scope={scope} projects={projects} labels={labels} onChange={onScopeChange} />
              </div>
            </div>
            {githubInstallerOpen ? (
              <div id="plugin-github-installer">
                <GithubInstaller
                  repository={githubRepository}
                  labels={labels}
                  busy={busyTarget === "bundle-import"}
                  error={githubError}
                  onRepositoryChange={(repository) => {
                    setGithubRepository(repository);
                    setGithubError(null);
                  }}
                  onClose={() => {
                    setGithubInstallerOpen(false);
                    setGithubError(null);
                  }}
                  onSubmit={() => void importGithub()}
                />
              </div>
            ) : null}
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
              <TabsList variant="line" className="w-full max-w-full justify-start overflow-x-auto pb-2 lg:w-auto">
                <TabsTrigger value="plugins">
                  {labels.plugins} {tabCounts.plugins}
                </TabsTrigger>
                <TabsTrigger value="components">
                  {labels.components} {tabCounts.components}
                </TabsTrigger>
                <TabsTrigger value="marketplace">
                  {labels.marketplace} {tabCounts.marketplace}
                </TabsTrigger>
              </TabsList>
              <div className="flex w-full items-center gap-2 pb-2 lg:w-auto">
                <Input
                  data-plugin-manager-search
                  type="search"
                  size="compact"
                  className="w-full lg:w-64"
                  value={query}
                  placeholder={labels.search}
                  aria-label={labels.search}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
                {tab === "marketplace" && onRefreshMarketplace ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    title={labels.refresh}
                    aria-label={labels.refresh}
                    disabled={refreshing}
                    onClick={() => void refresh()}
                  >
                    <RefreshCw className={cn(refreshing && "animate-spin")} />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <Separator />
        </header>

        <ScrollArea
          data-plugin-manager-scroll
          className="min-h-0 min-w-0 w-full flex-1 overflow-hidden [&>[data-slot=scroll-area-viewport]]:min-w-0"
        >
          <div data-plugin-manager-content className="mx-auto min-w-0 w-full max-w-6xl px-6 py-6">
            {recovery && recovery.kind !== "normal" ? (
              <div
                role="status"
                data-plugin-recovery={recovery.kind}
                className="mb-4 flex items-start gap-2 rounded-(--ds-radius-control) border bg-warning/10 px-3 py-2 text-ui"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                <span>
                  {recovery.kind === "safe_mode" ? labels.safeMode : labels.restoredLastGood}
                  {recovery.error ? <span className="mt-0.5 block text-fine text-muted-foreground">{recovery.error}</span> : null}
                </span>
              </div>
            ) : null}
            {actionError && !pendingPlan ? (
              <p role="alert" className="mb-4 flex items-start gap-2 text-ui text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{actionError}</span>
              </p>
            ) : null}
            {actionNotice ? (
              <p role="status" aria-live="polite" className="mb-4 flex items-start gap-2 text-ui text-success">
                <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{actionNotice}</span>
              </p>
            ) : null}
            <TabsContent value="plugins" className="min-w-0">
              {visiblePlugins.length ? (
                <div className="grid min-w-0 gap-4 lg:grid-cols-5">
                  <div className="min-w-0 lg:col-span-2">
                    <PluginList
                      plugins={visiblePlugins}
                      selectedId={selectedPlugin?.id ?? null}
                      labels={labels}
                      onSelect={setSelectedPluginId}
                    />
                  </div>
                  <div className="min-w-0 lg:col-span-3">
                    {selectedPlugin ? (
                      <PluginDetails
                        plugin={selectedPlugin}
                        scope={scope}
                        labels={labels}
                        busy={busyTarget === `plugin:${selectedPlugin.id}` || Boolean(
                          selectedPlugin.bundle && busyTarget?.endsWith(`:${selectedPlugin.bundle.id}`),
                        )}
                        busyAction={busyTarget}
                        onRequestChange={(request) => void requestChange(request)}
                        onSetBundleEnabled={onSetBundleEnabled ? async (pluginId, enabled) => {
                          await runBundleAction(
                            `bundle-enabled:${pluginId}`,
                            () => onSetBundleEnabled(pluginId, enabled),
                            `${selectedPlugin.name} ${enabled ? "enabled" : "disabled"}.`,
                          );
                        } : undefined}
                        onSetBundleTrusted={onSetBundleTrusted ? async (pluginId, trusted) => {
                          await runBundleAction(
                            `bundle-trust:${pluginId}`,
                            () => onSetBundleTrusted(pluginId, trusted),
                            `${selectedPlugin.name} ${trusted ? "trusted" : "trust revoked"}.`,
                          );
                        } : undefined}
                        onUninstallBundle={onUninstallBundle ? async (pluginId, keepData) => {
                          const uninstalled = await runBundleAction(
                            `bundle-uninstall:${pluginId}`,
                            () => onUninstallBundle(pluginId, keepData),
                            `${selectedPlugin.name} uninstalled${keepData ? "; plugin data was kept" : ""}.`,
                          );
                          if (uninstalled) setSelectedPluginId(null);
                        } : undefined}
                        onSaveConfig={onSaveConfig}
                        onReset={onResetPlugin ? (pluginId, resetScope) => void resetPlugin(pluginId, resetScope) : undefined}
                      />
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="py-16 text-center text-ui text-muted-foreground">{labels.noResults}</p>
              )}
            </TabsContent>

            <TabsContent value="components" className="min-w-0">
              {visibleComponents.length ? (
                <div className="grid min-w-0 gap-4 lg:grid-cols-5">
                  <div className="min-w-0 lg:col-span-2">
                    <ComponentList
                      components={visibleComponents}
                      selectedId={selectedComponent?.id ?? null}
                      onSelect={setSelectedComponentId}
                    />
                  </div>
                  <div className="min-w-0 lg:col-span-3">
                    {selectedComponent ? (
                      <ComponentDetails
                        component={selectedComponent}
                        scope={scope}
                        labels={labels}
                        busy={busyTarget === `component:${selectedComponent.id}`}
                        onRequestChange={(request) => void requestChange(request)}
                      />
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="py-16 text-center text-ui text-muted-foreground">{labels.noResults}</p>
              )}
            </TabsContent>

            <TabsContent value="marketplace" className="min-w-0">
              {visibleMarketplace.length ? (
                <MarketplaceList
                  items={visibleMarketplace}
                  scope={scope}
                  labels={labels}
                  busyId={installingId}
                  onInstall={install}
                />
              ) : (
                <p className="py-16 text-center text-ui text-muted-foreground">{labels.noResults}</p>
              )}
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>

      <ChangeConfirmation
        plan={pendingPlan}
        labels={labels}
        busy={applyingPlan}
        error={pendingPlan ? actionError : null}
        onCancel={() => {
          setPendingPlan(null);
          setActionError(null);
        }}
        onConfirm={() => void applyPlan()}
      />
    </main>
  );
}
