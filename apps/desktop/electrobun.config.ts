import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "C2",
    identifier: "dev.codetwo.app",
    version: process.env.RELEASE_VERSION ?? "0.0.0",
    description: "Document-first coding agent",
  },
  build: {
    targets: "current",
    bun: {
      entrypoint: "src/electrobun/index.ts",
      minify: false,
      sourcemap: "external",
    },
    copy: {
      dist: "views/main",
    },
    watch: ["src", "index.html", "vite.config.ts", "scripts/prepare-electrobun.ts"],
    watchIgnore: ["dist/**"],
    mac: {
      createDmg: process.env.ELECTROBUN_CREATE_DMG === "1",
      codesign: process.env.ELECTROBUN_AD_HOC_SIGN === "1",
      bundleCEF: false,
      defaultRenderer: "native",
      icons: "assets/codeTwo.iconset",
      entitlements: {
        "com.apple.security.device.audio-input": true,
        "com.apple.security.personal-information.speech-recognition": true,
      },
    },
    win: {
      bundleCEF: false,
      defaultRenderer: "native",
      icon: "assets/icon.ico",
    },
    linux: {
      bundleCEF: true,
      defaultRenderer: "cef",
      icon: "assets/icon.png",
    },
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  scripts: {
    preBuild: "scripts/prepare-electrobun.ts",
    postBuild: "scripts/patch-macos-info.ts",
    postWrap: "scripts/patch-macos-info.ts",
  },
  release: {
    generatePatch: false,
  },
} satisfies ElectrobunConfig;
