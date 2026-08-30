# Desktop-frontend implementation spec — roadmap R1–R12

Companion to `docs/reference/scenes.md` and `docs/design/scenes-impl-core.md`. Implementing agents follow
this and note deviations in their handoff. Paths relative to repo root. Schemas at
`crates/core/schemas/agent-scenes/1.0.0/` are frozen; slot/artifact vocabulary copies them
verbatim. Tests: `bun test` in `apps/desktop/tests/` with `domTestHarness.ts`; all new JSX passes
`apps/desktop/src/design/tokens.css` and the desktop lint configuration (copy tokens from `Chip`, Composer.tsx:104).

**i18n discipline:** every item appends its keys at the END of both `en` and `zh` dicts in
`apps/desktop/src/i18n/strings.ts` under its own prefix, one contiguous block, never touching
existing lines. Prefixes: `scene.` `slotCard.` `brief.` `planDoc.` `mission.` `statusline.`
`dockFollow.` `voice.` `templateFrom.` `issueDeleg.`

**Degradation discipline:** every new bridge call feature-detects (catch the invoke error once,
cache the answer, hide the affordance) — a missing backend command never breaks the UI.

## Shared type foundation (lands with R3; used by R1/R5/R11/R12)

New file `apps/desktop/src/session/scene.ts` (pure logic + types, no JSX):

```ts
export type SceneSource = "builtin" | "user" | "project" | "plugin";
export interface SceneSlotDef {        // == brief.slots item in scene.schema.json, verbatim
  id: string; label: string;
  kind: "text" | "multiline" | "select" | "file" | "artifact";
  options?: string[]; required?: boolean; default?: string;
}
export interface SceneBrief { template: string; slots?: SceneSlotDef[]; clarify?: "multi_choice" | "free_form" | "off"; }
export interface SceneArtifactDef { id: string; title: string; kind: "document"|"plan"|"report"|"test_report"|"checklist"|"diff"|"link"|"custom"; required?: boolean; template?: string; description?: string; }
export interface SceneInfo {           // wire shape from the R3 backend loader
  reference: string; name: string; title: string; description?: string; icon?: string; source: SceneSource;
  execution: { session_mode?: string; memory_preset?: string; worktree?: string; plan_first?: boolean; providers?: string[]; model?: string; reasoning_effort?: string; };
  brief?: SceneBrief; artifacts?: SceneArtifactDef[];
  skills?: { pinned?: string[]; inline?: {name:string; text:string; icon?:string}[]; suppress_unpinned?: boolean };
}
```

Pure helpers in the same file:
- `sceneCustomized(scene, live: {mode, memoryPreset, planFirst, provider, model, effort}): boolean`
  — compares only fields the scene sets (unset = inherit = never customized).
- `softApplyPending(scene, live): string[]` — binding matrix: providers/model/reasoning_effort
  pend on soft-apply; worktree always pends (immutable per session).
- `escalationNeeded(scene, currentMode): {from, to} | null` — order per `SESSION_MODES` (mode.ts);
  App shows a confirm dialog naming both modes before applying a looser scene, never silent.
- `nextSceneInRing(ring: string[], scenes, active): string | null`.

Bridge functions expected (append at bridge.ts tail; each guarded by `inDesktop` + feature-detect):
`listScenes(cwd)`, `getScene(reference)`, `applySceneToSession(session, reference, strength:
"soft"|"full", confirmEscalation)`, `sceneSessionPlan(reference, cwd)`, `setSessionScene`,
`getSessionScene`, `usageBySession(session)`, `recordSceneArtifact(session, artifactKey,
content)`, `listSceneArtifacts(session)`, `sceneArtifactContent(recordId)`, `pinSceneArtifact`,
`structureBrief(scene, transcript)`, `proposeMacroSlots(text)`, `sessionDiffStat(session)`,
`commentIssue(cwd, source, id, body)`, pipeline commands (R9), `dismissSceneBanner` (R8).

---

## Item 1 — R3 scene chip + config (lands first)

### Components (new file `apps/desktop/src/session/SceneChip.tsx`)

