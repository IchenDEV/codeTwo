import type { ProviderInfo } from "../bridge";

const defaultRetryDelaysMs = [0, 250, 750] as const;
const defaultAttemptTimeoutMs = 7000;

async function timeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(new Error(`Provider detection timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    void promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function pause(delayMs: number): Promise<void> {
  if (delayMs > 0) {
    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, delayMs);
    });
  }
}

export async function loadProviderRegistry(
  load: () => Promise<ProviderInfo[]>,
  retryDelaysMs: readonly number[] = defaultRetryDelaysMs,
  attemptTimeoutMs = defaultAttemptTimeoutMs
): Promise<ProviderInfo[]> {
  let lastError: unknown = new Error("Provider detection did not run");

  for (const delayMs of retryDelaysMs) {
    await pause(delayMs);
    try {
      const providers = await timeout(load(), attemptTimeoutMs);
      if (providers.length === 0) {
        throw new Error("Provider detection returned an empty registry");
      }
      return providers;
    } catch (error) {
      lastError = error;
    }
  }

  throw Error.isError(lastError) ? lastError : new Error(String(lastError));
}
