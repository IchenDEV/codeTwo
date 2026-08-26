import { ArrowLeft, Clapperboard, Copy, Download, Pencil, Plus } from "@/components/ui/icons";

import {
  exportSceneSkillMd,
  type ProviderInfo,
  type SkillInfo,
} from "../bridge";
import { useLanguage, useT } from "../i18n";
import { useToast } from "../ui/toast";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { SceneEditor, type SceneEditorRequest } from "./SceneEditor";
import { SourceBadge } from "./SceneChip";
import { sceneTitle, type SceneInfo } from "./scene";

function SceneCard({
  scene,
  active,
  onScene,
  onEdit,
  onDuplicate,
}: {
  scene: SceneInfo;
  active: boolean;
  onScene: (reference: string) => void;
  onEdit: (scene: SceneInfo) => void;
  onDuplicate: (scene: SceneInfo) => void;
}) {
  const t = useT();
  const { locale } = useLanguage();
  const toast = useToast();
  const editable = scene.source === "user" || scene.source === "project";
  const description = scene.localizations[locale]?.description ?? scene.description;

  const exportSkill = async () => {
    const markdown = await exportSceneSkillMd(scene.reference);
    if (markdown === null) return;
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${scene.name}-SKILL.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast(t("scene.exportSkillDone", { name: scene.name }), "success");
  };

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="gap-2 px-5">
        <CardTitle className="truncate text-ui">{sceneTitle(scene, locale)}</CardTitle>
        <CardDescription className="line-clamp-2 leading-relaxed">
          {description || t("sceneStudio.noDescription")}
        </CardDescription>
        <CardAction>
          <SourceBadge source={scene.source} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-1.5 px-5">
        {scene.execution?.session_mode && (
          <Badge variant="secondary">{t(`mode.${scene.execution.session_mode}` as never)}</Badge>
        )}
        {scene.has_brief && <Badge variant="outline">{t("sceneStudio.taskBrief")}</Badge>}
        {scene.artifacts.length > 0 && (
          <Badge variant="outline">{t("sceneStudio.outputs", { count: scene.artifacts.length })}</Badge>
        )}
      </CardContent>
      <CardFooter className="flex-wrap gap-1.5 px-5">
        {active ? (
          <Button type="button" size="sm" variant="secondary" disabled>
            {t("sceneStudio.active")}
          </Button>
        ) : (
          <Button type="button" size="sm" variant="secondary" onClick={() => onScene(scene.reference)}>
            {t("sceneStudio.use")}
          </Button>
        )}
        {editable && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(scene)}>
            <Pencil data-icon="inline-start" />
            {t("sceneEditor.edit")}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => onDuplicate(scene)}>
          <Copy data-icon="inline-start" />
          {t("sceneEditor.duplicate")}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`${t("scene.exportSkill")}: ${sceneTitle(scene, locale)}`}
          title={t("scene.exportSkill")}
          onClick={() => void exportSkill()}
        >
          <Download />
        </Button>
      </CardFooter>
    </Card>
  );
}

export function SceneStudio({
  scenes,
  active,
  request,
  providers,
  skills,
  cwd,
  onRequest,
  onScene,
  onSaved,
  onDeleted,
  onClose,
}: {
  scenes: SceneInfo[];
  active: SceneInfo | null;
  request: SceneEditorRequest | null;
  providers: ProviderInfo[];
  skills: SkillInfo[];
  cwd: string;
  onRequest: (request: SceneEditorRequest | null) => void;
  onScene: (reference: string) => void;
  onSaved: (scene: SceneInfo) => void;
  onDeleted: (reference: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const customScenes = scenes.filter((scene) => scene.source === "user" || scene.source === "project");
  const providedScenes = scenes.filter((scene) => scene.source !== "user" && scene.source !== "project");
  const goBack = request ? () => onRequest(null) : onClose;

  const renderGroup = (title: string, description: string, items: SceneInfo[]) => {
    if (items.length === 0) return null;
    return (
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-title font-semibold">{title}</h2>
          <p className="text-hint leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {items.map((scene) => (
            <SceneCard
              key={scene.reference}
              scene={scene}
              active={scene.reference === active?.reference}
              onScene={onScene}
              onEdit={(next) => onRequest({ kind: "edit", scene: next })}
              onDuplicate={(next) => onRequest({ kind: "duplicate", scene: next })}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="animate-page-in flex min-h-0 min-w-0 flex-1 flex-col bg-background" data-page="scene-studio">
      <header className="window-controls-safe-scene electrobun-webkit-app-region-drag flex shrink-0 items-center gap-2 py-1.5 pr-3">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={request ? t("sceneStudio.backToLibrary") : t("sceneStudio.back")} onClick={goBack}>
          <ArrowLeft />
        </Button>
        <Clapperboard className="size-4 text-muted-foreground" />
        <span className="electrobun-webkit-app-region-drag text-ui font-medium">{t("sceneStudio.title")}</span>
        {request && (
          <>
            <span className="electrobun-webkit-app-region-drag text-muted-foreground/50">/</span>
            <span className="electrobun-webkit-app-region-drag truncate text-ui text-muted-foreground">
              {request.kind === "edit" ? request.scene.title : request.kind === "duplicate" ? t("sceneEditor.duplicateTitle") : t("sceneEditor.createTitle")}
            </span>
          </>
        )}
        <div className="electrobun-webkit-app-region-drag flex-1" />
        {!request && (
          <Button type="button" size="sm" onClick={() => onRequest({ kind: "create" })}>
            <Plus data-icon="inline-start" />
            {t("sceneEditor.create")}
          </Button>
        )}
      </header>
      <Separator />

      {request ? (
        <SceneEditor
          key={request.kind === "create" ? "create" : `${request.kind}:${request.scene.reference}`}
          request={request}
          scenes={scenes}
          providers={providers}
          skills={skills}
          cwd={cwd}
          onSaved={onSaved}
          onDeleted={onDeleted}
          onClose={() => onRequest(null)}
        />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-8 pb-20 pt-10">
            <div className="flex max-w-2xl flex-col gap-2">
              <h1 className="text-display font-semibold tracking-tight">{t("sceneStudio.title")}</h1>
              <p className="text-ui leading-relaxed text-muted-foreground">{t("sceneStudio.description")}</p>
            </div>

            {renderGroup(t("sceneStudio.customTitle"), t("sceneStudio.customDescription"), customScenes)}
            {renderGroup(t("sceneStudio.providedTitle"), t("sceneStudio.providedDescription"), providedScenes)}
          </main>
        </ScrollArea>
      )}
    </div>
  );
}
