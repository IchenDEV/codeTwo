/**
 * Convert eslint arrow-body-style single-return blocks to expression bodies.
 * Uses parenthesized object literals so `() => ({ ... })` stays valid.
 */
import { readFileSync } from "node:fs";
import { Node, Project, SyntaxKind } from "ts-morph";

type Msg = { ruleId: string | null; line: number };
type FileResult = { filePath: string; messages: Msg[] };

const report = JSON.parse(
  readFileSync(process.argv[2] ?? "/tmp/eslint-desktop.json", "utf8")
) as FileResult[];

const project = new Project({ tsConfigFilePath: "tsconfig.json" });

const byFile = new Map<string, Set<number>>();
for (const file of report) {
  const lines = file.messages
    .filter(
      (message) =>
        message.ruleId === "arrow-body-style" ||
        message.ruleId === "unicorn/consistent-arrow-return-style"
    )
    .map((message) => message.line);
  if (lines.length > 0) {
    byFile.set(file.filePath, new Set(lines));
  }
}

let files = 0;
let converted = 0;
let skipped = 0;

for (const [filePath, lines] of byFile) {
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    skipped += lines.size;
    continue;
  }

  let fileConverted = 0;
  // Re-scan after each edit so positions stay valid.
  for (;;) {
    const candidate = sourceFile
      .getDescendantsOfKind(SyntaxKind.ArrowFunction)
      .find((arrow) => {
        const body = arrow.getBody();
        if (!Node.isBlock(body)) {
          return false;
        }
        const startLine = arrow.getStartLineNumber();
        const bodyLine = body.getStartLineNumber();
        const endLine = body.getEndLineNumber();
        const flagged = [...lines].some(
          (line) =>
            Math.abs(line - startLine) <= 1 ||
            Math.abs(line - bodyLine) <= 1 ||
            (line >= startLine && line <= endLine)
        );
        if (!flagged) {
          return false;
        }
        const statements = body.getStatements();
        if (statements.length !== 1 || !Node.isReturnStatement(statements[0])) {
          return false;
        }
        return statements[0].getExpression() !== undefined;
      });

    if (!candidate) {
      break;
    }

    const body = candidate.getBody();
    if (!Node.isBlock(body)) {
      skipped += 1;
      break;
    }
    const statements = body.getStatements();
    const expression = Node.isReturnStatement(statements[0])
      ? statements[0].getExpression()
      : undefined;
    if (!expression) {
      skipped += 1;
      break;
    }

    const text = expression.getText();
    const needsParens =
      Node.isObjectLiteralExpression(expression) ||
      Node.isFunctionExpression(expression) ||
      Node.isClassExpression(expression) ||
      text.trimStart().startsWith("{");

    try {
      body.replaceWithText(needsParens ? `(${text})` : text);
      converted += 1;
      fileConverted += 1;
    } catch {
      skipped += 1;
      break;
    }
  }

  if (fileConverted > 0) {
    files += 1;
  }
}

project.saveSync();
console.log(JSON.stringify({ files, converted, skipped }));
