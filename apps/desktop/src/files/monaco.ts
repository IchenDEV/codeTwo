import { shikiToMonaco } from "@shikijs/monaco";
/**
 * Monaco bootstrap for the file editor.
 *
 * This module is only ever loaded with `import("./monaco")` — Monaco plus the shiki grammars are a
 * few megabytes, and the app must not pay that on startup. Everything editor-shaped that needs the
 * real monaco runtime (the LSP glue included) hangs off this chunk.
 *
 * Highlighting is shiki's, not Monaco's monarch: the same TextMate grammars and github themes VS
 * Code uses, and the same themes the rest of this app already renders code blocks with. Monaco's
 * built-in TS/JS/JSON/CSS/HTML workers still provide the language smarts for web files; external
 * language servers cover the rest (see ../lsp).
 */
import * as monaco from "monaco-editor";

export * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";
import cssWorker from "monaco-editor/languages/features/css/css.worker.js?worker";
import htmlWorker from "monaco-editor/languages/features/html/html.worker.js?worker";
import jsonWorker from "monaco-editor/languages/features/json/json.worker.js?worker";
import tsWorker from "monaco-editor/languages/features/typescript/ts.worker.js?worker";
import { createHighlighter, bundledLanguages, bundledThemes } from "shiki";
import type {
  HighlighterGeneric,
  LanguageRegistration,
  ThemeRegistration,
} from "shiki";

import { dirtyKey, markDirty } from "./dirty";

export {
  attachLsp,
  notifySaved,
  setFileOpener,
  takePendingReveal,
} from "../lsp/attach";

export const THEME_LIGHT = "codetwo-light";
export const THEME_DARK = "codetwo-dark";

/** Extension → Monaco language id. `.ts`/`.tsx` share "typescript" so the TS worker attaches. */
const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  rs: "rust",
  toml: "toml",
  md: "markdown",
  css: "css",
  scss: "scss",
  html: "html",
  htm: "html",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  yml: "yaml",
  yaml: "yaml",
  py: "python",
  go: "go",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  hh: "cpp",
  sql: "sql",
  xml: "xml",
  svg: "xml",
  vue: "vue",
  svelte: "svelte",
  swift: "swift",
  kt: "kotlin",
  rb: "ruby",
  php: "php",
};

export function languageOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "plaintext";
}

self.MonacoEnvironment = {
  getWorker(_id: string, label: string): Worker {
    switch (label) {
      case "json": {
        return new jsonWorker();
      }
      case "css":
      case "scss":
      case "less": {
        return new cssWorker();
      }
      case "html":
      case "handlebars":
      case "razor": {
        return new htmlWorker();
      }
      case "typescript":
      case "javascript": {
        return new tsWorker();
      }
      default: {
        return new editorWorker();
      }
    }
  },
};

type Highlighter = HighlighterGeneric<never, never>;

let boot: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>();

/**
 * The github theme, renamed, with the code surface made transparent so the pane sits on the app's
 * own background instead of github's — the app's light/dark surfaces aren't quite github's, and a
 * mismatched slab of colour would read as an embedded foreign widget.
 *
 * Transparency is why the rest of the chrome is spelled out rather than left to the theme. Monaco
 * registers these with `inherit: false`, so any colour github's dict omits falls back to the *base*
 * theme's default — and those defaults assume an opaque editor background. The line highlight is
 * the one that gives it away: unset, it lands as a solid band across the current line.
 *
 * Floating widgets (hover cards, the suggest list) go the other way and are pinned *opaque*: a
 * see-through popup over code is unreadable no matter which theme is on.
 */
async function customTheme(
  id: "github-light" | "github-dark",
  name: string
): Promise<ThemeRegistration> {
  const theme = (await bundledThemes[id]()).default;
  const dark = id === "github-dark";
  const surface =
    theme.colors?.["editor.background"] ?? (dark ? "#0d1117" : "#ffffff");
  const text =
    theme.colors?.["editor.foreground"] ?? (dark ? "#e6edf3" : "#1f2328");
  // Overlays as alpha on the app's own backdrop, so they read the same on any surface beneath.
  const wash = (alpha: string) =>
    dark ? `#ffffff${alpha}` : `#1f2328${alpha}`;
  return {
    ...theme,
    name,
    colors: {
      ...theme.colors,
      "editor.background": "#00000000",
      "editorGutter.background": "#00000000",
      "minimap.background": "#00000000",
      "editorLineNumber.foreground": wash("59"),
      "editorLineNumber.activeForeground": text,
      "editor.lineHighlightBackground": wash("0d"),
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": wash("2b"),
      "editor.inactiveSelectionBackground": wash("1a"),
      "editor.selectionHighlightBackground": wash("1a"),
      "editor.wordHighlightBackground": wash("1a"),
      "editor.wordHighlightStrongBackground": wash("26"),
      "editor.findMatchBackground": wash("40"),
      "editor.findMatchHighlightBackground": wash("26"),
      "editorCursor.foreground": text,
      "editorIndentGuide.background1": wash("14"),
      "editorIndentGuide.activeBackground1": wash("2b"),
      "editorWidget.background": surface,
      "editorSuggestWidget.background": surface,
      "editorHoverWidget.background": surface,
    },
  };
}

