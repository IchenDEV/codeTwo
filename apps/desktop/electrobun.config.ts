import type { ElectrobunConfig } from "electrobun";

import { DESKTOP_CHANNELS, resolveDesktopChannel } from "./scripts/desktop-channel";

const channel = DESKTOP_CHANNELS[resolveDesktopChannel(process.env.CODETWO_CHANNEL, process.argv)];

export default {
  app: {
    name: channel.appName,
    identifier: channel.identifier,
    version: process.env.RELEASE_VERSION ?? "0.0.0",
    description: "Document-first coding agent",
  },
  build: {
    targets: "current",
    bun: {
      entrypoint: "src/electrobun/index.ts",
      minify: false,
      sourcemap: "external",
      define: {
        "process.env.CODETWO_APP_IDENTIFIER": JSON.stringify(channel.identifier),
        "process.env.CODETWO_APP_NAME": JSON.stringify(channel.displayName),
        "process.env.CODETWO_ICLOUD_CONTAINER_IDENTIFIER": JSON.stringify(`iCloud.${channel.identifier}`),
      },
    },
    copy: {
      dist: "views/main",
    },
    watch: ["src", "index.html", "vite.config.ts", "scripts/prepare-electrobun.ts"],
    watchIgnore: ["dist/**"],
    mac: {
      createDmg: process.env.ELECTROBUN_CREATE_DMG === "1",
      codesign: process.env.ELECTROBUN_AD_HOC_SIGN === "1",
      notarize: process.env.ELECTROBUN_NOTARIZE === "1",
      bundleCEF: false,
      defaultRenderer: "native",
      icons: "assets/codeTwo.icon",
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
