import { createReactBlockSpec } from "@blocknote/react";

import { Badge } from "@/components/ui/badge";
import { TooltipButton } from "@/components/ui/tooltip";

import type { DocumentBlock } from "../bridge";
import { useT } from "../i18n";

// An issue-tracker reference as a first-class document block (R12), replacing the plain-text
// paste of `issueContext()`. Same shape as browserNote: the exact compiled markdown rides along
// in `context`, so serialization stays byte-stable — the card is a view of it, never a
// re-rendering. `delegatedScene` is provenance: non-empty means this draft was opened by
// delegating the issue into that scene.
export interface IssueRefProps {
  /**
  `github` | `linear`.
  */
  source: string;
  issueId: string;
  title: string;
  url: string;
  state: string;
  /**
  The exact `issueContext()` markdown — what the agent sees at compile time.
  */
  context: string;
  /**
  Scene title this issue was delegated to; empty for a plain add-to-prompt insert.
  */
  delegatedScene: string;
}

export function issueContextBody(context: string): string {
  const cut = context.indexOf("\n\n");
  return cut === -1 ? "" : context.slice(cut + 2);
}

export function issueContextMarkdown(
  block: {
    source: string;
    id: string;
    title: string;
    url: string;
    body: string;
  },
  state = "open"
): string {
  const head = `**${block.source} #${block.id}** — ${block.title} (${state})\n${block.url}`;
  const body = block.body.trim();
  return body ? `${head}\n\n${body.slice(0, 1500)}` : head;
}

export function issueRefToDocBlock(props: IssueRefProps): DocumentBlock | null {
  if (!props.issueId) {
    return null;
  }
  return {
    body: issueContextBody(props.context),
    id: props.issueId,
    source: props.source,
    title: props.title,
    type: "issue",
    url: props.url,
  };
}

function IssueRefCard({
  props,
  onRemove,
}: {
  readonly props: IssueRefProps;
  readonly onRemove: () => void;
}) {
  const t = useT();
  return (
    <div
      className="canvas-ui-module bg-fill-quiet my-1 flex items-center gap-3 p-2.5"
      contentEditable={false}
    >
      {/* Same external-link shape as the Issues modal rows: a plain anchor, which Electrobun routes
          to the system browser. */}
      <a
        href={props.url}
        target="_blank"
        rel="noreferrer"
        className="text-body text-primary shrink-0 font-mono font-semibold no-underline"
      >
        #{props.issueId}
      </a>
      <span className="text-body min-w-0 flex-1 truncate">{props.title}</span>
      {props.state ? (
        <Badge variant="secondary" className="uppercase">
          {props.state}
        </Badge>
      ) : null}
      {props.delegatedScene ? (
        <Badge variant="outline">
          {t("issueDeleg.pill", { scene: props.delegatedScene })}
        </Badge>
      ) : null}
      <TooltipButton
        label={t("issueDeleg.remove")}
        type="button"
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground shrink-0"
        onClick={onRemove}
      >
        ×
      </TooltipButton>
    </div>
  );
}

export const IssueRefBlock = createReactBlockSpec(
  {
    content: "none",
    propSchema: {
      context: { default: "" },
      delegatedScene: { default: "" },
      issueId: { default: "" },
      source: { default: "" },
      state: { default: "" },
      title: { default: "" },
      url: { default: "" },
    },
    type: "issueRef",
  } as const,
  {
    render: (props) => (
      <IssueRefCard
        props={props.block.props as unknown as IssueRefProps}
        onRemove={() => props.editor.removeBlocks([props.block])}
      />
    ),
  }
);
