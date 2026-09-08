import { describe, expect, test } from "bun:test";

import { cn } from "../src/lib/utils";

describe("C2 design-system utilities", () => {
  test("keeps semantic roles when Tailwind classes are merged", () => {
    expect(cn("text-body", "text-muted-foreground")).toBe(
      "text-body text-muted-foreground"
    );
    expect(cn("text-body", "text-status-success")).toBe(
      "text-body text-status-success"
    );
    expect(cn("text-page", "text-body")).toBe("text-body");
    expect(cn("rounded-control", "rounded-module")).toBe("rounded-module");
    expect(cn("h-control", "h-control-field")).toBe("h-control-field");
    expect(cn("shadow-surface", "shadow-raised")).toBe("shadow-raised");
    expect(cn("duration-feedback", "duration-layer")).toBe("duration-layer");
    expect(cn("ease-enter", "ease-exit")).toBe("ease-exit");
  });
});
