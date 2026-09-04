import { describe, expect, test } from "bun:test";

import { parsePetShareCatalog, petSpritesheetUrl } from "../src/pet/store";

function pet(id = "columbina") {
  return {
    id,
    displayName: "Columbina",
    description: "A tiny digital companion.",
    spriteVersionNumber: 2,
    spritesheetPath: `/pets/${id}/spritesheet.webp`,
    manifestPath: `/pets/${id}/pet.json`,
    downloadPath: `/downloads/${id}.zip`,
  };
}

describe("PetShare catalog", () => {
  test("accepts the existing V2 catalog contract", () => {
    expect(parsePetShareCatalog([pet()])).toEqual([
      {
        id: "columbina",
        displayName: "Columbina",
        description: "A tiny digital companion.",
        source: "petshare",
        spritesheetUrl:
          "https://petshare.idevlab.dev/pets/columbina/spritesheet.webp",
        spriteVersionNumber: 2,
      },
    ]);
  });

  test("rejects duplicate ids and off-origin assets", () => {
    expect(() => parsePetShareCatalog([pet(), pet()])).toThrow(
      "Invalid pet catalog item"
    );
    expect(() => {
      return parsePetShareCatalog([
        {
          ...pet(),
          spritesheetPath:
            "https://example.com/pets/columbina/spritesheet.webp",
        },
      ]);
    }).toThrow("Invalid pet catalog asset");
  });

  test("falls back to the built-in spritesheet for an invalid saved id", () => {
    expect(petSpritesheetUrl("petshare", "../escape")).toBe(
      "/pets/naiwa/spritesheet.webp"
    );
  });
});
