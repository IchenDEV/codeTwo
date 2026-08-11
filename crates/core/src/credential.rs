//! Credential references and one-time migration of legacy MCP configuration.
//!
//! A [`SecretRef`] is the only credential representation allowed to cross a
//! persistence or provider boundary.  Secret values are accepted here solely
//! by the explicit legacy migration helpers; ordinary MCP serde decoding does
//! not accept the old `value`/map forms.

use std::collections::HashMap;
use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::skill::{McpCredentialState, McpSecretBinding, McpServer, McpTransport};

const KEYCHAIN_SERVICE: &str = "com.codetwo.mcp-secrets.v1";

/// Opaque handle for a value held by a [`SecretStore`].
///
/// The inner string is intentionally never the secret itself.  Its custom
/// `Debug`/`Display` implementations make accidental logging obvious while
/// still allowing diagnostics to identify a particular reference.
#[derive(Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SecretRef(pub String);

impl SecretRef {
    /// Create a new opaque reference.  This is useful for stores and for the
    /// gateway lease placeholder; callers should not derive references from a
    /// secret value.
    pub fn new() -> Self {
        Self(format!("codetwo-secret-v1-{}", uuid::Uuid::new_v4()))
    }

    /// Construct a deterministic opaque reference for a missing credential.
    /// The label is metadata (typically an env/header name), never a value.
    pub fn missing(label: &str) -> Self {
        let digest = blake3::hash(label.as_bytes()).to_hex();
        Self(format!("codetwo-missing-v1-{digest}"))
    }

    pub fn from_opaque(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// Borrow the opaque token for keychain account names and gateway leases.
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Return whether this is a generated placeholder for a failed migration.
    pub fn is_missing(&self) -> bool {
        self.0.starts_with("codetwo-missing-v1-")
    }
}

impl From<String> for SecretRef {
    fn from(value: String) -> Self {
        Self(value)
    }
}

impl From<&str> for SecretRef {
    fn from(value: &str) -> Self {
        Self(value.to_string())
    }
}

impl Default for SecretRef {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Debug for SecretRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_tuple("SecretRef").field(&"<opaque>").finish()
    }
}

impl fmt::Display for SecretRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Keep references out of human-facing logs as well.  The raw token is
        // available only through `as_str()` for wire/account-name plumbing.
        f.write_str("secret-ref:<opaque>")
    }
}

/// Errors returned by a credential store.  Error text never includes values.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum SecretStoreError {
    #[error("secret storage is unavailable on this platform")]
    Unsupported,
    #[error("secret storage is unavailable")]
    Unavailable,
    #[error("secret reference was not found")]
    NotFound,
    #[error("secret storage operation failed")]
    Failed,
}

/// Translate a Security.framework OSStatus without requiring a live Keychain.
/// The status values are stable Security.framework constants and are kept
/// here so tests on non-macOS can exercise the fail-closed distinction.
pub fn map_keychain_os_status(status: i32) -> SecretStoreError {
    match status {
        // errSecItemNotFound: the caller can request this credential again.
        -25300 => SecretStoreError::NotFound,
        // errSecInteractionNotAllowed / errSecAuthFailed / errSecNotAvailable
        // and user cancellation. A locked keychain commonly reports
        // interaction-not-allowed. These are availability failures, not proof
        // that a ref is missing. Missing entitlement (-34018) is a permanent
        // configuration failure and therefore falls through to Failed.
        -25308 | -25293 | -25291 | -128 => SecretStoreError::Unavailable,
        _ => SecretStoreError::Failed,
    }
}

/// Narrow storage interface.  Persistence callers only use `put`; provider
/// encoding deliberately never calls `get` in this phase.
pub trait SecretStore: Send + Sync {
    fn put(&self, value: &str) -> Result<SecretRef, SecretStoreError>;
    fn get(&self, reference: &SecretRef) -> Result<String, SecretStoreError>;
    fn delete(&self, reference: &SecretRef) -> Result<(), SecretStoreError>;
}

