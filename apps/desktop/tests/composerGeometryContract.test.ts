import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const composer = readFileSync(
  new URL("../src/session/Composer.tsx", import.meta.url),
  "utf8",
);
const tokens = readFileSync(
  new URL("../src/design/tokens.css", import.meta.url),
  "utf8",
);
const voiceButton = readFileSync(
  new URL("../src/voice/VoiceButton.tsx", import.meta.url),
  "utf8",
);

describe("composer geometry contract", () => {
  test("keeps the circular submit control concentric with the composer corner", () => {
    expect(tokens).toContain(
      "--ds-composer-radius: calc(var(--ds-radius-modal) + var(--ds-space-module-inset));",
    );
    expect(composer).toContain("data-gooey-composer");
    expect(composer).toContain('data-composer-mode={docMode ? "document" : "compact"}');
    expect(composer).toContain('"composer-mode-transition flex flex-col"');
    expect(composer).toContain(
      ": { shape: true, speed: 1.35, bounce: 0.2, contentBlur: 0 }",
    );
    expect(composer).toContain(
      'LIQUID_AVAILABLE ? "bg-transparent" : "bg-card shadow-raised"',
    );
    expect(composer).toContain('effect={reducedMotion ? undefined : "move"}');
    expect(composer).toContain(
      '"glass-raised pointer-events-auto mx-auto w-full max-w-3xl rounded-(--ds-composer-radius) border p-2 shadow-raised"',
    );
    expect(
      composer.match(
        /"size-8 shrink-0 rounded-full transition-transform active:scale-90 motion-reduce:active:scale-100"/g,
      ),
    ).toHaveLength(2);
    expect(
      composer.match(/className="size-7 shrink-0 rounded-full(?: text-muted-foreground)?"/g),
    ).toHaveLength(2);
    expect(composer).toContain(
      '"flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2 text-hint',
    );
    expect(voiceButton).toContain('className="size-8 shrink-0 rounded-full"');
    expect(composer).toMatch(
      /fill="var\(--secondary\)"[\s\S]*variant="secondary"[\s\S]*onClick=\{onStop\}/,
    );
    expect(composer).not.toContain('"px-3 pb-2.5 pt-1.5"');
    expect(composer).not.toContain(
      'className="size-8 shrink-0 rounded-(--ds-radius-control) transition-transform active:scale-90"',
    );
  });
});
