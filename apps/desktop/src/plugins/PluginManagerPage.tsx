import { useMemo, useState } from "react";

import {
  ArrowLeft,
  BookOpen,
  Boxes,
  Check,
  CircleAlert,
  Download,
  FolderDown,
  GitFork,
  Loader2,
  MonitorCog,
  Package,
  RefreshCw,
  Search,
  Server,
  Store,
  Webhook,
  X,
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
import { LiquidSelectionGroup } from "@/components/ui/tabs";
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
  PluginManagerScaffold,
  PluginManagerScope,
  PluginManagerScopedState,
  PluginManagerSource,
  PluginManagerStatus,
} from "./types";

const DEFAULT_LABELS: PluginManagerLabels = {
  title: "Features & plugins",
  description: "Manage optional C2 features, desktop integrations, and installed plugins.",
  plugins: "Features",
  components: "Components",
  mcps: "MCPs",
  skills: "Skills",
  hooks: "Hooks",
  marketplace: "Marketplace",
  userScope: "User",
  projectScope: (project) => project.label,
  search: "Search catalog…",
  searchPlaceholder: (tab) =>
    tab === "plugins"
      ? "Search plugins…"
      : tab === "mcps"
        ? "Search MCP servers…"
        : tab === "skills"
          ? "Search skills…"
          : tab === "hooks"
            ? "Search hooks…"
            : "Search marketplace…",
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
  newSkill: "New skill",
  openMarketplace: "Open marketplace",
  use: "Use",
  applyScaffold: "Add to project",
  scaffoldFiles: (count) => `${count} project files`,
  installFromGithub: "Install from GitHub",
  githubRepository: "GitHub repository",
  githubHint:
    "Use owner/repository or a GitHub /tree/ URL. Installation never executes plugin code; trust is granted separately.",
  closeInstaller: "Close GitHub installer",
  installingPlugin: "Installing…",
  bundleInstalled: (result) =>
    `${result.name}${result.version ? ` ${result.version}` : ""} installed. Review its source and trust requirements before enabling code.`,
  bundleManagement: "Bundle management",
  bundleManagementUserOnly:
    "Installation, trust, and removal are managed in User scope.",
  reviewSource: "Review source",
  trustRequired:
    "This bundle contains executable contributions. Review its source before allowing it to run with your user permissions.",
  trustBeforeEnabling: "Trust required before enabling",
  trusted: "Trusted",
  notTrusted: "Not trusted",
  trustPlugin: "Trust plugin",
  revokeTrust: "Revoke trust",
  contributions: "Contributions",
  diagnostics: "Diagnostics",
  uninstall: "Uninstall",
  uninstallTitle: (pluginName) => `Uninstall ${pluginName}?`,
  uninstallDescription:
    "The plugin will stop and its installed files will be removed. Keeping data makes a later reinstall recoverable.",
  keepPluginData: "Keep plugin data for reinstall",
  resetDefaults: "Reset to defaults",
  restoredLastGood:
    "Invalid plugin settings were replaced with the last known-good configuration.",
  safeMode:
    "Plugin safe mode is active. Only the management plane is guaranteed to be available.",
  dependencies: "Dependencies",
  missingDependencies: "Missing dependencies",
  commands: "Commands",
  services: "Services",
  activeResources: "Active resources",
  scope: "Scope",
  pluginList: "Plugin list",
  componentList: "Component list",
  resourceList: (tab) =>
    tab === "mcps"
      ? "MCP server list"
      : tab === "skills"
        ? "Skill list"
        : "Hook list",
  projectState: (name) => `${name} project state`,
  noDescription: "No description provided.",
  configurationHint:
    "Changes are validated by the host before the plugin reloads.",
  plugin: "Plugin",
  source: "Source",
  identifier: "Identifier",
  definition: "Definition",
  uiSlot: "UI slot",
  managedByPlugin:
    "This resource follows the state and trust of its owning plugin.",
  managePlugin: "Manage plugin",
  affectedPlugins: "Affected plugins",
  missingCount: (count) => `${count} missing`,
  status: {
  disabled: "Disabled",
  pending: "Pending",
  loading: "Loading",
  active: "Ready",
  failed: "Failed",
  disposed: "Unloaded",
  requires_auth: "Authentication required",
  unsupported: "Unsupported",
  },
  sourceNames: {
    builtin: "Built-in feature",
    host: "Host feature",
    bundle: "Plugin bundle",
  },
  contribution: (_id, fallback) => fallback,
  componentKind: (kind) => kind,
  installedBundle: "Installed bundle",
  dataOnly: "Data only",
  invalidConfigurationObject: "Configuration must be a JSON object.",
  githubRepositoryRequired: "Enter an owner/repository name or GitHub URL.",
  changeApplied: (name, state) => `${name} is now ${state}.`,
  changeSummary: (kind, name, state) =>
    kind === "component"
      ? `${state === "disabled" ? "Hide" : "Enable"} ${name} and reconcile its owning plugin.`
      : `${state === "disabled" ? "Unload" : "Load"} ${name} in the selected scope.`,
  marketplaceInstalled: "Marketplace item installed.",
  componentUninstalled: "Component uninstalled.",
  scaffoldApplied: (count) => `${count} project files added.`,
  settingsReset: "Plugin settings reset to defaults.",
  bundleEnabled: (name, enabled) =>
    `${name} ${enabled ? "enabled" : "disabled"}.`,
  bundleTrusted: (name, trusted) =>
    `${name} ${trusted ? "trusted" : "trust revoked"}.`,
  bundleUninstalled: (name, keepData) =>
    `${name} uninstalled${keepData ? "; plugin data was kept" : ""}.`,
  confirmTitle: "Apply plugin change?",
  confirm: "Apply change",
  cancel: "Cancel",
};

