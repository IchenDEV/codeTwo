/**
 * Convert named arrow React components to function declarations for
 * `react/function-component-definition` (namedComponents: function-declaration).
 *
 * Handles:
 *   const Foo = (props) => (jsx)
 *   const Foo = (props) => { ... return jsx }
 *   export const Foo = ...
 *
 * Skips: default exports, non-PascalCase names, multi-declarators, generators.
 */
import { Node, Project, SyntaxKind } from "ts-morph";

const roots = process.argv.slice(2);
const patterns =
  roots.length > 0
    ? roots
    : ["src/components/**/*.{ts,tsx}", "src/design/**/*.{ts,tsx}"];

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
  compilerOptions: {
    allowJs: true,
    jsx: 4,
    target: 99,
  },
});

project.addSourceFilesAtPaths(patterns);

function isPascalCase(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/u.test(name);
}

function returnsJsx(body: import("ts-morph").Node): boolean {
  if (
    Node.isJsxElement(body) ||
    Node.isJsxSelfClosingElement(body) ||
    Node.isJsxFragment(body)
  ) {
    return true;
  }
  if (Node.isParenthesizedExpression(body)) {
    return returnsJsx(body.getExpression());
  }
  if (Node.isBlock(body)) {
    return body
      .getDescendantsOfKind(SyntaxKind.ReturnStatement)
      .some((statement) => {
        const expression = statement.getExpression();
        return expression ? returnsJsx(expression) : false;
      });
  }
  if (Node.isConditionalExpression(body)) {
    return returnsJsx(body.getWhenTrue()) || returnsJsx(body.getWhenFalse());
  }
  return false;
}

let filesChanged = 0;
let converted = 0;

for (const sourceFile of project.getSourceFiles()) {
  let fileTouched = false;
  const variableStatements = sourceFile
    .getDescendants()
    .filter(Node.isVariableStatement)
    .toSorted((a, b) => b.getStart() - a.getStart());

  for (const statement of variableStatements) {
    if (statement.wasForgotten() || statement.hasDeclareKeyword()) {
      continue;
    }
    const declarations = statement.getDeclarations();
    if (declarations.length !== 1) {
      continue;
    }
    const declaration = declarations[0];
    const nameNode = declaration.getNameNode();
    if (!Node.isIdentifier(nameNode)) {
      continue;
    }
    const bindingName = nameNode.getText();
    if (!isPascalCase(bindingName)) {
      continue;
    }
    const initializer = declaration.getInitializer();
    if (!initializer || !Node.isArrowFunction(initializer)) {
      continue;
    }
    if (initializer.isAsync()) {
      continue;
    }
    const body = initializer.getBody();
    if (!body || !returnsJsx(body)) {
      continue;
    }

    const typeParams = initializer
      .getTypeParameters()
      .map((parameter) => parameter.getText());
    const params = initializer
      .getParameters()
      .map((parameter) => parameter.getText())
      .join(", ");
    const returnType = initializer.getReturnTypeNode()?.getText();
    const typeParamText = typeParams.length ? `<${typeParams.join(", ")}>` : "";
    const returnText =
      returnType != null && returnType !== "" ? `: ${returnType}` : "";
    const exportText = statement.hasExportKeyword() ? "export " : "";

    let functionBody: string;
    if (Node.isBlock(body)) {
      functionBody = body.getText();
    } else {
      functionBody = `{ return ${body.getText()}; }`;
    }

    const replacement = `${exportText}function ${bindingName}${typeParamText}(${params})${returnText} ${functionBody}`;
    statement.replaceWithText(replacement);
    fileTouched = true;
    converted += 1;
  }

  if (fileTouched) {
    filesChanged += 1;
    sourceFile.saveSync();
  }
}

console.log(JSON.stringify({ filesChanged, converted, patterns }));
