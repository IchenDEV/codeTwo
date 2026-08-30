import { useCallback, useEffect, useRef, useState } from "react";
import { AtSign, ChevronRight, MessageSquarePlus, Save } from "@/components/ui/icons";

import { CODE_FONTS, useAppearanceSettings } from "../appearance";
import { readText, writeText } from "../bridge";
import { useT } from "../i18n";
import { useColorScheme } from "../theme";
import { useToast } from "../ui/toast";
import { ImagePreview } from "./ImagePreview";
import { imageTypeOf } from "./imageTypes";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { TooltipButton } from "@/components/ui/tooltip";

type MonacoModule = typeof import("./monaco");
type Editor = import("monaco-editor").editor.IStandaloneCodeEditor;
type TextModel = import("monaco-editor").editor.ITextModel;

/** A pending "comment on these lines" card: the range is frozen when the card opens. */
interface Draft {
  startLine: number;
  endLine: number;
  note: string;
}

/** A request to put the editor caret on an exact workspace-search/LSP position. */
export interface FileRevealTarget {
  path: string;
  line: number;
  column: number;
  requestId: number;
}

function revealTarget(editor: Editor, model: TextModel, target: FileRevealTarget) {
  const lineNumber = Math.min(Math.max(target.line, 1), model.getLineCount());
  const column = Math.min(
    Math.max(target.column, 1),
    model.getLineMaxColumn(lineNumber),
  );
  const position = { lineNumber, column };
  editor.setPosition(position);
  editor.revealPositionInCenter(position);
  editor.focus();
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
  reveal,
}: {
  cwd: string;
  path: string;
  onInsert: (path: string) => void;
  /** Open another workspace file in the pane — cross-file go-to-definition lands here. */
  onOpen: (path: string) => void;
  /** Receives a ready-made markdown context block for the prompt document. */
  onComment: (text: string) => void;
  /** A token makes repeated jumps to the same path and position observable. */
  reveal: FileRevealTarget | null;
}) {
  const t = useT();
  const toast = useToast();
  const scheme = useColorScheme();
  const appearance = useAppearanceSettings();
  const codeFont = CODE_FONTS.find((font) => font.id === appearance.codeFont)?.stack ?? CODE_FONTS[0].stack;
  // Pictures take the preview path instead of the editor — there's no text to put in a buffer.
  const isImage = imageTypeOf(path) !== null;
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
  const revealRef = useRef(reveal);
  revealRef.current = reveal;

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
    if (isImage) return;
    let alive = true;
    let editor: Editor | null = null;
    const disposables: { dispose(): void }[] = [];
    setError(null);
    setDraft(null);
    setHasSelection(false);

    (async () => {
      const [m, text] = await Promise.all([import("./monaco"), readText(cwd, path)]);
      // Set the scheme before loading a grammar: `ensureLanguage` re-asserts whatever it's told,
      // which is how it undoes the theme reset shiki's Monaco bridge performs on every load.
      m.applyTheme(scheme);
      await m.ensureLanguage(m.languageOf(path));
      if (!alive || !container.current) return;

      const model = m.getOrCreateModel(cwd, path, text);
      modRef.current = m;
      modelRef.current = model;
      setDirty(m.isDirtyModel(model));

      editor = m.monaco.editor.create(container.current, {
        model,
        automaticLayout: true,
        fontFamily: codeFont,
        fontSize: appearance.codeFontSize,
        lineHeight: Math.round(appearance.codeFontSize * 1.6),
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
      // ⌘⇧C, not ⌘⇧M: the app keymap owns ⌘⇧M (Plugin Hub), and a binding the shell already
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
      const requested = revealRef.current;
      const pendingLspReveal = m.takePendingReveal(m.absPath(cwd, path));
      if (requested?.path === path) {
        revealTarget(editor, model, requested);
      } else if (pendingLspReveal) {
        editor.setPosition(pendingLspReveal);
        editor.revealPositionInCenter(pendingLspReveal);
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
  }, [cwd, path, isImage]);

  useEffect(() => {
    mod?.applyTheme(scheme);
  }, [mod, scheme]);

  useEffect(() => {
    editorRef.current?.updateOptions({
      fontFamily: codeFont,
      fontSize: appearance.codeFontSize,
      lineHeight: Math.round(appearance.codeFontSize * 1.6),
    });
  }, [appearance.codeFontSize, codeFont]);

  useEffect(() => {
    const editor = editorRef.current;
    const model = modelRef.current;
    if (!editor || !model || reveal?.path !== path) return;
    revealTarget(editor, model, reveal);
  }, [path, reveal]);

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
        <span className="flex min-w-0 flex-1 items-center gap-0.5 text-metadata">
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

        {!isImage && (
          <TooltipButton
            label={t("files.comment")}
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={!hasSelection}
            onClick={openDraft}
          >
            <MessageSquarePlus className="size-3.5" />
          </TooltipButton>
        )}

        <TooltipButton
          label={t("files.insert")}
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onInsert(path)}
        >
          <AtSign className="size-3.5" />
        </TooltipButton>

        {(dirty || saving) && (
          <Button size="compact" className="text-metadata" disabled={saving} onClick={() => void save()}>
            {saving ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}
            {t("files.save")}
          </Button>
        )}
      </header>

      {isImage ? (
        <ImagePreview cwd={cwd} path={path} />
      ) : (
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
          <p className="absolute inset-x-0 top-0 px-6 py-4 text-body text-destructive">{error}</p>
        ) : !mod ? (
          <p className="absolute inset-x-0 top-0 flex items-center gap-2 px-6 py-4 text-body text-muted-foreground">
            <Spinner className="size-3.5" />
            {t("files.loading")}
          </p>
        ) : null}

        {/* The comment card floats over the code, top-right — the GitHub-review gesture. */}
        {draft && (
          <div className="raised-material absolute right-4 top-3 z-10 w-80 rounded-module p-3 font-sans shadow-raised">
            <div className="flex items-center gap-2 text-metadata font-medium">
              <MessageSquarePlus className="size-3.5 text-primary" />
              {t("files.commentTitle")}
            </div>
            <div className="mt-0.5 text-callout text-muted-foreground">{t("files.commentOn", { range })}</div>
            <Textarea
              autoFocus
              size="compact"
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
              className="mt-2 min-h-16 font-mono text-metadata"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="compact" className="text-metadata" onClick={() => setDraft(null)}>
                {t("files.cancel")}
              </Button>
              <Button size="compact" className="text-metadata" disabled={!draft.note.trim()} onClick={submitDraft}>
                {t("browser.addToPrompt")}
              </Button>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