function sourceIcon(source: PluginManagerSource) {
  if (source === "builtin")
    return <Boxes className="size-4" aria-hidden="true" />;
  if (source === "host")
    return <MonitorCog className="size-4" aria-hidden="true" />;
  return <Package className="size-4" aria-hidden="true" />;
}

function sourceLabel(
  source: PluginManagerSource,
  labels: PluginManagerLabels,
  custom?: string | null,
): string {
  return custom || labels.sourceNames[source];
}

function statusDotClass(status: PluginManagerStatus): string {
  if (status === "active") return "bg-success";
  if (status === "failed") return "bg-destructive";
  if (
    status === "pending" ||
    status === "loading" ||
    status === "requires_auth"
  )
    return "bg-warning";
  return "bg-muted-foreground/50";
}

function CompactStatus({
  status,
  labels,
}: {
  status: PluginManagerStatus;
  labels: PluginManagerLabels;
}) {
  return (
    <span
      data-plugin-status={status}
      className="flex shrink-0 items-center gap-1.5 text-fine text-muted-foreground"
    >
      <span
        className={cn("size-1.5 rounded-full", statusDotClass(status))}
        aria-hidden="true"
      />
      {labels.status[status]}
    </span>
  );
}

function StatusSummary({
  state,
  labels,
}: {
  state: PluginManagerScopedState;
  labels: PluginManagerLabels;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CompactStatus status={state.status} labels={labels} />
      {state.missingDependencies?.length ? (
        <Badge variant="destructive">
          <CircleAlert />
          {labels.missingCount(state.missingDependencies.length)}
        </Badge>
      ) : null}
    </div>
  );
}

function scopeSupportsProject(
  supportedScopes: Array<"user" | "project">,
): boolean {
  return supportedScopes.includes("project");
}

type PluginResourceTab = "mcps" | "skills" | "hooks";

function isResourceTab(tab: string): tab is PluginResourceTab {
  return tab === "mcps" || tab === "skills" || tab === "hooks";
}

function resourceTabFor(
  component: PluginManagerComponent,
): PluginResourceTab | null {
  const kind = component.kind.toLowerCase().replaceAll("-", "_");
  if (kind === "mcp" || kind === "mcp_server" || kind === "mcpserver") {
    return "mcps";
  }
  if (kind === "hook" || kind === "hooks") return "hooks";
  if (
    kind === "skill" ||
    kind === "agent_skill" ||
    kind === "agentskill" ||
    kind === "fragment" ||
    kind === "macro"
  ) {
    return "skills";
  }
  return null;
}

function resourceIcon(tab: PluginResourceTab) {
  if (tab === "mcps") return <Server className="size-4" aria-hidden="true" />;
  if (tab === "hooks")
    return <Webhook className="size-4" aria-hidden="true" />;
  return <BookOpen className="size-4" aria-hidden="true" />;
}

