// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import {
  activateDom,
  button,
  click,
  dom,
  flush,
  mount,
  restoreDom,
  text,
} from "./domTestHarness";
activateDom();
const { PreviewModal } = await import("../src/editor/Preview");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("Canvas compiled preview rendered behavior", () => {
  test("renders immutable backend summary and ordered PNG exports read-only", async () => {
    activateDom();
    const closed: boolean[] = [];
    const rendered = mount(
      <PreviewModal
        preview={{
          prompt: "compiled prompt",
          mcp_servers: [],
          agent_skills: [],
          subagents: [],
          files: [],
          images: [],
          sessions: [],
          unresolved: [],
          canvases: [
            {
              id: "canvas-preview",
              frozenRevision: 12,
              title: "Board",
              summary: "Exact backend summary",
              exports: [
                {
                  id: "overview",
                  kind: "overview",
                  index: null,
                  mimeType: "image/png",
                  width: 1,
                  height: 1,
                  bytes: [1, 2, 3],
                },
                {
                  id: "detail-0",
                  kind: "detail",
                  index: 0,
                  mimeType: "image/png",
                  width: 1,
                  height: 1,
                  bytes: [4, 5, 6],
                },
              ],
            },
          ],
        }}
        onClose={() => closed.push(true)}
      />
    );
    await flush();
    expect(text(dom.document.body, "Exact backend summary")).toBeTruthy();
    expect(text(dom.document.body, "rev 12")).toBeTruthy();
    const images = dom.document.body.querySelectorAll("img");
    expect(images).toHaveLength(2);
    expect(images[0].getAttribute("alt")).toContain("overview");
    expect(images[1].getAttribute("alt")).toContain("detail 1");
    expect(images[0].getAttribute("src")).toStartWith("data:image/png;base64,");
    expect(dom.document.body.querySelector("textarea")).toBeNull();
    click(button(dom.document.body, "Close"));
    expect(closed).toEqual([true]);
    rendered.unmount();
  });
});
