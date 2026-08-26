//! The runtime: scopes, the service table, and the single-threaded driver that loads and unloads
//! them.
//!
//! # Why a driver task
//!
//! Loading is asynchronous (a plugin may open a database, spawn a process, probe the network), and
//! plugins mutate the graph *from inside* `apply` — providing services, loading children. Doing
//! that with a lock held is how you get re-entrancy bugs; doing it with a lock released is how you
//! get races. So the kernel does neither: mutations enqueue [`Job`]s, and one driver task runs them
//! **strictly in order**. Inside `apply` nothing else is loading, and no lock is held across an
//! await. [`Runtime::flush`] awaits quiescence for anyone who needs to observe the settled graph.
//!
//! # Why reload instead of patch
//!
//! When an injected service is replaced, the kernel tears the dependent scope down completely and
//! runs `apply` again. It never asks a plugin to *migrate*. That is the trade cordis makes and it
//! is the right one: "undo everything and redo it" is a property the kernel can guarantee, while
//! "handle your dependency being swapped underneath you" is a correctness burden every plugin
//! author would have to carry, and most would carry wrongly.

use crate::command::{CommandEntry, CommandInfo, CommandRealm, CommandVisibility};
use crate::error::{KernelError, PluginError};
use crate::event::{Event, JsonListenerEntry, ListenerEntry};
use crate::plugin::{Injection, Plugin};
use crate::service::{AnyService, ServiceInfo};
use serde_json::Value;
use std::any::TypeId;
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, MutexGuard, Weak};
use tokio::sync::Notify;

/// Identifies a scope — one plugin instance, or the root.
pub type ScopeId = u64;

/// The root scope. Always active, never disposed.
pub const ROOT_SCOPE: ScopeId = 0;

/// Global (non-isolated) service realm.
pub const GLOBAL_REALM: u64 = 0;

/// Where a scope is in its lifecycle. Mirrors cordis' `ScopeStatus`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    /// Waiting for its injected services. Not a failure — most plugins start here.
    Pending,
    /// `apply` is running.
    Loading,
    /// Loaded. Its services, listeners and commands are live.
    Active,
    /// `apply` returned an error. Its scope is empty; the rest of the graph is unaffected.
    Failed,
    /// Unloaded for good.
    Disposed,
}

/// A scope as seen from outside — what a plugin manager renders.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ScopeInfo {
    pub id: ScopeId,
    pub parent: Option<ScopeId>,
    pub plugin: String,
    pub status: Status,
    pub error: Option<String>,
    pub inject: Injection,
    /// Injected names that are currently missing — why a pending plugin is pending.
    pub missing: Vec<String>,
    pub services: Vec<String>,
    pub commands: Vec<String>,
    pub command_realm: CommandRealm,
    pub config: Value,
}

pub(crate) struct ScopeState {
    id: ScopeId,
    parent: Option<ScopeId>,
    children: Vec<ScopeId>,
    plugin: Option<Arc<dyn Plugin>>,
    name: String,
    config: Value,
    inject: Injection,
    isolate: Arc<HashMap<String, u64>>,
    status: Status,
    error: Option<String>,
    /// Bumped on every teardown so a slow `apply` can tell it has been superseded.
    generation: u64,
    disposables: Vec<Box<dyn FnOnce() + Send>>,
    services: Vec<(String, u64)>,
    commands: Vec<(CommandRealm, String)>,
    command_fallback_blocks: Vec<(CommandRealm, String)>,
    command_realm: CommandRealm,
}

struct ServiceRecord {
    value: AnyService,
    provider: ScopeId,
}

#[derive(Debug)]
pub(crate) enum Job {
    /// (Re)evaluate a scope against its injections and load, unload, or reload it.
    Refresh(ScopeId),
    /// Unload for good and forget the scope.
    Dispose(ScopeId),
}

