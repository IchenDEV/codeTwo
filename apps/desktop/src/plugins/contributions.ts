import {
  PLUGIN_UI_SLOT_IDS,
  type PluginInfo,
  type PluginLanguageServer,
  type PluginUiContribution,
  type PluginUiSlotId,
} from "../bridge";
import type { PluginManagerPlugin } from "./types";

export interface ActivePluginUiContribution extends PluginUiContribution {
  pluginId: string;
  pluginName: string;
}

export interface ActivePluginLanguageServer extends PluginLanguageServer {
  pluginId: string;
  pluginName: string;
}

export type ActivePluginUiContributionsBySlot = Record<
  PluginUiSlotId,
  ActivePluginUiContribution[]
>;

function activeBundle(bundle: PluginInfo, plugins: PluginManagerPlugin[]): boolean {
  if (!bundle.enabled || !bundle.trusted) return false;
  const managed = plugins.find((plugin) => plugin.id === `bundle:${bundle.id}`);
  return managed == null || (
    managed.state.effectiveEnabled &&
    managed.state.status === "active"
  );
}

export function activePluginUiContributions(
  bundles: PluginInfo[],
  plugins: PluginManagerPlugin[],
): ActivePluginUiContributionsBySlot {
  const bySlot = Object.fromEntries(
    PLUGIN_UI_SLOT_IDS.map((slot) => [slot, []]),
  ) as unknown as ActivePluginUiContributionsBySlot;

  for (const bundle of bundles.filter((candidate) => activeBundle(candidate, plugins))) {
    for (const contribution of bundle.ui_contributions ?? []) {
      bySlot[contribution.slot].push({
        ...contribution,
        pluginId: bundle.id,
        pluginName: bundle.name,
      });
    }
  }

  for (const contributions of Object.values(bySlot)) {
    contributions.sort((left, right) =>
      left.order - right.order || left.label.localeCompare(right.label));
  }

  return bySlot;
}

export function activePluginLanguageServers(
  bundles: PluginInfo[],
  plugins: PluginManagerPlugin[],
): ActivePluginLanguageServer[] {
  return bundles
    .filter((bundle) => activeBundle(bundle, plugins))
    .flatMap((bundle) => (bundle.lsp_servers ?? []).map((server) => ({
      ...server,
      pluginId: bundle.id,
      pluginName: bundle.name,
    })))
    .sort((left, right) =>
      left.pluginId.localeCompare(right.pluginId) || left.id.localeCompare(right.id));
}
