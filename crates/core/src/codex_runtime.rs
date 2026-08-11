//! Read-only discovery of ChatGPT's signed local Codex runtime.
//!
//! CodeTwo never copies or modifies the host bundle or `config.toml`. A valid signed host may be
//! selected through `CODEX_PATH`; otherwise the pinned ACP adapter uses its own Codex dependency.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use toml::Value;

use crate::provider::{CapabilityState, ProviderCapability, ProviderCapabilityId};

pub const OPENAI_TEAM_ID: &str = "2DC432GLL2";
pub const CHATGPT_BUNDLE_ID: &str = "com.openai.codex";
pub const CUA_BUNDLE_ID: &str = "com.openai.sky.CUAService";
const VERIFIED_HOST_VERSIONS: &[&str] = &["26.803.41515"];

#[derive(Debug, Clone, Default)]
pub struct CodexRuntimeDiscovery {
    pub host_path: Option<PathBuf>,
    pub codex_path: Option<PathBuf>,
    pub host_version: Option<String>,
    pub codex_version: Option<String>,
    pub capabilities: Vec<ProviderCapability>,
}

impl CodexRuntimeDiscovery {
    pub fn detect() -> Self {
        let host_path = find_chatgpt();
        let evidence = match host_path {
            Some(host_path) => collect_evidence(host_path),
            None => HostEvidence::default(),
        };
        evaluate(evidence)
    }

    pub fn capability_projection(&self, codetwo_browser_ready: bool) -> Vec<ProviderCapability> {
        let mut capabilities = self.capabilities.clone();
        if let Some(capability) = capabilities
            .iter_mut()
            .find(|capability| capability.id == ProviderCapabilityId::CodetwoBrowser)
        {
            if codetwo_browser_ready {
                capability.state = CapabilityState::Ready;
                capability.reason = Some(
                    "CodeTwo's authenticated local Browser controller is ready; it is the default browser backend."
                        .into(),
                );
                capability.fix = None;
            }
        }
        capabilities
    }
}

#[derive(Debug, Clone)]
struct HostEvidence {
    host_path: Option<PathBuf>,
    host_signature: Option<SignatureInfo>,
    host_version: Option<String>,
    codex_path: Option<PathBuf>,
    codex_version: Option<String>,
    config: Result<ConfigEvidence, String>,
}

#[derive(Debug, Clone, Default)]
struct ConfigEvidence {
    computer_plugin: bool,
    browser_plugin: bool,
    chrome_plugin: bool,
    node_repl_path: Option<PathBuf>,
    browser_backends: Vec<String>,
    cua_path: Option<PathBuf>,
    cua_signature: Option<SignatureInfo>,
}

#[derive(Debug, Clone, Default)]
struct SignatureInfo {
    valid: bool,
    identifier: Option<String>,
    team_id: Option<String>,
}

impl Default for HostEvidence {
    fn default() -> Self {
        Self {
            host_path: None,
            host_signature: None,
            host_version: None,
            codex_path: None,
            codex_version: None,
            config: Ok(ConfigEvidence::default()),
        }
    }
}

