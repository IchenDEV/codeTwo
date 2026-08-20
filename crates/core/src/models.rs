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
static GROK_MODELS: OnceLock<Vec<ModelChoice>> = OnceLock::new();
static CURSOR_MODELS: OnceLock<Vec<ModelChoice>> = OnceLock::new();
static OPENCODE_MODELS: OnceLock<Vec<ModelChoice>> = OnceLock::new();

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
        // Claude Code owns these aliases and resolves them to the current model in each tier. Keep
        // the fallback alias-based; the adapter reports the account's exact catalogue and each
        // model's exact effort ladder once the ACP session starts.
        ProviderId::ClaudeCode => vec![
            choice(
                "default",
                "Default",
                Some("Claude Code resolves the account default"),
            ),
            choice(
                "best",
                "Best available",
                Some("Claude Code chooses the strongest available model"),
            ),
            choice("fable", "Claude Fable", Some("Latest Fable alias")),
            choice("opus", "Claude Opus", Some("Latest Opus alias")),
            choice(
                "opus[1m]",
                "Claude Opus 1M",
                Some("Latest Opus alias, 1M context"),
            ),
            choice(
                "opusplan",
                "Claude Opus Plan",
                Some("Opus for planning, Sonnet for execution"),
            ),
            choice("sonnet", "Claude Sonnet", Some("Latest Sonnet alias")),
            choice(
                "sonnet[1m]",
                "Claude Sonnet 1M",
                Some("Latest Sonnet alias, 1M context"),
            ),
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
        // These CLIs are queried live by `available_models`; the entries below are conservative
        // fallbacks for a transient catalogue failure, not claims about the user's account.
        ProviderId::Grok => vec![choice(
            "grok-4.6",
            "Grok 4.6",
            Some("Current Grok CLI default"),
        )],
        ProviderId::Cursor => vec![choice(
            "auto",
            "Auto",
            Some("Cursor selects a model available to this account"),
        )],
        // OpenCode and Pi catalogues are entirely account/configuration-owned. Inventing a global
        // fallback here is worse than showing the honest “start a session / configure the CLI”
        // state; both ACP adapters report the real list once a session exists.
        ProviderId::OpenCode | ProviderId::Pi => Vec::new(),
        ProviderId::Kimi => vec![
            choice("kimi-code/k3", "Kimi K3", Some("Managed Kimi Code alias")),
            choice(
                "kimi-code/kimi-for-coding",
                "Kimi for Coding",
                Some("Managed Kimi Code alias"),
            ),
            choice(
                "kimi-code/kimi-for-coding-highspeed",
                "Kimi for Coding Highspeed",
                Some("Managed Kimi Code alias"),
            ),
        ],
        // Kept in lock-step with the glm-acp-agent package we launch. The agent replaces this with
        // its own model/config-option response after session/new.
        ProviderId::ZCode => vec![
            choice("glm-5.3", "GLM-5.3", Some("Default, 1M context")),
            choice("glm-5-turbo", "GLM-5 Turbo", Some("Faster, 128K context")),
            choice("glm-4.7", "GLM-4.7", None),
        ],
        ProviderId::Custom(_) => Vec::new(),
    }
}

/// Resolve the model list shown before an ACP session exists. Prefer each installed CLI's live,
/// account-specific catalogue wherever it exposes one; static entries are fallback aliases only.
pub async fn available_models(provider: &Provider) -> Vec<ModelChoice> {
    let queried = match provider.id {
        ProviderId::Codex => {
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
            match executable {
                Some(executable) => query_codex_models(executable).await,
                None => Err(()),
            }
            .map(|models| (models, &CODEX_MODELS))
        }
        ProviderId::Grok => query_cli_catalog(provider, &["models"], parse_grok_models)
            .await
            .map(|models| (models, &GROK_MODELS)),
        ProviderId::Cursor => query_cli_catalog(provider, &["--list-models"], parse_cursor_models)
            .await
            .map(|models| (models, &CURSOR_MODELS)),
        ProviderId::OpenCode => query_cli_catalog(provider, &["models"], parse_opencode_models)
            .await
            .map(|models| (models, &OPENCODE_MODELS)),
        _ => return builtin_models(&provider.id),
    };

    match queried {
        Ok((models, cache)) if !models.is_empty() => {
            let _ = cache.set(models.clone());
            models
        }
        _ => builtin_models(&provider.id),
    }
}

