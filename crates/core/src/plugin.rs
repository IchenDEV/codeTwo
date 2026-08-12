//! Installable plugin bundles: canonical Codex/Claude manifests plus Code2 conventions for
//! skills, subagents, MCP servers, and project scaffolds.
//!
//! Installation is data-only. Code2 validates and stores plugin files but never runs repository
//! scripts during install. MCP processes start only when the user composes that MCP component into
//! a session; scaffolds are applied explicitly to a selected workspace without overwriting files.

use std::collections::{BTreeSet, HashSet};
use std::path::{Component, Path, PathBuf};
use std::sync::LazyLock;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

use crate::github_skills::GitHubCheckout;
use crate::harness::parse_frontmatter;
use crate::skill::{McpServer, McpTransport, Skill, SkillKind, SkillPayload, SubagentDefinition};

const RECORD_FILE: &str = "installed-plugin.json";
const BUNDLE_DIR: &str = "bundle";
const MAX_COMPONENTS: usize = 100;
const MAX_FILES: usize = 5_000;
const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;
const MAX_BUNDLE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_DEPTH: usize = 12;
const AGENT_PLUGIN_SCHEMA_JSON: &str =
    include_str!("../schemas/agent-plugins/1.0.0/plugin.schema.json");
const AGENT_MCP_SCHEMA_JSON: &str = include_str!("../schemas/agent-plugins/1.0.0/mcp.schema.json");
static AGENT_PLUGIN_SCHEMA: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(AGENT_PLUGIN_SCHEMA_JSON)
        .expect("bundled Agent Plugins plugin schema must be valid JSON")
});
static AGENT_MCP_SCHEMA: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(AGENT_MCP_SCHEMA_JSON)
        .expect("bundled Agent Plugins MCP schema must be valid JSON")
});

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginCounts {
    pub skills: usize,
    pub subagents: usize,
    pub mcp_servers: usize,
    pub scaffolds: usize,
    #[serde(default)]
    pub commands: usize,
    #[serde(default)]
    pub hooks: usize,
    #[serde(default)]
    pub lsp_servers: usize,
    #[serde(default)]
    pub monitors: usize,
    #[serde(default)]
    pub apps: usize,
    /// Agent Scenes 1.0.0 components (`scenes/*.scene.json`); defaulted so pre-R14 records load.
    #[serde(default)]
    pub scenes: usize,
    #[serde(default)]
    pub pipelines: usize,
}

