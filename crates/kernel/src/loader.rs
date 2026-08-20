//! The loader — config decides what runs.
//!
//! `@cordisjs/loader` reads `cordis.yml` and keeps the running plugin graph equal to it: add an
//! entry and the plugin loads, remove it and the plugin unloads, edit its config and it reloads.
//! Nothing restarts. This is the same idea over a [`PluginRegistry`] of buildable plugins.
//!
//! Rust cannot load code at runtime the way Node can `import()`, so "what is installable" is a
//! compile-time set and "what is *running*" is a runtime decision. That split is the honest one:
//! the graph, the wiring, the lifecycle, and the config surface are all fully dynamic, and only
//! the machine code is fixed. Out-of-process plugins (MCP servers, ACP agents) already extend past
//! that boundary, and a plugin can register more factories at runtime through
//! [`PluginRegistry::register_arc`].

use crate::context::{Context, Fork};
use crate::error::KernelError;
use crate::plugin::{Injection, Plugin, PluginMetadata};
use crate::runtime::Status;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::Arc;

type Builder = Arc<dyn Fn() -> Arc<dyn Plugin> + Send + Sync>;

/// One installable plugin: how to build it, and what to tell the user about it.
#[derive(Clone)]
pub struct PluginFactory {
    pub name: String,
    pub description: Option<String>,
    pub schema: Option<Value>,
    pub metadata: PluginMetadata,
    pub dependencies: Injection,
    build: Builder,
}

impl PluginFactory {
    pub fn build(&self) -> Arc<dyn Plugin> {
        (self.build)()
    }
}

/// What the loader can load, keyed by plugin name.
#[derive(Clone, Default)]
pub struct PluginRegistry {
    factories: BTreeMap<String, PluginFactory>,
}

impl PluginRegistry {
    pub fn new() -> PluginRegistry {
        PluginRegistry::default()
    }

    /// Register a plugin type. The closure is called once per load, so every instance is fresh.
    pub fn register<P, F>(&mut self, build: F)
    where
        P: Plugin,
        F: Fn() -> P + Send + Sync + 'static,
    {
        let probe = build();
        let name = probe.name().to_string();
        let description = probe.description().map(str::to_string);
        let schema = probe.schema();
        let metadata = probe.metadata();
        let dependencies = probe.inject();
        drop(probe);
        self.factories.insert(
            name.clone(),
            PluginFactory {
                name,
                description,
                schema,
                metadata,
                dependencies,
                build: Arc::new(move || Arc::new(build()) as Arc<dyn Plugin>),
            },
        );
    }

    /// Register a builder that yields an already-boxed plugin — for plugins assembled at runtime.
    pub fn register_arc(&mut self, build: Box<dyn Fn() -> Arc<dyn Plugin> + Send + Sync>) {
        let build: Builder = build.into();
        let probe = build();
        let name = probe.name().to_string();
        let description = probe.description().map(str::to_string);
        let schema = probe.schema();
        let metadata = probe.metadata();
        let dependencies = probe.inject();
        self.factories.insert(
            name.clone(),
            PluginFactory {
                name,
                description,
                schema,
                metadata,
                dependencies,
                build,
            },
        );
    }

    pub fn get(&self, name: &str) -> Option<&PluginFactory> {
        self.factories.get(name)
    }

    /// Remove one factory from a cloned desired registry.
    ///
    /// This only changes what the registry can build. A live [`Loader`] observes the new desired
    /// set through [`Loader::reconcile_registry`], which owns unloading and revision tracking.
    pub fn unregister(&mut self, name: &str) -> bool {
        self.factories.remove(name).is_some()
    }

    /// Merge another desired registry into this one. Factories from `other` win on name conflicts.
    pub fn extend(&mut self, other: PluginRegistry) {
        self.factories.extend(other.factories);
    }

