// Bun owns this focused test module; the desktop production tsconfig does not include Bun globals.
// @ts-nocheck
import { describe, expect, test } from "bun:test";

import { planCanvasExportTiles } from "./exportPlan";
import { deriveCanvasManifest } from "./manifest";
import { intakeCanvasMedia } from "./media";
import type { CanvasMediaError } from "./media";
import {
  createEnvelope,
  deserializeEnvelope,
  serializeEnvelope,
  stripDataUrls,
} from "./serialize";

const remoteSource = await Bun.file(
  new URL("remote-entry.tsx", import.meta.url)
).text();

const base = {
  angle: 0,
  backgroundColor: "transparent",
  boundElements: null,
  fillStyle: "solid",
  frameId: null,
  groupIds: [],
  height: 40,
  id: "shape-1",
  index: "a0",
  isDeleted: false,
  link: "https://should-be-removed.invalid",
  locked: false,
  opacity: 100,
  roughness: 2,
  roundness: null,
  seed: 1,
  strokeColor: "black",
  strokeStyle: "solid",
  strokeWidth: 2,
  updated: 1,
  version: 1,
  versionNonce: 1,
  width: 100,
  x: 10,
  y: 20,
};

describe("canvas serialization allowlist and sanitization", () => {
  test("rejects unsupported elements and normalizes precise roughness defaults", () => {
    const envelope = createEnvelope(
      {
        appState: {} as never,
        elements: [
          { ...base, type: "rectangle" },
          { ...base, id: "unsupported", type: "diamond" },
          { ...base, id: "frame", type: "frame" },
        ] as never,
      },
      4,
      "light"
    );
    expect(envelope.elements).toHaveLength(1);
    expect(envelope.elements[0].type).toBe("rectangle");
    expect(envelope.elements[0].roughness).toBe(0);
    expect(envelope.elements[0].link).toBeNull();
    const textEnvelope = createEnvelope(
      {
        appState: {} as never,
        elements: [
          {
            ...base,
            id: "text-1",
            text: "keep data:image/png;base64,AAAA",
            type: "text",
          },
        ] as never,
      },
      4,
      "light"
    );
    expect(JSON.stringify(textEnvelope)).not.toContain("data:image");
  });

  test("strips data URLs at persistence boundaries and rejects unsafe envelopes", () => {
    expect(
      stripDataUrls({ file: "data:image/png;base64,AAAA", keep: "ok" })
    ).toEqual({ keep: "ok" });
    const envelope = createEnvelope(
      {
        appState: {} as never,
        elements: [{ ...base, type: "rectangle" }] as never,
      },
      1,
      "light"
    );
    const serialized = serializeEnvelope(envelope);
    expect(serialized).not.toContain("data:");
    expect(deserializeEnvelope(serialized).engineVersion).toBe("0.18.1");
  });
});

describe("deterministic canvas manifest", () => {
  test("keeps original text and normalized arrow endpoints while omitting pen points", () => {
    const scene = [
      {
        ...base,
        height: 20,
        originalText: "Hello\nworld",
        text: "Hello",
        type: "text",
        width: 50,
        x: 20,
        y: 20,
      },
      {
        ...base,
        height: 100,
        id: "arrow-1",
        points: [
          [0, 0],
          [100, 100],
        ],
        type: "arrow",
        width: 100,
        x: 0,
        y: 0,
      },
      {
        ...base,
        id: "pen-1",
        points: [
          [0, 0],
          [4, 6],
        ],
        type: "freedraw",
      },
    ] as never;
    const manifest = deriveCanvasManifest(scene);
    expect(manifest.objects[0].originalText).toBe("Hello\nworld");
    expect(manifest.objects[1].arrowStart).toEqual({ x: 0, y: 0 });
    expect(manifest.objects[1].arrowEnd).toEqual({ x: 100, y: 100 });
    expect(JSON.stringify(manifest)).not.toContain("points");
    expect(manifest).toEqual(deriveCanvasManifest(scene));
  });
});

describe("media normalizer routing and rejection", () => {
  test("routes every accepted input through the required async normalizer", async () => {
    const seen: string[] = [];
    const files = await intakeCanvasMedia(
      [
        {
          bytes: new Uint8Array([1, 2]),
          mimeType: "image/svg+xml",
          name: "shape.svg",
        },
        {
          bytes: new Uint8Array([3, 4]),
          mimeType: "image/gif",
          name: "motion.gif",
        },
      ],
      {
        createFileId: (media) => media.ref,
        normalize: async (input) => {
          seen.push(input.mimeType);
          return {
            bytes: new Uint8Array([137, 80]),
            height: 10,
            mimeType: "image/png",
            name: input.name,
            ref: `trusted-${input.name}`,
            width: 20,
          };
        },
        onAsset: () => {},
      }
    );
    expect(seen).toEqual(["image/svg+xml", "image/gif"]);
    expect(files).toHaveLength(2);
    expect(files.every((file) => file.mimeType === "image/png")).toBe(true);
    expect(files.map((file) => file.id)).toEqual([
      "trusted-shape.svg",
      "trusted-motion.gif",
    ]);
  });

  test("rejects a normalizer result that is not PNG or WebP", async () => {
    await expect(
      intakeCanvasMedia(
        [{ bytes: new Uint8Array([1]), mimeType: "image/jpeg" }],
        {
          normalize: async () => {
            return {
              bytes: new Uint8Array([1]),
              mimeType: "image/svg+xml" as never,
              ref: "trusted-svg",
            };
          },
          onAsset: () => {},
        }
      )
    ).rejects.toMatchObject<Partial<CanvasMediaError>>({
      code: "unsupported-output",
    });
  });
});

describe("crop, overview, detail tiling, and hard export budgets", () => {
  test("emits overview first and deterministic row-major detail tiles", () => {
    const tiles = planCanvasExportTiles(
      { maxX: 5000, maxY: 3000, minX: 0, minY: 0 },
      {
        maxBytes: 200_000_000,
        maxImages: 20,
        maxPixels: 40_000_000,
        tileSize: 2048,
      }
    );
    expect(tiles[0].kind).toBe("overview");
    expect(tiles.slice(1).map((tile) => [tile.row, tile.column])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
  });

  test("returns explicit image-count and pixel-budget errors", () => {
    expect(() => {
      return planCanvasExportTiles(
        { maxX: 5000, maxY: 3000, minX: 0, minY: 0 },
        { maxImages: 2, tileSize: 512 }
      );
    }).toThrow(/requires/u);
    expect(() => {
      return planCanvasExportTiles(
        { maxX: 5000, maxY: 3000, minX: 0, minY: 0 },
        { maxPixels: 1000, tileSize: 2048 }
      );
    }).toThrow(/pixels/u);
    expect(() => {
      return planCanvasExportTiles(
        { maxX: 100, maxY: 100, minX: 0, minY: 0 },
        { maxImages: 0 }
      );
    }).toThrow(/images/u);
  });
});

describe("CanvasEditor interaction and Remote island memory-only contract", () => {
  test("has no browser persistence and exposes caller-driven reconnect reset", () => {
    expect(remoteSource).toContain("resetCanvasIsland");
    expect(remoteSource).toContain("prepareCanvasIslandFreeze");
    expect(remoteSource).toContain("setCanvasIslandMediaCallbacks");
    expect(remoteSource).toContain(
      "new envelope is kept only in the mounted page memory"
    );
    expect(remoteSource).not.toMatch(/localStorage|sessionStorage|indexedDB/iu);
  });
});