| Component | Props | Notes |
|---|---|---|
| `SceneChip` | `{ config: SessionConfig }` | Scene selection only. Label: scene icon + title, amber-dot **customized** badge, partial-apply dot when `scenePendingFields.length > 0`. |
| `SceneChipPopover` | rendered inside `PopoverContent` | Top to bottom: (1) header — scene title, `SourceBadge`, `CustomizedBadge`; (2) scene list (MenuRow per resolved scene, "None" row); (3) footer: partial-apply notice + "Restart in this scene" when pending fields exist. |
| `SessionControls` | `{ config; models, currentModel, defaultModel, onModel, configOptions, onConfigOption }` | Compact composer row with Scene, Provider, and Model/Effort visible; Permission, Memory, and Worktree sit behind one adjacent disclosure control. |
| `SourceBadge` | `{ source: SceneSource }` | Pill styled like `DefaultBadge` (Composer.tsx:128). |
| `ScenePicker` (full) | `{ scenes, activeScene, onScene, onClose }` | Palette-style dialog: all resolved scenes, description + SourceBadge; reached from "All scenes…" row + palette command. |

The primary and disclosed session rows wrap independently from the action row, so narrow composer
widths never hide the run, stop, voice, or document controls. Keeping configuration outside the
scene popover also avoids nested-popover focus and dismissal behavior. When the checkout bar is
rendered, it is the only worktree selector.

### SessionConfig extension (`apps/desktop/src/session/config.ts`)

```ts
scenes: SceneInfo[];
activeScene: SceneInfo | null;
onScene: (reference: string | null, strength: "soft" | "full") => void;
sceneCustomized: boolean;
scenePendingFields: string[];
onRestartInScene: () => void;      // new session, full-apply, carry declared artifacts
```

### State ownership — App.tsx regions (all five)

- **State block (383-399):** `scenes`, `activeSceneName` (per session — `Map<sessionId,string>`
  ref restores on session switch), `showScenePicker`, `sceneEscalation:
  {scene, from, to} | null`.
