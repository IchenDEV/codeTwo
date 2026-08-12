import { useState } from "react";
import { ChevronDown, Clapperboard, Download, ListChecks, RotateCcw } from "lucide-react";

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
  const label = active ? sceneTitle(active, locale) : t("scene.none");
  const partial = config.scenePendingFields.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip
          title={t("scene.chip")}
          aria-label={`${t("scene.chip")}: ${label}`}
          className={cn(active && "text-foreground")}
        >
          {active?.icon ? (
            <span className="shrink-0 text-ui leading-none" aria-hidden>
              {active.icon}
            </span>
          ) : (
            <Clapperboard className="size-3.5 shrink-0" />
          )}
          <span className="hidden @lg/composer:inline">{label}</span>
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
        </Chip>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-96 p-1.5"
        onInteractOutside={(e) => {
          // Nested Radix popovers (the pickers below) portal to <body>; interacting with them
          // must not close this shell.
          const target = e.target as HTMLElement | null;
          if (target?.closest("[data-radix-popper-content-wrapper]")) e.preventDefault();
        }}
      >
        {/* The pickers hide their labels via @container/composer queries; re-establish the
            container inside the portal so they render exactly as they do in the row. */}
        <div className="@container/composer">
          <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5">
            <span className="min-w-0 flex-1 truncate text-hint text-muted-foreground">
              {t("scene.chip")}
            </span>
            {active && <SourceBadge source={active.source} />}
            {config.sceneCustomized && (
              <Badge variant="outline" className="shrink-0 text-cap text-warning">
                {t("scene.customized")}
              </Badge>
            )}
          </div>

          <MenuRow
            selected={active === null}
            isDefault={false}
            label={t("scene.none")}
            detail={t("scene.noneHint")}
            onClick={() => {
              config.onScene(null, "soft");
              setOpen(false);
            }}
          />
          {config.scenes.map((scene) => (
            <MenuRow
              key={scene.reference}
              selected={active?.reference === scene.reference}
              isDefault={false}
              label={`${scene.icon ? `${scene.icon} ` : ""}${sceneTitle(scene, locale)}`}
              detail={scene.localizations[locale]?.description ?? scene.description}
              leading={<SourceBadge source={scene.source} />}
              onClick={() => {
                config.onScene(scene.reference, "soft");
                setOpen(false);
              }}
            />
          ))}

          <div className="mx-2 my-1.5 h-px bg-border" />

          {/* The posture pickers, unchanged: the scene sets them; the user can still override. */}
          <div className="flex flex-wrap items-center gap-1 px-1 pb-1">
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
              className={cn(config.planMode && "text-primary hover:text-primary")}
              onClick={() => config.onPlan(!config.planMode)}
            >
              <ListChecks className="size-3.5 shrink-0" />
              <span className="hidden @lg/composer:inline">{t("config.planFirst")}</span>
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
  onScene,
  onClose,
}: {
  scenes: SceneInfo[];
  active: SceneInfo | null;
  onScene: (reference: string | null) => void;
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("scene.pickerTitle")}</DialogTitle>
          <DialogDescription>{t("scene.pickerHint")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 space-y-0.5 overflow-y-auto">
          <MenuRow
            selected={active === null}
            isDefault={false}
            label={t("scene.none")}
            detail={t("scene.noneHint")}
            onClick={() => {
              onScene(null);
              onClose();
            }}
          />
          {scenes.map((scene) => (
            <div key={scene.reference} className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <MenuRow
                  selected={active?.reference === scene.reference}
                  isDefault={false}
                  label={`${scene.icon ? `${scene.icon} ` : ""}${sceneTitle(scene, locale)}`}
                  detail={scene.localizations[locale]?.description ?? scene.description}
                  leading={<SourceBadge source={scene.source} />}
                  onClick={() => {
                    onScene(scene.reference);
                    onClose();
                  }}
                />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground"
                title={t("scene.exportSkill")}
                aria-label={t("scene.exportSkill")}
                onClick={() => void exportSkill(scene)}
              >
                <Download className="size-3.5" />
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
