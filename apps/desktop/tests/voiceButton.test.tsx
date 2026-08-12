// @ts-nocheck
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { activateDom, dom, mount, flush, restoreDom } from "./domTestHarness";

activateDom();

/**
 * Web Speech stand-in. `stop()` fires `onend` on a microtask, matching real engines where the
 * end event arrives after `stop()` returns — the ordering the structuring path depends on.
 */
class FakeRecognition {
  static instances = [];
  continuous = false;
  interimResults = false;
  onresult = null;
  onerror = null;
  onend = null;
  started = false;
  stopped = false;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
    queueMicrotask(() => this.onend?.());
  }
  emitFinal(text) {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] });
  }
}
dom.window.SpeechRecognition = FakeRecognition;

// Real bridge: outside Tauri `isDesktop` is false, so the button picks Web Speech up from window.
const { VoiceButton, makeTranscriptHandler } = await import("../src/voice/VoiceButton");
const { TooltipProvider } = await import("../src/components/ui/tooltip");

function mountButton(element) {
  return mount(<TooltipProvider>{element}</TooltipProvider>);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fire(el, type) {
  el.dispatchEvent(new dom.window.PointerEvent(type, { bubbles: true, cancelable: true }));
}
function click(el) {
  el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
}
function micButton(container) {
  return container.querySelector("button");
}
function lastRec() {
  return FakeRecognition.instances[FakeRecognition.instances.length - 1];
}

beforeEach(() => {
  activateDom();
  FakeRecognition.instances = [];
});

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("VoiceButton hold-to-talk", () => {
  test("hold ≥300ms buffers finals and delivers one onTranscript on release", async () => {
    const transcripts = [];
    const chunks = [];
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const { container } = mountButton(
      <VoiceButton
        onText={(t) => chunks.push(t)}
        onTranscript={async (full) => {
          transcripts.push(full);
          await gate;
        }}
      />,
    );
    const btn = micButton(container);

    fire(btn, "pointerdown");
    await flush();
    const rec = lastRec();
    expect(rec.started).toBe(true);
    expect(btn.getAttribute("aria-pressed")).toBe("true");

    rec.emitFinal("hello");
    rec.emitFinal("world");
    expect(chunks).toEqual([]); // buffered, not streamed

    await sleep(320);
    fire(btn, "pointerup");
    click(btn); // the click that trails a mouse release must not restart capture
    await flush();

    expect(rec.stopped).toBe(true);
    expect(transcripts).toEqual(["hello world"]);
    expect(FakeRecognition.instances.length).toBe(1);
    // While the handler runs the button shows the structuring spinner state.
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-label")).toBe("voice.structuring");

    release();
    await flush();
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute("aria-label")).toBe("voice.hold");
  });

  test("a short press falls through to click-to-toggle", async () => {
    const transcripts = [];
    const { container } = mountButton(
      <VoiceButton onText={() => {}} onTranscript={async (full) => transcripts.push(full)} />,
    );
    const btn = micButton(container);

    // Quick press: capture starts and stays running — exactly what a click used to do.
    fire(btn, "pointerdown");
    fire(btn, "pointerup");
    click(btn);
    await flush();
    const rec = lastRec();
    expect(rec.started).toBe(true);
    expect(rec.stopped).toBe(false);
    expect(btn.getAttribute("aria-pressed")).toBe("true");

    rec.emitFinal("hi there");

    // Second click stops it and delivers the buffer once.
    fire(btn, "pointerdown");
    fire(btn, "pointerup");
    click(btn);
    await flush();
    expect(rec.stopped).toBe(true);
    expect(transcripts).toEqual(["hi there"]);
    expect(FakeRecognition.instances.length).toBe(1);
  });

  test("without onTranscript, finals still stream out per chunk", async () => {
    const chunks = [];
    const { container } = mountButton(<VoiceButton onText={(t) => chunks.push(t)} />);
    const btn = micButton(container);

    click(btn);
    await flush();
    const rec = lastRec();
    rec.emitFinal("one");
    rec.emitFinal("two");
    expect(chunks).toEqual(["one", "two"]);

    click(btn);
    await flush();
    expect(rec.stopped).toBe(true);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  test("keyboard activation (bare click) always toggles", async () => {
    const { container } = mountButton(<VoiceButton onText={() => {}} />);
    const btn = micButton(container);
    expect(btn.getAttribute("aria-pressed")).toBe("false");

    click(btn); // Enter/Space fire click without pointer events
    await flush();
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.getAttribute("aria-label")).toBe("voice.stop");

    click(btn);
    await flush();
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(lastRec().stopped).toBe(true);
  });
});

describe("makeTranscriptHandler (R11 structuring degradation)", () => {
  const scene = {
    reference: "builtin:develop",
    name: "develop",
    brief: { template: "{{goal}}", slots: [{ id: "goal", label: "Goal", kind: "text" }] },
  };
  function deps(overrides = {}) {
    const calls = { briefs: [], texts: [], degraded: 0 };
    return {
      calls,
      scene,
      structureBrief: async () => ({ goal: "structured" }),
      insertBrief: (s, values) => calls.briefs.push([s, values]),
      insertText: (t) => calls.texts.push(t),
      onDegrade: () => calls.degraded++,
      ...overrides,
    };
  }

  test("no scene or no brief → no handler at all (today's behavior)", () => {
    expect(makeTranscriptHandler(deps({ scene: null }))).toBeUndefined();
    expect(makeTranscriptHandler(deps({ scene: { ...scene, brief: null } }))).toBeUndefined();
  });

  test("success inserts a pre-filled brief for the scene", async () => {
    const d = deps();
    await makeTranscriptHandler(d)("I want a login page");
    expect(d.calls.briefs).toEqual([[scene, { goal: "structured" }]]);
    expect(d.calls.texts).toEqual([]);
    expect(d.calls.degraded).toBe(0);
  });

  test("null result degrades to raw text plus a toast — the transcript is never lost", async () => {
    const d = deps({ structureBrief: async () => null });
    await makeTranscriptHandler(d)("raw words");
    expect(d.calls.briefs).toEqual([]);
    expect(d.calls.texts).toEqual(["raw words"]);
    expect(d.calls.degraded).toBe(1);
  });

  test("a throwing bridge degrades the same way", async () => {
    const d = deps({
      structureBrief: async () => {
        throw new Error("boom");
      },
    });
    await makeTranscriptHandler(d)("raw words");
    expect(d.calls.texts).toEqual(["raw words"]);
    expect(d.calls.degraded).toBe(1);
  });

  test("an empty slot map counts as failure, not an empty brief", async () => {
    const d = deps({ structureBrief: async () => ({}) });
    await makeTranscriptHandler(d)("raw words");
    expect(d.calls.briefs).toEqual([]);
    expect(d.calls.texts).toEqual(["raw words"]);
  });
});