fn evaluate(evidence: HostEvidence) -> CodexRuntimeDiscovery {
    let mut capabilities = vec![
        make_capability(
            ProviderCapabilityId::ImageGeneration,
            CapabilityState::Ready,
            None,
            "Image generation is carried by the pinned Codex ACP event stream and does not require the ChatGPT host.",
            None,
        ),
        make_capability(
            ProviderCapabilityId::ComputerUse,
            CapabilityState::Unavailable,
            None,
            "A verified ChatGPT host and Computer Use service were not found.",
            Some("Install or repair ChatGPT and its Computer Use plugin, then restart CodeTwo."),
        ),
        make_capability(
            ProviderCapabilityId::ChromeBrowser,
            CapabilityState::Unavailable,
            None,
            "A verified ChatGPT host and Chrome plugin were not found.",
            Some("Install the OpenAI Chrome plugin and extension, then restart CodeTwo."),
        ),
        make_capability(
            ProviderCapabilityId::CodetwoBrowser,
            CapabilityState::Unavailable,
            None,
            "CodeTwo Browser is available only in the macOS desktop runtime.",
            Some("Open this provider in CodeTwo Desktop."),
        ),
    ];

    let Some(host_path) = evidence.host_path else {
        return CodexRuntimeDiscovery {
            capabilities,
            ..Default::default()
        };
    };
    let signature = evidence.host_signature.unwrap_or_default();
    let signed_host = signature.valid
        && signature.identifier.as_deref() == Some(CHATGPT_BUNDLE_ID)
        && signature.team_id.as_deref() == Some(OPENAI_TEAM_ID);
    if !signed_host {
        let reason = "ChatGPT was found but its signature, bundle id, or Team ID did not match the supported OpenAI host.";
        update_capability(
            &mut capabilities,
            ProviderCapabilityId::ComputerUse,
            CapabilityState::Unavailable,
            evidence.host_version.clone(),
            reason,
            Some("Reinstall ChatGPT from OpenAI, then restart CodeTwo."),
        );
        update_capability(
            &mut capabilities,
            ProviderCapabilityId::ChromeBrowser,
            CapabilityState::Unavailable,
            evidence.host_version.clone(),
            reason,
            Some("Reinstall ChatGPT from OpenAI, then restart CodeTwo."),
        );
        return CodexRuntimeDiscovery {
            host_path: Some(host_path),
            host_version: evidence.host_version,
            capabilities,
            ..Default::default()
        };
    }

    let version_state = if evidence
        .host_version
        .as_deref()
        .is_some_and(|version| VERIFIED_HOST_VERSIONS.contains(&version))
    {
        CapabilityState::Ready
    } else {
        CapabilityState::Unverified
    };
    let config = match evidence.config {
        Ok(config) => config,
        Err(error) => {
            for id in [
                ProviderCapabilityId::ComputerUse,
                ProviderCapabilityId::ChromeBrowser,
            ] {
                update_capability(
                    &mut capabilities,
                    id,
                    CapabilityState::Unavailable,
                    evidence.host_version.clone(),
                    &format!("Codex config could not be parsed: {error}"),
                    Some("Repair $CODEX_HOME/config.toml and restart CodeTwo; CodeTwo will not modify it."),
                );
            }
            return CodexRuntimeDiscovery {
                host_path: Some(host_path),
                codex_path: evidence.codex_path.filter(|path| path.is_file()),
                host_version: evidence.host_version,
                codex_version: evidence.codex_version,
                capabilities,
            };
        }
    };

    let node_ready = config.node_repl_path.as_deref().is_some_and(Path::is_file);
    let cua_signature = config.cua_signature.unwrap_or_default();
    let cua_ready = config.cua_path.as_deref().is_some_and(Path::exists)
        && cua_signature.valid
        && cua_signature.identifier.as_deref() == Some(CUA_BUNDLE_ID)
        && cua_signature.team_id.as_deref() == Some(OPENAI_TEAM_ID);
    if config.computer_plugin && node_ready && cua_ready {
        update_capability(
            &mut capabilities,
            ProviderCapabilityId::ComputerUse,
            version_state,
            evidence.host_version.clone(),
            if version_state == CapabilityState::Ready {
                "The signed OpenAI Computer Use service and node_repl runtime are configured."
            } else {
                "The signed Computer Use service is present, but this ChatGPT host version is outside CodeTwo's verified range."
            },
            (version_state == CapabilityState::Unverified)
                .then_some("Update CodeTwo or use the verified ChatGPT build for stable support."),
        );
    } else {
        update_capability(
            &mut capabilities,
            ProviderCapabilityId::ComputerUse,
            CapabilityState::Unavailable,
            evidence.host_version.clone(),
            "Computer Use is disabled or its signed service/node_repl path is missing or invalid.",
            Some("Enable the Computer Use plugin in ChatGPT, repair its local runtime, then restart CodeTwo."),
        );
    }

    let chrome_ready = config.chrome_plugin
        && config.browser_plugin
        && node_ready
        && config
            .browser_backends
            .iter()
            .any(|backend| backend == "chrome");
    if chrome_ready {
        update_capability(
            &mut capabilities,
            ProviderCapabilityId::ChromeBrowser,
            CapabilityState::Unverified,
            evidence.host_version.clone(),
            "The OpenAI Browser/Chrome runtime is configured; extension connectivity is verified on the first real call.",
            Some("If the first call fails, open Chrome and reconnect the OpenAI extension."),
        );
    } else {
        update_capability(
            &mut capabilities,
            ProviderCapabilityId::ChromeBrowser,
            CapabilityState::Unavailable,
            evidence.host_version.clone(),
            "The Browser/Chrome plugins, chrome backend, or node_repl runtime are missing.",
            Some("Enable the Browser and Chrome plugins, install the extension, then restart CodeTwo."),
        );
    }

    CodexRuntimeDiscovery {
        host_path: Some(host_path),
        codex_path: evidence.codex_path.filter(|path| path.is_file()),
        host_version: evidence.host_version,
        codex_version: evidence.codex_version,
        capabilities,
    }
}