pub(crate) struct State {
    scopes: HashMap<ScopeId, ScopeState>,
    next_scope: ScopeId,
    next_realm: u64,
    next_seq: u64,
    services: HashMap<(String, u64), ServiceRecord>,
    listeners: HashMap<TypeId, Vec<ListenerEntry>>,
    json_listeners: HashMap<String, Vec<JsonListenerEntry>>,
    commands: HashMap<(CommandRealm, String), CommandEntry>,
    /// Project scopes that deliberately suppress inheritance of a global command. A set of owner
    /// scopes makes blocker replacement race-free: an old fork may be queued for disposal while
    /// its replacement is already queued to load.
    command_fallback_blocks: HashMap<(CommandRealm, String), std::collections::HashSet<ScopeId>>,
    queue: VecDeque<Job>,
    /// Scopes with a refresh already waiting. Two changes before the driver gets to either one is
    /// one reload, not two — otherwise every plugin loaded before its dependency would apply twice.
    queued_refresh: std::collections::HashSet<ScopeId>,
    running: usize,
    ready_emitted: bool,
}

/// Owns the plugin graph. Reached through a [`Context`](crate::Context); you rarely hold one
/// directly except to introspect ([`Runtime::scopes`], [`Runtime::services`]).
pub struct Runtime {
    state: Mutex<State>,
    wake: Arc<Notify>,
    idle: Arc<Notify>,
}

fn resolve_command_entry<'a>(
    state: &'a State,
    realm: &CommandRealm,
    name: &str,
) -> Result<Option<(CommandRealm, &'a CommandEntry)>, KernelError> {
    let local = (realm.clone(), name.to_string());
    if let Some(entry) = state.commands.get(&local) {
        return Ok(Some((realm.clone(), entry)));
    }
    if matches!(realm, CommandRealm::Global) {
        return Ok(None);
    }
    if state
        .command_fallback_blocks
        .get(&local)
        .is_some_and(|owners| !owners.is_empty())
    {
        return Err(KernelError::CommandFallbackBlocked {
            realm: realm.clone(),
            name: name.to_string(),
        });
    }
    Ok(state
        .commands
        .get(&(CommandRealm::Global, name.to_string()))
        .map(|entry| (CommandRealm::Global, entry)))
}

impl Runtime {
    pub(crate) fn new() -> Arc<Runtime> {
        let root = ScopeState {
            id: ROOT_SCOPE,
            parent: None,
            children: Vec::new(),
            plugin: None,
            name: "root".into(),
            config: Value::Null,
            inject: Injection::default(),
            isolate: Arc::new(HashMap::new()),
            status: Status::Active,
            error: None,
            generation: 0,
            disposables: Vec::new(),
            services: Vec::new(),
            commands: Vec::new(),
            command_fallback_blocks: Vec::new(),
            command_realm: CommandRealm::Global,
        };
        let runtime = Arc::new(Runtime {
            state: Mutex::new(State {
                scopes: HashMap::from([(ROOT_SCOPE, root)]),
                next_scope: 1,
                next_realm: 1,
                next_seq: 0,
                services: HashMap::new(),
                listeners: HashMap::new(),
                json_listeners: HashMap::new(),
                commands: HashMap::new(),
                command_fallback_blocks: HashMap::new(),
                queue: VecDeque::new(),
                queued_refresh: std::collections::HashSet::new(),
                running: 0,
                ready_emitted: false,
            }),
            wake: Arc::new(Notify::new()),
            idle: Arc::new(Notify::new()),
        });
        let weak = Arc::downgrade(&runtime);
        tokio::spawn(async move { drive(weak).await });
        runtime
    }

    pub(crate) fn state(&self) -> MutexGuard<'_, State> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Wait until the graph is settled: no job queued, none running.
    ///
    /// Do not call this from inside `apply` — the driver is *you*, and it will never be idle.
    pub async fn flush(&self) {
        loop {
            let notified = self.idle.notified();
            tokio::pin!(notified);
            // Arm before checking, or a wakeup between the check and the await is lost.
            notified.as_mut().enable();
            {
                let state = self.state();
                if state.queue.is_empty() && state.running == 0 && state.ready_emitted {
                    return;
                }
            }
            notified.await;
        }
    }

