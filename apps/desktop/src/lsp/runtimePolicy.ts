import { setLspRuntimeEnabled } from "./client";

export interface LspRuntimePolicy {
  catalogReady: boolean;
  pluginEnabled: boolean;
  componentEnabled: boolean;
  projectPath: string | null;
  workspace: string;
}

const backendPolicyQueues = new Map<string, Promise<void>>();

async function updateBackendPolicy(
  policy: LspRuntimePolicy,
  setBackendEnabled: (isEnabled: boolean) => Promise<void>
): Promise<void> {
  const realm = policy.projectPath ?? "\0global";
  const previous = backendPolicyQueues.get(realm) ?? Promise.resolve();
  const update = previous
    .catch(() => {})
    .then(async () => {
      await setBackendEnabled(policy.componentEnabled);
    });
  backendPolicyQueues.set(realm, update);
  const cleanup = () => {
    if (backendPolicyQueues.get(realm) === update) {
      backendPolicyQueues.delete(realm);
    }
  };
  void update.catch(cleanup).then(cleanup);
  await update;
}

export async function synchronizeLspRuntimePolicy(
  policy: LspRuntimePolicy,
  setBackendEnabled: (isEnabled: boolean) => Promise<void>,
  isCurrent: () => boolean = () => true
): Promise<void> {
  setLspRuntimeEnabled(false);
  if (!policy.catalogReady || !policy.pluginEnabled) {
    return;
  }

  await updateBackendPolicy(policy, setBackendEnabled);
  if (policy.componentEnabled && isCurrent()) {
    setLspRuntimeEnabled(true, policy.workspace);
  }
}
