import { Children, createContext, isValidElement, useContext } from "react";
import type { MouseEvent, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { openExternal, openNativePath, revealNativePath } from "../bridge";
import {
  isNativeContextMenusAvailable,
  showNativeContextMenu,
} from "../container";
import type { NativeContextMenuItem } from "../container";
import { useT } from "../i18n";
import type { Translate } from "../i18n";
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

function fileTarget(
  rawPath: string,
  hash = ""
): Extract<BuiltinLinkTarget, { kind: "file" }> | null {
  let path = decodePath(rawPath);
  if (!path) {
    return null;
  }

  let line: number | undefined;
  let column: number | undefined;
  const fragment = /^#L(\d+)(?:C(\d+))?$/iu.exec(hash);
  if (fragment) {
    line = Number(fragment[1]);
    column = fragment[2] ? Number(fragment[2]) : undefined;
  } else {
    const suffix = /:(\d+)(?::(\d+))?$/u.exec(path);
    if (suffix) {
      line = Number(suffix[1]);
      column = suffix[2] ? Number(suffix[2]) : undefined;
      path = path.slice(0, suffix.index);
    }
  }

  if (!path || path.endsWith("/")) {
    return null;
  }
  if (
    path
      .replaceAll("\\", "/")
      .split("/")
      .some((part) => part === "..")
  ) {
    return null;
  }
  return { column, kind: "file", line, path };
}

export function parseBuiltinLink(
  uri: string | undefined
): BuiltinLinkTarget | null {
  const raw = uri?.trim();
  if (!raw || raw.startsWith("#")) {
    return null;
  }

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
      ) {
        return null;
      }
      const path = /^\/[A-Za-z]:\//u.test(parsed.pathname)
        ? parsed.pathname.slice(1)
        : parsed.pathname;
      return fileTarget(path, parsed.hash);
    }
  } catch {
    // Local paths are intentionally handled below; they are not valid absolute URLs.
  }

  if (/^[A-Za-z][A-Za-z\d+.-]*:/u.test(raw) && !/^[A-Za-z]:[\\/]/u.test(raw)) {
    return null;
  }
  const hashIndex = raw.lastIndexOf("#");
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  const path = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  return fileTarget(path, hash);
}

export function workspaceRelativeLinkPath(
  path: string,
  workspaceRoot?: string | null
): string | null {
  const normalizedPath = path.replaceAll("\\", "/");
  const normalizedRoot =
    workspaceRoot?.replaceAll("\\", "/").replace(/\/+$/u, "") ?? "";
  const isAbsolute =
    normalizedPath.startsWith("/") || /^[A-Za-z]:\//u.test(normalizedPath);

  if (!isAbsolute) {
    const relative = normalizedPath.replace(/^\.\//u, "");
    if (
      !relative ||
      relative.split("/").some((part) => part === ".." || part === ".")
    ) {
      return null;
    }
    return relative;
  }
  if (!normalizedRoot) {
    return null;
  }

  const isCaseInsensitive = /^[A-Za-z]:\//u.test(normalizedPath);
  const comparablePath = isCaseInsensitive
    ? normalizedPath.toLowerCase()
    : normalizedPath;
  const comparableRoot = isCaseInsensitive
    ? normalizedRoot.toLowerCase()
    : normalizedRoot;
  const prefix = `${comparableRoot}/`;
  return comparablePath.startsWith(prefix)
    ? normalizedPath.slice(normalizedRoot.length + 1)
    : null;
}

function nativeFilePath(path: string, workspaceRoot?: string | null): string {
  if (path.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(path)) {
    return path;
  }
  const relative = workspaceRelativeLinkPath(path, workspaceRoot);
  const root = workspaceRoot?.replace(/[\\/]+$/u, "");
  return relative && root ? `${root}/${relative}` : path;
}

export function builtinLinkMenuItems(
  target: BuiltinLinkTarget,
  t: Translate,
  options: { canOpenInApp: boolean; canCopy: boolean }
): NativeContextMenuItem[] {
  if (target.kind === "web") {
    return [
      ...(options.canOpenInApp
        ? [
            {
              action: "open-web-in-app",
              label: t("link.openInBrowser"),
              type: "item" as const,
            },
          ]
        : []),
      {
        action: "open-web-external",
        label: t("link.openInDefaultBrowser"),
        type: "item",
      },
      { type: "separator" },
      {
        action: "copy-web-link",
        enabled: options.canCopy,
        label: t("link.copyLink"),
        type: "item",
      },
    ];
  }

  let revealKey:
    | "link.revealInFinder"
    | "link.showInFileExplorer"
    | "link.showInFileManager";
  switch (currentDesktopPlatform()) {
    case "macos": {
      revealKey = "link.revealInFinder";
      break;
    }
    case "windows": {
      revealKey = "link.showInFileExplorer";
      break;
    }
    default: {
      revealKey = "link.showInFileManager";
    }
  }
  return [
    ...(options.canOpenInApp
      ? [
          {
            action: "open-file-in-app",
            label: t("link.openFile"),
            type: "item" as const,
          },
        ]
      : []),
    {
      action: "open-file-default",
      label: t("link.openInDefaultApp"),
      type: "item",
    },
    { type: "separator" },
    {
      action: "copy-file-path",
      enabled: options.canCopy,
      label: t("link.copyPath"),
      type: "item",
    },
    { action: "reveal-file", label: t(revealKey), type: "item" },
  ];
}

const LinkActionsContext = createContext<BuiltinLinkActions>({});

const BuiltinLink = ({
  href,
  children,
}: {
  readonly href?: string;
  readonly children?: ReactNode;
}) => {
  const t = useT();
  const actions = useContext(LinkActionsContext);
  const target = parseBuiltinLink(href);
  if (!target) {
    return <span>{children}</span>;
  }

  const workspacePath =
    target.kind === "file"
      ? workspaceRelativeLinkPath(target.path, actions.workspaceRoot)
      : null;
  const canOpenInApp =
    target.kind === "web"
      ? Boolean(actions.openWebLink)
      : Boolean(actions.openFileLink && workspacePath);

  const runAction = (action: BuiltinLinkAction) => {
    switch (action) {
      case "open-web-in-app": {
        if (target.kind === "web") {
          actions.openWebLink?.(target.url);
        }
        break;
      }
      case "open-web-external": {
        if (target.kind === "web") {
          void openExternal(target.url);
        }
        break;
      }
      case "copy-web-link": {
        if (target.kind === "web") {
          void navigator.clipboard?.writeText(target.url);
        }
        break;
      }
      case "open-file-in-app": {
        if (target.kind === "file" && workspacePath) {
          actions.openFileLink?.(target);
        }
        break;
      }
      case "open-file-default": {
        if (target.kind === "file") {
          void openNativePath(
            nativeFilePath(target.path, actions.workspaceRoot)
          );
        }
        break;
      }
      case "copy-file-path": {
        if (target.kind === "file") {
          void navigator.clipboard?.writeText(target.path);
        }
        break;
      }
      case "reveal-file": {
        if (target.kind === "file") {
          void revealNativePath(
            nativeFilePath(target.path, actions.workspaceRoot)
          );
        }
        break;
      }
    }
  };

  const onContextMenu = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isNativeContextMenusAvailable) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const items = builtinLinkMenuItems(target, t, {
      canCopy: typeof navigator.clipboard?.writeText === "function",
      canOpenInApp,
    });
    void showNativeContextMenu(items, (action) =>
      runAction(action as BuiltinLinkAction)
    ).catch((error) =>
      console.error("Could not show the native link menu", error)
    );
  };

  const linkHref = target.kind === "web" ? target.url : href;
  return (
    <a
      href={linkHref}
      className="text-primary decoration-primary/40 hover:decoration-primary underline underline-offset-2"
      onClick={(event) => {
        event.preventDefault();
        if (target.kind === "web") {
          void openExternal(target.url);
        } else if (workspacePath && actions.openFileLink) {
          actions.openFileLink(target);
        } else {
          void openNativePath(
            nativeFilePath(target.path, actions.workspaceRoot)
          );
        }
      }}
      onContextMenu={onContextMenu}
    >
      {children}
    </a>
  );
};

