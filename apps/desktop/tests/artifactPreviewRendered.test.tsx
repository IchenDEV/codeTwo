// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import { activateDom, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { ArtifactPreview, artifactPreviewKind } =
  await import("../src/session/ArtifactPreview");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function artifact(mime_type: string) {
  return {
    id: "artifact-1",
    mime_type,
    bytes: 2048,
    width: 2,
    height: 3,
    display_name: "deliverable.bin",
  };
}

describe("artifactPreviewKind", () => {
  test("classifies mime types into preview branches", () => {
    expect(artifactPreviewKind("image/png")).toBe("image");
    expect(artifactPreviewKind("image/svg+xml")).toBe("markup");
    expect(artifactPreviewKind("text/html")).toBe("markup");
    expect(artifactPreviewKind("text/markdown")).toBe("markdown");
    expect(artifactPreviewKind("application/json")).toBe("text");
    expect(artifactPreviewKind("text/csv")).toBe("text");
    expect(artifactPreviewKind("application/zip")).toBe("download");
  });
});

describe("ArtifactPreview", () => {
  test("renders a metadata card with download and reveal for an unknown binary", async () => {
    const view = mount(
      <ArtifactPreview artifact={artifact("application/zip")} />
    );
    await flush();

    const preview = view.container.querySelector("[data-artifact-preview]");
    expect(preview?.getAttribute("data-artifact-preview")).toBe("download");
    expect(view.container.textContent).toContain("deliverable.bin");
    expect(view.container.textContent).toContain("application/zip");
    expect(view.container.textContent).toContain("2.0 KB");
    expect(view.container.textContent).toContain("download to open");
    const labels = [...view.container.querySelectorAll("button")].map((item) =>
      item.getAttribute("aria-label")
    );
    expect(labels).toContain("Save As");
    expect(labels).toContain("Reveal in file manager");

    view.unmount();
  });

  test("uses the markdown branch for a markdown artifact and the markup branch for html", async () => {
    const markdown = mount(
      <ArtifactPreview artifact={{ ...artifact("text/markdown"), id: "md" }} />
    );
    await flush();
    expect(
      markdown.container
        .querySelector("[data-artifact-preview]")
        ?.getAttribute("data-artifact-preview")
    ).toBe("markdown");
    markdown.unmount();

    const html = mount(
      <ArtifactPreview artifact={{ ...artifact("text/html"), id: "html" }} />
    );
    await flush();
    const frame = html.container.querySelector("iframe");
    expect(frame?.getAttribute("sandbox")).toBe("allow-scripts");
    html.unmount();
  });

  test("renders the text and image branches by mime", async () => {
    const text = mount(
      <ArtifactPreview
        artifact={{ ...artifact("application/json"), id: "json" }}
      />
    );
    await flush();
    const textBranch = text.container.querySelector("pre");
    expect(textBranch).not.toBeNull();
    expect(
      text.container
        .querySelector("[data-artifact-preview]")
        ?.getAttribute("data-artifact-preview")
    ).toBe("text");
    text.unmount();

    const image = mount(
      <ArtifactPreview artifact={{ ...artifact("image/png"), id: "png" }} />
    );
    await flush();
    expect(
      image.container
        .querySelector("[data-artifact-preview]")
        ?.getAttribute("data-artifact-preview")
    ).toBe("image");
    expect(image.container.textContent).toContain("2 × 3");
    image.unmount();
  });
});
