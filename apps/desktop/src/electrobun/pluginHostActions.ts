import type { DesktopEvent } from "./rpc";

const HOST_ACTION_SLOT = "host.actions";
const MAX_ACTIONS = 8;
const MAX_INPUT_BYTES = 4 * 1024;

interface HostActionContribution {
  pluginId: string;
  contributionId: string;
  order: number;
  label: string;
}

export interface HostActionItem {
  contributionKey: string;
  id: string;
  label: string;
  detail: string;
  state: "default" | "running" | "attention" | "failure";
  enabled: boolean;
  accessibilityLabel: string;
}

export interface HostActionAdapter {
  render(items: HostActionItem[]): boolean;
  dispose(): void;
}

interface ActionDocumentItem extends Omit<HostActionItem, "contributionKey"> {
  input: unknown;
}

type HostCall = (
  name: string,
  args: unknown,
  projectPath: string | null
) => Promise<unknown>;

function contributionKey(contribution: HostActionContribution): string {
  return `${contribution.pluginId}:${contribution.contributionId}`;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function activeContributions(
  installed: unknown,
  catalog: unknown
): HostActionContribution[] {
  if (!Array.isArray(installed)) return [];
  const catalogEntries = asObject(catalog)?.plugins;
  const policies = new Map<string, Record<string, unknown>>();
  if (Array.isArray(catalogEntries)) {
    for (const value of catalogEntries) {
      const entry = asObject(value);
      if (entry && typeof entry.id === "string") policies.set(entry.id, entry);
    }
  }

  const contributions: HostActionContribution[] = [];
  for (const value of installed) {
    const plugin = asObject(value);
    if (
      !plugin ||
      typeof plugin.id !== "string" ||
      plugin.enabled !== true ||
      plugin.trusted !== true
    ) {
      continue;
    }
    const policy = policies.get(`bundle:${plugin.id}`);
    if (policy && (policy.enabled !== true || policy.running !== true))
      continue;
    if (!Array.isArray(plugin.ui_contributions)) continue;
    for (const value of plugin.ui_contributions) {
      const contribution = asObject(value);
      if (
        !contribution ||
        contribution.slot !== HOST_ACTION_SLOT ||
        typeof contribution.id !== "string" ||
        typeof contribution.label !== "string" ||
        typeof contribution.order !== "number"
      )
        continue;
      const components = asObject(policy?.components);
      if (
        components?.[`bundle:${plugin.id}:ui:${contribution.id}`] === "disabled"
      )
        continue;
      contributions.push({
        pluginId: plugin.id,
        contributionId: contribution.id,
        order: contribution.order,
        label: contribution.label,
      });
    }
  }
  return contributions.sort(
    (left, right) =>
      left.order - right.order || left.label.localeCompare(right.label)
  );
}

function parseDocument(value: unknown): ActionDocumentItem[] | null {
  const rawItems = asObject(value)?.items;
  if (!Array.isArray(rawItems) || rawItems.length > MAX_ACTIONS) return null;
  const ids = new Set<string>();
  const items: ActionDocumentItem[] = [];
  const allowed = new Set([
    "id",
    "label",
    "detail",
    "state",
    "enabled",
    "input",
    "accessibilityLabel",
  ]);
  for (const value of rawItems) {
    const item = asObject(value);
    if (!item || Object.keys(item).some((key) => !allowed.has(key)))
      return null;
    if (
      typeof item.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(item.id) ||
      ids.has(item.id)
    )
      return null;
    if (
      typeof item.label !== "string" ||
      item.label.trim() === "" ||
      Array.from(item.label).length > 80
    )
      return null;
    const detail = item.detail ?? "";
    const state = item.state ?? "default";
    const enabled = item.enabled ?? true;
    const accessibilityLabel = item.accessibilityLabel ?? item.label;
    const input = item.input ?? null;
    if (
      typeof detail !== "string" ||
      Array.from(detail).length > 80 ||
      !["default", "running", "attention", "failure"].includes(String(state)) ||
      typeof enabled !== "boolean" ||
      typeof accessibilityLabel !== "string" ||
      Array.from(accessibilityLabel).length > 160 ||
      (input !== null && asObject(input) === null)
    )
      return null;
    let inputBytes: number;
    try {
      inputBytes = Buffer.byteLength(JSON.stringify(input), "utf8");
    } catch {
      return null;
    }
    if (inputBytes > MAX_INPUT_BYTES) return null;
    ids.add(item.id);
    items.push({
      id: item.id,
      label: item.label,
      detail,
      state: state as ActionDocumentItem["state"],
      enabled,
      input,
      accessibilityLabel,
    });
  }
  return items;
}

/** Projects existing plugin UI actions through one host-owned compact-action adapter. */
export class PluginHostActionController {
  private generation = 0;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private active = new Map<string, HostActionContribution>();
  private inputs = new Map<string, Map<string, unknown>>();

  constructor(
    private readonly call: HostCall,
    private readonly adapter: HostActionAdapter
  ) {}

  start(): Promise<void> {
    return this.refresh();
  }

  handleHostEvent(event: DesktopEvent): void {
    if (event.name === "plugins-changed" || event.name === "engine-event") {
      this.scheduleRefresh();
    }
  }

  invoke(key: string, itemId: string): void {
    const contribution = this.active.get(key);
    const input = this.inputs.get(key)?.get(itemId);
    if (!contribution || input === undefined) return;
    void this.call(
      "plugins.invoke_ui",
      {
        plugin_id: contribution.pluginId,
        contribution_id: contribution.contributionId,
        context: { operation: "invoke", input },
      },
      null
    ).catch((error) => {
      console.warn("Plugin host action failed", error);
    });
  }

  dispose(): void {
    this.generation += 1;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.active.clear();
    this.inputs.clear();
    this.adapter.dispose();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, 50);
  }

  private async refresh(): Promise<void> {
    const generation = ++this.generation;
    try {
      const [installed, catalog] = await Promise.all([
        this.call("plugins.list", {}, null),
        this.call("plugins.catalog", { scope: { kind: "user" } }, null),
      ]);
      const contributions = activeContributions(installed, catalog);
      const rendered = await Promise.allSettled(
        contributions.map(async (contribution) => ({
          contribution,
          items: parseDocument(
            await this.call(
              "plugins.invoke_ui",
              {
                plugin_id: contribution.pluginId,
                contribution_id: contribution.contributionId,
                context: { operation: "render" },
              },
              null
            )
          ),
        }))
      );
      if (generation !== this.generation) return;

      const active = new Map<string, HostActionContribution>();
      const inputs = new Map<string, Map<string, unknown>>();
      const hostItems: HostActionItem[] = [];
      for (const result of rendered) {
        if (result.status !== "fulfilled" || !result.value.items) continue;
        const { contribution, items } = result.value;
        const key = contributionKey(contribution);
        active.set(key, contribution);
        const contributionInputs = new Map<string, unknown>();
        for (const item of items) {
          contributionInputs.set(item.id, item.input);
          hostItems.push({
            contributionKey: key,
            id: item.id,
            label: item.label,
            detail: item.detail,
            state: item.state,
            enabled: item.enabled,
            accessibilityLabel: item.accessibilityLabel,
          });
        }
        inputs.set(key, contributionInputs);
      }
      this.active = active;
      this.inputs = inputs;
      if (!this.adapter.render(hostItems.slice(0, MAX_ACTIONS)))
        this.adapter.render([]);
    } catch (error) {
      if (generation !== this.generation) return;
      this.active.clear();
      this.inputs.clear();
      this.adapter.render([]);
      console.warn("Could not refresh plugin host actions", error);
    }
  }
}