const components: Components = {
  a: ({ href, children }) => <BuiltinLink href={href}>{children}</BuiltinLink>,
  blockquote: ({ children }) => (
    <blockquote className="rounded-control bg-fill-quiet text-muted-foreground my-3 px-3 py-2">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => (
    <code
      className={
        className
          ? `${className} text-code font-mono`
          : "rounded-control bg-fill-quiet text-code text-foreground px-1 py-0.5 font-mono"
      }
    >
      {children}
    </code>
  ),
  h1: ({ children }) => (
    <h1 className="text-section mt-5 mb-2 font-medium first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-dialog mt-5 mb-2 font-medium first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-body mt-4 mb-1.5 font-medium first:mt-0">{children}</h3>
  ),
  hr: () => <div role="separator" className="bg-border my-4 h-px" />,
  img: ({ alt }) => (
    <span className="text-muted-foreground">{alt ?? "Image"}</span>
  ),
  li: ({ children }) => <li className="ps-0.5">{children}</li>,
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 ps-5">{children}</ol>
  ),
  p: ({ children }) => (
    <p className="my-2 break-words first:mt-0 last:mb-0">{children}</p>
  ),
  pre: ({ children }) => {
    const nodes = Children.toArray(children);
    const child = nodes.length === 1 ? nodes[0] : null;
    if (isValidElement(child)) {
      const props = child.props as { className?: string; children?: ReactNode };
      const language = /^language-(.+)$/u.exec(props.className ?? "")?.[1];
      if (language === "chart" || language === "chart-json") {
        const source = String(props.children ?? "").replace(/\n$/u, "");
        const spec = parseChartSpec(source);
        if (spec) {
          return <ChartBlock spec={spec} />;
        }
      }
    }
    return (
      <pre className="rounded-module bg-fill-quiet text-code my-3 max-w-full overflow-x-auto border p-3">
        {children}
      </pre>
    );
  },
  strong: ({ children }) => (
    <strong className="text-foreground font-medium">{children}</strong>
  ),
  table: ({ children }) => (
    <div className="my-3 max-w-full overflow-x-auto">
      <table className="text-callout w-full border-collapse">{children}</table>
    </div>
  ),
  td: ({ children }) => <td className="px-2 py-1.5 align-top">{children}</td>,
  th: ({ children }) => (
    <th className="bg-fill-quiet px-2 py-1.5 text-start font-medium">
      {children}
    </th>
  ),
  thead: ({ children }) => (
    <thead className="text-foreground">{children}</thead>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 ps-5">{children}</ul>
  ),
};

export const MarkdownContent = ({
  text,
  streaming = false,
  linkActions,
}: {
  readonly text: string;
  readonly streaming?: boolean;
  readonly linkActions?: BuiltinLinkActions;
}) => {
  const segments = splitRichText(text, streaming);
  return (
    <LinkActionsContext.Provider value={linkActions ?? {}}>
      <div className="codetwo-markdown text-prose text-foreground/90 min-w-0">
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
          )
        )}
        {streaming ? (
          <span
            aria-hidden="true"
            className="bg-foreground/65 ms-0.5 inline-block h-4 w-px animate-pulse align-middle"
          />
        ) : null}
      </div>
    </LinkActionsContext.Provider>
  );
};
