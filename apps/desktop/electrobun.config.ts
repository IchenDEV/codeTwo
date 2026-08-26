import type { ElectrobunConfig } from "electrobun";

import { DESKTOP_CHANNELS, resolveDesktopChannel } from "./scripts/desktop-channel";

const channel = DESKTOP_CHANNELS[resolveDesktopChannel(process.env.CODETWO_CHANNEL, process.argv)];
const hostExecutable = process.platform === "win32" ? "codetwo-desktop-host.exe" : "codetwo-desktop-host";
const toolBrokerExecutable = process.platform === "win32" ? "codetwo-tool-broker.exe" : "codetwo-tool-broker";
const hostBinary = `../../target/release/${hostExecutable}`;
const toolBrokerBinary = `build/tool-broker/${toolBrokerExecutable}`;

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
      [hostBinary]: `bin/${hostExecutable}`,
      [toolBrokerBinary]: `bin/${toolBrokerExecutable}`,
    },
    watch: ["../../crates", "src-host", "src", "index.html", "vite.config.ts", "scripts/prepare-electrobun.ts"],
    watchIgnore: ["dist/**", "../../target/**"],
    mac: {
      createDmg: process.env.ELECTROBUN_CREATE_DMG === "1",
      codesign: process.env.ELECTROBUN_AD_HOC_SIGN === "1",
      notarize: process.env.ELECTROBUN_NOTARIZE === "1",
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
    postPackage: "scripts/sign-macos-package.ts",
  },
  release: {
    generatePatch: false,
  },
} satisfies ElectrobunConfig;
