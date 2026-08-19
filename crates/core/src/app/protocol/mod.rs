//! The C2 Plugin Protocol — plugins that are not written in Rust, and do not run in this
//! process.
//!
//! # Why this exists
//!
//! [`crate::app`] made C2 a plugin graph, but a Rust host can only load Rust plugins it was
//! compiled with. That is a real ceiling: it means "plugin" describes how *we* organise our code,
//! not something a user can add. This closes it. A plugin is a process; C2 speaks JSON-RPC to
//! it over stdio; and what it contributes — commands, event subscriptions — lands in exactly the
//! same registries a built-in plugin's do.
//!
//! The consequence worth stating plainly: an out-of-process plugin is not a lesser citizen. Its
//! commands appear in `kernel.commands`, are callable from the frontend through `call()`, and
//! disappear the instant it unloads, because they belong to its scope like everything else.
//!
//! # Trust
//!
//! Installing a bundle still executes nothing — that property of the Plugin Hub is not weakened
//! here. A process starts only when the bundle is **enabled *and* trusted**, and trust is a
//! deliberate user action on an install that has already been shown to ship code. [`ExtensionsPlugin`]
//! is the only thing that spawns one, and it refuses untrusted bundles by default.
//!
//! # Shape
//!
//! ```text
//!  host                                  plugin process
//!    │  initialize ────────────────────────▶
//!    │  ◀──────────── { commands, events }
//!    │                                     (host registers them in the kernel)
//!    │  command/invoke ───────────────────▶      ← frontend called `call("foo.bar")`
//!    │  event/emit ───────────────────────▶      ← something happened in the host
//!    │  ◀─────────────────── command/call        ← plugin calls a host command
//!    │  ◀─────────────────── event/emit, log
//!    │  (unload: process killed, registrations gone)
//! ```

mod peer;
mod wire;

pub use peer::{HostHandler, Peer, ProtocolError};
pub use wire::{
    version_is_compatible, CommandSpec, EventParams, HostInfo, InitializeParams, InitializeResult,
    InvokeParams, LogParams, PROTOCOL_VERSION,
};

use crate::plugin::PluginRuntimeSpec;
use codetwo_kernel::{
    async_trait, Context, Injection, Plugin, PluginError, PluginResult, WeakContext,
};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncRead, AsyncWrite};

/// A started plugin: the two streams to talk over, and how to stop it.
pub struct Channel {
    pub reader: Box<dyn AsyncRead + Unpin + Send>,
    pub writer: Box<dyn AsyncWrite + Unpin + Send>,
    /// Called when the plugin's scope unloads. Must be idempotent.
    pub shutdown: Box<dyn FnOnce() + Send>,
}

/// How a plugin is started. A trait rather than a concrete process spawn so the protocol is
/// testable over an in-memory duplex — the same trick [`crate::acp`] uses to test the prompt turn
/// without a provider binary.
#[async_trait]
pub trait Transport: Send + Sync + 'static {
    async fn start(&self) -> Result<Channel, PluginError>;
}

/// Start a plugin as a child process with piped stdio.
pub struct ProcessTransport {
    pub command: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub cwd: Option<PathBuf>,
    /// Used only in log lines.
    pub label: String,
}

impl ProcessTransport {
    /// Build from an installed bundle's `runtime` block, rooted at that bundle's directory.
    pub fn from_spec(spec: &PluginRuntimeSpec, cwd: PathBuf, label: String) -> ProcessTransport {
        ProcessTransport {
            command: spec.command.clone(),
            args: spec.args.clone(),
            env: spec
                .env
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
            cwd: Some(cwd),
            label,
        }
    }
}

