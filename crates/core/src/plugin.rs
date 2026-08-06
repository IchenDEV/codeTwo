//! Installable plugin bundles: canonical Codex/Claude manifests plus Code2 conventions for
//! skills, subagents, MCP servers, and project scaffolds.
//!
//! Installation is data-only. Code2 validates and stores plugin files but never runs repository
//! scripts during install. MCP processes start only when the user composes that MCP component into
//! a session; scaffolds are applied explicitly to a selected workspace without overwriting files.

use std::path::{Component, Path, PathBuf};

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

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginCounts {
    pub skills: usize,
    pub subagents: usize,
    pub mcp_servers: usize,
    pub scaffolds: usize,
}

impl PluginCounts {
    pub fn total(&self) -> usize {
        self.skills + self.subagents + self.mcp_servers + self.scaffolds
    }
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
    pub counts: PluginCounts,
    #[serde(default)]
    pub components: Vec<Skill>,
    #[serde(default)]
    pub scaffolds: Vec<PluginScaffold>,
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

#[derive(Debug, Default, Deserialize)]
struct RawManifest {
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
    skills: Option<String>,
    #[serde(rename = "mcpServers", default)]
    mcp_servers: Option<Value>,
    #[serde(default)]
    interface: Value,
}

#[derive(Debug, Default, Deserialize)]
struct RawScaffold {
    #[serde(default)]
    name: String,
    #[serde(default)]
    description: String,
}

/// Build a complete plugin bundle from a verified GitHub checkout.
pub fn from_github(checkout: &GitHubCheckout) -> Result<PluginBundle, PluginError> {
    let selected = checkout
        .selected_root()
        .map_err(|error| PluginError::Invalid(error.to_string()))?;
    let (plugin_root, manifest_path) = locate_plugin_root(&selected)?;
    let manifest = match manifest_path {
        Some(path) => {
            ensure_plugin_path(&plugin_root, &path)?;
            serde_json::from_str::<RawManifest>(&std::fs::read_to_string(path)?)?
        }
        None => RawManifest::default(),
    };

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
    let root_relative = plugin_root
        .strip_prefix(&checkout.root)
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
    let skill_files = discover_skill_files(&plugin_root, manifest.skills.as_deref())?;
    let mut components = parse_skills(&plugin_root, &plugin_id, &source, skill_files)?;
    components.extend(parse_subagents(&plugin_root, &plugin_id, &source)?);
    components.extend(parse_mcp_servers(
        &plugin_root,
        &plugin_id,
        &source,
        manifest.mcp_servers.as_ref(),
    )?);
    if components.len() > MAX_COMPONENTS {
        return Err(PluginError::TooManyComponents(MAX_COMPONENTS));
    }

    let scaffolds = discover_scaffolds(&plugin_root)?;
    let counts = PluginCounts {
        skills: components
            .iter()
            .filter(|skill| skill.kind() == SkillKind::AgentSkill)
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
            schema_version: 1,
            id: plugin_id,
            name: display_name,
            version,
            description: truncate(manifest.description.trim(), 500),
            author: author_name(&manifest.author),
            source: checkout.spec.source(),
            repository,
            counts,
            components,
            scaffolds,
        },
        files,
    })
}

/// Atomically replace one installed plugin directory with the validated bundle.
pub fn install(plugins_dir: &Path, bundle: PluginBundle) -> Result<InstalledPlugin, PluginError> {
    std::fs::create_dir_all(plugins_dir)?;
    let id = require_safe_id(&bundle.plugin.id)?;
    let final_dir = plugins_dir.join(id);
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
                resolve_relative_mcp_commands(&mut plugin, &plugin_dir);
                plugins.push(plugin);
            }
            Err(error) => tracing::warn!("plugin {:?}: {error}", plugin_dir),
        }
    }
    plugins.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(plugins)
}