    /// Override catalog metadata after registration.
    ///
    /// Hosts use this to classify a whole registry in one place instead of coupling otherwise
    /// reusable plugin implementations to a particular product surface.
    pub fn set_metadata(
        &mut self,
        name: &str,
        metadata: PluginMetadata,
    ) -> Result<(), KernelError> {
        let factory = self
            .factories
            .get_mut(name)
            .ok_or_else(|| KernelError::UnknownPlugin(name.to_string()))?;
        factory.metadata = metadata;
        Ok(())
    }

    pub fn names(&self) -> Vec<String> {
        self.factories.keys().cloned().collect()
    }

    pub fn factories(&self) -> impl Iterator<Item = &PluginFactory> {
        self.factories.values()
    }

    /// Clone the factories accepted by `predicate` into an independent registry.
    ///
    /// Factories are cheap, shared builders. The returned registry can therefore back a child
    /// loader without coupling that loader's configuration or lifecycle to the parent graph.
    pub fn filtered(&self, mut predicate: impl FnMut(&PluginFactory) -> bool) -> PluginRegistry {
        PluginRegistry {
            factories: self
                .factories
                .iter()
                .filter(|(_, factory)| predicate(factory))
                .map(|(name, factory)| (name.clone(), factory.clone()))
                .collect(),
        }
    }
}

/// One line of the plugin config file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PluginEntry {
    /// Disabled plugins stay installed and configured but do not run.
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Passed to `apply` verbatim. Changing it reloads the plugin.
    #[serde(default)]
    pub config: Value,
}

fn default_true() -> bool {
    true
}

impl Default for PluginEntry {
    fn default() -> Self {
        PluginEntry {
            enabled: true,
            config: Value::Null,
        }
    }
}

impl PluginEntry {
    pub fn with_config(config: Value) -> PluginEntry {
        PluginEntry {
            enabled: true,
            config,
        }
    }

    pub fn disabled() -> PluginEntry {
        PluginEntry {
            enabled: false,
            config: Value::Null,
        }
    }
}

/// The declarative shape of a running app: which plugins, with which config.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct LoaderConfig {
    #[serde(default)]
    pub plugins: BTreeMap<String, PluginEntry>,
}

impl LoaderConfig {
    pub fn with(mut self, name: impl Into<String>, entry: PluginEntry) -> Self {
        self.plugins.insert(name.into(), entry);
        self
    }

    /// Enable a list of plugins with default config — the common case.
    pub fn enable<I, S>(mut self, names: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        for name in names {
            self.plugins.insert(name.into(), PluginEntry::default());
        }
        self
    }
}

/// What the plugin manager shows for one entry.
#[derive(Debug, Clone, Serialize)]
pub struct LoaderEntryInfo {
    pub name: String,
    pub description: Option<String>,
    pub metadata: PluginMetadata,
    pub dependencies: Injection,
    pub enabled: bool,
    pub running: bool,
    pub status: Option<Status>,
    pub config: Value,
    pub schema: Option<Value>,
    /// Registered but never mentioned in the config — installable, not installed.
    pub available: bool,
}

/// The diagnostics from one accepted or rejected registry reconciliation.
///
/// Unknown config entries match legacy [`Loader::apply`] semantics: the desired graph is accepted
/// and they are reported as warnings. Errors mean the operation was rejected before changing the
/// registry, config, live forks, or revision.
#[derive(Debug, Default)]
pub struct LoaderReconcileResult {
    warnings: Vec<KernelError>,
    errors: Vec<KernelError>,
}

impl LoaderReconcileResult {
    fn accepted(warnings: Vec<KernelError>) -> Self {
        Self {
            warnings,
            errors: Vec::new(),
        }
    }

    fn rejected(errors: Vec<KernelError>) -> Self {
        Self {
            warnings: Vec::new(),
            errors,
        }
    }

    pub fn is_accepted(&self) -> bool {
        self.errors.is_empty()
    }

    pub fn warnings(&self) -> &[KernelError] {
        &self.warnings
    }

    pub fn errors(&self) -> &[KernelError] {
        &self.errors
    }

    pub fn extend(&mut self, other: LoaderReconcileResult) {
        self.warnings.extend(other.warnings);
        self.errors.extend(other.errors);
    }

