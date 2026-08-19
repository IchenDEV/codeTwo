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

use std::process::Stdio;
use std::sync::OnceLock;
use std::time::Duration;

use serde::Deserialize;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader as AsyncBufReader};
use tokio::process::Command;

use crate::event::ModelChoice;
use crate::provider::{which, Provider, ProviderId};

static CODEX_MODELS: OnceLock<Vec<ModelChoice>> = OnceLock::new();

fn choice(id: &str, name: &str, description: Option<&str>) -> ModelChoice {
    ModelChoice {
        id: id.to_string(),
        name: name.to_string(),
        description: description.map(|s| s.to_string()),
    }
}

fn codex_family(id: &str, name: &str, description: &str, efforts: &[&str]) -> Vec<ModelChoice> {
    efforts
        .iter()
        .map(|effort| ModelChoice {
            id: format!("{id}[{effort}]"),
            name: format!("{name} ({})", effort_label(effort)),
            description: Some(description.to_string()),
        })
        .collect()
}

fn effort_label(effort: &str) -> String {
    let mut chars = effort.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
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
        // Codex is queried live by [`available_models`]. Keep the same current catalogue here so
        // a temporarily unavailable app-server still leaves the pre-session picker useful.
        ProviderId::Codex => [
            codex_family(
                "gpt-5.6-sol",
                "GPT-5.6-Sol",
                "Latest frontier agentic coding model.",
                &["low", "medium", "high", "xhigh", "max", "ultra"],
            ),
            codex_family(
                "gpt-5.6-terra",
                "GPT-5.6-Terra",
                "Balanced agentic coding model for everyday work.",
                &["low", "medium", "high", "xhigh", "max", "ultra"],
            ),
            codex_family(
                "gpt-5.6-luna",
                "GPT-5.6-Luna",
                "Fast and affordable agentic coding model.",
                &["low", "medium", "high", "xhigh", "max"],
            ),
            codex_family(
                "gpt-5.5",
                "GPT-5.5",
                "Frontier model for complex coding, research, and real-world work.",
                &["low", "medium", "high", "xhigh"],
            ),
            codex_family(
                "gpt-5.4",
                "GPT-5.4",
                "Strong model for everyday coding.",
                &["low", "medium", "high", "xhigh"],
            ),
            codex_family(
                "gpt-5.4-mini",
                "GPT-5.4-Mini",
                "Small, fast, and cost-efficient model for simpler coding tasks.",
                &["low", "medium", "high", "xhigh"],
            ),
            codex_family(
                "gpt-5.3-codex-spark",
                "GPT-5.3-Codex-Spark",
                "Ultra-fast coding model.",
                &["low", "medium", "high", "xhigh"],
            ),
        ]
        .into_iter()
        .flatten()
        .collect(),
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
            choice("kimi-for-coding-highspeed", "Kimi for Coding Highspeed", Some("Same ability, faster")),
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

/// Resolve the model list shown before an ACP session exists. Codex owns a live model catalogue,
/// so prefer that instead of freezing release names in C2. Other providers retain their
/// documented built-in fallbacks until their CLIs expose an equivalent catalogue API.
pub async fn available_models(provider: &Provider) -> Vec<ModelChoice> {
    if provider.id != ProviderId::Codex {
        return builtin_models(&provider.id);
    }
    if let Some(models) = CODEX_MODELS.get() {
        return models.clone();
    }

    let executable = provider
        .launch
        .env
        .iter()
        .find_map(|(key, value)| (key == "CODEX_PATH").then_some(value.as_str()))
        .map(std::path::PathBuf::from)
        .filter(|path| path.is_file())
        .or_else(|| which("codex"));
    let Some(executable) = executable else {
        return builtin_models(&provider.id);
    };

    match query_codex_models(executable).await {
        Ok(models) if !models.is_empty() => {
            let _ = CODEX_MODELS.set(models.clone());
            models
        }
        _ => builtin_models(&provider.id),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexModelList {
    #[serde(default)]
    data: Vec<CodexModel>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexModel {
    id: String,
    display_name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    hidden: bool,
    #[serde(default)]
    supported_reasoning_efforts: Vec<CodexReasoningEffort>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexReasoningEffort {
    reasoning_effort: String,
    #[serde(default)]
    description: Option<String>,
}

fn parse_codex_models(result: &serde_json::Value) -> Result<Vec<ModelChoice>, ()> {
    let list: CodexModelList = serde_json::from_value(result.clone()).map_err(|_| ())?;
    let mut choices = Vec::new();
    for model in list.data.into_iter().filter(|model| !model.hidden) {
        if model.supported_reasoning_efforts.is_empty() {
            choices.push(ModelChoice {
                id: model.id,
                name: model.display_name,
                description: model.description,
            });
            continue;
        }
        for effort in model.supported_reasoning_efforts {
            let description = match (model.description.as_deref(), effort.description.as_deref()) {
                (Some(model), Some(effort)) => Some(format!("{model} {effort}")),
                (Some(model), None) => Some(model.to_string()),
                (None, Some(effort)) => Some(effort.to_string()),
                (None, None) => None,
            };
            choices.push(ModelChoice {
                id: format!("{}[{}]", model.id, effort.reasoning_effort),
                name: format!(
                    "{} ({})",
                    model.display_name,
                    effort_label(&effort.reasoning_effort)
                ),
                description,
            });
        }
    }
    Ok(choices)
}

async fn query_codex_models(executable: std::path::PathBuf) -> Result<Vec<ModelChoice>, ()> {
    let mut child = Command::new(executable)
        .args(["app-server", "--stdio"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| ())?;
    let mut stdin = child.stdin.take().ok_or(())?;
    let stdout = child.stdout.take().ok_or(())?;

    write_codex_rpc(
        &mut stdin,
        serde_json::json!({
            "method": "initialize",
            "id": 1,
            "params": {
                "clientInfo": { "name": "codetwo", "title": "C2", "version": env!("CARGO_PKG_VERSION") },
                "capabilities": null
            }
        }),
    )
    .await?;

    let exchange = async {
        let mut lines = AsyncBufReader::new(stdout).lines();
        while let Some(line) = lines.next_line().await.map_err(|_| ())? {
            let message: serde_json::Value = serde_json::from_str(&line).map_err(|_| ())?;
            match message.get("id").and_then(serde_json::Value::as_i64) {
                Some(1) if message.get("error").is_some() => return Err(()),
                Some(1) => {
                    write_codex_rpc(
                        &mut stdin,
                        serde_json::json!({ "method": "initialized", "params": {} }),
                    )
                    .await?;
                    write_codex_rpc(
                        &mut stdin,
                        serde_json::json!({ "method": "model/list", "id": 2, "params": { "limit": 100 } }),
                    )
                    .await?;
                }
                Some(2) if message.get("error").is_some() => return Err(()),
                Some(2) => return parse_codex_models(message.get("result").ok_or(())?),
                _ => {}
            }
        }
        Err(())
    };

    let result = tokio::time::timeout(Duration::from_secs(8), exchange)
        .await
        .map_err(|_| ())?;
    drop(stdin);
    let _ = child.kill().await;
    let _ = child.wait().await;
    result
}

async fn write_codex_rpc(
    stdin: &mut tokio::process::ChildStdin,
    message: serde_json::Value,
) -> Result<(), ()> {
    let mut bytes = serde_json::to_vec(&message).map_err(|_| ())?;
    bytes.push(b'\n');
    stdin.write_all(&bytes).await.map_err(|_| ())?;
    stdin.flush().await.map_err(|_| ())
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

    #[test]
    fn codex_fallback_keeps_every_current_model_family() {
        let codex = builtin_models(&ProviderId::Codex);
        for family in [
            "gpt-5.6-sol",
            "gpt-5.6-terra",
            "gpt-5.6-luna",
            "gpt-5.5",
            "gpt-5.4",
            "gpt-5.4-mini",
            "gpt-5.3-codex-spark",
        ] {
            assert!(
                codex.iter().any(|model| model.id.starts_with(family)),
                "missing {family} from the pre-session Codex picker"
            );
        }
    }

    #[test]
    fn codex_live_catalog_expands_efforts_and_omits_hidden_models() {
        let choices = parse_codex_models(&serde_json::json!({
            "data": [
                {
                    "id": "frontier",
                    "displayName": "Frontier",
                    "description": "Current model.",
                    "supportedReasoningEfforts": [
                        { "reasoningEffort": "low", "description": "Fast" },
                        { "reasoningEffort": "high", "description": "Deep" }
                    ]
                },
                {
                    "id": "hidden",
                    "displayName": "Hidden",
                    "hidden": true,
                    "supportedReasoningEfforts": []
                }
            ]
        }))
        .expect("valid model/list response");

        assert_eq!(choices.len(), 2);
        assert_eq!(choices[0].id, "frontier[low]");
        assert_eq!(choices[0].name, "Frontier (Low)");
        assert_eq!(choices[1].id, "frontier[high]");
        assert!(choices.iter().all(|model| !model.id.starts_with("hidden")));
    }
}
