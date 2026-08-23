//! JSON-RPC adapter for the provider-neutral Bun Tool Broker.
//!
//! This module deliberately owns no backend brands, config parsing, selection rules, or routing
//! policy. ElectronBun calls the same broker in-process; TUI/server cross this narrow subprocess
//! boundary and consume its immutable ToolPlan wire format.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::env;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::provider::{which, ProviderId, ProviderToolset};

const BUILTIN_PROVIDER_IDS: [&str; 8] = [
    "claude_code",
    "codex",
    "grok",
    "cursor",
    "opencode",
    "pi",
    "kimi",
    "zcode",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ComputerUseBackendOption {
    pub id: String,
    pub display_name: String,
    pub available: bool,
    pub reason: Option<String>,
    pub providers: Vec<String>,
    pub exclude_providers: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct ComputerUseSettings {
    pub selections: BTreeMap<String, String>,
    pub backends: Vec<ComputerUseBackendOption>,
    pub errors: Vec<String>,
}

pub type BrowserUseBackendOption = ComputerUseBackendOption;
pub type BrowserUseSettings = ComputerUseSettings;

#[derive(Debug, Clone, Default, Deserialize)]
struct BrokerCatalog {
    computer_use: ComputerUseSettings,
    browser_use: BrowserUseSettings,
}

#[derive(Debug, Clone, Deserialize)]
struct BrokerSnapshot {
    catalog: BrokerCatalog,
    plans: HashMap<String, ProviderToolset>,
}

#[derive(Debug, Clone)]
struct BrokerCommand {
    program: PathBuf,
    args: Vec<String>,
}

impl BrokerCommand {
    fn locate() -> Result<Self, String> {
        if let Some(path) = env::var_os("CODETWO_TOOL_BROKER").filter(|value| !value.is_empty()) {
            return Ok(Self {
                program: PathBuf::from(path),
                args: Vec::new(),
            });
        }

        if let Ok(executable) = env::current_exe() {
            let sibling =
                executable
                    .parent()
                    .unwrap_or_else(|| Path::new("."))
                    .join(if cfg!(windows) {
                        "codetwo-tool-broker.exe"
                    } else {
                        "codetwo-tool-broker"
                    });
            if sibling.is_file() {
                return Ok(Self {
                    program: sibling,
                    args: Vec::new(),
                });
            }
        }

        if let Some(program) = which("codetwo-tool-broker") {
            return Ok(Self {
                program,
                args: Vec::new(),
            });
        }

        let source = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../apps/desktop/src/electrobun/toolBrokerRpc.ts");
        if source.is_file() {
            if let Some(program) = which("bun") {
                return Ok(Self {
                    program,
                    args: vec![source.to_string_lossy().into_owned()],
                });
            }
        }

        Err("Tool Broker was not found. Put codetwo-tool-broker beside this binary, on PATH, or set CODETWO_TOOL_BROKER.".into())
    }

    fn call<T: for<'de> Deserialize<'de>>(&self, method: &str, params: Value) -> Result<T, String> {
        let mut child = Command::new(&self.program)
            .args(&self.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("could not start Tool Broker: {error}"))?;
        let request = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        });
        child
            .stdin
            .take()
            .ok_or_else(|| "Tool Broker stdin was not available".to_string())?
            .write_all(request.to_string().as_bytes())
            .map_err(|error| format!("could not write Tool Broker request: {error}"))?;
        let output = child
            .wait_with_output()
            .map_err(|error| format!("could not read Tool Broker response: {error}"))?;
        let response: RpcResponse = serde_json::from_slice(&output.stdout).map_err(|error| {
            let stderr = String::from_utf8_lossy(&output.stderr);
            format!("Tool Broker returned invalid JSON: {error}; stderr: {stderr}")
        })?;
        if let Some(error) = response.error {
            return Err(error.message);
        }
        let result = response
            .result
            .ok_or_else(|| "Tool Broker response had no result".to_string())?;
        serde_json::from_value(result)
            .map_err(|error| format!("Tool Broker result did not match the wire contract: {error}"))
    }
}

#[derive(Debug, Deserialize)]
struct RpcResponse {
    result: Option<Value>,
    error: Option<RpcError>,
}

#[derive(Debug, Deserialize)]
struct RpcError {
    message: String,
}

/// Startup snapshot used by the Rust core. All decisions were already made by the Bun broker.
#[derive(Debug, Clone)]
pub struct HostToolDiscovery {
    data_dir: PathBuf,
    command: Option<BrokerCommand>,
    catalog: BrokerCatalog,
    plans: HashMap<String, ProviderToolset>,
}

impl HostToolDiscovery {
    pub fn detect(data_dir: impl AsRef<Path>) -> Self {
        let data_dir = data_dir.as_ref().to_path_buf();
        let command = BrokerCommand::locate();
        let (command, catalog, plans) = match command {
            Ok(command) => {
                let snapshot = command.call::<BrokerSnapshot>(
                    "tool.snapshot",
                    json!({
                        "data_dir": data_dir,
                        "provider_ids": BUILTIN_PROVIDER_IDS,
                    }),
                );
                match snapshot {
                    Ok(snapshot) => (Some(command), snapshot.catalog, snapshot.plans),
                    Err(error) => (Some(command), failed_catalog(error), HashMap::new()),
                }
            }
            Err(error) => (None, failed_catalog(error), HashMap::new()),
        };
        Self {
            data_dir,
            command,
            catalog,
            plans,
        }
    }

    pub fn computer_use_settings(&self) -> ComputerUseSettings {
        self.catalog.computer_use.clone()
    }

    pub fn browser_use_settings(&self) -> BrowserUseSettings {
        self.catalog.browser_use.clone()
    }

    pub fn select_computer_use_backend(
        data_dir: impl AsRef<Path>,
        provider: &str,
        backend: &str,
    ) -> Result<ComputerUseSettings, String> {
        let catalog = select(data_dir.as_ref(), "computer_use", Some(provider), backend)?;
        Ok(catalog.computer_use)
    }

    pub fn select_browser_use_backend(
        data_dir: impl AsRef<Path>,
        backend: &str,
    ) -> Result<BrowserUseSettings, String> {
        let catalog = select(data_dir.as_ref(), "browser_use", None, backend)?;
        Ok(catalog.browser_use)
    }

    pub fn toolset(&self, provider: &ProviderId) -> ProviderToolset {
        if let Some(plan) = self.plans.get(provider.as_str()) {
            return plan.clone();
        }
        let Some(command) = &self.command else {
            return ProviderToolset::default();
        };
        command
            .call(
                "tool.resolve",
                json!({
                    "data_dir": self.data_dir,
                    "provider_id": provider.as_str(),
                }),
            )
            .unwrap_or_default()
    }
}

fn select(
    data_dir: &Path,
    kind: &str,
    provider: Option<&str>,
    backend: &str,
) -> Result<BrokerCatalog, String> {
    let mut params = json!({
        "data_dir": data_dir,
        "kind": kind,
        "backend_id": backend,
    });
    if let Some(provider) = provider {
        params["provider_id"] = json!(provider);
    }
    BrokerCommand::locate()?.call("selection.set", params)
}

fn failed_catalog(error: String) -> BrokerCatalog {
    let message = format!("Tool Broker unavailable: {error}");
    BrokerCatalog {
        computer_use: ComputerUseSettings {
            errors: vec![message.clone()],
            ..ComputerUseSettings::default()
        },
        browser_use: BrowserUseSettings {
            errors: vec![message],
            ..BrowserUseSettings::default()
        },
    }
}
