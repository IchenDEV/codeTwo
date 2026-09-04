/**
 * Sort object-literal keys to satisfy ESLint sort-keys (asc, caseSensitive).
 * Spreads / unnamed computed keys split sort groups.
 */
import { Node, Project, SyntaxKind } from "ts-morph";

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
  compilerOptions: {
    allowJs: true,
    jsx: 4,
    target: 99,
  },
});

project.addSourceFilesAtPaths(["src/**/*.{ts,tsx,js,jsx}"]);

function keyName(node: Node): string | null {
  if (
    Node.isPropertyAssignment(node) ||
    Node.isShorthandPropertyAssignment(node)
  ) {
    return node.getName() ?? null;
  }
  if (
    Node.isMethodDeclaration(node) ||
    Node.isGetAccessorDeclaration(node) ||
    Node.isSetAccessorDeclaration(node)
  ) {
    const nameNode = node.getNameNode();
    if (Node.isComputedPropertyName(nameNode)) return null;
    return node.getName();
  }
  return null;
}

let filesChanged = 0;
let objectsSorted = 0;

for (const sourceFile of project.getSourceFiles()) {
  let fileTouched = false;
  // Collect first, mutate deepest-first via reverse document order of starts.
  const literals = sourceFile
    .getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
    .sort((a, b) => b.getStart() - a.getStart());

  for (const node of literals) {
    if (node.wasForgotten()) continue;
    const props = node.getProperties();
    if (props.length < 2) continue;

    type Segment =
      | { kind: "barrier"; text: string }
      | { kind: "group"; items: { key: string; text: string }[] };

    const segments: Segment[] = [];
    let group: { key: string; text: string }[] = [];
    const flush = () => {
      if (group.length) {
        segments.push({ kind: "group", items: group });
        group = [];
      }
    };

    for (const prop of props) {
      if (Node.isSpreadAssignment(prop)) {
        flush();
        segments.push({ kind: "barrier", text: prop.getText() });
        continue;
      }
      const key = keyName(prop);
      if (key === null) {
        flush();
        segments.push({ kind: "barrier", text: prop.getText() });
        continue;
      }
      group.push({ key, text: prop.getText() });
    }
    flush();

    let needs = false;
    const sortedSegments = segments.map((segment) => {
      if (segment.kind === "barrier") return segment;
      const before = segment.items.map((item) => item.key).join("\0");
      const items = [...segment.items].sort((a, b) =>
        a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
      );
      const after = items.map((item) => item.key).join("\0");
      if (before !== after) needs = true;
      return { kind: "group" as const, items };
    });
    if (!needs) continue;

    const parts: string[] = [];
    for (const segment of sortedSegments) {
      if (segment.kind === "barrier") parts.push(segment.text);
      else parts.push(...segment.items.map((item) => item.text));
    }
    const multiline = node.getText().includes("\n");
    const inner = multiline ? `\n${parts.join(",\n")},\n` : parts.join(", ");
    node.replaceWithText(`{${inner}}`);
    fileTouched = true;
    objectsSorted += 1;
  }

  if (fileTouched) {
    filesChanged += 1;
    sourceFile.saveSync();
  }
}

console.log(JSON.stringify({ filesChanged, objectsSorted }));
