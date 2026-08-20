/**
 * Where a file's model meets its language server.
 *
 * `attachLsp` is the only entry the editor pane calls: it acquires the client for the file's
 * project (spawning the server on first ask), registers the Monaco providers for that language,
 * opens the document, and keeps it synced for the rest of the session. Files stay open on the
 * server even when their tab isn't showing — that's what keeps project-wide diagnostics warm.
 */
import * as monaco from "monaco-editor";

import {
  clientForPath,
  getClient,
  isLspLanguage,
  onLspRuntimeEnabled,
  pathToUri,
  type LspClient,
} from "./client";
import { applyDiagnostics, registerProviders } from "./providers";

const synced = new Set<string>();
const mountedModels = new Map<monaco.editor.ITextModel, string>();
let openerRegistered = false;

/** Where cross-file navigation lands before the target editor exists — consumed on its mount. */
let pendingReveal: { absPath: string; lineNumber: number; column: number } | null = null;

/** The current pane's "open this project file" callback — App's tab opener, kept fresh on mount. */
let fileOpener: ((absPath: string) => boolean) | null = null;

export function setFileOpener(cb: (absPath: string) => boolean): void {
  fileOpener = cb;
}

export function takePendingReveal(absPath: string): { lineNumber: number; column: number } | null {
  if (pendingReveal?.absPath !== absPath) return null;
  const at = pendingReveal;
  pendingReveal = null;
  return { lineNumber: at.lineNumber, column: at.column };
}

/**
 * Monaco asks this when navigation targets a model it doesn't have — a definition in another
 * file. Handing the path to the app's tab opener turns "peek failed" into "the file opens, cursor
 * on the symbol", which is the difference between a code viewer and an IDE.
 */
function ensureOpener(): void {
  if (openerRegistered) return;
  openerRegistered = true;
  monaco.editor.registerEditorOpener({
    openCodeEditor: (_source, resource, at) => {
      if (resource.scheme !== "file" || !fileOpener) return false;
      const pos = at && "startLineNumber" in at
        ? { lineNumber: at.startLineNumber, column: at.startColumn }
        : at && "lineNumber" in at
          ? { lineNumber: at.lineNumber, column: at.column }
          : { lineNumber: 1, column: 1 };
      pendingReveal = { absPath: resource.path, ...pos };
      const opened = fileOpener(resource.path);
      if (!opened) pendingReveal = null;
      return opened;
    },
  });
}

/**
 * With a real typescript-language-server attached, Monaco's single-file TS worker becomes the
 * wrong voice in the room — same-named completions, half-informed hovers. Mute its providers and
 * let the project-aware server speak. (Highlighting is shiki's and unaffected.)
 */
function muteBuiltinTs(lang: string): void {
  if (lang !== "typescript" && lang !== "javascript") return;
  const defaults =
    lang === "typescript" ? monaco.typescript.typescriptDefaults : monaco.typescript.javascriptDefaults;
  defaults.setModeConfiguration({
    completionItems: false,
    hovers: false,
    documentSymbols: false,
    definitions: false,
    references: false,
    documentHighlights: false,
    rename: false,
    diagnostics: false,
    documentRangeFormattingEdits: false,
    signatureHelp: false,
    onTypeFormattingEdits: false,
    codeActions: false,
    inlayHints: false,
  });
}

/** Hook `model` up to its project's language server, if one exists for its language. */
export async function attachLsp(cwd: string, model: monaco.editor.ITextModel): Promise<void> {
  ensureOpener();
  if (!mountedModels.has(model)) {
    model.onWillDispose(() => {
      mountedModels.delete(model);
      synced.delete(pathToUri(model.uri.path));
    });
  }
  mountedModels.set(model, cwd);
  const lang = model.getLanguageId();
  if (!isLspLanguage(lang)) return;
  const client = await getClient(cwd, lang);
  if (!client || model.isDisposed()) return;

  registerProviders(lang, client.capabilities);
  muteBuiltinTs(lang);
  wireDiagnostics(client);

  const uri = pathToUri(model.uri.path);
  client.didOpen(uri, lang, model.getValue());
  if (!synced.has(uri)) {
    synced.add(uri);
    // Resolve the client per change, not per attach: a crashed server's replacement must keep
    // receiving edits, and this listener lives as long as the model does.
    model.onDidChangeContent(() => {
      const current = clientForPath(model.uri.path, model.getLanguageId());
      if (current) {
        if (!current.isOpen(uri)) current.didOpen(uri, model.getLanguageId(), model.getValue());
        else current.scheduleChange(uri, model.getValue());
      }
    });
  }
}

onLspRuntimeEnabled((workspace) => {
  for (const [model, cwd] of mountedModels) {
    if (!model.isDisposed() && (workspace === undefined || workspace === cwd)) {
      void attachLsp(cwd, model);
    }
  }
});

function wireDiagnostics(client: LspClient): void {
  client.onDiagnostics ??= applyDiagnostics;
}

/** Tell the server the file hit disk — rust-analyzer runs its cargo-check pass on this signal. */
export function notifySaved(cwd: string, model: monaco.editor.ITextModel): void {
  const lang = model.getLanguageId();
  if (!isLspLanguage(lang)) return;
  void getClient(cwd, lang).then((client) => client?.didSave(pathToUri(model.uri.path)));
}
