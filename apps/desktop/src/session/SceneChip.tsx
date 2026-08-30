import { useState } from "react";
import { ChevronDown, Clapperboard, Copy, Download, Pencil, Plus, RotateCcw, Route, Settings2 } from "@/components/ui/icons";

import type { SessionConfig } from "./config";
import { sceneTitle, type SceneInfo, type SceneSource } from "./scene";
import { exportSceneSkillMd } from "../bridge";
import { useToast } from "../ui/toast";
import { ControlChip as Chip } from "@/components/ui/control-chip";
import { SelectableRow } from "@/components/business/selectable-row";
import { StatusBadge } from "@/components/business/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TooltipButton } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
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
    <Badge variant="outline" className="shrink-0 text-metadata text-muted-foreground">
      {t(`scene.source.${source}` as "scene.source.builtin")}
    </Badge>
  );
}

/**
 * Scene selection stays distinct from the session configuration row. Manual overrides still mark
 * the chip "customized" without mutating the scene definition.
 */
export function SceneChip({ config }: { config: SessionConfig }) {
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
  const surfaceLabel = t("scene.chip");
  const partial = config.scenePendingFields.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Chip
          title={surfaceLabel}
          aria-label={`${surfaceLabel}: ${label}`}
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
        className="max-h-(--available-height) w-96 max-w-(--available-width) overflow-y-auto p-2"
      >
        <div className="@container/composer">
          <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5">
            <span className="min-w-0 flex-1 truncate text-metadata text-muted-foreground">
              {surfaceLabel}
            </span>
            {config.scenesEnabled && active && <SourceBadge source={active.source} />}
            {config.autoScene && <Badge variant="secondary">{t("scene.auto")}</Badge>}
            {config.sceneCustomized && (
              <StatusBadge tone="warning">
                {t("scene.customized")}
              </StatusBadge>
            )}
          </div>

          <SelectableRow
            selected={config.autoScene}
            label={t("scene.auto")}
            description={t("scene.autoHint")}
            leading={<Route aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            onSelect={() => {
              config.onAutoScene(true);
              setOpen(false);
            }}
          />
          <SelectableRow
            selected={active === null && !config.autoScene}
            label={t("scene.none")}
            description={t("scene.noneHint")}
            onSelect={() => {
              config.onAutoScene(false);
              config.onScene(null, "soft");
              setOpen(false);
            }}
          />
          {config.scenes.map((scene) => (
            <SelectableRow
              key={scene.reference}
              selected={!config.autoScene && active?.reference === scene.reference}
              label={sceneTitle(scene, locale)}
              description={scene.localizations[locale]?.description ?? scene.description}
              leading={<SourceBadge source={scene.source} />}
              onSelect={() => {
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

          {partial && (
            <>
              <Separator className="mx-2 my-1.5 w-auto" />
              <div className="flex items-center gap-1.5 px-2 pb-1 pt-0.5">
                <span className="min-w-0 flex-1 text-callout text-muted-foreground">
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
            </>
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
  // Lossy SKILL.md export (docs/reference/scenes.md §Interop), downloaded as a Blob through a transient
  // anchor — deliberately no native save-dialog plumbing for a plain text file.
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
          <SelectableRow
            selected={auto}
            label={t("scene.auto")}
            description={t("scene.autoHint")}
            leading={<Route aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            onSelect={() => {
              onAuto(true);
              onClose();
            }}
          />
          <SelectableRow
            selected={active === null && !auto}
            label={t("scene.none")}
            description={t("scene.noneHint")}
            onSelect={() => {
              onAuto(false);
              onScene(null);
              onClose();
            }}
          />
          {scenes.map((scene) => (
            <div key={scene.reference} className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <SelectableRow
                  selected={!auto && active?.reference === scene.reference}
                  label={sceneTitle(scene, locale)}
                  description={scene.localizations[locale]?.description ?? scene.description}
                  leading={<SourceBadge source={scene.source} />}
                  onSelect={() => {
                    onAuto(false);
                    onScene(scene.reference);
                    onClose();
                  }}
                />
              </div>
              <TooltipButton
                label={`${t("sceneEditor.duplicate")}: ${sceneTitle(scene, locale)}`}
                tooltip={t("sceneEditor.duplicate")}
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground"
                onClick={() => onDuplicate(scene)}
              >
                <Copy />
              </TooltipButton>
              {(scene.source === "user" || scene.source === "project") && (
                <TooltipButton
                  label={`${t("sceneEditor.edit")}: ${sceneTitle(scene, locale)}`}
                  tooltip={t("sceneEditor.edit")}
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground"
                  onClick={() => onEdit(scene)}
                >
                  <Pencil />
                </TooltipButton>
              )}
              <TooltipButton
                label={t("scene.exportSkill")}
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground"
                onClick={() => void exportSkill(scene)}
              >
                <Download />
              </TooltipButton>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The escalation confirmation (docs/reference/scenes.md §Security): a scene may never loosen permissions
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