#[async_trait]
impl Transport for ProcessTransport {
    async fn start(&self) -> Result<Channel, PluginError> {
        let mut command = tokio::process::Command::new(&self.command);
        command
            .args(&self.args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            // The child dies with us even if shutdown never runs — a plugin process must not
            // outlive the app that started it.
            .kill_on_drop(true);
        for (key, value) in &self.env {
            command.env(key, value);
        }
        if let Some(cwd) = &self.cwd {
            command.current_dir(cwd);
        }

        let mut child = command.spawn().map_err(|error| {
            PluginError::new(format!("couldn't start `{}`: {error}", self.command))
        })?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| PluginError::new("no stdout"))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| PluginError::new("no stdin"))?;

        // A plugin's stderr is its diagnostics channel; route it where every other diagnostic goes
        // rather than letting it vanish into a closed pipe.
        if let Some(stderr) = child.stderr.take() {
            let label = self.label.clone();
            tokio::spawn(async move {
                use tokio::io::AsyncBufReadExt;
                let mut lines = tokio::io::BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    tracing::warn!(plugin = %label, "{line}");
                }
            });
        }

        let child = Arc::new(Mutex::new(Some(child)));
        let shutdown = {
            let child = child.clone();
            Box::new(move || {
                if let Some(mut child) = child.lock().unwrap().take() {
                    let _ = child.start_kill();
                }
            }) as Box<dyn FnOnce() + Send>
        };
        Ok(Channel {
            reader: Box::new(stdout),
            writer: Box::new(stdin),
            shutdown,
        })
    }
}

/// A plugin that lives in another process.
///
/// Everything the kernel knows about it comes from the manifest (its name, what it injects) and
/// the handshake (what it contributes). From the graph's point of view it is an ordinary plugin.
pub struct ProtocolPlugin {
    name: String,
    description: Option<String>,
    inject: Injection,
    transport: Arc<dyn Transport>,
    data_dir: Option<PathBuf>,
    handshake_timeout: std::time::Duration,
}

/// How long to wait for `initialize` before giving up on a plugin.
///
/// This one has teeth: loading runs on the kernel's single driver task, so a plugin that starts
/// and then says nothing would stall the *entire* graph, not just itself. A bounded wait turns
/// "the app hangs on startup" into "one plugin failed, here is its name".
pub const DEFAULT_HANDSHAKE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

impl ProtocolPlugin {
    pub fn new(name: impl Into<String>, transport: Arc<dyn Transport>) -> ProtocolPlugin {
        ProtocolPlugin {
            name: name.into(),
            description: None,
            inject: Injection::default(),
            transport,
            data_dir: None,
            handshake_timeout: DEFAULT_HANDSHAKE_TIMEOUT,
        }
    }

    pub fn with_handshake_timeout(mut self, timeout: std::time::Duration) -> ProtocolPlugin {
        self.handshake_timeout = timeout;
        self
    }

    /// Build from an installed bundle's `runtime` block.
    pub fn from_spec(
        id: &str,
        spec: &PluginRuntimeSpec,
        bundle_dir: PathBuf,
        data_dir: PathBuf,
    ) -> ProtocolPlugin {
        let transport = ProcessTransport::from_spec(spec, bundle_dir, format!("plugin:{id}"));
        ProtocolPlugin {
            name: id.to_string(),
            description: None,
            inject: Injection {
                required: spec.inject.clone(),
                optional: spec.optional_inject.clone(),
            },
            transport: Arc::new(transport),
            data_dir: Some(data_dir),
            handshake_timeout: DEFAULT_HANDSHAKE_TIMEOUT,
        }
    }

    pub fn with_description(mut self, description: impl Into<String>) -> ProtocolPlugin {
        self.description = Some(description.into());
        self
    }

    pub fn with_inject(mut self, inject: Injection) -> ProtocolPlugin {
        self.inject = inject;
        self
    }
}

#[async_trait]
impl Plugin for ProtocolPlugin {
    fn name(&self) -> &str {
        &self.name
    }

    fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }

    fn inject(&self) -> Injection {
        self.inject.clone()
    }

    async fn apply(&self, ctx: Context, config: Value) -> PluginResult {
        let channel = self.transport.start().await?;

        // Registered before the handshake on purpose: a plugin that never answers `initialize`
        // still gets killed when this scope unwinds.
        let shutdown = Mutex::new(Some(channel.shutdown));
        ctx.effect(move || {
            if let Some(shutdown) = shutdown.lock().unwrap().take() {
                shutdown();
            }
        });

        if let Some(dir) = &self.data_dir {
            std::fs::create_dir_all(dir)?;
        }

        let host = Arc::new(KernelHost {
            ctx: ctx.weak(),
            plugin: self.name.clone(),
        });
        let peer = Peer::new(channel.reader, channel.writer, host);

        let params = InitializeParams {
            protocol_version: PROTOCOL_VERSION.to_string(),
            host: HostInfo {
                name: "code2".into(),
                version: env!("CARGO_PKG_VERSION").to_string(),
                commands: ctx
                    .runtime()
                    .commands()
                    .into_iter()
                    .map(|c| c.name)
                    .collect(),
            },
            config,
            data_dir: self
                .data_dir
                .as_ref()
                .map(|dir| dir.to_string_lossy().into_owned()),
        };
        let result: InitializeResult =
            tokio::time::timeout(self.handshake_timeout, peer.request("initialize", params))
                .await
                .map_err(|_| {
                    PluginError::new(format!(
                        "did not answer `initialize` within {:?}",
                        self.handshake_timeout
                    ))
                })?
                .map_err(|error| PluginError::new(format!("handshake failed: {error}")))?;

        if !version_is_compatible(&result.protocol_version) {
            return Err(PluginError::new(format!(
                "speaks plugin protocol {} — this host speaks {PROTOCOL_VERSION}",
                result.protocol_version
            )));
        }

        for spec in &result.commands {
            let peer = peer.clone();
            let name = spec.name.clone();
            ctx.command_described(
                spec.name.clone(),
                spec.description.as_deref(),
                move |args| {
                    let peer = peer.clone();
                    let name = name.clone();
                    async move {
                        peer.request::<_, Value>(
                            "command/invoke",
                            InvokeParams {
                                name: name.clone(),
                                args,
                            },
                        )
                        .await
                        .map_err(|error| PluginError::new(error.to_string()))
                    }
                },
            )?;
        }

        for event in &result.events {
            let peer = peer.clone();
            let name = event.clone();
            ctx.on_json(event.clone(), move |payload| {
                let peer = peer.clone();
                let name = name.clone();
                async move {
                    peer.notify(
                        "event/emit",
                        EventParams {
                            name,
                            payload: (*payload).clone(),
                        },
                    );
                    None
                }
            });
        }

        // Keep the peer alive for as long as the scope is: dropping the last handle closes the
        // writer, which most plugins read as "shut down".
        ctx.effect(move || drop(peer));
        Ok(())
    }
}

/// The host side of the protocol: what a plugin process is allowed to ask for.
struct KernelHost {
    ctx: WeakContext,
    plugin: String,
}

#[async_trait]
impl HostHandler for KernelHost {
    async fn call(&self, name: &str, args: Value) -> Result<Value, String> {
        let Some(ctx) = self.ctx.upgrade() else {
            return Err("the host is shutting down".into());
        };
        ctx.call(name, args)
            .await
            .map_err(|error| error.to_string())
    }

    async fn emit(&self, name: &str, payload: Value) {
        if let Some(ctx) = self.ctx.upgrade() {
            ctx.emit_json(name, payload).await;
        }
    }

    fn log(&self, level: &str, message: &str) {
        match level {
            "error" => tracing::error!(plugin = %self.plugin, "{message}"),
            "warn" => tracing::warn!(plugin = %self.plugin, "{message}"),
            "debug" | "trace" => tracing::debug!(plugin = %self.plugin, "{message}"),
            _ => tracing::info!(plugin = %self.plugin, "{message}"),
        }
    }
}
