import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, RefreshCw, Trash2 } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

import {
  confirmNative,
  discardOrphanWorktree,
  discardSessionWorktree,
  getWorktreeSettings,
  listProjectWorktrees,
  updateWorktreeSettings,
  type Project,
  type WorktreeEntryKind,
  type WorktreeSettings,
  type WorktreeStatusEntry,
} from "../bridge";
import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";
import { ProjectIcon } from "../projects/ProjectIcon";
import { Page, Row } from "./SettingsPrimitives";
import {
  worktreeBranchDisplay,
  worktreeDiscardRoute,
  worktreeStatusBadges,
  type WorktreeStatusBadge,
} from "./worktrees";

type ProjectWorktreeState = {
  entries: WorktreeStatusEntry[];
  error: string | null;
};

const WORKTREE_KIND_LABELS: Record<WorktreeEntryKind, StringKey> = {
  session: "worktree.kindSession",
  orphan: "worktree.kindOrphan",
  stale: "worktree.kindStale",
};

const WORKTREE_BADGE_LABELS: Record<WorktreeStatusBadge, StringKey> = {
  archived: "worktree.badgeArchived",
  discarded: "worktree.badgeDiscarded",
  checkoutMissing: "worktree.badgeCheckoutMissing",
};

export function WorktreeSettingsPage({
  projects,
  onOpenSession = () => {},
  lister = listProjectWorktrees,
  settingsLoader = getWorktreeSettings,
  settingsSaver = updateWorktreeSettings,
  sessionDiscarder = discardSessionWorktree,
  orphanDiscarder = discardOrphanWorktree,
  confirmer = confirmNative,
}: {
  projects: Project[];
  onOpenSession?: (sessionId: string) => void;
  lister?: typeof listProjectWorktrees;
  settingsLoader?: () => Promise<WorktreeSettings>;
  settingsSaver?: (settings: WorktreeSettings) => Promise<WorktreeSettings>;
  sessionDiscarder?: typeof discardSessionWorktree;
  orphanDiscarder?: typeof discardOrphanWorktree;
  confirmer?: typeof confirmNative;
}) {
  const t = useT();
  const [worktreesByProject, setWorktreesByProject] = useState<
    Record<string, ProjectWorktreeState>
  >({});
  const [worktreesLoading, setWorktreesLoading] = useState(false);
  const [worktreeSettings, setWorktreeSettings] =
    useState<WorktreeSettings | null>(null);
  const [worktreeSettingsSaving, setWorktreeSettingsSaving] = useState(false);
  const [worktreeSettingsError, setWorktreeSettingsError] = useState<
    string | null
  >(null);
  const [worktreeRootDraft, setWorktreeRootDraft] = useState("");
  const [worktreeLimitDraft, setWorktreeLimitDraft] = useState("15");
  const [discardingWorktree, setDiscardingWorktree] = useState<string | null>(
    null
  );
  const requestRef = useRef(0);

  const loadWorktrees = useCallback(
    async (projectList: Project[]) => {
      const request = ++requestRef.current;
      setWorktreesLoading(true);
      const results = await Promise.all(
        projectList.map(async (candidate) => {
          try {
            return [
              candidate.path,
              { entries: await lister(candidate.path), error: null },
            ] as const;
          } catch (cause) {
            return [
              candidate.path,
              {
                entries: [],
                error: t("worktree.manageFailed", { error: String(cause) }),
              },
            ] as const;
          }
        })
      );
      if (request !== requestRef.current) return;
      setWorktreesByProject(Object.fromEntries(results));
      setWorktreesLoading(false);
    },
    [lister, t]
  );

  useEffect(() => {
    void loadWorktrees(projects);
    return () => {
      requestRef.current += 1;
    };
  }, [loadWorktrees, projects]);

  useEffect(() => {
    let active = true;
    setWorktreeSettingsError(null);
    void settingsLoader()
      .then((settings) => {
        if (!active) return;
        setWorktreeSettings(settings);
        setWorktreeRootDraft(settings.root ?? "");
        setWorktreeLimitDraft(String(settings.auto_delete_limit));
      })
      .catch((cause) => {
        if (active)
          setWorktreeSettingsError(
            t("worktree.settingsLoadFailed", { error: String(cause) })
          );
      });
    return () => {
      active = false;
    };
  }, [settingsLoader, t]);

  async function loadProjectWorktrees(path: string) {
    try {
      const entries = await lister(path);
      setWorktreesByProject((current) => ({
        ...current,
        [path]: { entries, error: null },
      }));
    } catch (cause) {
      setWorktreesByProject((current) => ({
        ...current,
        [path]: {
          entries: [],
          error: t("worktree.manageFailed", { error: String(cause) }),
        },
      }));
    }
  }

  async function saveGlobalWorktreeSettings(patch: Partial<WorktreeSettings>) {
    if (!worktreeSettings) return false;
    setWorktreeSettingsSaving(true);
    setWorktreeSettingsError(null);
    try {
      const saved = await settingsSaver({ ...worktreeSettings, ...patch });
      setWorktreeSettings(saved);
      setWorktreeRootDraft(saved.root ?? "");
      setWorktreeLimitDraft(String(saved.auto_delete_limit));
      if (
        Object.prototype.hasOwnProperty.call(patch, "root") ||
        Object.prototype.hasOwnProperty.call(patch, "auto_delete")
      ) {
        await loadWorktrees(projects);
      }
      return true;
    } catch (cause) {
      setWorktreeSettingsError(
        t("worktree.settingsSaveFailed", { error: String(cause) })
      );
      setWorktreeRootDraft(worktreeSettings.root ?? "");
      setWorktreeLimitDraft(String(worktreeSettings.auto_delete_limit));
      return false;
    } finally {
      setWorktreeSettingsSaving(false);
    }
  }

  function commitWorktreeRoot() {
    if (!worktreeSettings) return;
    const root = worktreeRootDraft.trim() || undefined;
    if (root === worktreeSettings.root) return;
    void saveGlobalWorktreeSettings({ root });
  }

  function commitWorktreeLimit() {
    if (!worktreeSettings) return;
    const parsed = Number.parseInt(worktreeLimitDraft, 10);
    const limit = Number.isFinite(parsed)
      ? Math.min(1000, Math.max(1, parsed))
      : worktreeSettings.auto_delete_limit;
    setWorktreeLimitDraft(String(limit));
    if (limit !== worktreeSettings.auto_delete_limit) {
      void saveGlobalWorktreeSettings({ auto_delete_limit: limit });
    }
  }

  async function discardWorktree(
    projectPath: string,
    entry: WorktreeStatusEntry
  ) {
    if (!(await confirmer(t("worktree.discardConfirm", { path: entry.path }))))
      return;
    setDiscardingWorktree(entry.path);
    try {
      const route = worktreeDiscardRoute(entry);
      if (route.kind === "session") await sessionDiscarder(route.session);
      else await orphanDiscarder(projectPath, route.worktreePath);
      await loadProjectWorktrees(projectPath);
    } catch (cause) {
      setWorktreesByProject((current) => ({
        ...current,
        [projectPath]: {
          entries: current[projectPath]?.entries ?? [],
          error: t("worktree.discardFailed", { error: String(cause) }),
        },
      }));
    } finally {
      setDiscardingWorktree(null);
    }
  }

  return (
    <Page
      title={t("settings.worktrees")}
      description={t("worktree.manageAllHint")}
    >
      <section
        className="worktree-policy-card"
        aria-label={t("worktree.settingsTitle")}
      >
        {worktreeSettings ? (
          <>
            <Row
              className="worktree-policy-row"
              label={t("worktree.root")}
              hint={t("worktree.rootHint")}
            >
              <Input
                className="worktree-root-input font-mono"
                value={worktreeRootDraft}
                placeholder={t("worktree.rootDefault")}
                aria-label={t("worktree.root")}
                disabled={worktreeSettingsSaving}
                onChange={(event) => setWorktreeRootDraft(event.target.value)}
                onBlur={commitWorktreeRoot}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </Row>
            <Row
              className="worktree-policy-row"
              label={t("worktree.fetchUpstream")}
              hint={t("worktree.fetchUpstreamHint")}
            >
              <Switch
                checked={worktreeSettings.fetch_upstream}
                disabled={worktreeSettingsSaving}
                aria-label={t("worktree.fetchUpstream")}
                onCheckedChange={(fetch_upstream) => {
                  void saveGlobalWorktreeSettings({ fetch_upstream });
                }}
              />
            </Row>
            <Row
              className="worktree-policy-row"
              label={t("worktree.autoDelete")}
              hint={t("worktree.autoDeleteHint")}
            >
              <Switch
                checked={worktreeSettings.auto_delete}
                disabled={worktreeSettingsSaving}
                aria-label={t("worktree.autoDelete")}
                onCheckedChange={(auto_delete) => {
                  void saveGlobalWorktreeSettings({ auto_delete });
                }}
              />
            </Row>
            <Row
              className="worktree-policy-row"
              label={t("worktree.autoDeleteLimit")}
              hint={t("worktree.autoDeleteLimitHint")}
            >
              <Input
                className="worktree-limit-input"
                type="number"
                min={1}
                max={1000}
                inputMode="numeric"
                value={worktreeLimitDraft}
                aria-label={t("worktree.autoDeleteLimit")}
                disabled={
                  worktreeSettingsSaving || !worktreeSettings.auto_delete
                }
                onChange={(event) => setWorktreeLimitDraft(event.target.value)}
                onBlur={commitWorktreeLimit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </Row>
          </>
        ) : (
          <p className="text-metadata text-muted-foreground px-4 py-4">
            {t("worktree.settingsLoading")}
          </p>
        )}
      </section>
      {worktreeSettingsError ? (
        <p className="text-metadata text-destructive mt-2" role="alert">
          {worktreeSettingsError}
        </p>
      ) : null}

      <div className="pt-section flex items-center justify-end pb-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={
            worktreesLoading ||
            worktreeSettingsSaving ||
            discardingWorktree !== null
          }
          onClick={() => void loadWorktrees(projects)}
        >
          {worktreesLoading ? <Spinner /> : <RefreshCw />}
          {t("worktree.refresh")}
        </Button>
      </div>

      {projects.length === 0 ? (
        <p className="text-body text-muted-foreground py-6">
          {t("worktree.manageNoProjects")}
        </p>
      ) : worktreesLoading && Object.keys(worktreesByProject).length === 0 ? (
        <p className="text-body text-muted-foreground py-6">
          {t("worktree.manageLoading")}
        </p>
      ) : (
        projects.map((candidate) => {
          const state = worktreesByProject[candidate.path] ?? {
            entries: [],
            error: null,
          };
          return (
            <section
              key={candidate.path}
              data-worktree-project={candidate.path}
              className="worktree-project-section"
            >
              <div className="worktree-project-header">
                <ProjectIcon project={candidate} size={24} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-body truncate font-semibold">
                    {candidate.name}
                  </h2>
                  <p
                    className="text-callout text-muted-foreground truncate font-mono"
                    title={candidate.path}
                  >
                    {candidate.path}
                  </p>
                </div>
                <Badge variant="secondary">
                  {t("worktree.count", { count: state.entries.length })}
                </Badge>
              </div>

              <div className="worktree-project-card">
                {state.error ? (
                  <p
                    className="text-metadata text-destructive px-3 py-3"
                    role="alert"
                  >
                    {state.error}
                  </p>
                ) : state.entries.length === 0 ? (
                  <p className="text-metadata text-muted-foreground px-3 py-3">
                    {t("worktree.manageEmpty")}
                  </p>
                ) : (
                  state.entries.map((entry) => {
                    const branch = worktreeBranchDisplay(entry.branch);
                    return (
                      <Row
                        key={entry.path}
                        compact
                        className="worktree-settings-row"
                        controlClassName="worktree-settings-actions"
                        label={entry.session_title ?? branch ?? entry.path}
                        hint={
                          <span className="block min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="secondary">
                                {t(WORKTREE_KIND_LABELS[entry.kind])}
                              </Badge>
                              {worktreeStatusBadges(entry).map((badge) => (
                                <Badge key={badge} variant="secondary">
                                  {t(WORKTREE_BADGE_LABELS[badge])}
                                </Badge>
                              ))}
                              {branch && (
                                <span className="shrink-0 font-mono">
                                  {branch}
                                </span>
                              )}
                            </span>
                            <span
                              className="mt-1 block truncate font-mono"
                              title={entry.path}
                            >
                              {entry.path}
                            </span>
                          </span>
                        }
                      >
                        {entry.session_id ? (
                          <Button
                            variant="secondary"
                            size="xs"
                            disabled={discardingWorktree !== null}
                            onClick={() => onOpenSession(entry.session_id!)}
                          >
                            <MessageSquare />
                            {t("worktree.openConversation")}
                          </Button>
                        ) : null}
                        <Button
                          variant="destructive"
                          size="xs"
                          disabled={discardingWorktree !== null}
                          onClick={() =>
                            void discardWorktree(candidate.path, entry)
                          }
                        >
                          {discardingWorktree === entry.path ? (
                            <Spinner />
                          ) : (
                            <Trash2 />
                          )}
                          {t("worktree.discard")}
                        </Button>
                      </Row>
                    );
                  })
                )}
              </div>
            </section>
          );
        })
      )}
    </Page>
  );
}