impl PluginCounts {
    pub fn total(&self) -> usize {
        self.skills
            + self.subagents
            + self.mcp_servers
            + self.scaffolds
            + self.commands
            + self.hooks
            + self.lsp_servers
            + self.monitors
            + self.apps
            + self.scenes
            + self.pipelines
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginStandard {
    AgentPlugins,
    Codex,
    ClaudeCode,
    #[default]
    Conventional,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginInstallScope {
    #[default]
    User,
    Project,
    Local,
    Managed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginDiagnosticLevel {
    Warning,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginDiagnostic {
    pub level: PluginDiagnosticLevel,
    pub code: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub component: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginExtensionComponent {
    pub kind: String,
    pub name: String,
    pub path: String,
    /// `ready`, `requires_trust`, `requires_auth`, or `unsupported`.
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginLspServer {
    pub name: String,
    #[serde(default)]
    pub source_path: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: Vec<(String, String)>,
    #[serde(default)]
    pub extension_to_language: Vec<(String, String)>,
    #[serde(default = "default_lsp_transport")]
    pub transport: String,
}

fn default_lsp_transport() -> String {
    "stdio".into()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginScaffold {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    /// Relative to the preserved plugin bundle.
    pub path: PathBuf,
    pub files: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledPlugin {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: String,
    pub source: String,
    pub repository: String,
    #[serde(default)]
    pub spec_version: String,
    #[serde(default)]
    pub standard: PluginStandard,
    #[serde(default)]
    pub standards: Vec<PluginStandard>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub trusted: bool,
    #[serde(default)]
    pub scope: PluginInstallScope,
    pub counts: PluginCounts,
    #[serde(default)]
    pub components: Vec<Skill>,
    #[serde(default)]
    pub scaffolds: Vec<PluginScaffold>,
    #[serde(default)]
    pub extension_components: Vec<PluginExtensionComponent>,
    #[serde(default)]
    pub lsp_servers: Vec<PluginLspServer>,
    #[serde(default)]
    pub diagnostics: Vec<PluginDiagnostic>,
}

#[derive(Debug)]
pub struct PluginBundle {
    pub plugin: InstalledPlugin,
    files: Vec<PluginFile>,
}

#[derive(Debug)]
struct PluginFile {
    path: PathBuf,
    bytes: Vec<u8>,
    mode: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScaffoldInstallResult {
    pub plugin: String,
    pub scaffold: String,
    pub destination: String,
    pub files: usize,
}

#[derive(Debug, Error)]
pub enum PluginError {
    #[error("{0}")]
    Invalid(String),
    #[error("Could not read the plugin: {0}")]
    Io(#[from] std::io::Error),
    #[error("Plugin JSON is invalid: {0}")]
    Json(#[from] serde_json::Error),
    #[error("The repository contains multiple plugins; import a specific /tree/ path")]
    MultiplePlugins,
    #[error("The plugin does not contain a supported Skill, Subagent, MCP server, or scaffold")]
    NoComponents,
    #[error("Plugin contains more than {0} components")]
    TooManyComponents(usize),
    #[error("Plugin contains more than {0} files")]
    TooManyFiles(usize),
    #[error("Plugin bundle exceeds the {0} MiB safety limit")]
    BundleTooLarge(u64),
    #[error("Plugin file is larger than the {0} MiB safety limit: {1}")]
    FileTooLarge(u64, String),
    #[error("Plugin path is unsafe: {0}")]
    UnsafePath(String),
    #[error("Unknown plugin: {0}")]
    UnknownPlugin(String),
    #[error("Unknown scaffold: {0}")]
    UnknownScaffold(String),
    #[error("Scaffold would overwrite an existing file: {0}")]
    ScaffoldConflict(String),
    #[error("Scaffold destination path is unsafe: {0}")]
    UnsafeScaffoldPath(String),
}

#[derive(Debug, Clone, Default, Deserialize)]
struct RawManifest {
    #[serde(rename = "$schema", default)]
    schema: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    version: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    author: Value,
    #[serde(default)]
    repository: String,
    #[serde(default)]
    skills: Option<Value>,
    #[serde(rename = "mcpServers", default)]
    mcp_servers: Option<Value>,
    #[serde(default)]
    commands: Option<Value>,
    #[serde(default)]
    workflows: Option<Value>,
    #[serde(default)]
    agents: Option<Value>,
    #[serde(default)]
    hooks: Option<Value>,
    #[serde(rename = "lspServers", default)]
    lsp_servers: Option<Value>,
    #[serde(rename = "outputStyles", default)]
    output_styles: Option<Value>,
    #[serde(default)]
    apps: Option<Value>,
    #[serde(default)]
    experimental: Value,
    #[serde(default)]
    channels: Option<Value>,
    #[serde(default)]
    dependencies: Option<Value>,
    #[serde(rename = "userConfig", default)]
    user_config: Option<Value>,
    #[serde(default)]
    interface: Value,
}

#[derive(Debug, Default)]
struct ManifestSet {
    primary: RawManifest,
    standards: Vec<PluginStandard>,
    skill_paths: Vec<String>,
    agent_paths: Vec<String>,
    mcp_sources: Vec<Value>,
    agent_portable: bool,
    extension_components: Vec<PluginExtensionComponent>,
    lsp_servers: Vec<PluginLspServer>,
    diagnostics: Vec<PluginDiagnostic>,
}

#[derive(Debug, Default, Deserialize)]
struct RawScaffold {
    #[serde(default)]
    name: String,
    #[serde(default)]
    description: String,
}

#[derive(Debug)]
struct SkillCandidate {
    path: PathBuf,
    strict_agent_skill: bool,
}

#[derive(Debug)]
struct McpConfigSource {
    value: Value,
    strict_agent_plugins: bool,
    label: String,
}

/// Build a complete plugin bundle from a verified GitHub checkout.
pub fn from_github(checkout: &GitHubCheckout) -> Result<PluginBundle, PluginError> {
    let selected = checkout
        .selected_root()
        .map_err(|error| PluginError::Invalid(error.to_string()))?;
    let (plugin_root, manifest_paths) = locate_plugin_root(&selected)?;
    let mut manifest_set = load_manifest_set(&plugin_root, &manifest_paths)?;
    let manifest = manifest_set.primary.clone();

    let fallback_name = plugin_root
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(&checkout.spec.repo);
    let manifest_name = if manifest.name.trim().is_empty() {
        fallback_name.to_string()
    } else {
        manifest.name.trim().to_string()
    };
    let display_name = manifest
        .interface
        .get("displayName")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(&manifest_name)
        .trim()
        .to_string();
    let version = if manifest.version.trim().is_empty() {
        "0.0.0".to_string()
    } else {
        manifest.version.trim().to_string()
    };
    let checkout_root = checkout.root.canonicalize()?;
    let root_relative = plugin_root
        .strip_prefix(&checkout_root)
        .unwrap_or(&plugin_root)
        .to_string_lossy();
    let normalized_name = slug(&manifest_name);
    let normalized_name = if normalized_name.is_empty() {
        "plugin"
    } else {
        normalized_name.as_str()
    };
    let plugin_id = format!(
        "{}-{:08x}",
        normalized_name.chars().take(52).collect::<String>(),
        fnv1a(
            format!(
                "{}/{}:{root_relative}",
                checkout.spec.owner, checkout.spec.repo
            )
            .as_bytes()
        )
    );

    let source = format!("Plugin · {display_name}");
    let native_conventions = manifest_set.standards.iter().any(|standard| {
        matches!(
            standard,
            PluginStandard::Codex | PluginStandard::ClaudeCode | PluginStandard::Conventional
        )
    });
    let skill_files = discover_skill_files(
        &plugin_root,
        &manifest_set.skill_paths,
        manifest_set.agent_portable,
        native_conventions,
        &mut manifest_set.diagnostics,
    )?;
    let mut components = parse_skills(
        &plugin_root,
        &plugin_id,
        &source,
        skill_files,
        &mut manifest_set.diagnostics,
    )?;
    components.extend(parse_command_components(
        &plugin_root,
        &plugin_id,
        &source,
        &manifest_set.extension_components,
        &mut manifest_set.diagnostics,
    )?);
    components.extend(parse_subagents(
        &plugin_root,
        &plugin_id,
        &source,
        &manifest_set.agent_paths,
        native_conventions,
        &mut manifest_set.diagnostics,
    )?);
    components.extend(parse_mcp_servers(
        &plugin_root,
        &plugin_id,
        &source,
        &manifest_set.mcp_sources,
        manifest_set.agent_portable,
        native_conventions,
        &mut manifest_set.diagnostics,
    )?);
    if components.len() > MAX_COMPONENTS {
        return Err(PluginError::TooManyComponents(MAX_COMPONENTS));
    }

    let scaffolds = discover_scaffolds(&plugin_root)?;
    let (scene_count, pipeline_count) = count_scene_components(&plugin_root);
    let counts = PluginCounts {
        skills: components
            .iter()
            .filter(|skill| {
                skill.kind() == SkillKind::AgentSkill && !skill.id.contains(":command:")
            })
            .count(),
        subagents: components
            .iter()
            .filter(|skill| skill.kind() == SkillKind::Subagent)
            .count(),
        mcp_servers: components
            .iter()
            .filter(|skill| skill.kind() == SkillKind::Mcp)
            .count(),
        scaffolds: scaffolds.len(),
        commands: manifest_set
            .extension_components
            .iter()
            .filter(|item| item.kind == "command")
            .count(),
        hooks: manifest_set
            .extension_components
            .iter()
            .filter(|item| item.kind == "hook")
            .count(),
        lsp_servers: manifest_set
            .extension_components
            .iter()
            .filter(|item| item.kind == "lsp")
            .count(),
        monitors: manifest_set
            .extension_components
            .iter()
            .filter(|item| item.kind == "monitor")
            .count(),
        apps: manifest_set
            .extension_components
            .iter()
            .filter(|item| item.kind == "app")
            .count(),
        scenes: scene_count,
        pipelines: pipeline_count,
    };
    if counts.total() == 0 {
        return Err(PluginError::NoComponents);
    }

    let files = collect_bundle_files(&plugin_root)?;
    let repository = if manifest.repository.trim().is_empty() {
        format!(
            "https://github.com/{}/{}",
            checkout.spec.owner, checkout.spec.repo
        )
    } else {
        manifest.repository.trim().to_string()
    };
    Ok(PluginBundle {
        plugin: InstalledPlugin {
            schema_version: 2,
            id: plugin_id,
            name: display_name,
            version,
            description: truncate(manifest.description.trim(), 500),
            author: author_name(&manifest.author),
            source: checkout.spec.source(),
            repository,
            spec_version: if manifest_set.agent_portable {
                "1.0.0".into()
            } else if manifest.schema.trim().is_empty() {
                "native".into()
            } else {
                manifest.schema.trim().to_string()
            },
            standard: manifest_set.standards.first().copied().unwrap_or_default(),
            standards: manifest_set.standards,
            enabled: true,
            trusted: false,
            scope: PluginInstallScope::User,
            counts,
            components,
            scaffolds,
            extension_components: manifest_set.extension_components,
            lsp_servers: manifest_set.lsp_servers,
            diagnostics: manifest_set.diagnostics,
        },
        files,
    })
}

/// Build a plugin from an already available directory without ever executing its contents.
/// The directory is copied through the same bounded, symlink-skipping bundle collector used by
/// GitHub installs, so later parsing cannot escape into sibling marketplace files.
pub fn from_local(
    root: &Path,
    source_label: &str,
    source_identity: &str,
) -> Result<PluginBundle, PluginError> {
    let canonical = root.canonicalize()?;
    if !canonical.is_dir() {
        return Err(PluginError::Invalid(
            "Local plugin source must be a directory".into(),
        ));
    }
    let fallback = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .map(slug)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "plugin".into());
    let temporary =
        std::env::temp_dir().join(format!("codetwo-local-plugin-{}", uuid::Uuid::new_v4()));
    let selected = temporary.join(&fallback);
    std::fs::create_dir_all(&selected)?;
    let files = collect_bundle_files(&canonical)?;
    let copy_result = (|| -> Result<(), PluginError> {
        for file in &files {
            let target = selected.join(safe_relative(&file.path)?);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            write_file(&target, file)?;
        }
        Ok(())
    })();
    if let Err(error) = copy_result {
        let _ = std::fs::remove_dir_all(&temporary);
        return Err(error);
    }
    let checkout = GitHubCheckout {
        root: temporary,
        spec: crate::github_skills::GitHubRepoSpec {
            owner: "local".into(),
            repo: format!("source-{:08x}", fnv1a(source_identity.as_bytes())),
            reference: None,
            subpath: Some(PathBuf::from(&fallback)),
        },
    };
    let mut bundle = from_github(&checkout)?;
    bundle.plugin.source = source_label.into();
    bundle.plugin.repository = canonical.display().to_string();
    Ok(bundle)
}

/// Atomically replace one installed plugin directory with the validated bundle.
pub fn install(
    plugins_dir: &Path,
    mut bundle: PluginBundle,
) -> Result<InstalledPlugin, PluginError> {
    std::fs::create_dir_all(plugins_dir)?;
    let id = require_safe_id(&bundle.plugin.id)?;
    std::fs::create_dir_all(plugin_data_dir(plugins_dir, id))?;
    let final_dir = plugins_dir.join(id);
    if let Ok(previous) = std::fs::read_to_string(final_dir.join(RECORD_FILE)).and_then(|text| {
        serde_json::from_str::<InstalledPlugin>(&text)
            .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))
    }) {
        bundle.plugin.enabled = previous.enabled;
        bundle.plugin.trusted = previous.trusted;
        bundle.plugin.scope = previous.scope;
    }
    let stage = plugins_dir.join(format!(".{id}.stage-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(stage.join(BUNDLE_DIR))?;

    let result = (|| -> Result<(), PluginError> {
        for file in &bundle.files {
            let relative = safe_relative(&file.path)?;
            let target = stage.join(BUNDLE_DIR).join(relative);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            write_file(&target, file)?;
        }
        let record = serde_json::to_vec_pretty(&bundle.plugin)?;
        std::fs::write(stage.join(RECORD_FILE), record)?;
        Ok(())
    })();
    if let Err(error) = result {
        let _ = std::fs::remove_dir_all(&stage);
        return Err(error);
    }

    let backup = plugins_dir.join(format!(".{id}.backup-{}", uuid::Uuid::new_v4()));
    let had_existing = final_dir.exists();
    if had_existing {
        std::fs::rename(&final_dir, &backup)?;
    }
    if let Err(error) = std::fs::rename(&stage, &final_dir) {
        if had_existing {
            let _ = std::fs::rename(&backup, &final_dir);
        }
        let _ = std::fs::remove_dir_all(&stage);
        return Err(error.into());
    }
    if had_existing {
        let _ = std::fs::remove_dir_all(backup);
    }
    Ok(bundle.plugin)
}

/// Load every installed plugin. Malformed records are logged and skipped so one bad plugin cannot
/// hide the rest of the library.
pub fn load_dir(plugins_dir: &Path) -> Result<Vec<InstalledPlugin>, PluginError> {
    let entries = match std::fs::read_dir(plugins_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };
    let mut plugins = Vec::new();
    for entry in entries {
        let entry = entry?;
        if !entry.file_type()?.is_dir() || entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let plugin_dir = entry.path();
        let text = match std::fs::read_to_string(plugin_dir.join(RECORD_FILE)) {
            Ok(text) => text,
            Err(error) => {
                tracing::warn!("plugin {:?}: {error}", plugin_dir);
                continue;
            }
        };
        match serde_json::from_str::<InstalledPlugin>(&text) {
            Ok(mut plugin) => {
                let data_dir = plugin_data_dir(plugins_dir, &plugin.id);
                resolve_relative_mcp_commands(&mut plugin, &plugin_dir, &data_dir);
                plugins.push(plugin);
            }
            Err(error) => tracing::warn!("plugin {:?}: {error}", plugin_dir),
        }
    }
    plugins.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(plugins)
}

pub fn uninstall(plugins_dir: &Path, id: &str) -> Result<(), PluginError> {
    uninstall_with_options(plugins_dir, id, false)
}

pub fn uninstall_with_options(
    plugins_dir: &Path,
    id: &str,
    keep_data: bool,
) -> Result<(), PluginError> {
    let id = require_safe_id(id)?;
    let target = plugins_dir.join(id);
    match std::fs::remove_dir_all(&target) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    if !keep_data {
        let data = plugin_data_dir(plugins_dir, id);
        match std::fs::remove_dir_all(data) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

pub fn set_enabled(
    plugins_dir: &Path,
    id: &str,
    enabled: bool,
) -> Result<InstalledPlugin, PluginError> {
    update_plugin_record(plugins_dir, id, |plugin| plugin.enabled = enabled)
}

pub fn set_trusted(
    plugins_dir: &Path,
    id: &str,
    trusted: bool,
) -> Result<InstalledPlugin, PluginError> {
    update_plugin_record(plugins_dir, id, |plugin| plugin.trusted = trusted)
}

fn update_plugin_record(
    plugins_dir: &Path,
    id: &str,
    update: impl FnOnce(&mut InstalledPlugin),
) -> Result<InstalledPlugin, PluginError> {
    let id = require_safe_id(id)?;
    let plugin_dir = plugins_dir.join(id);
    let record_path = plugin_dir.join(RECORD_FILE);
    let mut plugin: InstalledPlugin =
        serde_json::from_str(&std::fs::read_to_string(&record_path)?)?;
    update(&mut plugin);
    let temporary = plugin_dir.join(format!(".{RECORD_FILE}.{}", uuid::Uuid::new_v4()));
    std::fs::write(&temporary, serde_json::to_vec_pretty(&plugin)?)?;
    std::fs::rename(temporary, record_path)?;
    resolve_relative_mcp_commands(&mut plugin, &plugin_dir, &plugin_data_dir(plugins_dir, id));
    Ok(plugin)
}

/// Copy a stored scaffold into `destination` after a complete conflict preflight.
pub fn apply_scaffold(
    plugins_dir: &Path,
    plugin_id: &str,
    scaffold_id: &str,
    destination: &Path,
) -> Result<ScaffoldInstallResult, PluginError> {
    let plugin_id = require_safe_id(plugin_id)?;
    let scaffold_id = require_safe_id(scaffold_id)?;
    let plugin = load_dir(plugins_dir)?
        .into_iter()
        .find(|plugin| plugin.id == plugin_id)
        .ok_or_else(|| PluginError::UnknownPlugin(plugin_id.to_string()))?;
    let scaffold = plugin
        .scaffolds
        .iter()
        .find(|scaffold| scaffold.id == scaffold_id)
        .ok_or_else(|| PluginError::UnknownScaffold(scaffold_id.to_string()))?;
    let destination = destination.canonicalize()?;
    if !destination.is_dir() {
        return Err(PluginError::Invalid(
            "Scaffold destination must be a directory".into(),
        ));
    }
    let plugin_dir = plugins_dir.join(plugin_id).canonicalize()?;
    let scaffold_root = plugin_dir
        .join(BUNDLE_DIR)
        .join(safe_relative(&scaffold.path)?);
    let scaffold_root = scaffold_root.canonicalize()?;
    if !scaffold_root.starts_with(&plugin_dir) {
        return Err(PluginError::UnsafePath(scaffold.path.display().to_string()));
    }
    let files = collect_apply_files(&scaffold_root)?;
    let targets = files
        .iter()
        .map(|file| scaffold_target(&destination, &file.path))
        .collect::<Result<Vec<_>, _>>()?;
    for (file, target) in files.iter().zip(targets) {
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        write_file(&target, file)?;
    }
    Ok(ScaffoldInstallResult {
        plugin: plugin.name,
        scaffold: scaffold.name.clone(),
        destination: destination.display().to_string(),
        files: files.len(),
    })
}

fn load_manifest_set(root: &Path, paths: &[PathBuf]) -> Result<ManifestSet, PluginError> {
    let mut parsed = Vec::new();
    let mut diagnostics = Vec::new();
    for path in paths {
        ensure_plugin_path(root, path)?;
        let value: Value = serde_json::from_str(&std::fs::read_to_string(path)?)?;
        let standard = manifest_standard(path);
        if standard == PluginStandard::AgentPlugins {
            validate_agent_manifest(&value, &mut diagnostics)?;
        }
        let raw: RawManifest = serde_json::from_value(value)?;
        parsed.push((standard, raw));
    }
    parsed.sort_by_key(|(standard, _)| standard_priority(*standard));

    let primary = parsed
        .first()
        .map(|(_, manifest)| manifest.clone())
        .unwrap_or_default();
    let mut standards = Vec::new();
    let mut skill_paths = Vec::new();
    let mut agent_paths = Vec::new();
    let mut mcp_sources = Vec::new();
    let mut names = BTreeSet::new();
    for (standard, manifest) in &parsed {
        if !standards.contains(standard) {
            standards.push(*standard);
        }
        if !manifest.name.trim().is_empty() {
            names.insert(manifest.name.trim().to_string());
        }
        if *standard != PluginStandard::AgentPlugins {
            if let Some(value) = &manifest.skills {
                skill_paths.extend(path_values(value, "skills")?);
            }
            if let Some(value) = &manifest.agents {
                agent_paths.extend(path_values(value, "agents")?);
            }
            if let Some(value) = &manifest.mcp_servers {
                mcp_sources.push(value.clone());
            }
        }
    }
    if standards.is_empty() {
        standards.push(PluginStandard::Conventional);
    }
    if names.len() > 1 {
        diagnostics.push(PluginDiagnostic {
            level: PluginDiagnosticLevel::Warning,
            code: "manifest_identity_conflict".into(),
            message: format!(
                "Plugin manifests use different names ({}); metadata follows Agent Plugins, Codex, then Claude Code precedence",
                names.into_iter().collect::<Vec<_>>().join(", ")
            ),
            component: None,
        });
    }

    let lsp_servers = discover_lsp_servers(root, &parsed, &mut diagnostics)?;
    let extension_components =
        discover_extension_components(root, &parsed, &lsp_servers, &mut diagnostics)?;
    Ok(ManifestSet {
        primary,
        agent_portable: standards.contains(&PluginStandard::AgentPlugins),
        standards,
        skill_paths,
        agent_paths,
        mcp_sources,
        extension_components,
        lsp_servers,
        diagnostics,
    })
}

fn locate_plugin_root(selected: &Path) -> Result<(PathBuf, Vec<PathBuf>), PluginError> {
    let direct = direct_manifests(selected)?;
    if !direct.is_empty() {
        return Ok((selected.to_path_buf(), direct));
    }
    let mut manifests = Vec::new();
    find_manifests(selected, 0, &mut manifests)?;
    manifests.sort();
    manifests.dedup();
    let mut roots = Vec::new();
    for manifest in manifests {
        let parent = manifest
            .parent()
            .ok_or_else(|| PluginError::Invalid("Plugin manifest has no root".into()))?;
        let root = if matches!(
            parent.file_name().and_then(|name| name.to_str()),
            Some(".codex-plugin" | ".claude-plugin")
        ) {
            parent
                .parent()
                .ok_or_else(|| PluginError::Invalid("Plugin manifest has no root".into()))?
        } else {
            parent
        };
        if !roots.iter().any(|known: &PathBuf| known == root) {
            roots.push(root.to_path_buf());
        }
    }
    match roots.as_slice() {
        [] => Ok((selected.to_path_buf(), Vec::new())),
        [root] => Ok((root.clone(), direct_manifests(root)?)),
        _ => Err(PluginError::MultiplePlugins),
    }
}

fn direct_manifests(root: &Path) -> Result<Vec<PathBuf>, PluginError> {
    let mut out = Vec::new();
    let portable = root.join("plugin.json");
    if portable.is_file() && is_agent_manifest(&portable)? {
        out.push(portable);
    }
    for relative in [".codex-plugin/plugin.json", ".claude-plugin/plugin.json"] {
        let manifest = root.join(relative);
        if manifest.is_file() {
            ensure_plugin_path(root, &manifest)?;
            out.push(manifest);
        }
    }
    Ok(out)
}

fn find_manifests(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) -> Result<(), PluginError> {
    if depth > 4 {
        return Ok(());
    }
    let portable = dir.join("plugin.json");
    if portable.is_file() && is_agent_manifest(&portable)? {
        out.push(portable);
    }
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if matches!(name.as_ref(), ".git" | "node_modules" | "target" | ".venv") {
            continue;
        }
        if matches!(name.as_ref(), ".codex-plugin" | ".claude-plugin") {
            let manifest = path.join("plugin.json");
            if manifest.is_file() {
                out.push(manifest);
            }
            continue;
        }
        find_manifests(&path, depth + 1, out)?;
    }
    Ok(())
}

fn is_agent_manifest(path: &Path) -> Result<bool, PluginError> {
    let value: Value = serde_json::from_str(&std::fs::read_to_string(path)?)?;
    Ok(value
        .get("$schema")
        .and_then(Value::as_str)
        .is_some_and(|schema| {
            schema.starts_with("https://agent-plugins.org/schemas/")
                && schema.ends_with("/plugin.schema.json")
        }))
}

fn manifest_standard(path: &Path) -> PluginStandard {
    match path
        .parent()
        .and_then(Path::file_name)
        .and_then(|name| name.to_str())
    {
        Some(".codex-plugin") => PluginStandard::Codex,
        Some(".claude-plugin") => PluginStandard::ClaudeCode,
        _ => PluginStandard::AgentPlugins,
    }
}

fn standard_priority(standard: PluginStandard) -> u8 {
    match standard {
        PluginStandard::AgentPlugins => 0,
        PluginStandard::Codex => 1,
        PluginStandard::ClaudeCode => 2,
        PluginStandard::Conventional => 3,
    }
}

fn validate_agent_manifest(
    value: &Value,
    diagnostics: &mut Vec<PluginDiagnostic>,
) -> Result<(), PluginError> {
    let object = value.as_object().ok_or_else(|| {
        PluginError::Invalid("Agent Plugins plugin.json must be an object".into())
    })?;
    let schema = object
        .get("$schema")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let supported_schema = AGENT_PLUGIN_SCHEMA
        .get("$id")
        .and_then(Value::as_str)
        .expect("bundled Agent Plugins plugin schema must declare $id");
    if schema != supported_schema {
        return Err(PluginError::Invalid(format!(
            "Unsupported Agent Plugins schema: {schema}"
        )));
    }
    let name = object
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !valid_agent_plugin_name(name) {
        return Err(PluginError::Invalid(
            "Agent Plugins name must match the 1.0.0 naming rules".into(),
        ));
    }
    let allowed = [
        "$schema",
        "name",
        "version",
        "description",
        "author",
        "homepage",
        "repository",
        "license",
        "keywords",
        "extensions",
    ];
    for key in object.keys().filter(|key| !allowed.contains(&key.as_str())) {
        diagnostics.push(PluginDiagnostic {
            level: PluginDiagnosticLevel::Warning,
            code: "agent_manifest_unknown_field".into(),
            message: format!("Ignored unknown Agent Plugins manifest field: {key}"),
            component: Some("plugin.json".into()),
        });
    }
    if object
        .get("extensions")
        .is_some_and(|value| !value.is_object())
    {
        diagnostics.push(PluginDiagnostic {
            level: PluginDiagnosticLevel::Warning,
            code: "agent_manifest_extensions_ignored".into(),
            message: "Ignored non-object Agent Plugins extensions field".into(),
            component: Some("plugin.json".into()),
        });
    }
    for key in [
        "version",
        "description",
        "homepage",
        "repository",
        "license",
    ] {
        if object.get(key).is_some_and(|value| !value.is_string()) {
            return Err(PluginError::Invalid(format!(
                "Agent Plugins manifest field {key} must be a string"
            )));
        }
    }
    if object.get("author").is_some_and(|value| !value.is_object()) {
        return Err(PluginError::Invalid(
            "Agent Plugins manifest field author must be an object".into(),
        ));
    }
    if object.get("keywords").is_some_and(|value| {
        value
            .as_array()
            .is_none_or(|items| items.iter().any(|item| !item.is_string()))
    }) {
        return Err(PluginError::Invalid(
            "Agent Plugins manifest field keywords must be an array of strings".into(),
        ));
    }
    Ok(())
}

fn valid_agent_plugin_name(value: &str) -> bool {
    let len = value.chars().count();
    (1..=64).contains(&len)
        && !value.contains("--")
        && !value.contains("..")
        && value
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || matches!(ch, '.' | '-'))
        && value
            .chars()
            .next()
            .is_some_and(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit())
        && value
            .chars()
            .last()
            .is_some_and(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit())
}

fn path_values(value: &Value, label: &str) -> Result<Vec<String>, PluginError> {
    if let Some(path) = value.as_str() {
        return Ok(vec![path.to_string()]);
    }
    let items = value
        .as_array()
        .ok_or_else(|| PluginError::Invalid(format!("{label} must be a path or array of paths")))?;
    items
        .iter()
        .map(|item| {
            item.as_str()
                .map(str::to_string)
                .ok_or_else(|| PluginError::Invalid(format!("{label} paths must be strings")))
        })
        .collect()
}

fn discover_lsp_servers(
    root: &Path,
    manifests: &[(PluginStandard, RawManifest)],
    diagnostics: &mut Vec<PluginDiagnostic>,
) -> Result<Vec<PluginLspServer>, PluginError> {
    let mut documents = Vec::<(String, Value)>::new();
    let mut loaded_paths = HashSet::new();
    for (standard, manifest) in manifests {
        if *standard == PluginStandard::AgentPlugins {
            continue;
        }
        let Some(value) = manifest.lsp_servers.as_ref() else {
            continue;
        };
        if value.is_object() {
            documents.push(("plugin.json#lspServers".into(), value.clone()));
            continue;
        }
        for relative in path_values(value, "lspServers")? {
            load_lsp_document(
                root,
                &relative,
                &mut loaded_paths,
                &mut documents,
                diagnostics,
            )?;
        }
    }
    if manifests
        .iter()
        .any(|(standard, _)| *standard == PluginStandard::ClaudeCode)
        && root.join(".lsp.json").is_file()
    {
        load_lsp_document(
            root,
            "./.lsp.json",
            &mut loaded_paths,
            &mut documents,
            diagnostics,
        )?;
    }

    let mut servers = Vec::new();
    let mut names = HashSet::new();
    for (label, document) in documents {
        let Some(entries) = document.as_object() else {
            diagnostics.push(PluginDiagnostic {
                level: PluginDiagnosticLevel::Error,
                code: "invalid_lsp_document".into(),
                message: "LSP configuration must be a JSON object".into(),
                component: Some(label),
            });
            continue;
        };
        for (name, value) in entries {
            if !names.insert(name.clone()) {
                diagnostics.push(PluginDiagnostic {
                    level: PluginDiagnosticLevel::Warning,
                    code: "duplicate_lsp_server".into(),
                    message: format!("Ignored duplicate LSP server named {name}"),
                    component: Some(label.clone()),
                });
                continue;
            }
            match parse_lsp_server(root, name, value, &label) {
                Ok(server) => servers.push(server),
                Err(message) => diagnostics.push(PluginDiagnostic {
                    level: PluginDiagnosticLevel::Error,
                    code: "invalid_lsp_server".into(),
                    message,
                    component: Some(format!("{label}#{name}")),
                }),
            }
        }
    }
    Ok(servers)
}

fn load_lsp_document(
    root: &Path,
    relative: &str,
    loaded_paths: &mut HashSet<String>,
    documents: &mut Vec<(String, Value)>,
    diagnostics: &mut Vec<PluginDiagnostic>,
) -> Result<(), PluginError> {
    if !relative.starts_with("./") {
        return Err(PluginError::Invalid(
            "Plugin manifest path for lspServers must start with ./".into(),
        ));
    }
    let safe = safe_relative(Path::new(relative))?;
    let normalized = safe.to_string_lossy().into_owned();
    if !loaded_paths.insert(normalized.clone()) {
        return Ok(());
    }
    let path = root.join(&safe);
    if !path.exists() {
        diagnostics.push(missing_component_diagnostic("lsp", relative));
        return Ok(());
    }
    ensure_plugin_path(root, &path)?;
    match serde_json::from_str::<Value>(&read_small_text(&path)?) {
        Ok(value) => documents.push((normalized, value)),
        Err(error) => diagnostics.push(PluginDiagnostic {
            level: PluginDiagnosticLevel::Error,
            code: "invalid_lsp_json".into(),
            message: format!("Skipped invalid LSP configuration: {error}"),
            component: Some(relative.into()),
        }),
    }
    Ok(())
}

fn parse_lsp_server(
    root: &Path,
    name: &str,
    value: &Value,
    source_path: &str,
) -> Result<PluginLspServer, String> {
    let config = value
        .as_object()
        .ok_or_else(|| format!("LSP server {name} must be an object"))?;
    let command = config
        .get("command")
        .and_then(Value::as_str)
        .filter(|command| !command.trim().is_empty())
        .ok_or_else(|| format!("LSP server {name} requires command"))?;
    validate_native_command(root, command, name, "LSP")?;
    let args = string_array(config.get("args"), &format!("LSP server {name} args"))
        .map_err(|error| error.to_string())?;
    let env = string_map(config.get("env"), &format!("LSP server {name} env"))
        .map_err(|error| error.to_string())?;
    let mappings = config
        .get("extensionToLanguage")
        .and_then(Value::as_object)
        .ok_or_else(|| format!("LSP server {name} requires extensionToLanguage"))?;
    let mut extension_to_language = Vec::new();
    for (extension, language) in mappings {
        let language = language.as_str().ok_or_else(|| {
            format!("LSP server {name} extensionToLanguage values must be strings")
        })?;
        if extension.is_empty() || language.trim().is_empty() {
            return Err(format!(
                "LSP server {name} extensionToLanguage entries cannot be empty"
            ));
        }
        extension_to_language.push((extension.clone(), language.into()));
    }
    if extension_to_language.is_empty() {
        return Err(format!(
            "LSP server {name} extensionToLanguage cannot be empty"
        ));
    }
    let transport = config
        .get("transport")
        .and_then(Value::as_str)
        .unwrap_or("stdio");
    if !matches!(transport, "stdio" | "socket") {
        return Err(format!(
            "LSP server {name} has unsupported transport {transport}"
        ));
    }
    Ok(PluginLspServer {
        name: name.into(),
        source_path: source_path.into(),
        command: command.into(),
        args,
        env,
        extension_to_language,
        transport: transport.into(),
    })
}

fn validate_native_command(
    root: &Path,
    command: &str,
    name: &str,
    kind: &str,
) -> Result<(), String> {
    if let Some(relative) = command.strip_prefix("./") {
        let path =
            root.join(safe_relative(Path::new(relative)).map_err(|error| error.to_string())?);
        if path.exists() {
            ensure_plugin_path(root, &path).map_err(|error| error.to_string())?;
        }
        return Ok(());
    }
    if command.starts_with("${CLAUDE_PLUGIN_ROOT}/") || command.starts_with("${CODEX_PLUGIN_ROOT}/")
    {
        return Ok(());
    }
    if command.contains('/') || command.contains('\\') || command.contains("${") {
        return Err(format!(
            "{kind} server {name} command must be a bare executable or a plugin-root path"
        ));
    }
    Ok(())
}

fn discover_extension_components(
    root: &Path,
    manifests: &[(PluginStandard, RawManifest)],
    lsp_servers: &[PluginLspServer],
    diagnostics: &mut Vec<PluginDiagnostic>,
) -> Result<Vec<PluginExtensionComponent>, PluginError> {
    let mut components = Vec::new();
    let standards: HashSet<_> = manifests.iter().map(|(standard, _)| *standard).collect();

    let mut command_paths = Vec::new();
    let mut workflow_paths = Vec::new();
    let mut hook_paths = Vec::new();
    let mut app_paths = Vec::new();
    let mut output_style_paths = Vec::new();
    let mut monitor_paths = Vec::new();
    for (standard, manifest) in manifests {
        if *standard == PluginStandard::AgentPlugins {
            continue;
        }
        append_manifest_paths(&mut command_paths, manifest.commands.as_ref(), "commands")?;
        append_manifest_paths(
            &mut workflow_paths,
            manifest.workflows.as_ref(),
            "workflows",
        )?;
        append_manifest_paths(&mut hook_paths, manifest.hooks.as_ref(), "hooks")?;
        append_manifest_paths(&mut app_paths, manifest.apps.as_ref(), "apps")?;
        append_manifest_paths(
            &mut output_style_paths,
            manifest.output_styles.as_ref(),
            "outputStyles",
        )?;
        append_manifest_paths(
            &mut monitor_paths,
            manifest.experimental.get("monitors"),
            "experimental.monitors",
        )?;
        if manifest.channels.is_some() {
            components.push(PluginExtensionComponent {
                kind: "channel".into(),
                name: "channels".into(),
                path: ".claude-plugin/plugin.json#channels".into(),
                status: "unsupported".into(),
            });
        }
        if manifest.dependencies.is_some() {
            components.push(PluginExtensionComponent {
                kind: "dependency".into(),
                name: "plugin dependencies".into(),
                path: ".claude-plugin/plugin.json#dependencies".into(),
                status: "unsupported".into(),
            });
        }
        if manifest.user_config.is_some() {
            components.push(PluginExtensionComponent {
                kind: "user_config".into(),
                name: "user configuration".into(),
                path: ".claude-plugin/plugin.json#userConfig".into(),
                status: "unsupported".into(),
            });
        }
    }

    if standards.contains(&PluginStandard::ClaudeCode) {
        add_existing_default(root, "commands", &mut command_paths);
        add_existing_default(root, "workflows", &mut workflow_paths);
        add_existing_default(root, "hooks/hooks.json", &mut hook_paths);
        add_existing_default(root, "output-styles", &mut output_style_paths);
        add_existing_default(root, "monitors/monitors.json", &mut monitor_paths);
        add_simple_existing_component(
            root,
            "settings.json",
            "settings",
            "unsupported",
            &mut components,
        )?;
        add_simple_existing_component(root, "bin", "bin", "unsupported", &mut components)?;
        add_simple_existing_component(root, "themes", "theme", "unsupported", &mut components)?;
    }
    if standards.contains(&PluginStandard::Codex) {
        add_existing_default(root, "hooks/hooks.json", &mut hook_paths);
        add_existing_default(root, ".app.json", &mut app_paths);
    }

    discover_markdown_components(
        root,
        &command_paths,
        "command",
        "ready",
        &mut components,
        diagnostics,
    )?;
    discover_file_components(
        root,
        &workflow_paths,
        "workflow",
        "unsupported",
        &mut components,
        diagnostics,
    )?;
    discover_file_components(
        root,
        &hook_paths,
        "hook",
        "unsupported",
        &mut components,
        diagnostics,
    )?;
    components.extend(lsp_servers.iter().map(|server| PluginExtensionComponent {
        kind: "lsp".into(),
        name: server.name.clone(),
        path: server.source_path.clone(),
        status: if server.transport == "stdio" {
            "requires_trust".into()
        } else {
            "unsupported".into()
        },
    }));
    discover_file_components(
        root,
        &app_paths,
        "app",
        "unsupported",
        &mut components,
        diagnostics,
    )?;
    discover_file_components(
        root,
        &output_style_paths,
        "output_style",
        "unsupported",
        &mut components,
        diagnostics,
    )?;
    discover_monitor_entries(root, &monitor_paths, &mut components, diagnostics)?;

    components.sort_by(|left, right| {
        left.kind
            .cmp(&right.kind)
            .then_with(|| left.path.cmp(&right.path))
    });
    components.dedup_by(|left, right| {
        left.kind == right.kind && left.name == right.name && left.path == right.path
    });

    for component in &components {
        if component.status == "unsupported" {
            diagnostics.push(PluginDiagnostic {
                level: PluginDiagnosticLevel::Warning,
                code: "native_component_unsupported".into(),
                message: format!(
                    "{} is preserved but has no Code2 runtime adapter yet",
                    component.kind
                ),
                component: Some(component.path.clone()),
            });
        }
    }
    Ok(components)
}

fn append_manifest_paths(
    output: &mut Vec<String>,
    value: Option<&Value>,
    label: &str,
) -> Result<(), PluginError> {
    let Some(value) = value else {
        return Ok(());
    };
    if value.is_object() {
        return Ok(());
    }
    for path in path_values(value, label)? {
        if !path.starts_with("./") {
            return Err(PluginError::Invalid(format!(
                "Plugin manifest path for {label} must start with ./"
            )));
        }
        output.push(path);
    }
    Ok(())
}

fn add_existing_default(root: &Path, relative: &str, output: &mut Vec<String>) {
    if root.join(relative).exists() {
        output.push(format!("./{relative}"));
    }
}

fn add_simple_existing_component(
    root: &Path,
    relative: &str,
    kind: &str,
    status: &str,
    output: &mut Vec<PluginExtensionComponent>,
) -> Result<(), PluginError> {
    let path = root.join(relative);
    if path.exists() {
        ensure_plugin_path(root, &path)?;
        output.push(PluginExtensionComponent {
            kind: kind.into(),
            name: Path::new(relative)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or(kind)
                .to_string(),
            path: relative.into(),
            status: status.into(),
        });
    }
    Ok(())
}

fn discover_markdown_components(
    root: &Path,
    configured: &[String],
    kind: &str,
    status: &str,
    output: &mut Vec<PluginExtensionComponent>,
    diagnostics: &mut Vec<PluginDiagnostic>,
) -> Result<(), PluginError> {
    for relative in configured {
        let path = root.join(safe_relative(Path::new(relative))?);
        if !path.exists() {
            diagnostics.push(missing_component_diagnostic(kind, relative));
            continue;
        }
        ensure_plugin_path(root, &path)?;
        let mut files = Vec::new();
        if path.is_file() {
            files.push(path);
        } else {
            collect_extension(&path, "md", 0, &mut files)?;
        }
        for file in files {
            let relative = file.strip_prefix(root).unwrap_or(&file).to_string_lossy();
            output.push(PluginExtensionComponent {
                kind: kind.into(),
                name: file
                    .file_stem()
                    .and_then(|name| name.to_str())
                    .unwrap_or(kind)
                    .to_string(),
                path: relative.into_owned(),
                status: status.into(),
            });
        }
    }
    Ok(())
}

fn discover_file_components(
    root: &Path,
    configured: &[String],
    kind: &str,
    status: &str,
    output: &mut Vec<PluginExtensionComponent>,
    diagnostics: &mut Vec<PluginDiagnostic>,
) -> Result<(), PluginError> {
    for relative in configured {
        let path = root.join(safe_relative(Path::new(relative))?);
        if !path.exists() {
            diagnostics.push(missing_component_diagnostic(kind, relative));
            continue;
        }
        ensure_plugin_path(root, &path)?;
        output.push(PluginExtensionComponent {
            kind: kind.into(),
            name: path
                .file_stem()
                .and_then(|name| name.to_str())
                .unwrap_or(kind)
                .to_string(),
            path: path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .into_owned(),
            status: status.into(),
        });
    }
    Ok(())
}

fn discover_monitor_entries(
    root: &Path,
    configured: &[String],
    output: &mut Vec<PluginExtensionComponent>,
    diagnostics: &mut Vec<PluginDiagnostic>,
) -> Result<(), PluginError> {
    for relative in configured {
        let path = root.join(safe_relative(Path::new(relative))?);
        if !path.exists() {
            diagnostics.push(missing_component_diagnostic("monitor", relative));
            continue;
        }
        ensure_plugin_path(root, &path)?;
        let value: Value = serde_json::from_str(&read_small_text(&path)?)?;
        if let Some(entries) = value.as_array() {
            for (index, entry) in entries.iter().enumerate() {
                let name = entry
                    .get("name")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("monitor-{}", index + 1));
                output.push(PluginExtensionComponent {
                    kind: "monitor".into(),
                    name,
                    path: path
                        .strip_prefix(root)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .into_owned(),
                    status: "unsupported".into(),
                });
            }
        } else {
            diagnostics.push(PluginDiagnostic {
                level: PluginDiagnosticLevel::Error,
                code: "invalid_monitor_config".into(),
                message: "Monitor configuration must be a JSON array".into(),
                component: Some(relative.clone()),
            });
        }
    }
    Ok(())
}

fn missing_component_diagnostic(kind: &str, relative: &str) -> PluginDiagnostic {
    PluginDiagnostic {
        level: PluginDiagnosticLevel::Warning,
        code: format!("missing_{kind}_path"),
        message: format!("Configured {kind} path does not exist: {relative}"),
        component: Some(relative.into()),
    }
}

fn discover_skill_files(
    root: &Path,
    configured: &[String],
    agent_portable: bool,
    native_conventions: bool,
    diagnostics: &mut Vec<PluginDiagnostic>,
) -> Result<Vec<SkillCandidate>, PluginError> {
    let mut files = Vec::new();
    let top = root.join("SKILL.md");
    if native_conventions && top.is_file() {
        ensure_plugin_path(root, &top)?;
        files.push(SkillCandidate {
            path: top,
            strict_agent_skill: false,
        });
    }
    if agent_portable {
        let skills_root = root.join("skills");
        match std::fs::read_dir(&skills_root) {
            Ok(entries) => {
                for entry in entries {
                    let entry = entry?;
                    let metadata = std::fs::symlink_metadata(entry.path())?;
                    if metadata.file_type().is_symlink() || !metadata.is_dir() {
                        continue;
                    }
                    let manifest = entry.path().join("SKILL.md");
                    if manifest.is_file() {
                        ensure_plugin_path(root, &manifest)?;
                        files.push(SkillCandidate {
                            path: manifest,
                            strict_agent_skill: true,
                        });
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                diagnostics.push(PluginDiagnostic {
                    level: PluginDiagnosticLevel::Error,
                    code: "agent_skills_location_invalid".into(),
                    message: format!("Could not read Agent Plugins skills directory: {error}"),
                    component: Some("skills".into()),
                });
            }
        }
    }

    let mut native_files = Vec::new();
    if native_conventions {
        for relative in ["skills", ".codex/skills", ".claude/skills"] {
            collect_named(&root.join(relative), "SKILL.md", 0, &mut native_files)?;
        }
    }
    for configured in configured {
        if !configured.starts_with("./") {
            safe_relative(Path::new(configured))?;
            return Err(PluginError::Invalid(
                "Plugin manifest path for skills must start with ./".into(),
            ));
        }
        let configured = root.join(safe_relative(Path::new(configured))?);
        if !configured.exists() {
            diagnostics.push(missing_component_diagnostic(
                "skill",
                &configured
                    .strip_prefix(root)
                    .unwrap_or(&configured)
                    .to_string_lossy(),
            ));
            continue;
        }
        ensure_plugin_path(root, &configured)?;
        if configured.is_file() {
            native_files.push(configured);
        } else {
            collect_named(&configured, "SKILL.md", 0, &mut native_files)?;
        }
    }
    files.extend(native_files.into_iter().map(|path| SkillCandidate {
        path,
        strict_agent_skill: false,
    }));
    files.sort_by(|left, right| left.path.cmp(&right.path));
    let mut merged = Vec::<SkillCandidate>::new();
    for candidate in files {
        if let Some(previous) = merged.last_mut().filter(|item| item.path == candidate.path) {
            previous.strict_agent_skill |= candidate.strict_agent_skill;
        } else {
            merged.push(candidate);
        }
    }
    Ok(merged)
}

fn parse_skills(
    root: &Path,
    plugin_id: &str,
    source: &str,
    files: Vec<SkillCandidate>,
    diagnostics: &mut Vec<PluginDiagnostic>,
) -> Result<Vec<Skill>, PluginError> {
    let mut skills = Vec::new();
    for candidate in files {
        let path = candidate.path;
        let text = read_small_text(&path)?;
        let prompt = markdown_body(&text).trim();
        if prompt.is_empty() {
            diagnostics.push(PluginDiagnostic {
                level: PluginDiagnosticLevel::Warning,
                code: "empty_skill".into(),
                message: "Skipped a Skill with no instructions".into(),
                component: Some(
                    path.strip_prefix(root)
                        .unwrap_or(&path)
                        .display()
                        .to_string(),
                ),
            });
            continue;
        }
        let fallback = path
            .parent()
            .and_then(Path::file_name)
            .and_then(|name| name.to_str())
            .unwrap_or("Skill");
        let (name, description) = parse_frontmatter(&text);
        if candidate.strict_agent_skill
            && (name
                .as_deref()
                .is_none_or(|name| !valid_agent_skill_name(name))
                || description
                    .as_deref()
                    .is_none_or(|description| description.trim().is_empty()))
        {
            diagnostics.push(PluginDiagnostic {
                level: PluginDiagnosticLevel::Warning,
                code: "invalid_agent_skill".into(),
                message: "Skipped Agent Skill: frontmatter requires a valid name and non-empty description".into(),
                component: Some(path.strip_prefix(root).unwrap_or(&path).display().to_string()),
            });
            continue;
        }
        let name = name.unwrap_or_else(|| fallback.to_string());
        let relative = path.strip_prefix(root).unwrap_or(&path).to_string_lossy();
        skills.push(Skill {
            id: format!("{plugin_id}:skill:{}", slug_with_hash(&relative)),
            name: name.clone(),
            description: truncate(description.unwrap_or_default().trim(), 280),
            icon: None,
            source: Some(source.to_string()),
            payload: SkillPayload::AgentSkill {
                skill_ref: name,
                inline_text: Some(prompt.to_string()),
            },
        });
    }
    Ok(skills)
}

fn valid_agent_skill_name(value: &str) -> bool {
    let len = value.chars().count();
    (1..=64).contains(&len)
        && !value.starts_with('-')
        && !value.ends_with('-')
        && value
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
}

fn parse_command_components(
    root: &Path,
    plugin_id: &str,
    source: &str,
    inventory: &[PluginExtensionComponent],
    diagnostics: &mut Vec<PluginDiagnostic>,
) -> Result<Vec<Skill>, PluginError> {
    let mut commands = Vec::new();
    for item in inventory.iter().filter(|item| item.kind == "command") {
        let path = root.join(safe_relative(Path::new(&item.path))?);
        ensure_plugin_path(root, &path)?;
        let text = read_small_text(&path)?;
        let prompt = markdown_body(&text).trim();
        if prompt.is_empty() {
            diagnostics.push(PluginDiagnostic {
                level: PluginDiagnosticLevel::Warning,
                code: "empty_command".into(),
                message: "Skipped a command with no instructions".into(),
                component: Some(item.path.clone()),
            });
            continue;
        }
        let (frontmatter_name, description) = parse_frontmatter(&text);
        let name = frontmatter_name.unwrap_or_else(|| item.name.clone());
        commands.push(Skill {
            id: format!("{plugin_id}:command:{}", slug_with_hash(&item.path)),
            name: name.clone(),
            description: truncate(description.unwrap_or_default().trim(), 280),
            icon: None,
            source: Some(source.to_string()),
            payload: SkillPayload::AgentSkill {
                skill_ref: name,
                inline_text: Some(prompt.to_string()),
            },
        });
    }
    Ok(commands)
}

fn parse_subagents(
    root: &Path,
    plugin_id: &str,
    source: &str,
    configured: &[String],
    native_conventions: bool,
    diagnostics: &mut Vec<PluginDiagnostic>,
) -> Result<Vec<Skill>, PluginError> {
    let mut files = Vec::new();
    if native_conventions {
        for relative in ["agents", "subagents", ".codex/agents", ".claude/agents"] {
            collect_extension(&root.join(relative), "md", 0, &mut files)?;
        }
    }
    for relative in configured {
        if !relative.starts_with("./") {
            return Err(PluginError::Invalid(
                "Plugin manifest path for agents must start with ./".into(),
            ));
        }
        let path = root.join(safe_relative(Path::new(relative))?);
        if !path.exists() {
            diagnostics.push(missing_component_diagnostic("agent", relative));
            continue;
        }
        ensure_plugin_path(root, &path)?;
        if path.is_file() {
            files.push(path);
        } else {
            collect_extension(&path, "md", 0, &mut files)?;
        }
    }
    files.sort();
    files.dedup();
    let mut agents = Vec::new();
    for path in files {
        let text = read_small_text(&path)?;
        let prompt = markdown_body(&text).trim();
        if prompt.is_empty() {
            continue;
        }
        let fallback = path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("Subagent");
        let (name, description) = parse_frontmatter(&text);
        let name = name.unwrap_or_else(|| fallback.to_string());
        let relative = path.strip_prefix(root).unwrap_or(&path).to_string_lossy();
        agents.push(Skill {
            id: format!("{plugin_id}:agent:{}", slug_with_hash(&relative)),
            name: name.clone(),
            description: truncate(description.unwrap_or_default().trim(), 280),
            icon: None,
            source: Some(source.to_string()),
            payload: SkillPayload::Subagent {
                agent: SubagentDefinition {
                    name,
                    description: frontmatter_scalar(&text, "description").unwrap_or_default(),
                    prompt: prompt.to_string(),
                    model: frontmatter_scalar(&text, "model"),
                    tools: frontmatter_list(&text, "tools"),
                },
            },
        });
    }
    Ok(agents)
}

fn parse_mcp_servers(
    root: &Path,
    plugin_id: &str,
    source: &str,
    configured: &[Value],
    agent_portable: bool,
    native_conventions: bool,
    diagnostics: &mut Vec<PluginDiagnostic>,
) -> Result<Vec<Skill>, PluginError> {
    let mut sources = Vec::new();
    if agent_portable {
        let path = root.join("mcp.json");
        if path.is_file() {
            ensure_plugin_path(root, &path)?;
            match serde_json::from_str::<Value>(&std::fs::read_to_string(&path)?) {
                Ok(value) => sources.push(McpConfigSource {
                    value,
                    strict_agent_plugins: true,
                    label: "mcp.json".into(),
                }),
                Err(error) => diagnostics.push(PluginDiagnostic {
                    level: PluginDiagnosticLevel::Error,
                    code: "invalid_agent_mcp_json".into(),
                    message: format!("Disabled Agent Plugins MCP configuration: {error}"),
                    component: Some("mcp.json".into()),
                }),
            }
        }
    }
    let default_path = root.join(".mcp.json");
    if native_conventions && default_path.is_file() {
        ensure_plugin_path(root, &default_path)?;
        match serde_json::from_str::<Value>(&std::fs::read_to_string(default_path)?) {
            Ok(value) => sources.push(McpConfigSource {
                value,
                strict_agent_plugins: false,
                label: ".mcp.json".into(),
            }),
            Err(error) => diagnostics.push(PluginDiagnostic {
                level: PluginDiagnosticLevel::Error,
                code: "invalid_native_mcp_json".into(),
                message: format!("Skipped native MCP configuration: {error}"),
                component: Some(".mcp.json".into()),
            }),
        }
    }
    for value in configured {
        push_native_mcp_sources(root, value, &mut sources, diagnostics)?;
    }

    let mut components = Vec::new();
    let mut names = HashSet::new();
    for source_config in sources {
        let servers = match mcp_entries(&source_config) {
            Ok(servers) => servers,
            Err(message) => {
                diagnostics.push(PluginDiagnostic {
                    level: PluginDiagnosticLevel::Error,
                    code: "invalid_mcp_document".into(),
                    message,
                    component: Some(source_config.label),
                });
                continue;
            }
        };
        for (name, config) in servers {
            if !names.insert(name.clone()) {
                diagnostics.push(PluginDiagnostic {
                    level: PluginDiagnosticLevel::Warning,
                    code: "duplicate_mcp_server".into(),
                    message: format!("Ignored duplicate MCP server named {name}"),
                    component: Some(source_config.label.clone()),
                });
                continue;
            }
            match parse_mcp_server(root, &name, config, source_config.strict_agent_plugins) {
                Ok(server) => components.push(Skill {
                    id: format!("{plugin_id}:mcp:{}", slug_with_hash(&name)),
                    name: name.to_string(),
                    description: format!("MCP server from plugin {source}"),
                    icon: None,
                    source: Some(source.to_string()),
                    payload: SkillPayload::Mcp { server },
                }),
                Err(message) => diagnostics.push(PluginDiagnostic {
                    level: PluginDiagnosticLevel::Error,
                    code: "invalid_mcp_server".into(),
                    message,
                    component: Some(format!("{}#{name}", source_config.label)),
                }),
            }
        }
    }
    Ok(components)
}

fn push_native_mcp_sources(
    root: &Path,
    value: &Value,
    sources: &mut Vec<McpConfigSource>,
    diagnostics: &mut Vec<PluginDiagnostic>,
) -> Result<(), PluginError> {
    if let Some(path) = value.as_str() {
        if !path.starts_with("./") {
            return Err(PluginError::Invalid(
                "Plugin manifest path for mcpServers must start with ./".into(),
            ));
        }
        let full_path = root.join(safe_relative(Path::new(path))?);
        if !full_path.exists() {
            diagnostics.push(missing_component_diagnostic("mcp", path));
            return Ok(());
        }
        ensure_plugin_path(root, &full_path)?;
        match serde_json::from_str::<Value>(&std::fs::read_to_string(&full_path)?) {
            Ok(value) => sources.push(McpConfigSource {
                value,
                strict_agent_plugins: false,
                label: path.into(),
            }),
            Err(error) => diagnostics.push(PluginDiagnostic {
                level: PluginDiagnosticLevel::Error,
                code: "invalid_native_mcp_json".into(),
                message: format!("Skipped native MCP configuration: {error}"),
                component: Some(path.into()),
            }),
        }
        return Ok(());
    }
    if let Some(items) = value.as_array() {
        for item in items {
            push_native_mcp_sources(root, item, sources, diagnostics)?;
        }
        return Ok(());
    }
    if value.is_object() {
        sources.push(McpConfigSource {
            value: value.clone(),
            strict_agent_plugins: false,
            label: "inline mcpServers".into(),
        });
        return Ok(());
    }
    Err(PluginError::Invalid(
        "mcpServers must be a path, array, or object".into(),
    ))
}

fn mcp_entries(source: &McpConfigSource) -> Result<&serde_json::Map<String, Value>, String> {
    let object = source
        .value
        .as_object()
        .ok_or_else(|| "MCP configuration must be a JSON object".to_string())?;
    if source.strict_agent_plugins {
        let schema = object
            .get("$schema")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let supported_schema = AGENT_MCP_SCHEMA
            .get("$id")
            .and_then(Value::as_str)
            .expect("bundled Agent Plugins MCP schema must declare $id");
        if schema != supported_schema {
            return Err(format!("Unsupported Agent Plugins MCP schema: {schema}"));
        }
        if object
            .keys()
            .any(|key| !matches!(key.as_str(), "$schema" | "mcpServers"))
        {
            return Err("Agent Plugins mcp.json contains unknown top-level fields".into());
        }
        return object
            .get("mcpServers")
            .and_then(Value::as_object)
            .ok_or_else(|| "Agent Plugins mcp.json requires an mcpServers object".into());
    }
    object
        .get("mcpServers")
        .unwrap_or(&source.value)
        .as_object()
        .ok_or_else(|| "MCP configuration must contain an mcpServers object".into())
}

fn parse_mcp_server(
    root: &Path,
    name: &str,
    value: &Value,
    strict: bool,
) -> Result<McpServer, String> {
    let config = value
        .as_object()
        .ok_or_else(|| format!("MCP server {name} must be an object"))?;
    let declared = config.get("type").and_then(Value::as_str);
    let transport_name = if strict {
        declared.ok_or_else(|| format!("MCP server {name} requires a type"))?
    } else if declared.is_some() {
        declared.unwrap()
    } else if config.contains_key("command") {
        "stdio"
    } else {
        "http"
    };

    match transport_name {
        "stdio" => {
            if strict {
                reject_unknown_fields(config, &["type", "command", "args", "env", "cwd"], name)?;
            }
            let command = config
                .get("command")
                .and_then(Value::as_str)
                .filter(|command| !command.is_empty())
                .ok_or_else(|| format!("MCP server {name} requires a non-empty command"))?;
            if strict {
                validate_stdio_command(root, command, name)?;
            }
            let args = string_array(config.get("args"), &format!("MCP server {name} args"))
                .map_err(|error| error.to_string())?;
            let env = string_map(config.get("env"), &format!("MCP server {name} env"))
                .map_err(|error| error.to_string())?;
            if strict
                && env
                    .iter()
                    .any(|(key, _)| matches!(key.as_str(), "PLUGIN_ROOT" | "PLUGIN_DATA"))
            {
                return Err(format!(
                    "MCP server {name} cannot set reserved plugin environment variables"
                ));
            }
            let cwd = config
                .get("cwd")
                .map(|value| {
                    value
                        .as_str()
                        .ok_or_else(|| format!("MCP server {name} cwd must be a string"))
                        .and_then(|cwd| validate_mcp_cwd(root, cwd, strict, name))
                })
                .transpose()?;
            Ok(McpServer {
                name: name.into(),
                cwd,
                transport: McpTransport::Stdio {
                    command: command.into(),
                    args,
                    env,
                },
            })
        }
        "http" | "streamable-http" | "sse" => {
            if strict {
                reject_unknown_fields(config, &["type", "url", "headers"], name)?;
                if transport_name == "http" {
                    return Err(format!(
                        "MCP server {name} must declare streamable-http, not http, in Agent Plugins"
                    ));
                }
            }
            let url = config
                .get("url")
                .and_then(Value::as_str)
                .ok_or_else(|| format!("MCP server {name} requires a URL"))?;
            validate_remote_url(url, name)?;
            let headers = string_map(config.get("headers"), &format!("MCP server {name} headers"))
                .map_err(|error| error.to_string())?;
            validate_headers(&headers, name)?;
            let transport = if transport_name == "sse" {
                McpTransport::Sse {
                    url: url.into(),
                    headers,
                }
            } else {
                McpTransport::Http {
                    url: url.into(),
                    headers,
                }
            };
            Ok(McpServer {
                name: name.into(),
                cwd: None,
                transport,
            })
        }
        other => Err(format!(
            "MCP server {name} has unsupported transport {other}"
        )),
    }
}

fn reject_unknown_fields(
    config: &serde_json::Map<String, Value>,
    allowed: &[&str],
    name: &str,
) -> Result<(), String> {
    if let Some(field) = config
        .keys()
        .find(|field| !allowed.contains(&field.as_str()))
    {
        return Err(format!("MCP server {name} contains unknown field {field}"));
    }
    Ok(())
}

fn validate_stdio_command(root: &Path, command: &str, name: &str) -> Result<(), String> {
    if command.contains("${") {
        return Err(format!(
            "MCP server {name} command cannot contain placeholders"
        ));
    }
    if command.starts_with("./") {
        let path = root.join(safe_relative(Path::new(command)).map_err(|error| error.to_string())?);
        if path.exists() {
            ensure_plugin_path(root, &path).map_err(|error| error.to_string())?;
        }
    } else if command.contains('/') || command.contains('\\') {
        return Err(format!(
            "MCP server {name} command must be a bare executable or start with ./"
        ));
    }
    Ok(())
}

fn validate_mcp_cwd(root: &Path, cwd: &str, strict: bool, name: &str) -> Result<String, String> {
    if !strict {
        return Ok(cwd.into());
    }
    let relative = if let Some(relative) = cwd.strip_prefix("./") {
        Some(relative)
    } else if let Some(relative) = cwd.strip_prefix("${PLUGIN_ROOT}") {
        Some(relative.trim_start_matches('/'))
    } else if cwd == "${PLUGIN_DATA}" || cwd.starts_with("${PLUGIN_DATA}/") {
        None
    } else {
        return Err(format!("MCP server {name} cwd has an unsupported form"));
    };
    if let Some(relative) = relative.filter(|value| !value.is_empty()) {
        let path =
            root.join(safe_relative(Path::new(relative)).map_err(|error| error.to_string())?);
        if path.exists() {
            ensure_plugin_path(root, &path).map_err(|error| error.to_string())?;
        }
    }
    Ok(cwd.into())
}

fn validate_remote_url(value: &str, name: &str) -> Result<(), String> {
    if value.contains("${") {
        return Err(format!("MCP server {name} URL cannot contain placeholders"));
    }
    let url =
        url::Url::parse(value).map_err(|_| format!("MCP server {name} has an invalid URL"))?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err(format!("MCP server {name} has an unsafe URL"));
    }
    if url.scheme() == "http" {
        let host = url.host_str().unwrap_or_default();
        let loopback = host.eq_ignore_ascii_case("localhost")
            || host
                .parse::<std::net::IpAddr>()
                .is_ok_and(|address| address.is_loopback());
        if !loopback {
            return Err(format!("MCP server {name} must use HTTPS outside loopback"));
        }
    }
    Ok(())
}

fn validate_headers(headers: &[(String, String)], name: &str) -> Result<(), String> {
    let mut names = HashSet::new();
    for (header, value) in headers {
        if header.is_empty()
            || !header.chars().all(|ch| {
                ch.is_ascii_alphanumeric()
                    || matches!(
                        ch,
                        '!' | '#'
                            | '$'
                            | '%'
                            | '&'
                            | '\''
                            | '*'
                            | '+'
                            | '-'
                            | '.'
                            | '^'
                            | '_'
                            | '`'
                            | '|'
                            | '~'
                    )
            })
            || value
                .chars()
                .any(|ch| ch == '\r' || ch == '\n' || ch.is_control())
            || value.contains("${")
        {
            return Err(format!(
                "MCP server {name} contains an invalid literal header"
            ));
        }
        if !names.insert(header.to_ascii_lowercase()) {
            return Err(format!("MCP server {name} contains duplicate header names"));
        }
    }
    Ok(())
}

fn discover_scaffolds(root: &Path) -> Result<Vec<PluginScaffold>, PluginError> {
    let mut scaffolds = Vec::new();
    for container_name in ["scaffolds", "templates"] {
        let container = root.join(container_name);
        let entries = match std::fs::read_dir(&container) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.into()),
        };
        for entry in entries {
            let entry = entry?;
            let metadata = std::fs::symlink_metadata(entry.path())?;
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                continue;
            }
            let fallback = entry.file_name().to_string_lossy().to_string();
            let metadata_path = entry.path().join("scaffold.json");
            let raw = if metadata_path.is_file() {
                ensure_plugin_path(root, &metadata_path)?;
                serde_json::from_str::<RawScaffold>(&std::fs::read_to_string(metadata_path)?)?
            } else {
                RawScaffold::default()
            };
            let id = slug_with_hash(&format!("{container_name}/{fallback}"));
            let files = count_scaffold_files(&entry.path())?;
            if files == 0 {
                continue;
            }
            scaffolds.push(PluginScaffold {
                id,
                name: if raw.name.trim().is_empty() {
                    title_case(&fallback)
                } else {
                    raw.name.trim().to_string()
                },
                description: truncate(raw.description.trim(), 280),
                path: PathBuf::from(container_name).join(&fallback),
                files,
            });
        }
    }
    scaffolds.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(scaffolds)
}

/// Count the plugin's Agent Scenes components: `scenes/*.scene.json` and `scenes/*.pipeline.json`
/// documents, serde-parsed and validated against the 1.0.0 schemas at install/parse time. Invalid
/// or unreadable files are warned about and skipped — never fatal to the install (docs/scenes.md:
/// same posture as `SkillLibrary::load_dir`). The bundle collector already preserves the
/// directory verbatim; hosts read the installed copy back through [`plugin_scenes_dir`].
fn count_scene_components(root: &Path) -> (usize, usize) {
    let dir = root.join("scenes");
    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(error) => {
            if error.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!("plugin scenes dir {dir:?}: {error}");
            }
            return (0, 0);
        }
    };
    let mut scenes = 0;
    let mut pipelines = 0;
    let mut paths: Vec<PathBuf> = entries.filter_map(|e| e.ok().map(|e| e.path())).collect();
    paths.sort();
    for path in paths {
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.ends_with(".scene.json") {
            let parsed = std::fs::read_to_string(&path)
                .map_err(|e| e.to_string())
                .and_then(|data| {
                    serde_json::from_str::<crate::scene::Scene>(&data).map_err(|e| e.to_string())
                })
                .and_then(|scene| crate::scene::validate_scene(&scene).map(|()| scene));
            match parsed {
                Ok(_) => scenes += 1,
                Err(error) => tracing::warn!("plugin scene {path:?}: {error} (skipped)"),
            }
        } else if name.ends_with(".pipeline.json") {
            let parsed = std::fs::read_to_string(&path)
                .map_err(|e| e.to_string())
                .and_then(|data| {
                    serde_json::from_str::<crate::scene::Pipeline>(&data).map_err(|e| e.to_string())
                })
                .and_then(|pipeline| crate::scene::validate_pipeline(&pipeline).map(|()| pipeline));
            match parsed {
                Ok(_) => pipelines += 1,
                Err(error) => tracing::warn!("plugin pipeline {path:?}: {error} (skipped)"),
            }
        }
    }
    (scenes, pipelines)
}

/// Where an installed plugin's scene components live on disk. [`install`] preserves the verified
/// bundle under `<plugins_dir>/<id>/bundle/`, so the scene loader must read
/// `<plugins_dir>/<id>/bundle/scenes` — this helper keeps that layout knowledge in one place.
pub fn plugin_scenes_dir(plugins_dir: &Path, id: &str) -> PathBuf {
    plugins_dir.join(id).join(BUNDLE_DIR).join("scenes")
}

fn collect_bundle_files(root: &Path) -> Result<Vec<PluginFile>, PluginError> {
    let mut files = Vec::new();
    let mut bytes = 0;
    collect_files(root, root, 0, &mut bytes, &mut files, false)?;
    Ok(files)
}

fn collect_apply_files(root: &Path) -> Result<Vec<PluginFile>, PluginError> {
    let mut files = Vec::new();
    let mut bytes = 0;
    collect_files(root, root, 0, &mut bytes, &mut files, true)?;
    Ok(files)
}

fn collect_files(
    root: &Path,
    dir: &Path,
    depth: usize,
    bytes: &mut u64,
    files: &mut Vec<PluginFile>,
    skip_scaffold_metadata: bool,
) -> Result<(), PluginError> {
    if depth > MAX_DEPTH {
        return Err(PluginError::Invalid(
            "Plugin directory is nested too deeply".into(),
        ));
    }
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if metadata.is_dir() {
            if matches!(name.as_ref(), ".git" | "node_modules" | "target" | ".venv") {
                continue;
            }
            collect_files(root, &path, depth + 1, bytes, files, skip_scaffold_metadata)?;
            continue;
        }
        if !metadata.is_file() || (skip_scaffold_metadata && name == "scaffold.json") {
            continue;
        }
        if metadata.len() > MAX_FILE_BYTES {
            return Err(PluginError::FileTooLarge(
                MAX_FILE_BYTES / 1024 / 1024,
                path.display().to_string(),
            ));
        }
        *bytes += metadata.len();
        if *bytes > MAX_BUNDLE_BYTES {
            return Err(PluginError::BundleTooLarge(MAX_BUNDLE_BYTES / 1024 / 1024));
        }
        if files.len() >= MAX_FILES {
            return Err(PluginError::TooManyFiles(MAX_FILES));
        }
        let relative = safe_relative(path.strip_prefix(root).unwrap_or(&path))?.to_path_buf();
        files.push(PluginFile {
            path: relative,
            bytes: std::fs::read(path)?,
            mode: file_mode(&metadata),
        });
    }
    Ok(())
}

fn collect_named(
    dir: &Path,
    filename: &str,
    depth: usize,
    out: &mut Vec<PathBuf>,
) -> Result<(), PluginError> {
    collect_matching(dir, depth, out, &|path| {
        path.file_name().and_then(|name| name.to_str()) == Some(filename)
    })
}

fn collect_extension(
    dir: &Path,
    extension: &str,
    depth: usize,
    out: &mut Vec<PathBuf>,
) -> Result<(), PluginError> {
    collect_matching(dir, depth, out, &|path| {
        path.extension().and_then(|value| value.to_str()) == Some(extension)
    })
}

fn collect_matching(
    dir: &Path,
    depth: usize,
    out: &mut Vec<PathBuf>,
    matches: &dyn Fn(&Path) -> bool,
) -> Result<(), PluginError> {
    if depth > MAX_DEPTH || !dir.exists() {
        return Ok(());
    }
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_file() && matches(&path) {
            out.push(path);
            if out.len() > MAX_COMPONENTS {
                return Err(PluginError::TooManyComponents(MAX_COMPONENTS));
            }
        } else if metadata.is_dir() {
            collect_matching(&path, depth + 1, out, matches)?;
        }
    }
    Ok(())
}

fn count_scaffold_files(root: &Path) -> Result<usize, PluginError> {
    Ok(collect_apply_files(root)?.len())
}

fn read_small_text(path: &Path) -> Result<String, PluginError> {
    let metadata = std::fs::metadata(path)?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err(PluginError::FileTooLarge(
            MAX_FILE_BYTES / 1024 / 1024,
            path.display().to_string(),
        ));
    }
    std::fs::read_to_string(path).map_err(PluginError::Io)
}

fn write_file(target: &Path, file: &PluginFile) -> Result<(), PluginError> {
    std::fs::write(target, &file.bytes)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(target, std::fs::Permissions::from_mode(file.mode))?;
    }
    Ok(())
}

#[cfg(unix)]
fn file_mode(metadata: &std::fs::Metadata) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode() & 0o777
}

#[cfg(not(unix))]
fn file_mode(_metadata: &std::fs::Metadata) -> u32 {
    0
}

fn plugin_data_dir(plugins_dir: &Path, id: &str) -> PathBuf {
    plugins_dir.join(".data").join(id)
}

fn resolve_relative_mcp_commands(plugin: &mut InstalledPlugin, plugin_dir: &Path, data_dir: &Path) {
    let bundle_root = plugin_dir.join(BUNDLE_DIR);
    let standards = plugin.standards.clone();
    for component in &mut plugin.components {
        let SkillPayload::Mcp { server } = &mut component.payload else {
            continue;
        };
        let McpTransport::Stdio { command, args, env } = &mut server.transport else {
            continue;
        };
        if let Some(relative) = command.strip_prefix("./") {
            *command = bundle_root.join(relative).display().to_string();
        } else if standards
            .iter()
            .any(|standard| matches!(standard, PluginStandard::Codex | PluginStandard::ClaudeCode))
        {
            *command = expand_plugin_variables(command, &bundle_root, data_dir, &standards);
        }
        for arg in args {
            *arg = expand_plugin_variables(arg, &bundle_root, data_dir, &standards);
        }
        for (_, value) in env.iter_mut() {
            *value = expand_plugin_variables(value, &bundle_root, data_dir, &standards);
        }
        env.retain(|(name, _)| {
            ![
                "PLUGIN_ROOT",
                "PLUGIN_DATA",
                "CLAUDE_PLUGIN_ROOT",
                "CLAUDE_PLUGIN_DATA",
                "CODEX_PLUGIN_ROOT",
                "CODEX_PLUGIN_DATA",
            ]
            .iter()
            .any(|reserved| name.eq_ignore_ascii_case(reserved))
        });
        env.push(("PLUGIN_ROOT".into(), bundle_root.display().to_string()));
        env.push(("PLUGIN_DATA".into(), data_dir.display().to_string()));
        if standards.contains(&PluginStandard::ClaudeCode) {
            env.push((
                "CLAUDE_PLUGIN_ROOT".into(),
                bundle_root.display().to_string(),
            ));
            env.push(("CLAUDE_PLUGIN_DATA".into(), data_dir.display().to_string()));
        }
        if standards.contains(&PluginStandard::Codex) {
            env.push((
                "CODEX_PLUGIN_ROOT".into(),
                bundle_root.display().to_string(),
            ));
            env.push(("CODEX_PLUGIN_DATA".into(), data_dir.display().to_string()));
        }
        if let Some(cwd) = &mut server.cwd {
            if let Some(relative) = cwd.strip_prefix("./") {
                *cwd = bundle_root.join(relative).display().to_string();
            } else {
                *cwd = expand_plugin_variables(cwd, &bundle_root, data_dir, &standards);
            }
        }
    }
    for server in &mut plugin.lsp_servers {
        if let Some(relative) = server.command.strip_prefix("./") {
            server.command = bundle_root.join(relative).display().to_string();
        } else {
            server.command =
                expand_plugin_variables(&server.command, &bundle_root, data_dir, &standards);
        }
        for arg in &mut server.args {
            *arg = expand_plugin_variables(arg, &bundle_root, data_dir, &standards);
        }
        for (_, value) in &mut server.env {
            *value = expand_plugin_variables(value, &bundle_root, data_dir, &standards);
        }
        server.env.retain(|(name, _)| {
            ![
                "PLUGIN_ROOT",
                "PLUGIN_DATA",
                "CLAUDE_PLUGIN_ROOT",
                "CLAUDE_PLUGIN_DATA",
                "CODEX_PLUGIN_ROOT",
                "CODEX_PLUGIN_DATA",
            ]
            .iter()
            .any(|reserved| name.eq_ignore_ascii_case(reserved))
        });
        server
            .env
            .push(("PLUGIN_ROOT".into(), bundle_root.display().to_string()));
        server
            .env
            .push(("PLUGIN_DATA".into(), data_dir.display().to_string()));
        if standards.contains(&PluginStandard::ClaudeCode) {
            server.env.push((
                "CLAUDE_PLUGIN_ROOT".into(),
                bundle_root.display().to_string(),
            ));
            server
                .env
                .push(("CLAUDE_PLUGIN_DATA".into(), data_dir.display().to_string()));
        }
        if standards.contains(&PluginStandard::Codex) {
            server.env.push((
                "CODEX_PLUGIN_ROOT".into(),
                bundle_root.display().to_string(),
            ));
            server
                .env
                .push(("CODEX_PLUGIN_DATA".into(), data_dir.display().to_string()));
        }
    }
}

fn expand_plugin_variables(
    value: &str,
    root: &Path,
    data: &Path,
    standards: &[PluginStandard],
) -> String {
    let root = root.display().to_string();
    let data = data.display().to_string();
    let mut expanded = value
        .replace("${PLUGIN_ROOT}", &root)
        .replace("${PLUGIN_DATA}", &data);
    if standards.contains(&PluginStandard::ClaudeCode) {
        expanded = expanded
            .replace("${CLAUDE_PLUGIN_ROOT}", &root)
            .replace("$CLAUDE_PLUGIN_ROOT", &root)
            .replace("${CLAUDE_PLUGIN_DATA}", &data)
            .replace("$CLAUDE_PLUGIN_DATA", &data);
    }
    if standards.contains(&PluginStandard::Codex) {
        expanded = expanded
            .replace("${CODEX_PLUGIN_ROOT}", &root)
            .replace("$CODEX_PLUGIN_ROOT", &root)
            .replace("${CODEX_PLUGIN_DATA}", &data)
            .replace("$CODEX_PLUGIN_DATA", &data);
    }
    expanded
}

fn string_array(value: Option<&Value>, label: &str) -> Result<Vec<String>, PluginError> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };
    value
        .as_array()
        .ok_or_else(|| PluginError::Invalid(format!("{label} must be an array")))?
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(str::to_string)
                .ok_or_else(|| PluginError::Invalid(format!("{label} must contain strings")))
        })
        .collect()
}

