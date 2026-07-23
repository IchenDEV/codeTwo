//! Provider registry.
//!
//! Each provider is a coding CLI we drive over ACP. We don't reimplement any agent logic —
//! we just spawn the CLI (or its ACP adapter) as a subprocess and speak ACP over its stdio.
//! This mirrors Zed's `agent_servers` model: a launch spec (`command`, `args`, `env`) per backend.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Identifies a provider. `Custom` lets users register their own ACP-speaking command.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderId {
    ClaudeCode,
    Codex,
    Grok,
    Cursor,
    OpenCode,
    Custom(String),
}

impl ProviderId {
    pub fn as_str(&self) -> &str {
        match self {
            ProviderId::ClaudeCode => "claude_code",
            ProviderId::Codex => "codex",
            ProviderId::Grok => "grok",
            ProviderId::Cursor => "cursor",
            ProviderId::OpenCode => "opencode",
            ProviderId::Custom(s) => s,
        }
    }
}

/// How to launch a provider's ACP endpoint as a subprocess.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchSpec {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: Vec<(String, String)>,
    #[serde(default)]
    pub cwd: Option<String>,
}

impl LaunchSpec {
    pub fn new(command: impl Into<String>, args: impl IntoIterator<Item = &'static str>) -> Self {
        Self {
            command: command.into(),
            args: args.into_iter().map(|s| s.to_string()).collect(),
            env: Vec::new(),
            cwd: None,
        }
    }
}

/// A registered provider: its identity plus how to launch it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: ProviderId,
    pub display_name: String,
    pub launch: LaunchSpec,
    /// Whether launching this provider requires Node/npx on PATH (Claude Code & Codex adapters do).
    pub needs_node: bool,
}

impl Provider {
    /// Best-effort check that the launch command resolves on PATH. Used for the startup
    /// "provider health" panel so a missing CLI is a clear, actionable state — not a hard crash.
    pub fn is_available(&self) -> bool {
        which(&self.launch.command).is_some()
    }
}

/// The three providers from the plan, wired from the start (see plan decision "all three").
///
/// - Claude Code: official ACP adapter via npx (richest ACP surface).
/// - Codex: official Rust ACP adapter via npx (npm wrapper fetches the platform binary).
/// - Grok Build: speaks ACP natively (`grok agent stdio`) — no adapter needed.
pub fn default_registry() -> Vec<Provider> {
    vec![
        Provider {
            id: ProviderId::ClaudeCode,
            display_name: "Claude Code".into(),
            launch: LaunchSpec::new("npx", ["-y", "@agentclientprotocol/claude-agent-acp"]),
            needs_node: true,
        },
        Provider {
            id: ProviderId::Codex,
            display_name: "OpenAI Codex".into(),
            launch: LaunchSpec::new("npx", ["-y", "@zed-industries/codex-acp"]),
            needs_node: true,
        },
        Provider {
            id: ProviderId::Grok,
            display_name: "Grok".into(),
            launch: LaunchSpec::new("grok", ["agent", "stdio"]),
            needs_node: false,
        },
        // Cursor & OpenCode also speak ACP (as in t3code). Exact adapter flags may need tuning per
        // install; both are user-overridable in config.
        Provider {
            id: ProviderId::Cursor,
            display_name: "Cursor".into(),
            launch: LaunchSpec::new("cursor-agent", ["--acp"]),
            needs_node: false,
        },
        Provider {
            id: ProviderId::OpenCode,
            display_name: "OpenCode".into(),
            launch: LaunchSpec::new("opencode", ["acp"]),
            needs_node: false,
        },
    ]
}

/// Minimal `which`: resolve an executable name against `$PATH` (or treat a path-like arg directly).
pub fn which(cmd: &str) -> Option<PathBuf> {
    if cmd.contains('/') {
        let p = PathBuf::from(cmd);
        return if p.is_file() { Some(p) } else { None };
    }
    let paths = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&paths) {
        let candidate = dir.join(cmd);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_has_all_providers() {
        let reg = default_registry();
        assert_eq!(reg.len(), 5);
        assert!(reg.iter().any(|p| p.id == ProviderId::Grok && !p.needs_node));
        assert!(reg.iter().any(|p| p.id == ProviderId::ClaudeCode && p.needs_node));
        assert!(reg.iter().any(|p| p.id == ProviderId::Cursor));
        assert!(reg.iter().any(|p| p.id == ProviderId::OpenCode));
    }

    #[test]
    fn grok_launch_is_native_acp() {
        let reg = default_registry();
        let grok = reg.iter().find(|p| p.id == ProviderId::Grok).unwrap();
        assert_eq!(grok.launch.command, "grok");
        assert_eq!(grok.launch.args, vec!["agent", "stdio"]);
    }
}
