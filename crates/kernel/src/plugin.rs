//! What a plugin *is*.
//!
//! In cordis a plugin is a function `(ctx, config) => void` — that is the whole contract, and the
//! reason cordis apps compose so freely. Here it is a trait with the same shape and two pieces of
//! declared metadata: the services it needs ([`Plugin::inject`]) and, optionally, a JSON schema
//! for its config so a settings UI can be generated instead of written.

use crate::context::Context;
use crate::error::PluginError;
use serde_json::Value;

/// The services a plugin depends on.
///
/// `required` is the reactive part: the plugin does not run until every required service exists,
/// and is unloaded the moment one goes away. `optional` names are documentation plus a *reload*
/// trigger — the plugin runs without them, but is re-applied when they appear or vanish, so it can
/// pick up a capability that showed up late (cordis' `inject.optional`).
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Injection {
    #[serde(default)]
    pub required: Vec<String>,
    #[serde(default)]
    pub optional: Vec<String>,
}

impl Injection {
    pub fn required<I, S>(names: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Injection { required: names.into_iter().map(Into::into).collect(), optional: Vec::new() }
    }

    pub fn optional<I, S>(names: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Injection { required: Vec::new(), optional: names.into_iter().map(Into::into).collect() }
    }

    pub fn with_optional<I, S>(mut self, names: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.optional.extend(names.into_iter().map(Into::into));
        self
    }

    /// Every name that should trigger a reload — required and optional alike.
    pub fn watched(&self) -> impl Iterator<Item = &String> {
        self.required.iter().chain(self.optional.iter())
    }
}

/// A unit of behaviour that can be loaded, unloaded, and reloaded at runtime.
///
/// `apply` is the whole plugin. Everything it does — listeners, services, commands, child
/// plugins, spawned tasks — must be registered on the `ctx` it is handed, because that `ctx` is
/// also the undo log: when the scope resets, all of it is reversed in reverse order.
///
/// `apply` may fail. A failed plugin marks its scope [`Status::Failed`](crate::Status) with the
/// message and changes nothing else; the graph keeps running.
#[async_trait::async_trait]
pub trait Plugin: Send + Sync + 'static {
    /// Stable identifier — the key in the config file, the label in the plugin manager.
    fn name(&self) -> &str;

    /// Services this plugin needs. Defaults to none.
    fn inject(&self) -> Injection {
        Injection::default()
    }

    /// JSON Schema for this plugin's config, if it takes one. Cordis uses schemastery for exactly
    /// this: a settings form nobody had to hand-write.
    fn schema(&self) -> Option<Value> {
        None
    }

    /// One-line description for the plugin manager.
    fn description(&self) -> Option<&str> {
        None
    }

    /// Set the plugin up. Called again from scratch on every reload.
    async fn apply(&self, ctx: Context, config: Value) -> Result<(), PluginError>;
}

/// A plugin from a plain closure, for the small ones that do not deserve a type.
///
/// ```no_run
/// # use codetwo_kernel::{App, FnPlugin};
/// # async fn demo(app: &App) {
/// app.ctx().plugin(
///     FnPlugin::new("greeter", |ctx, _config| async move {
///         ctx.command("greet", |_| async move { Ok("hello".into()) })?;
///         Ok(())
///     }),
///     serde_json::Value::Null,
/// );
/// # }
/// ```
pub struct FnPlugin<F> {
    name: String,
    inject: Injection,
    apply: F,
}

impl<F, Fut> FnPlugin<F>
where
    F: Fn(Context, Value) -> Fut + Send + Sync + 'static,
    Fut: std::future::Future<Output = Result<(), PluginError>> + Send + 'static,
{
    pub fn new(name: impl Into<String>, apply: F) -> Self {
        FnPlugin { name: name.into(), inject: Injection::default(), apply }
    }

    pub fn with_inject(mut self, inject: Injection) -> Self {
        self.inject = inject;
        self
    }
}

#[async_trait::async_trait]
impl<F, Fut> Plugin for FnPlugin<F>
where
    F: Fn(Context, Value) -> Fut + Send + Sync + 'static,
    Fut: std::future::Future<Output = Result<(), PluginError>> + Send + 'static,
{
    fn name(&self) -> &str {
        &self.name
    }

    fn inject(&self) -> Injection {
        self.inject.clone()
    }

    async fn apply(&self, ctx: Context, config: Value) -> Result<(), PluginError> {
        (self.apply)(ctx, config).await
    }
}
