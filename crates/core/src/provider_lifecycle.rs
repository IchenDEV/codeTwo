//! Durable provider enablement and the reviewed install/upgrade recipes exposed by the UI.
//!
//! Renderer input chooses only a provider id and an action. Executables, package names, URLs and
//! flags remain fixed here so the plugin bridge never becomes an arbitrary process launcher.

use crate::provider::{which, Provider};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
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
    pub latest_version: Option<String>,
    pub update_available: Option<bool>,
    pub check_error: Option<String>,
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

/// User-authored launch metadata. Values of forwarded environment variables deliberately never
/// enter this document: only their names are durable, and the current host value is copied when a
/// Provider process is prepared.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderRuntimeOverride {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub home_path: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub forwarded_environment: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderRuntimeConfiguration {
    pub display_name: Option<String>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub home_path: Option<String>,
    pub home_environment: Option<String>,
    pub forwarded_environment: Vec<String>,
    pub missing_environment: Vec<String>,
    pub effective_command: String,
    pub effective_args: Vec<String>,
}

#[derive(Debug, Clone)]
struct ProviderRecipe {
    id: &'static str,
    executable: &'static str,
    version_args: &'static [&'static str],
    install: Option<&'static [&'static str]>,
    upgrade: Option<&'static [&'static str]>,
    latest_package: Option<&'static str>,
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
        latest_package: Some("@agentclientprotocol/claude-agent-acp"),
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
        latest_package: Some("@agentclientprotocol/codex-acp"),
        managed_launch_args: Some(&[]),
        requirements: &[],
    },
    ProviderRecipe {
        id: "grok",
        executable: "grok",
        version_args: &["--version"],
        install: Some(&["npm", "install", "--global", "grok-dev@latest"]),
        upgrade: Some(&["grok", "update"]),
        latest_package: Some("grok-dev"),
        managed_launch_args: None,
        requirements: &[],
    },
    ProviderRecipe {
        id: "cursor",
        executable: "cursor-agent",
        version_args: &["--version"],
        install: CURSOR_INSTALL,
        upgrade: Some(&["cursor-agent", "update"]),
        latest_package: None,
        managed_launch_args: None,
        requirements: &[],
    },
    ProviderRecipe {
        id: "opencode",
        executable: "opencode",
        version_args: &["--version"],
        install: Some(&["npm", "install", "--global", "opencode-ai@latest"]),
        upgrade: Some(&["opencode", "upgrade"]),
        latest_package: Some("opencode-ai"),
        managed_launch_args: None,
        requirements: &[],
    },
    ProviderRecipe {
        id: "opencode2",
        executable: "opencode2",
        version_args: &["--version"],
        install: Some(&["npm", "install", "--global", "@opencode-ai/cli@beta"]),
        upgrade: Some(&["npm", "install", "--global", "@opencode-ai/cli@beta"]),
        latest_package: Some("@opencode-ai/cli@beta"),
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
        latest_package: Some("pi-acp"),
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
        latest_package: Some("@moonshot-ai/kimi-code"),
        managed_launch_args: None,
        requirements: &[],
    },
    ProviderRecipe {
        id: "zcode",
        executable: "glm-acp-agent",
        version_args: &["--version"],
        install: Some(&["npm", "install", "--global", "glm-acp-agent@latest"]),
        upgrade: Some(&["npm", "install", "--global", "glm-acp-agent@latest"]),
        latest_package: Some("glm-acp-agent"),
        managed_launch_args: Some(&[]),
        requirements: &[],
    },
    ProviderRecipe {
        id: "amp",
        executable: "amp-acp",
        version_args: &["--version"],
        install: Some(&["npm", "install", "--global", "amp-acp@latest"]),
        upgrade: Some(&["npm", "install", "--global", "amp-acp@latest"]),
        latest_package: Some("amp-acp"),
        managed_launch_args: Some(&[]),
        requirements: &["amp"],
    },
    ProviderRecipe {
        id: "droid",
        executable: "droid",
        version_args: &["--version"],
        install: Some(&["npm", "install", "--global", "droid"]),
        upgrade: Some(&["droid", "upgrade"]),
        latest_package: Some("droid"),
        managed_launch_args: None,
        requirements: &[],
    },
];

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProviderLifecycleState {
    schema_version: u8,
    #[serde(default)]
    enabled: HashMap<String, bool>,
    #[serde(default)]
    runtime: HashMap<String, ProviderRuntimeOverride>,
}

