/**
 * LSP results, rendered as Monaco language providers.
 *
 * Providers register once per language id, then route each call to whichever client's project
 * contains the model's file — several projects can be open across sessions, each with its own
 * server. No client, or a request that fails, degrades to "no answer": the editor stays an
 * editor, it just knows less.
 */
import * as monaco from "monaco-editor";

import { clientForPath, pathToUri } from "./client";
import type { LspClient } from "./client";
import {
  arrayField,
  asJsonArray,
  asJsonObject,
  numberField,
  objectField,
  stringField,
} from "./json";
import type { JsonObject } from "./json";

const registered = new Set<string>();

function clientFor(model: monaco.editor.ITextModel): LspClient | null {
  return clientForPath(model.uri.path, model.getLanguageId());
}

function toLspPosition(pos: monaco.Position): JsonObject {
  return { line: pos.lineNumber - 1, character: pos.column - 1 };
}

function toMonacoRange(r: unknown): monaco.IRange {
  const range = asJsonObject(r);
  const start = objectField(range, "start");
  const end = objectField(range, "end");
  return {
    startLineNumber: numberField(start, "line") + 1,
    startColumn: numberField(start, "character") + 1,
    endLineNumber: numberField(end, "line") + 1,
    endColumn: numberField(end, "character") + 1,
  };
}

function docParams(
  model: monaco.editor.ITextModel,
  pos: monaco.Position
): JsonObject {
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

function toDoc(d: unknown): monaco.IMarkdownString | undefined {
  if (d == null) return undefined;
  if (typeof d === "string") return { value: d };
  const object = asJsonObject(d);
  const value = stringField(object, "value");
  if (value != null) return { value };
  return undefined;
}

function toCompletion(
  itemValue: unknown,
  fallback: monaco.IRange
): monaco.languages.CompletionItem {
  const item = asJsonObject(itemValue) ?? {};
  const labelObject = objectField(item, "label");
  const label =
    stringField(item, "label") ?? stringField(labelObject, "label") ?? "";
  let range: monaco.languages.CompletionItem["range"] = fallback;
  let insertText = stringField(item, "insertText") ?? label;
  const textEdit = objectField(item, "textEdit");
  if (textEdit != null) {
    insertText = stringField(textEdit, "newText") ?? insertText;
    // InsertReplaceEdit carries two ranges; plain TextEdit carries one.
    range =
      objectField(textEdit, "range") == null
        ? {
            insert: toMonacoRange(objectField(textEdit, "insert")),
            replace: toMonacoRange(objectField(textEdit, "replace")),
          }
        : toMonacoRange(objectField(textEdit, "range"));
  }
  const additional = arrayField(item, "additionalTextEdits");
  return {
    label,
    kind:
      KIND[numberField(item, "kind", 1) - 1] ??
      monaco.languages.CompletionItemKind.Text,
    insertText,
    range,
    insertTextRules:
      numberField(item, "insertTextFormat") === 2
        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : undefined,
    detail: stringField(item, "detail") ?? undefined,
    documentation: toDoc(item.documentation),
    sortText: stringField(item, "sortText") ?? undefined,
    filterText: stringField(item, "filterText") ?? undefined,
    preselect: typeof item.preselect === "boolean" ? item.preselect : undefined,
    additionalTextEdits: additional?.map((entry) => {
      const edit = asJsonObject(entry) ?? {};
      return {
        range: toMonacoRange(objectField(edit, "range")),
        text: stringField(edit, "newText") ?? "",
      };
    }),
  };
}

function toHoverContents(contents: unknown): monaco.IMarkdownString[] {
  const one = (c: unknown): monaco.IMarkdownString | null => {
    if (c == null) return null;
    if (typeof c === "string") return c === "" ? null : { value: c };
    const object = asJsonObject(c);
    const value = stringField(object, "value");
    if (value == null) return null;
    const language = stringField(object, "language");
    // MarkedString {language, value} wants a fenced block; MarkupContent is already markdown.
    return language == null
      ? { value }
      : { value: `\`\`\`${language}\n${value}\n\`\`\`` };
  };
  const list = asJsonArray(contents) ?? [contents];
  return list.map(one).filter((x): x is monaco.IMarkdownString => x !== null);
}

function toLocations(res: unknown): monaco.languages.Location[] {
  if (res == null) return [];
  const list = asJsonArray(res) ?? [res];
  return list.map((entry) => {
    const location = asJsonObject(entry) ?? {};
    const uri =
      stringField(location, "uri") ?? stringField(location, "targetUri") ?? "";
    return {
      uri: monaco.Uri.parse(uri),
      range: toMonacoRange(
        objectField(location, "range") ??
          objectField(location, "targetSelectionRange") ??
          objectField(location, "targetRange")
      ),
    };
  });
}

function parameterLabel(value: unknown): string | [number, number] {
  if (typeof value === "string") return value;
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    return [value[0], value[1]];
  }
  return "";
}

