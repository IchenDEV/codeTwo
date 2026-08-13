import { useState } from "react";
import { ChevronDown, Clapperboard, Copy, Download, ListChecks, Pencil, Plus, RotateCcw, Route, Settings2 } from "lucide-react";

import type { SessionConfig } from "./config";
import { sceneTitle, type SceneInfo, type SceneSource } from "./scene";
import { exportSceneSkillMd, type ConfigOptionInfo, type ModelChoice } from "../bridge";
import { useToast } from "../ui/toast";
import type { ContextWindow } from "./contextWindow";
import {
  Chip,
  MemoryPicker,
  MenuRow,
  ModelPicker,
  ModePicker,
  ProviderPicker,
  WorktreePicker,
} from "./Composer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage, useT } from "../i18n";
import { cn } from "@/lib/utils";

/** Source pill naming where the scene came from (builtin / user / project / plugin). */
export function SourceBadge({ source }: { source: SceneSource }) {
  const t = useT();
  return (
    <Badge variant="outline" className="shrink-0 text-cap text-muted-foreground">
      {t(`scene.source.${source}` as "scene.source.builtin")}
    </Badge>
  );
}

/**
 * The one chip that collapsed the posture row (docs/scenes.md §UI contract). Opening it shows the
 * scene list plus the individual posture pickers unchanged; manual overrides mark the chip
 * "customized" without mutating the scene definition.
 */
