/**
 * Replace role="status" with <output> where the jsx-a11y rule requires it.
 * Handles simple cases: element with role=status becomes output (preserving other attrs).
 */
import { Node, Project, SyntaxKind } from "ts-morph";

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
  compilerOptions: { allowJs: true, jsx: 4, target: 99 },
});
project.addSourceFilesAtPaths(["src/**/*.{tsx,jsx}"]);

let filesChanged = 0;
let replaced = 0;

for (const sourceFile of project.getSourceFiles()) {
  let touched = false;
  const jsxes = sourceFile
    .getDescendantsOfKind(SyntaxKind.JsxElement)
    .concat(
      sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement) as never,
    )
    .sort((a, b) => b.getStart() - a.getStart());

  // Self-closing
  for (const el of sourceFile
    .getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)
    .sort((a, b) => b.getStart() - a.getStart())) {
    if (el.wasForgotten()) continue;
    const role = el.getAttribute("role");
    if (!role || !Node.isJsxAttribute(role)) continue;
    const init = role.getInitializer();
    const value = init?.getText().replaceAll(/['"]/g, "");
    if (value !== "status") continue;
    const tag = el.getTagNameNode().getText();
    if (tag === "output") {
      role.remove();
      touched = true;
      replaced += 1;
      continue;
    }
    // Only convert semantic-neutral hosts
    if (!["div", "span", "p", "section", "li"].includes(tag)) continue;
    el.getTagNameNode().replaceWithText("output");
    role.remove();
    touched = true;
    replaced += 1;
  }

  for (const el of sourceFile
    .getDescendantsOfKind(SyntaxKind.JsxElement)
    .sort((a, b) => b.getStart() - a.getStart())) {
    if (el.wasForgotten()) continue;
    const opening = el.getOpeningElement();
    const role = opening.getAttribute("role");
    if (!role || !Node.isJsxAttribute(role)) continue;
    const init = role.getInitializer();
    const value = init?.getText().replaceAll(/['"]/g, "");
    if (value !== "status") continue;
    const tag = opening.getTagNameNode().getText();
    if (tag === "output") {
      role.remove();
      touched = true;
      replaced += 1;
      continue;
    }
    if (!["div", "span", "p", "section", "li"].includes(tag)) continue;
    opening.getTagNameNode().replaceWithText("output");
    el.getClosingElement().getTagNameNode().replaceWithText("output");
    role.remove();
    touched = true;
    replaced += 1;
  }

  if (touched) {
    filesChanged += 1;
    sourceFile.saveSync();
  }
}

console.log(JSON.stringify({ filesChanged, replaced }));
