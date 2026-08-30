//! Provider registry.
//!
//! Each provider is a coding CLI we drive over ACP. We don't reimplement any agent logic —
//! we just spawn the CLI (or its ACP adapter) as a subprocess and speak ACP over its stdio.
//! This mirrors Zed's `agent_servers` model: a launch spec (`command`, `args`, `env`) per backend.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::codex_runtime::CodexRuntimeDiscovery;
use crate::skill::McpServer;

/// Reviewed Codex ACP adapter combination. Updating this pin requires the live compatibility
/// canary in `crates/core/examples/codex_compatibility_canary.rs` to pass first.
pub const CODEX_ACP_PACKAGE: &str = "@agentclientprotocol/codex-acp";
pub const CODEX_ACP_VERSION: &str = "1.7.0";

pub fn codex_acp_package_spec() -> String {
    format!("{CODEX_ACP_PACKAGE}@{CODEX_ACP_VERSION}")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderCapabilityId {
    ImageGeneration,
    ComputerUse,
    ChromeBrowser,
    CodetwoBrowser,
    Sites,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityState {
    Ready,
    Unverified,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderCapability {
    pub id: ProviderCapabilityId,
    pub state: CapabilityState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(default)]
    pub experimental: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fix: Option<String>,
}

/// The complete host-tool projection for one provider.
///
/// ACP session creation consumes `mcp_servers`; provider selectors and diagnostics consume
/// `capabilities`. `native_capabilities` carries identifiers only so no private provider transport
/// can escape its adapter.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderToolset {
    /// Session-scoped authority for browser-control tools. Missing broker output denies access.
    #[serde(default)]
    pub browser_access_enabled: bool,
    #[serde(default)]
    pub capabilities: Vec<ProviderCapability>,
    #[serde(default)]
    pub native_capabilities: Vec<ProviderCapabilityId>,
    #[serde(default)]
    pub mcp_servers: Vec<McpServer>,
    #[serde(default)]
    pub instructions: Vec<String>,
}

/// Identifies a provider. `Custom` lets users register their own ACP-speaking command.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderId {
    ClaudeCode,
    Codex,
    Grok,
    Cursor,
    OpenCode,
    #[serde(rename = "opencode2")]
    OpenCode2,
    Pi,
    Kimi,
    ZCode,
    Amp,
    Droid,
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
            ProviderId::OpenCode2 => "opencode2",
            ProviderId::Pi => "pi",
            ProviderId::Kimi => "kimi",
            ProviderId::ZCode => "zcode",
            ProviderId::Amp => "amp",
            ProviderId::Droid => "droid",
            ProviderId::Custom(s) => s,
        }
    }

    /// Whether the built-in runtime or adapter exposes its own Agent/Task delegation tool.
    /// Unknown and custom providers fail closed until their native support is verified.
    pub fn supports_native_subagents(&self) -> bool {
        matches!(
            self,
            ProviderId::ClaudeCode
                | ProviderId::Codex
                | ProviderId::Cursor
                | ProviderId::OpenCode
                | ProviderId::OpenCode2
                | ProviderId::Kimi
                | ProviderId::Amp
                | ProviderId::Droid
        )
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

/// The built-in provider registry, covering agents that speak ACP over stdio.
///
/// - Claude Code: official ACP adapter via npx (richest ACP surface).
/// - Codex: maintained ACP adapter via npx, backed by the Codex App Server.
/// - Grok Build: speaks ACP natively (`grok agent stdio`) — no adapter needed.
/// - Kimi Code: speaks ACP natively too (`kimi acp`).
/// - Pi: community ACP adapter via npx (pi itself has no ACP mode yet).
/// - ZCode: the GLM ACP agent via npx (ZCode ships only a desktop app).
/// - Amp: community ACP adapter (`amp-acp`) bridges Sourcegraph's Amp CLI.
/// - Droid: Factory's CLI speaks ACP natively (`droid exec --output-format acp`).
pub fn default_registry() -> Vec<Provider> {
    registry_with_codex_runtime(&CodexRuntimeDiscovery::detect())
}

/// Build the registry from one startup-time discovery snapshot.
pub fn registry_with_codex_runtime(runtime: &CodexRuntimeDiscovery) -> Vec<Provider> {
    let mut codex_launch = LaunchSpec {
        command: "npx".into(),
        args: vec!["-y".into(), codex_acp_package_spec()],
        env: Vec::new(),
        cwd: None,
    };
    if let Some(path) = runtime.codex_path.as_deref() {
        codex_launch
            .env
            .push(("CODEX_PATH".into(), path.to_string_lossy().into_owned()));
    }
    vec![
        Provider {
            id: ProviderId::ClaudeCode,
            display_name: "Claude Code".into(),
            launch: LaunchSpec::new("npx", ["-y", "@agentclientprotocol/claude-agent-acp"]),
            needs_node: true,
        },
        Provider {
            id: ProviderId::Codex,
            display_name: "Codex".into(),
            launch: codex_launch,
            needs_node: true,
        },
        Provider {
            id: ProviderId::Grok,
            display_name: "Grok".into(),
            launch: LaunchSpec::new("grok", ["agent", "stdio"]),
            needs_node: false,
        },
        // Cursor and both OpenCode generations speak ACP natively. OpenCode 2 installs beside V1
        // under a different binary name, so keep separate provider ids rather than silently
        // changing which runtime an existing `opencode` session resumes with.
        Provider {
            id: ProviderId::Cursor,
            display_name: "Cursor".into(),
            launch: LaunchSpec::new("cursor-agent", ["acp"]),
            needs_node: false,
        },
        Provider {
            id: ProviderId::OpenCode,
            display_name: "OpenCode".into(),
            launch: LaunchSpec::new("opencode", ["acp"]),
            needs_node: false,
        },
        Provider {
            id: ProviderId::OpenCode2,
            display_name: "OpenCode 2 (Beta)".into(),
            launch: LaunchSpec::new("opencode2", ["acp"]),
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
        // Amp (Sourcegraph) has no native ACP mode; the community `amp-acp` adapter bridges its
        // streaming JSON CLI to ACP over stdio. Requires `amp` on PATH and `amp login`.
        Provider {
            id: ProviderId::Amp,
            display_name: "Amp".into(),
            launch: LaunchSpec::new("npx", ["-y", "amp-acp"]),
            needs_node: true,
        },
        // Factory Droid speaks ACP natively via `droid exec --output-format acp`. No adapter needed.
        Provider {
            id: ProviderId::Droid,
            display_name: "Droid".into(),
            launch: LaunchSpec::new("droid", ["exec", "--output-format", "acp"]),
            needs_node: false,
        },
    ]
}

/// Directories a login shell puts on `PATH` but a GUI-launched app doesn't. macOS hands a bundle
/// started from Finder or Spotlight the bare `/usr/bin:/bin:/usr/sbin:/sbin`, so Homebrew, cargo,
/// and friends are invisible — every CLI we shell out to looks "not installed".
const GUI_PATH_FALLBACKS: [&str; 8] = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/opt/local/bin",
    "~/.local/bin",
    "~/.cargo/bin",
    "~/.opencode/bin",
    "~/.amp/bin",
    "~/.factory/bin",
];

/// Resolve the current user's home directory on Unix and Windows hosts.
pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .filter(|value| !value.is_empty())
        .or_else(|| std::env::var_os("USERPROFILE").filter(|value| !value.is_empty()))
        .map(PathBuf::from)
}

