import { useCallback, useEffect, useRef, useState } from "react";
import { AtSign, ChevronRight, Loader2, MessageSquarePlus, Save } from "lucide-react";

import { readText, writeText } from "../bridge";
import { useT } from "../i18n";
import { useColorScheme } from "../theme";
import { useToast } from "../ui/toast";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type MonacoModule = typeof import("./monaco");
type Editor = import("monaco-editor").editor.IStandaloneCodeEditor;
type TextModel = import("monaco-editor").editor.ITextModel;

/** A pending "comment on these lines" card: the range is frozen when the card opens. */
interface Draft {
  startLine: number;
  endLine: number;
  note: string;
}

/**
 * The built-in file editor — a pane inside the right panel, under the file tabs.
 *
 * A real editor, not a viewer with an edit mode: Monaco (VS Code's editor component) with shiki's
 * TextMate highlighting and, where a language server is installed, full LSP — completions, hover,
 * diagnostics, go-to-definition (see ../lsp). Typing edits the buffer directly; ⌘S writes it to
 * disk, and the tab/breadcrumb dot carries the unsaved state, exactly like an IDE.
 *
 * The one thing kept from the viewer days: select lines and leave a comment, and the comment lands
 * in the prompt document as a context block — "look at these lines and do X" is still the whole
 * reason a coding agent's app has a file pane.
 */
