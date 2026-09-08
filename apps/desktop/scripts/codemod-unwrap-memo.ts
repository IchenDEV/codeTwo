/**
 * Unwrap useMemo / useCallback to satisfy react-doctor/react-compiler-no-manual-memoization.
 */
import { Node, Project, SyntaxKind } from "ts-morph";

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
  compilerOptions: { allowJs: true, jsx: 4, target: 99 },
});
project.addSourceFilesAtPaths(["src/**/*.{ts,tsx}"]);

let filesChanged = 0;
let unwrapped = 0;

const isMemoCallee = (text: string) =>
  text === "useMemo" ||
  text === "useCallback" ||
  text.endsWith(".useMemo") ||
  text.endsWith(".useCallback");

for (const sourceFile of project.getSourceFiles()) {
  let touched = false;
  const calls = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .toSorted((a, b) => b.getStart() - a.getStart());

  for (const call of calls) {
    if (call.wasForgotten()) continue;
    const expr = call.getExpression();
    const callee = expr.getText();
    if (!isMemoCallee(callee)) continue;
    const args = call.getArguments();
    if (args.length < 1) continue;
    const factory = args[0];
    let replacement: string | null = null;

    if (callee.endsWith("useCallback") || callee === "useCallback") {
      replacement = factory.getText();
    } else if (
      (callee.endsWith("useMemo") || callee === "useMemo") &&
      Node.isIdentifier(factory)
    ) {
      // useMemo(fn, deps) evaluates fn(); do not leave the bare function reference.
      replacement = `${factory.getText()}()`;
    } else if (
      Node.isArrowFunction(factory) ||
      Node.isFunctionExpression(factory)
    ) {
      const body = factory.getBody();
      if (Node.isBlock(body)) {
        const statements = body.getStatements();
        if (
          statements.length === 1 &&
          Node.isReturnStatement(statements[0]) &&
          statements[0].getExpression()
        ) {
          replacement = `(${statements[0].getExpression()!.getText()})`;
        } else {
          replacement = `(${factory.getText()})()`;
        }
      } else {
        replacement = `(${body.getText()})`;
      }
    } else {
      replacement = factory.getText();
    }

    if (replacement == null || replacement === "") continue;
    call.replaceWithText(replacement);
    unwrapped += 1;
    touched = true;
  }

  if (!touched) continue;

  // Drop unused React memo imports.
  for (const imp of sourceFile.getImportDeclarations()) {
    if (imp.getModuleSpecifierValue() !== "react") continue;
    for (const named of [...imp.getNamedImports()]) {
      const name = named.getName();
      if (name !== "useMemo" && name !== "useCallback") continue;
      const idCount = sourceFile
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .filter((id) => id.getText() === name).length;
      if (idCount <= 1) named.remove();
    }
    if (
      imp.getNamedImports().length === 0 &&
      !imp.getDefaultImport() &&
      !imp.getNamespaceImport()
    ) {
      imp.remove();
    }
  }

  filesChanged += 1;
  sourceFile.saveSync();
}

console.log(JSON.stringify({ filesChanged, unwrapped }));
