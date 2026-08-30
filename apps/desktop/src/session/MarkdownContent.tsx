import {
  Children,
  createContext,
  isValidElement,
  useContext,
  type MouseEvent,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { openExternal, openNativePath, revealNativePath } from "../bridge";
import {
  nativeContextMenusAvailable,
  showNativeContextMenu,
  type NativeContextMenuItem,
} from "../container";
import { useT, type Translate } from "../i18n";
import { currentDesktopPlatform } from "../platform";
import { ChartBlock, parseChartSpec } from "./ChartBlock";
import { VisualizationFrame } from "./VisualizationFrame";
import { splitRichText } from "./visualization";

export type BuiltinLinkTarget =
  | { kind: "web"; url: string }
  | { kind: "file"; path: string; line?: number; column?: number };

export interface BuiltinLinkActions {
  workspaceRoot?: string | null;
  openWebLink?: (url: string) => void;
  openFileLink?: (target: Extract<BuiltinLinkTarget, { kind: "file" }>) => void;
}

type BuiltinLinkAction =
  | "open-web-in-app"
  | "open-web-external"
  | "copy-web-link"
  | "open-file-in-app"
  | "open-file-default"
  | "copy-file-path"
  | "reveal-file";

function decodePath(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.includes("\0") ? null : decoded;
  } catch {
    return null;
  }
}

function fileTarget(rawPath: string, hash = ""): Extract<BuiltinLinkTarget, { kind: "file" }> | null {
  let path = decodePath(rawPath);
  if (!path) return null;

  let line: number | undefined;
  let column: number | undefined;
  const fragment = /^#L(\d+)(?:C(\d+))?$/i.exec(hash);
  if (fragment) {
    line = Number(fragment[1]);
    column = fragment[2] ? Number(fragment[2]) : undefined;
  } else {
    const suffix = /:(\d+)(?::(\d+))?$/.exec(path);
    if (suffix) {
      line = Number(suffix[1]);
      column = suffix[2] ? Number(suffix[2]) : undefined;
      path = path.slice(0, suffix.index);
    }
  }

  if (!path || path.endsWith("/")) return null;
  if (path.replaceAll("\\", "/").split("/").some((part) => part === "..")) return null;
  return { kind: "file", path, line, column };
}

export function parseBuiltinLink(uri: string | undefined): BuiltinLinkTarget | null {
  const raw = uri?.trim();
  if (!raw || raw.startsWith("#")) return null;

  try {
    const parsed = new URL(raw);
    if (
      ["http:", "https:"].includes(parsed.protocol) &&
      parsed.username.length === 0 &&
      parsed.password.length === 0
    ) {
      return { kind: "web", url: parsed.toString() };
    }
    if (parsed.protocol === "file:") {
      if (
        !["", "localhost"].includes(parsed.hostname) ||
        parsed.username.length > 0 ||
        parsed.password.length > 0
      ) return null;
      const path = /^\/[A-Za-z]:\//.test(parsed.pathname)
        ? parsed.pathname.slice(1)
        : parsed.pathname;
      return fileTarget(path, parsed.hash);
    }
  } catch {
    // Local paths are intentionally handled below; they are not valid absolute URLs.
  }

  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(raw) && !/^[A-Za-z]:[\\/]/.test(raw)) return null;
  const hashIndex = raw.lastIndexOf("#");
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  const path = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  return fileTarget(path, hash);
}

export function workspaceRelativeLinkPath(path: string, workspaceRoot?: string | null): string | null {
  const normalizedPath = path.replaceAll("\\", "/");
  const normalizedRoot = workspaceRoot?.replaceAll("\\", "/").replace(/\/+$/, "") ?? "";
  const absolute = normalizedPath.startsWith("/") || /^[A-Za-z]:\//.test(normalizedPath);

  if (!absolute) {
    const relative = normalizedPath.replace(/^\.\//, "");
    if (!relative || relative.split("/").some((part) => part === ".." || part === ".")) return null;
    return relative;
  }
  if (!normalizedRoot) return null;

  const caseInsensitive = /^[A-Za-z]:\//.test(normalizedPath);
  const comparablePath = caseInsensitive ? normalizedPath.toLowerCase() : normalizedPath;
  const comparableRoot = caseInsensitive ? normalizedRoot.toLowerCase() : normalizedRoot;
  const prefix = `${comparableRoot}/`;
  return comparablePath.startsWith(prefix) ? normalizedPath.slice(normalizedRoot.length + 1) : null;
}

function nativeFilePath(path: string, workspaceRoot?: string | null): string {
  if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) return path;
  const relative = workspaceRelativeLinkPath(path, workspaceRoot);
  const root = workspaceRoot?.replace(/[\\/]+$/, "");
  return relative && root ? `${root}/${relative}` : path;
}

