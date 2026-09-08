import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { resolveDevProfile } from "./scripts/dev-profile";

const profile = resolveDevProfile();
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
  cacheDir: profile ? path.join(profile.root, "vite-cache") : undefined,
  clearScreen: false,
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: profile?.port ?? 1420,
    strictPort: true,
    proxy:
      profile && process.env.CODETWO_WEB_CORE_URL === undefined
        ? undefined
        : {
            "/api": { target: webCoreTarget, changeOrigin: true },
            "/ws": { target: webCoreTarget, changeOrigin: true, ws: true },
          },
  },
  build: {
    target: "es2021",
    outDir: profile?.rendererDir ?? "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        desktopPet: path.resolve(__dirname, "desktop-pet.html"),
      },
    },
  },
});
