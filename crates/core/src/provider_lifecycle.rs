//! Durable provider enablement and the reviewed install/upgrade recipes exposed by the UI.
//!
//! Renderer input chooses only a provider id and an action. Executables, package names, URLs and
//! flags remain fixed here so the plugin bridge never becomes an arbitrary process launcher.

use crate::provider::{which, Provider};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderLifecycleAction {
    Install,
    Upgrade,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderLifecycleStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub install_supported: bool,
    pub upgrade_supported: bool,
    pub launch_mode: ProviderLaunchMode,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderLaunchMode {
    Installed,
    OnDemand,
    Unavailable,
}

#[derive(Debug, Clone)]
struct ProviderRecipe {
    id: &'static str,
    executable: &'static str,
    version_args: &'static [&'static str],
    install: Option<&'static [&'static str]>,
    upgrade: Option<&'static [&'static str]>,
    managed_launch_args: Option<&'static [&'static str]>,
    requirements: &'static [&'static str],
}

#[cfg(not(windows))]
const CURSOR_INSTALL: Option<&[&str]> = Some(&[
    "/bin/sh",
    "-c",
    "curl https://cursor.com/install -fsS | bash",
]);
#[cfg(windows)]
const CURSOR_INSTALL: Option<&[&str]> = None;

const RECIPES: &[ProviderRecipe] = &[
    ProviderRecipe {
        id: "claude_code",
        executable: "claude-agent-acp",
        version_args: &["--version"],
        install: Some(&[
            "npm",
            "install",
            "--global",
            "@agentclientprotocol/claude-agent-acp@latest",
        ]),
        upgrade: Some(&[
            "npm",
            "install",
            "--global",
            "@agentclientprotocol/claude-agent-acp@latest",
        ]),
        managed_launch_args: Some(&[]),
        requirements: &[],
    },
    ProviderRecipe {
        id: "codex",
        executable: "codex-acp",
        version_args: &["--version"],
        install: Some(&[
            "npm",
            "install",
            "--global",
            "@agentclientprotocol/codex-acp@latest",
        ]),
        upgrade: Some(&[
            "npm",
            "install",
            "--global",
            "@agentclientprotocol/codex-acp@latest",
        ]),
        managed_launch_args: Some(&[]),
        requirements: &[],
    },
    ProviderRecipe {
        id: "grok",
        executable: "grok",
        version_args: &["--version"],
        install: Some(&["npm", "install", "--global", "grok-dev@latest"]),
        upgrade: Some(&["grok", "update"]),
        managed_launch_args: None,
        requirements: &[],
    },
    ProviderRecipe {
        id: "cursor",
        executable: "cursor-agent",
        version_args: &["--version"],
        install: CURSOR_INSTALL,
        upgrade: Some(&["cursor-agent", "update"]),
        managed_launch_args: None,
        requirements: &[],
    },
    ProviderRecipe {
        id: "opencode",
        executable: "opencode",
        version_args: &["--version"],
        install: Some(&["npm", "install", "--global", "opencode-ai@latest"]),
        upgrade: Some(&["opencode", "upgrade"]),
        managed_launch_args: None,
        requirements: &[],
    },
    ProviderRecipe {
        id: "opencode2",
        executable: "opencode2",
        version_args: &["--version"],
        install: Some(&["npm", "install", "--global", "@opencode-ai/cli@beta"]),
        upgrade: Some(&["npm", "install", "--global", "@opencode-ai/cli@beta"]),
        managed_launch_args: None,
        requirements: &[],
    },
    ProviderRecipe {
        id: "pi",
        executable: "pi-acp",
        version_args: &["--version"],
        install: Some(&[
            "npm",
            "install",
            "--global",
            "@earendil-works/pi-coding-agent@latest",
            "pi-acp@latest",
        ]),
        upgrade: Some(&[
            "npm",
            "install",
            "--global",
            "@earendil-works/pi-coding-agent@latest",
            "pi-acp@latest",
        ]),
        managed_launch_args: Some(&[]),
        requirements: &["pi"],
    },
    ProviderRecipe {
        id: "kimi",
        executable: "kimi",
        version_args: &["--version"],
        install: Some(&[
            "npm",
            "install",
            "--global",
            "@moonshot-ai/kimi-code@latest",
        ]),
        upgrade: Some(&[
            "npm",
            "install",
            "--global",
            "@moonshot-ai/kimi-code@latest",
        ]),
        managed_launch_args: None,
        requirements: &[],
    },
    ProviderRecipe {
        id: "zcode",
        executable: "glm-acp-agent",
        version_args: &["--version"],
        install: Some(&["npm", "install", "--global", "glm-acp-agent@latest"]),
        upgrade: Some(&["npm", "install", "--global", "glm-acp-agent@latest"]),
        managed_launch_args: Some(&[]),
        requirements: &[],
    },
];

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProviderLifecycleState {
    schema_version: u8,
    #[serde(default)]
    enabled: HashMap<String, bool>,
}

