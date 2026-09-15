//! The C2 plugin kernel — a Rust reading of [cordis](https://github.com/cordiverse/cordis).
//!
//! Reactive plugin runtime: contexts, services published by name, declared injections, scoped
//! effects, hot-swappable plugins, and a command registry.

mod command;
mod context;
mod error;
mod event;
mod loader;
mod plugin;
mod runtime;
mod service;

pub use async_trait::async_trait;

pub use command::{CommandHandler, CommandInfo, CommandRealm, CommandVisibility};
pub use context::{App, Context, Fork, WeakContext};
pub use error::{KernelError, PluginError, PluginResult};
pub use event::{Event, JsonEvent};
pub use loader::{
    Loader, LoaderConfig, LoaderEntryInfo, LoaderReconcileResult, PluginEntry, PluginFactory,
    PluginRegistry,
};
pub use plugin::{
    FnPlugin, Injection, Plugin, PluginCategory, PluginMetadata, PluginOrigin, PluginRole,
    PluginScopeSupport,
};
pub use runtime::{Runtime, ScopeId, ScopeInfo, Status, GLOBAL_REALM, ROOT_SCOPE};
pub use service::{Service, ServiceInfo};

/// Lifecycle events emitted by the kernel itself.
pub mod events {
    use super::runtime::{ScopeId, Status};

    #[derive(Debug, Clone)]
    pub struct StatusChanged {
        pub scope: ScopeId,
        pub plugin: String,
        pub status: Status,
        pub error: Option<String>,
    }

    impl super::Event for StatusChanged {
        type Output = ();
        const NAME: &'static str = "internal/status";
    }

    #[derive(Debug, Clone)]
    pub struct ServiceChanged {
        pub name: String,
        pub realm: u64,
        pub active: bool,
    }

    impl super::Event for ServiceChanged {
        type Output = ();
        const NAME: &'static str = "internal/service";
    }

    #[derive(Debug, Clone)]
    pub struct Ready;

    impl super::Event for Ready {
        type Output = ();
        const NAME: &'static str = "ready";
    }
}