    /// Every scope in the graph, roots first.
    pub fn scopes(&self) -> Vec<ScopeInfo> {
        let state = self.state();
        let mut ids: Vec<_> = state.scopes.keys().copied().collect();
        ids.sort_unstable();
        ids.iter()
            .filter_map(|id| state.scopes.get(id))
            .map(|scope| ScopeInfo {
                id: scope.id,
                parent: scope.parent,
                plugin: scope.name.clone(),
                status: scope.status,
                error: scope.error.clone(),
                inject: scope.inject.clone(),
                missing: missing_injections(&state, scope),
                services: scope
                    .services
                    .iter()
                    .map(|(name, _)| name.clone())
                    .collect(),
                commands: scope
                    .commands
                    .iter()
                    .map(|(_, name)| name.clone())
                    .collect(),
                command_realm: scope.command_realm.clone(),
                config: scope.config.clone(),
            })
            .collect()
    }

    /// Status of one scope, or [`Status::Disposed`] if it is gone.
    pub fn status(&self, scope: ScopeId) -> Status {
        self.state()
            .scopes
            .get(&scope)
            .map(|s| s.status)
            .unwrap_or(Status::Disposed)
    }

    pub(crate) fn scope_generation(&self, scope: ScopeId) -> Option<u64> {
        self.state()
            .scopes
            .get(&scope)
            .map(|scope| scope.generation)
    }

    pub(crate) fn scope_generation_is_current(&self, scope: ScopeId, generation: u64) -> bool {
        self.state()
            .scopes
            .get(&scope)
            .is_some_and(|scope| scope.generation == generation)
    }

    /// Every live service and who provides it.
    pub fn services(&self) -> Vec<ServiceInfo> {
        let state = self.state();
        let mut out: Vec<_> = state
            .services
            .iter()
            .map(|((name, realm), record)| ServiceInfo {
                name: name.clone(),
                realm: *realm,
                provider: record.provider,
                plugin: state
                    .scopes
                    .get(&record.provider)
                    .map(|s| s.name.clone())
                    .unwrap_or_default(),
            })
            .collect();
        out.sort_by(|a, b| (&a.name, a.realm).cmp(&(&b.name, b.realm)));
        out
    }

    /// Every registered command and who contributed it.
    pub fn commands(&self) -> Vec<CommandInfo> {
        let state = self.state();
        let mut out: Vec<_> = state
            .commands
            .iter()
            .map(|((realm, name), entry)| CommandInfo {
                name: name.clone(),
                realm: realm.clone(),
                plugin: state
                    .scopes
                    .get(&entry.scope)
                    .map(|s| s.name.clone())
                    .unwrap_or_default(),
                scope: entry.scope,
                description: entry.description.clone(),
                visibility: entry.visibility,
            })
            .collect();
        out.sort_by(|a, b| (&a.name, &a.realm).cmp(&(&b.name, &b.realm)));
        out
    }

    // ---- internals used by Context -------------------------------------------------------

    pub(crate) fn next_seq(state: &mut State) -> u64 {
        state.next_seq += 1;
        state.next_seq
    }

    pub(crate) fn new_realm(&self) -> u64 {
        let mut state = self.state();
        let realm = state.next_realm;
        state.next_realm += 1;
        realm
    }

    pub(crate) fn enqueue(&self, job: Job) {
        self.state().queue.push_back(job);
        self.wake.notify_one();
    }

    pub(crate) fn refresh(&self, scope: ScopeId) {
        {
            let mut state = self.state();
            if !state.queued_refresh.insert(scope) {
                return;
            }
            state.queue.push_back(Job::Refresh(scope));
        }
        self.wake.notify_one();
    }

    pub(crate) fn dispose_scope(&self, scope: ScopeId) {
        self.enqueue(Job::Dispose(scope));
    }

