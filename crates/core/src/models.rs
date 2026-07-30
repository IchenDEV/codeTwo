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
        // Codex encodes reasoning effort in the model id; the picker splits those suffixes back out
        // into a second chip (see the desktop `models.ts`), so name them the way it parses.
        ProviderId::Codex => vec![
            choice("gpt-5.1-codex low", "GPT-5.1 Codex (Low)", None),
            choice("gpt-5.1-codex medium", "GPT-5.1 Codex (Medium)", None),
            choice("gpt-5.1-codex high", "GPT-5.1 Codex (High)", None),
            choice("gpt-5.1-codex-max", "GPT-5.1 Codex Max", None),
        ],
        ProviderId::Grok => vec![
            choice("grok-4-fast", "Grok 4 Fast", None),
            choice("grok-4", "Grok 4", None),
            choice("grok-code-fast-1", "Grok Code Fast", Some("Tuned for coding")),
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
        ProviderId::Custom(_) => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_registered_provider_has_a_list() {
        for p in crate::provider::default_registry() {
            assert!(!builtin_models(&p.id).is_empty(), "{} has no built-in models", p.display_name);
        }
    }

    #[test]
    fn custom_providers_have_none() {
        assert!(builtin_models(&ProviderId::Custom("mine".into())).is_empty());
    }

    #[test]
    fn codex_names_split_into_effort_variants() {
        // The desktop picker groups by trailing effort token; ids and names must stay in step.
        let codex = builtin_models(&ProviderId::Codex);
        assert!(codex.iter().any(|m| m.name.ends_with("(High)")));
        assert!(codex.iter().all(|m| !m.id.is_empty()));
    }
}