fn string_map(value: Option<&Value>, label: &str) -> Result<Vec<(String, String)>, PluginError> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };
    let object = value
        .as_object()
        .ok_or_else(|| PluginError::Invalid(format!("{label} must be an object")))?;
    object
        .iter()
        .map(|(key, value)| {
            value
                .as_str()
                .map(|value| (key.clone(), value.to_string()))
                .ok_or_else(|| PluginError::Invalid(format!("{label} values must be strings")))
        })
        .collect()
}

fn author_name(value: &Value) -> String {
    value
        .as_str()
        .or_else(|| value.get("name").and_then(Value::as_str))
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn markdown_body(text: &str) -> &str {
    let Some(rest) = text
        .strip_prefix("---\n")
        .or_else(|| text.strip_prefix("---\r\n"))
    else {
        return text;
    };
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        offset += line.len();
        if line.trim_end_matches(['\r', '\n']) == "---" {
            return &rest[offset..];
        }
    }
    text
}

fn frontmatter_scalar(text: &str, key: &str) -> Option<String> {
    let frontmatter = frontmatter(text)?;
    frontmatter.lines().find_map(|line| {
        let (candidate, value) = line.split_once(':')?;
        (candidate.trim() == key)
            .then(|| value.trim().trim_matches(['\'', '"']).to_string())
            .filter(|value| !value.is_empty())
    })
}

