import type { MemoryAccess, ProviderInfo, Sandbox } from "../bridge";
import type { SessionMode } from "./mode";

/**
 * Everything configured once per session rather than once per turn.
 *
 * This is one bag of state, but deliberately *not* one panel: each field is reached from its own
 * chip in the control row, so choosing a provider shows providers and nothing else. See the pickers
 * in `Composer.tsx`.
 */
export interface SessionConfig {
  providers: ProviderInfo[];
  provider: string;
  onProvider: (v: string) => void;
  /** The engine's two permission axes. Read here, but set only as a pair — see `onSessionMode`. */
  mode: string;
  sandbox: Sandbox;
  onSessionMode: (v: SessionMode) => void;
  useWorktree: boolean;
  onWorktree: (v: boolean) => void;
  planMode: boolean;
  onPlan: (v: boolean) => void;
  memoryRead: MemoryAccess;
  memoryWrite: MemoryAccess;
  onMemoryPolicy: (read: MemoryAccess, write: MemoryAccess) => void;
  /** Whether a session exists yet — some controls have nothing to act on before that. */
  hasSession: boolean;
}
