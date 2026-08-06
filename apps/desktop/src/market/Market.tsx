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
  Plus,
  Search,
  Server,
  Sparkles,
  Trash2,
} from "lucide-react";

import type {
  GitHubImportResult,
  MarketItem,
  PluginInfo,
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
  onUninstallPlugin,
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
  onUninstallPlugin: (id: string) => Promise<void>;
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
        [skill.name, skill.description, skill.kind, skill.source ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
      ),
    [skills, q],
  );
  const visibleMarket = useMemo(
    () =>
      items.filter((item) =>
        [item.name, item.description, item.kind, item.author, ...item.tags]
          .join(" ")
          .toLowerCase()
          .includes(q),
      ),
    [items, q],
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

  const labels = {
    skills: t("pluginHub.skills"),
    subagents: t("pluginHub.subagents"),
    mcp: t("pluginHub.mcp"),
    scaffolds: t("pluginHub.scaffolds"),
  };
  const empty =
    (tab === "plugins" && visiblePlugins.length === 0) ||
    (tab === "components" && visibleSkills.length === 0) ||
    (tab === "market" && visibleMarket.length === 0);

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
            <div className="flex shrink-0 items-center gap-1.5">
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
            <p className="ml-6 mt-1.5 text-fine leading-relaxed text-muted-foreground">
              {t("pluginHub.githubHint")}
            </p>
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

        <div className="flex flex-wrap items-center gap-4 border-b px-6 py-3">
          <Tabs value={tab} onValueChange={(value) => setTab(value as HubTab)} className="shrink-0">
            <TabsList variant="line">
              <TabsTrigger value="plugins">
                {t("pluginHub.plugins")} <span className="text-fine text-muted-foreground">{plugins.length}</span>
              </TabsTrigger>
              <TabsTrigger value="components">
                {t("pluginHub.components")} <span className="text-fine text-muted-foreground">{skills.length}</span>
              </TabsTrigger>
              <TabsTrigger value="market">
                {t("pluginHub.market")} <span className="text-fine text-muted-foreground">{items.length}</span>
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
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-fill-quiet text-muted-foreground">
                        <Package className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-ui font-semibold">{plugin.name}</span>
                          <Badge variant="outline" className="text-cap">
                            v{plugin.version}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-hint text-muted-foreground">{plugin.description}</p>
                        <p className="mt-1 text-fine text-muted-foreground/70">
                          {plugin.source}
                          {plugin.author ? ` · ${plugin.author}` : ""}
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                        title={t("pluginHub.uninstall")}
                        disabled={busy === uninstallKey}
                        onClick={() => void run(uninstallKey, () => onUninstallPlugin(plugin.id))}
                      >
                        {busy === uninstallKey ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    </div>

                    {plugin.scaffolds.length > 0 && (
                      <div className="ml-[52px] mt-3 divide-y rounded-lg bg-fill-quiet px-3">
                        {plugin.scaffolds.map((scaffold) => {
                          const key = `scaffold:${plugin.id}:${scaffold.id}`;
                          return (
                            <div key={scaffold.id} className="flex items-center gap-3 py-2.5">
                              <FolderDown className="size-4 shrink-0 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <p className="text-ui font-medium">{scaffold.name}</p>
                                <p className="truncate text-fine text-muted-foreground">
                                  {scaffold.description || t("pluginHub.scaffoldFiles", { count: scaffold.files })}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
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
                    <p className="mt-1 text-fine text-muted-foreground/70">
                      {skill.source ?? t("pluginHub.library")}
                    </p>
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
              {visibleMarket.map((item) => {
                const installedSkill = skills.find((skill) => skill.id === item.id) ?? null;
                const key = `market:${item.id}`;
                return (
                  <div key={item.id} className="flex items-center gap-3 py-3.5">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-fill-quiet text-title">
                      {item.icon ?? <Boxes className="size-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
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
                      <Button size="sm" disabled={busy === key} onClick={() => void run(key, () => onInstallMarket(item.id))}>
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
