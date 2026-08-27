import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  checkBuiltDesignCss,
  checkContrastContracts,
  countOccurrences,
  fingerprint,
  increases,
  newOccurrences,
  scanSource,
} from "../scripts/check-design-system";
import { cn } from "../src/lib/utils";

const root = resolve(import.meta.dir, "..");
const tokenSource = readFileSync(resolve(root, "src/design/tokens.css"), "utf8");
const styleSource = readFileSync(resolve(root, "src/styles.css"), "utf8");
const mainSource = readFileSync(resolve(root, "src/main.tsx"), "utf8");
const allowlist = JSON.parse(
  readFileSync(resolve(root, "scripts/design-system-allowlist.json"), "utf8"),
);
const baseline = JSON.parse(
  readFileSync(resolve(root, "scripts/design-system-baseline.json"), "utf8"),
);

const currentViolations = scanSource(root, allowlist);
const currentNewDesignViolations = [
  ...increases(currentViolations, baseline),
  ...newOccurrences(currentViolations, baseline),
];

function newDesignViolations() {
  return currentNewDesignViolations;
}

describe("C2 design system", () => {
  test("keeps every declared light and dark contrast pair above its contract", () => {
    const results = checkContrastContracts(tokenSource);
    expect(results).toHaveLength(20);
    for (const result of results) {
      expect(result.ratio).toBeGreaterThanOrEqual(result.minimum);
    }
  });

  test("keeps the eight approved type roles in the token source", () => {
    for (const role of [
      "large-title",
      "page-title",
      "section",
      "dialog",
      "body",
      "callout",
      "metadata",
      "caption",
    ]) {
      expect(tokenSource).toContain(`--ds-type-${role}-size:`);
      expect(tokenSource).toContain(`--ds-type-${role}-leading:`);
    }
  });

  test("loads tokens through Tailwind and exposes every semantic type utility", () => {
    expect(styleSource).toContain('@import "./design/tokens.css";');
    expect(mainSource).not.toContain('import "./design/tokens.css";');
    for (const role of [
      "large-title",
      "page",
      "section",
      "dialog",
      "body",
      "callout",
      "metadata",
      "caption",
      "code",
    ]) {
      expect(styleSource).toContain(`--text-${role}: var(`);
      expect(styleSource).toContain(`--text-${role}--line-height: var(`);
    }
  });

  test("exposes design-system roles through named Tailwind utilities", () => {
    for (const [utilityToken, designToken] of [
      ["--color-canvas", "--ds-color-canvas"],
      ["--color-surface", "--ds-color-surface"],
      ["--color-raised", "--ds-color-raised"],
      ["--color-modal", "--ds-color-modal"],
      ["--color-overlay", "--ds-color-overlay"],
      ["--color-content", "--ds-color-text"],
      ["--color-content-muted", "--ds-color-text-muted"],
      ["--color-status-success", "--ds-color-success"],
      ["--color-viz-series-1", "--ds-color-viz-series-1"],
      ["--color-viz-series-6", "--ds-color-viz-series-6"],
      ["--radius-control", "--ds-radius-control"],
      ["--radius-module", "--ds-radius-module"],
      ["--radius-modal", "--ds-radius-modal"],
      ["--spacing-control", "--ds-control-normal"],
      ["--spacing-control-field", "--ds-control-field"],
      ["--spacing-icon-control", "--ds-icon-control"],
      ["--spacing-titlebar", "--ds-titlebar-height"],
      ["--spacing-layout-titlebar", "--ds-layout-titlebar-height"],
      ["--spacing-panel-strip", "--ds-panel-strip-height"],
      ["--shadow-raised", "--ds-elevation-raised"],
      ["--shadow-modal", "--ds-elevation-modal"],
      ["--transition-duration-feedback", "--ds-motion-feedback"],
      ["--ease-enter", "--ds-ease-enter"],
    ]) {
      expect(styleSource).toContain(`${utilityToken}: var(${designToken});`);
    }
  });

  test("keeps semantic type and color utilities when classes are merged", () => {
    expect(cn("text-body", "text-muted-foreground")).toBe("text-body text-muted-foreground");
    expect(cn("text-body", "text-status-success")).toBe("text-body text-status-success");
    expect(cn("text-page", "text-body")).toBe("text-body");
    expect(cn("rounded-control", "rounded-module")).toBe("rounded-module");
    expect(cn("h-control", "h-control-field")).toBe("h-control-field");
    expect(cn("shadow-surface", "shadow-raised")).toBe("shadow-raised");
    expect(cn("duration-feedback", "duration-layer")).toBe("duration-layer");
    expect(cn("ease-enter", "ease-exit")).toBe("ease-exit");
  });

  test("keeps core control focus styling on the named Tailwind contract", () => {
    for (const path of [
      "button.tsx",
      "input.tsx",
      "textarea.tsx",
      "checkbox.tsx",
      "scroll-area.tsx",
      "badge.tsx",
    ]) {
      const source = readFileSync(resolve(root, "src/components/ui", path), "utf8");
      expect(source).toContain("focus-visible:focus-ring");
      expect(source).not.toContain("focus-visible:ring-[3px]");
    }
  });

  test("rejects raw focus ring implementation classes in product source", () => {
    expect(newDesignViolations().filter((violation) => violation.rule === "raw-focus-ring"))
      .toEqual([]);

    const fixture = mkdtempSync(resolve(tmpdir(), "codetwo-design-system-"));
    try {
      mkdirSync(resolve(fixture, "src"));
      writeFileSync(
        resolve(fixture, "src/Product.tsx"),
        'export const Product = () => <button className="focus-visible:ring-2 focus-visible:ring-ring/50" />;\n',
      );
      const focusRings = scanSource(fixture, { entries: [] }).filter(
        (violation) => violation.rule === "raw-focus-ring",
      );
      expect(focusRings.map((violation) => violation.value)).toEqual([
        "focus-visible:ring-2",
        "focus-visible:ring-ring/50",
      ]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("rejects direct custom-property references in product source", () => {
    expect(newDesignViolations().filter((violation) => violation.rule === "direct-ds-token"))
      .toEqual([]);

    const fixture = mkdtempSync(resolve(tmpdir(), "codetwo-design-system-"));
    try {
      mkdirSync(resolve(fixture, "src"));
      writeFileSync(
        resolve(fixture, "src/Product.tsx"),
        'export const Product = () => <div className="rounded-(--ds-radius-control)" style={{ color: "var(--foreground)" }} />;\n',
      );
      const direct = scanSource(fixture, { entries: [] }).filter(
        (violation) => violation.rule === "direct-ds-token",
      );
      expect(direct).toHaveLength(2);
      expect(direct.map((violation) => violation.value)).toEqual([
        "--ds-radius-control",
        "var(--foreground)",
      ]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("keeps spinner motion inside the shared primitive", () => {
    expect(newDesignViolations().filter((violation) => violation.rule === "raw-spinner"))
      .toEqual([]);

    const fixture = mkdtempSync(resolve(tmpdir(), "codetwo-design-system-"));
    try {
      mkdirSync(resolve(fixture, "src/components/ui"), { recursive: true });
      writeFileSync(
        resolve(fixture, "src/Product.tsx"),
        'export const Product = () => <span className="animate-spin" />;\n',
      );
      writeFileSync(
        resolve(fixture, "src/components/ui/spinner.tsx"),
        'export const Spinner = () => <span className="animate-spin" />;\n',
      );
      const spinners = scanSource(fixture, { entries: [] }).filter(
        (violation) => violation.rule === "raw-spinner",
      );
      expect(spinners).toHaveLength(1);
      expect(spinners[0]?.path).toBe("src/Product.tsx");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("keeps native textareas inside the shared primitive", () => {
    expect(newDesignViolations().filter((violation) => violation.rule === "raw-textarea"))
      .toEqual([]);

    const fixture = mkdtempSync(resolve(tmpdir(), "codetwo-design-system-"));
    try {
      mkdirSync(resolve(fixture, "src/components/ui"), { recursive: true });
      writeFileSync(
        resolve(fixture, "src/Product.tsx"),
        "export const Product = () => <textarea />;\n",
      );
      writeFileSync(
        resolve(fixture, "src/components/ui/textarea.tsx"),
        "export const Textarea = () => <textarea />;\n",
      );
      const textareas = scanSource(fixture, { entries: [] }).filter(
        (violation) => violation.rule === "raw-textarea",
      );
      expect(textareas).toHaveLength(1);
      expect(textareas[0]?.path).toBe("src/Product.tsx");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("keeps shared form controls on semantic Tailwind roles", () => {
    const paths = [
      "src/components/ui/input.tsx",
      "src/components/ui/textarea.tsx",
      "src/components/ui/checkbox.tsx",
      "src/components/ui/field.tsx",
    ];
    const violations = newDesignViolations().filter((violation) =>
      paths.includes(violation.path),
    );
    expect(violations).toEqual([]);

    const inputSource = readFileSync(resolve(root, paths[0]), "utf8");
    expect(inputSource).toContain("data-[size=default]:h-control-field");
    expect(inputSource).toContain("data-[size=compact]:h-control");

    const textareaSource = readFileSync(resolve(root, paths[1]), "utf8");
    expect(textareaSource).toContain("data-[size=default]:min-h-24");
    expect(textareaSource).toContain("data-[size=compact]:min-h-control-field");
  });

  test("keeps shared action, navigation, and dialog chrome on semantic Tailwind roles", () => {
    const paths = [
      "src/components/ui/button.tsx",
      "src/components/business/navigation-row.tsx",
    ];
    const violations = newDesignViolations().filter((violation) =>
      paths.includes(violation.path),
    );
    expect(violations).toEqual([]);

    const buttonSource = readFileSync(resolve(root, paths[0]), "utf8");
    expect(buttonSource).toContain('default: "h-control');
    expect(buttonSource).toContain('row:');
    expect(buttonSource).toContain('focusStyle:');

    const navigationSource = readFileSync(resolve(root, paths[1]), "utf8");
    expect(navigationSource).toContain('data-slot="navigation-row"');
    expect(navigationSource).toContain('focusStyle="inset"');
  });

  test("keeps shared cards and transient layers on semantic surfaces", () => {
    const paths = [
      "src/components/ui/popover.tsx",
      "src/components/ui/dropdown-menu.tsx",
      "src/components/ui/tooltip.tsx",
      "src/ui/toast.tsx",
    ];
    const violations = newDesignViolations().filter((violation) =>
      paths.includes(violation.path),
    );
    expect(violations).toEqual([]);

    for (const path of paths) {
      const source = readFileSync(resolve(root, path), "utf8");
      expect(source).toContain("bg-raised");
      expect(source).toMatch(/shadow-(?:raised|menu)/);
      expect(source).not.toContain("glass-raised");
    }

    const dropdownSource = readFileSync(resolve(root, "src/components/ui/dropdown-menu.tsx"), "utf8");
    expect(dropdownSource).toContain("MenuPrimitive.CheckboxItem");
    expect(dropdownSource).toContain("MenuPrimitive.CheckboxItemIndicator");

    const tooltipSource = readFileSync(resolve(root, "src/components/ui/tooltip.tsx"), "utf8");
    expect(tooltipSource).toContain("rounded-control");
    expect(tooltipSource).toContain("TOOLTIP_FIRST_OPEN_DELAY = 600");
    expect(readFileSync(resolve(root, "src/main.tsx"), "utf8")).toContain(
      "<TooltipProvider>",
    );

    const toastSource = readFileSync(resolve(root, "src/ui/toast.tsx"), "utf8");
    expect(toastSource).toContain('toast.tone === "error" ? "alert" : "status"');
    expect(toastSource).toContain('<Button type="button" variant="ghost" size="icon-xs"');
  });

  test("keeps migrated product overlays on the standard transient-layer contract", () => {
    const paths = [
      "src/session/StageTrack.tsx",
      "src/usage/Usage.tsx",
    ];
    const violations = newDesignViolations().filter((violation) =>
      paths.includes(violation.path),
    );
    expect(violations).toEqual([]);

    const stageTrackSource = readFileSync(resolve(root, paths[0]), "utf8");
    expect(stageTrackSource).toContain("<PopoverTrigger");
    expect(stageTrackSource).toContain("<PopoverContent");
    expect(stageTrackSource).toContain('variant="selectable"');

    const usageSource = readFileSync(resolve(root, paths[1]), "utf8");
    expect(usageSource).toContain("rounded-micro bg-raised");

    for (const path of paths) {
      const source = readFileSync(resolve(root, path), "utf8");
      expect(source).not.toContain("glass-raised");
      expect(source).not.toContain("ring-1 ring-foreground/10");
    }
  });

  test("keeps SelectItem inside SelectGroup across product surfaces", () => {
    let contentCount = 0;
    for (const path of new Bun.Glob("src/**/*.tsx").scanSync({ cwd: root })) {
      const source = readFileSync(resolve(root, path), "utf8");
      const contents = source.match(/<SelectContent\b[\s\S]*?<\/SelectContent>/g) ?? [];
      contentCount += contents.length;
      for (const content of contents) expect(content).toContain("<SelectGroup");
    }
    expect(contentCount).toBeGreaterThan(0);
  });

  test("renders real shared controls in the design-system preview", () => {
    const preview = readFileSync(
      resolve(root, "src/design/DesignSystemPreview.tsx"),
      "utf8",
    );
    const previewCss = readFileSync(resolve(root, "src/design/preview.css"), "utf8");

    for (const component of [
      "Button",
      "Card",
      "Input",
      "Select",
      "Checkbox",
      "Field",
      "Tabs",
      "Popover",
      "Tooltip",
      "Dialog",
    ]) {
      expect(preview).toContain(`<${component}`);
    }
    expect(preview).toContain("document.documentElement");
    expect(preview).toContain('classList.toggle("dark"');
    for (const legacyClass of [
      "ds-button",
      "ds-input-shell",
      "ds-select-row",
      "ds-check-row",
      "ds-bold-toggle",
      "ds-dialog-demo",
      "ds-specimen-card",
    ]) {
      expect(preview).not.toContain(legacyClass);
      expect(previewCss).not.toContain(legacyClass);
    }
  });

  test("keeps migrated product structure on the shared Separator primitive", () => {
    const separatorSource = readFileSync(resolve(root, "src/components/ui/separator.tsx"), "utf8");
    expect(separatorSource).toContain("bg-fill-rest");
    expect(separatorSource).not.toContain("bg-border");
    expect(separatorSource).toContain('data-[orientation=vertical]:h-full');
    expect(separatorSource).toContain('data-[orientation=vertical]:w-px');
    expect(separatorSource).not.toContain("data-horizontal:");
    expect(separatorSource).not.toContain("data-vertical:");

    for (const path of [
      "src/files/FilePanel.tsx",
      "src/git/SourceControl.tsx",
      "src/terminal/Terminal.tsx",
      "src/session/SceneChip.tsx",
    ]) {
      const source = readFileSync(resolve(root, path), "utf8");
      expect(source).toContain("<Separator");
      expect(source).not.toMatch(/\bborder-(?:b|t|s|e|l|r)\b/);
    }
  });

  test("scans JavaScript and rejects off-scale Tailwind spacing", () => {
    const fixture = mkdtempSync(resolve(tmpdir(), "codetwo-design-system-"));
    try {
      mkdirSync(resolve(fixture, "src"));
      writeFileSync(
        resolve(fixture, "src/Product.tsx"),
        [
          'const prose = "approved";',
          '// p-5 is prose, not a class',
          'export const Product = () => <div className={`p-4 gap-3 mt-1.5 ps-1.5',
          '  p-5 gap-y-5 mt-7 ps-3.5 pe-10`} />;',
        ].join("\n"),
      );
      writeFileSync(
        resolve(fixture, "src/injected.js"),
        'const styles = ".card { color: #fff; }";\n',
      );
      const violations = scanSource(fixture, { entries: [] });
      expect(
        violations
          .filter((violation) => violation.rule === "hardcoded-spacing")
          .map((violation) => violation.value),
      ).toEqual(["p-5", "gap-y-5", "mt-7", "ps-3.5", "pe-10"]);
      expect(violations.some((violation) =>
        violation.path === "src/injected.js" && violation.rule === "raw-color"
      )).toBe(true);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("scans static Tailwind borders without treating focus states, resets, or source text as utilities", () => {
    const fixture = mkdtempSync(resolve(tmpdir(), "codetwo-design-system-"));
    try {
      mkdirSync(resolve(fixture, "src"));
      writeFileSync(
        resolve(fixture, "src/Product.tsx"),
        [
          'const border = "semantic";',
          'const token = "--border";',
          '// keep the `border` aligned with the title',
          'const divider = "divide-border bg-border stroke-border";',
          'export const Product = () => <div className="border ring-1 ring ring-4 ring-[0.5px] border-[3px] focus-visible:ring-0 focus-visible:ring-2 focus:ring-2 focus-visible:ring-[3px] aria-invalid:border-destructive file:border-0 border-red-500 border-success/40" />;',
        ].join("\n"),
      );
      const violations = scanSource(fixture, { entries: [] })
        .filter((violation) => violation.rule === "static-border")
        .map((violation) => violation.value);
      expect(violations).toEqual([
        "border",
        "ring-1",
        "ring",
        "ring-4",
        "ring-[0.5px]",
        "border-[3px]",
        "focus:ring-2",
        "focus-visible:ring-[3px]",
        "border-red-500",
        "border-success/40",
      ]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("requires representative semantic selectors in compiled CSS", () => {
    const source = [
      ".text-page{}",
      ".text-body{}",
      ".text-callout{}",
      ".text-metadata{}",
      ".bg-surface{}",
      ".bg-modal{}",
      ".bg-overlay{}",
      ".rounded-control{}",
      ".rounded-modal{}",
      ".h-control{}",
      ".h-control-field{}",
      ".size-control-mini{}",
      ".h-titlebar{}",
      ".h-panel-strip{}",
      ".max-h-dialog-max{}",
      ".max-h-dialog-content{}",
      ".size-icon-control{}",
      ".pt-page-start{}",
      ".sm\\:pt-page-start-wide{}",
      ".pb-page-end{}",
      ".shadow-raised{}",
      ".shadow-modal{}",
      ".duration-feedback{}",
      ".ease-enter{}",
      ".focus-visible\\:focus-ring{}",
      ".focus-visible\\:focus-ring-inset{}",
      ".bg-status-success{}",
      ".bg-status-warning{}",
      ".bg-status-destructive{}",
      ...Array.from({ length: 6 }, (_, index) => `.text-viz-series-${index + 1}{}`),
    ].join("");
    expect(checkBuiltDesignCss(source)).toEqual([]);
    expect(checkBuiltDesignCss(`${source.replace(".text-page{}", "")}@theme inline {}`)).toEqual([
      "built CSS still contains an unresolved @theme rule",
      "built CSS is missing .text-page",
    ]);
  });

  test("keeps new design-system and business-component sources off the legacy debt baseline", () => {
    const violations = currentViolations.filter((violation) =>
      violation.path.startsWith("src/design/") ||
      violation.path.startsWith("src/components/business/"),
    );
    expect(violations).toEqual([]);
  });

  test("allows legacy debt to decrease but rejects the first new occurrence", () => {
    const violation = {
      rule: "raw-color" as const,
      path: "src/example.tsx",
      line: 4,
      value: "#ffffff",
      replacement: "use a semantic color",
      context: "const old = true;\nconst color = '#ffffff';\nconst next = true;",
    };
    const accepted = {
      version: 1 as const,
      baseCommit: "test",
      counts: { [fingerprint(violation)]: 1 },
    };
    const empty = { version: 1 as const, baseCommit: "test", counts: {} };

    expect(increases([violation], accepted)).toEqual([]);
    expect(increases([violation], empty)).toEqual([violation]);
  });

  test("rejects a baseline violation moved into new context", () => {
    const original = {
      rule: "raw-color" as const,
      path: "src/example.tsx",
      line: 2,
      value: "#ffffff",
      replacement: "use a semantic color",
      context: "const old = true;\nconst color = '#ffffff';\nconst next = true;",
    };
    const moved = {
      ...original,
      line: 20,
      context: "const unrelated = true;\nconst color = '#ffffff';\nexport default color;",
    };
    const baseline = {
      version: 2 as const,
      baseCommit: "test",
      counts: { [fingerprint(original)]: 1 },
      occurrences: countOccurrences([original]),
    };

    expect(increases([moved], baseline)).toEqual([]);
    expect(newOccurrences([moved], baseline)).toEqual([moved]);
  });
});
