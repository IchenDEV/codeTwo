//! Kernel errors. Two layers, deliberately: [`KernelError`] is what the *kernel* refuses to do,
//! [`PluginError`] is what a *plugin* failed at. A failed plugin is a normal, recoverable state —
//! its scope goes [`crate::Status::Failed`] and the rest of the graph keeps running.

use std::fmt;

/// Something the kernel itself rejected.
#[derive(Debug, thiserror::Error)]
pub enum KernelError {
    /// Two plugins tried to provide the same service name in the same realm. Cordis warns and
    /// keeps the first; we refuse, because a silently shadowed service is a bug you find later.
    #[error("service `{0}` is already provided in this realm")]
    ServiceConflict(String),
    /// A plugin tried to register a command name another plugin already owns.
    #[error("command `{0}` is already registered")]
    CommandConflict(String),
    #[error("no command named `{0}`")]
    UnknownCommand(String),
    /// The command ran and refused. `message` is the plugin's own wording.
    #[error("{name}: {message}")]
    Command { name: String, message: String },
    /// The scope was disposed while the operation was in flight.
    #[error("scope is disposed")]
    Disposed,
    #[error("no plugin named `{0}` is registered")]
    UnknownPlugin(String),
    #[error("plugin `{name}` failed: {message}")]
    PluginFailed { name: String, message: String },
    /// Config did not match what the plugin expects.
    #[error("invalid config for `{name}`: {message}")]
    Config { name: String, message: String },
}

impl KernelError {
    pub fn command(name: impl Into<String>, message: impl fmt::Display) -> Self {
        KernelError::Command { name: name.into(), message: message.to_string() }
    }
}

/// Whatever went wrong inside [`crate::Plugin::apply`] or a command handler.
///
/// It is a string on purpose. The kernel does not care *why* a plugin failed — it records the
/// message, marks the scope failed, and leaves it to a plugin manager (or the user) to decide.
/// `?` works on anything that implements [`std::error::Error`].
#[derive(Debug, Clone, thiserror::Error)]
#[error("{0}")]
pub struct PluginError(pub String);

impl PluginError {
    pub fn new(message: impl fmt::Display) -> Self {
        PluginError(message.to_string())
    }
}

impl From<String> for PluginError {
    fn from(value: String) -> Self {
        PluginError(value)
    }
}

impl From<&str> for PluginError {
    fn from(value: &str) -> Self {
        PluginError(value.to_string())
    }
}

impl From<KernelError> for PluginError {
    fn from(value: KernelError) -> Self {
        PluginError(value.to_string())
    }
}

impl From<serde_json::Error> for PluginError {
    fn from(value: serde_json::Error) -> Self {
        PluginError(value.to_string())
    }
}

impl From<std::io::Error> for PluginError {
    fn from(value: std::io::Error) -> Self {
        PluginError(value.to_string())
    }
}

/// What a plugin's `apply` returns.
pub type PluginResult = Result<(), PluginError>;