async fn query_cli_catalog(
    provider: &Provider,
    args: &[&str],
    parse: fn(&str) -> Vec<ModelChoice>,
) -> Result<Vec<ModelChoice>, ()> {
    let cache = match provider.id {
        ProviderId::Grok => GROK_MODELS.get(),
        ProviderId::Cursor => CURSOR_MODELS.get(),
        ProviderId::OpenCode => OPENCODE_MODELS.get(),
        _ => None,
    };
    if let Some(models) = cache {
        return Ok(models.clone());
    }
    let executable = which(&provider.launch.command).ok_or(())?;
    let mut command = Command::new(executable);
    command
        .args(args)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    let output = tokio::time::timeout(Duration::from_secs(8), command.output())
        .await
        .map_err(|_| ())?
        .map_err(|_| ())?;
    if !output.status.success() {
        return Err(());
    }
    let stdout = String::from_utf8(output.stdout).map_err(|_| ())?;
    Ok(parse(&stdout))
}

fn parse_cursor_models(stdout: &str) -> Vec<ModelChoice> {
    stdout
        .lines()
        .filter_map(|line| {
            let (id, raw_name) = line.trim().split_once(" - ")?;
            if id.is_empty() || raw_name.is_empty() {
                return None;
            }
            let name = raw_name.strip_suffix(" (default)").unwrap_or(raw_name);
            Some(choice(id, name, None))
        })
        .collect()
}

fn parse_opencode_models(stdout: &str) -> Vec<ModelChoice> {
    stdout
        .lines()
        .map(str::trim)
        .filter(|line| {
            !line.is_empty() && line.contains('/') && !line.contains(char::is_whitespace)
        })
        .map(|id| choice(id, id, None))
        .collect()
}

fn parse_grok_models(stdout: &str) -> Vec<ModelChoice> {
    stdout
        .lines()
        .filter_map(|line| {
            let item = line.trim().strip_prefix('*')?.trim();
            let id = item.split_whitespace().next()?;
            (!id.is_empty()).then(|| choice(id, id, None))
        })
        .collect()
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
    fn only_account_owned_catalogues_have_no_static_list() {
        for p in crate::provider::default_registry() {
            let empty_is_expected = matches!(p.id, ProviderId::OpenCode | ProviderId::Pi);
            assert_eq!(
                builtin_models(&p.id).is_empty(),
                empty_is_expected,
                "unexpected fallback policy for {}",
                p.display_name
            );
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
    fn claude_fallback_uses_current_release_independent_aliases() {
        let claude = builtin_models(&ProviderId::ClaudeCode);
        for alias in [
            "default",
            "best",
            "fable",
            "opus",
            "opus[1m]",
            "opusplan",
            "sonnet",
            "sonnet[1m]",
            "haiku",
        ] {
            assert!(
                claude.iter().any(|model| model.id == alias),
                "missing Claude Code alias {alias}"
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

    #[test]
    fn cursor_catalog_keeps_account_ids_and_removes_only_default_marker() {
        let choices = parse_cursor_models(
            "Available models\n\nauto - Auto (default)\ngpt-5.6-sol-high - GPT-5.6 Sol 1M High\n",
        );
        assert_eq!(choices.len(), 2);
        assert_eq!(choices[0].id, "auto");
        assert_eq!(choices[0].name, "Auto");
        assert_eq!(choices[1].id, "gpt-5.6-sol-high");
        assert_eq!(choices[1].name, "GPT-5.6 Sol 1M High");
    }

    #[test]
    fn opencode_catalog_accepts_only_provider_model_ids() {
        let choices =
            parse_opencode_models("opencode/big-pickle\nopenai/gpt-5.6\nnot a model id\n");
        assert_eq!(
            choices
                .iter()
                .map(|model| model.id.as_str())
                .collect::<Vec<_>>(),
            ["opencode/big-pickle", "openai/gpt-5.6",]
        );
    }

    #[test]
    fn grok_catalog_reads_the_cli_bullet_list() {
        let choices = parse_grok_models(
            "Default model: grok-4.6\n\nAvailable models:\n  * grok-4.6 (default)\n",
        );
        assert_eq!(choices.len(), 1);
        assert_eq!(choices[0].id, "grok-4.6");
    }
}
