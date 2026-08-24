/// <reference types="vite/client" />

declare module "*.min.js" {
  const source: string;
  export default source;
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
