import { useMemo, useState } from "react";
import {
  AlertCircle,
  Bot,
  Boxes,
  Check,
  Download,
  FolderDown,
  GitFork,
  LoaderCircle,
  Package,
  Power,
  Plus,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

import type {
  GitHubImportResult,
  MarketItem,
  PluginInfo,
  PluginMarketplace,
  ScaffoldInstallResult,
  SkillInfo,
} from "../bridge";
import { useT } from "../i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type HubTab = "plugins" | "components" | "market";

function KindIcon({ kind }: { kind: string }) {
  if (kind === "subagent") return <Bot className="size-4" />;
  if (kind === "mcp") return <Server className="size-4" />;
  return <Sparkles className="size-4" />;
}

function countLabels(plugin: PluginInfo, labels: Record<string, string>) {
  return [
    [plugin.counts.skills, labels.skills],
    [plugin.counts.subagents, labels.subagents],
    [plugin.counts.mcp_servers, labels.mcp],
    [plugin.counts.scaffolds, labels.scaffolds],
    [plugin.counts.commands, labels.commands],
    [plugin.counts.hooks, labels.hooks],
    [plugin.counts.lsp_servers, labels.lsp],
    [plugin.counts.monitors, labels.monitors],
    [plugin.counts.apps, labels.apps],
  ] as const;
}

/** One package-level home for plugins, their composable components, and the curated market. */
export function PluginHub({
  plugins,
  skills,
  items,
  cwd,
  onUse,
  onInstallMarket,
  onUninstallSkill,
  onImportGithub,
  onOpenMarketplace,
  onInstallMarketplacePlugin,
  onUninstallPlugin,
  onSetPluginEnabled,
  onSetPluginTrusted,
  onApplyScaffold,
  onNew,
  onClose,
}: {
  plugins: PluginInfo[];
  skills: SkillInfo[];
  items: MarketItem[];
  cwd: string;
  onUse: (skill: SkillInfo) => void;
  onInstallMarket: (id: string) => Promise<void>;
  onUninstallSkill: (id: string) => Promise<void>;
  onImportGithub: (repository: string) => Promise<GitHubImportResult>;
  onOpenMarketplace: () => Promise<PluginMarketplace | null>;
  onInstallMarketplacePlugin: (marketplacePath: string, pluginName: string) => Promise<GitHubImportResult>;
  onUninstallPlugin: (id: string, keepData?: boolean) => Promise<void>;
  onSetPluginEnabled: (id: string, enabled: boolean) => Promise<void>;
  onSetPluginTrusted: (id: string, trusted: boolean) => Promise<void>;
  onApplyScaffold: (pluginId: string, scaffoldId: string) => Promise<ScaffoldInstallResult>;
  onNew: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<HubTab>("plugins");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [githubOpen, setGithubOpen] = useState(false);
  const [repository, setRepository] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<GitHubImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [marketplace, setMarketplace] = useState<PluginMarketplace | null>(null);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const visiblePlugins = useMemo(
    () =>
      plugins.filter((plugin) =>
        [plugin.name, plugin.description, plugin.author, plugin.source, plugin.repository]
          .join(" ")
          .toLowerCase()
          .includes(q),
      ),
    [plugins, q],
  );
  const visibleSkills = useMemo(
    () =>
      skills.filter((skill) =>
        [skill.name, skill.description, skill.kind, skill.source ?? ""].join(" ").toLowerCase().includes(q),
      ),
    [skills, q],
  );
  const visibleMarket = useMemo(
    () =>
      items.filter((item) =>
        [item.name, item.description, item.kind, item.author, ...item.tags].join(" ").toLowerCase().includes(q),
      ),
    [items, q],
  );
  const visibleMarketplacePlugins = useMemo(
    () =>
      (marketplace?.plugins ?? []).filter((plugin) =>
        [plugin.name, plugin.display_name, plugin.description, plugin.version, plugin.category]
          .join(" ")
          .toLowerCase()
          .includes(q),
      ),
    [marketplace, q],
  );

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await action();
    } catch {
      // App owns the user-facing toast; this surface only restores the control state.
    } finally {
      setBusy(null);
    }
  };

  const importGithub = async () => {
    const value = repository.trim();
    if (!value || importing) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await onImportGithub(value);
      setImportResult(result);
      setTab("plugins");
    } catch (error) {
      setImportError(String(error));
    } finally {
      setImporting(false);
    }
  };

  const openMarketplace = async () => {
    setMarketplaceError(null);
    try {
      const selected = await onOpenMarketplace();
      if (selected) {
        setMarketplace(selected);
        setTab("market");
      }
    } catch (error) {
      setMarketplaceError(String(error));
    }
  };

  const labels = {
    skills: t("pluginHub.skills"),
    subagents: t("pluginHub.subagents"),
    mcp: t("pluginHub.mcp"),
    scaffolds: t("pluginHub.scaffolds"),
    commands: t("pluginHub.commands"),
    hooks: t("pluginHub.hooks"),
    lsp: t("pluginHub.lsp"),
    monitors: t("pluginHub.monitors"),
    apps: t("pluginHub.apps"),
  };
  const standardLabel = (standard: PluginInfo["standard"]) =>
    t(`pluginHub.standard.${standard}` as "pluginHub.standard.agent_plugins");
  const statusLabel = (status: string) => t(`pluginHub.status.${status}` as "pluginHub.status.ready");
  const empty =
    (tab === "plugins" && visiblePlugins.length === 0) ||
    (tab === "components" && visibleSkills.length === 0) ||
    (tab === "market" && visibleMarket.length === 0 && visibleMarketplacePlugins.length === 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[min(720px,calc(100vh-4rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-6 py-5 pr-14">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
            <div>
              <DialogTitle className="text-heading">{t("pluginHub.title")}</DialogTitle>
              <DialogDescription className="mt-1.5 max-w-[580px] leading-relaxed">
                {t("pluginHub.description")}
              </DialogDescription>
            </div>
            <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:shrink-0">
              <Button variant="outline" size="sm" onClick={() => void openMarketplace()}>
                <FolderDown className="size-3.5" />
                {t("pluginHub.openMarketplace")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setGithubOpen((open) => !open)}>
                <GitFork className="size-3.5" />
                {t("pluginHub.github")}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onClose();
                  onNew();
                }}
              >
                <Plus className="size-3.5" />
                {t("pluginHub.newSkill")}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {githubOpen && (
          <form
            className="border-b bg-fill-quiet px-6 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              void importGithub();
            }}
          >
            <div className="flex items-center gap-2">
              <GitFork className="size-4 shrink-0 text-muted-foreground" />
              <Input
                value={repository}
                onChange={(event) => setRepository(event.target.value)}
                placeholder={t("pluginHub.githubPlaceholder")}
                aria-label={t("pluginHub.githubRepository")}
                autoFocus
              />
              <Button type="submit" size="sm" className="shrink-0" disabled={!repository.trim() || importing}>
                {importing ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                {t("pluginHub.install")}
              </Button>
            </div>
            <p className="ml-6 mt-1.5 text-fine leading-relaxed text-muted-foreground">{t("pluginHub.githubHint")}</p>
            {importResult && (
              <p className="ml-6 mt-2 flex items-start gap-1.5 text-hint text-success">
                <Check className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {t("pluginHub.githubInstalled", {
                    name: importResult.plugin.name,
                    version: importResult.plugin.version,
                  })}
                  <span className="block text-fine text-muted-foreground">
                    {countLabels(importResult.plugin, labels)
                      .filter(([count]) => count > 0)
                      .map(([count, label]) => `${count} ${label}`)
                      .join(" · ")}
                  </span>
                </span>
              </p>
            )}
            {importError && (
              <p className="ml-6 mt-2 flex items-start gap-1.5 text-hint text-destructive">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>{importError}</span>
              </p>
            )}
          </form>
        )}

        {marketplaceError && (
          <div className="flex items-start gap-2 bg-destructive/5 px-6 py-2.5 text-hint text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{marketplaceError}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 bg-fill-quiet px-6 py-3">
          <Tabs value={tab} onValueChange={(value) => setTab(value as HubTab)} className="shrink-0">
            <TabsList variant="line">
              <TabsTrigger value="plugins">
                {t("pluginHub.plugins")} <span className="text-fine text-muted-foreground">{plugins.length}</span>
              </TabsTrigger>
              <TabsTrigger value="components">
                {t("pluginHub.components")} <span className="text-fine text-muted-foreground">{skills.length}</span>
              </TabsTrigger>
              <TabsTrigger value="market">
                {t("pluginHub.market")}{" "}
                <span className="text-fine text-muted-foreground">
                  {items.length + (marketplace?.plugins.length ?? 0)}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative ml-auto w-full max-w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("pluginHub.search")}
              className="pl-8"
            />
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {tab === "plugins" && (
            <div className="divide-y px-6">
              {visiblePlugins.map((plugin) => {
                const uninstallKey = `plugin:${plugin.id}`;
                return (
                  <section key={plugin.id} className="py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-fill-quiet text-muted-foreground">
                          <Package className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-ui font-semibold">{plugin.name}</span>
                            <Badge variant="outline" className="text-cap">
                              v{plugin.version}
                            </Badge>
                            {plugin.standards.map((standard) => (
                              <Badge key={standard} variant="secondary" className="text-cap">
                                {standardLabel(standard)}
                              </Badge>
                            ))}
                            {!plugin.enabled && (
                              <Badge variant="outline" className="text-cap text-muted-foreground">
                                {t("pluginHub.disabled")}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-hint text-muted-foreground">{plugin.description}</p>
                          <p className="mt-1 text-fine text-muted-foreground/70">
                            {plugin.source}
                            {plugin.author ? ` · ${plugin.author}` : ""}
                            {` · ${t(`pluginHub.scope.${plugin.scope}` as "pluginHub.scope.user")}`}
                            {plugin.spec_version ? ` · ${plugin.spec_version}` : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {countLabels(plugin, labels)
                              .filter(([count]) => count > 0)
                              .map(([count, label]) => (
                                <Badge key={label} variant="secondary" className="text-cap">
                                  {count} {label}
                                </Badge>
                              ))}
                          </div>
                        </div>
                      </div>
                      <div className="ml-8 flex shrink-0 items-center gap-1 sm:ml-0">
                        {plugin.extension_components.some((item) => item.status === "requires_trust") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground"
                            title={plugin.trusted ? t("pluginHub.revokeTrust") : t("pluginHub.trust")}
                            disabled={busy === `trust:${plugin.id}`}
                            onClick={() =>
                              void run(`trust:${plugin.id}`, () => onSetPluginTrusted(plugin.id, !plugin.trusted))
                            }
                          >
                            {busy === `trust:${plugin.id}` ? (
                              <LoaderCircle className="size-3.5 animate-spin" />
                            ) : (
                              <ShieldCheck className={plugin.trusted ? "size-3.5 text-success" : "size-3.5"} />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          title={plugin.enabled ? t("pluginHub.disable") : t("pluginHub.enable")}
                          disabled={busy === `enabled:${plugin.id}`}
                          onClick={() =>
                            void run(`enabled:${plugin.id}`, () => onSetPluginEnabled(plugin.id, !plugin.enabled))
                          }
                        >
                          {busy === `enabled:${plugin.id}` ? (
                            <LoaderCircle className="size-3.5 animate-spin" />
                          ) : (
                            <Power className={plugin.enabled ? "size-3.5 text-success" : "size-3.5"} />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          title={t("pluginHub.uninstall")}
                          disabled={busy === uninstallKey}
                          onClick={() => void run(uninstallKey, () => onUninstallPlugin(plugin.id, false))}
                        >
                          {busy === uninstallKey ? (
                            <LoaderCircle className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          title={t("pluginHub.uninstallKeepData")}
                          disabled={busy === `keep-data:${plugin.id}`}
                          onClick={() => void run(`keep-data:${plugin.id}`, () => onUninstallPlugin(plugin.id, true))}
                        >
                          {busy === `keep-data:${plugin.id}` ? (
                            <LoaderCircle className="size-3.5 animate-spin" />
                          ) : (
                            <Package className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {plugin.extension_components.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5 sm:ml-8">
                        {plugin.extension_components.slice(0, 8).map((component) => (
                          <Badge
                            key={`${component.kind}:${component.path}:${component.name}`}
                            variant="outline"
                            className="text-cap"
                          >
                            {component.kind} · {component.name} · {statusLabel(component.status)}
                          </Badge>
                        ))}
                        {plugin.extension_components.length > 8 && (
                          <Badge variant="outline" className="text-cap">
                            +{plugin.extension_components.length - 8}
                          </Badge>
                        )}
                      </div>
                    )}

                    {plugin.diagnostics.length > 0 && (
                      <div className="mt-3 space-y-1.5 bg-warning/5 px-3 py-2 sm:ml-8">
                        {plugin.diagnostics.slice(0, 4).map((diagnostic, index) => (
                          <p
                            key={`${diagnostic.code}:${diagnostic.component ?? "plugin"}:${index}`}
                            className={
                              diagnostic.level === "error"
                                ? "text-fine text-destructive"
                                : "text-fine text-muted-foreground"
                            }
                          >
                            {diagnostic.message}
                          </p>
                        ))}
                        {plugin.diagnostics.length > 4 && (
                          <p className="text-fine text-muted-foreground">
                            {t("pluginHub.moreDiagnostics", {
                              count: plugin.diagnostics.length - 4,
                            })}
                          </p>
                        )}
                      </div>
                    )}

                    {plugin.scaffolds.length > 0 && (
                      <div className="mt-3 divide-y rounded-lg bg-fill-quiet px-3 sm:ml-8">
                        {plugin.scaffolds.map((scaffold) => {
                          const key = `scaffold:${plugin.id}:${scaffold.id}`;
                          return (
                            <div
                              key={scaffold.id}
                              className="flex flex-col items-start gap-3 py-2.5 sm:flex-row sm:items-center"
                            >
                              <FolderDown className="size-4 shrink-0 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <p className="text-ui font-medium">{scaffold.name}</p>
                                <p className="truncate text-fine text-muted-foreground">
                                  {scaffold.description ||
                                    t("pluginHub.scaffoldFiles", {
                                      count: scaffold.files,
                                    })}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="self-end sm:self-auto"
                                disabled={busy === key || !cwd}
                                onClick={() => void run(key, () => onApplyScaffold(plugin.id, scaffold.id))}
                              >
                                {busy === key ? (
                                  <LoaderCircle className="size-3.5 animate-spin" />
                                ) : (
                                  <FolderDown className="size-3.5" />
                                )}
                                {t("pluginHub.applyScaffold")}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {tab === "components" && (
            <div className="divide-y px-6">
              {visibleSkills.map((skill) => (
                <div key={skill.id} className="flex items-center gap-3 py-3.5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-fill-quiet text-muted-foreground">
                    <KindIcon kind={skill.kind} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-ui font-semibold">{skill.name}</span>
                      <Badge variant="secondary" className="shrink-0 text-cap uppercase">
                        {skill.kind.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-hint text-muted-foreground">{skill.description}</p>
                    <p className="mt-1 text-fine text-muted-foreground/70">{skill.source ?? t("pluginHub.library")}</p>
                  </div>
                  {skill.source?.startsWith("GitHub · ") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      title={t("pluginHub.uninstall")}
                      disabled={busy === `skill:${skill.id}`}
                      onClick={() => void run(`skill:${skill.id}`, () => onUninstallSkill(skill.id))}
                    >
                      {busy === `skill:${skill.id}` ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  )}
                  <Button size="sm" onClick={() => onUse(skill)}>
                    <Check className="size-3.5" />
                    {t("pluginHub.use")}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {tab === "market" && (
            <div className="divide-y px-6">
              {marketplace && visibleMarketplacePlugins.length > 0 && (
                <div className="py-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-ui font-semibold">{marketplace.display_name}</span>
                    <Badge variant="outline" className="text-cap uppercase">
                      {standardLabel(marketplace.standard)}
                    </Badge>
                  </div>
                  {marketplace.description && (
                    <p className="text-hint text-muted-foreground">{marketplace.description}</p>
                  )}
                  {marketplace.diagnostics.map((diagnostic, index) => (
                    <p key={`${diagnostic.code}:${index}`} className="mt-1 text-fine text-warning">
                      {diagnostic.message}
                    </p>
                  ))}
                </div>
              )}
              {visibleMarketplacePlugins.map((entry) => {
                const installedPlugin = plugins.find(
                  (plugin) => plugin.name === entry.display_name || plugin.name === entry.name,
                );
                const key = `marketplace:${marketplace?.name ?? "catalog"}:${entry.name}`;
                return (
                  <div key={key} className="flex flex-col items-start gap-3 py-3.5 sm:flex-row sm:items-center">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-fill-quiet">
                      <Package className="size-5" />
                    </div>
                    <div className="w-full min-w-0 flex-1 sm:w-auto">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-ui font-semibold">{entry.display_name}</span>
                        {entry.version && <Badge variant="secondary">v{entry.version}</Badge>}
                        {entry.category && <Badge variant="outline">{entry.category}</Badge>}
                        <Badge variant="outline" className="uppercase">
                          {entry.source.kind.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-hint text-muted-foreground">{entry.description}</p>
                      {entry.diagnostic && <p className="mt-1 text-fine text-warning">{entry.diagnostic}</p>}
                    </div>
                    {installedPlugin ? (
                      <Badge variant="secondary">
                        <Check className="mr-1 size-3" />
                        {t("pluginHub.installed")}
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        disabled={!entry.installable || busy === key || !marketplace}
                        onClick={() =>
                          marketplace &&
                          void run(key, () => onInstallMarketplacePlugin(marketplace.manifest_path, entry.name))
                        }
                      >
                        {busy === key ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <Download className="size-3.5" />
                        )}
                        {t("pluginHub.install")}
                      </Button>
                    )}
                  </div>
                );
              })}
              {visibleMarket.map((item) => {
                const installedSkill = skills.find((skill) => skill.id === item.id) ?? null;
                const key = `market:${item.id}`;
                return (
                  <div key={item.id} className="flex flex-col items-start gap-3 py-3.5 sm:flex-row sm:items-center">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded bg-fill-quiet text-title">
                      {item.icon ?? <Boxes className="size-5" />}
                    </div>
                    <div className="w-full min-w-0 flex-1 sm:w-auto">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-ui font-semibold">{item.name}</span>
                        <Badge variant="secondary" className="shrink-0 text-cap uppercase">
                          {item.kind.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-hint text-muted-foreground">{item.description}</p>
                      <p className="mt-1 text-fine text-muted-foreground/70">{item.author}</p>
                    </div>
                    {installedSkill ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          title={t("pluginHub.uninstall")}
                          disabled={busy === key}
                          onClick={() => void run(key, () => onUninstallSkill(item.id))}
                        >
                          {busy === key ? (
                            <LoaderCircle className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </Button>
                        <Button size="sm" onClick={() => onUse(installedSkill)}>
                          <Check className="size-3.5" />
                          {t("pluginHub.use")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busy === key}
                        onClick={() => void run(key, () => onInstallMarket(item.id))}
                      >
                        {busy === key ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <Download className="size-3.5" />
                        )}
                        {t("pluginHub.install")}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {empty && (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
              <Search className="mb-3 size-5 text-muted-foreground/60" />
              <p className="text-ui font-medium">{t("pluginHub.empty")}</p>
              <p className="mt-1 text-hint text-muted-foreground">{t("pluginHub.emptyHint")}</p>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="border-t px-6 py-3">
          <Button variant="outline" onClick={onClose}>
            {t("pluginHub.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