fn make_capability(
    id: ProviderCapabilityId,
    state: CapabilityState,
    version: Option<String>,
    reason: &str,
    fix: Option<&str>,
) -> ProviderCapability {
    ProviderCapability {
        id,
        state,
        version,
        experimental: true,
        reason: Some(reason.into()),
        fix: fix.map(str::to_string),
    }
}

fn update_capability(
    capabilities: &mut [ProviderCapability],
    id: ProviderCapabilityId,
    state: CapabilityState,
    version: Option<String>,
    reason: &str,
    fix: Option<&str>,
) {
    if let Some(entry) = capabilities
        .iter_mut()
        .find(|capability| capability.id == id)
    {
        *entry = make_capability(id, state, version, reason, fix);
    }
}

fn collect_evidence(host_path: PathBuf) -> HostEvidence {
    let host_signature = signature(&host_path);
    let host_version = plist_value(
        &host_path.join("Contents/Info.plist"),
        "CFBundleShortVersionString",
    );
    let codex_path = host_path.join("Contents/Resources/codex");
    let codex_version = executable_version(&codex_path);
    let config = read_config().and_then(|mut config| {
        config.cua_signature = config.cua_path.as_deref().map(signature);
        Ok(config)
    });
    HostEvidence {
        host_path: Some(host_path),
        host_signature: Some(host_signature),
        host_version,
        codex_path: codex_path.is_file().then_some(codex_path),
        codex_version,
        config,
    }
}

fn read_config() -> Result<ConfigEvidence, String> {
    let home = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".codex")))
        .ok_or_else(|| "CODEX_HOME and HOME are unset".to_string())?;
    let text = fs::read_to_string(home.join("config.toml")).map_err(|error| error.to_string())?;
    let value: Value = toml::from_str(&text).map_err(|error| error.to_string())?;
    let plugin = |name: &str| {
        value
            .get("plugins")
            .and_then(|plugins| plugins.get(name))
            .and_then(|plugin| plugin.get("enabled"))
            .and_then(Value::as_bool)
            .unwrap_or(false)
    };
    let node = value
        .get("mcp_servers")
        .and_then(|servers| servers.get("node_repl"));
    let env = node.and_then(|node| node.get("env"));
    let path = |table: Option<&Value>, name: &str| {
        table
            .and_then(|table| table.get(name))
            .and_then(Value::as_str)
            .map(PathBuf::from)
    };
    let backends = env
        .and_then(|env| env.get("BROWSER_USE_AVAILABLE_BACKENDS"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect();
    Ok(ConfigEvidence {
        computer_plugin: plugin("computer-use@openai-bundled"),
        browser_plugin: plugin("browser@openai-bundled"),
        chrome_plugin: plugin("chrome@openai-bundled"),
        node_repl_path: path(node, "command"),
        browser_backends: backends,
        cua_path: path(env, "SKY_CUA_SERVICE_PATH"),
        cua_signature: None,
    })
}

#[cfg(target_os = "macos")]
fn find_chatgpt() -> Option<PathBuf> {
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::NSString;

    autoreleasepool(|_| {
        let workspace = NSWorkspace::sharedWorkspace();
        let identifier = NSString::from_str(CHATGPT_BUNDLE_ID);
        workspace
            .URLForApplicationWithBundleIdentifier(&identifier)
            .and_then(|url| url.path())
            .map(|path| PathBuf::from(path.to_string()))
    })
}

#[cfg(not(target_os = "macos"))]
fn find_chatgpt() -> Option<PathBuf> {
    None
}

fn signature(path: &Path) -> SignatureInfo {
    let valid = Command::new("/usr/bin/codesign")
        .args(["--verify", "--deep", "--strict"])
        .arg(path)
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    let output = Command::new("/usr/bin/codesign")
        .args(["-dv", "--verbose=4"])
        .arg(path)
        .output();
    let text = output
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stderr).into_owned())
        .unwrap_or_default();
    SignatureInfo {
        valid,
        identifier: line_value(&text, "Identifier="),
        team_id: line_value(&text, "TeamIdentifier="),
    }
}