    pub fn into_errors(self) -> Vec<KernelError> {
        self.errors
    }

    fn into_legacy_diagnostics(mut self) -> Vec<KernelError> {
        self.warnings.append(&mut self.errors);
        self.warnings
    }
}

/// Keeps the running graph equal to a [`LoaderConfig`].
pub struct Loader {
    ctx: Context,
    registry: PluginRegistry,
    forks: HashMap<String, Fork>,
    config: LoaderConfig,
    revision: u64,
}

impl Loader {
    pub fn new(ctx: Context, registry: PluginRegistry) -> Loader {
        Loader {
            ctx,
            registry,
            forks: HashMap::new(),
            config: LoaderConfig::default(),
            revision: 0,
        }
    }

    pub fn registry(&self) -> &PluginRegistry {
        &self.registry
    }

    pub fn config(&self) -> &LoaderConfig {
        &self.config
    }

    /// Monotonically increasing version of the accepted loader graph.
    ///
    /// Configuration and registry reconciliation both affect this value. A rejected
    /// essential-plugin change and an identical reconciliation leave it unchanged.
    pub fn revision(&self) -> u64 {
        self.revision
    }

    /// Make the running graph match `config`.
    ///
    /// Unknown plugin names are collected and returned rather than aborting the whole apply: one
    /// stale line in a config file should not take the app down with it.
    pub fn apply(&mut self, config: LoaderConfig) -> Vec<KernelError> {
        self.reconcile_registry(self.registry.clone(), std::iter::empty::<String>(), config)
            .into_legacy_diagnostics()
    }

    /// Atomically accept a complete installable registry and loader configuration.
    ///
    /// `changed` names identify factories whose builder changed while their stable name remained
    /// the same. Added and removed names, plus visible descriptor changes, are detected directly.
    /// A changed live factory is disposed and rebuilt from the new registry when it remains enabled.
    /// Registry and config changes share one graph revision, so one reconciliation advances it at
    /// most once. Synchronous diagnostics follow [`Loader::apply`]: protected essential changes
    /// reject the whole operation, while unknown config entries are accepted warnings.
    pub fn reconcile_registry<I, S>(
        &mut self,
        registry: PluginRegistry,
        changed: I,
        config: LoaderConfig,
    ) -> LoaderReconcileResult
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        let old_names = self.registry.names().into_iter().collect::<BTreeSet<_>>();
        let new_names = registry.names().into_iter().collect::<BTreeSet<_>>();
        let mut changed = changed
            .into_iter()
            .map(Into::into)
            .filter(|name| old_names.contains(name) || new_names.contains(name))
            .collect::<BTreeSet<_>>();
        changed.extend(old_names.symmetric_difference(&new_names).cloned());
        for name in old_names.intersection(&new_names) {
            let old = self
                .registry
                .get(name)
                .expect("old registry name must resolve");
            let new = registry.get(name).expect("new registry name must resolve");
            if factory_descriptor_changed(old, new) {
                changed.insert(name.clone());
            }
        }

        let protected = old_names
            .union(&new_names)
            .filter_map(|name| {
                let old = self.registry.get(name);
                let new = registry.get(name);
                let essential = old.is_some_and(|factory| factory.metadata.essential)
                    || new.is_some_and(|factory| factory.metadata.essential);
                if !essential {
                    return None;
                }
                let removes_essential =
                    old.is_some_and(|factory| factory.metadata.essential) && new.is_none();
                let disables_essential = match config.plugins.get(name) {
                    Some(entry) => !entry.enabled,
                    None => self
                        .config
                        .plugins
                        .get(name)
                        .is_some_and(|entry| entry.enabled),
                };
                (removes_essential || disables_essential).then(|| name.clone())
            })
            .collect::<Vec<_>>();
        if !protected.is_empty() {
            return LoaderReconcileResult::rejected(
                protected
                    .into_iter()
                    .map(KernelError::EssentialPlugin)
                    .collect(),
            );
        }

        let graph_changed = !changed.is_empty() || config != self.config;
        let mut errors = Vec::new();