    pub(crate) fn spawn_scope(
        &self,
        parent: ScopeId,
        plugin: Arc<dyn Plugin>,
        config: Value,
        isolate: Arc<HashMap<String, u64>>,
        command_realm: CommandRealm,
    ) -> ScopeId {
        let id = {
            let mut state = self.state();
            let id = state.next_scope;
            state.next_scope += 1;
            let scope = ScopeState {
                id,
                parent: Some(parent),
                children: Vec::new(),
                name: plugin.name().to_string(),
                inject: plugin.inject(),
                plugin: Some(plugin),
                config,
                isolate,
                status: Status::Pending,
                error: None,
                generation: 0,
                disposables: Vec::new(),
                services: Vec::new(),
                commands: Vec::new(),
                command_fallback_blocks: Vec::new(),
                command_realm,
            };
            state.scopes.insert(id, scope);
            if let Some(parent) = state.scopes.get_mut(&parent) {
                parent.children.push(id);
            }
            id
        };
        self.refresh(id);
        id
    }

    pub(crate) fn set_config(&self, scope: ScopeId, config: Value) {
        {
            let mut state = self.state();
            let Some(entry) = state.scopes.get_mut(&scope) else {
                return;
            };
            if entry.config == config {
                return;
            }
            entry.config = config;
        }
        self.refresh(scope);
    }

    pub(crate) fn lookup_service(
        &self,
        name: &str,
        isolate: &HashMap<String, u64>,
    ) -> Option<AnyService> {
        let realm = isolate.get(name).copied().unwrap_or(GLOBAL_REALM);
        self.state()
            .services
            .get(&(name.to_string(), realm))
            .map(|record| record.value.clone())
    }

    pub(crate) fn provide_service(
        &self,
        scope: ScopeId,
        name: &str,
        value: AnyService,
        isolate: &HashMap<String, u64>,
    ) -> Result<(), KernelError> {
        let realm = isolate.get(name).copied().unwrap_or(GLOBAL_REALM);
        let key = (name.to_string(), realm);
        {
            let mut state = self.state();
            if state.services.contains_key(&key) {
                return Err(KernelError::ServiceConflict(name.to_string()));
            }
            if !state.scopes.contains_key(&scope) {
                return Err(KernelError::Disposed);
            }
            state.services.insert(
                key,
                ServiceRecord {
                    value,
                    provider: scope,
                },
            );
            if let Some(entry) = state.scopes.get_mut(&scope) {
                entry.services.push((name.to_string(), realm));
            }
        }
        self.notify_service_change(name, realm, scope);
        Ok(())
    }

    pub(crate) fn register_command(
        &self,
        scope: ScopeId,
        realm: CommandRealm,
        name: String,
        description: Option<String>,
        visibility: CommandVisibility,
        handler: crate::command::CommandHandler,
    ) -> Result<(), KernelError> {
        let mut state = self.state();
        let key = (realm, name.clone());
        if state.commands.contains_key(&key) {
            return Err(KernelError::CommandConflict(name));
        }
        if !state.scopes.contains_key(&scope) {
            return Err(KernelError::Disposed);
        }
        state.commands.insert(
            key.clone(),
            CommandEntry {
                scope,
                handler,
                description,
                visibility,
            },
        );
        if let Some(entry) = state.scopes.get_mut(&scope) {
            entry.commands.push(key);
        }
        Ok(())
    }

    pub(crate) fn command_handler(
        &self,
        realm: &CommandRealm,
        name: &str,
    ) -> Result<Option<crate::command::CommandHandler>, KernelError> {
        let state = self.state();
        Ok(resolve_command_entry(&state, realm, name)?.map(|(_, entry)| entry.handler.clone()))
    }

    pub(crate) fn extension_public_command_handler(
        &self,
        realm: &CommandRealm,
        name: &str,
    ) -> Result<Option<crate::command::CommandHandler>, KernelError> {
        let state = self.state();
        let Some((_, entry)) = resolve_command_entry(&state, realm, name)? else {
            return Ok(None);
        };
        if entry.visibility != CommandVisibility::ExtensionPublic {
            return Err(KernelError::CommandNotExtensionPublic(name.to_string()));
        }
        Ok(Some(entry.handler.clone()))
    }

