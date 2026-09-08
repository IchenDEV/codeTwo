/// <reference types="vite/client" />

declare module "*.min.js" {
  const source: string;
  export default source;
}

declare namespace JSX {
  interface IntrinsicElements {
    "electrobun-webview": React.DetailedHTMLProps<
      Omit<React.HTMLAttributes<HTMLElement>, "className">,
      HTMLElement
    > & {
      class?: string;
      src?: string;
      renderer?: "native" | "cef";
      partition?: string;
      sandbox?: string;
    };
  }
}
