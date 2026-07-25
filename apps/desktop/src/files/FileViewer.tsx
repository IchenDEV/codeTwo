import { useCallback, useEffect, useState } from "react";
import { AtSign, Loader2, Pencil, Save, X } from "lucide-react";

import { readText, writeText } from "../bridge";
import { useT } from "../i18n";
import { useToast } from "../ui/toast";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The built-in file view.
 *
 * Read-only until you ask for otherwise. Opening a file to look at it is the common act and should
 * never risk changing it; editing is rarer, deliberate, and reached on purpose — from the tree's
 * context menu or the pencil here. That asymmetry is the whole design: a stray keystroke in a
 * viewer costs nothing.
 */
export function FileViewer({
  cwd,
  path,
  editing,
  onEditing,
  onClose,
  onInsert,
}: {
  cwd: string;
  path: string;
  editing: boolean;
  onEditing: (v: boolean) => void;
  onClose: () => void;
  onInsert: (path: string) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [content, setContent] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setContent(null);
    setError(null);
    readText(cwd, path)
      .then((text) => {
        setContent(text);
        setDraft(text);
      })
      .catch((e) => setError(String(e)));
  }, [cwd, path]);

  const dirty = editing && draft !== content;

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await writeText(cwd, path, draft);
      setContent(draft);
      onEditing(false);
      toast(t("files.saved", { path }), "success");
    } catch (e) {
      toast(String(e), "error");
    }
    setSaving(false);
  }, [cwd, path, draft, onEditing, toast, t]);

  return (
    <main className="content-surface flex min-w-0 flex-1 flex-col">
      <header data-tauri-drag-region className="flex items-center gap-2 px-4 pb-2 pt-7">
        <span data-tauri-drag-region className="min-w-0 flex-1 truncate font-mono text-[12px]">
          {path}
          {dirty && <span className="ml-1.5 text-warning">•</span>}
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => onInsert(path)}>
              <AtSign className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("files.insert")}</TooltipContent>
        </Tooltip>

        {editing ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => { setDraft(content ?? ""); onEditing(false); }}>
              {t("files.cancel")}
            </Button>
            <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              {t("files.save")}
            </Button>
          </>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={content === null}
                onClick={() => onEditing(true)}
              >
                <Pencil className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("files.edit")}</TooltipContent>
          </Tooltip>
        )}

        <Button variant="ghost" size="icon" className="size-8" aria-label={t("files.close")} onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>

      {error ? (
        <p className="px-6 py-4 text-[13px] text-destructive">{error}</p>
      ) : content === null ? (
        <p className="flex items-center gap-2 px-6 py-4 text-[13px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t("files.loading")}
        </p>
      ) : editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none bg-transparent px-6 pb-6 font-mono text-[12.5px] leading-relaxed outline-none"
        />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          {/* Line numbers make it a viewer rather than a wall of text, and cost one column. */}
          <div className="flex px-4 pb-6 font-mono text-[12.5px] leading-relaxed">
            <div className="select-none pr-3 text-right text-muted-foreground/50">
              {content.split("\n").map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words">{content}</pre>
          </div>
        </ScrollArea>
      )}
    </main>
  );
}
