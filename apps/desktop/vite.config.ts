import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webCoreTarget =
  process.env.CODETWO_WEB_CORE_URL ?? "http://127.0.0.1:4599";

// Electrobun loads this output through `views://`, so asset URLs must stay bundle-relative.
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", { target: "18" }]],
      },
    }),
    tailwindcss(),
  ],
  base: "./",
  clearScreen: false,
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      "/api": { target: webCoreTarget, changeOrigin: true },
      "/ws": { target: webCoreTarget, changeOrigin: true, ws: true },
    },
  },
  build: {
    target: "es2021",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        desktopPet: path.resolve(__dirname, "desktop-pet.html"),
      },
    },
  },
});
