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
  asJsonObject,
  booleanField,
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
  return { character: pos.column - 1, line: pos.lineNumber - 1 };
}

function toMonacoRange(value: unknown): monaco.IRange {
  const range = asJsonObject(value);
  const start = objectField(range, "start");
  const end = objectField(range, "end");
  return {
    endColumn: numberField(end, "character") + 1,
    endLineNumber: numberField(end, "line") + 1,
    startColumn: numberField(start, "character") + 1,
    startLineNumber: numberField(start, "line") + 1,
  };
}

function documentParameters(
  model: monaco.editor.ITextModel,
  pos: monaco.Position
): JsonObject {
  return {
    position: toLspPosition(pos),
    textDocument: { uri: pathToUri(model.uri.path) },
  };
}

function readyClient(model: monaco.editor.ITextModel): LspClient | null {
  const client = clientFor(model);
  if (!client) {
    return null;
  }
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

function toDocument(value: unknown): monaco.IMarkdownString | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value === "string") {
    return { value };
  }
  const object = asJsonObject(value);
  const markdown = stringField(object, "value");
  if (markdown != null) {
    return { value: markdown };
  }
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
    const editRange = objectField(textEdit, "range");
    if (editRange != null) {
      range = toMonacoRange(editRange);
    } else {
      range = {
        insert: toMonacoRange(objectField(textEdit, "insert")),
        replace: toMonacoRange(objectField(textEdit, "replace")),
      };
    }
  }
  const additional = arrayField(item, "additionalTextEdits");
  return {
    additionalTextEdits: additional?.flatMap((entry) => {
      const edit = asJsonObject(entry);
      if (edit == null) {
        return [];
      }
      return [
        {
          range: toMonacoRange(objectField(edit, "range")),
          text: stringField(edit, "newText") ?? "",
        },
      ];
    }),
    detail: stringField(item, "detail") ?? undefined,
    documentation: toDocument(item.documentation),
    filterText: stringField(item, "filterText") ?? undefined,
    insertText,
    insertTextRules:
      numberField(item, "insertTextFormat", 0) === 2
        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : undefined,
    kind:
      KIND[numberField(item, "kind", 1) - 1] ??
      monaco.languages.CompletionItemKind.Text,
    label,
    preselect: booleanField(item, "preselect") ?? undefined,
    range,
    sortText: stringField(item, "sortText") ?? undefined,
  };
}

function toHoverContents(contents: unknown): monaco.IMarkdownString[] {
  const one = (value: unknown): monaco.IMarkdownString | null => {
    if (value == null) {
      return null;
    }
    if (typeof value === "string") {
      return value !== "" ? { value } : null;
    }
    const object = asJsonObject(value);
    const markdown = stringField(object, "value");
    if (markdown == null) {
      return null;
    }
    const language = stringField(object, "language");
    // MarkedString {language, value} wants a fenced block; MarkupContent is already markdown.
    return language != null && language !== ""
      ? { value: `\`\`\`${language}\n${markdown}\n\`\`\`` }
      : { value: markdown };
  };
  const list = Array.isArray(contents) ? contents : [contents];
  return list.map(one).filter((x): x is monaco.IMarkdownString => x !== null);
}

function toLocations(res: unknown): monaco.languages.Location[] {
  if (res == null) {
    return [];
  }
  const list = Array.isArray(res) ? res : [res];
  return list.flatMap((entry) => {
    const location = asJsonObject(entry);
    if (location == null) {
      return [];
    }
    const uri =
      stringField(location, "uri") ?? stringField(location, "targetUri");
    if (uri == null || uri === "") {
      return [];
    }
    const range =
      objectField(location, "range") ??
      objectField(location, "targetSelectionRange") ??
      objectField(location, "targetRange");
    return [
      {
        range: toMonacoRange(range),
        uri: monaco.Uri.parse(uri),
      },
    ];
  });
}

