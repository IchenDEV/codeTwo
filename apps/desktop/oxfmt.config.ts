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
  ],
});
