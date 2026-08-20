import { CodeTwoPet } from "./CodeTwoPet";

/** Development-only visual fixture for checking the pet at the real app scale. */
export function PetPreview() {
  return (
    <main className="flex size-full items-center justify-center bg-background">
      <CodeTwoPet animation="review" voiceEnabled onVoiceText={() => undefined} />
    </main>
  );
}
