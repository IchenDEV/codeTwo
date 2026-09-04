import { toManagedPluginScope } from "./catalog";
import type {
  ManagedPluginChangePlan,
  ManagedPluginChangeRequest,
  ManagedPluginChangeResult,
} from "../bridge";
import type {
  PluginManagerChangePlan,
  PluginManagerChangeRequest,
  PluginManagerComponent,
  PluginManagerPlugin,
} from "./types";

export interface PlanPluginManagerChangeInput {
  request: PluginManagerChangeRequest;
  plugins: PluginManagerPlugin[];
  components: PluginManagerComponent[];
  planChange: (
    request: ManagedPluginChangeRequest
  ) => Promise<ManagedPluginChangePlan>;
}

export async function planPluginManagerChange({
  request,
  plugins,
  components,
  planChange,
}: PlanPluginManagerChangeInput): Promise<PluginManagerChangePlan> {
  const component =
    request.targetKind === "component"
      ? components.find((item) => item.id === request.targetId)
      : undefined;
  const targetPluginId =
    component?.policyPluginId ?? component?.pluginId ?? request.targetId;
  const targetPlugin = plugins.find((plugin) => plugin.id === targetPluginId);
  if (!targetPlugin) {
    throw new Error(`Plugin ${targetPluginId} is no longer in the catalog.`);
  }

  const planned = await planChange({
    component:
      request.targetKind === "component" ? request.targetId : undefined,
    plugin: targetPlugin.id,
    scope: toManagedPluginScope(request.scope),
    state: request.desiredState,
  });

  return {
    activeResources: planned.active_resources.map((resource) => {
      return {
        id: resource.id,
        kind: resource.kind,
        label: resource.label,
      };
    }),
    affectedPlugins: planned.affected.map((id) => {
      return {
        id,
        name: plugins.find((plugin) => plugin.id === id)?.name ?? id,
      };
    }),
    confirmationId: planned.id,
    graphRevision: planned.graph_revision,
    request,
    requiresConfirmation:
      planned.requires_confirmation || request.desiredState === "disabled",
    summary:
      request.targetKind === "component"
        ? `${request.desiredState === "disabled" ? "Hide" : "Enable"} ${request.targetName} and reconcile its owning plugin.`
        : `${request.desiredState === "disabled" ? "Unload" : "Load"} ${request.targetName} in the selected scope.`,
  };
}

export async function applyPluginManagerChange(
  plan: PluginManagerChangePlan,
  applyChange: (id: string) => Promise<ManagedPluginChangeResult>
): Promise<void> {
  await applyChange(plan.confirmationId);
}
