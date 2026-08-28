import { useEffect, useMemo, useState } from "react";
import { Copy, FolderOpen, ImagePlus, Plus, RotateCcw, Trash2 } from "@/components/ui/icons";

import {
  confirmNative,
  getProjectScheduling,
  openNativePath,
  pickProjectIcon,
  setProjectScheduling,
  type Project,
  type ProjectWorktreeMode,
  type ProviderInfo,
} from "../bridge";
import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";
import { ProjectIcon } from "../projects/ProjectIcon";
import { ProviderIcon } from "../providers/ProviderIcon";
import { ModelPicker } from "../session/Composer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { GroupHeading, Page, ProjectRow } from "./SettingsPrimitives";

const REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"] as const;

export function ProjectSettingsPage({
  project,
  providers,
  onWorktreeMode,
  onRename = async () => {},
  onIcon = async () => {},
  onAgentDefaults = async () => {},
  onRemove = async () => {},
  iconPicker = pickProjectIcon,
  actionsCount = 0,
  onAddAction = () => {},
  onModeSavingChange = () => {},
}: {
  project: Project | null;
  providers: ProviderInfo[];
  onWorktreeMode: (path: string, mode: ProjectWorktreeMode | null) => Promise<void>;
  onRename?: (path: string, name: string) => Promise<void>;
  onIcon?: (path: string, source: string | null) => Promise<void>;
  onAgentDefaults?: (
    path: string,
    provider: string | null,
    model: string | null,
    reasoningEffort: string | null,
  ) => Promise<void>;
  onRemove?: (path: string) => Promise<void>;
  iconPicker?: () => Promise<string | null>;
  actionsCount?: number;
  onAddAction?: () => void;
  onModeSavingChange?: (saving: boolean) => void;
}) {
  const t = useT();
  const providerNames = useMemo(
    () => Object.fromEntries(providers.map((candidate) => [candidate.id, candidate.display_name])),
    [providers],
  );
  const [modeSaving, setModeSaving] = useState(false);
  const [nameDraft, setNameDraft] = useState(project?.name ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [iconSaving, setIconSaving] = useState(false);
  const [agentSaving, setAgentSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedulingEnabled, setSchedulingEnabled] = useState(false);

  useEffect(() => {
    setNameDraft(project?.name ?? "");
    setError(null);
  }, [project?.path, project?.name]);

  useEffect(() => {
    if (!project) return;
    void getProjectScheduling(project.path).then(setSchedulingEnabled);
  }, [project?.path]);

  async function saveWorktreeMode(path: string, mode: ProjectWorktreeMode | null) {
    setModeSaving(true);
    onModeSavingChange(true);
    try {
      await onWorktreeMode(path, mode);
    } finally {
      setModeSaving(false);
      onModeSavingChange(false);
    }
  }

  async function saveName() {
    if (!project) return;
    const name = nameDraft.trim();
    if (!name) {
      setError(t("settings.projectNameRequired"));
      setNameDraft(project.name);
      return;
    }
    if (name === project.name) return;
    setProfileSaving(true);
    setError(null);
    try {
      await onRename(project.path, name);
    } catch (cause) {
      setNameDraft(project.name);
      setError(t("settings.projectSaveFailed", { error: String(cause) }));
    } finally {
      setProfileSaving(false);
    }
  }

  async function chooseIcon() {
    if (!project) return;
    const source = await iconPicker();
    if (!source) return;
    setIconSaving(true);
    setError(null);
    try {
      await onIcon(project.path, source);
    } catch (cause) {
      setError(t("settings.projectIconFailed", { error: String(cause) }));
    } finally {
      setIconSaving(false);
    }
  }

  async function clearIcon() {
    if (!project) return;
    setIconSaving(true);
    setError(null);
    try {
      await onIcon(project.path, null);
    } catch (cause) {
      setError(t("settings.projectIconFailed", { error: String(cause) }));
    } finally {
      setIconSaving(false);
    }
  }

  async function saveAgentDefaults(
    providerId: string | null,
    modelId: string | null,
    reasoningEffort: string | null,
  ) {
    if (!project) return;
    setAgentSaving(true);
    setError(null);
    try {
      await onAgentDefaults(project.path, providerId, modelId, reasoningEffort);
    } catch (cause) {
      setError(t("settings.projectSaveFailed", { error: String(cause) }));
    } finally {
      setAgentSaving(false);
    }
  }

  async function removeProject() {
    if (!project) return;
    if (!(await confirmNative(t("settings.removeProjectConfirm", { name: project.name })))) return;
    setProfileSaving(true);
    setError(null);
    try {
      await onRemove(project.path);
    } catch (cause) {
      setError(t("settings.projectSaveFailed", { error: String(cause) }));
    } finally {
      setProfileSaving(false);
    }
  }

  const projectDefaultProvider = project?.default_provider ?? null;
  const projectDefaultModels = projectDefaultProvider
    ? providers.find((candidate) => candidate.id === projectDefaultProvider)?.models ?? []
    : [];
  return (
    <Page title={t("settings.project")} description={t("settings.projectHint")}>
      {project ? (
        <>
          <GroupHeading>{t("settings.projectProfile")}</GroupHeading>
          <ProjectRow
            label={t("settings.projectName")}
            hint={t("settings.projectNameHint")}
          >
            <Input
              aria-label={t("settings.projectName")}
              value={nameDraft}
              disabled={profileSaving}
              maxLength={80}
              size="compact"
              className="w-full text-ui"
              onInput={(event) => setNameDraft(event.currentTarget.value)}
              onBlur={() => void saveName()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  setNameDraft(project.name);
                  event.currentTarget.blur();
                }
              }}
            />
          </ProjectRow>
          <ProjectRow
            label={t("settings.projectIcon")}
            hint={project.has_icon
              ? t("settings.projectIconCustom")
              : t("settings.projectIconAutomatic")}
          >
            <div
              data-project-icon-picker
              className="flex h-control-field w-full items-stretch overflow-hidden rounded-control bg-fill-rest"
            >
              <button
                type="button"
                className="group flex min-w-0 flex-1 items-center gap-module-inset px-2 text-left outline-none transition-colors hover:bg-fill-hover focus-visible:focus-ring-inset disabled:pointer-events-none disabled:opacity-50"
                disabled={iconSaving}
                onClick={() => void chooseIcon()}
              >
                <ProjectIcon project={project} size={24} className="bg-background/70" />
                <span className="min-w-0 flex-1 truncate text-ui font-medium">
                  {project.has_icon
                    ? t("settings.projectIconChange")
                    : t("settings.projectIconChoose")}
                </span>
                <ImagePlus className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
              </button>
              {project.has_icon ? (
                <>
                  <span className="my-2 w-px shrink-0 bg-foreground/10" aria-hidden="true" />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="my-auto mx-1 text-muted-foreground"
                    aria-label={t("settings.projectIconRemove")}
                    title={t("settings.projectIconRemove")}
                    disabled={iconSaving}
                    onClick={() => void clearIcon()}
                  >
                    <Trash2 />
                  </Button>
                </>
              ) : null}
            </div>
          </ProjectRow>
          {error ? (
            <p className="project-settings-error pt-1 text-hint leading-relaxed text-destructive">{error}</p>
          ) : null}

          <GroupHeading>{t("settings.projectNewSessions")}</GroupHeading>
          <ProjectRow
            label={t("settings.projectProvider")}
            hint={t("settings.projectProviderHint")}
          >
            <Select
              disabled={agentSaving}
              value={projectDefaultProvider ?? "automatic"}
              onValueChange={(value) => {
                void saveAgentDefaults(
                  value === "automatic" ? null : value,
                  null,
                  null,
                );
              }}
            >
              <SelectTrigger
                data-project-provider
                aria-label={t("settings.projectProvider")}
                size="sm"
                className="w-full justify-between"
              >
                <SelectValue>
                  {projectDefaultProvider ? (
                    <>
                      <ProviderIcon provider={projectDefaultProvider} className="size-4" />
                      {providerNames[projectDefaultProvider] ?? projectDefaultProvider}
                    </>
                  ) : t("settings.projectProviderAutomatic")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectGroup>
                  <SelectItem value="automatic">{t("settings.projectProviderAutomatic")}</SelectItem>
                  {providers.map((candidate) => (
                    <SelectItem
                      key={candidate.id}
                      value={candidate.id}
                      disabled={!candidate.available}
                    >
                      <ProviderIcon provider={candidate.id} className="size-4" />
                      {candidate.display_name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </ProjectRow>
          <ProjectRow
            label={t("settings.projectModel")}
            hint={t("settings.projectModelHint")}
          >
            <div className="grid w-full grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
              {projectDefaultProvider && projectDefaultModels.length > 0 ? (
                <div className="flex min-w-0 items-center rounded-control bg-fill-rest px-1">
                  <ModelPicker
                    models={projectDefaultModels}
                    current={project.default_model ?? null}
                    defaultModel={null}
                    provider={projectDefaultProvider}
                    onModel={(model) => {
                      void saveAgentDefaults(
                        projectDefaultProvider,
                        model,
                        project.default_reasoning_effort ?? null,
                      );
                    }}
                    configOptions={[]}
                    onConfigOption={() => {}}
                    hasSession={false}
                  />
                  {project.default_model ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="ms-auto"
                      aria-label={t("settings.projectModelReset")}
                      title={t("settings.projectModelReset")}
                      disabled={agentSaving}
                      onClick={() => void saveAgentDefaults(
                        projectDefaultProvider,
                        null,
                        project.default_reasoning_effort ?? null,
                      )}
                    >
                      <RotateCcw />
                    </Button>
                  ) : null}
                </div>
              ) : (
                <span className="col-span-2 flex h-control-field min-w-0 items-center rounded-control bg-fill-rest px-3 text-hint text-muted-foreground">
                  {t("settings.projectModelDefault")}
                </span>
              )}
              {projectDefaultProvider ? (
                <Select
                  disabled={agentSaving}
                  value={project.default_reasoning_effort ?? "automatic"}
                  onValueChange={(value) => {
                    void saveAgentDefaults(
                      projectDefaultProvider,
                      project.default_model ?? null,
                      value === "automatic" ? null : value,
                    );
                  }}
                >
                  <SelectTrigger
                    aria-label={t("settings.projectReasoning")}
                    size="sm"
                    className="w-full justify-between"
                  >
                    <SelectValue>
                      {project.default_reasoning_effort
                        ? t(`effort.${project.default_reasoning_effort}` as StringKey)
                        : t("settings.projectModelDefault")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent position="popper" align="end">
                    <SelectGroup>
                      <SelectItem value="automatic">{t("settings.projectModelDefault")}</SelectItem>
                      {REASONING_EFFORTS.map((effort) => (
                        <SelectItem key={effort} value={effort}>
                          {t(`effort.${effort}` as StringKey)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </ProjectRow>
          <ProjectRow
            label={t("settings.projectWorkspace")}
            hint={t("settings.projectWorkspaceHint")}
          >
            <Select
              disabled={modeSaving}
              value={project.default_worktree_mode ?? "inherit"}
              onValueChange={(value) => {
                void saveWorktreeMode(
                  project.path,
                  value === "inherit" ? null : (value as ProjectWorktreeMode),
                );
              }}
            >
              <SelectTrigger size="sm" className="w-full justify-between">
                <SelectValue>
                  {project.default_worktree_mode === "local"
                    ? t("settings.projectWorkspaceLocal")
                    : project.default_worktree_mode === "current"
                      ? t("settings.projectWorkspaceCurrent")
                      : project.default_worktree_mode === "origin_default"
                        ? t("settings.projectWorkspaceOrigin")
                        : t("settings.projectWorkspaceInherit")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectGroup>
                  <SelectItem value="inherit">{t("settings.projectWorkspaceInherit")}</SelectItem>
                  <SelectItem value="local">{t("settings.projectWorkspaceLocal")}</SelectItem>
                  <SelectItem value="current">{t("settings.projectWorkspaceCurrent")}</SelectItem>
                  <SelectItem value="origin_default">
                    {t("settings.projectWorkspaceOrigin")}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </ProjectRow>
          <ProjectRow
            label={t("settings.scheduling")}
            hint={t("settings.schedulingHint")}
          >
            <Switch
              aria-label={t("settings.scheduling")}
              checked={schedulingEnabled}
              onCheckedChange={(checked) => {
                const enabled = checked;
                setSchedulingEnabled(enabled);
                setError(null);
                void setProjectScheduling(project.path, enabled).catch((error) => {
                  setSchedulingEnabled(!enabled);
                  setError(t("settings.projectSaveFailed", { error: String(error) }));
                });
              }}
            />
          </ProjectRow>

          <GroupHeading>{t("settings.projectCheckout")}</GroupHeading>
          <ProjectRow label={t("settings.projectPath")} hint={t("settings.projectPathHint")}>
            <div className="flex h-control-field w-full min-w-0 items-center overflow-hidden rounded-control bg-fill-rest">
              <span className="min-w-0 flex-1 truncate px-3 font-mono text-fine text-muted-foreground" title={project.path}>
                {project.path}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-label={t("settings.projectPathCopy")}
                title={t("settings.projectPathCopy")}
                onClick={() => {
                  void navigator.clipboard.writeText(project.path).catch((error) => {
                    setError(t("settings.projectSaveFailed", { error: String(error) }));
                  });
                }}
              >
                <Copy />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-label={t("settings.projectPathReveal")}
                title={t("settings.projectPathReveal")}
                onClick={() => {
                  void openNativePath(project.path).then((opened) => {
                    if (!opened) throw new Error(t("settings.projectPathRevealUnavailable"));
                  }).catch((error) => {
                    setError(t("settings.projectSaveFailed", { error: String(error) }));
                  });
                }}
              >
                <FolderOpen />
              </Button>
            </div>
          </ProjectRow>

          <GroupHeading>{t("settings.projectActions")}</GroupHeading>
          <ProjectRow
            label={t("settings.projectActions")}
            hint={actionsCount === 0
              ? t("settings.projectActionsEmpty")
              : t("settings.projectActionsCount", { count: actionsCount })}
          >
            <Button variant="outline" size="sm" onClick={onAddAction}>
              <Plus />
              {t("settings.projectActionAdd")}
            </Button>
          </ProjectRow>

          <GroupHeading>{t("settings.projectDanger")}</GroupHeading>
          <ProjectRow
            label={t("settings.removeProject")}
            hint={t("settings.removeProjectHint")}
          >
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={profileSaving}
              onClick={() => void removeProject()}
            >
              <Trash2 />
              {t("settings.removeProject")}
            </Button>
          </ProjectRow>
        </>
      ) : (
        <p className="py-6 text-ui text-muted-foreground">{t("settings.projectNone")}</p>
      )}
    </Page>
  );
}
