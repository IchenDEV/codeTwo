/**
 * LSP results, rendered as Monaco language providers.
 *
 * Providers register once per language id, then route each call to whichever client's project
 * contains the model's file — several projects can be open across sessions, each with its own
 * server. No client, or a request that fails, degrades to "no answer": the editor stays an
 * editor, it just knows less.
 */
import * as monaco from "monaco-editor";

import { clientForPath, pathToUri, type LspClient } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any -- the wire format is untyped JSON */
type Json = any;

const registered = new Set<string>();

function clientFor(model: monaco.editor.ITextModel): LspClient | null {
  return clientForPath(model.uri.path, model.getLanguageId());
}

function toLspPosition(pos: monaco.Position): Json {
  return { line: pos.lineNumber - 1, character: pos.column - 1 };
}

function toMonacoRange(r: Json): monaco.IRange {
  return {
    startLineNumber: (r?.start?.line ?? 0) + 1,
    startColumn: (r?.start?.character ?? 0) + 1,
    endLineNumber: (r?.end?.line ?? 0) + 1,
    endColumn: (r?.end?.character ?? 0) + 1,
  };
}

function docParams(
  model: monaco.editor.ITextModel,
  pos: monaco.Position
): Json {
  return {
    textDocument: { uri: pathToUri(model.uri.path) },
    position: toLspPosition(pos),
  };
}

/** Flush pending edits first: a request against stale server text answers the wrong question. */
function readyClient(model: monaco.editor.ITextModel): LspClient | null {
  const client = clientFor(model);
  if (!client) return null;
  client.flush(pathToUri(model.uri.path));
  return client;
}

// LSP CompletionItemKind (1-based) → Monaco's. Unknowns fall back to Text.
const KIND: monaco.languages.CompletionItemKind[] = [
  monaco.languages.CompletionItemKind.Text,
  monaco.languages.CompletionItemKind.Method,
  monaco.languages.CompletionItemKind.Function,
  monaco.languages.CompletionItemKind.Constructor,
  monaco.languages.CompletionItemKind.Field,
  monaco.languages.CompletionItemKind.Variable,
  monaco.languages.CompletionItemKind.Class,
  monaco.languages.CompletionItemKind.Interface,
  monaco.languages.CompletionItemKind.Module,
  monaco.languages.CompletionItemKind.Property,
  monaco.languages.CompletionItemKind.Unit,
  monaco.languages.CompletionItemKind.Value,
  monaco.languages.CompletionItemKind.Enum,
  monaco.languages.CompletionItemKind.Keyword,
  monaco.languages.CompletionItemKind.Snippet,
  monaco.languages.CompletionItemKind.Color,
  monaco.languages.CompletionItemKind.File,
  monaco.languages.CompletionItemKind.Reference,
  monaco.languages.CompletionItemKind.Folder,
  monaco.languages.CompletionItemKind.EnumMember,
  monaco.languages.CompletionItemKind.Constant,
  monaco.languages.CompletionItemKind.Struct,
  monaco.languages.CompletionItemKind.Event,
  monaco.languages.CompletionItemKind.Operator,
  monaco.languages.CompletionItemKind.TypeParameter,
];

function toDoc(d: Json): monaco.IMarkdownString | undefined {
  if (!d) return undefined;
  if (typeof d === "string") return { value: d };
  if (typeof d.value === "string") return { value: d.value };
  return undefined;
}

function toCompletion(
  item: Json,
  fallback: monaco.IRange
): monaco.languages.CompletionItem {
  const label =
    typeof item.label === "string" ? item.label : (item.label?.label ?? "");
  let range: monaco.languages.CompletionItem["range"] = fallback;
  let insertText: string = item.insertText ?? label;
  if (item.textEdit) {
    insertText = item.textEdit.newText;
    // InsertReplaceEdit carries two ranges; plain TextEdit carries one.
    range = item.textEdit.range
      ? toMonacoRange(item.textEdit.range)
      : {
          insert: toMonacoRange(item.textEdit.insert),
          replace: toMonacoRange(item.textEdit.replace),
        };
  }
  return {
    label,
    kind:
      KIND[(item.kind ?? 1) - 1] ?? monaco.languages.CompletionItemKind.Text,
    insertText,
    range,
    insertTextRules:
      item.insertTextFormat === 2
        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : undefined,
    detail: item.detail,
    documentation: toDoc(item.documentation),
    sortText: item.sortText,
    filterText: item.filterText,
    preselect: item.preselect,
    additionalTextEdits: item.additionalTextEdits?.map((e: Json) => ({
      range: toMonacoRange(e.range),
      text: e.newText,
    })),
  };
}

function toHoverContents(contents: Json): monaco.IMarkdownString[] {
  const one = (c: Json): monaco.IMarkdownString | null => {
    if (!c) return null;
    if (typeof c === "string") return c ? { value: c } : null;
    if (typeof c.value === "string") {
      // MarkedString {language, value} wants a fenced block; MarkupContent is already markdown.
      return c.language
        ? { value: `\`\`\`${c.language}\n${c.value}\n\`\`\`` }
        : { value: c.value };
    }
    return null;
  };
  const list = Array.isArray(contents) ? contents : [contents];
  return list.map(one).filter((x): x is monaco.IMarkdownString => x !== null);
}