pub fn uninstall(plugins_dir: &Path, id: &str) -> Result<(), PluginError> {
    let id = require_safe_id(id)?;
    let target = plugins_dir.join(id);
    match std::fs::remove_dir_all(target) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
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

fn locate_plugin_root(selected: &Path) -> Result<(PathBuf, Option<PathBuf>), PluginError> {
    for relative in [".codex-plugin/plugin.json", ".claude-plugin/plugin.json"] {
        let manifest = selected.join(relative);
        if manifest.is_file() {
            ensure_plugin_path(selected, &manifest)?;
            return Ok((selected.to_path_buf(), Some(manifest)));
        }
    }
    let mut manifests = Vec::new();
    find_manifests(selected, 0, &mut manifests)?;
    manifests.sort();
    manifests.dedup();
    match manifests.as_slice() {
        [] => Ok((selected.to_path_buf(), None)),
        [manifest] => {
            let root = manifest
                .parent()
                .and_then(Path::parent)
                .ok_or_else(|| PluginError::Invalid("Plugin manifest has no root".into()))?;
            ensure_plugin_path(root, manifest)?;
            Ok((root.to_path_buf(), Some(manifest.clone())))
        }
        _ => Err(PluginError::MultiplePlugins),
    }
}

fn find_manifests(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) -> Result<(), PluginError> {
    if depth > 4 {
        return Ok(());
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

fn discover_skill_files(
    root: &Path,
    configured: Option<&str>,
) -> Result<Vec<PathBuf>, PluginError> {
    let mut files = Vec::new();
    let top = root.join("SKILL.md");
    if top.is_file() {
        ensure_plugin_path(root, &top)?;
        files.push(top);
    }
    for relative in ["skills", ".codex/skills", ".claude/skills"] {
        collect_named(&root.join(relative), "SKILL.md", 0, &mut files)?;
    }
    if let Some(configured) = configured {
        let configured = safe_relative(Path::new(configured))?;
        let configured = root.join(configured);
        ensure_plugin_path(root, &configured)?;
        if configured.is_file() {
            files.push(configured);
        } else {
            collect_named(&configured, "SKILL.md", 0, &mut files)?;
        }
    }
    files.sort();
    files.dedup();
    Ok(files)
}

fn parse_skills(
    root: &Path,
    plugin_id: &str,
    source: &str,
    files: Vec<PathBuf>,
) -> Result<Vec<Skill>, PluginError> {
    let mut skills = Vec::new();
    for path in files {
        let text = read_small_text(&path)?;
        let prompt = markdown_body(&text).trim();
        if prompt.is_empty() {
            continue;
        }
        let fallback = path
            .parent()
            .and_then(Path::file_name)
            .and_then(|name| name.to_str())
            .unwrap_or("Skill");
        let (name, description) = parse_frontmatter(&text);
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

fn parse_subagents(root: &Path, plugin_id: &str, source: &str) -> Result<Vec<Skill>, PluginError> {
    let mut files = Vec::new();
    for relative in ["agents", "subagents", ".codex/agents", ".claude/agents"] {
        collect_extension(&root.join(relative), "md", 0, &mut files)?;
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
    configured: Option<&Value>,
) -> Result<Vec<Skill>, PluginError> {
    let mut sources = Vec::new();
    let default_path = root.join(".mcp.json");
    if default_path.is_file() {
        ensure_plugin_path(root, &default_path)?;
        sources.push(serde_json::from_str::<Value>(&std::fs::read_to_string(
            default_path,
        )?)?);
    }
    match configured {
        Some(Value::String(path)) => {
            let path = root.join(safe_relative(Path::new(path))?);
            ensure_plugin_path(root, &path)?;
            sources.push(serde_json::from_str::<Value>(&std::fs::read_to_string(
                path,
            )?)?);
        }
        Some(value @ Value::Object(_)) => sources.push(value.clone()),
        Some(_) => {
            return Err(PluginError::Invalid(
                "mcpServers must be a path or object".into(),
            ))
        }
        None => {}
    }
    let mut object = serde_json::Map::new();
    for value in sources {
        let servers = value.get("mcpServers").unwrap_or(&value);
        let servers = servers
            .as_object()
            .ok_or_else(|| PluginError::Invalid("MCP configuration must be an object".into()))?;
        for (name, config) in servers {
            object.insert(name.clone(), config.clone());
        }
    }
    let mut components = Vec::new();
    for (name, config) in &object {
        let config = config
            .as_object()
            .ok_or_else(|| PluginError::Invalid(format!("MCP server {name} must be an object")))?;
        let transport = if let Some(command) = config.get("command").and_then(Value::as_str) {
            McpTransport::Stdio {
                command: command.to_string(),
                args: string_array(config.get("args"), &format!("MCP server {name} args"))?,
                env: string_map(config.get("env"), &format!("MCP server {name} env"))?,
            }
        } else if let Some(url) = config.get("url").and_then(Value::as_str) {
            if !(url.starts_with("https://") || url.starts_with("http://")) {
                return Err(PluginError::Invalid(format!(
                    "MCP server {name} has an invalid URL"
                )));
            }
            let headers = string_map(config.get("headers"), &format!("MCP server {name} headers"))?;
            match config.get("type").and_then(Value::as_str).unwrap_or("http") {
                "http" | "streamable-http" => McpTransport::Http {
                    url: url.to_string(),
                    headers,
                },
                "sse" => McpTransport::Sse {
                    url: url.to_string(),
                    headers,
                },
                transport => {
                    return Err(PluginError::Invalid(format!(
                        "MCP server {name} has unsupported transport {transport}"
                    )))
                }
            }
        } else {
            return Err(PluginError::Invalid(format!(
                "MCP server {name} needs command or url"
            )));
        };
        components.push(Skill {
            id: format!("{plugin_id}:mcp:{}", slug_with_hash(name)),
            name: name.to_string(),
            description: format!("MCP server from plugin {source}"),
            icon: None,
            source: Some(source.to_string()),
            payload: SkillPayload::Mcp {
                server: McpServer {
                    name: name.to_string(),
                    transport,
                },
            },
        });
    }
    Ok(components)
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

fn resolve_relative_mcp_commands(plugin: &mut InstalledPlugin, plugin_dir: &Path) {
    let bundle_root = plugin_dir.join(BUNDLE_DIR);
    for component in &mut plugin.components {
        let SkillPayload::Mcp { server } = &mut component.payload else {
            continue;
        };
        let McpTransport::Stdio { command, args, .. } = &mut server.transport else {
            continue;
        };
        if let Some(relative) = command.strip_prefix("./") {
            *command = bundle_root.join(relative).display().to_string();
        } else {
            *command = expand_plugin_root(command, &bundle_root);
        }
        for arg in args {
            *arg = expand_plugin_root(arg, &bundle_root);
        }
    }
}

fn expand_plugin_root(value: &str, root: &Path) -> String {
    let root = root.display().to_string();
    value
        .replace("${CLAUDE_PLUGIN_ROOT}", &root)
        .replace("$CLAUDE_PLUGIN_ROOT", &root)
        .replace("${CODEX_PLUGIN_ROOT}", &root)
        .replace("$CODEX_PLUGIN_ROOT", &root)
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
}
