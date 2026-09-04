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
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";
import jsonWorker from "monaco-editor/languages/features/json/json.worker.js?worker";
import cssWorker from "monaco-editor/languages/features/css/css.worker.js?worker";
import htmlWorker from "monaco-editor/languages/features/html/html.worker.js?worker";
import tsWorker from "monaco-editor/languages/features/typescript/ts.worker.js?worker";
import { createHighlighter, bundledLanguages, bundledThemes } from "shiki";
import { shikiToMonaco } from "@shikijs/monaco";

import { dirtyKey, markDirty } from "./dirty";
import type {
  HighlighterGeneric,
  LanguageRegistration,
  ThemeRegistration,
} from "shiki";

export {
  attachLsp,
  notifySaved,
  setFileOpener,
  takePendingReveal,
} from "../lsp/attach";

export const themeLight = "codetwo-light";
export const themeDark = "codetwo-dark";

/**
Extension → Monaco language id. `.ts`/`.tsx` share "typescript" so the TS worker attaches.
*/
const extensionLanguage: Record<string, string> = {
  bash: "shellscript",
  c: "c",
  cc: "cpp",
  cjs: "javascript",
  cpp: "cpp",
  css: "css",
  cts: "typescript",
  go: "go",
  h: "c",
  hh: "cpp",
  hpp: "cpp",
  htm: "html",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsonc: "json",
  jsx: "javascript",
  kt: "kotlin",
  md: "markdown",
  mjs: "javascript",
  mts: "typescript",
  php: "php",
  py: "python",
  rb: "ruby",
  rs: "rust",
  scss: "scss",
  sh: "shellscript",
  sql: "sql",
  svelte: "svelte",
  svg: "xml",
  swift: "swift",
  toml: "toml",
  ts: "typescript",
  tsx: "typescript",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "shellscript",
};

export function languageOf(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return extensionLanguage[extension] ?? "plaintext";
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

async function customTheme(
  id: "github-light" | "github-dark",
  name: string
): Promise<ThemeRegistration> {
  const theme = (await bundledThemes[id]()).default;
  const isDark = id === "github-dark";
  const surface =
    theme.colors?.["editor.background"] ?? (isDark ? "#0d1117" : "#ffffff");
  const text =
    theme.colors?.["editor.foreground"] ?? (isDark ? "#e6edf3" : "#1f2328");
  // Overlays as alpha on the app's own backdrop, so they read the same on any surface beneath.
  const wash = (alpha: string) =>
    isDark ? `#ffffff${alpha}` : `#1f2328${alpha}`;
  return {
    ...theme,
    colors: {
      ...theme.colors,
      "editor.background": "#00000000",
      "editor.findMatchBackground": wash("40"),
      "editor.findMatchHighlightBackground": wash("26"),
      "editor.inactiveSelectionBackground": wash("1a"),
      "editor.lineHighlightBackground": wash("0d"),
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": wash("2b"),
      "editor.selectionHighlightBackground": wash("1a"),
      "editor.wordHighlightBackground": wash("1a"),
      "editor.wordHighlightStrongBackground": wash("26"),
      "editorCursor.foreground": text,
      "editorGutter.background": "#00000000",
      "editorHoverWidget.background": surface,
      "editorIndentGuide.activeBackground1": wash("2b"),
      "editorIndentGuide.background1": wash("14"),
      "editorLineNumber.activeForeground": text,
      "editorLineNumber.foreground": wash("59"),
      "editorSuggestWidget.background": surface,
      "editorWidget.background": surface,
      "minimap.background": "#00000000",
    },
    name,
  };
}

async function grammarFor(
  langId: string
): Promise<LanguageRegistration[] | null> {
  const renamed = async (from: keyof typeof bundledLanguages, to: string) => {
    const regs = (await bundledLanguages[from]()).default;
    return regs.map((r) =>
      r.name === from ? { ...r, aliases: [], name: to } : r
    );
  };
  if (langId === "typescript") {
    return await renamed("tsx", "typescript");
  }
  if (langId === "javascript") {
    return await renamed("jsx", "javascript");
  }
  if (langId in bundledLanguages) {
    return (await bundledLanguages[langId as keyof typeof bundledLanguages]())
      .default;
  }
  return null;
}

async function ensureBoot(): Promise<Highlighter> {
  boot ??= (async () => {
    const [light, dark] = await Promise.all([
      customTheme("github-light", themeLight),
      customTheme("github-dark", themeDark),
    ]);
    const highlighter = (await createHighlighter({
      langs: [],
      themes: [light, dark],
    })) as Highlighter;

    // Monaco's own TS smarts, tuned for loose single-file models: semantic validation off (imports
    // resolve to nothing without a project, and a page of phantom red squiggles teaches nothing),
    // syntax errors kept. When a real typescript-language-server attaches, ../lsp mutes these
    // built-ins entirely.
    const ts = monaco.typescript;
    for (const d of [ts.typescriptDefaults, ts.javascriptDefaults]) {
      d.setCompilerOptions({
        allowJs: true,
        allowNonTsExtensions: true,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        target: ts.ScriptTarget.ESNext,
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

/**
The scheme the app last asked for, so anything that resets the theme can be corrected back.
*/
let scheme: "light" | "dark" = "light";

export async function ensureLanguage(langId: string): Promise<void> {
  const highlighter = await ensureBoot();
  if (langId === "plaintext" || loadedLangs.has(langId)) {
    return;
  }
  loadedLangs.add(langId);
  if (monaco.languages.getLanguages().every((l) => l.id !== langId)) {
    monaco.languages.register({ id: langId });
  }
  const grammar = await grammarFor(langId);
  if (!grammar) {
    return;
  }
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
  monaco.editor.setTheme(next === "dark" ? themeDark : themeLight);
}

// ---- models ------------------------------------------------------------------------------------ Models are cached for the session, keyed by file URI, so switching tabs keeps undo history and unsaved edits. "Saved" is an alternative-version-id bookmark, not a text snapshot: undoing back to the save point reads as clean again, exactly like VS Code.

const savedVersion = new Map<string, number>();

export function absPath(cwd: string, path: string): string {
  return `${cwd.replace(/\/$/u, "")}/${path}`;
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

export function syncDirty(
  cwd: string,
  path: string,
  model: monaco.editor.ITextModel
): void {
  markDirty(dirtyKey(cwd, path), isDirtyModel(model));
}

export * as monaco from "monaco-editor";