/**
 * The grammar to load for a Monaco language id. `.ts` and `.tsx` share one Monaco language (so the
 * TS worker serves both), which forces one grammar for both — the tsx grammar, renamed. TSX is a
 * superset; plain TS highlights correctly under it. Same story for javascript/jsx.
 */
async function grammarFor(
  langId: string
): Promise<LanguageRegistration[] | null> {
  const renamed = async (from: keyof typeof bundledLanguages, to: string) => {
    const regs = (await bundledLanguages[from]()).default;
    return regs.map((r) =>
      r.name === from ? { ...r, name: to, aliases: [] } : r
    );
  };
  if (langId === "typescript") return await renamed("tsx", "typescript");
  if (langId === "javascript") return await renamed("jsx", "javascript");
  if (langId in bundledLanguages) {
    return (await bundledLanguages[langId as keyof typeof bundledLanguages]())
      .default;
  }
  return null;
}

async function ensureBoot(): Promise<Highlighter> {
  boot ??= (async () => {
    const [light, dark] = await Promise.all([
      customTheme("github-light", THEME_LIGHT),
      customTheme("github-dark", THEME_DARK),
    ]);
    const highlighter = (await createHighlighter({
      themes: [light, dark],
      langs: [],
    })) as Highlighter;

    // Monaco's own TS smarts, tuned for loose single-file models: semantic validation off (imports
    // resolve to nothing without a project, and a page of phantom red squiggles teaches nothing),
    // syntax errors kept. When a real typescript-language-server attaches, ../lsp mutes these
    // built-ins entirely.
    const ts = monaco.typescript;
    for (const d of [ts.typescriptDefaults, ts.javascriptDefaults]) {
      d.setCompilerOptions({
        allowNonTsExtensions: true,
        allowJs: true,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      });
      d.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: false,
      });
    }
    return highlighter;
  })();
  return await boot;
}

/** The scheme the app last asked for, so anything that resets the theme can be corrected back. */
let scheme: "light" | "dark" = "light";

/** Load a language's grammar (once) and hand its tokenizer to Monaco. Safe for "plaintext". */
export async function ensureLanguage(langId: string): Promise<void> {
  const highlighter = await ensureBoot();
  if (langId === "plaintext" || loadedLangs.has(langId)) return;
  loadedLangs.add(langId);
  if (!monaco.languages.getLanguages().some((l) => l.id === langId)) {
    monaco.languages.register({ id: langId });
  }
  const grammar = await grammarFor(langId);
  if (!grammar) return;
  await highlighter.loadLanguage(...grammar);
  // Re-applying is how new grammars reach Monaco; providers and themes are replaced, not stacked.
  // It also ends by setting the theme to the first one shiki loaded, so whichever theme is on gets
  // clobbered every time a new language appears — that is what painted a dark editor in light
  // colours (an opaque near-white band across the current line). Re-assert ours right after.
  shikiToMonaco(highlighter, monaco);
  applyTheme();
}

export function applyTheme(next: "light" | "dark" = scheme): void {
  scheme = next;
  monaco.editor.setTheme(next === "dark" ? THEME_DARK : THEME_LIGHT);
}

// ---- models ------------------------------------------------------------------------------------
// Models are cached for the session, keyed by file URI, so switching tabs keeps undo history and
// unsaved edits. "Saved" is an alternative-version-id bookmark, not a text snapshot: undoing back
// to the save point reads as clean again, exactly like VS Code.

const savedVersion = new Map<string, number>();

export function absPath(cwd: string, path: string): string {
  return `${cwd.replace(/\/$/, "")}/${path}`;
}

export function getOrCreateModel(
  cwd: string,
  path: string,
  text: string
): monaco.editor.ITextModel {
  const uri = monaco.Uri.file(absPath(cwd, path));
  let model = monaco.editor.getModel(uri);
  if (!model) {
    model = monaco.editor.createModel(text, languageOf(path), uri);
    model.detectIndentation(true, 4);
    savedVersion.set(uri.toString(), model.getAlternativeVersionId());
  } else if (!isDirtyModel(model) && model.getValue() !== text) {
    // Clean model, different disk content: the agent (or anything else) rewrote the file. Disk wins.
    model.setValue(text);
    savedVersion.set(uri.toString(), model.getAlternativeVersionId());
  }
  return model;
}

export function isDirtyModel(model: monaco.editor.ITextModel): boolean {
  return (
    savedVersion.get(model.uri.toString()) !== model.getAlternativeVersionId()
  );
}

export function markSaved(
  cwd: string,
  path: string,
  model: monaco.editor.ITextModel
): void {
  savedVersion.set(model.uri.toString(), model.getAlternativeVersionId());
  markDirty(dirtyKey(cwd, path), false);
}

/** Recompute the shared dirty flag for this file; Dock tabs and close-guards read that store. */
export function syncDirty(
  cwd: string,
  path: string,
  model: monaco.editor.ITextModel
): void {
  markDirty(dirtyKey(cwd, path), isDirtyModel(model));
}
