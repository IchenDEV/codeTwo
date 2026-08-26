//! [`Context`] — the only thing a plugin is given, and the only thing it needs.
//!
//! A `Context` is a cheap, cloneable handle to the runtime, bound to one scope. Every registration
//! made through it is filed under that scope, which is why unloading a plugin is exact rather than
//! best-effort. Cordis puts it well: the context *is* the plugin's undo log.

use crate::command::{CommandInfo, CommandRealm, CommandVisibility};
use crate::error::{KernelError, PluginError};
use crate::event::{BoxFuture, Event, Handler, JsonListenerEntry, ListenerEntry};
use crate::plugin::{FnPlugin, Injection, Plugin};
use crate::runtime::{Runtime, ScopeId, Status, GLOBAL_REALM, ROOT_SCOPE};
use crate::service::Service;
use serde_json::Value;
use std::any::TypeId;
use std::collections::HashMap;
use std::future::Future;
use std::sync::Arc;

/// A handle to the runtime, bound to one scope.
#[derive(Clone)]
pub struct Context {
    runtime: Arc<Runtime>,
    scope: ScopeId,
    generation: u64,
    command_realm: CommandRealm,
    /// Service-name → realm overrides inherited from [`Context::isolate`].
    isolate: Arc<HashMap<String, u64>>,
}

impl Context {
    pub(crate) fn for_scope(runtime: Arc<Runtime>, scope: ScopeId) -> Context {
        let generation = runtime.scope_generation(scope).unwrap_or_default();
        Context {
            runtime,
            scope,
            generation,
            command_realm: CommandRealm::Global,
            isolate: Arc::new(HashMap::new()),
        }
    }

    pub(crate) fn with_isolate(
        runtime: Arc<Runtime>,
        scope: ScopeId,
        generation: u64,
        isolate: Arc<HashMap<String, u64>>,
        command_realm: CommandRealm,
    ) -> Context {
        Context {
            runtime,
            scope,
            generation,
            command_realm,
            isolate,
        }
    }

    /// The scope this context registers into.
    pub fn scope(&self) -> ScopeId {
        self.scope
    }

    /// Whether this handle still belongs to the scope generation that created it.
    pub fn is_current(&self) -> bool {
        self.runtime
            .scope_generation_is_current(self.scope, self.generation)
    }

    pub fn runtime(&self) -> &Arc<Runtime> {
        &self.runtime
    }

    /// The command namespace used by registrations and calls made through this context.
    pub fn command_realm(&self) -> &CommandRealm {
        &self.command_realm
    }

    /// Derive a context that registers and dispatches commands in `realm`.
    ///
    /// Plugins loaded through the derived context inherit the realm. Services and events retain
    /// their existing isolation semantics.
    pub fn with_command_realm(&self, realm: CommandRealm) -> Context {
        Context {
            runtime: self.runtime.clone(),
            scope: self.scope,
            generation: self.generation,
            command_realm: realm,
            isolate: self.isolate.clone(),
        }
    }

    /// Wait until the plugin graph is settled. Never call this from inside `apply`.
    pub async fn flush(&self) {
        self.runtime.flush().await;
    }

    // ---- plugins -------------------------------------------------------------------------

    /// Load a plugin as a child of this scope.
    ///
    /// Returns immediately with a [`Fork`]; loading happens on the driver task, and only once the
    /// plugin's required services exist. Disposing this context disposes the child too.
    pub fn plugin<P: Plugin>(&self, plugin: P, config: Value) -> Fork {
        self.plugin_arc(Arc::new(plugin), config)
    }

    pub fn plugin_arc(&self, plugin: Arc<dyn Plugin>, config: Value) -> Fork {
        let scope = self.runtime.spawn_scope(
            self.scope,
            plugin,
            config,
            self.isolate.clone(),
            self.command_realm.clone(),
        );
        Fork {
            runtime: self.runtime.clone(),
            scope,
        }
    }

    /// Ask the kernel to tear this scope down and apply it again.
    ///
    /// For plugins whose work depends on something the kernel cannot watch — files on disk, an
    /// installed-bundle set, a directory scan. Rather than inventing a private refresh path, say
    /// "I am stale" and get the same clean rebuild a dependency change would have produced.
    pub fn reload(&self) {
        self.runtime.refresh(self.scope);
    }

