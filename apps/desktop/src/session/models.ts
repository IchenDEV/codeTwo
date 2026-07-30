import type { ModelChoice } from "../bridge";

/**
 * Hardcoded fallback lists for the model picker.
 *
 * The agent is the real source of truth: current adapters report a model selector and a
 * reasoning-effort selector over ACP config options, and those always win. But the report only
 * arrives once an ACP session exists (i.e. after the first prompt), resumed sessions never get
 * one, and some providers don't implement the surface at all. In those states the picker falls
 * back to these well-known ids, sends the choice optimistically, and lets the engine's error
 * event say so if the provider rejects the switch.
 */
export const FALLBACK_MODELS: Record<string, ModelChoice[]> = {
  claude_code: [
    { id: "default", name: "Default", description: "Whatever the CLI is configured to use" },
    { id: "sonnet", name: "Sonnet", description: "Balanced speed and capability" },
    { id: "opus", name: "Opus", description: "Most capable" },
    { id: "haiku", name: "Haiku", description: "Fastest" },
    { id: "sonnet[1m]", name: "Sonnet · 1M context", description: "Long-context Sonnet" },
    { id: "opusplan", name: "Opus Plan", description: "Opus plans, Sonnet executes" },
  ],
  codex: [
    { id: "gpt-5.1-codex", name: "GPT-5.1 Codex", description: "Default coding model" },
    { id: "gpt-5.1-codex-max", name: "GPT-5.1 Codex Max", description: "Most capable" },
    { id: "gpt-5.1-codex-mini", name: "GPT-5.1 Codex Mini", description: "Fastest" },
    { id: "gpt-5.1", name: "GPT-5.1", description: "General model" },
  ],
  grok: [
    { id: "grok-code-fast-1", name: "Grok Code Fast", description: "Fast coding model" },
    { id: "grok-4-fast", name: "Grok 4 Fast", description: "Fast general model" },
    { id: "grok-4", name: "Grok 4", description: "Most capable" },
  ],
};

/** Config id the fallback effort choices are sent under (what the Claude Code adapter uses). */
export const FALLBACK_EFFORT_CONFIG_ID = "effort";

export const FALLBACK_EFFORTS: ModelChoice[] = [
  { id: "default", name: "Default", description: null },
  { id: "low", name: "Low", description: null },
  { id: "medium", name: "Medium", description: null },
  { id: "high", name: "High", description: null },
];
