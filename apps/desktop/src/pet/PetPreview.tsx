import { useAppearanceSettings, type PetSize } from "../appearance";
import { CodeTwoPet } from "./CodeTwoPet";

/** Development-only visual fixture for checking the pet at the real app scale. */
export function PetPreview() {
  const appearance = useAppearanceSettings();
  const search = new URLSearchParams(window.location.search);
  const bubble = search.get("pet-bubble");
  const requestedSize = search.get("pet-size");
  const petSize: PetSize =
    requestedSize === "small" ||
    requestedSize === "medium" ||
    requestedSize === "large"
      ? requestedSize
      : appearance.petSize;

  return (
    <main className="desktop-pet-window">
      <div
        className="desktop-pet-drag-handle electrobun-webkit-app-region-drag"
        aria-hidden="true"
      />
      <CodeTwoPet
        animation={bubble ? "running" : "review"}
        bubble={bubble}
        appearance={{ ...appearance, petSize }}
      />
    </main>
  );
}
