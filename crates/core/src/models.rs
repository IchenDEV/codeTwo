//! Built-in model lists, for providers that don't report their own.
//!
//! ACP's model API (`session/new` → `models`, `session/set_model`) is marked UNSTABLE and most
//! adapters skip the reporting half entirely. That left the picker with nothing to show and the
//! user with nothing to do but go edit the CLI's config file — so we keep a short list of each
//! CLI's own model ids here and offer that instead.
//!
//! These are a fallback, never an override: whatever the agent reports at `session/new` wins, and
//! is the only list shown when it exists. The ids are the ones each CLI accepts for its own
//! `--model` (so `session/set_model` has a chance of taking them); the names are what we render.
//! A provider we have no list for still gets the "set it in the CLI's config" note.

use crate::event::ModelChoice;
use crate::provider::ProviderId;

fn choice(id: &str, name: &str, description: Option<&str>) -> ModelChoice {
    ModelChoice {
        id: id.to_string(),
        name: name.to_string(),
        description: description.map(|s| s.to_string()),
    }
}

/// The models we offer for `provider` when it reports none of its own. Empty for providers we
/// don't ship a list for — including every [`ProviderId::Custom`], whose models we can't know.
pub fn builtin_models(provider: &ProviderId) -> Vec<ModelChoice> {
    match provider {
        // The Claude Code CLI takes aliases rather than dated ids, and resolves each to the current
        // model in that tier — so this list doesn't age out with every release.
        ProviderId::ClaudeCode => vec![
            choice("opus", "Claude Opus", Some("Most capable")),
            choice("sonnet", "Claude Sonnet", Some("Balanced")),
            choice("haiku", "Claude Haiku", Some("Fastest")),
        ],
        // Keep the pre-prompt fallback aligned with the pinned codex-acp release. Once
        // `session/new` completes, the adapter replaces it with its live model + effort catalog.
        ProviderId::Codex => vec![
            choice(
                "gpt-5.6-sol",
                "GPT-5.6 Sol",
                Some("Latest frontier agentic coding model."),
            ),
            choice(
                "gpt-5.6-terra",
                "GPT-5.6 Terra",
                Some("Balanced agentic coding model for everyday work."),
            ),
            choice(
                "gpt-5.6-luna",
                "GPT-5.6 Luna",
                Some("Fast and affordable agentic coding model."),
            ),
            choice(
                "gpt-5.5",
                "GPT-5.5",
                Some("Frontier model for complex coding, research, and real-world work."),
            ),
            choice(
                "gpt-5.4",
                "GPT-5.4",
                Some("Strong model for everyday coding."),
            ),
            choice(
                "gpt-5.4-mini",
                "GPT-5.4 Mini",
                Some("Small, fast, and cost-efficient model for simpler coding tasks."),
            ),
            choice(
                "gpt-5.3-codex-spark",
                "GPT-5.3 Codex Spark",
                Some("Ultra-fast coding model."),
            ),
        ],
        ProviderId::Grok => vec![
            choice("grok-4-fast", "Grok 4 Fast", None),
            choice("grok-4", "Grok 4", None),
            choice(
                "grok-code-fast-1",
                "Grok Code Fast",
                Some("Tuned for coding"),
            ),
        ],
        ProviderId::Cursor => vec![
            choice("composer-1", "Composer 1", Some("Cursor's own")),
            choice("sonnet-4.5", "Claude Sonnet 4.5", None),
            choice("opus-4.1", "Claude Opus 4.1", None),
            choice("gpt-5", "GPT-5", None),
        ],
        // OpenCode routes to many backends, so its ids are `provider/model`.
        ProviderId::OpenCode => vec![
            choice("anthropic/claude-sonnet-4-5", "Claude Sonnet 4.5", None),
            choice("anthropic/claude-opus-4-1", "Claude Opus 4.1", None),
            choice("openai/gpt-5", "GPT-5", None),
            choice("google/gemini-2.5-pro", "Gemini 2.5 Pro", None),
        ],
        // Pi is BYOK and resolves `provider/id` (plus an optional `:thinking` suffix) against
        // whatever keys you've configured, so this is a starting point rather than a catalogue.
        ProviderId::Pi => vec![
            choice("anthropic/claude-sonnet-4-5", "Claude Sonnet 4.5", None),
            choice("anthropic/claude-opus-4-1", "Claude Opus 4.1", None),
            choice("openai/gpt-5.1", "GPT-5.1", None),
            choice("google/gemini-2.5-pro", "Gemini 2.5 Pro", None),
        ],
        ProviderId::Kimi => vec![
            choice("k3", "Kimi K3", Some("Flagship, 1M context")),
            choice("k3-256k", "Kimi K3 (256K)", Some("Cheaper context window")),
            choice("kimi-for-coding", "Kimi for Coding", None),
            choice(
                "kimi-for-coding-highspeed",
                "Kimi for Coding Highspeed",
                Some("Same ability, faster"),
            ),
        ],
        // The GLM ACP agent switches models mid-session, and these are the ids it accepts.
        ProviderId::ZCode => vec![
            choice("glm-5.2", "GLM-5.2", Some("Default")),
            choice("glm-5.1", "GLM-5.1", None),
            choice("glm-5-turbo", "GLM-5 Turbo", Some("Fastest")),
            choice("glm-4.7", "GLM-4.7", None),
            choice("glm-4.5-air", "GLM-4.5 Air", None),
        ],
        ProviderId::Custom(_) => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_registered_provider_has_a_list() {
        for p in crate::provider::default_registry() {
            assert!(
                !builtin_models(&p.id).is_empty(),
                "{} has no built-in models",
                p.display_name
            );
        }
    }

    #[test]
    fn custom_providers_have_none() {
        assert!(builtin_models(&ProviderId::Custom("mine".into())).is_empty());
    }

    #[test]
    fn codex_model_ids_are_real_slugs() {
        let codex = builtin_models(&ProviderId::Codex);
        assert!(codex
            .iter()
            .all(|m| !m.id.is_empty() && !m.id.contains(' ')));
    }

    #[test]
    fn codex_list_matches_the_pinned_adapter() {
        let ids: Vec<_> = builtin_models(&ProviderId::Codex)
            .into_iter()
            .map(|model| model.id)
            .collect();

        assert_eq!(
            ids,
            [
                "gpt-5.6-sol",
                "gpt-5.6-terra",
                "gpt-5.6-luna",
                "gpt-5.5",
                "gpt-5.4",
                "gpt-5.4-mini",
                "gpt-5.3-codex-spark",
            ]
        );
        assert!(
            ids.iter().all(|id| !id.starts_with("gpt-5.1-codex")),
            "stale GPT-5.1 Codex entries are still exposed: {ids:?}"
        );
    }
}
