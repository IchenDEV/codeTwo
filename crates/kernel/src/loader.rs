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
use crate::plugin::Plugin;
use crate::runtime::Status;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

type Builder = Box<dyn Fn() -> Arc<dyn Plugin> + Send + Sync>;

/// One installable plugin: how to build it, and what to tell the user about it.
pub struct PluginFactory {
    pub name: String,
    pub description: Option<String>,
    pub schema: Option<Value>,
    build: Builder,
}

impl PluginFactory {
    pub fn build(&self) -> Arc<dyn Plugin> {
        (self.build)()
    }
}

/// What the loader can load, keyed by plugin name.
#[derive(Default)]
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
        drop(probe);
        self.factories.insert(
            name.clone(),
            PluginFactory {
                name,
                description,
                schema,
                build: Box::new(move || Arc::new(build()) as Arc<dyn Plugin>),
            },
        );
    }

    /// Register a builder that yields an already-boxed plugin — for plugins assembled at runtime.
    pub fn register_arc(&mut self, build: Builder) {
        let probe = build();
        let name = probe.name().to_string();
        let description = probe.description().map(str::to_string);
        let schema = probe.schema();
        self.factories.insert(name.clone(), PluginFactory { name, description, schema, build });
    }

    pub fn get(&self, name: &str) -> Option<&PluginFactory> {
        self.factories.get(name)
    }

    pub fn names(&self) -> Vec<String> {
        self.factories.keys().cloned().collect()
    }

    pub fn factories(&self) -> impl Iterator<Item = &PluginFactory> {
        self.factories.values()
    }
}

/// One line of the plugin config file.
#[derive(Debug, Clone, Serialize, Deserialize)]
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
        PluginEntry { enabled: true, config: Value::Null }
    }
}

impl PluginEntry {
    pub fn with_config(config: Value) -> PluginEntry {
        PluginEntry { enabled: true, config }
    }

    pub fn disabled() -> PluginEntry {
        PluginEntry { enabled: false, config: Value::Null }
    }
}

/// The declarative shape of a running app: which plugins, with which config.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
    pub enabled: bool,
    pub running: bool,
    pub status: Option<Status>,
    pub config: Value,
    pub schema: Option<Value>,
    /// Registered but never mentioned in the config — installable, not installed.
    pub available: bool,
}

/// Keeps the running graph equal to a [`LoaderConfig`].
pub struct Loader {
    ctx: Context,
    registry: PluginRegistry,
    forks: HashMap<String, Fork>,
    config: LoaderConfig,
}

impl Loader {
    pub fn new(ctx: Context, registry: PluginRegistry) -> Loader {
        Loader { ctx, registry, forks: HashMap::new(), config: LoaderConfig::default() }
    }

    pub fn registry(&self) -> &PluginRegistry {
        &self.registry
    }

    pub fn registry_mut(&mut self) -> &mut PluginRegistry {
        &mut self.registry
    }

    pub fn config(&self) -> &LoaderConfig {
        &self.config
    }

    /// Make the running graph match `config`.
    ///
    /// Unknown plugin names are collected and returned rather than aborting the whole apply: one
    /// stale line in a config file should not take the app down with it.
    pub fn apply(&mut self, config: LoaderConfig) -> Vec<KernelError> {
        let mut errors = Vec::new();

        // Gone or turned off → unload.
        let running: Vec<String> = self.forks.keys().cloned().collect();
        for name in running {
            let wanted = config.plugins.get(&name).map(|entry| entry.enabled).unwrap_or(false);
            if !wanted {
                if let Some(fork) = self.forks.remove(&name) {
                    fork.dispose();
                }
            }
        }

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
        errors
    }

    /// Turn one plugin on or off, keeping the rest of the graph untouched.
    pub fn set_enabled(&mut self, name: &str, enabled: bool) -> Vec<KernelError> {
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
                    enabled: entry.map(|entry| entry.enabled).unwrap_or(false),
                    running: fork.is_some(),
                    status: fork.map(|fork| fork.status()),
                    config: entry.map(|entry| entry.config.clone()).unwrap_or(Value::Null),
                    schema: factory.schema.clone(),
                    available: entry.is_none(),
                }
            })
            .collect();
        out.sort_by(|a, b| a.name.cmp(&b.name));
        out
    }
}