    pub(crate) fn extension_public_commands(&self, realm: &CommandRealm) -> Vec<CommandInfo> {
        let state = self.state();
        let names = state
            .commands
            .keys()
            .filter(|(candidate_realm, _)| {
                candidate_realm == realm
                    || (!matches!(realm, CommandRealm::Global)
                        && matches!(candidate_realm, CommandRealm::Global))
            })
            .map(|(_, name)| name.clone())
            .collect::<std::collections::BTreeSet<_>>();

        names
            .into_iter()
            .filter_map(|name| {
                let (resolved_realm, entry) =
                    resolve_command_entry(&state, realm, &name).ok()??;
                if entry.visibility != CommandVisibility::ExtensionPublic {
                    return None;
                }
                Some(CommandInfo {
                    name,
                    realm: resolved_realm,
                    plugin: state
                        .scopes
                        .get(&entry.scope)
                        .map(|scope| scope.name.clone())
                        .unwrap_or_default(),
                    scope: entry.scope,
                    description: entry.description.clone(),
                    visibility: entry.visibility,
                })
            })
            .collect()
    }

    pub(crate) fn register_command_fallback_block(
        &self,
        scope: ScopeId,
        realm: CommandRealm,
        name: String,
    ) -> Result<(), KernelError> {
        let mut state = self.state();
        if !state.scopes.contains_key(&scope) {
            return Err(KernelError::Disposed);
        }
        let key = (realm, name);
        state
            .command_fallback_blocks
            .entry(key.clone())
            .or_default()
            .insert(scope);
        if let Some(entry) = state.scopes.get_mut(&scope) {
            entry.command_fallback_blocks.push(key);
        }
        Ok(())
    }

    pub(crate) fn add_disposable(
        &self,
        scope: ScopeId,
        generation: u64,
        dispose: Box<dyn FnOnce() + Send>,
    ) -> bool {
        let mut state = self.state();
        if let Some(entry) = state
            .scopes
            .get_mut(&scope)
            .filter(|entry| entry.generation == generation)
        {
            entry.disposables.push(dispose);
            true
        } else {
            drop(state);
            dispose();
            false
        }
    }

    pub(crate) fn add_listener(&self, type_id: TypeId, entry: ListenerEntry) {
        self.state()
            .listeners
            .entry(type_id)
            .or_default()
            .push(entry);
    }

    pub(crate) fn add_json_listener(
        &self,
        name: String,
        generation: u64,
        entry: JsonListenerEntry,
    ) -> bool {
        let mut state = self.state();
        if state
            .scopes
            .get(&entry.scope)
            .is_some_and(|scope| scope.generation == generation)
        {
            state.json_listeners.entry(name).or_default().push(entry);
            true
        } else {
            false
        }
    }

    /// Snapshot the listeners for an event type. Dispatch happens with the lock released, so a
    /// listener is free to load plugins, provide services, or emit further events.
    pub(crate) fn listeners_for<E: crate::event::Event>(&self) -> Vec<crate::event::Handler<E>> {
        let state = self.state();
        let Some(entries) = state.listeners.get(&TypeId::of::<E>()) else {
            return Vec::new();
        };
        let mut entries: Vec<_> = entries.iter().collect();
        entries.sort_by_key(|entry| entry.seq);
        entries
            .iter()
            .filter_map(|entry| entry.handler.downcast_ref::<crate::event::Handler<E>>())
            .cloned()
            .collect()
    }

    pub(crate) fn json_listeners_for(&self, name: &str) -> Vec<crate::event::JsonHandler> {
        let state = self.state();
        let Some(entries) = state.json_listeners.get(name) else {
            return Vec::new();
        };
        let mut entries: Vec<_> = entries.iter().collect();
        entries.sort_by_key(|entry| entry.seq);
        entries.iter().map(|entry| entry.handler.clone()).collect()
    }

    /// Queue a reload for every scope that injected `name` — except the one that just changed it,
    /// which would otherwise reload itself forever.
    fn notify_service_change(&self, name: &str, realm: u64, origin: ScopeId) {
        let dependents: Vec<ScopeId> = {
            let state = self.state();
            state
                .scopes
                .values()
                .filter(|scope| scope.id != origin)
                .filter(|scope| {
                    scope.inject.watched().any(|watched| watched == name)
                        && scope.isolate.get(name).copied().unwrap_or(GLOBAL_REALM) == realm
                })
                .map(|scope| scope.id)
                .collect()
        };
        for scope in dependents {
            self.refresh(scope);
        }
    }
}

