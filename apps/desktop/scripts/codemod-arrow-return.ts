/**
 * Convert multiline expression-bodied arrows in .ts files to block+return,
 * satisfying unicorn/consistent-arrow-return-style for non-TSX sources.
 */
import { Node, Project, SyntaxKind } from "ts-morph";

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
  compilerOptions: { allowJs: true, jsx: 4, target: 99 },
});
project.addSourceFilesAtPaths(["src/**/*.ts", "tests/**/*.ts"]);

let filesChanged = 0;
let converted = 0;

for (const sourceFile of project.getSourceFiles()) {
  let touched = false;
  const arrows = sourceFile
    .getDescendantsOfKind(SyntaxKind.ArrowFunction)
    .toSorted((a, b) => b.getStart() - a.getStart());

  for (const arrow of arrows) {
    if (arrow.wasForgotten()) {
      continue;
    }
    const body = arrow.getBody();
    // Already a block.
    if (Node.isBlock(body)) {
      const statements = body.getStatements();
      // Single `return expr;` on one conceptual line can stay or become implicit —
      // only collapse if the rule wants implicit; we leave blocks alone here.
      continue;
    }
    // Expression body: only wrap when the expression spans multiple lines.
    const text = body.getText();
    if (!text.includes("\n")) {
      continue;
    }
    body.replaceWithText(`{\nreturn ${text};\n}`);
    converted += 1;
    touched = true;
  }

  if (touched) {
    filesChanged += 1;
    sourceFile.saveSync();
  }
}

console.log(JSON.stringify({ filesChanged, converted }));
