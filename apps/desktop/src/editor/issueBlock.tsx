import { createReactBlockSpec } from "@blocknote/react";
import { Badge } from "@/components/ui/badge";
import { useT } from "../i18n";
import type { DocBlock } from "../bridge";

// An issue-tracker reference as a first-class document block (R12), replacing the plain-text
// paste of `issueContext()`. Same shape as browserNote: the exact compiled markdown rides along
// in `context`, so serialization stays byte-stable — the card is a view of it, never a
// re-rendering. `delegatedScene` is provenance: non-empty means this draft was opened by
// delegating the issue into that scene.
export interface IssueRefProps {
  /** `github` | `linear`. */
  source: string;
  issueId: string;
  title: string;
  url: string;
  state: string;
  /** The exact `issueContext()` markdown — what the agent sees at compile time. */
  context: string;
  /** Scene title this issue was delegated to; empty for a plain add-to-prompt insert. */
  delegatedScene: string;
}

/**
 * The body portion of the compiled context markdown. `issues::Issue::to_context` renders a
 * two-line header (`**source #id** — title (state)` + url) and, only when the issue has a body,
 * appends it after one blank line — so everything past the first blank line is the body, and a
 * header-only context means the issue had none.
 */
export function issueContextBody(context: string): string {
  const cut = context.indexOf("\n\n");
  return cut < 0 ? "" : context.slice(cut + 2);
}

/**
 * Rebuild the context markdown from a core `DocBlock::Issue`, mirroring
 * `issues::Issue::to_context` (which the core compile arm renders with state fixed to "open").
 */
export function issueContextMarkdown(
  block: { source: string; id: string; title: string; url: string; body: string },
  state = "open",
): string {
  const head = `**${block.source} #${block.id}** — ${block.title} (${state})\n${block.url}`;
  const body = block.body.trim();
  return body ? `${head}\n\n${body.slice(0, 1500)}` : head;
}

/**
 * Serialize the block into the core `DocBlock::Issue`. The core arm rebuilds `to_context` from
 * source/id/title/url (state fixed to "open"), so `body` must carry only the body portion of the
 * embedded context — passing the whole markdown would compile with a duplicated header.
 */
export function issueRefToDocBlock(props: IssueRefProps): DocBlock | null {
  if (!props.issueId) return null;
  return {
    type: "issue",
    source: props.source,
    id: props.issueId,
    title: props.title,
    url: props.url,
    body: issueContextBody(props.context),
  };
}

function IssueRefCard({
  props,
  onRemove,
}: {
  props: IssueRefProps;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <div className="canvas-ui-module my-1 flex items-center gap-3 bg-fill-quiet p-2.5" contentEditable={false}>
      {/* Same external-link shape as the Issues modal rows: a plain anchor, which Tauri routes
          to the system browser. */}
      <a
        href={props.url}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 font-mono text-ui font-semibold text-primary no-underline"
      >
        #{props.issueId}
      </a>
      <span className="min-w-0 flex-1 truncate text-ui">{props.title}</span>
      {props.state && (
        <Badge variant="secondary" className="uppercase">
          {props.state}
        </Badge>
      )}
      {props.delegatedScene && (
        <Badge variant="outline">{t("issueDeleg.pill", { scene: props.delegatedScene })}</Badge>
      )}
      <button
        type="button"
        className="shrink-0 text-ui text-muted-foreground"
        title={t("issueDeleg.remove")}
        aria-label={t("issueDeleg.remove")}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}

export const IssueRefBlock = createReactBlockSpec(
  {
    type: "issueRef",
    propSchema: {
      source: { default: "" },
      issueId: { default: "" },
      title: { default: "" },
      url: { default: "" },
      state: { default: "" },
      context: { default: "" },
      delegatedScene: { default: "" },
    },
    content: "none",
  } as const,
  {
    render: (props) => (
      <IssueRefCard
        props={props.block.props as unknown as IssueRefProps}
        onRemove={() => props.editor.removeBlocks([props.block])}
      />
    ),
  },
);