fn missing_injections(state: &State, scope: &ScopeState) -> Vec<String> {
    scope
        .inject
        .required
        .iter()
        .filter(|name| {
            let realm = scope.isolate.get(*name).copied().unwrap_or(GLOBAL_REALM);
            !state.services.contains_key(&((*name).clone(), realm))
        })
        .cloned()
        .collect()
}

fn is_ready(state: &State, id: ScopeId) -> bool {
    let Some(scope) = state.scopes.get(&id) else {
        return false;
    };
    missing_injections(state, scope).is_empty()
}

/// Everything a teardown has to undo, extracted under the lock and executed without it.
struct Teardown {
    disposables: Vec<Box<dyn FnOnce() + Send>>,
    services: Vec<(String, u64)>,
    scope: ScopeId,
}

impl Runtime {
    /// Post-order subtree: children before parents, so a parent's `apply` never observes a
    /// half-disposed child.
    fn subtree(state: &State, root: ScopeId) -> Vec<ScopeId> {
        let mut out = Vec::new();
        let mut stack = vec![root];
        while let Some(id) = stack.pop() {
            let Some(scope) = state.scopes.get(&id) else {
                continue;
            };
            out.push(id);
            stack.extend(scope.children.iter().copied());
        }
        out.reverse();
        out
    }

    /// Strip one scope back to empty. `remove` also forgets it and unlinks it from its parent.
    fn strip(&self, id: ScopeId, remove: bool) -> Option<Teardown> {
        let mut state = self.state();
        let Some(scope) = state.scopes.get_mut(&id) else {
            return None;
        };
        scope.generation += 1;
        let disposables = std::mem::take(&mut scope.disposables);
        let services = std::mem::take(&mut scope.services);
        let commands = std::mem::take(&mut scope.commands);
        let command_fallback_blocks = std::mem::take(&mut scope.command_fallback_blocks);
        scope.error = None;
        scope.status = if remove {
            Status::Disposed
        } else {
            Status::Pending
        };
        let parent = scope.parent;

        for (name, realm) in &services {
            state.services.remove(&(name.clone(), *realm));
        }
        for key in &commands {
            state.commands.remove(key);
        }
        for key in &command_fallback_blocks {
            if let Some(owners) = state.command_fallback_blocks.get_mut(key) {
                owners.remove(&id);
                if owners.is_empty() {
                    state.command_fallback_blocks.remove(key);
                }
            }
        }
        for entries in state.listeners.values_mut() {
            entries.retain(|entry| entry.scope != id);
        }
        for entries in state.json_listeners.values_mut() {
            entries.retain(|entry| entry.scope != id);
        }
        if remove {
            state.scopes.remove(&id);
            if let Some(parent) = parent.and_then(|parent| state.scopes.get_mut(&parent)) {
                parent.children.retain(|child| *child != id);
            }
        }
        Some(Teardown {
            disposables,
            services,
            scope: id,
        })
    }

