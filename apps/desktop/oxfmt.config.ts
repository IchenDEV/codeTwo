import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "**/src-tauri/gen/**",
    "**/src-host/**",
    "**/assets/**/*.json",
    "**/artifacts/**",
    // Build outputs are gitignored but not written by hand: `oxfmt --check .` walks the tree, so
    // leaving them out formats the bundled renderer (tens of MB) on every lint run.
    "**/dist/**",
    "**/build/**",
  ],
});
