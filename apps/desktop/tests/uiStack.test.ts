import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const sourceFiles = (directory: string): string[] =>
  readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.tsx?$/.test(entry.name) ? [relative] : [];
  });

describe("desktop UI stack", () => {
  test("configures shadcn for Base UI", () => {
    const config = JSON.parse(read("components.json"));
    const packageJson = JSON.parse(read("package.json"));

    expect(config.style).toStartWith("base-");
    expect(packageJson.dependencies["@base-ui/react"]).toBeTruthy();
    expect(packageJson.dependencies["radix-ui"]).toBeUndefined();
  });

  test("keeps primitives behind shared components and removes legacy composition", () => {
    const uiSource = sourceFiles("src/components/ui").map(read).join("\n");
    const productSource = sourceFiles("src")
      .filter((path) => !path.startsWith("src/components/ui/"))
      .map(read)
      .join("\n");

    expect(uiSource).not.toContain('from "radix-ui"');
    expect(uiSource).not.toContain('from "@radix-ui');
    expect(productSource).not.toContain('from "@base-ui/react');
    expect(productSource).not.toContain('from "radix-ui"');
    expect(productSource).not.toContain("asChild");
  });

  test("uses the documented semantic radius scale for shared surfaces", () => {
    const cardSource = read("src/components/ui/card.tsx");
    const badgeSource = read("src/components/ui/badge.tsx");
    const productSource = sourceFiles("src").map(read).join("\n");

    expect(cardSource).toContain("rounded-(--ds-card-radius)");
    expect(cardSource).not.toContain("rounded-xl");
    expect(badgeSource).toContain("rounded-(--ds-radius-micro)");
    expect(badgeSource).not.toContain("rounded-full");
    expect(productSource).not.toContain("--ds-radius-panel");
  });

  test("documents selected AI Elements as the AI-native presentation source", () => {
    const designLaw = read("../../docs/design.md");

    expect(designLaw).toContain("selected AI Elements");
    expect(designLaw).toContain("C2 tokens and ACP data");
  });
});
