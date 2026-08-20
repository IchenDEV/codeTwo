import type { ElectrobunConfig } from "electrobun";

const hostBinary =
  process.platform === "win32"
    ? "../../target/release/codetwo-desktop-host.exe"
    : "../../target/release/codetwo-desktop-host";

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
      [hostBinary]: `bin/${hostBinary.split("/").at(-1)}`,
    },
    watch: ["../../crates", "src-host", "src", "index.html", "vite.config.ts"],
    watchIgnore: ["dist/**", "../../target/**"],
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
