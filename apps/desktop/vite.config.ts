import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Electrobun loads this output through `views://`, so asset URLs must stay bundle-relative.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  clearScreen: false,
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "es2021",
    outDir: "dist",
    emptyOutDir: true,
  },
});