impl Default for ProviderLifecycleState {
    fn default() -> Self {
        Self {
            schema_version: 1,
            enabled: HashMap::new(),
        }
    }
}

#[derive(Clone)]
pub struct ProviderLifecycleManager {
    data_dir: PathBuf,
    state_path: PathBuf,
    state: Arc<Mutex<ProviderLifecycleState>>,
}

impl ProviderLifecycleManager {
    pub fn open(data_dir: impl Into<PathBuf>) -> Self {
        let data_dir = data_dir.into();
        let state_path = data_dir.join("provider-settings.json");
        let state = load_state(&state_path);
        Self {
            data_dir,
            state_path,
            state: Arc::new(Mutex::new(state)),
        }
    }

    pub fn enabled(&self, provider_id: &str) -> Result<bool, String> {
        recipe(provider_id)?;
        Ok(self
            .state
            .lock()
            .unwrap()
            .enabled
            .get(provider_id)
            .copied()
            .unwrap_or(true))
    }

    pub fn set_enabled(&self, provider_id: &str, enabled: bool) -> Result<(), String> {
        recipe(provider_id)?;
        let mut state = self.state.lock().unwrap();
        let mut next = state.clone();
        next.enabled.insert(provider_id.to_string(), enabled);
        save_state(&self.data_dir, &self.state_path, &next)?;
        *state = next;
        Ok(())
    }

    pub async fn status(&self, provider: &Provider) -> ProviderLifecycleStatus {
        let Some(recipe) = RECIPES.iter().find(|item| item.id == provider.id.as_str()) else {
            let available = provider.is_available();
            return ProviderLifecycleStatus {
                installed: available,
                version: None,
                install_supported: false,
                upgrade_supported: false,
                launch_mode: if available {
                    ProviderLaunchMode::Installed
                } else {
                    ProviderLaunchMode::Unavailable
                },
            };
        };
        let installed_path = which(recipe.executable);
        let requirements_ready = recipe
            .requirements
            .iter()
            .all(|command| which(command).is_some());
        let on_demand_ready = which(&provider.launch.command).is_some() && requirements_ready;
        let installed = installed_path.is_some();
        let version = match installed_path {
            Some(path) => command_version(&path, recipe.version_args).await,
            None => None,
        };
        ProviderLifecycleStatus {
            installed,
            version,
            install_supported: !installed
                && recipe
                    .install
                    .is_some_and(|command| which(command[0]).is_some()),
            upgrade_supported: installed
                && recipe
                    .upgrade
                    .is_some_and(|command| which(command[0]).is_some()),
            launch_mode: if installed && requirements_ready {
                ProviderLaunchMode::Installed
            } else if on_demand_ready {
                ProviderLaunchMode::OnDemand
            } else {
                ProviderLaunchMode::Unavailable
            },
        }
    }

    /// Prefer reviewed, directly installed ACP adapters over on-demand wrappers when a recipe
    /// explicitly declares that both launch the same endpoint.
    pub fn prepare_registry(&self, mut providers: Vec<Provider>) -> Vec<Provider> {
        for provider in &mut providers {
            let Some(recipe) = RECIPES.iter().find(|item| item.id == provider.id.as_str()) else {
                continue;
            };
            let Some(args) = recipe.managed_launch_args else {
                continue;
            };
            if !recipe.requirements.iter().all(|item| which(item).is_some()) {
                continue;
            }
            if let Some(executable) = which(recipe.executable) {
                provider.launch.command = executable.to_string_lossy().into_owned();
                provider.launch.args = args.iter().map(|value| (*value).to_string()).collect();
                provider.needs_node = false;
            }
        }
        providers
    }

    pub async fn apply(
        &self,
        provider_id: &str,
        action: ProviderLifecycleAction,
    ) -> Result<(), String> {
        let recipe = recipe(provider_id)?;
        let provider = crate::provider::default_registry()
            .into_iter()
            .find(|provider| provider.id.as_str() == provider_id)
            .ok_or_else(|| format!("unknown provider {provider_id:?}"))?;
        let status = self.status(&provider).await;
        match action {
            ProviderLifecycleAction::Install if status.installed => {
                return Err(format!("{} is already installed", provider.display_name));
            }
            ProviderLifecycleAction::Upgrade if !status.installed => {
                return Err(format!("{} is not installed", provider.display_name));
            }
            _ => {}
        }
        let command = match action {
            ProviderLifecycleAction::Install => recipe.install,
            ProviderLifecycleAction::Upgrade => recipe.upgrade,
        }
        .ok_or_else(|| {
            let operation = match action {
                ProviderLifecycleAction::Install => "automatic installation",
                ProviderLifecycleAction::Upgrade => "automatic upgrades",
            };
            format!("{} does not support {operation}", provider.display_name)
        })?;
        let executable = which(command[0]).ok_or_else(|| {
            format!(
                "{} is required to manage {}",
                command[0], provider.display_name
            )
        })?;
        let output = tokio::time::timeout(
            Duration::from_secs(10 * 60),
            Command::new(executable).args(&command[1..]).output(),
        )
        .await
        .map_err(|_| format!("provider command timed out after 10 minutes"))?
        .map_err(|error| error.to_string())?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let detail = if stderr.trim().is_empty() {
                stdout.trim()
            } else {
                stderr.trim()
            };
            return Err(if detail.is_empty() {
                format!("provider command exited with {}", output.status)
            } else {
                detail
                    .chars()
                    .rev()
                    .take(4_000)
                    .collect::<String>()
                    .chars()
                    .rev()
                    .collect()
            });
        }
        crate::provider::augment_search_path();
        Ok(())
    }
}