/// Deterministic, process-local store used by tests and migration callers that
/// explicitly provide one.  It must never be used as the production fallback
/// on non-macOS.
#[derive(Default, Clone)]
pub struct InMemorySecretStore {
    values: Arc<Mutex<HashMap<SecretRef, String>>>,
}

impl fmt::Debug for InMemorySecretStore {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let entries = self.values.lock().map(|values| values.len()).unwrap_or(0);
        f.debug_struct("InMemorySecretStore")
            .field("entries", &entries)
            .finish()
    }
}

impl InMemorySecretStore {
    pub fn len(&self) -> usize {
        self.values.lock().map(|values| values.len()).unwrap_or(0)
    }

    pub fn put(&self, value: &str) -> Result<SecretRef, SecretStoreError> {
        <Self as SecretStore>::put(self, value)
    }

    pub fn get(&self, reference: &SecretRef) -> Result<String, SecretStoreError> {
        <Self as SecretStore>::get(self, reference)
    }

    pub fn delete(&self, reference: &SecretRef) -> Result<(), SecretStoreError> {
        <Self as SecretStore>::delete(self, reference)
    }
}

impl SecretStore for InMemorySecretStore {
    fn put(&self, value: &str) -> Result<SecretRef, SecretStoreError> {
        let mut values = self
            .values
            .lock()
            .map_err(|_| SecretStoreError::Unavailable)?;
        let reference = SecretRef::new();
        values.insert(reference.clone(), value.to_string());
        Ok(reference)
    }

    fn get(&self, reference: &SecretRef) -> Result<String, SecretStoreError> {
        self.values
            .lock()
            .map_err(|_| SecretStoreError::Unavailable)?
            .get(reference)
            .cloned()
            .ok_or(SecretStoreError::NotFound)
    }

    fn delete(&self, reference: &SecretRef) -> Result<(), SecretStoreError> {
        self.values
            .lock()
            .map_err(|_| SecretStoreError::Unavailable)?
            .remove(reference)
            .map(|_| ())
            .ok_or(SecretStoreError::NotFound)
    }
}

/// macOS Keychain-backed store.  The implementation is compile-only on other
/// targets; those targets use [`UnsupportedSecretStore`] instead.
#[cfg(target_os = "macos")]
#[derive(Debug, Clone, Copy, Default)]
pub struct MacKeychainSecretStore;

#[cfg(target_os = "macos")]
impl MacKeychainSecretStore {
    pub fn new() -> Self {
        Self
    }
}

#[cfg(target_os = "macos")]
impl SecretStore for MacKeychainSecretStore {
    fn put(&self, value: &str) -> Result<SecretRef, SecretStoreError> {
        let reference = SecretRef::new();
        security_framework::passwords::set_generic_password(
            KEYCHAIN_SERVICE,
            reference.as_str(),
            value.as_bytes(),
        )
        .map_err(|error| map_keychain_os_status(error.code()))?;
        Ok(reference)
    }

    fn get(&self, reference: &SecretRef) -> Result<String, SecretStoreError> {
        let bytes = security_framework::passwords::generic_password(
            security_framework::passwords::PasswordOptions::new_generic_password(
                KEYCHAIN_SERVICE,
                reference.as_str(),
            ),
        )
        .map_err(|error| map_keychain_os_status(error.code()))?;
        String::from_utf8(bytes).map_err(|_| SecretStoreError::Failed)
    }

    fn delete(&self, reference: &SecretRef) -> Result<(), SecretStoreError> {
        security_framework::passwords::delete_generic_password(KEYCHAIN_SERVICE, reference.as_str())
            .map_err(|error| map_keychain_os_status(error.code()))
    }
}

/// Explicit non-macOS implementation: there is no plaintext fallback.
#[derive(Debug, Clone, Copy, Default)]
pub struct UnsupportedSecretStore;

