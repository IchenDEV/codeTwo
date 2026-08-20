import { createReactBlockSpec } from "@blocknote/react";
import { createContext, useContext, useRef } from "react";
import { X } from "lucide-react";

import type { DocBlock } from "../bridge";
import type { SceneSlotDef } from "../session/scene";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";

/**
 * The one slot-card block behind both R1 (parameterized macros) and R5 (scene briefs).
 *
 * BlockNote props are scalars only, so the structured pieces ride as JSON strings — the same
 * canvas-envelope pattern `CanvasBlock` uses in `skillInline.tsx`. `mode` decides what the card
 * serializes into: a macro card compiles to one `DocBlock::Skill` with filled params; a brief
 * card compiles to the template's prose interleaved with the filled slot values.
 */
export interface SlotCardProps {
  mode: string; // "macro" | "brief"
  skillId: string; // macro mode: the skill the params belong to
  sceneName: string; // brief mode: provenance only
  title: string;
  icon: string;
  template: string; // raw template with {{slot-id}} placeholders
  slots: string; // JSON SceneSlotDef[]
  values: string; // JSON Record<string, string>
}

/**
 * The Composer-owned seam for pickers the card itself must not reach into desktop IPC for — mirrors
 * `CanvasBlockRuntimeContext`. `carriedArtifacts` stays `[]` until the R4 carry state exists.
 */
export interface SlotCardRuntime {
  pickFile: () => Promise<string | null>;
  carriedArtifacts: () => { id: string; title: string }[];
}

export const SlotCardRuntimeContext = createContext<SlotCardRuntime | null>(null);

/** `{{slot-id}}` placeholders (Agent Scenes 1.0.0 slot-id charset). */
const SLOT_TOKEN = /\{\{([a-z0-9-]+)\}\}/g;

export type TemplateSegment = { kind: "text"; text: string } | { kind: "slot"; id: string };

/** Split a template into prose and slot references, preserving order. */
export function templateSegments(template: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  let last = 0;
  for (const match of template.matchAll(SLOT_TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) segments.push({ kind: "text", text: template.slice(last, at) });
    segments.push({ kind: "slot", id: match[1] });
    last = at + match[0].length;
  }
  if (last < template.length) segments.push({ kind: "text", text: template.slice(last) });
  return segments;
}

/** Legacy macros stored slots as bare id strings; scenes and new macros store full objects. */
export function normalizeSlots(
  raw: readonly (string | (Partial<SceneSlotDef> & { id: string }))[],
): SceneSlotDef[] {
  return raw
    .map((entry): SceneSlotDef | null => {
      if (typeof entry === "string") {
        return { id: entry, label: "", kind: "text" };
      }
      if (!entry || typeof entry.id !== "string" || entry.id.length === 0) return null;
      const kind =
        entry.kind === "multiline" ||
        entry.kind === "select" ||
        entry.kind === "file" ||
        entry.kind === "artifact"
          ? entry.kind
          : "text";
      return {
        id: entry.id,
        label: typeof entry.label === "string" ? entry.label : "",
        kind,
        options: Array.isArray(entry.options) ? entry.options.filter((o) => typeof o === "string") : undefined,
        required: entry.required === true,
        default: typeof entry.default === "string" ? entry.default : undefined,
      };
    })
    .filter((slot): slot is SceneSlotDef => slot !== null);
}

/** Corrupt JSON props degrade to an empty slot list, never a crash (canvas-envelope discipline). */
export function parseSlots(json: string): SceneSlotDef[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? normalizeSlots(parsed) : [];
  } catch {
    return [];
  }
}