function toLocations(res: Json): monaco.languages.Location[] {
  if (!res) return [];
  const list = Array.isArray(res) ? res : [res];
  return list.map((l: Json) => ({
    uri: monaco.Uri.parse(l.uri ?? l.targetUri),
    range: toMonacoRange(l.range ?? l.targetSelectionRange ?? l.targetRange),
  }));
}

/** Wire up every provider for one language id. Idempotent; called when a client becomes ready. */
export function registerProviders(lang: string, capabilities: Json): void {
  if (registered.has(lang)) return;
  registered.add(lang);

  monaco.languages.registerCompletionItemProvider(lang, {
    triggerCharacters:
      capabilities?.completionProvider?.triggerCharacters ?? [],
    provideCompletionItems: async (model, position) => {
      const client = readyClient(model);
      if (!client) return { suggestions: [] };
      const res = await client
        .request("textDocument/completion", {
          ...docParams(model, position),
          context: { triggerKind: 1 },
        })
        .catch(() => null);
      const items: Json[] = Array.isArray(res) ? res : (res?.items ?? []);
      const word = model.getWordUntilPosition(position);
      const fallback: monaco.IRange = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };
      return {
        suggestions: items.map((it) => toCompletion(it, fallback)),
        incomplete: !Array.isArray(res) && !!res?.isIncomplete,
      };
    },
  });

  monaco.languages.registerHoverProvider(lang, {
    provideHover: async (model, position) => {
      const client = readyClient(model);
      if (!client) return null;
      const res = await client
        .request("textDocument/hover", docParams(model, position))
        .catch(() => null);
      if (!res?.contents) return null;
      const contents = toHoverContents(res.contents);
      if (contents.length === 0) return null;
      return {
        contents,
        range: res.range ? toMonacoRange(res.range) : undefined,
      };
    },
  });

  monaco.languages.registerSignatureHelpProvider(lang, {
    signatureHelpTriggerCharacters: capabilities?.signatureHelpProvider
      ?.triggerCharacters ?? ["(", ","],
    signatureHelpRetriggerCharacters:
      capabilities?.signatureHelpProvider?.retriggerCharacters ?? [],
    provideSignatureHelp: async (model, position) => {
      const client = readyClient(model);
      if (!client) return null;
      const res = await client
        .request("textDocument/signatureHelp", docParams(model, position))
        .catch(() => null);
      if (!res?.signatures?.length) return null;
      return {
        value: {
          signatures: res.signatures.map((s: Json) => ({
            label: s.label ?? "",
            documentation: toDoc(s.documentation),
            parameters: (s.parameters ?? []).map((p: Json) => ({
              label: p.label,
              documentation: toDoc(p.documentation),
            })),
          })),
          activeSignature: res.activeSignature ?? 0,
          activeParameter: res.activeParameter ?? 0,
        },
        dispose: () => {},
      };
    },
  });

  monaco.languages.registerDefinitionProvider(lang, {
    provideDefinition: async (model, position) => {
      const client = readyClient(model);
      if (!client) return null;
      const res = await client
        .request("textDocument/definition", docParams(model, position))
        .catch(() => null);
      return toLocations(res);
    },
  });

  monaco.languages.registerReferenceProvider(lang, {
    provideReferences: async (model, position) => {
      const client = readyClient(model);
      if (!client) return null;
      const res = await client
        .request("textDocument/references", {
          ...docParams(model, position),
          context: { includeDeclaration: true },
        })
        .catch(() => null);
      return toLocations(res);
    },
  });

  monaco.languages.registerDocumentFormattingEditProvider(lang, {
    provideDocumentFormattingEdits: async (model) => {
      const client = readyClient(model);
      if (!client) return null;
      const res = await client
        .request("textDocument/formatting", {
          textDocument: { uri: pathToUri(model.uri.path) },
          options: {
            tabSize: model.getOptions().tabSize,
            insertSpaces: model.getOptions().insertSpaces,
          },
        })
        .catch(() => null);
      if (!Array.isArray(res)) return null;
      return res.map((e: Json) => ({
        range: toMonacoRange(e.range),
        text: e.newText,
      }));
    },
  });
}

const SEVERITY: monaco.MarkerSeverity[] = [
  monaco.MarkerSeverity.Error,
  monaco.MarkerSeverity.Warning,
  monaco.MarkerSeverity.Info,
  monaco.MarkerSeverity.Hint,
];

/** Push one file's published diagnostics onto its model as markers. */
export function applyDiagnostics(uri: string, diagnostics: Json[]): void {
  const model = monaco.editor.getModel(monaco.Uri.parse(uri));
  if (!model) return;
  const markers: monaco.editor.IMarkerData[] = diagnostics.map((d) => ({
    ...toMonacoRange(d.range),
    severity: SEVERITY[(d.severity ?? 1) - 1] ?? monaco.MarkerSeverity.Error,
    message: String(d.message ?? ""),
    code:
      typeof d.code === "object" && d.code !== null
        ? String(d.code.value ?? "")
        : d.code?.toString(),
    source: d.source,
  }));
  monaco.editor.setModelMarkers(model, "codetwo-lsp", markers);
}
