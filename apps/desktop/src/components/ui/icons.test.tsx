import { afterEach, describe, expect, test } from "bun:test";

import { createRef } from "react";

import { activateDom, dom, mount } from "../../../tests/domTestHarness";
import * as iconExports from "./icons";
import type { AppIcon } from "./icons";

activateDom();

const icons = Object.entries(iconExports) as Array<[string, AppIcon]>;

afterEach(() => {
  dom.document.body.replaceChildren();
});

describe("rounded icon adapter", () => {
  test("renders every public icon as a configurable Phosphor SVG", () => {
    const view = mount(
      <div>
        {icons.map(([name, Icon]) => (
          <Icon
            key={name}
            aria-label={name}
            className="adapter-icon"
            data-icon-name={name}
          />
        ))}
      </div>
    );

    const rendered = [...view.container.querySelectorAll("svg")];
    expect(icons.length).toBeGreaterThan(100);
    expect(rendered).toHaveLength(icons.length);

    for (const svg of rendered) {
      expect(svg.getAttribute("viewBox")).toBe("0 0 256 256");
      expect(svg.getAttribute("fill")).toBe("currentColor");
      expect(svg.getAttribute("width")).toBe("1em");
      expect(svg.getAttribute("height")).toBe("1em");
      expect(svg.classList.contains("adapter-icon")).toBe(true);
      expect(svg.getAttribute("aria-label")).toBe(
        svg.getAttribute("data-icon-name")
      );
    }

    view.unmount();
  });

  test("defaults to regular weight, forwards refs, and preserves directional defaults", () => {
    const ref = createRef<SVGSVGElement>();
    const view = mount(
      <div>
        <iconExports.Search ref={ref} data-search="default" alt="Search" />
        <iconExports.Search data-search="regular" weight="regular" />
        <iconExports.ChevronDown data-caret="fallback">
          ▼
        </iconExports.ChevronDown>
        <iconExports.PanelRight data-panel="right" />
      </div>
    );

    const defaultSearch = view.container.querySelector<SVGSVGElement>(
      '[data-search="default"]'
    );
    const regularSearch = view.container.querySelector<SVGSVGElement>(
      '[data-search="regular"]'
    );
    const fallbackCaret = view.container.querySelector<SVGSVGElement>(
      '[data-caret="fallback"]'
    );
    const rightPanel = view.container.querySelector<SVGSVGElement>(
      '[data-panel="right"]'
    );

    expect(ref.current).toBe(defaultSearch);
    expect(defaultSearch?.querySelector("path")?.getAttribute("d")).toBe(
      regularSearch?.querySelector("path")?.getAttribute("d")
    );
    expect(defaultSearch?.querySelector("title")?.textContent).toBe("Search");
    expect(fallbackCaret?.textContent).toBe("");
    expect(rightPanel?.getAttribute("transform")).toBe("scale(-1, 1)");

    view.unmount();
  });

  test("keeps action-oriented exports visually distinct from their base concepts", () => {
    const view = mount(
      <div>
        <iconExports.File data-icon="file" />
        <iconExports.FileClock data-icon="file-clock" />
        <iconExports.FolderOpen data-icon="folder-open" />
        <iconExports.FolderDown data-icon="folder-down" />
        <iconExports.Package data-icon="package" />
        <iconExports.PackageCheck data-icon="package-check" />
        <iconExports.PackagePlus data-icon="package-plus" />
      </div>
    );
    const markup = (name: string) =>
      view.container.querySelector<SVGSVGElement>(`[data-icon="${name}"]`)
        ?.innerHTML;

    expect(markup("file-clock")).not.toBe(markup("file"));
    expect(markup("folder-down")).not.toBe(markup("folder-open"));
    expect(markup("package-check")).not.toBe(markup("package"));
    expect(markup("package-plus")).not.toBe(markup("package"));

    view.unmount();
  });
});