impl SecretStore for UnsupportedSecretStore {
    fn put(&self, _value: &str) -> Result<SecretRef, SecretStoreError> {
        Err(SecretStoreError::Unsupported)
    }
    fn get(&self, _reference: &SecretRef) -> Result<String, SecretStoreError> {
        Err(SecretStoreError::Unsupported)
    }
    fn delete(&self, _reference: &SecretRef) -> Result<(), SecretStoreError> {
        Err(SecretStoreError::Unsupported)
    }
}

/// Return the production store for this target.  Tests should pass an
/// [`InMemorySecretStore`] explicitly rather than touching the Keychain.
pub fn platform_secret_store() -> Arc<dyn SecretStore> {
    #[cfg(target_os = "macos")]
    {
        Arc::new(MacKeychainSecretStore)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Arc::new(UnsupportedSecretStore)
    }
}

/// Explicit legacy decoder for one MCP server.  Ordinary `serde_json` decoding
/// goes through `McpTransport` and rejects literal values.
pub fn decode_legacy_mcp_server(
    value: &serde_json::Value,
    store: &dyn SecretStore,
) -> Result<McpServer, MigrationError> {
    let object = value
        .as_object()
        .ok_or_else(|| MigrationError::Invalid("MCP server must be an object".into()))?;
    let name = object
        .get("name")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("mcp")
        .to_string();
    let cwd = object
        .get("cwd")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string);
    let mut imported = Vec::new();
    let transport = match decode_legacy_transport(object, store, &mut imported) {
        Ok(transport) => transport,
        Err(error) => {
            rollback_imports(store, &imported);
            return Err(error);
        }
    };
    Ok(McpServer {
        name,
        cwd,
        transport,
        credential_state: McpCredentialState::Ready,
    })
}

