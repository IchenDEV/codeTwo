//! Read C2 marketplace catalogs without trusting one bad entry to hide the rest.

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
    if object.get("standardVersion").and_then(Value::as_str) != Some("1.0.0") {
        return Err(MarketplaceError::Invalid(
            "Unsupported C2 marketplace standard".into(),
        ));
    }
    if let Some(field) = object.keys().find(|field| {
        !matches!(
            field.as_str(),
            "standardVersion" | "name" | "displayName" | "description" | "plugins"
        )
    }) {
        return Err(MarketplaceError::Invalid(format!(
            "Unknown C2 marketplace field: {field}"
        )));
    }
    let name = required_string(object.get("name"), "Marketplace requires name")?;
    if !valid_name(&name) {
        return Err(MarketplaceError::Invalid(
            "Marketplace name must use lowercase Agent Plugins naming rules".into(),
        ));
    }
    validate_optional_string(object.get("displayName"), "Marketplace displayName")?;
    validate_optional_string(object.get("description"), "Marketplace description")?;
    let display_name = object
        .get("displayName")
        .and_then(Value::as_str)
        .unwrap_or(&name)
        .trim()
        .to_string();
    let description = object
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let entries = object
        .get("plugins")
        .and_then(Value::as_array)
        .ok_or_else(|| MarketplaceError::Invalid("Marketplace requires a plugins array".into()))?;
    let mut diagnostics = Vec::new();
    let mut plugins = Vec::new();
    let mut names = HashSet::new();
    for (index, entry) in entries.iter().enumerate() {
        match parse_entry(entry) {
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
    Ok(PluginMarketplace {
        name,
        display_name,
        description,
        manifest_path: canonical_manifest.display().to_string(),
        root: root.display().to_string(),
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
    let candidate = path.join("marketplace.json");
    if candidate.is_file() {
        return Ok(candidate);
    }
    Err(MarketplaceError::Invalid(
        "C2 marketplace root must contain marketplace.json".into(),
    ))
}

fn marketplace_root(manifest: &Path) -> Result<PathBuf, MarketplaceError> {
    let parent = manifest
        .parent()
        .ok_or_else(|| MarketplaceError::Invalid("Marketplace manifest has no parent".into()))?;
    Ok(parent.to_path_buf())
}

fn parse_entry(value: &Value) -> Result<MarketplacePlugin, String> {
    let object = value
        .as_object()
        .ok_or_else(|| "Marketplace plugin entry must be an object".to_string())?;
    if let Some(field) = object.keys().find(|field| {
        !matches!(
            field.as_str(),
            "name"
                | "displayName"
                | "description"
                | "version"
                | "category"
                | "installationPolicy"
                | "authenticationPolicy"
                | "defaultEnabled"
                | "source"
        )
    }) {
        return Err(format!("Unknown marketplace plugin field: {field}"));
    }
    let name = required_string(object.get("name"), "Marketplace plugin requires name")
        .map_err(|error| error.to_string())?;
    if !valid_name(&name) {
        return Err("Marketplace plugin name must use lowercase Agent Plugins naming rules".into());
    }
    for (field, label) in [
        ("displayName", "displayName"),
        ("description", "description"),
        ("category", "category"),
    ] {
        validate_optional_string(object.get(field), &format!("Marketplace plugin {label}"))
            .map_err(|error| error.to_string())?;
    }
    if object
        .get("defaultEnabled")
        .is_some_and(|value| !value.is_boolean())
    {
        return Err("Marketplace plugin defaultEnabled must be a boolean".into());
    }
    let source_value = object
        .get("source")
        .ok_or_else(|| format!("Marketplace plugin {name} requires source"))?;
    let source = parse_source(source_value)?;
    let version = required_string(object.get("version"), "Marketplace plugin requires version")
        .map_err(|error| error.to_string())?;
    if !is_semantic_version(&version) {
        return Err(format!(
            "Marketplace plugin {name} requires a semantic version"
        ));
    }
    let installation_policy = object
        .get("installationPolicy")
        .and_then(Value::as_str)
        .unwrap_or("AVAILABLE")
        .to_string();
    if !matches!(installation_policy.as_str(), "AVAILABLE" | "NOT_AVAILABLE") {
        return Err(format!(
            "Marketplace plugin {name} has an invalid installationPolicy"
        ));
    }
    let authentication_policy = object
        .get("authenticationPolicy")
        .and_then(Value::as_str)
        .unwrap_or("ON_FIRST_USE")
        .to_string();
    if !matches!(
        authentication_policy.as_str(),
        "NONE" | "ON_INSTALL" | "ON_FIRST_USE"
    ) {
        return Err(format!(
            "Marketplace plugin {name} has an invalid authenticationPolicy"
        ));
    }
    let (mut installable, mut diagnostic) = source_support(&source);
    if installation_policy == "NOT_AVAILABLE" {
        installable = false;
        diagnostic = Some("Marketplace policy marks this plugin NOT_AVAILABLE".into());
    }
    Ok(MarketplacePlugin {
        display_name: object
            .get("displayName")
            .and_then(Value::as_str)
            .unwrap_or(&name)
            .trim()
            .to_string(),
        description: string_field(object.get("description")),
        version,
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

fn parse_source(value: &Value) -> Result<MarketplacePluginSource, String> {
    let object = value
        .as_object()
        .ok_or_else(|| "Marketplace plugin source must be an object".to_string())?;
    let kind = object
        .get("kind")
        .and_then(Value::as_str)
        .ok_or_else(|| "Marketplace plugin source requires kind".to_string())?;
    match kind {
        "local" => {
            reject_source_fields(object, &["kind", "path"], kind)?;
            let path = required_string(object.get("path"), "Local source requires path")
                .map_err(|error| error.to_string())?;
            if path != "." && !path.starts_with("./") {
                return Err("Local marketplace source paths must start with ./".into());
            }
            safe_relative(&path).map_err(|error| error.to_string())?;
            Ok(MarketplacePluginSource::Local { path })
        }
        "github" => {
            reject_source_fields(object, &["kind", "repository", "reference", "sha"], kind)?;
            let sha = optional_string(object.get("sha"));
            validate_sha(sha.as_deref())?;
            Ok(MarketplacePluginSource::Github {
                repository: required_string(
                    object.get("repository"),
                    "GitHub source requires repository",
                )
                .map_err(|error| error.to_string())?,
                reference: optional_string(object.get("reference")),
                sha,
            })
        }
        "git" => {
            reject_source_fields(object, &["kind", "url", "path", "reference", "sha"], kind)?;
            let path = optional_string(object.get("path"));
            if let Some(value) = path.as_deref() {
                safe_relative(value).map_err(|error| error.to_string())?;
            }
            let sha = optional_string(object.get("sha"));
            validate_sha(sha.as_deref())?;
            Ok(MarketplacePluginSource::Git {
                url: required_string(object.get("url"), "Git source requires url")
                    .map_err(|error| error.to_string())?,
                path,
                reference: optional_string(object.get("reference")),
                sha,
            })
        }
        "npm" => {
            reject_source_fields(object, &["kind", "package", "version", "registry"], kind)?;
            Ok(MarketplacePluginSource::Npm {
                package: required_string(object.get("package"), "npm source requires package")
                    .map_err(|error| error.to_string())?,
                version: optional_string(object.get("version")),
                registry: optional_string(object.get("registry")),
            })
        }
        "archive" => {
            reject_source_fields(object, &["kind", "url", "sha256"], kind)?;
            let sha256 = optional_string(object.get("sha256"));
            if sha256.as_ref().is_some_and(|value| {
                value.len() != 64 || !value.chars().all(|ch| ch.is_ascii_hexdigit())
            }) {
                return Err(
                    "Archive SHA-256 must contain exactly 64 hexadecimal characters".into(),
                );
            }
            Ok(MarketplacePluginSource::Archive {
                url: required_string(object.get("url"), "Archive source requires url")
                    .map_err(|error| error.to_string())?,
                sha256,
            })
        }
        other => Err(format!("Unsupported marketplace source kind: {other}")),
    }
}

fn reject_source_fields(
    object: &serde_json::Map<String, Value>,
    allowed: &[&str],
    kind: &str,
) -> Result<(), String> {
    if let Some(field) = object
        .keys()
        .find(|field| !allowed.contains(&field.as_str()))
    {
        Err(format!("Unknown {kind} marketplace source field: {field}"))
    } else {
        Ok(())
    }
}

fn is_semantic_version(value: &str) -> bool {
    let core = value.split(['-', '+']).next().unwrap_or(value);
    let parts = core.split('.').collect::<Vec<_>>();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.chars().all(|ch| ch.is_ascii_digit()))
}

fn valid_name(value: &str) -> bool {
    (1..=64).contains(&value.len())
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
    }
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

fn validate_optional_string(value: Option<&Value>, label: &str) -> Result<(), MarketplaceError> {
    if value.is_some_and(|value| !value.is_string()) {
        Err(MarketplaceError::Invalid(format!(
            "{label} must be a string"
        )))
    } else {
        Ok(())
    }
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
    fn loads_c2_catalog_and_isolates_invalid_entries() {
        let root = std::env::temp_dir().join(format!(
            "codetwo-codex-marketplace-{}",
            uuid::Uuid::new_v4()
        ));
        write(
            &root.join("marketplace.json"),
            r#"{
              "standardVersion":"1.0.0","name":"team-tools","displayName":"Team Tools",
              "plugins":[
                {"name":"local-tool","version":"1.0.0","source":{"kind":"local","path":"./plugins/local-tool"},"installationPolicy":"AVAILABLE","authenticationPolicy":"ON_INSTALL","category":"Productivity"},
                {"name":"npm-tool","version":"1.0.0","source":{"kind":"npm","package":"@acme/tool"},"installationPolicy":"AVAILABLE","authenticationPolicy":"ON_INSTALL","category":"Developer"},
                {"name":"broken"}
              ]
            }"#,
        );
        std::fs::create_dir_all(root.join("plugins/local-tool")).unwrap();
        let catalog = load(&root).unwrap();
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
    fn loads_c2_catalog_sources_and_rejects_traversal() {
        let root = std::env::temp_dir().join(format!(
            "codetwo-claude-marketplace-{}",
            uuid::Uuid::new_v4()
        ));
        write(
            &root.join("marketplace.json"),
            r#"{
              "standardVersion":"1.0.0","name":"c2-tools",
              "plugins":[
                {"name":"local-tool","version":"1.0.0","source":{"kind":"local","path":"./plugins/formatter"}},
                {"name":"github-tool","version":"1.0.0","source":{"kind":"github","repository":"acme/tool","reference":"v1"}},
                {"name":"escape","version":"1.0.0","source":{"kind":"local","path":"../secret"}}
              ]
            }"#,
        );
        let catalog = load(&root).unwrap();
        assert_eq!(catalog.plugins.len(), 2);
        assert_eq!(catalog.diagnostics.len(), 1);
        assert!(matches!(
            &catalog.plugins[0].source,
            MarketplacePluginSource::Local { path } if path == "./plugins/formatter"
        ));
        let _ = std::fs::remove_dir_all(root);
    }
}
