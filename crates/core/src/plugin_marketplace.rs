//! Read Codex and Claude Code marketplace catalogs without trusting one bad entry to hide the
//! rest. Installation is deliberately separate: callers resolve the normalized source and then
//! feed a checked-out directory through `plugin::from_local` or `plugin::from_github`.

use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginMarketplace {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub manifest_path: String,
    pub root: String,
    pub standard: String,
    pub plugins: Vec<MarketplacePlugin>,
    pub diagnostics: Vec<MarketplaceDiagnostic>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarketplacePlugin {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub version: String,
    pub category: String,
    pub installation_policy: String,
    pub authentication_policy: String,
    pub default_enabled: bool,
    pub source: MarketplacePluginSource,
    pub installable: bool,
    pub diagnostic: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum MarketplacePluginSource {
    Local {
        path: String,
    },
    Github {
        repository: String,
        reference: Option<String>,
        sha: Option<String>,
    },
    Git {
        url: String,
        path: Option<String>,
        reference: Option<String>,
        sha: Option<String>,
    },
    Npm {
        package: String,
        version: Option<String>,
        registry: Option<String>,
    },
    Archive {
        url: String,
        sha256: Option<String>,
    },
    Unsupported {
        description: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarketplaceDiagnostic {
    pub code: String,
    pub message: String,
    pub entry: Option<usize>,
}

#[derive(Debug, Error)]
pub enum MarketplaceError {
    #[error("{0}")]
    Invalid(String),
    #[error("Could not read the marketplace: {0}")]
    Io(#[from] std::io::Error),
    #[error("Marketplace JSON is invalid: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Unknown marketplace plugin: {0}")]
    UnknownPlugin(String),
}

pub fn load(path: &Path) -> Result<PluginMarketplace, MarketplaceError> {
    let manifest_path = locate_manifest(path)?;
    let canonical_manifest = manifest_path.canonicalize()?;
    let root = marketplace_root(&canonical_manifest)?;
    let value: Value = serde_json::from_str(&std::fs::read_to_string(&canonical_manifest)?)?;
    let object = value
        .as_object()
        .ok_or_else(|| MarketplaceError::Invalid("Marketplace must be a JSON object".into()))?;
    let name = required_string(object.get("name"), "Marketplace requires name")?;
    let display_name = object
        .get("interface")
        .and_then(|value| value.get("displayName"))
        .and_then(Value::as_str)
        .or_else(|| object.get("displayName").and_then(Value::as_str))
        .unwrap_or(&name)
        .trim()
        .to_string();
    let description = object
        .get("description")
        .and_then(Value::as_str)
        .or_else(|| {
            object
                .get("metadata")
                .and_then(|value| value.get("description"))
                .and_then(Value::as_str)
        })
        .unwrap_or_default()
        .trim()
        .to_string();
    let plugin_root = object
        .get("metadata")
        .and_then(|value| value.get("pluginRoot"))
        .and_then(Value::as_str);
    let entries = object
        .get("plugins")
        .and_then(Value::as_array)
        .ok_or_else(|| MarketplaceError::Invalid("Marketplace requires a plugins array".into()))?;
    let mut diagnostics = Vec::new();
    let mut plugins = Vec::new();
    let mut names = HashSet::new();
    for (index, entry) in entries.iter().enumerate() {
        match parse_entry(entry, plugin_root) {
            Ok(plugin) => {
                if !names.insert(plugin.name.clone()) {
                    diagnostics.push(MarketplaceDiagnostic {
                        code: "duplicate_plugin".into(),
                        message: format!("Skipped duplicate marketplace plugin {}", plugin.name),
                        entry: Some(index),
                    });
                } else {
                    plugins.push(plugin);
                }
            }
            Err(message) => diagnostics.push(MarketplaceDiagnostic {
                code: "invalid_plugin_entry".into(),
                message,
                entry: Some(index),
            }),
        }
    }
    let standard = if canonical_manifest
        .components()
        .any(|component| component.as_os_str() == ".agents")
    {
        "codex"
    } else {
        "claude_code"
    };
    Ok(PluginMarketplace {
        name,
        display_name,
        description,
        manifest_path: canonical_manifest.display().to_string(),
        root: root.display().to_string(),
        standard: standard.into(),
        plugins,
        diagnostics,
    })
}

pub fn plugin<'a>(
    marketplace: &'a PluginMarketplace,
    name: &str,
) -> Result<&'a MarketplacePlugin, MarketplaceError> {
    marketplace
        .plugins
        .iter()
        .find(|plugin| plugin.name == name)
        .ok_or_else(|| MarketplaceError::UnknownPlugin(name.into()))
}

pub fn resolve_local_source(
    marketplace: &PluginMarketplace,
    source: &MarketplacePluginSource,
) -> Result<PathBuf, MarketplaceError> {
    let MarketplacePluginSource::Local { path } = source else {
        return Err(MarketplaceError::Invalid(
            "Marketplace plugin is not a local source".into(),
        ));
    };
    let relative = safe_relative(path)?;
    let root = PathBuf::from(&marketplace.root).canonicalize()?;
    let resolved = root.join(relative).canonicalize()?;
    if !resolved.starts_with(&root) || !resolved.is_dir() {
        return Err(MarketplaceError::Invalid(
            "Marketplace plugin path escapes its marketplace root".into(),
        ));
    }
    Ok(resolved)
}

fn locate_manifest(path: &Path) -> Result<PathBuf, MarketplaceError> {
    if path.is_file() {
        return Ok(path.to_path_buf());
    }
    for relative in [
        ".agents/plugins/marketplace.json",
        ".claude-plugin/marketplace.json",
        "marketplace.json",
    ] {
        let candidate = path.join(relative);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err(MarketplaceError::Invalid(
        "No .agents/plugins/marketplace.json or .claude-plugin/marketplace.json was found".into(),
    ))
}

fn marketplace_root(manifest: &Path) -> Result<PathBuf, MarketplaceError> {
    let parent = manifest
        .parent()
        .ok_or_else(|| MarketplaceError::Invalid("Marketplace manifest has no parent".into()))?;
    let root = if parent.file_name().and_then(|name| name.to_str()) == Some("plugins")
        && parent
            .parent()
            .and_then(Path::file_name)
            .and_then(|name| name.to_str())
            == Some(".agents")
    {
        parent.parent().and_then(Path::parent)
    } else if parent.file_name().and_then(|name| name.to_str()) == Some(".claude-plugin") {
        parent.parent()
    } else {
        Some(parent)
    };
    root.map(Path::to_path_buf)
        .ok_or_else(|| MarketplaceError::Invalid("Marketplace root is invalid".into()))
}

fn parse_entry(value: &Value, plugin_root: Option<&str>) -> Result<MarketplacePlugin, String> {
    let object = value
        .as_object()
        .ok_or_else(|| "Marketplace plugin entry must be an object".to_string())?;
    let name = required_string(object.get("name"), "Marketplace plugin requires name")
        .map_err(|error| error.to_string())?;
    let source_value = object
        .get("source")
        .ok_or_else(|| format!("Marketplace plugin {name} requires source"))?;
    let source = parse_source(source_value, plugin_root)?;
    let installation_policy = object
        .get("policy")
        .and_then(|value| value.get("installation"))
        .and_then(Value::as_str)
        .unwrap_or("AVAILABLE")
        .to_string();
    let authentication_policy = object
        .get("policy")
        .and_then(|value| value.get("authentication"))
        .and_then(Value::as_str)
        .unwrap_or("ON_FIRST_USE")
        .to_string();
    let (mut installable, mut diagnostic) = source_support(&source);
    if installation_policy == "NOT_AVAILABLE" {
        installable = false;
        diagnostic = Some("Marketplace policy marks this plugin NOT_AVAILABLE".into());
    }
    Ok(MarketplacePlugin {
        display_name: object
            .get("displayName")
            .and_then(Value::as_str)
            .or_else(|| {
                object
                    .get("interface")
                    .and_then(|value| value.get("displayName"))
                    .and_then(Value::as_str)
            })
            .unwrap_or(&name)
            .trim()
            .to_string(),
        description: string_field(object.get("description")),
        version: string_field(object.get("version")),
        category: string_field(object.get("category")),
        installation_policy,
        authentication_policy,
        default_enabled: object
            .get("defaultEnabled")
            .and_then(Value::as_bool)
            .unwrap_or(true),
        name,
        source,
        installable,
        diagnostic,
    })
}

fn parse_source(
    value: &Value,
    plugin_root: Option<&str>,
) -> Result<MarketplacePluginSource, String> {
    if let Some(path) = value.as_str() {
        if plugin_root.is_none() && path != "." && !path.starts_with("./") {
            return Err("Relative marketplace plugin sources must start with ./".into());
        }
        let path = prefix_plugin_root(path, plugin_root)?;
        safe_relative(&path).map_err(|error| error.to_string())?;
        return Ok(MarketplacePluginSource::Local { path });
    }
    let object = value
        .as_object()
        .ok_or_else(|| "Marketplace plugin source must be a path or object".to_string())?;
    let kind = object
        .get("source")
        .and_then(Value::as_str)
        .ok_or_else(|| "Marketplace plugin source object requires source".to_string())?;
    match kind {
        "local" => {
            let path = required_string(object.get("path"), "Local source requires path")
                .map_err(|error| error.to_string())?;
            if path != "." && !path.starts_with("./") {
                return Err("Local marketplace source paths must start with ./".into());
            }
            safe_relative(&path).map_err(|error| error.to_string())?;
            Ok(MarketplacePluginSource::Local { path })
        }
        "github" => {
            let sha = optional_string(object.get("sha"));
            validate_sha(sha.as_deref())?;
            Ok(MarketplacePluginSource::Github {
                repository: required_string(object.get("repo"), "GitHub source requires repo")
                    .map_err(|error| error.to_string())?,
                reference: optional_string(object.get("ref")),
                sha,
            })
        }
        "url" | "git-subdir" => {
            let path = optional_string(object.get("path"));
            if kind == "git-subdir" {
                let value = path
                    .as_deref()
                    .ok_or_else(|| "git-subdir source requires path".to_string())?;
                safe_relative(value).map_err(|error| error.to_string())?;
            }
            let sha = optional_string(object.get("sha"));
            validate_sha(sha.as_deref())?;
            Ok(MarketplacePluginSource::Git {
                url: required_string(object.get("url"), "Git source requires url")
                    .map_err(|error| error.to_string())?,
                path,
                reference: optional_string(object.get("ref")),
                sha,
            })
        }
        "npm" => Ok(MarketplacePluginSource::Npm {
            package: required_string(object.get("package"), "npm source requires package")
                .map_err(|error| error.to_string())?,
            version: optional_string(object.get("version")),
            registry: optional_string(object.get("registry")),
        }),
        "archive" => Ok(MarketplacePluginSource::Archive {
            url: required_string(object.get("url"), "Archive source requires url")
                .map_err(|error| error.to_string())?,
            sha256: optional_string(object.get("sha256")),
        }),
        other => Ok(MarketplacePluginSource::Unsupported {
            description: other.into(),
        }),
    }
}

fn validate_sha(sha: Option<&str>) -> Result<(), String> {
    if sha.is_some_and(|sha| sha.len() != 40 || !sha.chars().all(|ch| ch.is_ascii_hexdigit())) {
        Err("Marketplace Git SHA must contain exactly 40 hexadecimal characters".into())
    } else {
        Ok(())
    }
}

fn source_support(source: &MarketplacePluginSource) -> (bool, Option<String>) {
    match source {
        MarketplacePluginSource::Local { .. } | MarketplacePluginSource::Github { .. } => {
            (true, None)
        }
        MarketplacePluginSource::Git { url, .. } if url.starts_with("https://github.com/") => {
            (true, None)
        }
        MarketplacePluginSource::Git { .. } => (
            false,
            Some("Only HTTPS github.com Git sources are installable in this build".into()),
        ),
        MarketplacePluginSource::Npm { .. } => (
            false,
            Some("npm marketplace installation is not implemented".into()),
        ),
        MarketplacePluginSource::Archive { .. } => (
            false,
            Some("Archive marketplace installation is not implemented".into()),
        ),
        MarketplacePluginSource::Unsupported { description } => (
            false,
            Some(format!("Unsupported marketplace source: {description}")),
        ),
    }
}

fn prefix_plugin_root(path: &str, plugin_root: Option<&str>) -> Result<String, String> {
    if path.starts_with("./") || plugin_root.is_none() {
        return Ok(path.into());
    }
    let root = plugin_root.unwrap();
    let root = safe_relative(root).map_err(|error| error.to_string())?;
    Ok(format!("./{}/{}", root.display(), path))
}

fn safe_relative(value: &str) -> Result<PathBuf, MarketplaceError> {
    if value.is_empty() || Path::new(value).is_absolute() {
        return Err(MarketplaceError::Invalid(
            "Marketplace paths must be relative".into(),
        ));
    }
    let path = value.strip_prefix("./").unwrap_or(value);
    let path = Path::new(path);
    if path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(MarketplaceError::Invalid(
            "Marketplace paths cannot contain parent traversal".into(),
        ));
    }
    Ok(path.to_path_buf())
}

fn required_string(value: Option<&Value>, message: &str) -> Result<String, MarketplaceError> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| MarketplaceError::Invalid(message.into()))
}

fn optional_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn string_field(value: Option<&Value>) -> String {
    optional_string(value).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, text: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }

    #[test]
    fn loads_codex_catalog_and_isolates_invalid_entries() {
        let root = std::env::temp_dir().join(format!(
            "codetwo-codex-marketplace-{}",
            uuid::Uuid::new_v4()
        ));
        write(
            &root.join(".agents/plugins/marketplace.json"),
            r#"{
              "name":"team-tools","interface":{"displayName":"Team Tools"},
              "plugins":[
                {"name":"local-tool","source":{"source":"local","path":"./plugins/local-tool"},"policy":{"installation":"AVAILABLE","authentication":"ON_INSTALL"},"category":"Productivity"},
                {"name":"npm-tool","source":{"source":"npm","package":"@acme/tool"},"policy":{"installation":"AVAILABLE","authentication":"ON_INSTALL"},"category":"Developer"},
                {"name":"broken"}
              ]
            }"#,
        );
        std::fs::create_dir_all(root.join("plugins/local-tool")).unwrap();
        let catalog = load(&root).unwrap();
        assert_eq!(catalog.standard, "codex");
        assert_eq!(catalog.plugins.len(), 2);
        assert!(catalog.plugins[0].installable);
        assert!(!catalog.plugins[1].installable);
        assert_eq!(catalog.diagnostics.len(), 1);
        assert_eq!(
            resolve_local_source(&catalog, &catalog.plugins[0].source).unwrap(),
            root.join("plugins/local-tool").canonicalize().unwrap()
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn loads_claude_catalog_sources_and_rejects_traversal() {
        let root = std::env::temp_dir().join(format!(
            "codetwo-claude-marketplace-{}",
            uuid::Uuid::new_v4()
        ));
        write(
            &root.join(".claude-plugin/marketplace.json"),
            r#"{
              "name":"claude-tools","metadata":{"pluginRoot":"./plugins"},
              "plugins":[
                {"name":"local-tool","source":"formatter"},
                {"name":"github-tool","source":{"source":"github","repo":"acme/tool","ref":"v1"}},
                {"name":"escape","source":"../secret"}
              ]
            }"#,
        );
        let catalog = load(&root).unwrap();
        assert_eq!(catalog.standard, "claude_code");
        assert_eq!(catalog.plugins.len(), 2);
        assert_eq!(catalog.diagnostics.len(), 1);
        assert!(matches!(
            &catalog.plugins[0].source,
            MarketplacePluginSource::Local { path } if path == "./plugins/formatter"
        ));
        let _ = std::fs::remove_dir_all(root);
    }
}