        // Gone, turned off, or replaced → unload. Disposal is queued before the replacement scope
        // is spawned below, so the driver tears down old registrations before applying the new one.
        let running: Vec<String> = self.forks.keys().cloned().collect();
        for name in running {
            let wanted = config
                .plugins
                .get(&name)
                .map(|entry| entry.enabled)
                .unwrap_or(false);
            if !wanted || changed.contains(&name) || !new_names.contains(&name) {
                if let Some(fork) = self.forks.remove(&name) {
                    fork.dispose();
                }
            }
        }

        self.registry = registry;

        for (name, entry) in &config.plugins {
            if !entry.enabled {
                continue;
            }
            match self.forks.get(name) {
                // Already running → reconfigure in place (a no-op when the config is unchanged).
                Some(fork) => fork.update(entry.config.clone()),
                None => {
                    let Some(factory) = self.registry.get(name) else {
                        errors.push(KernelError::UnknownPlugin(name.clone()));
                        continue;
                    };
                    let fork = self.ctx.plugin_arc(factory.build(), entry.config.clone());
                    self.forks.insert(name.clone(), fork);
                }
            }
        }

        self.config = config;
        if graph_changed {
            self.revision = self.revision.saturating_add(1);
        }
        LoaderReconcileResult::accepted(errors)
    }

    /// Turn one plugin on or off, keeping the rest of the graph untouched.
    pub fn set_enabled(&mut self, name: &str, enabled: bool) -> Vec<KernelError> {
        if !enabled
            && self
                .registry
                .get(name)
                .is_some_and(|factory| factory.metadata.essential)
        {
            return vec![KernelError::EssentialPlugin(name.to_string())];
        }
        let mut config = self.config.clone();
        let entry = config.plugins.entry(name.to_string()).or_default();
        entry.enabled = enabled;
        self.apply(config)
    }

    /// Replace one plugin's config. It reloads; nothing else does.
    pub fn reconfigure(&mut self, name: &str, plugin_config: Value) -> Vec<KernelError> {
        let mut config = self.config.clone();
        let entry = config.plugins.entry(name.to_string()).or_default();
        entry.config = plugin_config;
        entry.enabled = true;
        self.apply(config)
    }

    /// Everything installable, running or not.
    pub fn entries(&self) -> Vec<LoaderEntryInfo> {
        let mut out: Vec<LoaderEntryInfo> = self
            .registry
            .factories()
            .map(|factory| {
                let entry = self.config.plugins.get(&factory.name);
                let fork = self.forks.get(&factory.name);
                LoaderEntryInfo {
                    name: factory.name.clone(),
                    description: factory.description.clone(),
                    metadata: factory.metadata.clone(),
                    dependencies: factory.dependencies.clone(),
                    enabled: entry.map(|entry| entry.enabled).unwrap_or(false),
                    running: fork.is_some(),
                    status: fork.map(|fork| fork.status()),
                    config: entry
                        .map(|entry| entry.config.clone())
                        .unwrap_or(Value::Null),
                    schema: factory.schema.clone(),
                    available: entry.is_none(),
                }
            })
            .collect();
        out.sort_by(|a, b| a.name.cmp(&b.name));
        out
    }

    /// Dispose every live fork owned by this loader.
    ///
    /// Disposal is queued on the kernel driver. Callers that need to observe the completed
    /// teardown should flush the loader context afterwards.
    pub fn shutdown(&mut self) {
        for (_, fork) in self.forks.drain() {
            fork.dispose();
        }
        if !self.config.plugins.is_empty() {
            self.config = LoaderConfig::default();
            self.revision = self.revision.saturating_add(1);
        }
    }
}

fn factory_descriptor_changed(old: &PluginFactory, new: &PluginFactory) -> bool {
    old.description != new.description
        || old.schema != new.schema
        || old.metadata != new.metadata
        || old.dependencies != new.dependencies
}

impl Drop for Loader {
    fn drop(&mut self) {
        self.shutdown();
    }
}
