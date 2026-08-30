// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { getAppearanceSettings, resetAppearanceSettings, setAppearanceSettings } = await import("../src/appearance");
const { CodeTwoPet } = await import("../src/pet/CodeTwoPet");
const { desktopPetContextMenu, DESKTOP_PET_CLOSE_ACTION } = await import("../src/pet/DesktopPet");
const { PetSettings } = await import("../src/settings/PetSettings");

const remotePets = [
  {
    id: "columbina",
    displayName: "Columbina",
    description: "A tiny digital companion.",
    source: "petshare" as const,
    spritesheetUrl: "https://petshare.idevlab.dev/pets/columbina/spritesheet.webp",
    spriteVersionNumber: 2 as const,
  },
];

const loadCatalog = async () => remotePets;

afterEach(() => {
  resetAppearanceSettings();
  dom.document.body.replaceChildren();
  dom.window.localStorage.clear();
  restoreDom();
});

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

describe("Pet settings", () => {
  test("renders the real companion preview and persists show, activity, and size controls", async () => {
    activateDom();
    const view = mount(<I18nProvider><PetSettings loadCatalog={loadCatalog} /></I18nProvider>);
    await flush();

    expect(view.container.querySelector(".pet-catalog [data-slot='setting-row-label']")?.textContent).toBe("Naiwa");
    expect(view.container.querySelector("ul.pet-catalog")).not.toBeNull();
    expect(view.container.querySelectorAll(".pet-catalog > li.pet-catalog-item")).toHaveLength(2);
    expect(view.container.querySelectorAll(".pet-catalog [data-slot='setting-row']")).toHaveLength(2);
    expect(view.container.querySelectorAll(".codex-pet")).toHaveLength(2);
    expect(view.container.querySelector(".pet-selected-status")?.textContent).toBe("Selected");
    expect(view.container.querySelector<HTMLElement>(".pet-catalog-avatar .codex-pet")?.style
      .getPropertyValue("--codex-pet-display-width")).toBe("46px");
    expect(view.container.querySelector('[aria-label="Show in sessions"]')).toBeNull();

    findButton(view.container, "Tuck away pet").click();
    await flush();
    expect(getAppearanceSettings().petEnabled).toBe(false);
    expect(findButton(view.container, "Show pet")).not.toBeNull();

    const activity = view.container.querySelector<HTMLButtonElement>(
      '[data-slot="setting-toggle"] [data-slot="switch"]',
    );
    expect(view.container.querySelector('.pet-setting-group [data-slot="setting-row-label"]')?.textContent)
      .toBe("React to task activity");
    expect(activity?.hasAttribute("data-checked")).toBe(true);
    activity?.click();
    await flush();
    expect(getAppearanceSettings().petActivityEnabled).toBe(false);

    setAppearanceSettings({ petSize: "large" });
    await flush();
    expect(getAppearanceSettings().petSize).toBe("large");
    const size = view.container.querySelector('[aria-label="Pet size"]');
    expect(size?.textContent).toContain("Large");
    expect(size?.closest('[data-slot="setting-row"]')?.getAttribute("data-surface")).toBe("plain");
    expect(view.container.querySelector(".pet-setting-group")).not.toBeNull();
    expect(view.container.querySelector(".pet-setting-group [data-surface='card']")).toBeNull();

    view.unmount();
  });

  test("cycles the live preview through task moods", async () => {
    activateDom();
    const view = mount(<I18nProvider><PetSettings loadCatalog={loadCatalog} /></I18nProvider>);
    await flush();

    expect(view.container.querySelector(".codex-pet")?.getAttribute("data-animation")).toBe("idle");
    view.container.querySelector<HTMLButtonElement>('[aria-label="Preview next pet mood"]')?.click();
    await flush();
    expect(view.container.querySelector(".codex-pet")?.getAttribute("data-animation")).toBe("running");

    view.unmount();
  });

  test("selects a real store pet and moves it to the selected row", async () => {
    activateDom();
    const view = mount(<I18nProvider><PetSettings loadCatalog={loadCatalog} /></I18nProvider>);
    await flush();

    findButton(view.container, "Select").click();
    await flush();

    expect(getAppearanceSettings()).toMatchObject({
      petSource: "petshare",
      petId: "columbina",
      petName: "Columbina",
    });
    expect(view.container.querySelector(".pet-catalog [data-slot='setting-row-label']")?.textContent).toBe("Columbina");
    expect(view.container.querySelectorAll(".pet-selected-status")).toHaveLength(1);

    view.unmount();
  });

  test("applies size and activity preferences to the session pet", async () => {
    activateDom();
    setAppearanceSettings({ petActivityEnabled: false, petSize: "large" });
    const view = mount(
      <I18nProvider>
        <CodeTwoPet animation="failed" />
      </I18nProvider>,
    );
    await flush();

    const sprite = view.container.querySelector<HTMLElement>(".codex-pet");
    expect(sprite?.getAttribute("data-animation")).toBe("idle");
    expect(sprite?.style.getPropertyValue("--codex-pet-display-width")).toBe("136px");

    setAppearanceSettings({ petActivityEnabled: true, petSize: "small" });
    await flush();
    const updatedSprite = view.container.querySelector<HTMLElement>(".codex-pet");
    expect(updatedSprite?.getAttribute("data-animation")).toBe("failed");
    expect(updatedSprite?.style.getPropertyValue("--codex-pet-display-width")).toBe("88px");

    view.unmount();
  });

  test("uses the selected store spritesheet in the session pet", async () => {
    activateDom();
    setAppearanceSettings({ petSource: "petshare", petId: "columbina", petName: "Columbina" });
    const view = mount(
      <I18nProvider>
        <CodeTwoPet animation="idle" />
      </I18nProvider>,
    );
    await flush();

    expect(view.container.querySelector<HTMLElement>(".codex-pet")?.style
      .getPropertyValue("--codex-pet-src"))
      .toContain("https://petshare.idevlab.dev/pets/columbina/spritesheet.webp");

    view.unmount();
  });

  test("shows a visible greeting when the desktop pet is clicked", async () => {
    activateDom();
    const view = mount(
      <I18nProvider>
        <CodeTwoPet animation="idle" />
      </I18nProvider>,
    );
    await flush();

    view.container.querySelector<HTMLButtonElement>('[aria-label="Say hello to the pet"]')?.click();
    await flush();

    expect(view.container.querySelector(".codex-pet")?.getAttribute("data-animation"))
      .toBe("waving");

    view.unmount();
  });

  test("shows only an optional conversation bubble beside the unframed mascot", async () => {
    activateDom();
    const view = mount(
      <I18nProvider>
        <CodeTwoPet animation="running" bubble="I am checking the active conversation." />
      </I18nProvider>,
    );
    await flush();

    expect(view.container.querySelector(".codetwo-pet-bubble")?.textContent)
      .toBe("I am checking the active conversation.");
    expect(view.container.querySelector(".codetwo-pet-controls")).toBeNull();
    expect(view.container.querySelector('[aria-label="Hide desktop pet"]')).toBeNull();

    view.unmount();
  });

  test("offers closing through the native pet context-menu model", () => {
    expect(desktopPetContextMenu("Close")).toEqual([
      { type: "item", label: "Close", action: DESKTOP_PET_CLOSE_ACTION },
    ]);
  });
});