/// Produce a non-launchable representation after a legacy import failed.  No
/// original values are retained; refs are marked missing and state is explicit.
pub fn disabled_legacy_mcp_server(value: &serde_json::Value, reason: &str) -> McpServer {
    let object = value.as_object();
    let name = object
        .and_then(|object| object.get("name"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or("mcp")
        .to_string();
    let cwd = object
        .and_then(|object| object.get("cwd"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_string);
    let mut missing = Vec::new();
    let transport = if let Some(command) = object
        .and_then(|o| o.get("command"))
        .and_then(serde_json::Value::as_str)
    {
        let bindings = legacy_binding_names(object.and_then(|o| o.get("env")));
        missing.extend(bindings.iter().map(|name| SecretRef::missing(name)));
        McpTransport::Stdio {
            command: command.to_string(),
            args: string_array(object.and_then(|o| o.get("args"))),
            env: bindings
                .into_iter()
                .map(|name| McpSecretBinding {
                    name: name.clone(),
                    secret_ref: SecretRef::missing(&name),
                })
                .collect(),
            launch_env: Vec::new(),
        }
    } else {
        let url = object
            .and_then(|o| o.get("url"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string();
        let bindings = legacy_binding_names(object.and_then(|o| o.get("headers")));
        missing.extend(bindings.iter().map(|name| SecretRef::missing(name)));
        let headers = bindings
            .into_iter()
            .map(|name| McpSecretBinding {
                name: name.clone(),
                secret_ref: SecretRef::missing(&name),
            })
            .collect();
        match object
            .and_then(|o| o.get("type"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("http")
        {
            "sse" => McpTransport::Sse { url, headers },
            _ => McpTransport::Http { url, headers },
        }
    };
    let _ = reason; // Deliberately not included: migration errors never echo values.
    McpServer {
        name,
        cwd,
        transport,
        credential_state: McpCredentialState::ReauthRequired {
            missing_refs: missing,
        },
    }
}

fn decode_legacy_transport(
    object: &serde_json::Map<String, serde_json::Value>,
    store: &dyn SecretStore,
    imported: &mut Vec<SecretRef>,
) -> Result<McpTransport, MigrationError> {
    if let Some(command) = object.get("command").and_then(serde_json::Value::as_str) {
        let names = object
            .get("env")
            .map(|value| decode_legacy_bindings(value, store, imported))
            .transpose()?
            .unwrap_or_default();
        return Ok(McpTransport::Stdio {
            command: command.to_string(),
            args: string_array(object.get("args")),
            env: names,
            launch_env: Vec::new(),
        });
    }
    let url = object
        .get("url")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| MigrationError::Invalid("MCP server needs command or url".into()))?
        .to_string();
    let headers = object
        .get("headers")
        .map(|value| decode_legacy_bindings(value, store, imported))
        .transpose()?
        .unwrap_or_default();
    match object
        .get("type")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("http")
    {
        "http" | "streamable-http" => Ok(McpTransport::Http { url, headers }),
        "sse" => Ok(McpTransport::Sse { url, headers }),
        _ => Err(MigrationError::Invalid("unsupported MCP transport".into())),
    }
}

fn decode_legacy_bindings(
    value: &serde_json::Value,
    store: &dyn SecretStore,
    imported: &mut Vec<SecretRef>,
) -> Result<Vec<McpSecretBinding>, MigrationError> {
    if let Some(object) = value.as_object() {
        return object
            .iter()
            .map(|(name, value)| {
                let value = value.as_str().ok_or_else(|| {
                    MigrationError::Invalid("MCP credential must be a string".into())
                })?;
                let secret_ref = store.put(value).map_err(MigrationError::Store)?;
                imported.push(secret_ref.clone());
                Ok(McpSecretBinding {
                    name: name.clone(),
                    secret_ref,
                })
            })
            .collect();
    }
    if let Some(entries) = value.as_array() {
        return entries
            .iter()
            .map(|entry| {
                if let Some(pair) = entry.as_array() {
                    if pair.len() != 2 {
                        return Err(MigrationError::Invalid(
                            "MCP credential tuple must have name and value".into(),
                        ));
                    }
                    let name = pair[0].as_str().ok_or_else(|| {
                        MigrationError::Invalid("MCP credential name must be a string".into())
                    })?;
                    let value = pair[1].as_str().ok_or_else(|| {
                        MigrationError::Invalid("MCP credential value must be a string".into())
                    })?;
                    let secret_ref = store.put(value).map_err(MigrationError::Store)?;
                    imported.push(secret_ref.clone());
                    return Ok(McpSecretBinding {
                        name: name.to_string(),
                        secret_ref,
                    });
                }
                let object = entry.as_object().ok_or_else(|| {
                    MigrationError::Invalid("MCP credential entry must be an object".into())
                })?;
                let name = object
                    .get("name")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| {
                        MigrationError::Invalid("MCP credential entry needs a name".into())
                    })?;
                if let Some(reference) = object.get("secret_ref") {
                    let secret_ref = serde_json::from_value(reference.clone())
                        .map_err(|_| MigrationError::Invalid("invalid secret_ref".into()))?;
                    return Ok(McpSecretBinding {
                        name: name.to_string(),
                        secret_ref,
                    });
                }
                let value = object
                    .get("value")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| {
                        MigrationError::Invalid("MCP credential entry needs secret_ref".into())
                    })?;
                let secret_ref = store.put(value).map_err(MigrationError::Store)?;
                imported.push(secret_ref.clone());
                Ok(McpSecretBinding {
                    name: name.to_string(),
                    secret_ref,
                })
            })
            .collect();
    }
    Err(MigrationError::Invalid(
        "MCP credentials must be an object or array".into(),
    ))
}

fn legacy_binding_names(value: Option<&serde_json::Value>) -> Vec<String> {
    match value {
        Some(value) if value.is_object() => value.as_object().unwrap().keys().cloned().collect(),
        Some(value) if value.is_array() => value
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|entry| {
                entry
                    .get("name")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                    .or_else(|| {
                        entry
                            .as_array()
                            .and_then(|pair| pair.first())
                            .and_then(serde_json::Value::as_str)
                            .map(str::to_string)
                    })
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn string_array(value: Option<&serde_json::Value>) -> Vec<String> {
    value
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// Errors from explicit credential migration.  Values are intentionally not
/// retained in this type or in its formatting.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum MigrationError {
    #[error("legacy MCP configuration is invalid: {0}")]
    Invalid(String),
    #[error("secret import failed: {0}")]
    Store(SecretStoreError),
    #[error("could not read migration file")]
    Io,
    #[error("could not rewrite migration file")]
    Rewrite,
}

/// Per-file migration result.  `backup` is present whenever a rewrite was
/// committed and lets callers recover the pre-migration bytes.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MigrationResult {
    pub path: PathBuf,
    pub rewritten: bool,
    pub backup: Option<PathBuf>,
    pub backup_removed: bool,
    pub disabled: bool,
    pub already_migrated: bool,
}

/// Aggregate migration report used by skill/plugin load paths and tests.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MigrationReport {
    pub results: Vec<MigrationResult>,
    pub failures: Vec<PathBuf>,
}

/// Migrate all skill JSON files beneath `dir` using the explicitly supplied
/// store.  The traversal is recursive to cover harness-style skill layouts.
pub fn migrate_skill_json_dir(dir: &Path, store: &dyn SecretStore) -> MigrationReport {
    migrate_json_tree(dir, store, |path| {
        path.extension().and_then(|ext| ext.to_str()) == Some("json")
    })
}

/// Migrate `.mcp.json` and installed-plugin metadata beneath a plugin directory.
pub fn migrate_plugin_dir(dir: &Path, store: &dyn SecretStore) -> MigrationReport {
    migrate_json_tree(dir, store, |path| {
        path.file_name().and_then(|name| name.to_str()) == Some(".mcp.json")
            || path.file_name().and_then(|name| name.to_str()) == Some("installed-plugin.json")
    })
}

/// Migrate a single known JSON file.  This is also used by plugin loading
/// before an installed record is deserialized.
pub fn migrate_json_file(path: &Path, store: &dyn SecretStore) -> MigrationResult {
    migrate_one(path, store)
}

/// Compatibility alias for callers that name the operation after MCP config.
pub fn migrate_mcp_config(path: &Path, store: &dyn SecretStore) -> MigrationResult {
    migrate_json_file(path, store)
}

/// Compatibility alias for installed-plugin metadata migration.
pub fn migrate_plugin_metadata(dir: &Path, store: &dyn SecretStore) -> MigrationReport {
    migrate_plugin_dir(dir, store)
}

/// Sanitize a legacy JSON payload for an installed bundle.  Successful
/// imports become real refs; unavailable stores produce missing refs rather
/// than allowing plaintext to be copied into the bundle.
pub fn sanitize_json_bytes(
    bytes: &[u8],
    store: &dyn SecretStore,
) -> Result<Vec<u8>, MigrationError> {
    let mut value: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|_| MigrationError::Invalid("invalid JSON".into()))?;
    let mut changed = false;
    let mut imported = Vec::new();
    if migrate_value(&mut value, store, &mut changed, &mut imported).is_err() {
        rollback_imports(store, &imported);
        scrub_missing(&mut value, &mut changed);
    }
    serde_json::to_vec_pretty(&value).map_err(|_| MigrationError::Rewrite)
}

fn migrate_json_tree<F>(dir: &Path, store: &dyn SecretStore, predicate: F) -> MigrationReport
where
    F: Fn(&Path) -> bool + Copy,
{
    let mut report = MigrationReport::default();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let entries = match std::fs::read_dir(&current) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let metadata = match std::fs::symlink_metadata(&path) {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                stack.push(path);
            } else if metadata.is_file() && predicate(&path) {
                let result = migrate_one(&path, store);
                if result.disabled {
                    report.failures.push(path.clone());
                }
                report.results.push(result);
            }
        }
    }
    report
}

fn migrate_one(path: &Path, store: &dyn SecretStore) -> MigrationResult {
    let mut result = MigrationResult {
        path: path.to_path_buf(),
        ..MigrationResult::default()
    };
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(_) => {
            result.disabled = true;
            return result;
        }
    };
    let mut value: serde_json::Value = match serde_json::from_slice(&bytes) {
        Ok(value) => value,
        Err(_) => return result,
    };
    let mut changed = false;
    let mut imported = Vec::new();
    if migrate_value(&mut value, store, &mut changed, &mut imported).is_err() {
        rollback_imports(store, &imported);
        // Keep the original untouched.  The caller can expose a disabled MCP
        // object from the legacy decoder without ever launching it.
        result.disabled = true;
        return result;
    }
    if !changed {
        result.already_migrated = true;
        return result;
    }
    let backup = path.with_file_name(format!(
        ".{}.codetwo-backup-{}",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("config"),
        uuid::Uuid::new_v4()
    ));
    if std::fs::copy(path, &backup).is_err() {
        rollback_imports(store, &imported);
        result.disabled = true;
        return result;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&backup, std::fs::Permissions::from_mode(0o600));
    }
    let encoded = match serde_json::to_vec_pretty(&value) {
        Ok(encoded) => encoded,
        Err(_) => {
            rollback_imports(store, &imported);
            result.disabled = true;
            return result;
        }
    };
    let temporary = path.with_file_name(format!(
        ".{}.codetwo-tmp-{}",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("config"),
        uuid::Uuid::new_v4()
    ));
    if std::fs::write(&temporary, &encoded).is_err() {
        rollback_imports(store, &imported);
        let _ = std::fs::remove_file(&temporary);
        result.disabled = true;
        return result;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o600));
    }
    if std::fs::rename(&temporary, path).is_err() {
        rollback_imports(store, &imported);
        let _ = std::fs::remove_file(&temporary);
        result.disabled = true;
        return result;
    }
    let rewritten = std::fs::read(path).ok();
    if rewritten.as_deref() != Some(encoded.as_slice()) {
        rollback_imports(store, &imported);
        // Best effort restore: the backup is still recoverable if this fails.
        let _ = std::fs::copy(&backup, path);
        result.disabled = true;
        return result;
    }
    // The backup is a temporary recovery artifact.  Remove it after the
    // replacement is verified so successful migrations leave no plaintext.
    if std::fs::remove_file(&backup).is_err() {
        // Do not report a clean migration while a plaintext backup remains.
        let _ = std::fs::copy(&backup, path);
        rollback_imports(store, &imported);
        result.disabled = true;
        return result;
    }
    result.rewritten = true;
    result.backup = None;
    result.backup_removed = true;
    result
}