    /// cordis' `ctx.inject(deps, callback)`: run a closure once the named services exist, and tear
    /// it down again if they go away. An anonymous plugin, for the cases that do not deserve a type.
    pub fn inject<F, Fut>(&self, names: &[&str], apply: F) -> Fork
    where
        F: Fn(Context) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<(), PluginError>> + Send + 'static,
    {
        let plugin = FnPlugin::new("inject", move |ctx, _config| apply(ctx))
            .with_inject(Injection::required(names.iter().copied()));
        self.plugin(plugin, Value::Null)
    }

    // ---- services ------------------------------------------------------------------------

    /// Publish a service under [`Service::NAME`]. It disappears when this scope unloads.
    ///
    /// Fails if something already provides that name in this realm — a shadowed service is a bug
    /// that shows up somewhere else, later, as the wrong behaviour.
    pub fn provide<S: Service>(&self, value: Arc<S>) -> Result<(), KernelError> {
        self.runtime
            .provide_service(self.scope, S::NAME, value, &self.isolate)
    }

    /// Publish a service under a name chosen at runtime — for plugins that wrap something dynamic
    /// (one service per provider, per workspace, …).
    pub fn provide_as(
        &self,
        name: &str,
        value: Arc<dyn std::any::Any + Send + Sync>,
    ) -> Result<(), KernelError> {
        self.runtime
            .provide_service(self.scope, name, value, &self.isolate)
    }

    /// Look a service up by type. `None` means "not provided here" — which for an injected
    /// service cannot happen, since the plugin would not be running.
    pub fn get<S: Service>(&self) -> Option<Arc<S>> {
        self.runtime
            .lookup_service(S::NAME, &self.isolate)?
            .downcast::<S>()
            .ok()
    }

    /// Look up an injected service, or fail with a message worth reading. Use inside `apply` for
    /// anything listed in [`Plugin::inject`].
    pub fn expect<S: Service>(&self) -> Result<Arc<S>, PluginError> {
        self.get::<S>().ok_or_else(|| {
            PluginError::new(format!(
                "service `{}` is missing — is it in this plugin's inject list?",
                S::NAME
            ))
        })
    }

    /// Is a service available under this name?
    pub fn has(&self, name: &str) -> bool {
        self.runtime.lookup_service(name, &self.isolate).is_some()
    }

    /// Derive a context in which the named services resolve to a private realm.
    ///
    /// Plugins loaded from it get their *own* instance of those services — cordis' `ctx.isolate`.
    /// This is how you run two copies of a subsystem (two workspaces, a sandboxed plugin) without
    /// either noticing the other.
    pub fn isolate(&self, names: &[&str]) -> Context {
        let mut isolate = (*self.isolate).clone();
        for name in names {
            isolate.insert((*name).to_string(), self.runtime.new_realm());
        }
        Context {
            runtime: self.runtime.clone(),
            scope: self.scope,
            generation: self.generation,
            command_realm: self.command_realm.clone(),
            isolate: Arc::new(isolate),
        }
    }

    /// The realm a service name resolves to in this context. `0` is global.
    pub fn realm_of(&self, name: &str) -> u64 {
        self.isolate.get(name).copied().unwrap_or(GLOBAL_REALM)
    }

    // ---- effects -------------------------------------------------------------------------

    /// Register cleanup owned by this scope. Runs on unload, newest first.
    ///
    /// This is the escape hatch that keeps everything else honest: a plugin that spawns a task,
    /// opens a socket, or writes a temp file hands the undo to `effect` and stops being something
    /// the app has to remember. Returns `false` and runs the cleanup immediately when this context
    /// belongs to a disposed or superseded scope generation.
    pub fn effect(&self, dispose: impl FnOnce() + Send + 'static) -> bool {
        self.runtime
            .add_disposable(self.scope, self.generation, Box::new(dispose))
    }

    /// Spawn a task tied to this scope: unloading the plugin aborts it.
    pub fn spawn<Fut>(&self, future: Fut)
    where
        Fut: Future<Output = ()> + Send + 'static,
    {
        let handle = tokio::spawn(future);
        self.effect(move || handle.abort());
    }

    // ---- events --------------------------------------------------------------------------

