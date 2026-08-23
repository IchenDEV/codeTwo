import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { openExternal } from "../bridge";
import { ChartBlock, parseChartSpec } from "./ChartBlock";
import { VisualizationFrame } from "./VisualizationFrame";
import { splitRichText } from "./visualization";

function safeWebLink(uri: string | undefined): string | null {
  if (!uri) return null;
  try {
    const parsed = new URL(uri);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

const components: Components = {
  p: ({ children }) => <p className="my-2 break-words first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mb-2 mt-5 text-section font-medium first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-5 text-ui font-medium first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-4 text-ui font-medium first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 ps-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 ps-5">{children}</ol>,
  li: ({ children }) => <li className="ps-0.5">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-(--ds-radius-control) bg-fill-quiet px-3 py-2 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <div role="separator" className="my-4 h-px bg-border" />,
  strong: ({ children }) => <strong className="font-medium text-foreground">{children}</strong>,
  a: ({ href, children }) => {
    const safe = safeWebLink(href);
    if (!safe) return <span>{children}</span>;
    return (
      <a
        href={safe}
        className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        onClick={(event) => {
          event.preventDefault();
          void openExternal(safe);
        }}
      >
        {children}
      </a>
    );
  },
  img: ({ alt }) => <span className="text-muted-foreground">{alt ?? "Image"}</span>,
  table: ({ children }) => (
    <div className="my-3 max-w-full overflow-x-auto">
      <table className="w-full border-collapse text-fine">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="text-foreground">{children}</thead>,
  th: ({ children }) => <th className="bg-fill-quiet px-2 py-1.5 text-start font-medium">{children}</th>,
  td: ({ children }) => <td className="px-2 py-1.5 align-top">{children}</td>,
  code: ({ className, children }) => (
    <code
      className={
        className
          ? `${className} font-mono text-code`
          : "rounded bg-fill-quiet px-1 py-0.5 font-mono text-code text-foreground"
      }
    >
      {children}
    </code>
  ),
  pre: ({ children }) => {
    const nodes = Children.toArray(children);
    const child = nodes.length === 1 ? nodes[0] : null;
    if (isValidElement(child)) {
      const props = child.props as { className?: string; children?: ReactNode };
      const language = /^language-(.+)$/.exec(props.className ?? "")?.[1];
      if (language === "chart" || language === "chart-json") {
        const source = String(props.children ?? "").replace(/\n$/, "");
        const spec = parseChartSpec(source);
        if (spec) return <ChartBlock spec={spec} />;
      }
    }
    return (
      <pre className="my-3 max-w-full overflow-x-auto rounded-(--ds-radius-module) border bg-fill-quiet p-3 text-code leading-relaxed">
        {children}
      </pre>
    );
  },
};

export function MarkdownContent({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const segments = splitRichText(text, streaming);
  return (
    <div className="codetwo-markdown min-w-0 text-ui leading-[1.7] text-foreground/90">
      {segments.map((segment, index) =>
        segment.kind === "visualization" ? (
          <VisualizationFrame
            key={`${segment.reference.path}-${index}`}
            reference={segment.reference}
          />
        ) : (
          <ReactMarkdown key={index} remarkPlugins={[remarkGfm]} components={components}>
            {segment.text}
          </ReactMarkdown>
        ),
      )}
      {streaming ? (
        <span
          aria-hidden="true"
          className="ms-0.5 inline-block h-4 w-px align-middle animate-pulse bg-foreground/65"
        />
      ) : null}
    </div>
  );
}
