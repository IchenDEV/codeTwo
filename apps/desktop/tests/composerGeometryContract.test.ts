import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const composer = readFileSync(
  new URL("../src/session/Composer.tsx", import.meta.url),
  "utf8",
);
const app = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const bridge = readFileSync(
  new URL("../src/bridge.ts", import.meta.url),
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
  test("paints the compact composer on the same DOM card as its interactive content", () => {
    expect(composer).not.toContain("function ComposerLiquidSurface");
    expect(composer).not.toContain("data-gooey-composer");
    expect(composer).toContain(
      '"rounded-composer bg-card shadow-raised transition-shadow duration-feedback ease-enter focus-within:focus-ring-inset"',
    );
  });

  test("keeps the circular submit control concentric with the composer corner", () => {
    expect(tokens).toContain(
      "--ds-composer-radius: calc(var(--ds-radius-modal) + var(--ds-space-module-inset));",
    );
    expect(composer).toContain('data-composer-mode={docMode ? "document" : "compact"}');
    expect(composer).toContain('"composer-mode-transition flex flex-col"');
    expect(composer).toContain('effect={reducedMotion ? undefined : "move"}');
    expect(composer).toContain(
      '"glass-raised pointer-events-auto mx-auto w-full max-w-3xl rounded-composer p-2 shadow-raised"',
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
      '"flex h-control-mini shrink-0 items-center gap-1.5 rounded-control px-2 text-hint',
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

describe("composer multitask contract", () => {
  test("starts a parallel task in an isolated worktree instead of queueing it", () => {
    expect(composer).toContain("onMultitask: () => void;");
    expect(composer).toContain(
      '<DropdownMenuItem onClick={onMultitask}>',
    );
    expect(composer).toContain('t("composer.multitask")');
    expect(app).toContain("onMultitask={startParallelTask}");
    expect(app).toMatch(/sessionCreationBaselineSha\(\s*"current"/);
    expect(app).toContain(
      'parallelTask: true',
    );
    expect(bridge).toContain('call("engine.new_parallel_task"');
    expect(bridge).toContain("task_id: parallelTask.taskId");
    expect(bridge).toContain("goal: parallelTask.goal");
  });
});