export function FileViewer({
  cwd,
  path,
  onInsert,
  onOpen,
  onComment,
}: {
  cwd: string;
  path: string;
  onInsert: (path: string) => void;
  /** Open another workspace file in the pane — cross-file go-to-definition lands here. */
  onOpen: (path: string) => void;
  /** Receives a ready-made markdown context block for the prompt document. */
  onComment: (text: string) => void;
}) {
  const t = useT();
  const toast = useToast();
  const scheme = useColorScheme();
  const container = useRef<HTMLDivElement | null>(null);
  const [mod, setMod] = useState<MonacoModule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const editorRef = useRef<Editor | null>(null);
  const modelRef = useRef<TextModel | null>(null);
  const modRef = useRef<MonacoModule | null>(null);

  const save = useCallback(async () => {
    const m = modRef.current;
    const model = modelRef.current;
    if (!m || !model || !m.isDirtyModel(model)) return;
    setSaving(true);
    try {
      await writeText(cwd, path, model.getValue());
      m.markSaved(cwd, path, model);
      setDirty(false);
      m.notifySaved(cwd, model);
      toast(t("files.saved", { path }), "success");
    } catch (e) {
      toast(String(e), "error");
    }
    setSaving(false);
  }, [cwd, path, toast, t]);

  // The ⌘S binding lives inside Monaco and outlives any one render; give it a stable door.
  const saveRef = useRef(save);
  saveRef.current = save;

  /** Freeze the current selection into a comment card. Whole lines — comments read that way. */
  const openDraft = useCallback(() => {
    const editor = editorRef.current;
    const sel = editor?.getSelection();
    if (!editor || !sel || sel.isEmpty()) return;
    // A selection ending at column 1 stops *before* that line (the drag-past-newline case).
    const endLine =
      sel.endColumn === 1 && sel.endLineNumber > sel.startLineNumber
        ? sel.endLineNumber - 1
        : sel.endLineNumber;
    setDraft({ startLine: sel.startLineNumber, endLine, note: "" });
  }, []);
  const openDraftRef = useRef(openDraft);
  openDraftRef.current = openDraft;

  useEffect(() => {
    let alive = true;
    let editor: Editor | null = null;
    const disposables: { dispose(): void }[] = [];
    setError(null);
    setDraft(null);
    setHasSelection(false);

    (async () => {
      const [m, text] = await Promise.all([import("./monaco"), readText(cwd, path)]);
      const lang = m.languageOf(path);
      await m.ensureLanguage(lang);
      if (!alive || !container.current) return;

      m.applyTheme(scheme);
      const model = m.getOrCreateModel(cwd, path, text);
      modRef.current = m;
      modelRef.current = model;
      setDirty(m.isDirtyModel(model));

      editor = m.monaco.editor.create(container.current, {
        model,
        automaticLayout: true,
        fontFamily:
          getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() ||
          "ui-monospace, monospace",
        fontSize: 12,
        lineHeight: 20,
        minimap: { enabled: false },
        wordWrap: "on",
        scrollBeyondLastLine: false,
        padding: { top: 10, bottom: 24 },
        // Hover cards and suggest widgets must escape this narrow pane, not clip against it.
        fixedOverflowWidgets: true,
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
        renderLineHighlightOnlyWhenFocus: true,
        smoothScrolling: true,
        stickyScroll: { enabled: false },
      });
      editorRef.current = editor;

      disposables.push(
        model.onDidChangeContent(() => {
          setDirty(m.isDirtyModel(model));
          m.syncDirty(cwd, path, model);
        }),
        editor.onDidChangeCursorSelection((e) => setHasSelection(!e.selection.isEmpty())),
      );

      editor.addCommand(m.monaco.KeyMod.CtrlCmd | m.monaco.KeyCode.KeyS, () => void saveRef.current());
      // ⌘⇧C, not ⌘⇧M: the app keymap owns ⌘⇧M (skill market), and a binding the shell already
      // claims would be a coin-flip depending on focus.
      editor.addAction({
        id: "codetwo.commentSelection",
        label: t("files.commentTitle"),
        keybindings: [m.monaco.KeyMod.CtrlCmd | m.monaco.KeyMod.Shift | m.monaco.KeyCode.KeyC],
        contextMenuGroupId: "navigation",
        precondition: "editorHasSelection",
        run: () => openDraftRef.current(),
      });

      // Cross-file go-to-definition: Monaco asks, the app opens the tab, the new pane reveals.
      m.setFileOpener((abs) => {
        if (!abs.startsWith(`${cwd}/`)) return false;
        onOpen(abs.slice(cwd.length + 1));
        return true;
      });
      const reveal = m.takePendingReveal(m.absPath(cwd, path));
      if (reveal) {
        editor.setPosition(reveal);
        editor.revealPositionInCenter(reveal);
      }
      editor.focus();

      setMod(m);
      void m.attachLsp(cwd, model);
    })().catch((e) => {
      if (alive) setError(String(e));
    });

    return () => {
      alive = false;
      for (const d of disposables) d.dispose();
      // Dispose the editor, never the model: the model is the tab's memory (undo, dirty text).
      editor?.dispose();
      editorRef.current = null;
      modelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once per file; key remounts us
  }, [cwd, path]);

  useEffect(() => {
    mod?.applyTheme(scheme);
  }, [mod, scheme]);

  const submitDraft = () => {
    const m = modRef.current;
    const model = modelRef.current;
    if (!draft || !m || !model || !draft.note.trim()) return;
    const range = draft.startLine === draft.endLine ? `L${draft.startLine}` : `L${draft.startLine}–L${draft.endLine}`;
    const excerpt = model.getValueInRange(
      new m.monaco.Range(draft.startLine, 1, draft.endLine, model.getLineMaxColumn(draft.endLine)),
    );
    const lang = m.languageOf(path);
    // Same shape as the browser's context block: a labelled quote the agent can act on.
    const block = `**File comment** — \`${path}\` (${range})\n\n\`\`\`${lang === "plaintext" ? "" : lang}\n${excerpt}\n\`\`\`\n\n${draft.note.trim()}\n`;
    toast(t("files.commentAdded"), "success");
    setDraft(null);
    onComment(block);
  };

  // The project's own name leads the breadcrumb, reference-style: "project > docs > file.md".
  const parts = [cwd.split("/").filter(Boolean).pop() ?? cwd, ...path.split("/")];
  const range = draft
    ? draft.startLine === draft.endLine
      ? `L${draft.startLine}`
      : `L${draft.startLine}–L${draft.endLine}`
    : "";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b px-3 py-1.5">
        {/* Breadcrumb, not a raw path: the segments are how you know where you are. */}
        <span className="flex min-w-0 flex-1 items-center gap-0.5 text-hint">
          {parts.map((p, i) =>
            i === parts.length - 1 ? (
              <span key={i} className="truncate font-medium">
                {p}
                {dirty && <span className="ml-1.5 text-warning">•</span>}
              </span>
            ) : (
              <span key={i} className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
                <span className="max-w-32 truncate">{p}</span>
                <ChevronRight className="size-3 text-muted-foreground/50" />
              </span>
            ),
          )}
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={!hasSelection}
              onClick={openDraft}
            >
              <MessageSquarePlus className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("files.comment")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => onInsert(path)}>
              <AtSign className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("files.insert")}</TooltipContent>
        </Tooltip>

        {(dirty || saving) && (
          <Button size="sm" className="h-7 text-hint" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {t("files.save")}
          </Button>
        )}
      </header>

      <div
        className="relative min-h-0 flex-1"
        // The app's keymap binds bare Escape to "close side panel". Monaco consumes Escape when it
        // has something to dismiss (suggest, find); the leftover Escapes must not vaporize the
        // pane out from under the cursor.
        onKeyDown={(e) => {
          if (e.key === "Escape") e.stopPropagation();
        }}
      >
        {/* Monaco owns this node. It stays mounted through loading so create() has real bounds. */}
        <div ref={container} className="absolute inset-0" />

        {error ? (
          <p className="absolute inset-x-0 top-0 px-6 py-4 text-ui text-destructive">{error}</p>
        ) : !mod ? (
          <p className="absolute inset-x-0 top-0 flex items-center gap-2 px-6 py-4 text-ui text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t("files.loading")}
          </p>
        ) : null}

        {/* The comment card floats over the code, top-right — the GitHub-review gesture. */}
        {draft && (
          <div className="glass-raised absolute right-4 top-3 z-10 w-80 rounded-xl border p-3 font-sans shadow-lg">
            <div className="flex items-center gap-2 text-hint font-medium">
              <MessageSquarePlus className="size-3.5 text-primary" />
              {t("files.commentTitle")}
            </div>
            <div className="mt-0.5 text-fine text-muted-foreground">{t("files.commentOn", { range })}</div>
            <textarea
              autoFocus
              value={draft.note}
              onChange={(e) => setDraft((d) => (d ? { ...d, note: e.target.value } : d))}
              onKeyDown={(e) => {
                // Both keys have app-level meanings (close panel, run prompt); they end here.
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setDraft(null);
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.stopPropagation();
                  submitDraft();
                }
              }}
              placeholder={t("files.commentPlaceholder")}
              className="mt-2 min-h-16 w-full resize-y rounded-md border bg-transparent px-2.5 py-1.5 text-hint outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-hint" onClick={() => setDraft(null)}>
                {t("files.cancel")}
              </Button>
              <Button size="sm" className="h-7 text-hint" disabled={!draft.note.trim()} onClick={submitDraft}>
                {t("browser.addToPrompt")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