- **Event ladder:** only the `session_created` arm — clear `pendingSceneRef` after full-apply
  creation. No other rungs (keeps out of R10/R8's way).
- **dispatchAction:** `case "cycle_scene"`, `case "open_scene_picker"`.
- **paletteCommands:** "Switch scene…" + one command per scene.
- **Dialogs:** `ScenePicker` + escalation confirm dialog (small Dialog naming both modes).

`onScene` soft path: apply session_mode/memory/plan_first through existing `onSessionMode` /
`onMemoryPolicy` / `onPlan` handlers, record pending fields, call
`applySceneToSession(session, ref, "soft", confirmed)`. `onRestartInScene`: `createSession`
variant passing the scene for full-apply (`sceneSessionPlan` → `newSession` → set model/effort →
`setSessionScene`).

### Shift+Tab arbitration (DECIDED)

`cycle_scene` keymap action, default `Shift+Tab`, dispatched from the global key handler **only
when `isTypingTarget(e.target)` (keys.ts) is false**. Inside BlockNote/slot-card fields Tab keeps
its editing semantics; users can rebind. SceneChip tooltip shows
`keyHint(bindings, "cycle_scene")`. Escape exits the editor; Escape→Shift+Tab cycles from
anywhere.

Tests: `tests/scene.test.ts` (customized diff, pending matrix, ring cycling, escalation
ordering); `tests/sceneChip.test.tsx` (active scene renders, customized badge after mode
override, restart button on pending fields, source badges).

---

## Item 2 — R1 macro slot card + R5 brief fields (one shared spec)

### The spec (new file `apps/desktop/src/editor/slotCard.tsx`, registered in skillInline.tsx schema)

**One `createReactBlockSpec`**, type `"slotCard"`, `content: "none"`, scalar props with
JSON-encoded structure (canvas-envelope pattern):

```ts
propSchema: {
  mode:     { default: "macro" },     // "macro" | "brief"
  skillId:  { default: "" },          // macro mode
  sceneName:{ default: "" },          // brief mode
  title:    { default: "" }, icon: { default: "" },
  template: { default: "" },          // raw template with {{slot-id}} placeholders
  slots:    { default: "[]" },        // JSON SceneSlotDef[]
  values:   { default: "{}" },        // JSON Record<string, string>
}
```

Why one block spec (not inline spec + prose blocks): an inline slot field can't host multiline
textareas; a `contentEditable={false}` card gives deterministic serialization and trivial
intra-card Tab order. Trade-off accepted: brief prose between fields renders as static muted text
inside the card (split `template` on `/\{\{([a-z0-9-]+)\}\}/`); users edit surrounding context as
normal blocks outside the card.

**`SlotCardView`**: card chrome (title row: icon, title, mode pill, remove ×), interleaved
prose/fields. Field renderers: `text` → Input; `multiline` → auto-growing textarea; `select` →
native select over options; `file` → button opening the workspace file picker via runtime
context, stores path; `artifact` → select over carried artifacts, empty row "No artifacts
carried".

**`SlotCardRuntimeContext`** (mirror CanvasBlockRuntimeContext, skillInline.tsx:90):
`{ pickFile(): Promise<string|null>; carriedArtifacts(): {id:string; title:string}[] }`.
Provided by Composer; `pickFile` reuses the @-mention file picker plumbing; `carriedArtifacts`
from App (R3/R4 carry state, `[]` until then).

**Tab navigation:** card registers field elements in DOM order; `onKeyDown` on the container:
Tab → next field, Shift+Tab → previous, Tab on last / Shift+Tab on first → return focus to the
editor (`editor.setTextCursorPosition(block, "end")` + `editor.focus()`). Escape → editor. All
fields are typing targets, so no collision with global `cycle_scene`. Field edits write through
`editor.updateBlock(block, {props:{values: JSON.stringify(next)}})`.

### docToBlocks (skillInline.tsx) — new block arm before the content loop

```
if (block.type === "slotCard"): flush();
  values = JSON.parse(props.values); slots = JSON.parse(props.slots);   // corrupt JSON → {} / [] (degrade)
  effective(slot) = values[slot.id] ?? slot.default ?? "";
  if mode === "macro": out.push({ type:"skill", skill_id: props.skillId, params: Object.fromEntries(slots.map(s=>[s.id, effective(s)])) });
  else (brief): walk template segments in order:
    - text segment → append to a local buffer;
    - file slot with a value → flush buffer as {type:"text"}, push {type:"file", path}  (compiles like @ mention);
    - artifact slot with a value → append `{{artifact:<id>}}` to the buffer (core resolves the token);
    - other kinds → append effective value (markdown text);
    flush buffer as text blocks.
```
This fixes the `params:{}` gap for macros with slot cards; the bare `SkillInline` chip remains
for fragment skills and legacy macros without metadata.

### Insertion points

- `editor/Editor.tsx` `insertSkillRef` + `/` menu: when the picked skill is a macro **with slot
  metadata** (`macro_slots` on SkillInfo), insert a `slotCard` block (`editor.insertBlocks`),
  focus first field. Normalize legacy `string[]` slots → text SlotDefs via pure `normalizeSlots`.
- Brief: `insertBriefRef: MutableRefObject<((scene: SceneInfo, values?: Record<string,string>) => void) | null>`
  — builds a brief slotCard from `scene.brief` (optionally pre-filled values, used by R11) and
  inserts at document top.

### Empty-doc brief affordance (R5, Composer.tsx)

- Composer state `briefDismissed` keyed by session. When `docMode && docEmpty &&
  config.activeScene?.brief && !briefDismissed`: a floating, positioned offer banner (one element
  inside the single tree — respect Composer.tsx:917 warning): "Start from the *{scene}* brief"
  [Insert] [Dismiss]. Never auto-inserts.
- Doc non-empty: "Insert brief" item appended to the + dropdown (only when a scene with a brief
  is active) + palette command.
- Required-slot warning: pure `unfilledRequiredSlots(editor)` exported from slotCard.tsx;
  Composer shows a `tone="warning"` hint chip near Run when non-empty — warning, never a block.

Tests: `tests/slotCardCompile.test.ts` (macro→params incl. defaults; brief interleaving; corrupt
JSON degrades); `tests/slotCardRendered.test.tsx` (Tab order, select options, file picker via
mocked context, values round-trip); `tests/briefAffordance.test.tsx` (offer only on empty doc,
dismiss persists, insert-brief menu when non-empty).

---

## Item 3 — R4 plan-as-document

### Artifact inline reference

`ArtifactInline` in skillInline.tsx next to SessionMentionInline: `createReactInlineContentSpec`,
type `"artifactMention"`, props `{ artifactId, title, kind }`, chip render `⌘ {title}`.
docToBlocks inline arm: flush; push `{ type:"text", text: "{{artifact:" + artifactId + "}}" }`
(the spec's interpolation token — no DocBlock change needed frontend-side; core's
DocBlock::Artifact via compile_full covers richer flows). Insertion: the `@` menu gains an
"Artifacts" section fed by `listSceneArtifacts`.

### Where the plan document lives (DECIDED)

**The plan opens into the composer document of the current session (the one BlockNote instance),
expanded to docMode.** A second editor view or a new session duplicates BlockNote wiring or
spends the draft-reset on an artifact the user wants to edit and re-run here. The edited plan IS
the next prompt.

Flow:
- TurnCard Plan detail gains "Open as document" (+ "Pin as artifact" when the active scene
  declares a `plan` artifact — calls `recordSceneArtifact`). New optional props
  `onOpenPlanAsDocument?: (entries: string[]) => void; onPinPlanArtifact?: (markdown: string) => void`,
  threaded via TranscriptPane.
- App `openPlanAsDocument`: markdown = entries → checklist; if docEmpty →
  `editor.tryParseMarkdownToBlocks` + insert + docMode(true); else confirm dialog
  Replace / Append / Cancel. Prepend an artifactMention chip line when pinned (provenance).

App regions: dialogs (confirm), paletteCommands ("Open last plan as document").

Tests: `tests/artifactMention.test.ts` (token emission); `tests/planDocument.test.tsx` (button
renders; empty-doc inserts; non-empty shows dialog).

---

## Item 4 — R6 mission control

**Mount: overlay dialog** (not rail expansion) — the rail is fixed-narrow; diff stats and review
actions need a table; every comparable surface is a dialog in the dialogs block.

Files:
- `apps/desktop/src/sidebar/missionControl.ts` (pure):
  ```ts
  export interface MissionRow { session: SessionInfo; state: "running"|"awaiting_input"|"failed"|"idle";
    needsMe: boolean;  // awaiting_input, or failed, or idle-with-diff (needs review)
    scene: string | null; stage: string | null; contextPct: number | null; }
  export function missionRows(sessions, activities, contextWindows, sceneBySession): MissionRow[]  // needsMe → running → idle
  ```
- `apps/desktop/src/sidebar/MissionControl.tsx`: `MissionControlDialog` props `{ sessions,
  runningSessions, contextWindows, sceneBySession, onSelect(id), onReview(id), onClose }`. Rows:
  status dot (reuse sessionActivity mapping), title, scene/stage pill, `DiffStatCell`
  (self-fetching `sessionDiffStat(id)` on mount, module-map cache, spinner → `+a −d in n files`
  → dash), context bar, "Review" button → onSelect + onReview (opens SourceControl).

App regions: state (`showMissionControl`), dispatchAction (`open_mission_control`), palette,
dialogs. Keymap action `OpenMissionControl` (core keymap.rs append alongside CycleScene — if R3
already landed CycleScene, this is a second append using the same 5-edit pattern).

SessionRail (surgical): split awaiting-input out of isRunning — amber pulse dot +
`title=t("mission.awaiting")`; red for failed (exists); rail-header icon button opening mission
control with a needsMe count badge.

Tests: `tests/missionControl.test.ts` (derivation + ordering); `tests/missionControlRendered.test.tsx`
(rows, review wiring, awaiting badge).

---

## Item 5 — R7 statusline

**Placement: Composer controls row**, replacing `ContextWindowStatus` at its position (R3 freed
the row; per-session state belongs on the per-session surface; R6 covers cross-session).

Files:
- `apps/desktop/src/session/statusline.ts` (pure):
  ```ts
  export type StatusTone = "ok" | "warn" | "critical";
  export const CONTEXT_WARN = 0.6; export const CONTEXT_CRITICAL = 0.85;
  export function contextTone(pct: number | null): StatusTone | null;
  export function deriveBurnRate(samples: {at:number; input:number; output:number}[]): number | null; // tokens/min, 5-min window, null under 2 samples
  export function formatCost(usd: number): string;
  ```
- `apps/desktop/src/session/Statusline.tsx`: props `{ contextWindow: ContextWindow | null;
  usage: {costUsd:number|null; burnRate:number|null} | null }`. Context segment (reuses
  `describeContextWindow`, tone dot — design tokens only) + cost segment `$x.xx · n tok/min`
  rendered only when `usage` non-null (feature-detect `usageBySession` once). Popover: exact
  tokens + per-session in/out totals.

State: `usageSamplesRef: Map<sessionId, sample[]>` appended from the existing `Event::Usage` arm
(one-line append inside an existing arm — no new rungs); 30s `usageBySession` poll while active
session runs. Pass `{costUsd, burnRate}` through Composer props.

Tests: `tests/statusline.test.ts` (boundaries at exactly 60/85, burn window math, null gating).

---

## Item 6 — R10 dock follow

### Classifier — new `apps/desktop/src/session/toolActivity.ts` (zero edits to agentActivity.ts)

```ts
export interface ToolSurfaceHint { surface: DockSurface; file?: string; }
export function classifyToolSurface(tool: { kind?: string|null; title: string; agentInput?: unknown }): ToolSurfaceHint | null;
// terminal: shell/bash/exec/command/test-run verbs → terminal
// files: edit/write/create/apply_patch → {files, file: path from input (file_path|path|filename)}
// git: commit/branch/merge/status → git
// read-only + everything else → null (never follow on reads)
```
Pure latch reducer (testable without App):
```ts
export interface FollowState { manualLatched: boolean; autoTab: DockSurface | null; lastSwitchAt: number; }
export type FollowEvent =
  | { kind: "tool"; hint: ToolSurfaceHint; now: number; dockOpen: boolean }
  | { kind: "manual"; tab: DockTab | null }          // any user tab choice or close
  | { kind: "run_ended" }                            // running -> idle | failed
  | { kind: "session_switched" };
export function followReduce(s: FollowState, e: FollowEvent): { state: FollowState; setTab?: DockSurface };
```
**Latch semantics:** any manual dock action latches immediately, running or not. While latched,
auto-follow emits nothing. Latch clears ONLY on run end (running → idle|failed) or session
switch; `awaiting_input` does NOT clear it. Auto-follow never opens a closed dock (record
`autoTab` for badge, emit no setTab). Debounce: ≤1 auto switch per 2000ms and only on surface
change.

### App.tsx wiring

- `dockFollowRef = useRef<FollowState>(...)`.
- Event ladder: exactly ONE new call site — inside the arm that already applies tool-call parts
  for the active session, `handleDockFollow(ev)` runs classify → reduce → `setDockTab` when
  emitted; mirrors hint into `dockAutoHint` state. (Single named call keeps the R8 merge a
  one-line conflict.)
- Route ALL manual paths through the reducer: wrap `toggleDock`, Dock's `onTab`, and
  `close_panel`/`toggle_*` dispatch arms with `{kind:"manual"}`. Programmatic `setDockTab`
  (browser insert, file reveal) stays raw.
- `run_ended` derived in the existing activity arm (append inside existing arm).

### Dock highlight (dock/Dock.tsx)

New props `autoTab: DockSurface | null; highlightFile: string | null`. Matching TabsTrigger gets
a subtle primary-tint pulse (design tokens) + `title=t("dockFollow.auto")`; `highlightFile`
forwards to the files surface as selected/scroll target.

Tests: `tests/toolActivity.test.ts` — classification table + reducer scenarios (manual-during-run
suppresses until run_ended; awaiting_input keeps latch; closed dock never opens; debounce;
session switch resets).

---

## Item 7 — R11 voice → structured brief

### VoiceButton rework (voice/VoiceButton.tsx)

New props: `{ onText: (t:string)=>void; onTranscript?: (full:string)=>Promise<void>; hint?: string }`.
- **Hold-to-talk:** `onPointerDown` starts; `onPointerUp`/`onPointerLeave` stops if held ≥300ms;
  shorter press falls through to click-to-toggle (kept verbatim as the accessibility path;
  keyboard Enter/Space always toggle; `aria-pressed`). New "structuring" spinner state.
- **Buffering:** with `onTranscript` present, the Web-Speech path appends finals to a buffer
  instead of per-chunk `onText`. On stop, buffer non-empty → `await onTranscript(buffer)`; else
  today's behavior exactly. Local-transcriber path routes its single buffer the same way.
- Migrate the file's hardcoded strings to i18n (`voice.`).

### Structuring path (App.tsx, replacing the plain onVoiceText handler)

```
onTranscript(full):
  scene = activeScene; if (!scene?.brief) → insertTextRef(full); return       // degradation = today
  try values = await structureBrief(scene.reference, full)                    // bridge; model fills slot ids
      insertBriefRef.current?.(scene, values)                                 // pre-filled slot card
  catch → toast + insertTextRef(full)                                         // never lose the transcript
```
Composer passes `onTranscript` only when `config.activeScene?.brief` exists.

Backend note: `structure_brief` command may be implemented as a lightweight one-shot provider
call or heuristic sectioning; the hard acceptance criterion is the degradation path (raw insert
on any failure).

Tests: `tests/voiceButton.test.tsx` (hold ≥300ms → one onTranscript; short press toggles; no
onTranscript → unchanged; keyboard path); structuring degradation as a pure handler test with a
mocked bridge.

---

## Item 8 — R2 template-from-history

### TurnCard turn menu

Hover-visible kebab `DropdownMenu` on the user-prompt row header (ghost MoreHorizontal button,
SessionRail hover-actions idiom) with "Save as template…". New optional prop
`onSaveTemplate?: (promptText: string) => void`, threaded via TranscriptPane. A menu (not a bare
button) so R4's "Pin as artifact" and future actions slot in.

### Flow

1. App state `templateDraft: {source:string}|null`; entries: TurnCard menu + palette "Save last
   prompt as template".
2. New `apps/desktop/src/session/TemplateDialog.tsx`: on open calls `proposeMacroSlots(source)`
   (spinner over read-only source). On result: editable preview — (a) template textarea with
   `{{slot}}` token pills (read-mode overlay / raw edit toggle); (b) slot table: id / label /
   kind select / options (comma list, enabled for select) / required / default; add + remove;
   (c) name, icon, description. Validation: every `{{token}}` has a slot row and vice versa
   (pure `validateMacroDraft`, exported). Propose failure → blank slot table over raw text (the
   dialog still works as a manual template editor).
3. Save → existing skill-creation bridge path with `payload: {kind:"macro", template, slots}` →
   `refreshSkills()` → toast; immediately insertable as an R1 slot card.

Tests: `tests/templateDialog.test.tsx` (propose populates; edits round-trip; save payload;
degradation); validateMacroDraft pure cases; TurnCard menu in existing turnCardRendered test.

---

## Item 9 — R12 issue delegation UI

### Issue block (replacing plain-text insert)

`editor/issueBlock.tsx` — `createReactBlockSpec`, type `"issueRef"`, `content:"none"`, props
(browserNote pattern — compiled markdown rides along):
```ts
{ source: {default:""}, issueId: {default:""}, title: {default:""}, url: {default:""}, state: {default:""},
  context: {default:""},           // exact issueContext() markdown — what the agent sees
  delegatedScene: {default:""} }   // provenance
```
Card: `#id` link, title, state pill, delegatedScene provenance pill, remove ×. docToBlocks arm:
flush; push `{type:"text", text: props.context}` (browserNote-identical).

App `insertIssue` becomes: `const ctx = await issueContext(issue); insertIssueRef.current?.(issue, ctx)`
(plain-text path deleted for issues).

### "Delegate to scene" in the Issues modal

Per row, next to "Add to prompt": "Delegate…" DropdownMenu listing scenes (new props
`scenes: SceneInfo[]`, `onDelegate(issue, sceneRef)`). App's onDelegate: (1) best-effort
`recordIssueDelegation`/comment attribution, (2) create a new session full-apply in that scene
with the issue block queued as initial document via a `pendingInsertRef` consumed after draft
reset, (3) close modal, toast "Delegated #id to *scene* — you stay assignee". Migrate the
modal's hardcoded strings while touching it.

### Activity trail

Per issue row, expandable "Activity": lazily fetch delegations → compact timeline: scene pill ·
relative time · status dot · artifact chips (PR links external; artifacts via reveal/mention).
Empty and bridge-missing states render one muted line.

Tests: `tests/issueBlock.test.ts` (docToBlocks arm, provenance props);
`tests/issuesDelegation.test.tsx` (menu lists scenes, onDelegate payload, trail from fixture).

---

## Item 10 — Frontend integration order

1. **R3** — all five App regions + config.ts + Composer controls + keymap. Alone.
2. **R1 (+R5)** — skillInline/Editor/Composer; App contact refs only.
3. **R7** — Composer row + one append inside an existing ladder arm.
4. **R10** — next ladder consumer; must be FULLY merged before R8 frontend ladder work.
5. **R4** — TurnCard + confirm dialog + palette.
6. **R6** — state + dialogs + palette + SessionRail (serial after R4's dialog edit).
7. **R2** — dialogs + TurnCard menu (after R1 and R6).
8. **R11** — after R1/R5 (insertBriefRef with values) + R3.
9. **R12** — last: needs R3 + dialogs queue clear; zero ladder footprint.

Cross-cutting checklist per merge: design-system script passes; every new keymap action has a
dispatchAction arm; Composer stays one element tree; bridge calls feature-detect and degrade.