export function registerProviders(
  lang: string,
  capabilitiesValue: unknown
): void {
  if (registered.has(lang)) {
    return;
  }
  registered.add(lang);
  const capabilities = asJsonObject(capabilitiesValue) ?? {};
  const completionProvider = objectField(capabilities, "completionProvider");
  const signatureHelpProvider = objectField(
    capabilities,
    "signatureHelpProvider"
  );

  monaco.languages.registerCompletionItemProvider(lang, {
    provideCompletionItems: async (model, position) => {
      const client = readyClient(model);
      if (!client) {
        return { suggestions: [] };
      }
      const res = await client
        .request("textDocument/completion", {
          ...documentParameters(model, position),
          context: { triggerKind: 1 },
        })
        .catch(() => null);
      const resultObject = asJsonObject(res);
      const items = Array.isArray(res)
        ? res
        : (arrayField(resultObject, "items") ?? []);
      const word = model.getWordUntilPosition(position);
      const fallback: monaco.IRange = {
        endColumn: word.endColumn,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        startLineNumber: position.lineNumber,
      };
      return {
        incomplete:
          !Array.isArray(res) &&
          booleanField(resultObject, "isIncomplete") === true,
        suggestions: items.map((it) => toCompletion(it, fallback)),
      };
    },
    triggerCharacters:
      arrayField(completionProvider, "triggerCharacters")?.filter(
        (value): value is string => typeof value === "string"
      ) ?? [],
  });

  monaco.languages.registerHoverProvider(lang, {
    provideHover: async (model, position) => {
      const client = readyClient(model);
      if (!client) {
        return null;
      }
      const res = await client
        .request("textDocument/hover", documentParameters(model, position))
        .catch(() => null);
      const hover = asJsonObject(res);
      if (hover?.contents == null) {
        return null;
      }
      const contents = toHoverContents(hover.contents);
      if (contents.length === 0) {
        return null;
      }
      const range = objectField(hover, "range");
      return {
        contents,
        range: range != null ? toMonacoRange(range) : undefined,
      };
    },
  });

  monaco.languages.registerSignatureHelpProvider(lang, {
    provideSignatureHelp: async (model, position) => {
      const client = readyClient(model);
      if (!client) {
        return null;
      }
      const res = await client
        .request(
          "textDocument/signatureHelp",
          documentParameters(model, position)
        )
        .catch(() => null);
      const help = asJsonObject(res);
      const signatures = arrayField(help, "signatures");
      if (signatures == null || signatures.length === 0) {
        return null;
      }
      return {
        dispose: () => {},
        value: {
          activeParameter: numberField(help, "activeParameter"),
          activeSignature: numberField(help, "activeSignature"),
          signatures: signatures.flatMap((signatureValue) => {
            const signature = asJsonObject(signatureValue);
            if (signature == null) {
              return [];
            }
            const parameters = arrayField(signature, "parameters") ?? [];
            return [
              {
                documentation: toDocument(signature.documentation),
                label: stringField(signature, "label") ?? "",
                parameters: parameters.flatMap((parameterValue) => {
                  const parameter = asJsonObject(parameterValue);
                  if (parameter == null) {
                    return [];
                  }
                  const labelValue = parameter.label;
                  let label: string | [number, number] = "";
                  if (typeof labelValue === "string") {
                    label = labelValue;
                  } else if (
                    Array.isArray(labelValue) &&
                    labelValue.length === 2 &&
                    typeof labelValue[0] === "number" &&
                    typeof labelValue[1] === "number"
                  ) {
                    label = [labelValue[0], labelValue[1]];
                  }
                  return [
                    {
                      documentation: toDocument(parameter.documentation),
                      label,
                    },
                  ];
                }),
              },
            ];
          }),
        },
      };
    },
    signatureHelpRetriggerCharacters:
      arrayField(signatureHelpProvider, "retriggerCharacters")?.filter(
        (value): value is string => typeof value === "string"
      ) ?? [],
    signatureHelpTriggerCharacters: arrayField(
      signatureHelpProvider,
      "triggerCharacters"
    )?.filter((value): value is string => typeof value === "string") ?? [
      "(",
      ",",
    ],
  });

  monaco.languages.registerDefinitionProvider(lang, {
    provideDefinition: async (model, position) => {
      const client = readyClient(model);
      if (!client) {
        return null;
      }
      const res = await client
        .request("textDocument/definition", documentParameters(model, position))
        .catch(() => null);
      return toLocations(res);
    },
  });

  monaco.languages.registerReferenceProvider(lang, {
    provideReferences: async (model, position) => {
      const client = readyClient(model);
      if (!client) {
        return null;
      }
      const res = await client
        .request("textDocument/references", {
          ...documentParameters(model, position),
          context: { includeDeclaration: true },
        })
        .catch(() => null);
      return toLocations(res);
    },
  });

  monaco.languages.registerDocumentFormattingEditProvider(lang, {
    provideDocumentFormattingEdits: async (model) => {
      const client = readyClient(model);
      if (!client) {
        return null;
      }
      const res = await client
        .request("textDocument/formatting", {
          options: {
            insertSpaces: model.getOptions().insertSpaces,
            tabSize: model.getOptions().tabSize,
          },
          textDocument: { uri: pathToUri(model.uri.path) },
        })
        .catch(() => null);
      if (!Array.isArray(res)) {
        return null;
      }
      return res.flatMap((entry) => {
        const edit = asJsonObject(entry);
        if (edit == null) {
          return [];
        }
        return [
          {
            range: toMonacoRange(objectField(edit, "range")),
            text: stringField(edit, "newText") ?? "",
          },
        ];
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

export function applyDiagnostics(uri: string, diagnostics: unknown[]): void {
  const model = monaco.editor.getModel(monaco.Uri.parse(uri));
  if (!model) {
    return;
  }
  const markers: monaco.editor.IMarkerData[] = diagnostics.flatMap((entry) => {
    const diagnostic = asJsonObject(entry);
    if (diagnostic == null) {
      return [];
    }
    const codeValue = diagnostic.code;
    let code: string | undefined;
    if (typeof codeValue === "string") {
      code = codeValue;
    } else if (typeof codeValue === "number") {
      code = String(codeValue);
    } else {
      const codeObject = asJsonObject(codeValue);
      const nested = codeObject?.value;
      code =
        typeof nested === "string"
          ? nested
          : typeof nested === "number"
            ? String(nested)
            : nested != null
              ? String(nested)
              : undefined;
    }
    return [
      {
        ...toMonacoRange(objectField(diagnostic, "range")),
        code,
        message: String(stringField(diagnostic, "message") ?? ""),
        severity:
          SEVERITY[numberField(diagnostic, "severity", 1) - 1] ??
          monaco.MarkerSeverity.Error,
        source: stringField(diagnostic, "source") ?? undefined,
      },
    ];
  });
  monaco.editor.setModelMarkers(model, "codetwo-lsp", markers);
}