    /// Everything that has to come down with `root`, in the order it has to come down in:
    /// dependents first, then children, then the scope itself.
    ///
    /// Tearing a dependent down *before* the service it injected is removed is the whole point —
    /// its cleanup code can still use that service. Undoing the provider first would leave every
    /// dependent's `dispose` running against a capability that is already gone.
    fn teardown_plan(state: &State, root: ScopeId, remove: bool) -> Vec<(ScopeId, bool)> {
        let core = Self::subtree(state, root);
        let mut order: Vec<(ScopeId, bool)> =
            core.iter().map(|id| (*id, remove || *id != root)).collect();
        let mut frontier = core;

        loop {
            let known: std::collections::HashSet<ScopeId> =
                order.iter().map(|(id, _)| *id).collect();
            let mut added: Vec<ScopeId> = Vec::new();
            for id in &frontier {
                let Some(scope) = state.scopes.get(id) else {
                    continue;
                };
                for (name, realm) in &scope.services {
                    for other in state.scopes.values() {
                        if known.contains(&other.id) || added.contains(&other.id) {
                            continue;
                        }
                        if !matches!(
                            other.status,
                            Status::Active | Status::Loading | Status::Failed
                        ) {
                            continue;
                        }
                        let same_realm =
                            other.isolate.get(name).copied().unwrap_or(GLOBAL_REALM) == *realm;
                        if same_realm && other.inject.watched().any(|watched| watched == name) {
                            // A dependent brings its own children with it.
                            added.extend(
                                Self::subtree(state, other.id)
                                    .into_iter()
                                    .filter(|id| !known.contains(id)),
                            );
                        }
                    }
                }
            }
            if added.is_empty() {
                return order;
            }
            frontier = added.clone();
            let mut next: Vec<(ScopeId, bool)> = added.into_iter().map(|id| (id, false)).collect();
            next.extend(order);
            order = next;
        }
    }

    /// Unload a scope, its subtree, and everything downstream of the services it provided.
    /// `remove` disposes for good; otherwise the scope returns to [`Status::Pending`] and may
    /// load again once its dependencies are back.
    async fn unload(self: &Arc<Self>, root: ScopeId, remove: bool) {
        let plan = {
            let state = self.state();
            Self::teardown_plan(&state, root, remove)
        };
        let mut teardowns = Vec::new();
        for (id, remove_this) in plan {
            if let Some(teardown) = self.strip(id, remove_this) {
                teardowns.push(teardown);
            }
        }
        // Disposables run outside the lock, newest first: a plugin undoes its own work in reverse.
        let mut withdrawn = Vec::new();
        for teardown in &mut teardowns {
            for dispose in std::mem::take(&mut teardown.disposables).into_iter().rev() {
                // Cleanup is third-party lifecycle code just as much as `Plugin::apply`. One
                // panicking undo callback must not kill the single graph driver, strand future
                // `flush()` calls, or prevent the remaining resources from being withdrawn.
                if std::panic::catch_unwind(std::panic::AssertUnwindSafe(dispose)).is_err() {
                    tracing::error!(scope = %teardown.scope, "plugin cleanup panicked");
                }
            }
            for (name, realm) in std::mem::take(&mut teardown.services) {
                withdrawn.push((name, realm, teardown.scope));
            }
        }
        // Nothing that is not `Send` may survive into the announcements below.
        drop(teardowns);
        for (name, realm, scope) in withdrawn {
            self.notify_service_change(&name, realm, scope);
            self.emit_driver_event(crate::events::ServiceChanged {
                name,
                realm,
                active: false,
            })
            .await;
        }
    }

    async fn run_job(self: &Arc<Self>, job: Job) {
        match job {
            Job::Dispose(id) => {
                let name = self.state().scopes.get(&id).map(|scope| scope.name.clone());
                if let Some(name) = name {
                    self.unload(id, true).await;
                    self.emit_status(id, name, Status::Disposed, None).await;
                }
            }
            Job::Refresh(id) => {
                self.state().queued_refresh.remove(&id);
                self.refresh_scope(id).await;
            }
        }
    }

    async fn refresh_scope(self: &Arc<Self>, id: ScopeId) {
        let (status, ready) = {
            let state = self.state();
            let Some(scope) = state.scopes.get(&id) else {
                return;
            };
            (scope.status, is_ready(&state, id))
        };
        match status {
            Status::Disposed => {}
            Status::Pending => {
                if ready {
                    self.load(id).await;
                }
            }
            Status::Active | Status::Failed | Status::Loading => {
                // Reload: the honest response to any change in what this plugin was built on.
                self.unload(id, false).await;
                let ready = is_ready(&self.state(), id);
                if ready {
                    self.load(id).await;
                }
            }
        }
    }