    /// Listen for a typed event. The listener lives and dies with this scope.
    pub fn on<E, F>(&self, listener: F)
    where
        E: Event,
        F: Fn(Arc<E>) -> Option<E::Output> + Send + Sync + 'static,
    {
        let listener = Arc::new(listener);
        self.on_boxed::<E>(Arc::new(move |event| {
            let listener = listener.clone();
            Box::pin(async move { listener(event) })
        }));
    }

    /// Listen with an async handler.
    pub fn on_async<E, F, Fut>(&self, listener: F)
    where
        E: Event,
        F: Fn(Arc<E>) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Option<E::Output>> + Send + 'static,
    {
        let listener = Arc::new(listener);
        self.on_boxed::<E>(Arc::new(move |event| {
            let listener = listener.clone();
            Box::pin(async move { listener(event).await })
        }));
    }

    #[allow(clippy::type_complexity)]
    fn on_boxed<E: Event>(
        &self,
        handler: Arc<dyn Fn(Arc<E>) -> BoxFuture<'static, Option<E::Output>> + Send + Sync>,
    ) {
        let seq = {
            let mut state = self.runtime.state();
            Runtime::next_seq(&mut state)
        };
        self.runtime.add_listener(
            TypeId::of::<E>(),
            ListenerEntry {
                scope: self.scope,
                seq,
                handler: Box::new(Handler::<E>(handler)),
            },
        );
    }

    /// Notify every listener, discarding what they return.
    pub async fn emit<E: Event>(&self, event: E) {
        let listeners = self.runtime.listeners_for::<E>();
        if listeners.is_empty() {
            return;
        }
        let event = Arc::new(event);
        for listener in listeners {
            listener.0(event.clone()).await;
        }
    }

    /// Ask listeners in registration order and stop at the first answer — cordis' `bail`.
    /// This is how a plugin vetoes, overrides, or claims something.
    pub async fn bail<E: Event>(&self, event: E) -> Option<E::Output> {
        let listeners = self.runtime.listeners_for::<E>();
        let event = Arc::new(event);
        for listener in listeners {
            if let Some(output) = listener.0(event.clone()).await {
                return Some(output);
            }
        }
        None
    }

    /// Run every listener and keep every answer.
    pub async fn collect<E: Event>(&self, event: E) -> Vec<E::Output> {
        let listeners = self.runtime.listeners_for::<E>();
        let event = Arc::new(event);
        let mut out = Vec::new();
        for listener in listeners {
            if let Some(output) = listener.0(event.clone()).await {
                out.push(output);
            }
        }
        out
    }

    /// Listen on the untyped side of the bus — the one frontends and external plugins can reach.
    /// Returns `false` when this context belongs to a disposed or superseded scope generation.
    pub fn on_json<F, Fut>(&self, name: impl Into<String>, listener: F) -> bool
    where
        F: Fn(Arc<Value>) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Option<Value>> + Send + 'static,
    {
        let listener = Arc::new(listener);
        let seq = {
            let mut state = self.runtime.state();
            Runtime::next_seq(&mut state)
        };
        self.runtime.add_json_listener(
            name.into(),
            self.generation,
            JsonListenerEntry {
                scope: self.scope,
                seq,
                handler: Arc::new(move |value| {
                    let listener = listener.clone();
                    Box::pin(async move { listener(value).await })
                }),
            },
        )
    }

    pub async fn emit_json(&self, name: &str, payload: Value) {
        let listeners = self.runtime.json_listeners_for(name);
        if listeners.is_empty() {
            return;
        }
        let payload = Arc::new(payload);
        for listener in listeners {
            listener(payload.clone()).await;
        }
    }

    pub async fn bail_json(&self, name: &str, payload: Value) -> Option<Value> {
        let listeners = self.runtime.json_listeners_for(name);
        let payload = Arc::new(payload);
        for listener in listeners {
            if let Some(output) = listener(payload.clone()).await {
                return Some(output);
            }
        }
        None
    }

    // ---- commands ------------------------------------------------------------------------

    /// Contribute a named command to the trusted host surface.
    ///
    /// Internal runtime modules and host adapters may call it by name. Extension processes cannot
    /// discover or invoke it unless it is registered with [`Context::command_extension_public`].
    /// Keep names in `subsystem.verb` form (`git.status`, `scene.apply`).
    pub fn command<F, Fut>(&self, name: impl Into<String>, handler: F) -> Result<(), KernelError>
    where
        F: Fn(Value) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<Value, PluginError>> + Send + 'static,
    {
        self.command_described(name, None, handler)
    }

