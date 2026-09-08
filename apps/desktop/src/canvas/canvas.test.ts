// Bun owns this focused test module; the desktop production tsconfig does not include Bun globals.
// @ts-nocheck
import { describe, expect, test } from "bun:test";

import { planCanvasExportTiles } from "./exportPlan";
import { deriveCanvasManifest } from "./manifest";
import type { CanvasMediaError } from "./media";
import { intakeCanvasMedia } from "./media";
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
  id: "shape-1",
  x: 10,
  y: 20,
  width: 100,
  height: 40,
  angle: 0,
  strokeColor: "black",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roundness: null,
  roughness: 2,
  opacity: 100,
  seed: 1,
  version: 1,
  versionNonce: 1,
  index: "a0",
  isDeleted: false,
  groupIds: [],
  frameId: null,
  boundElements: null,
  updated: 1,
  link: "https://should-be-removed.invalid",
  locked: false,
};

describe("canvas serialization allowlist and sanitization", () => {
  test("rejects unsupported elements and normalizes precise roughness defaults", () => {
    const envelope = createEnvelope(
      {
        elements: [
          { ...base, type: "rectangle" },
          { ...base, id: "unsupported", type: "diamond" },
          { ...base, id: "frame", type: "frame" },
        ] as never,
        appState: {} as never,
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
        elements: [
          {
            ...base,
            id: "text-1",
            type: "text",
            text: "keep data:image/png;base64,AAAA",
          },
        ] as never,
        appState: {} as never,
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
        elements: [{ ...base, type: "rectangle" }] as never,
        appState: {} as never,
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
        type: "text",
        text: "Hello",
        originalText: "Hello\nworld",
        x: 20,
        y: 20,
        width: 50,
        height: 20,
      },
      {
        ...base,
        id: "arrow-1",
        type: "arrow",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        points: [
          [0, 0],
          [100, 100],
        ],
      },
      {
        ...base,
        id: "pen-1",
        type: "freedraw",
        points: [
          [0, 0],
          [4, 6],
        ],
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
        normalize: async (input) => {
          seen.push(input.mimeType);
          return {
            ref: `trusted-${input.name}`,
            bytes: new Uint8Array([137, 80]),
            mimeType: "image/png",
            name: input.name,
            width: 20,
            height: 10,
          };
        },
        createFileId: (media) => media.ref,
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
    expect(
      intakeCanvasMedia(
        [{ bytes: new Uint8Array([1]), mimeType: "image/jpeg" }],
        {
          normalize: async () => ({
            ref: "trusted-svg",
            bytes: new Uint8Array([1]),
            mimeType: "image/svg+xml" as never,
          }),
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
      { minX: 0, minY: 0, maxX: 5000, maxY: 3000 },
      {
        tileSize: 2048,
        maxImages: 20,
        maxPixels: 40_000_000,
        maxBytes: 200_000_000,
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
    expect(() =>
      planCanvasExportTiles(
        { minX: 0, minY: 0, maxX: 5000, maxY: 3000 },
        { tileSize: 512, maxImages: 2 }
      )
    ).toThrow(/requires/u);
    expect(() =>
      planCanvasExportTiles(
        { minX: 0, minY: 0, maxX: 5000, maxY: 3000 },
        { tileSize: 2048, maxPixels: 1000 }
      )
    ).toThrow(/pixels/u);
    expect(() =>
      planCanvasExportTiles(
        { minX: 0, minY: 0, maxX: 100, maxY: 100 },
        { maxImages: 0 }
      )
    ).toThrow(/images/u);
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