impl Default for ProviderLifecycleState {
    fn default() -> Self {
        Self {
            schema_version: 1,
            enabled: HashMap::new(),
            runtime: HashMap::new(),
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

    pub fn set_runtime_configuration(
        &self,
        provider_id: &str,
        configuration: ProviderRuntimeOverride,
    ) -> Result<(), String> {
        recipe(provider_id)?;
        let configuration = validate_runtime_configuration(provider_id, configuration)?;
        let mut state = self.state.lock().unwrap();
        let mut next = state.clone();
        if configuration == ProviderRuntimeOverride::default() {
            next.runtime.remove(provider_id);
        } else {
            next.runtime.insert(provider_id.to_string(), configuration);
        }
        save_state(&self.data_dir, &self.state_path, &next)?;
        *state = next;
        Ok(())
    }

    pub fn runtime_configuration(
        &self,
        provider: &Provider,
    ) -> Result<ProviderRuntimeConfiguration, String> {
        recipe(provider.id.as_str())?;
        let configured = self
            .state
            .lock()
            .unwrap()
            .runtime
            .get(provider.id.as_str())
            .cloned()
            .unwrap_or_default();
        let missing_environment = configured
            .forwarded_environment
            .iter()
            .filter(|name| std::env::var_os(name).is_none())
            .cloned()
            .collect();
        Ok(ProviderRuntimeConfiguration {
            display_name: configured.display_name,
            command: configured.command,
            args: configured.args,
            home_path: configured.home_path,
            home_environment: provider_home_environment(provider.id.as_str()).map(str::to_string),
            forwarded_environment: configured.forwarded_environment,
            missing_environment,
            effective_command: provider.launch.command.clone(),
            effective_args: provider.launch.args.clone(),
        })
    }

    pub async fn status(&self, provider: &Provider, check_latest: bool) -> ProviderLifecycleStatus {
        let Some(recipe) = RECIPES.iter().find(|item| item.id == provider.id.as_str()) else {
            let available = provider.is_available();
            return ProviderLifecycleStatus {
                installed: available,
                version: None,
                latest_version: None,
                update_available: None,
                check_error: None,
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
        let (latest_version, check_error) = if check_latest && installed && recipe.upgrade.is_some()
        {
            match latest_provider_version(recipe).await {
                Ok(latest) => (Some(latest), None),
                Err(error) => (None, Some(error)),
            }
        } else {
            (None, None)
        };
        let update_available = match (&version, &latest_version) {
            (Some(current), Some(latest)) => compare_provider_versions(latest, current)
                .map(|ordering| ordering == Ordering::Greater),
            _ => None,
        };
        ProviderLifecycleStatus {
            installed,
            version,
            latest_version,
            update_available,
            check_error,
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
        let configured = self.state.lock().unwrap().runtime.clone();
        for provider in &mut providers {
            let Some(configuration) = configured.get(provider.id.as_str()) else {
                continue;
            };
            if let Some(display_name) = &configuration.display_name {
                provider.display_name = display_name.clone();
            }
            if let Some(command) = &configuration.command {
                provider.launch.command = expand_home(command);
            }
            if let Some(args) = &configuration.args {
                provider.launch.args = args.clone();
            }
            for name in &configuration.forwarded_environment {
                if let Some(value) = std::env::var_os(name) {
                    set_launch_environment(
                        &mut provider.launch.env,
                        name,
                        value.to_string_lossy().into_owned(),
                    );
                }
            }
            if let (Some(variable), Some(path)) = (
                provider_home_environment(provider.id.as_str()),
                configuration.home_path.as_deref(),
            ) {
                set_launch_environment(&mut provider.launch.env, variable, expand_home(path));
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
        let status = self.status(&provider, false).await;
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

async fn latest_provider_version(recipe: &ProviderRecipe) -> Result<String, String> {
    let (program, args): (&str, Vec<&str>) = if recipe.id == "cursor" {
        ("curl", vec!["-fsS", "https://cursor.com/install"])
    } else {
        let package = recipe
            .latest_package
            .ok_or_else(|| "provider has no latest-version source".to_string())?;
        ("npm", vec!["view", package, "version", "--json"])
    };
    let executable = which(program).ok_or_else(|| format!("{program} is not available"))?;
    let output = tokio::time::timeout(
        Duration::from_secs(10),
        Command::new(executable)
            .args(args)
            .env("NPM_CONFIG_UPDATE_NOTIFIER", "false")
            .output(),
    )
    .await
    .map_err(|_| format!("{program} version check timed out"))?
    .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(format!(
            "{program} version check exited with {}",
            output.status
        ));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    if recipe.id == "cursor" {
        cursor_installer_version(&text)
            .ok_or_else(|| "Cursor installer did not expose a version".to_string())
    } else {
        parse_provider_version(&text)
            .ok_or_else(|| format!("{program} version check returned no version"))
    }
}

fn cursor_installer_version(script: &str) -> Option<String> {
    script.lines().find_map(|line| {
        let (_, tail) = line.split_once("/cursor-agent/versions/")?;
        let version = tail
            .trim_matches(|character: char| {
                matches!(character, '"' | '\'') || character.is_whitespace()
            })
            .split(['/', '"', '\'', '$'])
            .next()?;
        parse_provider_version(version)
    })
}

fn compare_provider_versions(latest: &str, current: &str) -> Option<Ordering> {
    let (latest_numbers, latest_prerelease) = comparable_version(latest)?;
    let (current_numbers, current_prerelease) = comparable_version(current)?;
    let width = latest_numbers.len().max(current_numbers.len());
    let mut latest_numbers = latest_numbers;
    let mut current_numbers = current_numbers;
    latest_numbers.resize(width, 0);
    current_numbers.resize(width, 0);
    match latest_numbers.cmp(&current_numbers) {
        Ordering::Equal => compare_prerelease(latest_prerelease, current_prerelease),
        ordering => Some(ordering),
    }
}

fn comparable_version(version: &str) -> Option<(Vec<u64>, Option<&str>)> {
    let version = version.trim_start_matches('v').split('+').next()?;
    let (release, prerelease) = match version.split_once('-') {
        Some((release, prerelease)) => (release, Some(prerelease)),
        None => (version, None),
    };
    let numbers = release
        .split('.')
        .map(str::parse::<u64>)
        .collect::<Result<Vec<_>, _>>()
        .ok()?;
    (!numbers.is_empty()).then_some((numbers, prerelease))
}

fn compare_prerelease(latest: Option<&str>, current: Option<&str>) -> Option<Ordering> {
    match (latest, current) {
        (None, None) => Some(Ordering::Equal),
        (None, Some(_)) => Some(Ordering::Greater),
        (Some(_), None) => Some(Ordering::Less),
        (Some(latest), Some(current)) => {
            let mut latest = latest.split('.');
            let mut current = current.split('.');
            loop {
                match (latest.next(), current.next()) {
                    (None, None) => return Some(Ordering::Equal),
                    (None, Some(_)) => return Some(Ordering::Less),
                    (Some(_), None) => return Some(Ordering::Greater),
                    (Some(latest), Some(current)) => {
                        let ordering = match (latest.parse::<u64>(), current.parse::<u64>()) {
                            (Ok(latest), Ok(current)) => latest.cmp(&current),
                            (Ok(_), Err(_)) => Ordering::Less,
                            (Err(_), Ok(_)) => Ordering::Greater,
                            (Err(_), Err(_)) => latest.cmp(current),
                        };
                        if ordering != Ordering::Equal {
                            return Some(ordering);
                        }
                    }
                }
            }
        }
    }
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

fn provider_home_environment(provider_id: &str) -> Option<&'static str> {
    match provider_id {
        "codex" => Some("CODEX_HOME"),
        "claude_code" => Some("CLAUDE_CONFIG_DIR"),
        _ => None,
    }
}

fn normalize_optional(
    value: Option<String>,
    field: &str,
    maximum: usize,
) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if value.len() > maximum || value.contains('\0') {
        return Err(format!("{field} is invalid or exceeds {maximum} bytes"));
    }
    Ok(Some(value.to_string()))
}

fn valid_environment_name(name: &str) -> bool {
    let mut characters = name.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    (first == '_' || first.is_ascii_alphabetic())
        && characters.all(|character| character == '_' || character.is_ascii_alphanumeric())
        && name.len() <= 128
}

fn validate_runtime_configuration(
    provider_id: &str,
    configuration: ProviderRuntimeOverride,
) -> Result<ProviderRuntimeOverride, String> {
    let display_name = normalize_optional(configuration.display_name, "display name", 80)?;
    let command = normalize_optional(configuration.command, "runtime command", 1_024)?;
    let home_path = normalize_optional(configuration.home_path, "config directory", 1_024)?;
    if home_path.is_some() && provider_home_environment(provider_id).is_none() {
        return Err(format!(
            "{provider_id} does not support a managed config directory"
        ));
    }
    let args = configuration
        .args
        .map(|args| {
            if args.len() > 64 {
                return Err("runtime arguments exceed 64 entries".to_string());
            }
            args.into_iter()
                .map(|argument| {
                    if argument.len() > 1_024 || argument.contains('\0') {
                        Err("a runtime argument is invalid or exceeds 1024 bytes".to_string())
                    } else {
                        Ok(argument)
                    }
                })
                .collect::<Result<Vec<_>, _>>()
        })
        .transpose()?;
    let mut seen = HashSet::new();
    let mut forwarded_environment = Vec::new();
    for name in configuration.forwarded_environment {
        let name = name.trim();
        if !valid_environment_name(name) {
            return Err(format!("invalid environment variable name {name:?}"));
        }
        if seen.insert(name.to_string()) {
            forwarded_environment.push(name.to_string());
        }
        if forwarded_environment.len() > 64 {
            return Err("forwarded environment exceeds 64 names".to_string());
        }
    }
    Ok(ProviderRuntimeOverride {
        display_name,
        command,
        args,
        home_path,
        forwarded_environment,
    })
}

fn expand_home(value: &str) -> String {
    if value == "~" {
        return std::env::var_os("HOME")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .map(|home| PathBuf::from(home).to_string_lossy().into_owned())
            .unwrap_or_else(|| value.to_string());
    }
    let Some(rest) = value
        .strip_prefix("~/")
        .or_else(|| value.strip_prefix("~\\"))
    else {
        return value.to_string();
    };
    let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) else {
        return value.to_string();
    };
    PathBuf::from(home)
        .join(rest)
        .to_string_lossy()
        .into_owned()
}

fn set_launch_environment(environment: &mut Vec<(String, String)>, name: &str, value: String) {
    if let Some(existing) = environment.iter_mut().find(|(key, _)| key == name) {
        existing.1 = value;
    } else {
        environment.push((name.to_string(), value));
    }
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
        .runtime
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
    fn compares_provider_versions_without_treating_prereleases_as_stable() {
        assert_eq!(
            compare_provider_versions("1.7.0", "1.6.2"),
            Some(Ordering::Greater)
        );
        assert_eq!(
            compare_provider_versions("1.6.2", "1.6.2"),
            Some(Ordering::Equal)
        );
        assert_eq!(
            compare_provider_versions("2.0.0-beta.2", "2.0.0-beta.1"),
            Some(Ordering::Greater)
        );
        assert_eq!(
            compare_provider_versions("2.0.0-beta.1", "2.0.0"),
            Some(Ordering::Less)
        );
    }

    #[test]
    fn reads_cursor_version_from_the_vendor_installer_url() {
        let script = r#"download="https://downloads.cursor.com/cursor-agent/versions/2026.08.1/darwin-arm64/cursor-agent""#;
        assert_eq!(cursor_installer_version(script), Some("2026.08.1".into()));
    }

    #[test]
    fn every_builtin_provider_has_a_reviewed_recipe() {
        let ids = crate::provider::default_registry()
            .into_iter()
            .map(|provider| provider.id.as_str().to_string())
            .collect::<Vec<_>>();
        assert_eq!(ids.len(), RECIPES.len());
        assert!(ids.iter().all(|id| recipe(id).is_ok()));
        assert!(RECIPES
            .iter()
            .all(|recipe| recipe.id == "cursor" || recipe.latest_package.is_some()));
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

    #[test]
    fn runtime_overrides_are_durable_validated_and_applied_without_environment_values() {
        let directory = tempfile::tempdir().unwrap();
        let manager = ProviderLifecycleManager::open(directory.path());
        manager
            .set_runtime_configuration(
                "codex",
                ProviderRuntimeOverride {
                    display_name: Some("  Codex Work  ".into()),
                    command: Some("~/bin/codex-acp".into()),
                    args: Some(vec!["--profile".into(), "work".into()]),
                    home_path: Some("~/.codex-work".into()),
                    forwarded_environment: vec![
                        "CODETWO_TEST_MISSING_ENV".into(),
                        "CODETWO_TEST_MISSING_ENV".into(),
                    ],
                },
            )
            .unwrap();

        let reopened = ProviderLifecycleManager::open(directory.path());
        let providers = reopened.prepare_registry(crate::provider::default_registry());
        let codex = providers
            .iter()
            .find(|provider| provider.id.as_str() == "codex")
            .unwrap();
        let configuration = reopened.runtime_configuration(codex).unwrap();

        assert_eq!(codex.display_name, "Codex Work");
        assert!(codex.launch.command.ends_with("/bin/codex-acp"));
        assert_eq!(codex.launch.args, ["--profile", "work"]);
        assert_eq!(
            configuration.home_environment.as_deref(),
            Some("CODEX_HOME")
        );
        assert_eq!(
            configuration.forwarded_environment,
            ["CODETWO_TEST_MISSING_ENV"]
        );
        assert_eq!(
            configuration.missing_environment,
            ["CODETWO_TEST_MISSING_ENV"]
        );
        assert!(codex
            .launch
            .env
            .iter()
            .any(|(name, value)| name == "CODEX_HOME" && value.ends_with("/.codex-work")));
        let persisted =
            fs::read_to_string(directory.path().join("provider-settings.json")).unwrap();
        assert!(persisted.contains("CODETWO_TEST_MISSING_ENV"));
        assert!(!persisted.contains("environment_value"));
    }

    #[test]
    fn runtime_overrides_reject_unknown_providers_unsafe_names_and_unsupported_homes() {
        let directory = tempfile::tempdir().unwrap();
        let manager = ProviderLifecycleManager::open(directory.path());
        assert!(manager
            .set_runtime_configuration("unknown", ProviderRuntimeOverride::default())
            .is_err());
        assert!(manager
            .set_runtime_configuration(
                "codex",
                ProviderRuntimeOverride {
                    forwarded_environment: vec!["BAD-NAME".into()],
                    ..ProviderRuntimeOverride::default()
                },
            )
            .is_err());
        assert!(manager
            .set_runtime_configuration(
                "grok",
                ProviderRuntimeOverride {
                    home_path: Some("~/.grok".into()),
                    ..ProviderRuntimeOverride::default()
                },
            )
            .is_err());
    }

    #[cfg(windows)]
    #[test]
    fn cursor_does_not_offer_the_unix_installer_on_windows() {
        assert!(recipe("cursor").unwrap().install.is_none());
    }
}