/// Append the directories above to this process's `PATH`, once, if they exist and aren't already
/// there. Child processes inherit it, so this fixes both [`which`] and anything we spawn.
///
/// Call it early in `main`/setup. Appending (not prepending) keeps an explicitly configured `PATH`
/// authoritative when the app *was* launched from a shell.
pub fn augment_search_path() {
    let current = std::env::var_os("PATH").unwrap_or_default();
    let mut dirs: Vec<PathBuf> = std::env::split_paths(&current).collect();
    let home = home_dir();
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

fn existing_executable(path: &Path) -> Option<PathBuf> {
    if path.is_file() {
        return Some(path.to_path_buf());
    }
    #[cfg(windows)]
    if path.extension().is_none() {
        let extensions =
            std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string());
        for extension in extensions.split(';').filter(|value| !value.is_empty()) {
            let candidate = path.with_extension(extension.trim_start_matches('.'));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Minimal `which`: resolve an executable name against `PATH` and Windows `PATHEXT`, or treat a
/// path-like argument directly.
pub fn which(cmd: &str) -> Option<PathBuf> {
    if cmd.contains('/') || cmd.contains('\\') {
        return existing_executable(Path::new(cmd));
    }
    let paths = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&paths) {
        if let Some(candidate) = existing_executable(&dir.join(cmd)) {
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
        assert_eq!(reg.len(), 11);
        assert!(reg
            .iter()
            .any(|p| p.id == ProviderId::Grok && !p.needs_node));
        assert!(reg
            .iter()
            .any(|p| p.id == ProviderId::ClaudeCode && p.needs_node));
        let codex = reg.iter().find(|p| p.id == ProviderId::Codex).unwrap();
        assert_eq!(codex.display_name, "Codex");
        assert!(reg.iter().any(|p| p.id == ProviderId::Cursor));
        assert!(reg.iter().any(|p| p.id == ProviderId::OpenCode));
        assert!(reg.iter().any(|p| p.id == ProviderId::OpenCode2));
        assert!(reg.iter().any(|p| p.id == ProviderId::Pi && p.needs_node));
        assert!(reg
            .iter()
            .any(|p| p.id == ProviderId::Kimi && !p.needs_node));
        assert!(reg
            .iter()
            .any(|p| p.id == ProviderId::ZCode && p.needs_node));
        assert!(reg.iter().any(|p| p.id == ProviderId::Amp && p.needs_node));
        assert!(reg
            .iter()
            .any(|p| p.id == ProviderId::Droid && !p.needs_node));
    }

    #[cfg(windows)]
    #[test]
    fn resolves_and_runs_windows_pathext_shims() {
        let directory = tempfile::tempdir().unwrap();
        let shim = directory.path().join("npx.CMD");
        std::fs::write(&shim, "@echo off\r\necho shim-ready\r\n").unwrap();
        let resolved = existing_executable(&directory.path().join("npx")).unwrap();
        assert_eq!(resolved, shim);
        let output = std::process::Command::new(resolved).output().unwrap();
        assert!(output.status.success());
        assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "shim-ready");
    }

    #[test]
    fn grok_launch_is_native_acp() {
        let reg = default_registry();
        let grok = reg.iter().find(|p| p.id == ProviderId::Grok).unwrap();
        assert_eq!(grok.launch.command, "grok");
        assert_eq!(grok.launch.args, vec!["agent", "stdio"]);
    }

    #[test]
    fn codex_launch_uses_the_maintained_app_server_adapter() {
        let reg = default_registry();
        let codex = reg.iter().find(|p| p.id == ProviderId::Codex).unwrap();
        assert_eq!(
            codex.launch.args,
            vec!["-y".to_string(), codex_acp_package_spec()]
        );
    }

    #[test]
    fn kimi_launch_is_native_acp() {
        let reg = default_registry();
        let kimi = reg.iter().find(|p| p.id == ProviderId::Kimi).unwrap();
        assert_eq!(kimi.launch.command, "kimi");
        assert_eq!(kimi.launch.args, vec!["acp"]);
    }

    #[test]
    fn native_subagent_support_fails_closed() {
        for provider in [
            ProviderId::ClaudeCode,
            ProviderId::Codex,
            ProviderId::Cursor,
            ProviderId::OpenCode,
            ProviderId::OpenCode2,
            ProviderId::Kimi,
            ProviderId::Amp,
            ProviderId::Droid,
        ] {
            assert!(provider.supports_native_subagents(), "{provider:?}");
        }
        for provider in [
            ProviderId::Grok,
            ProviderId::Pi,
            ProviderId::ZCode,
            ProviderId::Custom("custom".into()),
        ] {
            assert!(!provider.supports_native_subagents(), "{provider:?}");
        }
    }

    #[test]
    fn opencode_generations_have_distinct_native_acp_launches() {
        let reg = default_registry();
        let v1 = reg.iter().find(|p| p.id == ProviderId::OpenCode).unwrap();
        let v2 = reg.iter().find(|p| p.id == ProviderId::OpenCode2).unwrap();
        assert_eq!(v1.launch.command, "opencode");
        assert_eq!(v1.launch.args, vec!["acp"]);
        assert_eq!(v2.launch.command, "opencode2");
        assert_eq!(v2.launch.args, vec!["acp"]);
        assert_eq!(
            serde_json::to_string(&ProviderId::OpenCode2).unwrap(),
            "\"opencode2\""
        );
        assert_eq!(
            serde_json::from_str::<ProviderId>("\"opencode2\"").unwrap(),
            ProviderId::OpenCode2
        );
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