fn frontmatter_list(text: &str, key: &str) -> Vec<String> {
    let Some(value) = frontmatter_scalar(text, key) else {
        return Vec::new();
    };
    value
        .trim_matches(['[', ']'])
        .split(',')
        .map(|item| item.trim().trim_matches(['\'', '"']).to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

fn frontmatter(text: &str) -> Option<&str> {
    let rest = text
        .strip_prefix("---\n")
        .or_else(|| text.strip_prefix("---\r\n"))?;
    let end = rest.find("\n---")?;
    Some(&rest[..end])
}

/// Confirm that a repository path stays inside the plugin root and does not traverse symlinks.
/// Git preserves symlinks, so lexical `..` checks alone are not sufficient for untrusted repos.
fn ensure_plugin_path(root: &Path, path: &Path) -> Result<(), PluginError> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| PluginError::UnsafePath(path.display().to_string()))?;
    safe_relative(relative)?;

    let canonical_root = root.canonicalize()?;
    let canonical_path = path.canonicalize()?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err(PluginError::UnsafePath(path.display().to_string()));
    }

    let mut current = root.to_path_buf();
    for component in relative.components() {
        if component == Component::CurDir {
            continue;
        }
        current.push(component.as_os_str());
        if std::fs::symlink_metadata(&current)?
            .file_type()
            .is_symlink()
        {
            return Err(PluginError::UnsafePath(path.display().to_string()));
        }
    }
    Ok(())
}

