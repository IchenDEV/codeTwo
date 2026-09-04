import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { SettingToggle } from "@/components/business/setting-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { MessageSquareText, Play } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import type { KeymapEntry, ProjectScript } from "../bridge";
import { useT } from "../i18n";
import { comboFromEvent, formatCombo, isModifierOnly } from "../keys";
import { projectActionId, projectActionIssue } from "./projectActions";
import type { ProjectActionDraft } from "./projectActions";

const emptyAction: ProjectActionDraft = {
  command: "",
  keybinding: "",
  kind: "command",
  name: "",
  open_preview: false,
  preview_url: "",
  prompt: "",
  run_on_worktree_create: false,
};

export function ProjectActionDialog({
  open,
  actions,
  bindings,
  onOpenChange,
  onSave,
}: {
  readonly open: boolean;
  readonly actions: ProjectScript[];
  readonly bindings: KeymapEntry[];
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly onSave: (action: ProjectScript) => Promise<void>;
}) {
  const t = useT();
  const [draft, setDraft] = useState<ProjectActionDraft>(emptyAction);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft(emptyAction);
    setSubmitted(false);
    setSaving(false);
    setSaveError(null);
  }, [open]);

  const validation = projectActionIssue(draft, bindings, actions);
  let validationMessage: string | null = null;
  switch (validation?.issue) {
    case "name_required": {
      validationMessage = t("actionDialog.nameRequired");
      break;
    }
    case "command_required": {
      validationMessage = t("actionDialog.commandRequired");
      break;
    }
    case "prompt_required": {
      validationMessage = t("actionDialog.promptRequired");
      break;
    }
    case "preview_invalid": {
      validationMessage = t("actionDialog.previewInvalid");
      break;
    }
    case "keybinding_conflict": {
      validationMessage = t("actionDialog.keybindingConflict", {
        name: validation.conflict ?? "",
      });
      break;
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setSaveError(null);
    if (validation) {
      return;
    }
    setSaving(true);
    try {
      await onSave({
        command: draft.command.trim(),
        id: projectActionId(draft.name, actions),
        keybinding: draft.keybinding,
        kind: draft.kind,
        name: draft.name.trim(),
        open_preview: Boolean(draft.preview_url.trim()) && draft.open_preview,
        preview_url: draft.preview_url.trim(),
        prompt: draft.prompt.trim(),
        run_on_worktree_create: draft.run_on_worktree_create,
      });
      onOpenChange(false);
    } catch (error) {
      setSaveError(t("actionDialog.saveFailed", { error: String(error) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-dvh overflow-y-auto sm:max-w-lg">
        <form className="flex min-h-0 flex-col gap-5" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("actionDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("actionDialog.description")}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel>{t("actionDialog.kind")}</FieldLabel>
              <Tabs
                value={draft.kind}
                onValueChange={(kind) =>
                  setDraft((current) => ({
                    ...current,
                    kind: kind as ProjectActionDraft["kind"],
                    open_preview: kind === "command" && current.open_preview,
                    run_on_worktree_create:
                      kind === "command" && current.run_on_worktree_create,
                  }))
                }
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="command">
                    <Play aria-hidden />
                    {t("actionDialog.kindCommand")}
                  </TabsTrigger>
                  <TabsTrigger value="prompt">
                    <MessageSquareText aria-hidden />
                    {t("actionDialog.kindPrompt")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <FieldDescription>
                {t(
                  draft.kind === "prompt"
                    ? "actionDialog.kindPromptHint"
                    : "actionDialog.kindCommandHint"
                )}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="action-name">
                {t("actionDialog.name")}
              </FieldLabel>
              <div className="flex gap-2">
                <div className="rounded-control bg-fill-quiet text-muted-foreground grid size-9 shrink-0 place-items-center">
                  {draft.kind === "prompt" ? (
                    <MessageSquareText className="size-4" aria-hidden />
                  ) : (
                    <Play className="size-4" aria-hidden />
                  )}
                </div>
                <Input
                  id="action-name"
                  autoFocus
                  value={draft.name}
                  placeholder={t("actionDialog.namePlaceholder")}
                  aria-invalid={
                    submitted
                      ? validation?.issue === "name_required"
                      : undefined
                  }
                  onInput={(event) => {
                    const name = event.currentTarget.value;
                    setDraft((current) => ({ ...current, name }));
                  }}
                />
              </div>
            </Field>

            <Field>
              <FieldLabel>{t("actionDialog.keybinding")}</FieldLabel>
              <Button
                type="button"
                variant="outline"
                size="field"
                className="w-full justify-start font-normal"
                aria-label={t("actionDialog.keybinding")}
                onKeyDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (isModifierOnly(event.nativeEvent)) {
                    return;
                  }
                  if (event.key === "Backspace" || event.key === "Delete") {
                    setDraft((current) => ({ ...current, keybinding: "" }));
                    return;
                  }
                  const keybinding = comboFromEvent(event.nativeEvent);
                  setDraft((current) => ({ ...current, keybinding }));
                }}
              >
                {draft.keybinding ? (
                  formatCombo(draft.keybinding)
                ) : (
                  <span className="text-muted-foreground">
                    {t("actionDialog.keybindingPlaceholder")}
                  </span>
                )}
              </Button>
              <FieldDescription>
                {t("actionDialog.keybindingHint")}
              </FieldDescription>
            </Field>

            {draft.kind === "prompt" ? (
              <Field>
                <FieldLabel htmlFor="action-prompt">
                  {t("actionDialog.prompt")}
                </FieldLabel>
                <Textarea
                  id="action-prompt"
                  className="min-h-32"
                  value={draft.prompt}
                  placeholder={t("actionDialog.promptPlaceholder")}
                  aria-invalid={
                    submitted
                      ? validation?.issue === "prompt_required"
                      : undefined
                  }
                  onInput={(event) => {
                    const prompt = event.currentTarget.value;
                    setDraft((current) => ({ ...current, prompt }));
                  }}
                />
                <FieldDescription>
                  {t("actionDialog.promptHint")}
                </FieldDescription>
              </Field>
            ) : (
              <>
                <Field>
                  <FieldLabel htmlFor="action-command">
                    {t("actionDialog.command")}
                  </FieldLabel>
                  <Textarea
                    id="action-command"
                    className="min-h-20 font-mono"
                    value={draft.command}
                    placeholder={t("actionDialog.commandPlaceholder")}
                    aria-invalid={
                      submitted
                        ? validation?.issue === "command_required"
                        : undefined
                    }
                    onInput={(event) => {
                      const command = event.currentTarget.value;
                      setDraft((current) => ({ ...current, command }));
                    }}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="action-preview-url">
                    {t("actionDialog.previewUrl")}
                  </FieldLabel>
                  <Input
                    id="action-preview-url"
                    type="url"
                    value={draft.preview_url}
                    placeholder={t("actionDialog.previewPlaceholder")}
                    aria-invalid={
                      submitted
                        ? validation?.issue === "preview_invalid"
                        : undefined
                    }
                    onInput={(event) => {
                      const preview_url = event.currentTarget.value;
                      setDraft((current) => ({
                        ...current,
                        open_preview: preview_url
                          ? current.open_preview
                          : false,
                        preview_url,
                      }));
                    }}
                  />
                  <FieldDescription>
                    {t("actionDialog.previewHint")}
                  </FieldDescription>
                </Field>

                <div className="flex flex-col gap-2">
                  <SettingToggle
                    label={t("actionDialog.runOnWorktree")}
                    checked={draft.run_on_worktree_create}
                    onCheckedChange={(run_on_worktree_create) =>
                      setDraft((current) => ({
                        ...current,
                        run_on_worktree_create,
                      }))
                    }
                  />
                  <SettingToggle
                    label={t("actionDialog.openPreview")}
                    checked={draft.open_preview}
                    disabled={!draft.preview_url.trim()}
                    onCheckedChange={(open_preview) =>
                      setDraft((current) => ({ ...current, open_preview }))
                    }
                  />
                </div>
              </>
            )}
          </FieldGroup>

          {saveError ||
          (submitted &&
            validationMessage != null &&
            validationMessage !== "") ? (
            <FieldError>{saveError ?? validationMessage}</FieldError>
          ) : null}

          <DialogFooter className="bg-fill-quiet -mx-6 -mb-6 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("actionDialog.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("actionDialog.saving") : t("actionDialog.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