    pub fn command_described<F, Fut>(
        &self,
        name: impl Into<String>,
        description: Option<&str>,
        handler: F,
    ) -> Result<(), KernelError>
    where
        F: Fn(Value) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<Value, PluginError>> + Send + 'static,
    {
        self.command_described_with_visibility(
            name,
            description,
            CommandVisibility::Internal,
            handler,
        )
    }

    /// Contribute a command that an out-of-process extension may discover and invoke.
    ///
    /// This is deliberately separate from [`Context::command`], which stays internal by default.
    /// Treat this method as publishing a compatibility and authorization contract.
    pub fn command_extension_public<F, Fut>(
        &self,
        name: impl Into<String>,
        handler: F,
    ) -> Result<(), KernelError>
    where
        F: Fn(Value) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<Value, PluginError>> + Send + 'static,
    {
        self.command_described_with_visibility(
            name,
            None,
            CommandVisibility::ExtensionPublic,
            handler,
        )
    }

    fn command_described_with_visibility<F, Fut>(
        &self,
        name: impl Into<String>,
        description: Option<&str>,
        visibility: CommandVisibility,
        handler: F,
    ) -> Result<(), KernelError>
    where
        F: Fn(Value) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<Value, PluginError>> + Send + 'static,
    {
        let handler = Arc::new(handler);
        self.runtime.register_command(
            self.scope,
            self.command_realm.clone(),
            name.into(),
            description.map(str::to_string),
            visibility,
            Arc::new(move |_realm, args| {
                let handler = handler.clone();
                Box::pin(async move { handler(args).await })
            }),
        )
    }

    /// Contribute a command whose handler must authorize or route against the caller's command
    /// realm. Most commands should use [`Context::command`]; this form is for narrow dispatchers
    /// such as a manifest UI action that must invoke the owning global or project plugin instance.
    pub fn command_with_realm<F, Fut>(
        &self,
        name: impl Into<String>,
        handler: F,
    ) -> Result<(), KernelError>
    where
        F: Fn(CommandRealm, Value) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<Value, PluginError>> + Send + 'static,
    {
        let handler = Arc::new(handler);
        self.runtime.register_command(
            self.scope,
            self.command_realm.clone(),
            name.into(),
            None,
            CommandVisibility::Internal,
            Arc::new(move |realm, args| {
                let handler = handler.clone();
                Box::pin(async move { handler(realm, args).await })
            }),
        )
    }

    /// Prevent this command realm from inheriting a same-named global command.
    ///
    /// A project plugin manager uses this when a project explicitly disables a plugin. Like a
    /// command registration, the blocker belongs to this context's scope and is removed on reload
    /// or disposal. A command registered directly in this realm still wins over the blocker.
    pub fn block_command_fallback(&self, name: impl Into<String>) -> Result<(), KernelError> {
        self.runtime.register_command_fallback_block(
            self.scope,
            self.command_realm.clone(),
            name.into(),
        )
    }

    /// Invoke a command by name. This is the whole dispatch layer: bridges call it, plugins call
    /// it, nobody maintains a table.
    pub async fn call(&self, name: &str, args: Value) -> Result<Value, KernelError> {
        let handler = self
            .runtime
            .command_handler(&self.command_realm, name)?
            .ok_or_else(|| KernelError::UnknownCommand(name.to_string()))?;
        handler(self.command_realm.clone(), args)
            .await
            .map_err(|error| KernelError::Command {
                name: name.to_string(),
                message: error.0,
            })
    }

    /// Invoke a command on behalf of an out-of-process extension.
    ///
    /// Resolution follows the same project-local then global-fallback rules as [`Context::call`],
    /// but refuses the resolved command unless it was explicitly published for extensions.
    pub async fn call_extension_public(
        &self,
        name: &str,
        args: Value,
    ) -> Result<Value, KernelError> {
        let handler = self
            .runtime
            .extension_public_command_handler(&self.command_realm, name)?
            .ok_or_else(|| KernelError::UnknownCommand(name.to_string()))?;
        handler(self.command_realm.clone(), args)
            .await
            .map_err(|error| KernelError::Command {
                name: name.to_string(),
                message: error.0,
            })
    }

