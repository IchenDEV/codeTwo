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

export const PETSHARE_ORIGIN = "https://petshare.idevlab.dev";
export const PETSHARE_CATALOG_URL = `${PETSHARE_ORIGIN}/pets.json`;
const MAX_CATALOG_ITEMS = 200;
const CATALOG_TIMEOUT_MS = 10_000;
const PET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

export const BUILTIN_PET: PetCatalogItem = {
  id: "naiwa",
  displayName: "Naiwa",
  description: "A quiet C2 companion that keeps pace with your sessions.",
  source: "builtin",
  spritesheetUrl: "/pets/naiwa/spritesheet.webp",
  spriteVersionNumber: 2,
};

function isExactPetShareUrl(value: unknown, path: string): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value, PETSHARE_ORIGIN);
    return (
      url.origin === PETSHARE_ORIGIN &&
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
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text && text.length <= maxLength ? text : null;
}

export function parsePetShareCatalog(value: unknown): PetCatalogItem[] {
  if (!Array.isArray(value) || value.length > MAX_CATALOG_ITEMS) {
    throw new Error("Invalid pet catalog");
  }

  const seen = new Set<string>();
  return value.map((raw) => {
    if (!raw || typeof raw !== "object")
      throw new Error("Invalid pet catalog item");
    const item = raw as PetShareCatalogEntry;
    const id =
      typeof item.id === "string" && PET_ID_PATTERN.test(item.id)
        ? item.id
        : null;
    const displayName = safeCatalogText(item.displayName, 80);
    const description = safeCatalogText(item.description, 240);
    if (
      !id ||
      !displayName ||
      !description ||
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
      id,
      displayName,
      description,
      source: "petshare" as const,
      spritesheetUrl: `${PETSHARE_ORIGIN}/pets/${id}/spritesheet.webp`,
      spriteVersionNumber: 2 as const,
    };
  });
}

export async function fetchPetShareCatalog(): Promise<PetCatalogItem[]> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    CATALOG_TIMEOUT_MS
  );
  try {
    const response = await fetch(PETSHARE_CATALOG_URL, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Pet catalog returned ${response.status}`);
    return parsePetShareCatalog(await response.json());
  } finally {
    window.clearTimeout(timeout);
  }
}

export function petSpritesheetUrl(source: PetSource, id: string): string {
  if (source === "petshare" && PET_ID_PATTERN.test(id)) {
    return `${PETSHARE_ORIGIN}/pets/${id}/spritesheet.webp`;
  }
  return BUILTIN_PET.spritesheetUrl;
}