fn recipe(provider_id: &str) -> Result<&'static ProviderRecipe, String> {
    RECIPES
        .iter()
        .find(|recipe| recipe.id == provider_id)
        .ok_or_else(|| format!("unknown provider {provider_id:?}"))
}

async fn command_version(executable: &Path, args: &[&str]) -> Option<String> {
    let output = tokio::time::timeout(
        Duration::from_secs(6),
        Command::new(executable).args(args).output(),
    )
    .await
    .ok()?
    .ok()?;
    if !output.status.success() {
        return None;
    }
    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    parse_provider_version(&combined)
}

pub fn parse_provider_version(output: &str) -> Option<String> {
    output.split_whitespace().find_map(|token| {
        let token = token
            .trim_matches(|character: char| {
                !character.is_ascii_alphanumeric() && !matches!(character, '.' | '-' | '+')
            })
            .strip_prefix('v')
            .unwrap_or(token);
        let numeric = token.split(['-', '+']).next().unwrap_or(token);
        let parts = numeric.split('.').collect::<Vec<_>>();
        (parts.len() >= 2
            && parts.len() <= 4
            && parts
                .iter()
                .all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit())))
        .then(|| token.to_string())
    })
}

fn load_state(path: &Path) -> ProviderLifecycleState {
    let Ok(bytes) = fs::read(path) else {
        return ProviderLifecycleState::default();
    };
    let Ok(mut state) = serde_json::from_slice::<ProviderLifecycleState>(&bytes) else {
        return ProviderLifecycleState::default();
    };
    if state.schema_version != 1 {
        return ProviderLifecycleState::default();
    }
    state
        .enabled
        .retain(|id, _| RECIPES.iter().any(|recipe| recipe.id == id));
    state
}

fn save_state(data_dir: &Path, path: &Path, state: &ProviderLifecycleState) -> Result<(), String> {
    fs::create_dir_all(data_dir).map_err(|error| error.to_string())?;
    let temporary = path.with_extension(format!("{}.tmp", std::process::id()));
    let bytes = serde_json::to_vec_pretty(state).map_err(|error| error.to_string())?;
    let mut bytes_with_newline = bytes;
    bytes_with_newline.push(b'\n');
    fs::write(&temporary, bytes_with_newline).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(0o600))
            .map_err(|error| error.to_string())?;
    }
    fs::rename(&temporary, path).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_only_semver_shaped_provider_versions() {
        assert_eq!(
            parse_provider_version("codex-acp v1.6.2\n"),
            Some("1.6.2".into())
        );
        assert_eq!(
            parse_provider_version("tool 2.0.0-beta.1"),
            Some("2.0.0-beta.1".into())
        );
        assert_eq!(parse_provider_version("version unknown"), None);
        assert_eq!(parse_provider_version("build 7"), None);
    }

    #[test]
    fn every_builtin_provider_has_a_reviewed_recipe() {
        let ids = crate::provider::default_registry()
            .into_iter()
            .map(|provider| provider.id.as_str().to_string())
            .collect::<Vec<_>>();
        assert_eq!(ids.len(), RECIPES.len());
        assert!(ids.iter().all(|id| recipe(id).is_ok()));
    }

    #[test]
    fn enablement_is_durable_and_unknown_providers_fail_closed() {
        let directory = tempfile::tempdir().unwrap();
        let manager = ProviderLifecycleManager::open(directory.path());
        assert!(manager.enabled("codex").unwrap());

        manager.set_enabled("codex", false).unwrap();
        assert!(!manager.enabled("codex").unwrap());
        assert!(!ProviderLifecycleManager::open(directory.path())
            .enabled("codex")
            .unwrap());
        assert!(manager.set_enabled("not-a-provider", true).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn cursor_does_not_offer_the_unix_installer_on_windows() {
        assert!(recipe("cursor").unwrap().install.is_none());
    }
}
