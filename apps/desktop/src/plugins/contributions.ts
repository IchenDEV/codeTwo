import { pluginUiSlotIds } from "../bridge";
import type {
  PluginConnectorContribution,
  PluginInfo,
  PluginLanguageServer,
  PluginUiContribution,
  PluginUiSlotId,
} from "../bridge";
import { pluginUiComponentId } from "../pluginModel";
import type { PluginManagerComponent, PluginManagerPlugin } from "./types";

export interface ActivePluginUiContribution extends PluginUiContribution {
  pluginId: string;
  pluginName: string;
}

export interface ActivePluginLanguageServer extends PluginLanguageServer {
  pluginId: string;
  pluginName: string;
}

interface ActivePluginConnectorContribution extends PluginConnectorContribution {
  pluginId: string;
}

export type ActivePluginUiContributionsBySlot = Record<
  PluginUiSlotId,
  ActivePluginUiContribution[]
>;

function activeBundle(
  bundle: PluginInfo,
  plugins: PluginManagerPlugin[]
): boolean {
  if (!bundle.enabled || !bundle.trusted) {
    return false;
  }
  const managed = plugins.find((plugin) => plugin.id === `bundle:${bundle.id}`);
  return (
    managed === null ||
    managed === undefined ||
    (managed.state.effectiveEnabled && managed.state.status === "active")
  );
}

export function activePluginUiContributions(
  bundles: PluginInfo[],
  plugins: PluginManagerPlugin[],
  components: PluginManagerComponent[] = []
): ActivePluginUiContributionsBySlot {
  const bySlot = Object.fromEntries(
    pluginUiSlotIds.map((slot) => [slot, []])
  ) as unknown as ActivePluginUiContributionsBySlot;
  const componentById = new Map(
    components.map((component) => [component.id, component])
  );

  for (const bundle of bundles.filter((candidate) =>
    activeBundle(candidate, plugins)
  )) {
    for (const contribution of bundle.ui_contributions) {
      const managedComponent = componentById.get(
        pluginUiComponentId(bundle.id, contribution.id)
      );
      if (managedComponent && !managedComponent.state.effectiveEnabled) {
        continue;
      }
      bySlot[contribution.slot].push({
        ...contribution,
        pluginId: bundle.id,
        pluginName: bundle.name,
      });
    }
  }

  for (const contributions of Object.values(bySlot)) {
    contributions.sort(
      (left, right) =>
        left.order - right.order || left.label.localeCompare(right.label)
    );
  }

  return bySlot;
}

export function activePluginLanguageServers(
  bundles: PluginInfo[],
  plugins: PluginManagerPlugin[]
): ActivePluginLanguageServer[] {
  return bundles
    .filter((bundle) => activeBundle(bundle, plugins))
    .flatMap((bundle) => {
      return bundle.lsp_servers.map((server) => {
        return {
          ...server,
          pluginId: bundle.id,
          pluginName: bundle.name,
        };
      });
    })
    .sort((left, right) => {
      return (
        left.pluginId.localeCompare(right.pluginId) ||
        left.id.localeCompare(right.id)
      );
    });
}

export function activePluginConnectorContributions(
  bundles: PluginInfo[],
  plugins: PluginManagerPlugin[]
): ActivePluginConnectorContribution[] {
  return bundles
    .filter((bundle) => activeBundle(bundle, plugins))
    .flatMap((bundle) => {
      return bundle.connector_contributions.map((contribution) => {
        return {
          ...contribution,
          pluginId: bundle.id,
        };
      });
    })
    .sort((left, right) => {
      return (
        left.pluginId.localeCompare(right.pluginId) ||
        left.id.localeCompare(right.id)
      );
    });
}