    /// Commands effectively visible to an extension in this command realm.
    pub fn extension_public_commands(&self) -> Vec<CommandInfo> {
        self.runtime.extension_public_commands(&self.command_realm)
    }

    /// Invoke a command and deserialize the result.
    pub async fn call_as<T: serde::de::DeserializeOwned>(
        &self,
        name: &str,
        args: Value,
    ) -> Result<T, KernelError> {
        let value = self.call(name, args).await?;
        serde_json::from_value(value).map_err(|error| KernelError::command(name, error))
    }
}

/// A [`Context`] that does not keep the runtime alive.
///
/// The one wrinkle Rust adds to the cordis model. A command handler or listener is *stored in the
/// runtime*, so capturing a strong `Context` inside one makes a cycle that outlives the app. Most
/// handlers only need the services they closed over, which is fine — but when a handler genuinely
/// has to call back into the graph (emit an event, invoke another command), capture
/// [`Context::weak`] and upgrade at the point of use.
#[derive(Clone)]
pub struct WeakContext {
    runtime: std::sync::Weak<Runtime>,
    scope: ScopeId,
    generation: u64,
    command_realm: CommandRealm,
    isolate: Arc<HashMap<String, u64>>,
}

impl WeakContext {
    /// `None` once the app is dropped or the owning scope is disposed or reloaded.
    pub fn upgrade(&self) -> Option<Context> {
        let runtime = self.runtime.upgrade()?;
        if !runtime.scope_generation_is_current(self.scope, self.generation) {
            return None;
        }
        Some(Context {
            runtime,
            scope: self.scope,
            generation: self.generation,
            command_realm: self.command_realm.clone(),
            isolate: self.isolate.clone(),
        })
    }
}

impl Context {
    /// A handle to this context that does not keep the app alive. See [`WeakContext`].
    pub fn weak(&self) -> WeakContext {
        WeakContext {
            runtime: Arc::downgrade(&self.runtime),
            scope: self.scope,
            generation: self.generation,
            command_realm: self.command_realm.clone(),
            isolate: self.isolate.clone(),
        }
    }
}

/// A loaded plugin instance — cordis' `ForkScope`. Keeps the handle to unload or reconfigure it.
pub struct Fork {
    runtime: Arc<Runtime>,
    scope: ScopeId,
}

impl Fork {
    pub fn id(&self) -> ScopeId {
        self.scope
    }

    pub fn status(&self) -> Status {
        self.runtime.status(self.scope)
    }

    /// Reconfigure: the plugin is torn down and re-applied with the new config. No-op if the
    /// config is unchanged.
    pub fn update(&self, config: Value) {
        self.runtime.set_config(self.scope, config);
    }

    /// Unload for good, with the whole subtree under it.
    pub fn dispose(&self) {
        self.runtime.dispose_scope(self.scope);
    }

    /// Await quiescence and report where the plugin landed.
    pub async fn wait(&self) -> Status {
        self.runtime.flush().await;
        self.status()
    }
}

/// The application root: a [`Runtime`] plus its root [`Context`].
///
/// Everything else — including the parts of C2 that used to be "the core" — hangs off this as a
/// plugin.
pub struct App {
    runtime: Arc<Runtime>,
    root: Context,
}

impl App {
    /// Create a runtime. Must be called from a Tokio context: the driver task starts here.
    pub fn new() -> App {
        let runtime = Runtime::new();
        let root = Context::for_scope(runtime.clone(), ROOT_SCOPE);
        App { runtime, root }
    }

    /// The root context. Load your top-level plugins into this.
    pub fn ctx(&self) -> Context {
        self.root.clone()
    }

    pub fn runtime(&self) -> &Arc<Runtime> {
        &self.runtime
    }

    /// Wait for the graph to settle.
    pub async fn flush(&self) {
        self.runtime.flush().await;
    }

    /// Unload everything, in reverse. Used at shutdown and by tests.
    pub async fn stop(&self) {
        let roots: Vec<ScopeId> = self
            .runtime
            .scopes()
            .into_iter()
            .filter(|scope| scope.parent == Some(ROOT_SCOPE))
            .map(|scope| scope.id)
            .collect();
        for scope in roots.into_iter().rev() {
            self.runtime.dispose_scope(scope);
        }
        self.flush().await;
    }
}

impl Default for App {
    fn default() -> Self {
        App::new()
    }
}
