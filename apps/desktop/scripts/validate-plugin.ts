import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { parsePluginManifest } from "../src/pluginModel";

const source = resolve(process.argv[2] ?? ".");
if (!existsSync(source)) throw new Error(`plugin source was not found: ${source}`);
const manifestPath = statSync(source).isDirectory() ? join(source, "plugin.json") : source;
if (!existsSync(manifestPath)) throw new Error(`plugin.json was not found at ${manifestPath}`);
if (lstatSync(manifestPath).isSymbolicLink()) throw new Error("plugin.json must not be a symbolic link");

const manifest = parsePluginManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
const root = realpathSync(dirname(manifestPath));
const bundledExecutable = (command: string, label: string): void => {
  const executable = realpathSync(resolve(root, command));
  const path = relative(root, executable);
  if (path === "" || path.startsWith("..") || isAbsolute(path) || !statSync(executable).isFile()) {
    throw new Error(`${label} command escapes the bundle: ${command}`);
  }
};
if (manifest.runtime && (manifest.runtime.command.includes("/") || manifest.runtime.command.includes("\\"))) {
  if (isAbsolute(manifest.runtime.command)) {
    throw new Error("runtime.command must be an executable name or a bundle-relative path");
  }
  const executable = resolve(root, manifest.runtime.command);
  if (!existsSync(executable)) {
    throw new Error(`runtime executable was not found: ${manifest.runtime.command}`);
  }
  bundledExecutable(manifest.runtime.command, "runtime");
}
for (const server of manifest.languageServers) {
  if (!server.command.includes("/") && !server.command.includes("\\")) continue;
  if (isAbsolute(server.command)) {
    throw new Error(`languageServers.${server.id}.command must be an executable name or a bundle-relative path`);
  }
  const executable = resolve(root, server.command);
  if (!existsSync(executable)) {
    throw new Error(`language server executable was not found: ${server.command}`);
  }
  bundledExecutable(server.command, `language server ${server.id}`);
}

const contributionCount = manifest.commands.length + manifest.ui.length + manifest.connectors.length + manifest.languageServers.length +
  Number(Boolean(manifest.runtime));
process.stdout.write([
  `Manifest valid: ${manifest.name} ${manifest.version}`,
  `Manifest: ${manifestPath}`,
  `C2 contributions: ${contributionCount}`,
  `Runtime: ${manifest.runtime ? manifest.runtime.command : "none"}`,
  `Runtime commands: ${manifest.commands.length}`,
  `UI actions: ${manifest.ui.length}`,
  `Connectors: ${manifest.connectors.length}`,
  `Language servers: ${manifest.languageServers.length}`,
].join("\n") + "\n");
