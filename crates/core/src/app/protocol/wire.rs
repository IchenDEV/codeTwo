//! The Code2 Plugin Protocol wire types.
//!
//! JSON-RPC 2.0, newline-delimited, over the child's stdio — the same shape ACP already uses in
//! this codebase, for the same reason: it is boring, debuggable with `cat`, and implementable in
//! any language in an afternoon.
//!
//! Field names are camelCase to match ACP and MCP, so a plugin author moving between the three is
//! not fighting three conventions.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The version this host implements. Major must match; a plugin declaring a newer minor is fine
/// (it may use methods we ignore), an older minor is fine too (we simply do not call them).
pub const PROTOCOL_VERSION: &str = "1.0.0";

/// Who is asking. Given to the plugin at `initialize` so it can adapt to the host it landed in.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostInfo {
    pub name: String,
    pub version: String,
    /// Every command the host offers right now. A plugin can call any of them back.
    #[serde(default)]
    pub commands: Vec<String>,
}

/// `initialize` — host → plugin, always first.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeParams {
    pub protocol_version: String,
    pub host: HostInfo,
    /// This plugin's config from the loader, verbatim.
    pub config: Value,
    /// A private directory the plugin may write to. Created before the process starts.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_dir: Option<String>,
}

/// What a plugin declares it contributes.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeResult {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub protocol_version: String,
    #[serde(default)]
    pub description: Option<String>,
    /// Commands the host should register on this plugin's behalf. They disappear the moment the
    /// plugin unloads, because they belong to its scope like any other registration.
    #[serde(default)]
    pub commands: Vec<CommandSpec>,
    /// Event names the plugin wants forwarded to it.
    #[serde(default)]
    pub events: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandSpec {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    /// JSON Schema for the arguments, if the plugin wants a generated form or docs.
    #[serde(default)]
    pub schema: Option<Value>,
}

/// `command/invoke` — either direction. The host calls a plugin's command; the plugin calls a
/// host command with the same message.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvokeParams {
    pub name: String,
    #[serde(default)]
    pub args: Value,
}

/// `event/emit` — either direction, a notification.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventParams {
    pub name: String,
    #[serde(default)]
    pub payload: Value,
}

/// `log` — plugin → host, a notification. Routed into the host's tracing output so a plugin's
/// diagnostics land where every other diagnostic does.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogParams {
    #[serde(default = "default_level")]
    pub level: String,
    pub message: String,
}

fn default_level() -> String {
    "info".into()
}

/// True when a plugin's declared version is one this host can talk to.
pub fn version_is_compatible(declared: &str) -> bool {
    // An empty declaration means "whatever you are" — tolerated, since the handshake itself
    // already proves they speak this protocol.
    if declared.trim().is_empty() {
        return true;
    }
    major(declared) == major(PROTOCOL_VERSION)
}

fn major(version: &str) -> &str {
    version.split('.').next().unwrap_or(version)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compatibility_is_by_major_version() {
        assert!(version_is_compatible("1.0.0"));
        assert!(version_is_compatible("1.4.2"), "a newer minor is still us");
        assert!(
            version_is_compatible(""),
            "an unversioned plugin is tolerated"
        );
        assert!(!version_is_compatible("2.0.0"));
        assert!(!version_is_compatible("0.9.0"));
    }
}
