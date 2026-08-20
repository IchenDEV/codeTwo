//! Durable policy for the plugin graph.
//!
//! The loader owns the running graph; this module owns the user's intent. Keeping those two
//! responsibilities separate lets the manager stage and validate a change before it asks the
//! loader to reconcile, while every host (desktop, TUI, server) reads the same policy document.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

const SCHEMA_VERSION: u32 = 1;
const CONFIG_FILE: &str = "plugin-config.json";
const LAST_GOOD_FILE: &str = "plugin-config.last-good.json";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginOverride {
    #[default]
    Inherit,
    Enabled,
    Disabled,
}

impl PluginOverride {
    pub fn resolve(self, inherited: bool) -> bool {
        match self {
            PluginOverride::Inherit => inherited,
            PluginOverride::Enabled => true,
            PluginOverride::Disabled => false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PluginScope {
    User,
    Project { project_path: String },
}

impl PluginScope {
    pub fn project(path: impl AsRef<Path>) -> Self {
        PluginScope::Project {
            project_path: normalize_project_path(path),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PluginPolicy {
    #[serde(default, skip_serializing_if = "is_inherit")]
    pub state: PluginOverride,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config: Option<Value>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub components: BTreeMap<String, PluginOverride>,
}

fn is_inherit(value: &PluginOverride) -> bool {
    *value == PluginOverride::Inherit
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PluginConfigDocument {
    pub schema_version: u32,
    #[serde(default)]
    pub revision: u64,
    #[serde(default)]
    pub user: BTreeMap<String, PluginPolicy>,
    #[serde(default)]
    pub projects: BTreeMap<String, BTreeMap<String, PluginPolicy>>,
}

impl Default for PluginConfigDocument {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            revision: 0,
            user: BTreeMap::new(),
            projects: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PluginRecoveryState {
    Normal,
    RestoredLastGood { error: String },
    SafeMode { error: String },
}

#[derive(Debug, thiserror::Error)]
pub enum PluginConfigError {
    #[error("plugin configuration I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("plugin configuration JSON is invalid: {0}")]
    Json(#[from] serde_json::Error),
    #[error("plugin configuration schema {0} is not supported")]
    UnsupportedSchema(u32),
}

/// The durable half of the plugin manager. Mutations are persisted before they become visible.
pub struct PluginConfigStore {
    path: PathBuf,
    last_good_path: PathBuf,
    document: PluginConfigDocument,
    recovery: PluginRecoveryState,
}

impl PluginConfigStore {
    pub fn open(data_dir: impl AsRef<Path>) -> Result<Self, PluginConfigError> {
        let data_dir = data_dir.as_ref();
        fs::create_dir_all(data_dir)?;
        let path = data_dir.join(CONFIG_FILE);
        let last_good_path = data_dir.join(LAST_GOOD_FILE);

        let (document, recovery) = match read_document(&path) {
            Ok(Some(document)) => (document, PluginRecoveryState::Normal),
            Ok(None) => (PluginConfigDocument::default(), PluginRecoveryState::Normal),
            Err(primary) => match read_document(&last_good_path) {
                Ok(Some(document)) => (
                    document,
                    PluginRecoveryState::RestoredLastGood {
                        error: primary.to_string(),
                    },
                ),
                Ok(None) | Err(_) => (
                    PluginConfigDocument::default(),
                    PluginRecoveryState::SafeMode {
                        error: primary.to_string(),
                    },
                ),
            },
        };

        Ok(Self {
            path,
            last_good_path,
            document,
            recovery,
        })
    }

    pub fn ephemeral() -> Self {
        Self {
            path: PathBuf::new(),
            last_good_path: PathBuf::new(),
            document: PluginConfigDocument::default(),
            recovery: PluginRecoveryState::Normal,
        }
    }

    pub fn snapshot(&self) -> PluginConfigDocument {
        self.document.clone()
    }

    pub fn recovery(&self) -> &PluginRecoveryState {
        &self.recovery
    }

    pub fn policy(&self, scope: &PluginScope, plugin: &str) -> PluginPolicy {
        match scope {
            PluginScope::User => self.document.user.get(plugin),
            PluginScope::Project { project_path } => self
                .document
                .projects
                .get(project_path)
                .and_then(|plugins| plugins.get(plugin)),
        }
        .cloned()
        .unwrap_or_default()
    }

    pub fn effective_enabled(
        &self,
        scope: &PluginScope,
        plugin: &str,
        default_enabled: bool,
    ) -> bool {
        let user = self
            .policy(&PluginScope::User, plugin)
            .state
            .resolve(default_enabled);
        match scope {
            PluginScope::User => user,
            PluginScope::Project { .. } => self.policy(scope, plugin).state.resolve(user),
        }
    }

    pub fn effective_component_enabled(
        &self,
        scope: &PluginScope,
        plugin: &str,
        component: &str,
        default_enabled: bool,
    ) -> bool {
        let user_plugin = self.policy(&PluginScope::User, plugin);
        let user = user_plugin
            .components
            .get(component)
            .copied()
            .unwrap_or_default()
            .resolve(default_enabled);
        match scope {
            PluginScope::User => user,
            PluginScope::Project { .. } => self
                .policy(scope, plugin)
                .components
                .get(component)
                .copied()
                .unwrap_or_default()
                .resolve(user),
        }
    }

    pub fn set_policy(
        &mut self,
        scope: PluginScope,
        plugin: impl Into<String>,
        policy: PluginPolicy,
    ) -> Result<u64, PluginConfigError> {
        let plugin = plugin.into();
        let mut next = self.document.clone();
        match scope {
            PluginScope::User => {
                insert_or_remove(&mut next.user, plugin, policy);
            }
            PluginScope::Project { project_path } => {
                let plugins = next.projects.entry(project_path.clone()).or_default();
                insert_or_remove(plugins, plugin, policy);
                if plugins.is_empty() {
                    next.projects.remove(&project_path);
                }
            }
        }
        self.commit(next)
    }

    pub fn reset(&mut self, scope: PluginScope, plugin: &str) -> Result<u64, PluginConfigError> {
        self.set_policy(scope, plugin.to_string(), PluginPolicy::default())
    }

    /// Forget every user and project override for a plugin that is no longer installed.
    pub fn remove_plugin(&mut self, plugin: &str) -> Result<u64, PluginConfigError> {
        let mut next = self.document.clone();
        next.user.remove(plugin);
        for policies in next.projects.values_mut() {
            policies.remove(plugin);
        }
        next.projects.retain(|_, policies| !policies.is_empty());
        self.commit(next)
    }

    pub fn replace(&mut self, document: PluginConfigDocument) -> Result<u64, PluginConfigError> {
        validate(&document)?;
        self.commit(document)
    }

    pub fn mark_last_good(&self) -> Result<(), PluginConfigError> {
        if self.last_good_path.as_os_str().is_empty() {
            return Ok(());
        }
        write_document(&self.last_good_path, &self.document)
    }

    fn commit(&mut self, mut next: PluginConfigDocument) -> Result<u64, PluginConfigError> {
        validate(&next)?;
        if next == self.document {
            // Recovery deliberately keeps the corrupt primary as evidence until the user performs
            // an explicit mutation/reset. That recovery action may resolve to the exact same
            // in-memory document (notably safe-mode's empty default), but it still has work to do:
            // rewrite a valid primary and leave recovery mode.
            if !matches!(self.recovery, PluginRecoveryState::Normal) {
                if !self.path.as_os_str().is_empty() {
                    write_document(&self.path, &self.document)?;
                }
                self.recovery = PluginRecoveryState::Normal;
            }
            return Ok(self.document.revision);
        }
        next.revision = self.document.revision.saturating_add(1);
        if !self.path.as_os_str().is_empty() {
            write_document(&self.path, &next)?;
        }
        self.document = next;
        self.recovery = PluginRecoveryState::Normal;
        Ok(self.document.revision)
    }
}

fn insert_or_remove(
    policies: &mut BTreeMap<String, PluginPolicy>,
    plugin: String,
    policy: PluginPolicy,
) {
    if policy == PluginPolicy::default() {
        policies.remove(&plugin);
    } else {
        policies.insert(plugin, policy);
    }
}

fn validate(document: &PluginConfigDocument) -> Result<(), PluginConfigError> {
    if document.schema_version != SCHEMA_VERSION {
        return Err(PluginConfigError::UnsupportedSchema(
            document.schema_version,
        ));
    }
    Ok(())
}

fn read_document(path: &Path) -> Result<Option<PluginConfigDocument>, PluginConfigError> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    let document: PluginConfigDocument = serde_json::from_slice(&bytes)?;
    validate(&document)?;
    Ok(Some(document))
}

fn write_document(path: &Path, document: &PluginConfigDocument) -> Result<(), PluginConfigError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let bytes = serde_json::to_vec_pretty(document)?;
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temporary)?;
    file.write_all(&bytes)?;
    file.write_all(b"\n")?;
    file.sync_all()?;

    #[cfg(windows)]
    if path.exists() {
        let backup = path.with_extension(format!("{}.bak", uuid::Uuid::new_v4()));
        fs::rename(path, &backup)?;
        if let Err(error) = fs::rename(&temporary, path) {
            let _ = fs::rename(&backup, path);
            let _ = fs::remove_file(&temporary);
            return Err(error.into());
        }
        let _ = fs::remove_file(backup);
        return Ok(());
    }

    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(error.into());
    }
    Ok(())
}

pub fn normalize_project_path(path: impl AsRef<Path>) -> String {
    let path = path.as_ref();
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(path))
            .unwrap_or_else(|_| path.to_path_buf())
    };
    fs::canonicalize(&absolute)
        .unwrap_or(absolute)
        .to_string_lossy()
        .into_owned()
}
