import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Copy,
  FolderOpen,
  ImagePlus,
  Plus,
  RotateCcw,
  Trash2,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TooltipButton } from "@/components/ui/tooltip";

import {
  confirmNative,
  getProjectScheduling,
  openNativePath,
  pickProjectIcon,
  setProjectScheduling,
} from "../bridge";
import type { Project, ProjectWorktreeMode, ProviderInfo } from "../bridge";
import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";
import { ProjectIcon } from "../projects/ProjectIcon";
import { ProviderIcon } from "../providers/ProviderIcon";
import { ModelPicker } from "../session/Composer";
import { GroupHeading, Page, ProjectRow } from "./SettingsPrimitives";

const reasoningEfforts = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;

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
  readonly project: Project | null;
  readonly providers: ProviderInfo[];
  readonly onWorktreeMode: (
    path: string,
    mode: ProjectWorktreeMode | null
  ) => Promise<void>;
  readonly onRename?: (path: string, name: string) => Promise<void>;
  readonly onIcon?: (path: string, source: string | null) => Promise<void>;
  readonly onAgentDefaults?: (
    path: string,
    provider: string | null,
    model: string | null,
    reasoningEffort: string | null
  ) => Promise<void>;
  readonly onRemove?: (path: string) => Promise<void>;
  readonly iconPicker?: () => Promise<string | null>;
  readonly actionsCount?: number;
  readonly onAddAction?: () => void;
  readonly onModeSavingChange?: (isSaving: boolean) => void;
}) {
  const t = useT();
  const providerNames = Object.fromEntries(
    providers.map((candidate) => [candidate.id, candidate.display_name])
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
    if (!project) {
      return;
    }
    void getProjectScheduling(project.path).then(setSchedulingEnabled);
  }, [project?.path]);

  async function saveWorktreeMode(
    path: string,
    mode: ProjectWorktreeMode | null
  ) {
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
    if (!project) {
      return;
    }
    const name = nameDraft.trim();
    if (!name) {
      setError(t("settings.projectNameRequired"));
      setNameDraft(project.name);
      return;
    }
    if (name === project.name) {
      return;
    }
    setProfileSaving(true);
    setError(null);
    try {
      await onRename(project.path, name);
    } catch (error) {
      setNameDraft(project.name);
      setError(t("settings.projectSaveFailed", { error: String(error) }));
    } finally {
      setProfileSaving(false);
    }
  }

  async function chooseIcon() {
    if (!project) {
      return;
    }
    const source = await iconPicker();
    if (source == null || source === "") {
      return;
    }
    setIconSaving(true);
    setError(null);
    try {
      await onIcon(project.path, source);
    } catch (error) {
      setError(t("settings.projectIconFailed", { error: String(error) }));
    } finally {
      setIconSaving(false);
    }
  }

  async function clearIcon() {
    if (!project) {
      return;
    }
    setIconSaving(true);
    setError(null);
    try {
      await onIcon(project.path, null);
    } catch (error) {
      setError(t("settings.projectIconFailed", { error: String(error) }));
    } finally {
      setIconSaving(false);
    }
  }

  async function saveAgentDefaults(
    providerId: string | null,
    modelId: string | null,
    reasoningEffort: string | null
  ) {
    if (!project) {
      return;
    }
    setAgentSaving(true);
    setError(null);
    try {
      await onAgentDefaults(project.path, providerId, modelId, reasoningEffort);
    } catch (error) {
      setError(t("settings.projectSaveFailed", { error: String(error) }));
    } finally {
      setAgentSaving(false);
    }
  }

  async function removeProject() {
    if (!project) {
      return;
    }
    if (
      !(await confirmNative(
        t("settings.removeProjectConfirm", { name: project.name })
      ))
    ) {
      return;
    }
    setProfileSaving(true);
    setError(null);
    try {
      await onRemove(project.path);
    } catch (error) {
      setError(t("settings.projectSaveFailed", { error: String(error) }));
    } finally {
      setProfileSaving(false);
    }
  }

  const projectDefaultProvider = project?.default_provider ?? null;
  const projectDefaultModels =
    projectDefaultProvider != null && projectDefaultProvider !== ""
      ? (providers.find((candidate) => candidate.id === projectDefaultProvider)
          ?.models ?? [])
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
              className="text-body w-full"
              onInput={(event) => setNameDraft(event.currentTarget.value)}
              onBlur={() => void saveName()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  setNameDraft(project.name);
                  event.currentTarget.blur();
                }
              }}
            />
          </ProjectRow>
          <ProjectRow
            label={t("settings.projectIcon")}
            hint={
              project.has_icon === true
                ? t("settings.projectIconCustom")
                : t("settings.projectIconAutomatic")
            }
          >
            <div
              data-project-icon-picker
              className="h-control-field rounded-control bg-fill-rest flex w-full items-stretch overflow-hidden"
            >
              <Button
                type="button"
                variant="ghost"
                size="row"
                focusStyle="inset"
                className="group min-w-0 flex-1 px-2"
                disabled={iconSaving}
                onClick={() => void chooseIcon()}
              >
                <ProjectIcon
                  project={project}
                  size={24}
                  className="bg-background/70"
                />
                <span className="text-body min-w-0 flex-1 truncate font-medium">
                  {project.has_icon === true
                    ? t("settings.projectIconChange")
                    : t("settings.projectIconChoose")}
                </span>
                <ImagePlus className="text-muted-foreground group-hover:text-foreground size-4 transition-colors" />
              </Button>
              {project.has_icon === true ? (
                <>
                  <span
                    className="bg-foreground/10 my-2 w-px shrink-0"
                    aria-hidden="true"
                  />
                  <TooltipButton
                    label={t("settings.projectIconRemove")}
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground mx-1 my-auto"
                    disabled={iconSaving}
                    onClick={() => void clearIcon()}
                  >
                    <Trash2 />
                  </TooltipButton>
                </>
              ) : null}
            </div>
          </ProjectRow>
          {error != null && error !== "" ? (
            <p className="project-settings-error text-metadata text-destructive pt-1">
              {error}
            </p>
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
                  null
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
                  {projectDefaultProvider != null &&
                  projectDefaultProvider !== "" ? (
                    <>
                      <ProviderIcon
                        provider={projectDefaultProvider}
                        className="size-4"
                      />
                      {providerNames[projectDefaultProvider] ??
                        projectDefaultProvider}
                    </>
                  ) : (
                    t("settings.projectProviderAutomatic")
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectGroup>
                  <SelectItem value="automatic">
                    {t("settings.projectProviderAutomatic")}
                  </SelectItem>
                  {providers.map((candidate) => (
                    <SelectItem
                      key={candidate.id}
                      value={candidate.id}
                      disabled={!candidate.available}
                    >
                      <ProviderIcon
                        provider={candidate.id}
                        className="size-4"
                      />
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
              {projectDefaultProvider != null &&
              projectDefaultProvider !== "" &&
              projectDefaultModels.length > 0 ? (
                <div className="rounded-control bg-fill-rest flex min-w-0 items-center px-1">
                  <ModelPicker
                    models={projectDefaultModels}
                    current={project.default_model ?? null}
                    defaultModel={null}
                    provider={projectDefaultProvider}
                    onModel={(model) => {
                      void saveAgentDefaults(
                        projectDefaultProvider,
                        model,
                        project.default_reasoning_effort ?? null
                      );
                    }}
                    configOptions={[]}
                    onConfigOption={() => {}}
                    hasSession={false}
                  />
                  {project.default_model != null &&
                  project.default_model !== "" ? (
                    <TooltipButton
                      label={t("settings.projectModelReset")}
                      variant="ghost"
                      size="icon-xs"
                      className="ms-auto"
                      disabled={agentSaving}
                      onClick={() =>
                        void saveAgentDefaults(
                          projectDefaultProvider,
                          null,
                          project.default_reasoning_effort ?? null
                        )
                      }
                    >
                      <RotateCcw />
                    </TooltipButton>
                  ) : null}
                </div>
              ) : (
                <span className="h-control-field rounded-control bg-fill-rest text-metadata text-muted-foreground col-span-2 flex min-w-0 items-center px-3">
                  {t("settings.projectModelDefault")}
                </span>
              )}
              {projectDefaultProvider != null &&
              projectDefaultProvider !== "" ? (
                <Select
                  disabled={agentSaving}
                  value={project.default_reasoning_effort ?? "automatic"}
                  onValueChange={(value) => {
                    void saveAgentDefaults(
                      projectDefaultProvider,
                      project.default_model ?? null,
                      value === "automatic" ? null : value
                    );
                  }}
                >
                  <SelectTrigger
                    aria-label={t("settings.projectReasoning")}
                    size="sm"
                    className="w-full justify-between"
                  >
                    <SelectValue>
                      {project.default_reasoning_effort != null &&
                      project.default_reasoning_effort !== ""
                        ? t(
                            `effort.${project.default_reasoning_effort}` as StringKey
                          )
                        : t("settings.projectModelDefault")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent position="popper" align="end">
                    <SelectGroup>
                      <SelectItem value="automatic">
                        {t("settings.projectModelDefault")}
                      </SelectItem>
                      {reasoningEfforts.map((effort) => (
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
                  value === "inherit" ? null : (value as ProjectWorktreeMode)
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
                  <SelectItem value="inherit">
                    {t("settings.projectWorkspaceInherit")}
                  </SelectItem>
                  <SelectItem value="local">
                    {t("settings.projectWorkspaceLocal")}
                  </SelectItem>
                  <SelectItem value="current">
                    {t("settings.projectWorkspaceCurrent")}
                  </SelectItem>
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
                const isEnabled = checked;
                setSchedulingEnabled(isEnabled);
                setError(null);
                void setProjectScheduling(project.path, isEnabled).catch(
                  (error) => {
                    setSchedulingEnabled(!isEnabled);
                    setError(
                      t("settings.projectSaveFailed", { error: String(error) })
                    );
                  }
                );
              }}
            />
          </ProjectRow>

          <GroupHeading>{t("settings.projectCheckout")}</GroupHeading>
          <ProjectRow
            label={t("settings.projectPath")}
            hint={t("settings.projectPathHint")}
          >
            <div className="h-control-field rounded-control bg-fill-rest flex w-full min-w-0 items-center overflow-hidden">
              <span
                className="text-callout text-muted-foreground min-w-0 flex-1 truncate px-3 font-mono"
                title={project.path}
              >
                {project.path}
              </span>
              <TooltipButton
                label={t("settings.projectPathCopy")}
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(project.path)
                    .catch((error) => {
                      setError(
                        t("settings.projectSaveFailed", {
                          error: String(error),
                        })
                      );
                    });
                }}
              >
                <Copy />
              </TooltipButton>
              <TooltipButton
                label={t("settings.projectPathReveal")}
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                onClick={() => {
                  void openNativePath(project.path)
                    .then((opened) => {
                      if (!opened) {
                        throw new Error(
                          t("settings.projectPathRevealUnavailable")
                        );
                      }
                    })
                    .catch((error) => {
                      setError(
                        t("settings.projectSaveFailed", {
                          error: String(error),
                        })
                      );
                    });
                }}
              >
                <FolderOpen />
              </TooltipButton>
            </div>
          </ProjectRow>

          <GroupHeading>{t("settings.projectActions")}</GroupHeading>
          <ProjectRow
            label={t("settings.projectActions")}
            hint={
              actionsCount === 0
                ? t("settings.projectActionsEmpty")
                : t("settings.projectActionsCount", { count: actionsCount })
            }
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
        <p className="text-body text-muted-foreground py-6">
          {t("settings.projectNone")}
        </p>
      )}
    </Page>
  );
}