/// Resolve a not-yet-created scaffold target while rejecting existing files and symlinked parents.
fn scaffold_target(destination: &Path, relative: &Path) -> Result<PathBuf, PluginError> {
    let relative = safe_relative(relative)?;
    let target = destination.join(relative);
    let mut current = destination.to_path_buf();
    for component in relative.components() {
        if component == Component::CurDir {
            continue;
        }
        current.push(component.as_os_str());
        match std::fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(PluginError::UnsafeScaffoldPath(
                    relative.display().to_string(),
                ));
            }
            Ok(metadata) if current == target || !metadata.is_dir() => {
                return Err(PluginError::ScaffoldConflict(
                    relative.display().to_string(),
                ));
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(target)
}

fn safe_relative(path: &Path) -> Result<&Path, PluginError> {
    if path.as_os_str().is_empty() || path.is_absolute() {
        return Err(PluginError::UnsafePath(path.display().to_string()));
    }
    for component in path.components() {
        if !matches!(component, Component::Normal(_) | Component::CurDir) {
            return Err(PluginError::UnsafePath(path.display().to_string()));
        }
    }
    Ok(path)
}

fn require_safe_id(value: &str) -> Result<&str, PluginError> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(PluginError::UnsafePath(value.to_string()));
    }
    Ok(value)
}