export function builtinLinkMenuItems(
  target: BuiltinLinkTarget,
  t: Translate,
  options: { canOpenInApp: boolean; canCopy: boolean },
): NativeContextMenuItem[] {
  if (target.kind === "web") {
    return [
      ...(options.canOpenInApp
        ? [{ type: "item" as const, label: t("link.openInBrowser"), action: "open-web-in-app" }]
        : []),
      { type: "item", label: t("link.openInDefaultBrowser"), action: "open-web-external" },
      { type: "separator" },
      {
        type: "item",
        label: t("link.copyLink"),
        action: "copy-web-link",
        enabled: options.canCopy,
      },
    ];
  }

  let revealKey: "link.revealInFinder" | "link.showInFileExplorer" | "link.showInFileManager";
  switch (currentDesktopPlatform()) {
    case "macos":
      revealKey = "link.revealInFinder";
      break;
    case "windows":
      revealKey = "link.showInFileExplorer";
      break;
    default:
      revealKey = "link.showInFileManager";
  }
  return [
    ...(options.canOpenInApp
      ? [{ type: "item" as const, label: t("link.openFile"), action: "open-file-in-app" }]
      : []),
    { type: "item", label: t("link.openInDefaultApp"), action: "open-file-default" },
    { type: "separator" },
    {
      type: "item",
      label: t("link.copyPath"),
      action: "copy-file-path",
      enabled: options.canCopy,
    },
    { type: "item", label: t(revealKey), action: "reveal-file" },
  ];
}

const LinkActionsContext = createContext<BuiltinLinkActions>({});

function BuiltinLink({ href, children }: { href?: string; children?: ReactNode }) {
  const t = useT();
  const actions = useContext(LinkActionsContext);
  const target = parseBuiltinLink(href);
  if (!target) return <span>{children}</span>;

  const workspacePath = target.kind === "file"
    ? workspaceRelativeLinkPath(target.path, actions.workspaceRoot)
    : null;
  const canOpenInApp = target.kind === "web"
    ? Boolean(actions.openWebLink)
    : Boolean(actions.openFileLink && workspacePath);

  const runAction = (action: BuiltinLinkAction) => {
    switch (action) {
      case "open-web-in-app":
        if (target.kind === "web") actions.openWebLink?.(target.url);
        break;
      case "open-web-external":
        if (target.kind === "web") void openExternal(target.url);
        break;
      case "copy-web-link":
        if (target.kind === "web") void navigator.clipboard?.writeText(target.url);
        break;
      case "open-file-in-app":
        if (target.kind === "file" && workspacePath) actions.openFileLink?.(target);
        break;
      case "open-file-default":
        if (target.kind === "file") {
          void openNativePath(nativeFilePath(target.path, actions.workspaceRoot));
        }
        break;
      case "copy-file-path":
        if (target.kind === "file") void navigator.clipboard?.writeText(target.path);
        break;
      case "reveal-file":
        if (target.kind === "file") {
          void revealNativePath(nativeFilePath(target.path, actions.workspaceRoot));
        }
        break;
    }
  };

  const onContextMenu = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!nativeContextMenusAvailable) return;
    event.preventDefault();
    event.stopPropagation();
    const items = builtinLinkMenuItems(target, t, {
      canOpenInApp,
      canCopy: typeof navigator.clipboard?.writeText === "function",
    });
    void showNativeContextMenu(items, (action) => runAction(action as BuiltinLinkAction)).catch(
      (error) => console.error("Could not show the native link menu", error),
    );
  };

  const linkHref = target.kind === "web" ? target.url : href;
  return (
    <a
      href={linkHref}
      className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
      onClick={(event) => {
        event.preventDefault();
        if (target.kind === "web") void openExternal(target.url);
        else if (workspacePath && actions.openFileLink) actions.openFileLink(target);
        else void openNativePath(nativeFilePath(target.path, actions.workspaceRoot));
      }}
      onContextMenu={onContextMenu}
    >
      {children}
    </a>
  );
}

const components: Components = {
  p: ({ children }) => <p className="my-2 break-words first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mb-2 mt-5 text-section font-medium first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-5 text-dialog font-medium first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-4 text-body font-medium first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 ps-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 ps-5">{children}</ol>,
  li: ({ children }) => <li className="ps-0.5">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-control bg-fill-quiet px-3 py-2 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <div role="separator" className="my-4 h-px bg-border" />,
  strong: ({ children }) => <strong className="font-medium text-foreground">{children}</strong>,
  a: ({ href, children }) => <BuiltinLink href={href}>{children}</BuiltinLink>,
  img: ({ alt }) => <span className="text-muted-foreground">{alt ?? "Image"}</span>,
  table: ({ children }) => (
    <div className="my-3 max-w-full overflow-x-auto">
      <table className="w-full border-collapse text-callout">{children}</table>
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
          : "rounded-control bg-fill-quiet px-1 py-0.5 font-mono text-code text-foreground"
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
      <pre className="my-3 max-w-full overflow-x-auto rounded-module border bg-fill-quiet p-3 text-code">
        {children}
      </pre>
    );
  },
};

export function MarkdownContent({
  text,
  streaming = false,
  linkActions,
}: {
  text: string;
  streaming?: boolean;
  linkActions?: BuiltinLinkActions;
}) {
  const segments = splitRichText(text, streaming);
  return (
    <LinkActionsContext.Provider value={linkActions ?? {}}>
      <div className="codetwo-markdown min-w-0 text-prose text-foreground/90">
        {segments.map((segment, index) =>
          segment.kind === "visualization" ? (
            <VisualizationFrame
              key={`${segment.reference.path}-${index}`}
              reference={segment.reference}
            />
          ) : (
            <ReactMarkdown
              key={index}
              remarkPlugins={[remarkGfm]}
              components={components}
              transformLinkUri={(uri) => uri}
            >
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
    </LinkActionsContext.Provider>
  );
}
