import { setLspRuntimeEnabled } from "./client";

export interface LspRuntimePolicy {
  catalogReady: boolean;
  pluginEnabled: boolean;
  componentEnabled: boolean;
  projectPath: string | null;
  workspace: string;
}

const backendPolicyQueues = new Map<string, Promise<void>>();

function updateBackendPolicy(
  policy: LspRuntimePolicy,
  setBackendEnabled: (enabled: boolean) => Promise<void>,
): Promise<void> {
  const realm = policy.projectPath ?? "\0global";
  const previous = backendPolicyQueues.get(realm) ?? Promise.resolve();
  const update = previous
    .catch(() => {})
    .then(() => setBackendEnabled(policy.componentEnabled));
  backendPolicyQueues.set(realm, update);
  const cleanup = () => {
    if (backendPolicyQueues.get(realm) === update) backendPolicyQueues.delete(realm);
  };
  void update.then(cleanup, cleanup);
  return update;
}

/**
 * Synchronize the renderer and backend gates in their safe order.
 *
 * Closing the renderer first prevents new acquisitions while the backend drains. Opening happens
 * only after the backend accepts starts again, so editor effects cannot race a suspended realm.
 */
export async function synchronizeLspRuntimePolicy(
  policy: LspRuntimePolicy,
  setBackendEnabled: (enabled: boolean) => Promise<void>,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  setLspRuntimeEnabled(false);
  if (!policy.catalogReady || !policy.pluginEnabled) return;

  await updateBackendPolicy(policy, setBackendEnabled);
  if (policy.componentEnabled && isCurrent()) {
    setLspRuntimeEnabled(true, policy.workspace);
  }
}