fn migrate_value(
    value: &mut serde_json::Value,
    store: &dyn SecretStore,
    changed: &mut bool,
    imported: &mut Vec<SecretRef>,
) -> Result<(), MigrationError> {
    migrate_value_inner(value, store, changed, imported, MigrationContext::Root)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum MigrationContext {
    Root,
    McpServers,
    McpServer,
}

fn migrate_value_inner(
    value: &mut serde_json::Value,
    store: &dyn SecretStore,
    changed: &mut bool,
    imported: &mut Vec<SecretRef>,
    context: MigrationContext,
) -> Result<(), MigrationError> {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                let item_context = if context == MigrationContext::McpServers {
                    MigrationContext::McpServer
                } else {
                    context
                };
                migrate_value_inner(item, store, changed, imported, item_context)?;
            }
        }
        serde_json::Value::Object(object) => {
            match context {
                MigrationContext::McpServer => {
                    for key in ["env", "headers"] {
                        let Some(field) = object.get_mut(key) else {
                            continue;
                        };
                        migrate_bindings(field, store, changed, imported)?;
                    }
                }
                MigrationContext::McpServers => {
                    // The value under mcpServers is a name-to-server map. A
                    // list form is accepted as well for legacy callers.
                    for child in object.values_mut() {
                        migrate_value_inner(
                            child,
                            store,
                            changed,
                            imported,
                            MigrationContext::McpServer,
                        )?;
                    }
                }
                MigrationContext::Root => {
                    // Installed Skill/Plugin records carry MCP credentials
                    // only at payload.kind == "mcp" -> payload.server.
                    let payload_is_mcp = object
                        .get("payload")
                        .and_then(serde_json::Value::as_object)
                        .and_then(|payload| payload.get("kind"))
                        .and_then(serde_json::Value::as_str)
                        == Some("mcp");
                    if payload_is_mcp {
                        if let Some(server) = object
                            .get_mut("payload")
                            .and_then(serde_json::Value::as_object_mut)
                            .and_then(|payload| payload.get_mut("server"))
                        {
                            migrate_value_inner(
                                server,
                                store,
                                changed,
                                imported,
                                MigrationContext::McpServer,
                            )?;
                        }
                    }
                    for (key, child) in object.iter_mut() {
                        if key == "mcpServers" {
                            migrate_value_inner(
                                child,
                                store,
                                changed,
                                imported,
                                MigrationContext::McpServers,
                            )?;
                        } else if payload_is_mcp && key == "payload" {
                            // The MCP payload server was handled explicitly;
                            // do not walk arbitrary payload metadata as if it
                            // were an MCP server.
                            continue;
                        } else {
                            migrate_value_inner(
                                child,
                                store,
                                changed,
                                imported,
                                MigrationContext::Root,
                            )?;
                        }
                    }
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn migrate_bindings(
    field: &mut serde_json::Value,
    store: &dyn SecretStore,
    changed: &mut bool,
    imported: &mut Vec<SecretRef>,
) -> Result<(), MigrationError> {
    if let Some(map) = field.as_object() {
        let pairs = map
            .iter()
            .map(|(name, plain)| (name.clone(), plain.clone()))
            .collect::<Vec<_>>();
        let mut bindings = Vec::with_capacity(pairs.len());
        for (name, plain) in pairs {
            let plain = plain
                .as_str()
                .ok_or_else(|| MigrationError::Invalid("MCP credential must be a string".into()))?;
            let secret_ref = store.put(plain).map_err(MigrationError::Store)?;
            imported.push(secret_ref.clone());
            bindings.push(serde_json::json!({"name": name, "secret_ref": secret_ref}));
        }
        *field = serde_json::Value::Array(bindings);
        *changed = true;
        return Ok(());
    }
    if let Some(entries) = field.as_array_mut() {
        for entry in entries {
            if let Some(pair) = entry.as_array() {
                if pair.len() != 2 {
                    return Err(MigrationError::Invalid(
                        "MCP credential tuple must have name and value".into(),
                    ));
                }
                let name = pair[0]
                    .as_str()
                    .ok_or_else(|| {
                        MigrationError::Invalid("MCP credential name must be a string".into())
                    })?
                    .to_string();
                let plain = pair[1].as_str().ok_or_else(|| {
                    MigrationError::Invalid("MCP credential value must be a string".into())
                })?;
                let secret_ref = store.put(plain).map_err(MigrationError::Store)?;
                imported.push(secret_ref.clone());
                *entry = serde_json::json!({"name": name, "secret_ref": secret_ref});
                *changed = true;
                continue;
            }
            let Some(entry_object) = entry.as_object_mut() else {
                return Err(MigrationError::Invalid(
                    "MCP credential entry must be an object or tuple".into(),
                ));
            };
            if entry_object.contains_key("secret_ref") {
                // A malformed mixed entry may carry both a ref and a legacy
                // value. Keep the ref, but never preserve the literal.
                if entry_object.remove("value").is_some() {
                    *changed = true;
                }
                continue;
            }
            let name = entry_object
                .get("name")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| MigrationError::Invalid("MCP credential entry needs a name".into()))?
                .to_string();
            let plain = entry_object
                .remove("value")
                .and_then(|plain| plain.as_str().map(str::to_string))
                .ok_or_else(|| {
                    MigrationError::Invalid("MCP credential entry needs secret_ref".into())
                })?;
            let secret_ref = store.put(&plain).map_err(MigrationError::Store)?;
            imported.push(secret_ref.clone());
            *entry = serde_json::json!({"name": name, "secret_ref": secret_ref});
            *changed = true;
        }
        return Ok(());
    }
    Ok(())
}

fn rollback_imports(store: &dyn SecretStore, imported: &[SecretRef]) {
    for reference in imported {
        let _ = store.delete(reference);
    }
}

fn scrub_missing(value: &mut serde_json::Value, changed: &mut bool) {
    scrub_missing_inner(value, changed, MigrationContext::Root)
}

fn scrub_missing_inner(
    value: &mut serde_json::Value,
    changed: &mut bool,
    context: MigrationContext,
) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                let item_context = if context == MigrationContext::McpServers {
                    MigrationContext::McpServer
                } else {
                    context
                };
                scrub_missing_inner(item, changed, item_context);
            }
        }
        serde_json::Value::Object(object) => match context {
            MigrationContext::McpServer => {
                for key in ["env", "headers"] {
                    let Some(field) = object.get_mut(key) else {
                        continue;
                    };
                    scrub_missing_bindings(field, changed);
                }
            }
            MigrationContext::McpServers => {
                for child in object.values_mut() {
                    scrub_missing_inner(child, changed, MigrationContext::McpServer);
                }
            }
            MigrationContext::Root => {
                let payload_is_mcp = object
                    .get("payload")
                    .and_then(serde_json::Value::as_object)
                    .and_then(|payload| payload.get("kind"))
                    .and_then(serde_json::Value::as_str)
                    == Some("mcp");
                if payload_is_mcp {
                    if let Some(server) = object
                        .get_mut("payload")
                        .and_then(serde_json::Value::as_object_mut)
                        .and_then(|payload| payload.get_mut("server"))
                    {
                        scrub_missing_inner(server, changed, MigrationContext::McpServer);
                    }
                }
                for (key, child) in object.iter_mut() {
                    if key == "mcpServers" {
                        scrub_missing_inner(child, changed, MigrationContext::McpServers);
                    } else if payload_is_mcp && key == "payload" {
                        continue;
                    } else {
                        scrub_missing_inner(child, changed, MigrationContext::Root);
                    }
                }
            }
        },
        _ => {}
    }
}

