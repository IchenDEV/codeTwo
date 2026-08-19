//! The command registry — plugin-contributed app surface.
//!
//! This is the piece cordis does not need and we do. A C2 frontend does not call Rust
//! functions; it calls *names* (`git.status`, `memory.list`) across a Tauri IPC boundary, a
//! WebSocket, or a TUI keybinding. If those names live in a hand-maintained dispatch table, then
//! adding a feature means editing the middle of the app — which is precisely the coupling the
//! plugin model exists to remove.
//!
//! So commands are registered on a [`Context`](crate::Context), owned by its scope, and dispatched
//! by name through [`Context::call`](crate::Context::call). Unloading the plugin removes them; the
//! bridge learns nothing new. `JSON in, JSON out` is the price of being callable from four
//! runtimes.

use crate::error::PluginError;
use crate::event::BoxFuture;
use crate::runtime::ScopeId;
use serde_json::Value;
use std::sync::Arc;

#[allow(clippy::type_complexity)]
pub type CommandHandler =
    Arc<dyn Fn(Value) -> BoxFuture<'static, Result<Value, PluginError>> + Send + Sync>;

pub(crate) struct CommandEntry {
    pub scope: ScopeId,
    pub handler: CommandHandler,
    pub description: Option<String>,
}

/// A registered command, for introspection (`plugins.commands`, docs, a palette).
#[derive(Debug, Clone, serde::Serialize)]
pub struct CommandInfo {
    pub name: String,
    /// The plugin that contributed it.
    pub plugin: String,
    pub scope: ScopeId,
    pub description: Option<String>,
}
