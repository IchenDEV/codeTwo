/// <reference types="vite/client" />

declare module "*.min.js" {
  const source: string;
  export default source;
}

/**
 * Deep icon entrypoints resolve under `tsc`, but oxlint-tsgolint does not always
 * follow the package `exports["./*"]` types map and treats them as error-typed.
 */
declare module "@hugeicons/core-free-icons/*" {
  import type { IconSvgElement } from "@hugeicons/react";
  const icon: IconSvgElement;
  export default icon;
}

declare namespace JSX {
  interface IntrinsicElements {
    "electrobun-webview": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      src?: string;
      renderer?: "native" | "cef";
      partition?: string;
      sandbox?: string;
    };
  }
}
