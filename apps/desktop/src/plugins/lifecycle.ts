import type {
  ManagedPluginChangePlan,
  ManagedPluginChangeRequest,
  ManagedPluginChangeResult,
} from "../bridge";
import { toManagedPluginScope } from "./catalog";
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
  planChange: (request: ManagedPluginChangeRequest) => Promise<ManagedPluginChangePlan>;
}

/** Translate one UI request into the host's revision-bound management protocol. */
export async function planPluginManagerChange({
  request,
  plugins,
  components,
  planChange,
}: PlanPluginManagerChangeInput): Promise<PluginManagerChangePlan> {
  const component = request.targetKind === "component"
    ? components.find((item) => item.id === request.targetId)
    : undefined;
  const targetPluginId = component?.policyPluginId ?? component?.pluginId ?? request.targetId;
  const targetPlugin = plugins.find((plugin) => plugin.id === targetPluginId);
  if (!targetPlugin) throw new Error(`Plugin ${targetPluginId} is no longer in the catalog.`);

  const planned = await planChange({
    plugin: targetPlugin.id,
    scope: toManagedPluginScope(request.scope),
    state: request.desiredState,
    component: request.targetKind === "component" ? request.targetId : undefined,
  });

  return {
    confirmationId: planned.id,
    graphRevision: planned.graph_revision,
    request,
    summary: request.targetKind === "component"
      ? `${request.desiredState === "disabled" ? "Hide" : "Enable"} ${request.targetName} and reconcile its owning plugin.`
      : `${request.desiredState === "disabled" ? "Unload" : "Load"} ${request.targetName} in the selected scope.`,
    // Disables always cross a visible lifecycle boundary, even without a dependent cascade.
    requiresConfirmation: planned.requires_confirmation || request.desiredState === "disabled",
    affectedPlugins: planned.affected.map((id) => ({
      id,
      name: plugins.find((plugin) => plugin.id === id)?.name ?? id,
    })),
    activeResources: planned.active_resources.map((resource) => ({
      id: resource.id,
      label: resource.label,
      kind: resource.kind,
    })),
  };
}

/** Apply only the confirmation id issued by the backend plan. */
export async function applyPluginManagerChange(
  plan: PluginManagerChangePlan,
  applyChange: (id: string) => Promise<ManagedPluginChangeResult>,
): Promise<void> {
  await applyChange(plan.confirmationId);
}
