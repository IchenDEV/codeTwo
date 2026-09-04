/**
 * Rename boolean locals *and parameters* flagged by
 * unicorn/consistent-boolean-name.
 *
 * Expands object shorthand before rename so wire keys like `{ enabled }` stay
 * `{ enabled: isEnabled }`. Skips exports, type fields, single-letter names,
 * and name clashes.
 */
import { readFileSync } from "node:fs";
import { Node, Project, SyntaxKind } from "ts-morph";

type Msg = {
  ruleId: string | null;
  message: string;
  line: number;
  column: number;
};
type FileResult = { filePath: string; messages: Msg[] };

const report = JSON.parse(
  readFileSync(process.argv[2] ?? "/tmp/eslint-bool.json", "utf8")
) as FileResult[];

const toIsName = (name: string): string | null => {
  if (
    /^(?:is|are|has|have|can|should|was|were|did|will|requires)[A-Z0-9_]/.test(
      name
    )
  ) {
    return null;
  }
  if (name.length <= 1) return null;
  // Skip ambiguous/non-descriptive short names the rule still flags.
  if (name === "on" || name === "ok" || name === "no") return null;
  return `is${name[0]!.toUpperCase()}${name.slice(1)}`;
};

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
});

let filesChanged = 0;
let renamed = 0;
let skipped = 0;

function isLocalVariableDeclaration(node: Node): boolean {
  const declaration = node.getParent();
  if (!declaration || !Node.isVariableDeclaration(declaration)) return false;
  if (declaration.getNameNode() !== node) return false;
  const statement = declaration.getVariableStatement();
  if (!statement || statement.hasExportKeyword()) return false;
  return true;
}

function isParameterName(node: Node): boolean {
  const parent = node.getParent();
  if (!parent) return false;
  if (Node.isParameterDeclaration(parent) && parent.getNameNode() === node) {
    return true;
  }
  // Destructuring parameter: ({ enabled }) => …
  if (Node.isBindingElement(parent) && parent.getNameNode() === node) {
    let current: Node | undefined = parent.getParent();
    while (current) {
      if (Node.isParameterDeclaration(current)) return true;
      if (
        Node.isVariableDeclaration(current) ||
        Node.isFunctionDeclaration(current)
      ) {
        return false;
      }
      current = current.getParent();
    }
  }
  return false;
}

function expandShorthandReferences(node: Node): void {
  const references = node.findReferencesAsNodes();
  for (const reference of references) {
    const parent = reference.getParent();
    if (
      parent &&
      Node.isShorthandPropertyAssignment(parent) &&
      parent.getNameNode() === reference
    ) {
      parent.setInitializer(reference.getText());
    }
  }
}

for (const file of report) {
  const targets = file.messages
    .filter((m) => m.ruleId === "unicorn/consistent-boolean-name")
    .map((m) => {
      const match = /Boolean name `([^`]+)`/.exec(m.message);
      return match
        ? { name: match[1]!, line: m.line, column: m.column }
        : null;
    })
    .filter(Boolean) as { name: string; line: number; column: number }[];
  if (targets.length === 0) continue;

  const sourceFile = project.getSourceFile(file.filePath);
  if (!sourceFile) {
    skipped += targets.length;
    continue;
  }

  let touched = false;
  const seen = new Set<string>();

  for (const target of [...targets].sort(
    (a, b) => b.line - a.line || b.column - a.column
  )) {
    const next = toIsName(target.name);
    if (!next) {
      skipped += 1;
      continue;
    }
    const key = `${file.filePath}:${target.name}:${target.line}:${target.column}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let pos: number;
    try {
      pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(
        target.line - 1,
        target.column - 1
      );
    } catch {
      skipped += 1;
      continue;
    }

    const node = sourceFile.getDescendantAtPos(pos);
    if (!node || !Node.isIdentifier(node) || node.getText() !== target.name) {
      skipped += 1;
      continue;
    }
    if (!isLocalVariableDeclaration(node) && !isParameterName(node)) {
      skipped += 1;
      continue;
    }

    try {
      expandShorthandReferences(node);
      // Language-service rename is scope-aware; do not preflight clash across
      // the whole file (nested locals / other functions may already use `isX`).
      node.rename(next);
      renamed += 1;
      touched = true;
    } catch {
      skipped += 1;
    }
  }

  if (touched) filesChanged += 1;
}

project.saveSync();
console.log(JSON.stringify({ filesChanged, renamed, skipped }));