fn scrub_missing_bindings(field: &mut serde_json::Value, changed: &mut bool) {
    if let Some(map) = field.as_object() {
        let bindings = map
            .keys()
            .map(|name| {
                serde_json::json!({
                    "name": name,
                    "secret_ref": SecretRef::missing(name)
                })
            })
            .collect::<Vec<_>>();
        *field = serde_json::Value::Array(bindings);
        *changed = true;
    } else if let Some(entries) = field.as_array_mut() {
        for (index, entry) in entries.iter_mut().enumerate() {
            if let Some(pair) = entry.as_array() {
                let name = pair
                    .first()
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("entry-{index}"));
                *entry = serde_json::json!({
                    "name": name,
                    "secret_ref": SecretRef::missing(&name)
                });
                *changed = true;
                continue;
            }
            let Some(entry_object) = entry.as_object_mut() else {
                *entry = serde_json::json!({
                    "name": format!("entry-{index}"),
                    "secret_ref": SecretRef::missing(&format!("entry-{index}"))
                });
                *changed = true;
                continue;
            };
            if entry_object.contains_key("secret_ref") {
                if entry_object.remove("value").is_some() {
                    *changed = true;
                }
                continue;
            }
            let Some(name) = entry_object
                .get("name")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string)
            else {
                *entry = serde_json::json!({
                    "name": format!("entry-{index}"),
                    "secret_ref": SecretRef::missing(&format!("entry-{index}"))
                });
                *changed = true;
                continue;
            };
            *entry = serde_json::json!({
                "name": name,
                "secret_ref": SecretRef::missing(&name)
            });
            *changed = true;
        }
    }
}
