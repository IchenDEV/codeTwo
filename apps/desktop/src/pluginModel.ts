/**
 * Host-neutral plugin package contracts shared by the renderer and the desktop host.
 *
 * The host owns rendering and invocation; packages contribute descriptors, never executable UI.
 */
export const PLUGIN_UI_SLOT_IDS = [
  "rail.features",
  "session.header",
  "transcript.before",
  "composer.above",
  "composer.toolbar",
] as const;

export type PluginUiSlotId = (typeof PLUGIN_UI_SLOT_IDS)[number];

export const PLUGIN_CONNECTOR_CAPABILITIES = [
  "connection",
  "conversations",
  "documents",
  "tables",
  "messaging",
  "turn_notifications",
] as const;
export type PluginConnectorCapability = (typeof PLUGIN_CONNECTOR_CAPABILITIES)[number];

export interface PluginUiContribution {
  id: string;
  slot: PluginUiSlotId;
  label: string;
  description: string;
  command: string;
  input: unknown;
  order: number;
}

/** A host-rendered external-system integration backed by one bundle-owned command. */
export interface PluginConnectorContribution {
  id: string;
  provider: string;
  command: string;
  capabilities: PluginConnectorCapability[];
}

export interface PluginRuntimeContribution {
  protocol: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  inject: string[];
  optionalInject: string[];
  scopeSupport: Array<"user" | "project">;
}

export interface PluginRuntimeCommandContribution {
  id: string;
  title: string;
  description: string;
  argsSchema: Record<string, unknown> | null;
}

export interface PluginLanguageServerContribution {
  id: string;
  languages: string[];
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface C2PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  repository: string;
  standardVersion: C2PluginStandardVersion;
  runtime: PluginRuntimeContribution | null;
  commands: PluginRuntimeCommandContribution[];
  ui: PluginUiContribution[];
  connectors: PluginConnectorContribution[];
  languageServers: PluginLanguageServerContribution[];
}

export const AGENT_PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
export const C2_PLUGIN_STANDARD_VERSION = "1.2.0";
export type C2PluginStandardVersion = typeof C2_PLUGIN_STANDARD_VERSION;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function stringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(asObject(value)).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string"
    ),
  );
}

function safeId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}

function commandName(value: unknown): value is string {
  return typeof value === "string" && value.length <= 128 &&
    /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/.test(value);
}

function safeCommand(value: string): boolean {
  return !value.includes("..") &&
    !value.includes("${") &&
    !value.startsWith("/") &&
    !value.startsWith("\\") &&
    !/^[A-Za-z]:[\\/]/.test(value);
}

export function parsePluginRuntimeContribution(value: unknown): PluginRuntimeContribution | null {
  if (!isObject(value)) return null;
  const raw = asObject(value);
  if (!hasOnlyKeys(raw, [
    "protocol", "command", "args", "env", "inject", "optionalInject", "scopeSupport",
  ])) return null;
  if (
    typeof raw.command !== "string" ||
    raw.command.trim().length === 0 ||
    !safeCommand(raw.command) ||
    (raw.protocol != null && (
      typeof raw.protocol !== "string" ||
      !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(raw.protocol)
    )) ||
    (raw.args != null && (!Array.isArray(raw.args) || raw.args.some((entry) => typeof entry !== "string"))) ||
    (raw.env != null && (!isObject(raw.env) || Object.values(raw.env).some((entry) => typeof entry !== "string"))) ||
    (raw.inject != null && (!Array.isArray(raw.inject) || raw.inject.some((entry) => typeof entry !== "string"))) ||
    (raw.optionalInject != null && (!Array.isArray(raw.optionalInject) || raw.optionalInject.some((entry) => typeof entry !== "string"))) ||
    (raw.scopeSupport != null && (!Array.isArray(raw.scopeSupport) || raw.scopeSupport.some(
      (entry) => entry !== "user" && entry !== "project",
    )))
  ) return null;
  const scopeSupport = strings(raw.scopeSupport).filter(
    (scope): scope is "user" | "project" => scope === "user" || scope === "project",
  );
  const normalizedScopes = scopeSupport.length > 0 ? [...new Set(scopeSupport)] : ["user" as const];
  if (!normalizedScopes.includes("user")) normalizedScopes.unshift("user");
  return {
    protocol: typeof raw.protocol === "string" ? raw.protocol : "1.0.0",
    command: raw.command.trim(),
    args: strings(raw.args),
    env: stringRecord(raw.env),
    inject: strings(raw.inject),
    optionalInject: strings(raw.optionalInject),
    scopeSupport: normalizedScopes,
  };
}