function scopeValue(
  scope: PluginManagerScope,
  projects: PluginManagerProject[],
): string {
  if (scope.kind === "user") return "user";
  const index = projects.findIndex(
    (project) => project.path === scope.projectPath,
  );
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
  const currentProject =
    scope.kind === "project" &&
    !projects.some((project) => project.path === scope.projectPath)
    ? { path: scope.projectPath, label: scope.projectPath }
    : null;
  const items = [
    { value: "user", label: labels.userScope },
    ...projects.map((project, index) => ({
      value: `project:${index}`,
      label: labels.projectScope(project),
    })),
    ...(currentProject
      ? [
          {
            value: "project:current",
            label: labels.projectScope(currentProject),
          },
        ]
      : []),
  ];

  return (
    <Field className="w-auto min-w-0">
      <FieldLabel htmlFor="plugin-manager-scope" className="sr-only">
        {labels.scope}
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
        <SelectTrigger
          id="plugin-manager-scope"
          size="sm"
          className="w-36"
        >
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
          <p
            id="plugin-github-hint"
            className="max-w-2xl text-fine leading-relaxed text-muted-foreground"
          >
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
        <FieldLabel htmlFor="plugin-github-repository">
          {labels.githubRepository}
        </FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            id="plugin-github-repository"
            value={repository}
            placeholder="owner/repository"
            aria-describedby={
              error
                ? "plugin-github-hint plugin-github-error"
                : "plugin-github-hint"
            }
            aria-invalid={error ? true : undefined}
            onChange={(event) => onRepositoryChange(event.currentTarget.value)}
          />
          <Button type="submit" className="shrink-0" disabled={busy}>
            {busy ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <Download data-icon="inline-start" />
            )}
            {busy ? labels.installingPlugin : labels.install}
          </Button>
        </div>
        {error ? (
          <p
            id="plugin-github-error"
            role="alert"
            className="flex items-start gap-2 text-ui text-destructive"
          >
            <CircleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
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
    return (
      <span className="text-fine text-muted-foreground">
        {labels.projectOnly}
      </span>
    );
  }

  if (scope.kind === "project") {
    if (!scopeSupportsProject(supportedScopes)) {
      return (
        <span className="text-fine text-muted-foreground">
          {labels.userOnly}
        </span>
      );
    }
    const value = state.override ?? "inherit";
    const projectStates: Array<{
      value: PluginManagerDesiredState;
      label: string;
    }> = [
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
          onChange({
            targetKind: kind,
            targetId: id,
            targetName: name,
            scope,
            desiredState: next,
          });
        }}
      >
        <SelectTrigger size="sm" aria-label={labels.projectState(name)}>
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

function ScaffoldList({
  pluginId,
  scaffolds,
  labels,
  busyAction,
  onApply,
}: {
  pluginId: string;
  scaffolds: PluginManagerScaffold[];
  labels: PluginManagerLabels;
  busyAction: string | null;
  onApply?: (pluginId: string, scaffoldId: string) => Promise<void>;
}) {
  if (!scaffolds.length || !onApply) return null;

  return (
    <section className="flex flex-col gap-2" aria-label={labels.applyScaffold}>
      <h3 className="text-hint font-medium text-muted-foreground">
        {labels.contribution("scaffolds", "Scaffolds")}
      </h3>
      <div className="divide-y rounded-(--ds-radius-module) bg-fill-quiet px-3">
        {scaffolds.map((scaffold) => {
          const key = `scaffold:${pluginId}:${scaffold.id}`;
          return (
            <div
              key={scaffold.id}
              className="flex flex-col items-start gap-3 py-2.5 @sm/plugin-manager:flex-row @sm/plugin-manager:items-center"
            >
              <FolderDown
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-ui font-medium">{scaffold.name}</p>
                <p className="text-fine text-muted-foreground">
                  {scaffold.description || labels.scaffoldFiles(scaffold.files)}
                </p>
              </div>
              <Button
                type="button"
                size="compact"
                variant="outline"
                disabled={busyAction === key}
                onClick={() => void onApply(pluginId, scaffold.id)}
              >
                {busyAction === key ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <FolderDown data-icon="inline-start" />
                )}
                {labels.applyScaffold}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
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
    <div className="flex flex-col gap-0.5" aria-label={labels.pluginList}>
      {plugins.map((plugin) => {
        const selected = plugin.id === selectedId;
        return (
        <Button
          key={plugin.id}
          type="button"
            variant={selected ? "secondary" : "ghost"}
            data-selected={selected ? "true" : undefined}
            className="h-auto w-full justify-start gap-2.5 overflow-hidden px-2.5 py-2 text-left whitespace-normal"
            aria-pressed={selected}
          onClick={() => onSelect(plugin.id)}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-(--ds-radius-control) bg-fill-quiet text-muted-foreground">
            {sourceIcon(plugin.source)}
          </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {plugin.name}
                </span>
              {plugin.bundle?.requiresTrust && !plugin.bundle.trusted ? (
                  <Badge variant="destructive" className="shrink-0">
                    {labels.notTrusted}
                  </Badge>
                ) : (
                  <CompactStatus status={plugin.state.status} labels={labels} />
                )}
            </span>
            <span className="truncate text-fine text-muted-foreground">
                {sourceLabel(plugin.source, labels, plugin.sourceLabel)}
            </span>
          </span>
        </Button>
        );
      })}
    </div>
  );
}

function ResourceList({
  resources,
  tab,
  selectedId,
  labels,
  onSelect,
}: {
  resources: PluginManagerComponent[];
  tab: PluginResourceTab;
  selectedId: string | null;
  labels: PluginManagerLabels;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5" aria-label={labels.resourceList(tab)}>
      {resources.map((resource) => {
        const selected = resource.id === selectedId;
        return (
          <Button
            key={resource.id}
            type="button"
            variant={selected ? "secondary" : "ghost"}
            data-selected={selected ? "true" : undefined}
            className="h-auto w-full justify-start gap-2.5 overflow-hidden px-2.5 py-2 text-left whitespace-normal"
            aria-pressed={selected}
            onClick={() => onSelect(resource.id)}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-(--ds-radius-control) bg-fill-quiet text-muted-foreground">
              {resourceIcon(tab)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {resource.name}
                </span>
                <CompactStatus status={resource.state.status} labels={labels} />
              </span>
              <span className="truncate text-fine text-muted-foreground">
                {resource.pluginName}
              </span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}

function ResourceDetails({
  resource,
  scope,
  labels,
  busy,
  canManagePlugin,
  onRequestChange,
  onManagePlugin,
}: {
  resource: PluginManagerComponent;
  scope: PluginManagerScope;
  labels: PluginManagerLabels;
  busy: boolean;
  canManagePlugin: boolean;
  onRequestChange: (request: PluginManagerChangeRequest) => void;
  onManagePlugin: (pluginId: string) => void;
}) {
  const individuallyManageable =
    resource.manageable !== false && resource.state.status !== "unsupported";
  const definition =
    resource.slot && resource.slot !== "composer.skills" ? resource.slot : null;

  return (
    <article
      data-resource-details
      className="mx-auto w-full max-w-5xl px-8 pb-12 pt-5"
    >
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex min-w-0 flex-wrap items-center gap-2 text-page font-semibold leading-tight">
            <span className="truncate">{resource.name}</span>
            <Badge variant="secondary">
              {labels.componentKind(resource.kind)}
            </Badge>
          </h1>
          <p className="mt-2 max-w-3xl text-ui leading-relaxed text-muted-foreground">
            {resource.description || labels.noDescription}
          </p>
        </div>
        <div className="shrink-0">
          {individuallyManageable ? (
            <StateControl
              id={resource.id}
              name={resource.name}
              kind="component"
              required={resource.required}
              supportedScopes={resource.supportedScopes}
              state={resource.state}
              scope={scope}
              labels={labels}
              disabled={busy}
              onChange={onRequestChange}
            />
          ) : canManagePlugin ? (
            <Button
              type="button"
              size="compact"
              variant="secondary"
              onClick={() => onManagePlugin(resource.pluginId)}
            >
              <Package data-icon="inline-start" />
              {labels.managePlugin}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-5">
        <StatusSummary state={resource.state} labels={labels} />
        {resource.state.error ? (
          <p role="alert" className="flex items-start gap-2 text-ui text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{resource.state.error}</span>
          </p>
        ) : null}
        <dl className="grid grid-cols-1 gap-x-3 gap-y-2 text-ui sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt className="text-muted-foreground">{labels.plugin}</dt>
          <dd className="min-w-0 break-words">{resource.pluginName}</dd>
          <dt className="text-muted-foreground">{labels.source}</dt>
          <dd className="min-w-0 break-words">
            {sourceLabel(resource.source, labels, resource.sourceLabel)}
          </dd>
          <dt className="text-muted-foreground">{labels.identifier}</dt>
          <dd className="min-w-0 break-all font-mono text-fine">{resource.id}</dd>
          {definition ? (
            <>
              <dt className="text-muted-foreground">{labels.definition}</dt>
              <dd className="min-w-0 break-all font-mono text-fine">
                {definition}
              </dd>
            </>
          ) : null}
        </dl>

        {!individuallyManageable ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-(--ds-radius-module) bg-fill-quiet p-3">
            <p className="max-w-2xl text-fine leading-relaxed text-muted-foreground">
              {labels.managedByPlugin}
            </p>
            {canManagePlugin ? (
              <Button
                type="button"
                size="compact"
                variant="outline"
                onClick={() => onManagePlugin(resource.pluginId)}
              >
                {labels.managePlugin}
              </Button>
            ) : null}
          </section>
        ) : null}
      </div>
    </article>
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
  onApplyScaffold,
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
  onApplyScaffold?: (pluginId: string, scaffoldId: string) => Promise<void>;
  onSaveConfig: PluginManagerPageProps["onSaveConfig"];
  onReset?: (pluginId: string, scope: PluginManagerScope) => void;
}) {
  const configurable =
    plugin.configurable ??
    (plugin.configSchema !== undefined || plugin.state.config !== undefined);
  const trustRequired = Boolean(
    plugin.bundle?.requiresTrust && !plugin.bundle.trusted,
  );
  return (
    <article data-plugin-details className="mx-auto w-full max-w-5xl px-8 pb-12 pt-5">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex min-w-0 flex-wrap items-center gap-2 text-page font-semibold leading-tight">
            <span className="truncate">{plugin.name}</span>
          {plugin.version ? (
            <Badge variant="secondary">v{plugin.version}</Badge>
          ) : null}
          <Badge variant="secondary">
            {sourceLabel(plugin.source, labels, plugin.sourceLabel)}
          </Badge>
          </h1>
          <p className="mt-2 max-w-3xl text-ui leading-relaxed text-muted-foreground">
            {plugin.description || labels.noDescription}
          </p>
        </div>
        <div className="shrink-0">
          {trustRequired ? (
            <span
              data-plugin-trust-gate
              className="text-fine text-muted-foreground"
            >
              {labels.trustBeforeEnabling}
            </span>
          ) : plugin.bundle &&
          !plugin.bundle.runtimeManaged &&
          !onSetBundleEnabled ? (
            <span className="text-fine text-muted-foreground">
              {labels.bundleManagement}
            </span>
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
              disabled={busy}
              onChange={(request) => {
                if (
                  plugin.bundle &&
                  !plugin.bundle.runtimeManaged &&
                  scope.kind === "user" &&
                  onSetBundleEnabled
                ) {
                  void onSetBundleEnabled(
                    plugin.bundle.id,
                    request.desiredState === "enabled",
                  );
                  return;
                }
                onRequestChange(request);
              }}
            />
          )}
        </div>
      </div>
      <div className="mt-8 flex flex-col gap-5">
        {trustRequired ? null : (
          <StatusSummary state={plugin.state} labels={labels} />
        )}
        {plugin.state.error ? (
          <p
            role="alert"
            className="flex items-start gap-2 text-ui text-destructive"
          >
            <CircleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{plugin.state.error}</span>
          </p>
        ) : null}
        {plugin.bundle ? (
          <>
            <BundleAdministration
              pluginName={plugin.name}
              bundle={plugin.bundle}
              scope={scope}
              labels={labels}
              busyAction={busyAction}
              onSetTrusted={onSetBundleTrusted}
              onUninstall={onUninstallBundle}
            />
            <ScaffoldList
              pluginId={plugin.bundle.id}
              scaffolds={plugin.bundle.scaffolds}
              labels={labels}
              busyAction={busyAction}
              onApply={onApplyScaffold}
            />
          </>
        ) : null}
        <DetailList
          title={labels.missingDependencies}
          values={plugin.state.missingDependencies}
        />
        <DetailList title={labels.dependencies} values={plugin.dependencies} />
        <DetailList title={labels.commands} values={plugin.commands} />
        <DetailList title={labels.services} values={plugin.services} />
        {plugin.state.activeResources?.length ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-hint font-medium text-muted-foreground">
              {labels.activeResources}
            </h3>
            <ul className="flex flex-col gap-1 text-ui">
              {plugin.state.activeResources.map((resource) => (
                <li key={resource.id}>
                  {resource.label}
                  {resource.kind ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {resource.kind}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {configurable ? (
          <>
            <Separator />
            <section
              className="flex flex-col gap-4"
              aria-labelledby={`plugin-config-title-${plugin.id}`}
            >
              <div className="flex flex-col gap-1">
                <h3
                  id={`plugin-config-title-${plugin.id}`}
                  className="text-title font-medium"
                >
                  {labels.configuration}
                </h3>
                <p className="text-fine text-muted-foreground">
                  {labels.configurationHint}
                </p>
              </div>
              <SchemaConfigEditor
                key={`${plugin.id}:${scope.kind === "project" ? scope.projectPath : "user"}`}
                config={plugin.state.config}
                schema={plugin.configSchema}
                labels={labels}
                onSave={(config) =>
                  onSaveConfig({ pluginId: plugin.id, scope, config })
                }
              />
            </section>
          </>
        ) : null}
      </div>
      <Separator className="mt-8" />
      <footer className="flex items-center justify-between gap-3 pt-4 text-fine text-muted-foreground">
        <span>
          {plugin.author ? `${plugin.author} · ` : ""}
          {plugin.category || plugin.id}
        </span>
        {onReset && plugin.source !== "bundle" ? (
          <Button
            type="button"
            size="compact"
            variant="outline"
            disabled={busy}
            onClick={() => onReset(plugin.id, scope)}
          >
            {labels.resetDefaults}
          </Button>
        ) : null}
      </footer>
    </article>
  );
}

function MarketplaceSources({
  sources,
  labels,
}: {
  sources: NonNullable<PluginManagerPageProps["marketplaceSources"]>;
  labels: PluginManagerLabels;
}) {
  if (!sources.length) return null;

  return (
    <section className="flex flex-col gap-3 pt-5" aria-label={labels.marketplace}>
      <Separator />
      {sources.map((source) => (
        <div key={source.id} className="rounded-(--ds-radius-control) bg-fill-quiet px-3 py-2.5">
          <h2 className="text-title font-medium">{source.name}</h2>
            {source.description ? (
            <p className="mt-1 text-fine leading-relaxed text-muted-foreground">{source.description}</p>
            ) : null}
          {source.diagnostics.length ? (
            <div className="mt-2 flex flex-col gap-1">
              {source.diagnostics.map((diagnostic) => (
                <p
                  key={diagnostic}
                  className="flex items-start gap-2 text-ui text-destructive"
                >
                  <CircleAlert
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{diagnostic}</span>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function MarketplaceList({
  items,
  selectedId,
  labels,
  onSelect,
}: {
  items: PluginManagerMarketplaceItem[];
  selectedId: string | null;
  labels: PluginManagerLabels;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5" aria-label={labels.marketplace}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          data-selected={item.id === selectedId ? "true" : undefined}
          aria-pressed={item.id === selectedId}
          onClick={() => onSelect(item.id)}
          className={cn(
            "group grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] gap-x-2 rounded-(--ds-radius-control) px-2.5 py-2 text-left transition-colors hover:bg-accent/55 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            item.id === selectedId && "bg-accent text-foreground",
          )}
        >
          <span className="row-span-2 flex size-8 items-center justify-center rounded-(--ds-radius-control) bg-fill-quiet text-muted-foreground">
            <Store className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 truncate text-ui font-medium">{item.name}</span>
          <span className="text-fine text-muted-foreground">
            {item.installed ? labels.installed : item.version ? `v${item.version}` : ""}
          </span>
          <span className="col-start-2 col-end-4 min-w-0 truncate text-fine text-muted-foreground">
            {[item.kind, item.sourceLabel].filter(Boolean).join(" · ")}
          </span>
        </button>
      ))}
    </div>
  );
}

function MarketplaceDetails({
  item,
  scope,
  labels,
  sources,
  busyId,
  onInstall,
}: {
  item: PluginManagerMarketplaceItem;
  scope: PluginManagerScope;
  labels: PluginManagerLabels;
  sources: NonNullable<PluginManagerPageProps["marketplaceSources"]>;
  busyId: string | null;
  onInstall: PluginManagerPageProps["onInstallMarketplaceItem"];
}) {
  const scopeSupported = item.supportedScopes.includes(scope.kind);
  const disabled =
    item.installed || !item.installable || !scopeSupported || busyId === item.id;
  return (
    <article data-marketplace-details className="mx-auto w-full max-w-5xl px-8 pb-12 pt-5">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex min-w-0 flex-wrap items-center gap-2 text-page font-semibold leading-tight">
            <span className="truncate">{item.name}</span>
            {item.version ? <Badge variant="secondary">v{item.version}</Badge> : null}
            <Badge variant="secondary">{item.kind}</Badge>
          </h1>
          <p className="mt-2 max-w-3xl text-ui leading-relaxed text-muted-foreground">
            {item.description || labels.noDescription}
          </p>
        </div>
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
      </div>
      <div className="mt-8 flex flex-col gap-5">
        {item.diagnostic ? (
          <p role="status" className="flex items-start gap-2 text-ui text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{item.diagnostic}</span>
          </p>
        ) : null}
        <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 text-ui">
          <span className="text-muted-foreground">{labels.source}</span>
          <span>{item.sourceLabel || item.id}</span>
          <span className="text-muted-foreground">{labels.scope}</span>
          <span>{item.supportedScopes.join(" · ")}</span>
          {item.author ? (
            <>
              <span className="text-muted-foreground">{labels.contribution("author", "Author")}</span>
              <span>{item.author}</span>
            </>
          ) : null}
        </div>
        <MarketplaceSources sources={sources} labels={labels} />
      </div>
    </article>
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
    <AlertDialog
      open={Boolean(plan)}
      onOpenChange={(open) => !open && !busy && onCancel()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{labels.confirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>{plan?.summary}</AlertDialogDescription>
        </AlertDialogHeader>
        {plan?.affectedPlugins?.length ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-hint font-medium text-muted-foreground">
              {labels.affectedPlugins}
            </h3>
            <ul className="flex flex-col gap-1 text-ui">
              {plan.affectedPlugins.map((plugin) => (
                <li key={plugin.id}>
                  {plugin.name}
                  {plugin.desiredState ? (
                    <span className="text-muted-foreground">
                      {" "}
                      ·{" "}
                      {plugin.desiredState === "enabled"
                        ? labels.enabled
                        : plugin.desiredState === "disabled"
                          ? labels.disabled
                          : labels.inherit}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {plan?.activeResources?.length ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-hint font-medium text-muted-foreground">
              {labels.activeResources}
            </h3>
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
            variant={
              plan?.request.desiredState === "disabled"
                ? "destructive"
                : "default"
            }
            disabled={busy}
            onClick={() => onConfirm()}
          >
            {busy ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : null}
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
  components = [],
  marketplaceItems,
  marketplaceSources = [],
  headerLeadingAction,
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
  onOpenMarketplace,
  onImportGithub,
  onSetBundleEnabled,
  onSetBundleTrusted,
  onUninstallBundle,
  onApplyScaffold,
  onResetPlugin,
}: PluginManagerPageProps) {
  const labels = useMemo(
    () => ({ ...DEFAULT_LABELS, ...labelOverrides }),
    [labelOverrides],
  );
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState("");
  const [selectedPluginId, setSelectedPluginId] = useState<
    string | null | undefined
  >(plugins[0]?.id);
  const [selectedMarketplaceId, setSelectedMarketplaceId] = useState<
    string | null | undefined
  >(marketplaceItems[0]?.id);
  const [selectedResourceId, setSelectedResourceId] = useState<
    string | null | undefined
  >(components.find((component) => resourceTabFor(component))?.id);
  const [busyTarget, setBusyTarget] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] =
    useState<PluginManagerChangePlan | null>(null);
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
        [
          plugin.name,
          plugin.description,
          plugin.author,
          plugin.category,
          sourceLabel(plugin.source, labels, plugin.sourceLabel),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      ),
    [labels, normalizedQuery, plugins],
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
  const resourcesByTab = useMemo(() => {
    const grouped: Record<PluginResourceTab, PluginManagerComponent[]> = {
      mcps: [],
      skills: [],
      hooks: [],
    };
    for (const component of components) {
      const resourceTab = resourceTabFor(component);
      if (resourceTab) grouped[resourceTab].push(component);
    }
    return grouped;
  }, [components]);
  const visibleResources = useMemo(() => {
    if (!isResourceTab(tab)) return [];
    return resourcesByTab[tab].filter((resource) =>
      [
        resource.name,
        resource.description,
        resource.kind,
        resource.pluginName,
        resource.sourceLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [normalizedQuery, resourcesByTab, tab]);

  const selectedPlugin = selectedPluginId === null
    ? null
    : visiblePlugins.find((plugin) => plugin.id === selectedPluginId) ??
      visiblePlugins[0] ??
      null;
  const selectedMarketplaceItem = selectedMarketplaceId === null
    ? null
    : visibleMarketplace.find((item) => item.id === selectedMarketplaceId) ??
      visibleMarketplace[0] ??
      null;
  const selectedResource = selectedResourceId === null
    ? null
    : visibleResources.find((resource) => resource.id === selectedResourceId) ??
      visibleResources[0] ??
      null;

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
        setActionNotice(
          labels.changeApplied(request.targetName, request.desiredState),
        );
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
      setActionNotice(
        labels.changeApplied(
          pendingPlan.request.targetName,
          pendingPlan.request.desiredState,
        ),
      );
      setPendingPlan(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setApplyingPlan(false);
    }
  };

  const install = async (
    request: Parameters<typeof onInstallMarketplaceItem>[0],
  ) => {
    setInstallingId(request.itemId);
    setActionError(null);
    setActionNotice(null);
    try {
      await onInstallMarketplaceItem(request);
      setActionNotice(labels.marketplaceInstalled);
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

  const resetPlugin = async (
    pluginId: string,
    resetScope: PluginManagerScope,
  ) => {
    if (!onResetPlugin) return;
    setBusyTarget(`plugin:${pluginId}`);
    setActionError(null);
    setActionNotice(null);
    try {
      await onResetPlugin(pluginId, resetScope);
      setActionNotice(labels.settingsReset);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyTarget(null);
    }
  };

  const runAction = async (
    key: string,
    action: () => Promise<void>,
    success?: string,
  ) => {
    setBusyTarget(key);
    setActionError(null);
    setActionNotice(null);
    try {
      await action();
      if (success) setActionNotice(success);
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusyTarget(null);
    }
  };

  const openMarketplace = async () => {
    if (!onOpenMarketplace || busyTarget === "marketplace-open") return;
    await runAction("marketplace-open", onOpenMarketplace);
  };

  const applyScaffold = async (pluginId: string, scaffoldId: string) => {
    if (!onApplyScaffold) return;
    const key = `scaffold:${pluginId}:${scaffoldId}`;
    setBusyTarget(key);
    setActionError(null);
    setActionNotice(null);
    try {
      const result = await onApplyScaffold(pluginId, scaffoldId);
      setActionNotice(labels.scaffoldApplied(result.files));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyTarget(null);
    }
  };

  const importGithub = async () => {
    if (!onImportGithub || busyTarget === "bundle-import") return;
    const repository = githubRepository.trim();
    if (!repository) {
      setGithubError(labels.githubRepositoryRequired);
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
    mcps: resourcesByTab.mcps.length,
    skills: resourcesByTab.skills.length,
    hooks: resourcesByTab.hooks.length,
    marketplace: marketplaceItems.length,
  };

  return (
    <main
      data-plugin-manager-page
      data-compact-detail={
        Boolean(
          githubInstallerOpen ||
            (tab === "plugins"
              ? selectedPlugin
              : tab === "marketplace"
                ? selectedMarketplaceItem
                : selectedResource),
        )
      }
      className="plugin-manager-page @container/plugin-manager flex min-h-0 min-w-0 flex-1 bg-background text-foreground"
      aria-label={labels.title}
    >
      <div className="plugin-manager-list-pane flex min-h-0 shrink-0 flex-col bg-sidebar">
        <header className="plugin-manager-list-header electrobun-webkit-app-region-drag flex shrink-0 items-center gap-1 px-3 py-2.5">
          {headerLeadingAction ? (
            <div data-plugin-manager-leading-action className="shrink-0">
              {headerLeadingAction}
            </div>
          ) : null}
          <LiquidSelectionGroup role="tablist" aria-label={labels.title} className="plugin-manager-tabs flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {(["plugins", "mcps", "skills", "hooks", "marketplace"] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "plugin-manager-tab h-(--ds-control-normal) shrink-0 rounded-(--ds-radius-control) px-1 text-ui text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  tab === id && "font-medium text-foreground hover:bg-transparent",
                )}
              >
                {labels[id]} <span className="plugin-manager-tab-count text-fine tabular-nums">{tabCounts[id]}</span>
              </button>
            ))}
          </LiquidSelectionGroup>
        </header>
        <div className="flex shrink-0 items-center gap-2 px-4 py-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              data-plugin-manager-search
              type="search"
              size="compact"
              className="w-full pl-8"
              value={query}
              placeholder={labels.searchPlaceholder(tab)}
              aria-label={labels.searchPlaceholder(tab)}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-3 pb-4">
            {tab === "plugins" ? (
              visiblePlugins.length ? (
                <PluginList plugins={visiblePlugins} selectedId={selectedPlugin?.id ?? null} labels={labels} onSelect={setSelectedPluginId} />
              ) : <p className="py-12 text-center text-ui text-muted-foreground">{labels.noResults}</p>
            ) : tab === "marketplace" ? visibleMarketplace.length ? (
              <MarketplaceList items={visibleMarketplace} selectedId={selectedMarketplaceItem?.id ?? null} labels={labels} onSelect={setSelectedMarketplaceId} />
            ) : <p className="py-12 text-center text-ui text-muted-foreground">{labels.noResults}</p>
            : isResourceTab(tab) && visibleResources.length ? (
              <ResourceList resources={visibleResources} tab={tab} selectedId={selectedResource?.id ?? null} labels={labels} onSelect={setSelectedResourceId} />
            ) : <p className="py-12 text-center text-ui text-muted-foreground">{labels.noResults}</p>}
          </div>
        </ScrollArea>
      </div>

      <div className="plugin-manager-detail-pane flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <header className="electrobun-webkit-app-region-drag flex shrink-0 items-center gap-2 px-4 py-2.5">
          {headerLeadingAction ? (
            <div data-plugin-manager-detail-leading-action className="plugin-manager-detail-leading-action shrink-0">
              {headerLeadingAction}
            </div>
          ) : null}
          <Button
            variant="ghost"
            size="icon-xs"
            className="plugin-manager-back"
            aria-label={
              tab === "plugins"
                ? labels.pluginList
                : tab === "marketplace"
                  ? labels.marketplace
                  : labels.resourceList(tab)
            }
            onClick={() => {
              setGithubInstallerOpen(false);
              if (tab === "plugins") setSelectedPluginId(null);
              else if (tab === "marketplace") setSelectedMarketplaceId(null);
              else setSelectedResourceId(null);
            }}
          >
            <ArrowLeft className="size-3.5" />
          </Button>
          <ScopeSelector scope={scope} projects={projects} labels={labels} onChange={onScopeChange} />
          <div className="electrobun-webkit-app-region-drag flex-1" />
          {tab === "plugins" && onImportGithub ? (
            <Button
              type="button"
              size="compact"
              variant="secondary"
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
          {tab === "marketplace" && onRefreshMarketplace ? (
            <Button type="button" variant="ghost" size="icon-xs" title={labels.refresh} aria-label={labels.refresh} disabled={refreshing} onClick={() => void refresh()}>
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            </Button>
          ) : null}
          {tab === "marketplace" && onOpenMarketplace ? (
            <Button type="button" variant="secondary" size="compact" disabled={busyTarget === "marketplace-open"} onClick={() => void openMarketplace()}>
              {busyTarget === "marketplace-open" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <FolderDown data-icon="inline-start" />}
              {labels.openMarketplace}
            </Button>
          ) : null}
        </header>

        <ScrollArea
          data-plugin-manager-scroll
          className="min-h-0 min-w-0 w-full flex-1 overflow-hidden [&>[data-slot=scroll-area-viewport]]:min-w-0"
        >
          <div
            data-plugin-manager-content
            className="min-w-0 w-full"
          >
            {githubInstallerOpen ? (
              <div id="plugin-github-installer" className="mx-auto w-full max-w-5xl px-8 pt-5">
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
            <div className="mx-auto w-full max-w-5xl px-8 pt-4">
            {recovery && recovery.kind !== "normal" ? (
              <div
                role="status"
                data-plugin-recovery={recovery.kind}
                className="mb-4 flex items-start gap-2 rounded-(--ds-radius-control) border bg-warning/10 px-3 py-2 text-ui"
              >
                <CircleAlert
                  className="mt-0.5 size-4 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <span>
                  {recovery.kind === "safe_mode"
                    ? labels.safeMode
                    : labels.restoredLastGood}
                  {recovery.error ? (
                    <span className="mt-0.5 block text-fine text-muted-foreground">
                      {recovery.error}
                    </span>
                  ) : null}
                </span>
              </div>
            ) : null}
            {actionError && !pendingPlan ? (
              <p
                role="alert"
                className="mb-4 flex items-start gap-2 text-ui text-destructive"
              >
                <CircleAlert
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <span>{actionError}</span>
              </p>
            ) : null}
            {actionNotice ? (
              <p
                role="status"
                aria-live="polite"
                className="mb-4 flex items-start gap-2 text-ui text-success"
              >
                <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{actionNotice}</span>
              </p>
            ) : null}
            </div>
            {tab === "plugins" && selectedPlugin ? (
              <PluginDetails
                plugin={selectedPlugin}
                scope={scope}
                labels={labels}
                busy={
                  busyTarget === `plugin:${selectedPlugin.id}` ||
                  Boolean(
                    selectedPlugin.bundle &&
                      busyTarget?.endsWith(`:${selectedPlugin.bundle.id}`),
                  )
                }
                busyAction={busyTarget}
                onRequestChange={(request) => void requestChange(request)}
                onSetBundleEnabled={onSetBundleEnabled
                  ? async (pluginId, enabled) => {
                      await runAction(
                        `bundle-enabled:${pluginId}`,
                        () => onSetBundleEnabled(pluginId, enabled),
                        labels.bundleEnabled(selectedPlugin.name, enabled),
                      );
                    }
                  : undefined}
                onSetBundleTrusted={onSetBundleTrusted
                  ? async (pluginId, trusted) => {
                      await runAction(
                        `bundle-trust:${pluginId}`,
                        () => onSetBundleTrusted(pluginId, trusted),
                        labels.bundleTrusted(selectedPlugin.name, trusted),
                      );
                    }
                  : undefined}
                onUninstallBundle={onUninstallBundle
                  ? async (pluginId, keepData) => {
                      const uninstalled = await runAction(
                        `bundle-uninstall:${pluginId}`,
                        () => onUninstallBundle(pluginId, keepData),
                        labels.bundleUninstalled(selectedPlugin.name, keepData),
                      );
                      if (uninstalled) setSelectedPluginId(null);
                    }
                  : undefined}
                onApplyScaffold={onApplyScaffold
                  ? (pluginId, scaffoldId) => applyScaffold(pluginId, scaffoldId)
                  : undefined}
                onSaveConfig={onSaveConfig}
                onReset={onResetPlugin
                  ? (pluginId, resetScope) => void resetPlugin(pluginId, resetScope)
                  : undefined}
              />
            ) : null}

            {tab === "marketplace" && selectedMarketplaceItem ? (
              <MarketplaceDetails
                item={selectedMarketplaceItem}
                scope={scope}
                labels={labels}
                sources={marketplaceSources}
                busyId={installingId}
                onInstall={install}
              />
            ) : null}
            {isResourceTab(tab) && selectedResource ? (
              <ResourceDetails
                resource={selectedResource}
                scope={scope}
                labels={labels}
                busy={busyTarget === `component:${selectedResource.id}`}
                canManagePlugin={plugins.some(
                  (plugin) => plugin.id === selectedResource.pluginId,
                )}
                onRequestChange={(request) => void requestChange(request)}
                onManagePlugin={(pluginId) => {
                  setTab("plugins");
                  setSelectedPluginId(pluginId);
                  setSelectedResourceId(null);
                }}
              />
            ) : null}
            {!githubInstallerOpen &&
            ((tab === "plugins" && !selectedPlugin) ||
              (tab === "marketplace" && !selectedMarketplaceItem) ||
              (isResourceTab(tab) && !selectedResource)) ? (
              <div className="flex min-h-96 items-center justify-center px-6 text-ui text-muted-foreground">
                {labels.noResults}
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </div>

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
