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
    Pi,
    Kimi,
    ZCode,
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
            ProviderId::Pi => "pi",
            ProviderId::Kimi => "kimi",
            ProviderId::ZCode => "zcode",
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
/// - Kimi Code: speaks ACP natively too (`kimi acp`).
/// - Pi: community ACP adapter via npx (pi itself has no ACP mode yet).
/// - ZCode: the GLM ACP agent via npx (ZCode ships only a desktop app).
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
        // Pi has no ACP mode of its own yet, so we go through the community adapter, which embeds
        // pi's own SDK. It still wants `pi` on PATH for its config and credentials.
        Provider {
            id: ProviderId::Pi,
            display_name: "Pi".into(),
            launch: LaunchSpec::new("npx", ["-y", "pi-acp"]),
            needs_node: true,
        },
        // Kimi Code CLI speaks ACP natively: `kimi acp` prints no banner and waits for `initialize`.
        Provider {
            id: ProviderId::Kimi,
            display_name: "Kimi".into(),
            launch: LaunchSpec::new("kimi", ["acp"]),
            needs_node: false,
        },
        // Z.ai's ZCode is a desktop app, not a CLI — it's an ACP *client*, so there's nothing for us
        // to drive. What we drive instead is the GLM ACP agent (the one Zed lists), which talks to
        // the same GLM Coding Plan endpoint; it wants `Z_AI_API_KEY` or its own `--setup` login.
        Provider {
            id: ProviderId::ZCode,
            display_name: "ZCode (GLM)".into(),
            launch: LaunchSpec::new("npx", ["-y", "glm-acp-agent"]),
            needs_node: true,
        },
    ]
}

/// Directories a login shell puts on `PATH` but a GUI-launched app doesn't. macOS hands a bundle
/// started from Finder or Spotlight the bare `/usr/bin:/bin:/usr/sbin:/sbin`, so Homebrew, cargo,
/// and friends are invisible — every CLI we shell out to looks "not installed".
const GUI_PATH_FALLBACKS: [&str; 5] =
    ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin", "~/.local/bin", "~/.cargo/bin"];

/// Append the directories above to this process's `PATH`, once, if they exist and aren't already
/// there. Child processes inherit it, so this fixes both [`which`] and anything we spawn.
///
/// Call it early in `main`/setup. Appending (not prepending) keeps an explicitly configured `PATH`
/// authoritative when the app *was* launched from a shell.
pub fn augment_search_path() {
    let current = std::env::var_os("PATH").unwrap_or_default();
    let mut dirs: Vec<PathBuf> = std::env::split_paths(&current).collect();
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut added = false;
    for entry in GUI_PATH_FALLBACKS {
        let dir = match entry.strip_prefix("~/") {
            Some(rest) => match &home {
                Some(h) => h.join(rest),
                None => continue,
            },
            None => PathBuf::from(entry),
        };
        if dir.is_dir() && !dirs.contains(&dir) {
            dirs.push(dir);
            added = true;
        }
    }
    if added {
        if let Ok(joined) = std::env::join_paths(dirs) {
            // Call this before spawning threads that read the environment.
            std::env::set_var("PATH", joined);
        }
    }
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
    fn augmenting_the_path_is_additive_and_idempotent() {
        // Only ever appends, so running it can't cost us a directory we already had.
        let before: Vec<_> = std::env::split_paths(&std::env::var_os("PATH").unwrap()).collect();
        augment_search_path();
        let once: Vec<_> = std::env::split_paths(&std::env::var_os("PATH").unwrap()).collect();
        assert!(before.iter().all(|d| once.contains(d)));
        augment_search_path();
        let twice: Vec<_> = std::env::split_paths(&std::env::var_os("PATH").unwrap()).collect();
        assert_eq!(once, twice, "second call must not duplicate entries");
    }

    #[test]
    fn registry_has_all_providers() {
        let reg = default_registry();
        assert_eq!(reg.len(), 8);
        assert!(reg.iter().any(|p| p.id == ProviderId::Grok && !p.needs_node));
        assert!(reg.iter().any(|p| p.id == ProviderId::ClaudeCode && p.needs_node));
        assert!(reg.iter().any(|p| p.id == ProviderId::Cursor));
        assert!(reg.iter().any(|p| p.id == ProviderId::OpenCode));
        assert!(reg.iter().any(|p| p.id == ProviderId::Pi && p.needs_node));
        assert!(reg.iter().any(|p| p.id == ProviderId::Kimi && !p.needs_node));
        assert!(reg.iter().any(|p| p.id == ProviderId::ZCode && p.needs_node));
    }

    #[test]
    fn grok_launch_is_native_acp() {
        let reg = default_registry();
        let grok = reg.iter().find(|p| p.id == ProviderId::Grok).unwrap();
        assert_eq!(grok.launch.command, "grok");
        assert_eq!(grok.launch.args, vec!["agent", "stdio"]);
    }

    #[test]
    fn kimi_launch_is_native_acp() {
        let reg = default_registry();
        let kimi = reg.iter().find(|p| p.id == ProviderId::Kimi).unwrap();
        assert_eq!(kimi.launch.command, "kimi");
        assert_eq!(kimi.launch.args, vec!["acp"]);
    }

    #[test]
    fn provider_ids_are_distinct() {
        // The id string is the wire form the desktop and TUI parse back — a collision would silently
        // route sessions to the wrong CLI.
        let reg = default_registry();
        let ids: std::collections::HashSet<_> = reg.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids.len(), reg.len());
    }
}
