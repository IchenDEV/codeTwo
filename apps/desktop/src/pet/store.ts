import type { PetSource } from "../appearance";

export interface PetCatalogItem {
  id: string;
  displayName: string;
  description: string;
  source: PetSource;
  spritesheetUrl: string;
  spriteVersionNumber: 2;
}

interface PetShareCatalogEntry {
  id?: unknown;
  displayName?: unknown;
  description?: unknown;
  spriteVersionNumber?: unknown;
  spritesheetPath?: unknown;
  manifestPath?: unknown;
  downloadPath?: unknown;
}

export const petshareOrigin = "https://petshare.idevlab.dev";
export const petshareCatalogUrl = `${petshareOrigin}/pets.json`;
const maxCatalogItems = 200;
const catalogTimeoutMs = 10_000;
const petIdPattern = /^[a-z0-9][a-z0-9-]{0,79}$/u;

export const builtinPet: PetCatalogItem = {
  description: "A quiet C2 companion that keeps pace with your sessions.",
  displayName: "Naiwa",
  id: "naiwa",
  source: "builtin",
  spriteVersionNumber: 2,
  spritesheetUrl: "/pets/naiwa/spritesheet.webp",
};

function isExactPetShareUrl(value: unknown, path: string): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const url = new URL(value, petshareOrigin);
    return (
      url.origin === petshareOrigin &&
      url.pathname === path &&
      url.search === "" &&
      url.hash === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

function safeCatalogText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim().replaceAll(/\s+/gu, " ");
  return text && text.length <= maxLength ? text : null;
}

export function parsePetShareCatalog(value: unknown): PetCatalogItem[] {
  if (!Array.isArray(value) || value.length > maxCatalogItems) {
    throw new Error("Invalid pet catalog");
  }

  const seen = new Set<string>();
  return value.map((raw) => {
    if (raw == null || typeof raw !== "object") {
      throw new Error("Invalid pet catalog item");
    }
    const item = raw as PetShareCatalogEntry;
    const id =
      typeof item.id === "string" && petIdPattern.test(item.id)
        ? item.id
        : null;
    const displayName = safeCatalogText(item.displayName, 80);
    const description = safeCatalogText(item.description, 240);
    if (
      id == null ||
      id === "" ||
      displayName == null ||
      displayName === "" ||
      description == null ||
      description === "" ||
      item.spriteVersionNumber !== 2 ||
      seen.has(id)
    ) {
      throw new Error("Invalid pet catalog item");
    }
    if (
      !isExactPetShareUrl(
        item.spritesheetPath,
        `/pets/${id}/spritesheet.webp`
      ) ||
      !isExactPetShareUrl(item.manifestPath, `/pets/${id}/pet.json`) ||
      !isExactPetShareUrl(item.downloadPath, `/downloads/${id}.zip`)
    ) {
      throw new Error("Invalid pet catalog asset");
    }
    seen.add(id);
    return {
      description,
      displayName,
      id,
      source: "petshare" as const,
      spriteVersionNumber: 2 as const,
      spritesheetUrl: `${petshareOrigin}/pets/${id}/spritesheet.webp`,
    };
  });
}

export async function fetchPetShareCatalog(): Promise<PetCatalogItem[]> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, catalogTimeoutMs);
  try {
    const response = await fetch(petshareCatalogUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Pet catalog returned ${response.status}`);
    }
    return parsePetShareCatalog(await response.json());
  } finally {
    window.clearTimeout(timeout);
  }
}

export function petSpritesheetUrl(source: PetSource, id: string): string {
  if (source === "petshare" && petIdPattern.test(id)) {
    return `${petshareOrigin}/pets/${id}/spritesheet.webp`;
  }
  return builtinPet.spritesheetUrl;
}