/** Corrupt JSON props degrade to no values. */
export function parseValues(json: string): Record<string, string> {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** The filled value a slot compiles with: user input, else the authored default, else empty. */
export function effectiveSlotValue(slot: SceneSlotDef, values: Record<string, string>): string {
  return values[slot.id] ?? slot.default ?? "";
}

/**
 * Serialize one slot card's props into neutral `DocBlock`s. A macro card becomes one skill block
 * with filled params; a brief card becomes the template's prose interleaved with the filled slot
 * values — a filled file slot compiles like an `@` mention, a filled artifact slot becomes the
 * core's `{{artifact:<id>}}` interpolation token. Corrupt JSON degrades to empty slots/values.
 */
export function slotCardToDocBlocks(props: Partial<SlotCardProps>): DocBlock[] {
  const slots = parseSlots(props.slots ?? "[]");
  const values = parseValues(props.values ?? "{}");
  if (props.mode !== "brief") {
    return [
      {
        type: "skill",
        skill_id: props.skillId ?? "",
        params: Object.fromEntries(slots.map((slot) => [slot.id, effectiveSlotValue(slot, values)])),
      },
    ];
  }
  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  const out: DocBlock[] = [];
  let text = "";
  const flushText = () => {
    if (text.trim().length > 0) out.push({ type: "text", text });
    text = "";
  };
  for (const segment of templateSegments(props.template ?? "")) {
    if (segment.kind === "text") {
      text += segment.text;
      continue;
    }
    const slot = byId.get(segment.id);
    if (!slot) continue;
    const value = effectiveSlotValue(slot, values);
    if (!value) continue;
    if (slot.kind === "file") {
      flushText();
      out.push({ type: "file", path: value });
    } else if (slot.kind === "artifact") {
      text += `{{artifact:${value}}}`;
    } else {
      text += value;
    }
  }
  flushText();
  return out;
}

/**
 * Labels (falling back to ids) of every required slot in the document that has neither a value
 * nor a default. A warning for the Run row — never a block on running.
 */
export function unfilledRequiredSlots(editor: {
  document: readonly { type: string; props?: unknown }[];
}): string[] {
  const out: string[] = [];
  for (const block of editor.document) {
    if (block.type !== "slotCard") continue;
    const props = block.props as Partial<SlotCardProps> | undefined;
    const slots = parseSlots(props?.slots ?? "[]");
    const values = parseValues(props?.values ?? "{}");
    for (const slot of slots) {
      if (slot.required && effectiveSlotValue(slot, values).trim() === "") {
        out.push(slot.label || slot.id);
      }
    }
  }
  return out;
}

/** R5 offer-banner visibility: empty document, doc mode, an active scene with a brief, and the
 * user has not dismissed the offer for this session. Never auto-inserts. */
export function briefOfferVisible(state: {
  docMode: boolean;
  docEmpty: boolean;
  hasBrief: boolean;
  dismissed: boolean;
}): boolean {
  return state.docMode && state.docEmpty && state.hasBrief && !state.dismissed;
}

/** Move focus into a just-inserted card's first field once BlockNote has rendered it. */
export function focusSlotCardField(blockId: string): void {
  setTimeout(() => {
    const field = document.querySelector<HTMLElement>(`[data-id="${blockId}"] [data-slot-field]`);
    field?.focus();
  }, 0);
}

interface SlotCardEditor {
  updateBlock: (block: unknown, update: unknown) => unknown;
  removeBlocks: (blocks: unknown[]) => unknown;
  setTextCursorPosition: (block: unknown, placement?: "start" | "end") => void;
  focus: () => void;
}

const FIELD_CLASSES =
  "canvas-ui-control bg-fill-rest px-2 py-1 text-ui outline-none transition-[color,box-shadow,background-color] focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function SlotCardView({
  block,
  editor,
}: {
  block: { id?: string; props: SlotCardProps };
  editor: SlotCardEditor;
}) {
  const t = useT();
  const runtime = useContext(SlotCardRuntimeContext);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const slots = parseSlots(block.props.slots);
  const values = parseValues(block.props.values);
  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  const segments = templateSegments(block.props.template);
  const referenced = new Set(
    segments.filter((s): s is { kind: "slot"; id: string } => s.kind === "slot").map((s) => s.id),
  );
  // Slots the template never references still get a field, appended after the prose.
  const trailing = slots.filter((slot) => !referenced.has(slot.id));

  const write = (id: string, value: string) => {
    const next = { ...values, [id]: value };
    try {
      editor.updateBlock(block, { props: { ...block.props, values: JSON.stringify(next) } });
    } catch {
      /* BlockNote may be tearing down while a field commit lands. */
    }
  };
  // Committing on the native `input` event (via onInput) keeps one write per edit in browsers
  // and in happy-dom, whose own-instance `value` property defeats React's change tracker. The
  // noop onChange only satisfies React's controlled-input contract.
  const noopChange = () => {};

  const exitToEditor = () => {
    try {
      editor.setTextCursorPosition(block, "end");
    } catch {
      /* A content:none block may reject the cursor; focusing is what matters. */
    }
    editor.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      exitToEditor();
      return;
    }
    if (event.key !== "Tab") return;
    const host = containerRef.current;
    if (!host) return;
    const fields = Array.from(host.querySelectorAll<HTMLElement>("[data-slot-field]"));
    const index = fields.indexOf(event.target as HTMLElement);
    if (index < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next = index + (event.shiftKey ? -1 : 1);
    if (next < 0 || next >= fields.length) {
      // Tab past the last field / Shift+Tab before the first returns to the document.
      exitToEditor();
      return;
    }
    fields[next]?.focus();
  };

  const renderField = (slot: SceneSlotDef) => {
    const value = values[slot.id] ?? slot.default ?? "";
    const label = slot.label || slot.id;
    switch (slot.kind) {
      case "multiline":
        return (
          <textarea
            data-slot-field
            aria-label={label}
            aria-required={slot.required || undefined}
            className={cn(FIELD_CLASSES, "w-full resize-none")}
            rows={2}
            placeholder={label}
            value={value}
            onChange={noopChange}
            onInput={(event) => {
              // Auto-grow: track the content height instead of scrolling inside the card.
              const area = event.currentTarget;
              area.style.height = "auto";
              area.style.height = `${area.scrollHeight}px`;
              write(slot.id, area.value);
            }}
          />
        );
      case "select":
        return (
          <select
            data-slot-field
            aria-label={label}
            aria-required={slot.required || undefined}
            className={FIELD_CLASSES}
            value={value}
            onChange={noopChange}
            onInput={(event) => write(slot.id, event.currentTarget.value)}
          >
            <option value="">{t("slotCard.selectPlaceholder")}</option>
            {(slot.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      case "file":
        return runtime ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {value && <span className="max-w-48 truncate font-mono text-fine text-foreground">{value}</span>}
            <Button
              data-slot-field
              type="button"
              variant="secondary"
              size="sm"
              aria-label={`${label}: ${t("slotCard.pickFile")}`}
              onClick={() => {
                void runtime.pickFile().then((path) => {
                  if (path) write(slot.id, path);
                });
              }}
            >
              {t("slotCard.pickFile")}
            </Button>
          </span>
        ) : (
          // No runtime seam mounted (tests, degraded host): fall back to a plain path field.
          <Input
            data-slot-field
            aria-label={label}
            aria-required={slot.required || undefined}
            className="inline-flex w-56 flex-none"
            placeholder={label}
            value={value}
            onChange={noopChange}
            onInput={(event) => write(slot.id, event.currentTarget.value)}
          />
        );
      case "artifact": {
        const artifacts = runtime?.carriedArtifacts() ?? [];
        if (artifacts.length === 0 && !value) {
          return (
            <span className="text-fine text-muted-foreground" data-slot-empty-artifacts>
              {t("slotCard.noArtifacts")}
            </span>
          );
        }
        return (
          <select
            data-slot-field
            aria-label={label}
            aria-required={slot.required || undefined}
            className={FIELD_CLASSES}
            value={value}
            onChange={noopChange}
            onInput={(event) => write(slot.id, event.currentTarget.value)}
          >
            <option value="">{t("slotCard.selectPlaceholder")}</option>
            {artifacts.map((artifact) => (
              <option key={artifact.id} value={artifact.id}>
                {artifact.title}
              </option>
            ))}
          </select>
        );
      }
      default:
        return (
          <Input
            data-slot-field
            aria-label={label}
            aria-required={slot.required || undefined}
            className="inline-flex w-56 flex-none"
            placeholder={label}
            value={value}
            onChange={noopChange}
            onInput={(event) => write(slot.id, event.currentTarget.value)}
          />
        );
    }
  };

  return (
    <div
      ref={containerRef}
      className="canvas-ui-module my-2 min-w-0 bg-fill-quiet p-3"
      contentEditable={false}
      data-slot-card
      data-slot-mode={block.props.mode}
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-1.5 pb-2">
        {block.props.icon && (
          <span className="shrink-0 text-ui leading-none" aria-hidden>
            {block.props.icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-ui font-medium text-foreground">
          {block.props.title}
        </span>
        <Badge variant="outline" className="shrink-0 text-cap text-muted-foreground">
          {block.props.mode === "brief" ? t("slotCard.brief") : t("slotCard.macro")}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-muted-foreground"
          aria-label={t("slotCard.remove")}
          onClick={() => editor.removeBlocks([block])}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {segments.map((segment, index) => {
          if (segment.kind === "text") {
            return (
              <span
                key={`text-${index}`}
                className="whitespace-pre-wrap text-ui text-muted-foreground"
              >
                {segment.text}
              </span>
            );
          }
          const slot = byId.get(segment.id);
          if (!slot) {
            // A placeholder without a slot definition stays visible as prose.
            return (
              <span key={`orphan-${index}`} className="font-mono text-fine text-muted-foreground">
                {`{{${segment.id}}}`}
              </span>
            );
          }
          return <span key={`slot-${index}`} className={cn("inline-flex min-w-0 items-center", slot.kind === "multiline" && "w-full")}>{renderField(slot)}</span>;
        })}
        {trailing.map((slot) => (
          <span key={`trail-${slot.id}`} className={cn("inline-flex min-w-0 items-center", slot.kind === "multiline" && "w-full")}>
            {renderField(slot)}
          </span>
        ))}
      </div>
    </div>
  );
}

export const SlotCardBlock = createReactBlockSpec(
  {
    type: "slotCard",
    propSchema: {
      mode: { default: "macro" },
      skillId: { default: "" },
      sceneName: { default: "" },
      title: { default: "" },
      icon: { default: "" },
      template: { default: "" },
      slots: { default: "[]" },
      values: { default: "{}" },
    },
    content: "none",
  } as const,
  {
    render: (props) => (
      <SlotCardView
        block={props.block as unknown as { id?: string; props: SlotCardProps }}
        editor={props.editor as never}
      />
    ),
  },
);