export function parsePluginRuntimeCommandContribution(
  value: unknown,
): PluginRuntimeCommandContribution | null {
  if (!isObject(value)) return null;
  const raw = asObject(value);
  if (!hasOnlyKeys(raw, ["id", "title", "description", "argsSchema"])) return null;
  if (!commandName(raw.id)) return null;
  if (typeof raw.title !== "string" || raw.title.trim().length === 0 || raw.title.length > 80) {
    return null;
  }
  if (raw.description != null && (
    typeof raw.description !== "string" || raw.description.length > 300
  )) return null;
  if (raw.argsSchema != null && !isObject(raw.argsSchema)) return null;
  return {
    id: raw.id,
    title: raw.title.trim(),
    description: typeof raw.description === "string" ? raw.description.trim() : "",
    argsSchema: raw.argsSchema == null ? null : raw.argsSchema,
  };
}

export function parsePluginUiContribution(value: unknown): PluginUiContribution | null {
  if (!isObject(value)) return null;
  const raw = asObject(value);
  if (!hasOnlyKeys(raw, ["id", "slot", "label", "description", "command", "input", "order"])) {
    return null;
  }
  if (!safeId(String(raw.id ?? "")) || !PLUGIN_UI_SLOT_IDS.includes(raw.slot as PluginUiSlotId)) {
    return null;
  }
  if (typeof raw.label !== "string" || raw.label.trim().length === 0 || raw.label.length > 80) {
    return null;
  }
  if (raw.description != null && (typeof raw.description !== "string" || raw.description.length > 300)) {
    return null;
  }
  if (!commandName(raw.command)) return null;
  if (raw.order != null && (
    typeof raw.order !== "number" || !Number.isInteger(raw.order) || raw.order < -100 || raw.order > 100
  )) return null;
  const order = typeof raw.order === "number" ? raw.order : 0;
  return {
    id: String(raw.id),
    slot: raw.slot as PluginUiSlotId,
    label: raw.label.trim(),
    description: typeof raw.description === "string" ? raw.description.trim() : "",
    command: raw.command,
    input: raw.input ?? null,
    order,
  };
}

export function parsePluginConnectorContribution(
  value: unknown,
): PluginConnectorContribution | null {
  if (!isObject(value)) return null;
  const raw = asObject(value);
  if (!hasOnlyKeys(raw, ["id", "provider", "command", "capabilities"])) return null;
  if (!safeId(String(raw.id ?? ""))) return null;
  if (typeof raw.provider !== "string" || !safeId(raw.provider)) return null;
  if (!commandName(raw.command)) return null;
  if (!Array.isArray(raw.capabilities) || raw.capabilities.length === 0) return null;
  if (raw.capabilities.some((entry) =>
    typeof entry !== "string" ||
    !PLUGIN_CONNECTOR_CAPABILITIES.includes(entry as PluginConnectorCapability)
  )) return null;
  return {
    id: String(raw.id),
    provider: raw.provider,
    command: raw.command,
    capabilities: [...new Set(raw.capabilities)] as PluginConnectorCapability[],
  };
}

