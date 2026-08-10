import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Excalidraw ships optional collaboration/embed/help code in its browser
 * bundle. The Canvas contract is a local, self-hosted island, so those
 * optional branches must never retain an external network URL in executable
 * string literals. Keep comments (including third-party license links) and
 * the W3C namespace constants intact; they are not fetch targets.
 */
function neutralizeRuntimeUrls(code: string): string {
  const replaceUrls = (literal: string) => literal.replace(
    /https?:\/\/(?!www\.w3\.org(?:[\/"'`]|$))/g,
    "blocked://",
  );
  let output = "";
  let index = 0;
  while (index < code.length) {
    const current = code[index];
    const next = code[index + 1];
    if (current === "/" && next === "/") {
      const end = code.indexOf("\\n", index);
      const stop = end === -1 ? code.length : end;
      output += code.slice(index, stop);
      index = stop;
      continue;
    }
    if (current === "/" && next === "*") {
      const end = code.indexOf("*/", index + 2);
      const stop = end === -1 ? code.length : end + 2;
      output += code.slice(index, stop);
      index = stop;
      continue;
    }
    if (current === "'" || current === '"' || current === "`") {
      const quote = current;
      let end = index + 1;
      let escaped = false;
      for (; end < code.length; end += 1) {
        const character = code[end];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (character === "\\\\") {
          escaped = true;
          continue;
        }
        if (character === quote) {
          end += 1;
          break;
        }
      }
      output += replaceUrls(code.slice(index, end));
      index = end;
      continue;
    }
    output += current;
    index += 1;
  }
  // A final global pass covers minifier-generated literal fragments that may
  // span a template expression. Only W3C namespace constants remain valid
  // because they are DOM identifiers, not network resources.
  return output.replace(
    /https?:\/\/(?!www\.w3\.org(?:[\/"'`]|$))/g,
    "blocked://",
  );
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "codetwo-local-canvas-url-guard",
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type === "chunk") output.code = neutralizeRuntimeUrls(output.code);
        }
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@excalidraw/mermaid-to-excalidraw": path.resolve(__dirname, "./src/canvas/unsupported/mermaid.ts"),
    },
  },
  build: {
    target: "es2021",
    outDir: path.resolve(__dirname, "../../crates/server/assets/canvas"),
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve(__dirname, "./src/canvas/remote-entry.tsx"),
      output: {
        entryFileNames: "canvas-island.js",
        assetFileNames: "canvas-assets/[name]-[hash][extname]",
        chunkFileNames: "canvas-chunks/[name]-[hash].js",
      },
    },
  },
});