    async fn load(self: &Arc<Self>, id: ScopeId) {
        let (plugin, config, isolate, command_realm, generation, name) = {
            let mut state = self.state();
            let Some(scope) = state.scopes.get_mut(&id) else {
                return;
            };
            let Some(plugin) = scope.plugin.clone() else {
                return;
            };
            scope.status = Status::Loading;
            (
                plugin,
                scope.config.clone(),
                scope.isolate.clone(),
                scope.command_realm.clone(),
                scope.generation,
                scope.name.clone(),
            )
        };
        self.emit_status(id, name.clone(), Status::Loading, None)
            .await;

        let ctx =
            crate::Context::with_isolate(self.clone(), id, generation, isolate, command_realm);
        // A third-party or host plugin panic is a failed scope, not permission to kill the single
        // graph driver and leave every future `flush()` waiting forever. A nested Tokio task gives
        // us a panic boundary while preserving the driver's strictly serial lifecycle ordering.
        let result = match tokio::spawn(async move { plugin.apply(ctx, config).await }).await {
            Ok(result) => result,
            Err(error) => Err(PluginError(format!("plugin lifecycle panicked: {error}"))),
        };

        // The scope may have been reset or disposed while `apply` was running. If so, whatever it
        // registered belongs to a generation nobody wants — strip it and let the queued refresh win.
        let superseded = {
            let state = self.state();
            match state.scopes.get(&id) {
                None => true,
                Some(scope) => scope.generation != generation,
            }
        };
        if superseded {
            let still_there = self.state().scopes.contains_key(&id);
            if still_there {
                self.unload(id, false).await;
            }
            return;
        }

        let (status, error) = match result {
            Ok(()) => (Status::Active, None),
            Err(PluginError(message)) => {
                tracing::warn!(plugin = %name, error = %message, "plugin failed to load");
                (Status::Failed, Some(message))
            }
        };
        if status == Status::Failed {
            // A half-applied plugin is worse than none: undo whatever it managed to register.
            self.unload(id, false).await;
        }
        let services = {
            let mut state = self.state();
            let Some(scope) = state.scopes.get_mut(&id) else {
                return;
            };
            scope.status = status;
            scope.error = error.clone();
            scope.services.clone()
        };
        for (service, realm) in services {
            self.emit_driver_event(crate::events::ServiceChanged {
                name: service,
                realm,
                active: true,
            })
            .await;
        }
        self.emit_status(id, name, status, error).await;
    }

    async fn emit_status(
        self: &Arc<Self>,
        scope: ScopeId,
        plugin: String,
        status: Status,
        error: Option<String>,
    ) {
        self.emit_driver_event(crate::events::StatusChanged {
            scope,
            plugin,
            status,
            error,
        })
        .await;
    }

    /// Kernel lifecycle notifications execute plugin listeners. Isolate their panics from the
    /// single graph driver just like plugin apply and dispose callbacks, otherwise one observer can
    /// permanently strand every later lifecycle job and `flush()` waiter.
    async fn emit_driver_event<E: Event>(self: &Arc<Self>, event: E) {
        let ctx = crate::Context::for_scope(self.clone(), ROOT_SCOPE);
        if let Err(error) = tokio::spawn(async move { ctx.emit(event).await }).await {
            tracing::error!(event = E::NAME, %error, "plugin lifecycle listener panicked");
        }
    }
}

/// The driver. One task, one job at a time, for the life of the [`Runtime`].
async fn drive(runtime: Weak<Runtime>) {
    loop {
        let Some(rt) = runtime.upgrade() else { return };
        let job = {
            let mut state = rt.state();
            match state.queue.pop_front() {
                Some(job) => {
                    state.running += 1;
                    Some(job)
                }
                None => None,
            }
        };
        if let Some(job) = job {
            rt.run_job(job).await;
            rt.state().running -= 1;
            continue;
        }

        // Quiescent. `ready` fires once, before anyone is told the graph settled.
        let first_idle = {
            let mut state = rt.state();
            let first = !state.ready_emitted;
            state.ready_emitted = true;
            first
        };
        if first_idle {
            rt.emit_driver_event(crate::events::Ready).await;
            continue;
        }

        rt.idle.notify_waiters();
        let wake = rt.wake.clone();
        drop(rt);
        wake.notified().await;
    }
}
