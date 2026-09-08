/**
 * Convert `const name = [async] function [name](...)` to function declarations
 * for the house `func-style: declaration` standard.
 *
 * Uses the binding name (not the optional expression name). Leaves arrow
 * const bindings alone.
 */
import { Node, Project } from "ts-morph";

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
  compilerOptions: {
    allowJs: true,
    jsx: 4,
    target: 99,
  },
});

project.addSourceFilesAtPaths([
  "src/**/*.{ts,tsx,js,jsx}",
  "tests/**/*.{ts,tsx}",
]);

let filesChanged = 0;
let converted = 0;

for (const sourceFile of project.getSourceFiles()) {
  let fileTouched = false;

  // Variable statements can nest inside functions/blocks — walk all of them.
  const variableStatements = sourceFile
    .getDescendants()
    .filter(Node.isVariableStatement)
    .toSorted((a, b) => b.getStart() - a.getStart());

  for (const statement of variableStatements) {
    if (statement.wasForgotten()) continue;
    // Skip `declare const` ambient bindings.
    if (statement.hasDeclareKeyword()) continue;
    const declarations = statement.getDeclarations();
    if (declarations.length !== 1) continue;
    const declaration = declarations[0];
    const name = declaration.getNameNode();
    if (!Node.isIdentifier(name)) continue;
    const bindingName = name.getText();
    const initializer = declaration.getInitializer();
    if (!initializer || !Node.isFunctionExpression(initializer)) continue;
    if (initializer.isGenerator()) continue;

    const typeParams = initializer
      .getTypeParameters()
      .map((parameter) => parameter.getText());
    const params = initializer
      .getParameters()
      .map((parameter) => parameter.getText())
      .join(", ");
    const returnType = initializer.getReturnTypeNode()?.getText();
    const body = initializer.getBody()?.getText() ?? "{}";
    const asyncText = initializer.isAsync() ? "async " : "";
    const typeParamText = typeParams.length ? `<${typeParams.join(", ")}>` : "";
    const returnText =
      returnType != null && returnType !== "" ? `: ${returnType}` : "";
    const exportText = statement.hasExportKeyword() ? "export " : "";

    const replacement = `${exportText}${asyncText}function ${bindingName}${typeParamText}(${params})${returnText} ${body}`;
    statement.replaceWithText(replacement);
    fileTouched = true;
    converted += 1;
  }

  if (fileTouched) {
    filesChanged += 1;
    sourceFile.saveSync();
  }
}

console.log(JSON.stringify({ filesChanged, converted }));