export function parsePluginLanguageServerContribution(
  value: unknown,
): PluginLanguageServerContribution | null {
  if (!isObject(value)) return null;
  const raw = asObject(value);
  if (!hasOnlyKeys(raw, ["id", "languages", "command", "args", "env"])) return null;
  if (!safeId(String(raw.id ?? ""))) return null;
  if (
    typeof raw.command !== "string" ||
    raw.command.trim().length === 0 ||
    !safeCommand(raw.command) ||
    !Array.isArray(raw.languages) ||
    raw.languages.some((entry) => typeof entry !== "string") ||
    (raw.args != null && (!Array.isArray(raw.args) || raw.args.some((entry) => typeof entry !== "string"))) ||
    (raw.env != null && (!isObject(raw.env) || Object.values(raw.env).some((entry) => typeof entry !== "string")))
  ) return null;
  const languages = [...new Set(strings(raw.languages).map((language) => language.toLocaleLowerCase()))]
    .filter((language) => /^[a-z0-9][a-z0-9+_.-]{0,63}$/.test(language));
  if (languages.length === 0 || languages.length > 16) return null;
  return {
    id: String(raw.id),
    languages,
    command: raw.command.trim(),
    args: strings(raw.args),
    env: stringRecord(raw.env),
  };
}

export function parsePluginContributionArray<T>(
  value: unknown,
  parse: (entry: unknown) => T | null,
  label: string,
  strict: boolean,
): T[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    if (strict) throw new Error(`${label} must be an array`);
    return [];
  }
  const parsed = value.map(parse);
  const invalid = parsed.findIndex((entry) => entry === null);
  if (strict && invalid >= 0) throw new Error(`${label}[${invalid}] is invalid`);
  return parsed.filter((entry): entry is T => entry !== null);
}

export function assertUniquePluginContributionIds(
  contributions: Array<{ id: string }>,
  label: string,
): void {
  if (contributions.length !== new Set(contributions.map((contribution) => contribution.id)).size) {
    throw new Error(`${label} contains duplicate ids`);
  }
}