fn slug_with_hash(value: &str) -> String {
    format!(
        "{}-{:08x}",
        slug(value).chars().take(52).collect::<String>(),
        fnv1a(value.as_bytes())
    )
}

fn slug(value: &str) -> String {
    let mut output = String::new();
    let mut dash = false;
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            output.push(character.to_ascii_lowercase());
            dash = false;
        } else if !dash && !output.is_empty() {
            output.push('-');
            dash = true;
        }
    }
    output.trim_end_matches('-').to_string()
}

fn fnv1a(bytes: &[u8]) -> u32 {
    bytes.iter().fold(0x811c9dc5, |hash, byte| {
        (hash ^ u32::from(*byte)).wrapping_mul(0x01000193)
    })
}

fn truncate(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        value.to_string()
    } else {
        value.chars().take(max_chars).collect::<String>() + "…"
    }
}

fn title_case(value: &str) -> String {
    value
        .split(['-', '_'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            chars
                .next()
                .map(|first| first.to_uppercase().collect::<String>() + chars.as_str())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, text: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }

    fn checkout(root: PathBuf) -> GitHubCheckout {
        GitHubCheckout {
            root,
            spec: crate::github_skills::GitHubRepoSpec {
                owner: "acme".into(),
                repo: "developer-kit".into(),
                reference: None,
                subpath: None,
            },
        }
    }

    #[test]
    fn loads_agent_plugins_1_0_with_narrow_component_failures() {
        let root =
            std::env::temp_dir().join(format!("codetwo-agent-plugin-{}", uuid::Uuid::new_v4()));
        write(
            &root.join("plugin.json"),
            r#"{
              "$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
              "name":"portable-tools","version":"1.0.0","description":"Portable tools",
              "futureField":true
            }"#,
        );
        write(
            &root.join("skills/review/SKILL.md"),
            "---\nname: review\ndescription: Review a change\n---\nReview the current change.",
        );
        write(
            &root.join("skills/broken/SKILL.md"),
            "---\nname: Broken Skill\n---\nThis must be skipped.",
        );
        write(
            &root.join("skills/nested/deeper/SKILL.md"),
            "---\nname: hidden\ndescription: Nested too deeply\n---\nDo not discover this.",
        );
        write(
            &root.join("agents/native-only.md"),
            "---\nname: native-only\ndescription: Native extension\n---\nDo not discover this in a portable-only package.",
        );
        write(
            &root.join(".mcp.json"),
            r#"{"mcpServers":{"native-only":{"command":"native-only"}}}"#,
        );
        write(&root.join("bin/server"), "#!/bin/sh\nexit 0\n");
        write(
            &root.join("mcp.json"),
            r#"{
              "$schema":"https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
              "mcpServers":{
                "local":{"type":"stdio","command":"./bin/server","args":["${PLUGIN_ROOT}/config.json"],"env":{"DATA":"${PLUGIN_DATA}/cache"},"cwd":"${PLUGIN_DATA}"},
                "bad-http":{"type":"streamable-http","url":"http://example.com/mcp"},
                "bad-field":{"type":"stdio","command":"tool","shell":true}
              }
            }"#,
        );

        let bundle = from_github(&checkout(root)).unwrap();
        assert_eq!(bundle.plugin.standard, PluginStandard::AgentPlugins);
        assert_eq!(bundle.plugin.spec_version, "1.0.0");
        assert_eq!(bundle.plugin.counts.skills, 1);
        assert_eq!(bundle.plugin.counts.subagents, 0);
        assert_eq!(bundle.plugin.counts.mcp_servers, 1);
        assert!(bundle
            .plugin
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "agent_manifest_unknown_field"));
        assert!(
            bundle
                .plugin
                .diagnostics
                .iter()
                .filter(|diagnostic| diagnostic.code == "invalid_mcp_server")
                .count()
                >= 2
        );
        assert!(bundle
            .plugin
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "invalid_agent_skill"));
    }

    #[test]
    fn rejects_unsupported_agent_plugins_schema() {
        let root = std::env::temp_dir().join(format!(
            "codetwo-agent-plugin-version-{}",
            uuid::Uuid::new_v4()
        ));
        write(
            &root.join("plugin.json"),
            r#"{"$schema":"https://agent-plugins.org/schemas/2.0.0/plugin.schema.json","name":"future"}"#,
        );
        write(
            &root.join("skills/example/SKILL.md"),
            "---\nname: example\ndescription: Example\n---\nExample.",
        );
        assert!(matches!(
            from_github(&checkout(root)),
            Err(PluginError::Invalid(message)) if message.contains("Unsupported Agent Plugins schema")
        ));
    }

    #[test]
    fn bundled_agent_plugin_schemas_are_the_selected_1_0_0_documents() {
        assert_eq!(
            AGENT_PLUGIN_SCHEMA.get("$id").and_then(Value::as_str),
            Some("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json")
        );
        assert_eq!(
            AGENT_MCP_SCHEMA.get("$id").and_then(Value::as_str),
            Some("https://agent-plugins.org/schemas/1.0.0/mcp.schema.json")
        );
    }

    #[test]
    fn parses_and_resolves_trust_gated_native_lsp_servers() {
        let root = std::env::temp_dir().join(format!(
            "codetwo-native-lsp-plugin-{}",
            uuid::Uuid::new_v4()
        ));
        write(
            &root.join(".claude-plugin/plugin.json"),
            r#"{
              "name":"native-lsp",
              "lspServers":{
                "inline":{"command":"${CLAUDE_PLUGIN_ROOT}/bin/lsp","args":["--stdio","${CLAUDE_PLUGIN_DATA}/cache"],"env":{"ROOT":"${CLAUDE_PLUGIN_ROOT}"},"extensionToLanguage":{".rs":"rust"}},
                "socket-only":{"command":"socket-lsp","transport":"socket","extensionToLanguage":{".sock":"socketlang"}},
                "broken":{"command":"broken"}
              }
            }"#,
        );
        write(
            &root.join("skills/example/SKILL.md"),
            "---\nname: example\ndescription: Example\n---\nExample.",
        );
        write(&root.join("bin/lsp"), "#!/bin/sh\nexit 0\n");
        let data =
            std::env::temp_dir().join(format!("codetwo-native-lsp-store-{}", uuid::Uuid::new_v4()));
        let installed = install(&data, from_github(&checkout(root)).unwrap()).unwrap();
        assert_eq!(installed.counts.lsp_servers, 2);
        assert!(installed
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "invalid_lsp_server"));

        let loaded = load_dir(&data).unwrap();
        let inline = loaded[0]
            .lsp_servers
            .iter()
            .find(|server| server.name == "inline")
            .unwrap();
        assert!(Path::new(&inline.command).is_absolute());
        assert!(inline.args[1].ends_with("/cache"));
        assert!(inline
            .env
            .iter()
            .any(|(name, value)| name == "CLAUDE_PLUGIN_ROOT" && Path::new(value).is_absolute()));
        assert!(loaded[0].extension_components.iter().any(|component| {
            component.name == "inline" && component.status == "requires_trust"
        }));
        assert!(loaded[0].extension_components.iter().any(|component| {
            component.name == "socket-only" && component.status == "unsupported"
        }));
        let _ = std::fs::remove_dir_all(data);
    }

    #[test]
    fn installed_agent_mcp_receives_persistent_plugin_environment() {
        let root =
            std::env::temp_dir().join(format!("codetwo-agent-plugin-env-{}", uuid::Uuid::new_v4()));
        write(
            &root.join("plugin.json"),
            r#"{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"portable-env"}"#,
        );
        write(
            &root.join("skills/example/SKILL.md"),
            "---\nname: example\ndescription: Example\n---\nExample.",
        );
        write(&root.join("bin/server"), "#!/bin/sh\nexit 0\n");
        write(
            &root.join("mcp.json"),
            r#"{"$schema":"https://agent-plugins.org/schemas/1.0.0/mcp.schema.json","mcpServers":{"local":{"type":"stdio","command":"./bin/server","args":["${PLUGIN_ROOT}/config"],"env":{"CACHE":"${PLUGIN_DATA}/cache"},"cwd":"${PLUGIN_DATA}"}}}"#,
        );
        let data = std::env::temp_dir().join(format!(
            "codetwo-agent-plugin-store-{}",
            uuid::Uuid::new_v4()
        ));
        let installed = install(&data, from_github(&checkout(root)).unwrap()).unwrap();
        let loaded = load_dir(&data).unwrap();
        let plugin = &loaded[0];
        let server = plugin
            .components
            .iter()
            .find_map(|component| match &component.payload {
                SkillPayload::Mcp { server } => Some(server),
                _ => None,
            })
            .unwrap();
        let McpTransport::Stdio { command, args, env } = &server.transport else {
            panic!("expected stdio");
        };
        assert!(Path::new(command).is_absolute());
        assert!(Path::new(&args[0].trim_end_matches("/config")).is_absolute());
        assert!(server
            .cwd
            .as_deref()
            .is_some_and(|cwd| Path::new(cwd).is_absolute()));
        assert!(env
            .iter()
            .any(|(name, value)| name == "PLUGIN_ROOT" && Path::new(value).is_absolute()));
        assert!(env
            .iter()
            .any(|(name, value)| name == "PLUGIN_DATA" && Path::new(value).is_absolute()));
        assert!(plugin_data_dir(&data, &installed.id).is_dir());
        uninstall_with_options(&data, &installed.id, true).unwrap();
        assert!(plugin_data_dir(&data, &installed.id).is_dir());
        let _ = std::fs::remove_dir_all(data);
    }

    #[test]
    fn parses_complete_manifest_and_all_component_types() {
        let root = std::env::temp_dir().join(format!("codetwo-plugin-{}", uuid::Uuid::new_v4()));
        write(
            &root.join(".codex-plugin/plugin.json"),
            r#"{
              "name":"developer-kit","version":"1.2.0","description":"Developer workflow",
              "author":{"name":"Acme"},"skills":"./custom-skills/","mcpServers":"./extra.mcp.json",
              "interface":{"displayName":"Developer Kit"}
            }"#,
        );
        write(
            &root.join("skills/review/SKILL.md"),
            "---\nname: Review\ndescription: Review changes\n---\nCheck the diff carefully.",
        );
        write(
            &root.join("custom-skills/release/SKILL.md"),
            "---\nname: Release\ndescription: Ship safely\n---\nVerify the release.",
        );
        write(
            &root.join("agents/researcher.md"),
            "---\nname: Researcher\ndescription: Find evidence\nmodel: fast\ntools: [web, files]\n---\nResearch before answering.",
        );
        write(
            &root.join(".mcp.json"),
            r#"{"mcpServers":{"local":{"command":"./bin/server","args":["--stdio"],"env":{"MODE":"safe"}},"remote":{"type":"http","url":"https://mcp.example.test","headers":{"X-Key":"value"}},"events":{"type":"sse","url":"https://mcp.example.test/sse"}}}"#,
        );
        write(
            &root.join("extra.mcp.json"),
            r#"{"extra":{"command":"extra-mcp"}}"#,
        );
        write(
            &root.join("scaffolds/react/scaffold.json"),
            r#"{"name":"React App","description":"Minimal app"}"#,
        );
        write(
            &root.join("scaffolds/react/src/main.tsx"),
            "export default 1;",
        );

        let bundle = from_github(&checkout(root)).unwrap();
        assert_eq!(bundle.plugin.name, "Developer Kit");
        assert_eq!(bundle.plugin.version, "1.2.0");
        assert_eq!(bundle.plugin.counts.skills, 2);
        assert_eq!(bundle.plugin.counts.subagents, 1);
        assert_eq!(bundle.plugin.counts.mcp_servers, 4);
        assert_eq!(bundle.plugin.counts.scaffolds, 1);
        assert!(bundle
            .plugin
            .components
            .iter()
            .any(|component| component.kind() == SkillKind::Subagent));
        assert!(bundle.plugin.components.iter().any(|component| matches!(
            &component.payload,
            SkillPayload::Mcp {
                server: McpServer {
                    transport: McpTransport::Sse { .. },
                    ..
                }
            }
        )));
    }

    #[test]
    fn installs_loads_uninstalls_and_applies_scaffold_without_overwrite() {
        let root =
            std::env::temp_dir().join(format!("codetwo-plugin-src-{}", uuid::Uuid::new_v4()));
        write(
            &root.join("SKILL.md"),
            "---\nname: Helper\n---\nHelp carefully.",
        );
        write(&root.join("scaffolds/basic/README.md"), "hello");
        write(&root.join("bin/tool"), "#!/bin/sh\nexit 0\n");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(
                root.join("bin/tool"),
                std::fs::Permissions::from_mode(0o755),
            )
            .unwrap();
        }
        let bundle = from_github(&checkout(root)).unwrap();
        let plugin_id = bundle.plugin.id.clone();
        let scaffold_id = bundle.plugin.scaffolds[0].id.clone();
        let data =
            std::env::temp_dir().join(format!("codetwo-plugin-data-{}", uuid::Uuid::new_v4()));
        let project =
            std::env::temp_dir().join(format!("codetwo-plugin-project-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&project).unwrap();

        install(&data, bundle).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(data.join(&plugin_id).join("bundle/bin/tool"))
                .unwrap()
                .permissions()
                .mode();
            assert_ne!(mode & 0o111, 0);
        }
        let plugins = load_dir(&data).unwrap();
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].counts.skills, 1);
        let result = apply_scaffold(&data, &plugin_id, &scaffold_id, &project).unwrap();
        assert_eq!(result.files, 1);
        assert_eq!(
            std::fs::read_to_string(project.join("README.md")).unwrap(),
            "hello"
        );
        assert!(matches!(
            apply_scaffold(&data, &plugin_id, &scaffold_id, &project),
            Err(PluginError::ScaffoldConflict(_))
        ));
        uninstall(&data, &plugin_id).unwrap();
        assert!(load_dir(&data).unwrap().is_empty());

        let _ = std::fs::remove_dir_all(data);
        let _ = std::fs::remove_dir_all(project);
    }

    #[test]
    fn local_install_keeps_source_and_update_preserves_user_state() {
        let source = std::env::temp_dir().join(format!(
            "codetwo-local-plugin-source-{}",
            uuid::Uuid::new_v4()
        ));
        write(
            &source.join(".claude-plugin/plugin.json"),
            r#"{"name":"local-state","version":"1.0.0"}"#,
        );
        write(
            &source.join("skills/example/SKILL.md"),
            "---\nname: example\ndescription: Example\n---\nExample.",
        );
        let data = std::env::temp_dir().join(format!(
            "codetwo-local-plugin-store-{}",
            uuid::Uuid::new_v4()
        ));

        let first = install(
            &data,
            from_local(&source, "Local marketplace", "catalog:local-state").unwrap(),
        )
        .unwrap();
        set_enabled(&data, &first.id, false).unwrap();
        set_trusted(&data, &first.id, true).unwrap();
        write(
            &source.join(".claude-plugin/plugin.json"),
            r#"{"name":"local-state","version":"2.0.0"}"#,
        );

        let updated = install(
            &data,
            from_local(&source, "Local marketplace", "catalog:local-state").unwrap(),
        )
        .unwrap();
        assert_eq!(updated.version, "2.0.0");
        assert!(!updated.enabled);
        assert!(updated.trusted);
        assert!(source.join("skills/example/SKILL.md").is_file());
        assert_eq!(updated.source, "Local marketplace");
        assert_eq!(
            updated.repository,
            source.canonicalize().unwrap().display().to_string()
        );

        let _ = std::fs::remove_dir_all(data);
        let _ = std::fs::remove_dir_all(source);
    }

    #[test]
    fn rejects_manifest_paths_outside_plugin() {
        let root =
            std::env::temp_dir().join(format!("codetwo-plugin-bad-{}", uuid::Uuid::new_v4()));
        write(
            &root.join(".codex-plugin/plugin.json"),
            r#"{"name":"bad","version":"1.0.0","skills":"../outside"}"#,
        );
        assert!(matches!(
            from_github(&checkout(root)),
            Err(PluginError::UnsafePath(_))
        ));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinked_component_paths_outside_plugin() {
        use std::os::unix::fs::symlink;

        let root =
            std::env::temp_dir().join(format!("codetwo-plugin-link-{}", uuid::Uuid::new_v4()));
        let outside =
            std::env::temp_dir().join(format!("codetwo-plugin-outside-{}", uuid::Uuid::new_v4()));
        write(
            &outside.join("SKILL.md"),
            "---\nname: Outside\n---\nDo not import me.",
        );
        write(
            &root.join(".codex-plugin/plugin.json"),
            r#"{"name":"bad-link","version":"1.0.0","skills":"./linked"}"#,
        );
        symlink(&outside, root.join("linked")).unwrap();

        assert!(matches!(
            from_github(&checkout(root)),
            Err(PluginError::UnsafePath(_))
        ));
        let _ = std::fs::remove_dir_all(outside);
    }

    #[cfg(unix)]
    #[test]
    fn scaffold_rejects_symlinked_destination_parent() {
        use std::os::unix::fs::symlink;

        let root =
            std::env::temp_dir().join(format!("codetwo-plugin-src-{}", uuid::Uuid::new_v4()));
        write(
            &root.join("SKILL.md"),
            "---\nname: Helper\n---\nHelp carefully.",
        );
        write(&root.join("scaffolds/basic/nested/file.txt"), "safe");
        let bundle = from_github(&checkout(root)).unwrap();
        let plugin_id = bundle.plugin.id.clone();
        let scaffold_id = bundle.plugin.scaffolds[0].id.clone();
        let data =
            std::env::temp_dir().join(format!("codetwo-plugin-data-{}", uuid::Uuid::new_v4()));
        let project =
            std::env::temp_dir().join(format!("codetwo-plugin-project-{}", uuid::Uuid::new_v4()));
        let outside =
            std::env::temp_dir().join(format!("codetwo-plugin-target-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&project).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        symlink(&outside, project.join("nested")).unwrap();
        install(&data, bundle).unwrap();

        assert!(matches!(
            apply_scaffold(&data, &plugin_id, &scaffold_id, &project),
            Err(PluginError::UnsafeScaffoldPath(_))
        ));
        assert!(!outside.join("file.txt").exists());

        let _ = std::fs::remove_dir_all(data);
        let _ = std::fs::remove_dir_all(project);
        let _ = std::fs::remove_dir_all(outside);
    }

    #[test]
    fn counts_scene_components_and_skips_invalid_files() {
        let root =
            std::env::temp_dir().join(format!("codetwo-plugin-scenes-{}", uuid::Uuid::new_v4()));
        write(
            &root.join("plugin.json"),
            r#"{
              "$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
              "name":"scene-pack","version":"1.0.0","description":"Scenes only"
            }"#,
        );
        write(
            &root.join("scenes/valid.scene.json"),
            &format!(
                r#"{{"$schema":"{}","name":"valid","title":"Valid scene"}}"#,
                crate::scene::SCENE_SCHEMA_ID
            ),
        );
        // Malformed JSON: must be warned about and skipped, never failing the install.
        write(&root.join("scenes/broken.scene.json"), "{not json");
        write(
            &root.join("scenes/flow.pipeline.json"),
            &format!(
                r#"{{"$schema":"{}","name":"flow","title":"Flow","stages":[{{"id":"a","scene":"valid"}}]}}"#,
                crate::scene::PIPELINE_SCHEMA_ID
            ),
        );

        let bundle = from_github(&checkout(root.clone())).unwrap();
        assert_eq!(bundle.plugin.counts.scenes, 1, "invalid scene must be skipped");
        assert_eq!(bundle.plugin.counts.pipelines, 1);
        // A scenes-only pack has no other components: scenes must keep it installable.
        assert_eq!(bundle.plugin.counts.total(), 2);

        // The install layout keeps the bundle verbatim; the scene loader path must point at it.
        let data =
            std::env::temp_dir().join(format!("codetwo-plugin-data-{}", uuid::Uuid::new_v4()));
        let plugin_id = bundle.plugin.id.clone();
        install(&data, bundle).unwrap();
        let scenes_dir = plugin_scenes_dir(&data, &plugin_id);
        assert!(scenes_dir.join("valid.scene.json").is_file());

        // Old records without the new count fields must keep deserializing (serde defaults).
        let legacy: PluginCounts = serde_json::from_str(
            r#"{"skills":1,"subagents":0,"mcp_servers":0,"scaffolds":0}"#,
        )
        .unwrap();
        assert_eq!(legacy.scenes, 0);
        assert_eq!(legacy.pipelines, 0);

        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(data);
    }
}
