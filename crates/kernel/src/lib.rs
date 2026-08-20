//! The C2 plugin kernel — a Rust reading of [cordis](https://github.com/cordiverse/cordis).
//!
//! Cordis' bet is that an application is not a program that happens to have extension points; it
//! is a *graph of plugins* that happens to boot. Everything the app can do is contributed by a
//! plugin, every capability is a **service** looked up by name, and every side effect a plugin
//! causes is owned by the **scope** it ran in — so unloading a plugin is exact, not best-effort.
//!
//! This crate ports that model, with the same vocabulary, to Rust:
//!
//! | cordis                     | here                                            |
//! |----------------------------|-------------------------------------------------|
//! | `Context`                  | [`Context`] — a cheap handle bound to a scope    |
//! | `ctx.plugin(p, config)`    | [`Context::plugin`] → [`Fork`]                   |
//! | `ctx.provide` / `ctx.foo`  | [`Context::provide`] / [`Context::get`]          |
//! | `inject: ['foo']`          | [`Plugin::inject`] → [`Injection`]               |
//! | `ctx.on` / `emit` / `bail` | [`Context::on`] / [`Context::emit`] / [`Context::bail`] |
//! | `ctx.effect(...)`          | [`Context::effect`]                              |
//! | `ctx.isolate(['foo'])`     | [`Context::isolate`]                             |
//! | `EffectScope` states       | [`Status`]                                       |
//! | `@cordisjs/loader`         | [`Loader`] + [`PluginRegistry`]                  |
//!
//! and adds one thing cordis gets for free from JavaScript and we do not: a **command registry**
//! ([`Context::command`]), so a plugin can contribute app surface — the calls a frontend makes —
//! without anyone editing a central dispatch table.
//!
//! # The three rules
//!
//! 1. **A plugin only touches the world through its [`Context`].** Listeners, services, commands,
//!    child plugins and raw cleanup closures all register on `ctx`, and all of them are undone
//!    when the scope resets. That is what makes hot-swapping honest.
//! 2. **Dependencies are declared, not fetched.** A plugin that injects `store` does not run until
//!    `store` exists, and is *torn down and re-applied* if `store` is ever replaced. Availability
//!    is reactive state, not a boot-order puzzle.
//! 3. **Loading is asynchronous and never re-entrant.** Mutations enqueue work on a single driver
//!    task, so a plugin can freely load children or provide services from inside `apply` without
//!    fighting a lock. [`Runtime::flush`] awaits quiescence when you need determinism.
//!
//! # Example
//!
//! ```
//! use codetwo_kernel::{async_trait, App, Context, Injection, Plugin, PluginResult, Service};
//! use serde_json::Value;
//! use std::sync::Arc;
//!
//! struct Db;
//! impl Service for Db { const NAME: &'static str = "db"; }
//!
//! struct DbPlugin;
//! #[async_trait]
//! impl Plugin for DbPlugin {
//!     fn name(&self) -> &str { "db" }
//!     async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
//!         ctx.provide(Arc::new(Db))?;
//!         Ok(())
//!     }
//! }
//!
//! struct ApiPlugin;
//! #[async_trait]
//! impl Plugin for ApiPlugin {
//!     fn name(&self) -> &str { "api" }
//!     // `api` simply does not exist until `db` does — and stops existing if `db` goes away.
//!     fn inject(&self) -> Injection { Injection::required(["db"]) }
//!     async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
//!         let db = ctx.expect::<Db>()?;
//!         ctx.command("api.ping", move |_args| {
//!             let _db = db.clone();
//!             async move { Ok(Value::from("pong")) }
//!         })?;
//!         Ok(())
//!     }
//! }
//!
//! # #[tokio::main] async fn main() {
//! let app = App::new();
//! app.ctx().plugin(ApiPlugin, Value::Null);   // order does not matter …
//! app.ctx().plugin(DbPlugin, Value::Null);    // … `api` waits for `db`
//! app.flush().await;
//!
//! assert_eq!(app.ctx().call("api.ping", Value::Null).await.unwrap(), "pong");
//! # }
//! ```

mod command;
mod context;
mod error;
mod event;
mod loader;
mod plugin;
mod runtime;
mod service;

pub use async_trait::async_trait;

pub use command::{CommandHandler, CommandInfo, CommandRealm};
pub use context::{App, Context, Fork, WeakContext};
pub use error::{KernelError, PluginError, PluginResult};
pub use event::{Event, JsonEvent};
pub use loader::{
    Loader, LoaderConfig, LoaderEntryInfo, LoaderReconcileResult, PluginEntry, PluginFactory,
    PluginRegistry,
};
pub use plugin::{
    FnPlugin, Injection, Plugin, PluginCategory, PluginMetadata, PluginOrigin, PluginScopeSupport,
};
pub use runtime::{Runtime, ScopeId, ScopeInfo, Status, GLOBAL_REALM, ROOT_SCOPE};
pub use service::{Service, ServiceInfo};

/// Lifecycle events emitted by the kernel itself. Cordis calls these `internal/*`; a plugin can
/// listen to them to build a plugin manager, a status UI, or a health probe.
pub mod events {
    use super::runtime::{ScopeId, Status};

    /// A scope changed state — pending → loading → active, or reset back to pending.
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

    /// A service appeared or disappeared in a realm. Dependent scopes have already been queued for
    /// (re)load by the time this fires.
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

    /// Emitted once, the first time the plugin graph reaches quiescence — cordis' `ready`.
    #[derive(Debug, Clone)]
    pub struct Ready;

    impl super::Event for Ready {
        type Output = ();
        const NAME: &'static str = "ready";
    }
}