fn line_value(text: &str, prefix: &str) -> Option<String> {
    text.lines()
        .find_map(|line| line.strip_prefix(prefix))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn plist_value(path: &Path, key: &str) -> Option<String> {
    let output = Command::new("/usr/libexec/PlistBuddy")
        .args(["-c", &format!("Print :{key}")])
        .arg(path)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn executable_version(path: &Path) -> Option<String> {
    let output = Command::new(path).arg("--version").output().ok()?;
    output.status.success().then(|| {
        let text = String::from_utf8_lossy(&output.stdout);
        text.trim()
            .strip_prefix("codex-cli ")
            .unwrap_or(text.trim())
            .to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_signature(id: &str) -> SignatureInfo {
        SignatureInfo {
            valid: true,
            identifier: Some(id.into()),
            team_id: Some(OPENAI_TEAM_ID.into()),
        }
    }

    fn ready_evidence() -> HostEvidence {
        HostEvidence {
            host_path: Some("/Applications/ChatGPT.app".into()),
            host_signature: Some(valid_signature(CHATGPT_BUNDLE_ID)),
            host_version: Some(VERIFIED_HOST_VERSIONS[0].into()),
            codex_path: Some("/Applications/ChatGPT.app/Contents/Resources/codex".into()),
            codex_version: Some("0.147.0".into()),
            config: Ok(ConfigEvidence {
                computer_plugin: true,
                browser_plugin: true,
                chrome_plugin: true,
                node_repl_path: Some(std::env::current_exe().unwrap()),
                browser_backends: vec!["chrome".into(), "iab".into()],
                cua_path: Some(std::env::current_exe().unwrap()),
                cua_signature: Some(valid_signature(CUA_BUNDLE_ID)),
            }),
        }
    }

    #[test]
    fn missing_host_keeps_native_imagegen_and_fallback() {
        let discovery = evaluate(HostEvidence::default());
        assert!(discovery.codex_path.is_none());
        assert_eq!(discovery.capabilities[0].state, CapabilityState::Ready);
        assert_eq!(
            discovery.capabilities[1].state,
            CapabilityState::Unavailable
        );
    }

    #[test]
    fn bad_host_signature_never_selects_private_runtime() {
        let mut evidence = ready_evidence();
        evidence.host_signature = Some(valid_signature("example.tampered"));
        let discovery = evaluate(evidence);
        assert!(discovery.codex_path.is_none());
        assert_eq!(
            discovery.capabilities[1].state,
            CapabilityState::Unavailable
        );
    }

    #[test]
    fn unknown_host_version_is_explicitly_unverified() {
        let mut evidence = ready_evidence();
        evidence.host_version = Some("99.0".into());
        let discovery = evaluate(evidence);
        assert!(discovery.codex_path.is_some());
        assert_eq!(discovery.capabilities[1].state, CapabilityState::Unverified);
        assert_eq!(discovery.capabilities[2].state, CapabilityState::Unverified);
    }

    #[test]
    fn corrupt_config_does_not_disable_image_generation() {
        let mut evidence = ready_evidence();
        evidence.config = Err("bad TOML".into());
        let discovery = evaluate(evidence);
        assert_eq!(discovery.capabilities[0].state, CapabilityState::Ready);
        assert_eq!(
            discovery.capabilities[1].state,
            CapabilityState::Unavailable
        );
    }
}