export function SceneChip({
  config,
  models,
  currentModel,
  defaultModel,
  onModel,
  configOptions,
  onConfigOption,
}: {
  config: SessionConfig;
  models: ModelChoice[];
  currentModel: string | null;
  defaultModel: string | null;
  onModel: (id: string) => void;
  configOptions: ConfigOptionInfo[];
  onConfigOption: (configId: string, value: string) => void;
  /** Unused here (the context gauge stays in the row); kept so the row passes one props bag. */
  contextWindow?: ContextWindow | null;
}) {
  const t = useT();
  const { locale } = useLanguage();
  const [open, setOpen] = useState(false);
  const active = config.activeScene;
  const sceneLabel = active ? sceneTitle(active, locale) : t("scene.none");
  const label = config.autoScene
    ? active
      ? t("scene.autoActive", { scene: sceneLabel })
      : t("scene.auto")
    : sceneLabel;
  const partial = config.scenePendingFields.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Chip
          title={t("scene.chip")}
          aria-label={`${t("scene.chip")}: ${label}`}
          className={cn((active || config.autoScene) && "text-foreground")}
        >
          <Clapperboard className="size-3.5 shrink-0" />
          <span className="max-w-36 truncate">{label}</span>
          {config.sceneCustomized && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-warning"
              title={t("scene.customized")}
              aria-label={t("scene.customized")}
            />
          )}
          {partial && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-primary"
              title={t("scene.partial")}
              aria-label={t("scene.partial")}
            />
          )}
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </Chip>}
      />
      <PopoverContent
        align="start"
        side="top"
        size="wide"
        className="p-2"
      >
        <div className="@container/composer">
          <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5">
            <span className="min-w-0 flex-1 truncate text-hint text-muted-foreground">
              {t("scene.chip")}
            </span>
            {active && <SourceBadge source={active.source} />}
            {config.autoScene && <Badge variant="secondary">{t("scene.auto")}</Badge>}
            {config.sceneCustomized && (
              <Badge variant="outline" className="shrink-0 text-cap text-warning">
                {t("scene.customized")}
              </Badge>
            )}
          </div>

          <MenuRow
            selected={config.autoScene}
            isDefault={false}
            label={t("scene.auto")}
            detail={t("scene.autoHint")}
            detailWrap
            leading={<Route aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            onClick={() => {
              config.onAutoScene(true);
              setOpen(false);
            }}
          />
          <MenuRow
            selected={active === null && !config.autoScene}
            isDefault={false}
            label={t("scene.none")}
            detail={t("scene.noneHint")}
            detailWrap
            onClick={() => {
              config.onAutoScene(false);
              config.onScene(null, "soft");
              setOpen(false);
            }}
          />
          {config.scenes.map((scene) => (
            <MenuRow
              key={scene.reference}
              selected={!config.autoScene && active?.reference === scene.reference}
              isDefault={false}
              label={sceneTitle(scene, locale)}
              detail={scene.localizations[locale]?.description ?? scene.description}
              detailWrap
              leading={<SourceBadge source={scene.source} />}
              onClick={() => {
                config.onAutoScene(false);
                config.onScene(scene.reference, "soft");
                setOpen(false);
              }}
            />
          ))}

          <Button
            type="button"
            variant="ghost"
            className="mt-1 w-full justify-start text-muted-foreground"
            onClick={() => {
              setOpen(false);
              config.onManageScenes();
            }}
          >
            <Settings2 data-icon="inline-start" />
            {t("sceneEditor.manage")}
          </Button>

          <div className="mx-2 my-1.5 h-px bg-border" />

          {/* Every posture override keeps its current value visible, even when this row wraps. */}
          <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1">
            <ProviderPicker config={config} />
            <ModelPicker
              models={models}
              current={currentModel}
              defaultModel={defaultModel}
              provider={config.provider}
              onModel={onModel}
              configOptions={configOptions}
              onConfigOption={onConfigOption}
              hasSession={config.hasSession}
            />
            <ModePicker config={config} />
            <MemoryPicker config={config} />
            <Chip
              title={t("config.planFirstHint")}
              aria-pressed={config.planMode}
              aria-label={t(config.planMode ? "config.planFirstOn" : "config.planFirstOff")}
              className={cn(config.planMode && "text-primary hover:text-primary")}
              onClick={() => config.onPlan(!config.planMode)}
            >
              <ListChecks className="size-3.5 shrink-0" />
              <span>{t(config.planMode ? "config.planFirstOn" : "config.planFirstOff")}</span>
            </Chip>
            <WorktreePicker config={config} />
          </div>

          {partial && (
            <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5">
              <span className="min-w-0 flex-1 text-fine text-muted-foreground">
                {t("scene.partialHint", { fields: config.scenePendingFields.join(", ") })}
              </span>
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setOpen(false);
                  config.onRestartInScene();
                }}
              >
                <RotateCcw className="size-3.5" />
                {t("scene.restart")}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Full scene picker dialog: every resolved scene with description and source badge. */
export function ScenePicker({
  scenes,
  active,
  auto,
  onAuto,
  onScene,
  onCreate,
  onEdit,
  onDuplicate,
  onClose,
}: {
  scenes: SceneInfo[];
  active: SceneInfo | null;
  auto: boolean;
  onAuto: (enabled: boolean) => void;
  onScene: (reference: string | null) => void;
  onCreate: () => void;
  onEdit: (scene: SceneInfo) => void;
  onDuplicate: (scene: SceneInfo) => void;
  onClose: () => void;
}) {
  const t = useT();
  const { locale } = useLanguage();
  const toast = useToast();
  // Lossy SKILL.md export (docs/scenes.md §Interop), downloaded as a Blob through a transient
  // anchor — deliberately no Tauri save-dialog plumbing for a plain text file.
  const exportSkill = async (scene: SceneInfo) => {
    const md = await exportSceneSkillMd(scene.reference);
    if (md === null) return;
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${scene.name}-SKILL.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast(t("scene.exportSkillDone", { name: scene.name }), "success");
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle>{t("scene.pickerTitle")}</DialogTitle>
            <Button type="button" variant="outline" size="sm" onClick={onCreate}>
              <Plus data-icon="inline-start" />
              {t("sceneEditor.create")}
            </Button>
          </div>
          <DialogDescription>{t("scene.pickerHint")}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-96 flex-col gap-0.5 overflow-y-auto">
          <MenuRow
            selected={auto}
            isDefault={false}
            label={t("scene.auto")}
            detail={t("scene.autoHint")}
            detailWrap
            leading={<Route aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            onClick={() => {
              onAuto(true);
              onClose();
            }}
          />
          <MenuRow
            selected={active === null && !auto}
            isDefault={false}
            label={t("scene.none")}
            detail={t("scene.noneHint")}
            detailWrap
            onClick={() => {
              onAuto(false);
              onScene(null);
              onClose();
            }}
          />
          {scenes.map((scene) => (
            <div key={scene.reference} className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <MenuRow
                  selected={!auto && active?.reference === scene.reference}
                  isDefault={false}
                  label={sceneTitle(scene, locale)}
                  detail={scene.localizations[locale]?.description ?? scene.description}
                  detailWrap
                  leading={<SourceBadge source={scene.source} />}
                  onClick={() => {
                    onAuto(false);
                    onScene(scene.reference);
                    onClose();
                  }}
                />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground"
                title={t("sceneEditor.duplicate")}
                aria-label={`${t("sceneEditor.duplicate")}: ${sceneTitle(scene, locale)}`}
                onClick={() => onDuplicate(scene)}
              >
                <Copy />
              </Button>
              {(scene.source === "user" || scene.source === "project") && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground"
                  title={t("sceneEditor.edit")}
                  aria-label={`${t("sceneEditor.edit")}: ${sceneTitle(scene, locale)}`}
                  onClick={() => onEdit(scene)}
                >
                  <Pencil />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground"
                title={t("scene.exportSkill")}
                aria-label={t("scene.exportSkill")}
                onClick={() => void exportSkill(scene)}
              >
                <Download />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The escalation confirmation (docs/scenes.md §Security): a scene may never loosen permissions
 * silently — this dialog names both modes and the user decides.
 */
export function SceneEscalationDialog({
  sceneLabel,
  from,
  to,
  onConfirm,
  onCancel,
}: {
  sceneLabel: string;
  from: string;
  to: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const modeName = (m: string) => t(`mode.${m}` as "mode.ask");
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("scene.escalationTitle")}</DialogTitle>
          <DialogDescription>
            {t("scene.escalationBody", {
              scene: sceneLabel,
              from: modeName(from),
              to: modeName(to),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {t("scene.escalationCancel")}
          </Button>
          <Button onClick={onConfirm}>{t("scene.escalationConfirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