function stringListField(
  object: JsonObject | null | undefined,
  key: string
): string[] {
  const values = arrayField(object, key);
  if (values == null) return [];
  return values.filter((value): value is string => typeof value === "string");
}

/** Wire up every provider for one language id. Idempotent; called when a client becomes ready. */
export function registerProviders(lang: string, capabilities: unknown): void {
  if (registered.has(lang)) return;
  registered.add(lang);
  const caps = asJsonObject(capabilities);
  const completionProvider = objectField(caps, "completionProvider");
  const signatureHelpProvider = objectField(caps, "signatureHelpProvider");

  monaco.languages.registerCompletionItemProvider(lang, {
    triggerCharacters: stringListField(completionProvider, "triggerCharacters"),
    provideCompletionItems: async (model, position) => {
      const client = readyClient(model);
      if (!client) return { suggestions: [] };
      const res = await client
        .request("textDocument/completion", {
          ...docParams(model, position),
          context: { triggerKind: 1 },
        })
        .catch(() => null);
      const resObject = asJsonObject(res);
      const items = asJsonArray(res) ?? arrayField(resObject, "items") ?? [];
      const word = model.getWordUntilPosition(position);
      const fallback: monaco.IRange = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };
      return {
        suggestions: items.map((it) => toCompletion(it, fallback)),
        incomplete:
          !Array.isArray(res) &&
          resObject != null &&
          typeof resObject.isIncomplete === "boolean"
            ? resObject.isIncomplete
            : undefined,
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
      const hover = asJsonObject(res);
      if (hover?.contents == null) return null;
      const contents = toHoverContents(hover.contents);
      if (contents.length === 0) return null;
      const range = objectField(hover, "range");
      return {
        contents,
        range: range == null ? undefined : toMonacoRange(range),
      };
    },
  });

  monaco.languages.registerSignatureHelpProvider(lang, {
    signatureHelpTriggerCharacters: (() => {
      const chars = stringListField(signatureHelpProvider, "triggerCharacters");
      return chars.length > 0 ? chars : ["(", ","];
    })(),
    signatureHelpRetriggerCharacters: stringListField(
      signatureHelpProvider,
      "retriggerCharacters"
    ),
    provideSignatureHelp: async (model, position) => {
      const client = readyClient(model);
      if (!client) return null;
      const res = await client
        .request("textDocument/signatureHelp", docParams(model, position))
        .catch(() => null);
      const help = asJsonObject(res);
      const signatures = arrayField(help, "signatures");
      if (signatures == null || signatures.length === 0) return null;
      return {
        value: {
          signatures: signatures.map((signatureValue) => {
            const signature = asJsonObject(signatureValue) ?? {};
            const parameters = arrayField(signature, "parameters") ?? [];
            return {
              label: stringField(signature, "label") ?? "",
              documentation: toDoc(signature.documentation),
              parameters: parameters.map((parameterValue) => {
                const parameter = asJsonObject(parameterValue) ?? {};
                return {
                  label: parameterLabel(parameter.label),
                  documentation: toDoc(parameter.documentation),
                };
              }),
            };
          }),
          activeSignature: numberField(help, "activeSignature"),
          activeParameter: numberField(help, "activeParameter"),
        },
        dispose: () => {
          /* empty */
        },
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
      const edits = asJsonArray(res);
      if (edits == null) return null;
      return edits.map((entry) => {
        const edit = asJsonObject(entry) ?? {};
        return {
          range: toMonacoRange(objectField(edit, "range")),
          text: stringField(edit, "newText") ?? "",
        };
      });
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
export function applyDiagnostics(uri: string, diagnostics: unknown[]): void {
  const model = monaco.editor.getModel(monaco.Uri.parse(uri));
  if (!model) return;
  const markers: monaco.editor.IMarkerData[] = diagnostics.map(
    (diagnosticValue) => {
      const diagnostic = asJsonObject(diagnosticValue) ?? {};
      const codeValue = diagnostic.code;
      const codeObject = asJsonObject(codeValue);
      return {
        ...toMonacoRange(objectField(diagnostic, "range")),
        severity:
          SEVERITY[numberField(diagnostic, "severity", 1) - 1] ??
          monaco.MarkerSeverity.Error,
        message: String(diagnostic.message ?? ""),
        code:
          codeObject == null
            ? codeValue == null
              ? undefined
              : String(codeValue)
            : String(codeObject.value ?? ""),
        source: stringField(diagnostic, "source") ?? undefined,
      };
    }
  );
  monaco.editor.setModelMarkers(model, "codetwo-lsp", markers);
}