/** Validate and normalize the only manifest shape C2 installs. */
export function parsePluginManifest(value: unknown): C2PluginManifest {
  if (!isObject(value)) throw new Error("plugin.json must contain an object");
  const raw = asObject(value);
  const rootFields = [
    "$schema", "name", "version", "description", "author", "homepage", "repository", "license",
    "keywords", "extensions",
  ];
  const unknownRootFields = Object.keys(raw).filter((key) => !rootFields.includes(key));
  if (unknownRootFields.length > 0) {
    throw new Error(`Unknown Agent Plugins fields: ${unknownRootFields.join(", ")}`);
  }
  if (raw.$schema !== AGENT_PLUGIN_SCHEMA) {
    throw new Error(`Unsupported Agent Plugins schema: ${String(raw.$schema ?? "")}`);
  }
  if (
    typeof raw.name !== "string" ||
    raw.name.length > 64 ||
    !/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(raw.name)
  ) throw new Error("Agent Plugins name must match the 1.0.0 naming rules");
  if (typeof raw.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(raw.version)) {
    throw new Error("C2 plugins require a semantic version");
  }

  if (raw.description != null && typeof raw.description !== "string") {
    throw new Error("Agent Plugins description must be a string");
  }
  if (raw.repository != null && typeof raw.repository !== "string") {
    throw new Error("Agent Plugins repository must be a string");
  }
  for (const field of ["homepage", "license"] as const) {
    if (raw[field] != null && typeof raw[field] !== "string") {
      throw new Error(`Agent Plugins ${field} must be a string`);
    }
  }
  if (raw.keywords != null && (
    !Array.isArray(raw.keywords) || raw.keywords.some((keyword) => typeof keyword !== "string")
  )) throw new Error("Agent Plugins keywords must be an array of strings");
  if (raw.author != null && (
    !isObject(raw.author) ||
    !hasOnlyKeys(raw.author, ["name", "email", "url"]) ||
    Object.values(raw.author).some((entry) => typeof entry !== "string")
  )) throw new Error("Agent Plugins author must match the 1.0.0 schema");
  if (raw.extensions != null && !isObject(raw.extensions)) {
    throw new Error("Agent Plugins extensions must be an object");
  }

  const extensions = asObject(raw.extensions);
  if (Object.values(extensions).some((extension) => !isObject(extension))) {
    throw new Error("Agent Plugins extension values must be objects");
  }
  const c2Value = extensions["dev.codetwo"];
  if (c2Value == null || typeof c2Value !== "object" || Array.isArray(c2Value)) {
    throw new Error("C2 plugins require extensions.dev.codetwo");
  }
  const c2 = asObject(c2Value);
  const standardVersion = typeof c2.standardVersion === "string" ? c2.standardVersion : "";
  if (standardVersion !== C2_PLUGIN_STANDARD_VERSION) {
    throw new Error(`Unsupported C2 plugin standard: ${standardVersion || "missing"}`);
  }
  const unknownFields = Object.keys(c2).filter(
    (key) => ![
      "standardVersion", "runtime", "commands", "ui", "connectors", "languageServers",
    ].includes(key),
  );
  if (unknownFields.length > 0) {
    throw new Error(`Unknown C2 plugin fields: ${unknownFields.join(", ")}`);
  }
  const runtime = c2.runtime == null ? null : parsePluginRuntimeContribution(c2.runtime);
  if (c2.runtime != null && !runtime) throw new Error("extensions.dev.codetwo.runtime is invalid");
  const commands = parsePluginContributionArray(
    c2.commands,
    parsePluginRuntimeCommandContribution,
    "extensions.dev.codetwo.commands",
    true,
  );
  if (commands.length > 100) throw new Error("extensions.dev.codetwo.commands has too many entries");
  const ui = parsePluginContributionArray(
    c2.ui,
    parsePluginUiContribution,
    "extensions.dev.codetwo.ui",
    true,
  );
  const connectors = parsePluginContributionArray(
    c2.connectors,
    parsePluginConnectorContribution,
    "extensions.dev.codetwo.connectors",
    true,
  );
  if (connectors.length > 100) {
    throw new Error("extensions.dev.codetwo.connectors has too many entries");
  }
  const languageServers = parsePluginContributionArray(
    c2.languageServers,
    parsePluginLanguageServerContribution,
    "extensions.dev.codetwo.languageServers",
    true,
  );
  assertUniquePluginContributionIds(commands, "extensions.dev.codetwo.commands");
  assertUniquePluginContributionIds(ui, "extensions.dev.codetwo.ui");
  assertUniquePluginContributionIds(connectors, "extensions.dev.codetwo.connectors");
  assertUniquePluginContributionIds(languageServers, "extensions.dev.codetwo.languageServers");
  if (ui.length > 0 && !runtime) {
    throw new Error("UI action contributions require extensions.dev.codetwo.runtime");
  }
  if (connectors.length > 0 && !runtime) {
    throw new Error("Connector contributions require extensions.dev.codetwo.runtime");
  }
  if (runtime && commands.length === 0) {
    throw new Error("C2 process runtimes require extensions.dev.codetwo.commands");
  }
  if (commands.length > 0 && !runtime) {
    throw new Error("Runtime command contributions require extensions.dev.codetwo.runtime");
  }
  const declaredCommands = new Set(commands.map((command) => command.id));
  const unknownUiCommand = ui.find((contribution) => !declaredCommands.has(contribution.command));
  if (unknownUiCommand) {
    throw new Error(
      `UI action ${unknownUiCommand.id} references undeclared runtime command ${unknownUiCommand.command}`,
    );
  }
  const unknownConnectorCommand = connectors.find(
    (contribution) => !declaredCommands.has(contribution.command),
  );
  if (unknownConnectorCommand) {
    throw new Error(
      `Connector ${unknownConnectorCommand.id} references undeclared runtime command ${unknownConnectorCommand.command}`,
    );
  }
  const author = asObject(raw.author);
  return {
    name: raw.name,
    version: raw.version,
    description: typeof raw.description === "string" ? raw.description.slice(0, 500) : "",
    author: typeof author.name === "string" ? author.name : "",
    repository: typeof raw.repository === "string" ? raw.repository : "",
    standardVersion: standardVersion as C2PluginStandardVersion,
    runtime,
    commands,
    ui,
    connectors,
    languageServers,
  };
}

/** Stable policy identity for one UI descriptor owned by an installed package. */
export function pluginUiComponentId(pluginId: string, contributionId: string): string {
  return `bundle:${pluginId}:ui:${contributionId}`;
}
