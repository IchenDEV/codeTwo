//! Filesystem snapshots used by Work mode before invoking a provider.
//!
//! The service deliberately only deals with files on disk.  It does not persist a snapshot,
//! launch a provider, or decide whether a failed snapshot is safe to continue; callers must make
//! that decision explicitly through [`SnapshotPreparationOptions`].

use std::collections::BTreeMap;
use std::ffi::CString;
use std::fmt;
use std::fs::{self, File, Metadata, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use filetime::{set_file_mtime, FileTime};
use ignore::gitignore::{Gitignore, GitignoreBuilder};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

const MANIFEST_FILE: &str = "manifest.json";
const CONTENT_DIR: &str = "files";
const MANIFEST_VERSION: u32 = 1;

/// Directories which are generated dependencies/build output rather than workspace source.
const BUILTIN_IGNORES: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".cache",
    ".parcel-cache",
    ".turbo",
    ".nx",
    ".vite",
    ".svelte-kit",
    "coverage",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".tox",
    ".gradle",
];

/// Metadata for one regular file captured in a snapshot manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotFile {
    /// Normalized workspace-relative path using `/` separators.
    pub path: String,
    pub size: u64,
    /// Unix timestamp in nanoseconds. This is lossless for normal contemporary filesystems.
    pub mtime: i64,
    /// Unix mode when available (always `Some` on Unix, `None` elsewhere).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<u32>,
    /// Lower-case BLAKE3 digest of file contents.
    pub blake3: String,
}

/// JSON document written at the snapshot root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotManifest {
    pub version: u32,
    pub files: Vec<SnapshotFile>,
}

/// Why a path was not covered by a regular-file snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NotCoveredReason {
    Ignored,
    Symlink,
    NonRegular,
    Inaccessible,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NotCoveredPath {
    pub path: String,
    pub reason: NotCoveredReason,
}

/// Snapshot creation options. `allow_without_rollback` never launches a provider or persists a
/// partial snapshot; it only lets the caller receive a typed preparation describing the failure.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SnapshotPreparationOptions {
    pub allow_without_rollback: bool,
}

/// Inputs and policy for [`WorkspaceSnapshotService`].
#[derive(Clone)]
pub struct SnapshotConfig {
    pub workspace_root: PathBuf,
    pub snapshot_root: PathBuf,
    pub provider_cwd: Option<PathBuf>,
    pub allow_without_rollback: bool,
    /// Optional test/embedding copier. The default attempts clonefile on macOS and falls back to
    /// an ordinary copy everywhere else.
    pub copier: Option<Arc<dyn SnapshotCopier>>,
    pub rollback_hook: Option<Arc<dyn RollbackHook>>,
}

impl fmt::Debug for SnapshotConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SnapshotConfig")
            .field("workspace_root", &self.workspace_root)
            .field("snapshot_root", &self.snapshot_root)
            .field("provider_cwd", &self.provider_cwd)
            .field("allow_without_rollback", &self.allow_without_rollback)
            .field("copier", &self.copier.as_ref().map(|_| "<injected>"))
            .field(
                "rollback_hook",
                &self.rollback_hook.as_ref().map(|_| "<injected>"),
            )
            .finish()
    }
}

impl SnapshotConfig {
    pub fn new(workspace_root: impl Into<PathBuf>, snapshot_root: impl Into<PathBuf>) -> Self {
        Self {
            workspace_root: workspace_root.into(),
            snapshot_root: snapshot_root.into(),
            provider_cwd: None,
            allow_without_rollback: false,
            copier: None,
            rollback_hook: None,
        }
    }

    pub fn provider_cwd(mut self, cwd: impl Into<PathBuf>) -> Self {
        self.provider_cwd = Some(cwd.into());
        self
    }

    pub fn allow_without_rollback(mut self, allow: bool) -> Self {
        self.allow_without_rollback = allow;
        self
    }

    pub fn copier(mut self, copier: impl SnapshotCopier + 'static) -> Self {
        self.copier = Some(Arc::new(copier));
        self
    }

    pub fn shared_copier(mut self, copier: Arc<dyn SnapshotCopier>) -> Self {
        self.copier = Some(copier);
        self
    }

    pub fn rollback_hook(mut self, hook: impl RollbackHook + 'static) -> Self {
        self.rollback_hook = Some(Arc::new(hook));
        self
    }
}

/// Injectable file copier. Snapshot creation calls `clone_file` first for every file and invokes
/// `copy_file` when cloning fails. Tests can force the fallback without platform-specific APIs.
pub trait SnapshotCopier: Send + Sync {
    fn clone_file(&self, source: &Path, destination: &Path) -> io::Result<()> {
        platform_clone_file(source, destination)
    }

    fn copy_file(&self, source: &Path, destination: &Path) -> io::Result<()> {
        fs::copy(source, destination).map(|_| ())
    }

    /// Copy from a handle opened with no-follow semantics. Implementers must not reopen `source`
    /// by path here; the handle is the security boundary used by production fallback copies.
    fn copy_file_from_open(
        &self,
        source: &Path,
        source_file: &mut File,
        destination: &Path,
    ) -> io::Result<()>;
}

/// Deterministic test seam invoked after rollback planning and immediately before each action.
/// Production callers should leave this unset.
pub trait RollbackHook: Send + Sync {
    fn before_apply(&self, path: &str);

    fn before_commit(&self, _path: &str) {}
}

#[derive(Debug, Default, Clone, Copy)]
pub struct PlatformSnapshotCopier;

impl SnapshotCopier for PlatformSnapshotCopier {
    fn clone_file(&self, source: &Path, destination: &Path) -> io::Result<()> {
        platform_clone_file(source, destination)
    }

    fn copy_file(&self, source: &Path, destination: &Path) -> io::Result<()> {
        fs::copy(source, destination).map(|_| ())
    }

    fn copy_file_from_open(
        &self,
        _source: &Path,
        source_file: &mut File,
        destination: &Path,
    ) -> io::Result<()> {
        source_file.seek(SeekFrom::Start(0))?;
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination)?;
        io::copy(source_file, &mut output)?;
        output.flush()
    }
}

/// A completed, content-addressed filesystem snapshot.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceSnapshot {
    pub workspace_root: PathBuf,
    pub snapshot_root: PathBuf,
    pub manifest: SnapshotManifest,
    pub not_covered: Vec<NotCoveredPath>,
}

impl WorkspaceSnapshot {
    pub fn manifest_path(&self) -> PathBuf {
        self.snapshot_root.join(MANIFEST_FILE)
    }

    pub fn content_path(&self, relative_path: &str) -> Result<PathBuf, SnapshotError> {
        let rel = validate_relative_path(relative_path)?;
        Ok(self.snapshot_root.join(CONTENT_DIR).join(rel))
    }

    pub fn load(
        snapshot_root: impl Into<PathBuf>,
        workspace_root: impl Into<PathBuf>,
    ) -> Result<Self, SnapshotError> {
        let snapshot_root = snapshot_root.into();
        let workspace_root = workspace_root.into();
        let bytes =
            fs::read(snapshot_root.join(MANIFEST_FILE)).map_err(|source| SnapshotError::Io {
                operation: "read manifest",
                path: snapshot_root.join(MANIFEST_FILE),
                source,
            })?;
        let manifest: SnapshotManifest =
            serde_json::from_slice(&bytes).map_err(SnapshotError::Manifest)?;
        validate_manifest(&manifest)?;
        Ok(Self {
            workspace_root,
            snapshot_root,
            manifest,
            not_covered: Vec::new(),
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoRollbackPreparation {
    pub workspace_root: PathBuf,
    pub provider_cwd: Option<PathBuf>,
    pub failure: RequiresRollbackDecision,
    pub not_covered: Vec<NotCoveredPath>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SnapshotPreparation {
    Snapshot(WorkspaceSnapshot),
    NoRollback(NoRollbackPreparation),
}

impl SnapshotPreparation {
    pub fn snapshot(&self) -> Option<&WorkspaceSnapshot> {
        match self {
            Self::Snapshot(snapshot) => Some(snapshot),
            Self::NoRollback(_) => None,
        }
    }

    pub fn no_rollback(&self) -> Option<&NoRollbackPreparation> {
        match self {
            Self::Snapshot(_) => None,
            Self::NoRollback(preparation) => Some(preparation),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequiresRollbackDecision {
    pub path: PathBuf,
    pub operation: String,
    pub reason: String,
}

impl fmt::Display for RequiresRollbackDecision {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{} ({}): {}",
            self.path.display(),
            self.operation,
            self.reason
        )
    }
}

#[derive(Debug, Error)]
pub enum SnapshotError {
    #[error("invalid snapshot configuration: {0}")]
    InvalidConfig(String),
    #[error("snapshot failed and requires an explicit rollback decision: {0}")]
    RequiresRollbackDecision(RequiresRollbackDecision),
    #[error("invalid snapshot manifest: {0}")]
    InvalidManifest(String),
    #[error("rollback rejected: {0}")]
    RollbackRejected(String),
    #[error("manifest JSON error: {0}")]
    Manifest(#[from] serde_json::Error),
    #[error("{operation} failed for {path}: {source}")]
    Io {
        operation: &'static str,
        path: PathBuf,
        #[source]
        source: io::Error,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SnapshotChangeKind {
    Added,
    Modified,
    Deleted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotChange {
    pub path: String,
    pub kind: SnapshotChangeKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub before: Option<SnapshotFile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub after: Option<SnapshotFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotComparison {
    pub changes: Vec<SnapshotChange>,
    pub not_covered: Vec<NotCoveredPath>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RollbackConflict {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RollbackReport {
    pub restored: Vec<String>,
    pub removed: Vec<String>,
    pub not_covered: Vec<NotCoveredPath>,
    pub conflicts: Vec<RollbackConflict>,
}

/// Service that creates and compares snapshots without performing provider orchestration.
#[derive(Clone)]
pub struct WorkspaceSnapshotService {
    config: SnapshotConfig,
}

impl fmt::Debug for WorkspaceSnapshotService {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("WorkspaceSnapshotService")
            .field("config", &self.config)
            .finish()
    }
}

impl WorkspaceSnapshotService {
    pub fn new(config: SnapshotConfig) -> Self {
        Self { config }
    }

    pub fn config(&self) -> &SnapshotConfig {
        &self.config
    }

    pub fn with_copier(mut self, copier: impl SnapshotCopier + 'static) -> Self {
        self.config.copier = Some(Arc::new(copier));
        self
    }

    /// Create a snapshot using the policy in [`SnapshotConfig`].
    pub fn create(&self) -> Result<SnapshotPreparation, SnapshotError> {
        self.create_with_options(SnapshotPreparationOptions {
            allow_without_rollback: self.config.allow_without_rollback,
        })
    }

    /// Create a snapshot with an explicit rollback decision policy.
    pub fn create_with_options(
        &self,
        options: SnapshotPreparationOptions,
    ) -> Result<SnapshotPreparation, SnapshotError> {
        let roots = ValidatedRoots::new(&self.config)?;
        let matcher = match IgnoreMatcher::new(&roots.workspace_root) {
            Ok(matcher) => matcher,
            Err(error) => {
                return self.handle_failure(
                    options.allow_without_rollback,
                    roots,
                    RequiresRollbackDecision {
                        path: self.config.workspace_root.clone(),
                        operation: "read ignore rules".to_owned(),
                        reason: error,
                    },
                    Vec::new(),
                )
            }
        };
        let scan = match scan_workspace(&roots.workspace_root, &matcher) {
            Ok(scan) => scan,
            Err((failure, not_covered)) => {
                return self.handle_failure(
                    options.allow_without_rollback,
                    roots,
                    failure,
                    not_covered,
                )
            }
        };

        let staging = staging_path(&roots.snapshot_root)?;
        if let Err(source) = fs::create_dir_all(staging.join(CONTENT_DIR)) {
            let failure = RequiresRollbackDecision {
                path: staging.clone(),
                operation: "create snapshot root".to_owned(),
                reason: source.to_string(),
            };
            return self.handle_failure(
                options.allow_without_rollback,
                roots,
                failure,
                scan.not_covered,
            );
        }

        let copier = self
            .config
            .copier
            .clone()
            .unwrap_or_else(|| Arc::new(PlatformSnapshotCopier));
        let mut copied = Vec::with_capacity(scan.files.len());
        for file in &scan.files {
            let source_path = roots.workspace_root.join(path_from_slash(&file.path));
            let destination = match content_destination(&staging, &file.path) {
                Ok(destination) => destination,
                Err(error) => {
                    cleanup_staging(&staging);
                    return Err(error);
                }
            };
            if let Some(parent) = destination.parent() {
                if let Err(source) = fs::create_dir_all(parent) {
                    cleanup_staging(&staging);
                    let failure = RequiresRollbackDecision {
                        path: parent.to_path_buf(),
                        operation: "create snapshot content directory".to_owned(),
                        reason: source.to_string(),
                    };
                    return self.handle_failure(
                        options.allow_without_rollback,
                        roots,
                        failure,
                        scan.not_covered,
                    );
                }
            }
            let mut source_file = match open_source_no_follow(&source_path) {
                Ok(file) => file,
                Err(source) => {
                    cleanup_staging(&staging);
                    let failure = RequiresRollbackDecision {
                        path: source_path,
                        operation: "open workspace file without following symlinks".to_owned(),
                        reason: source.to_string(),
                    };
                    return self.handle_failure(
                        options.allow_without_rollback,
                        roots,
                        failure,
                        scan.not_covered.clone(),
                    );
                }
            };
            let source_metadata = match source_file.metadata() {
                Ok(metadata) => metadata,
                Err(source) => {
                    cleanup_staging(&staging);
                    let failure = RequiresRollbackDecision {
                        path: source_path,
                        operation: "read workspace file metadata".to_owned(),
                        reason: source.to_string(),
                    };
                    return self.handle_failure(
                        options.allow_without_rollback,
                        roots,
                        failure,
                        scan.not_covered.clone(),
                    );
                }
            };
            let clone_error = copier.clone_file(&source_path, &destination);
            if let Err(clone_error) = clone_error {
                if let Err(reason) = source_replacement_reason(&source_path) {
                    cleanup_staging(&staging);
                    let failure = RequiresRollbackDecision {
                        path: source_path,
                        operation: "verify workspace file after clone attempt".to_owned(),
                        reason,
                    };
                    return self.handle_failure(
                        options.allow_without_rollback,
                        roots,
                        failure,
                        scan.not_covered.clone(),
                    );
                }
                if let Err(source) =
                    copier.copy_file_from_open(&source_path, &mut source_file, &destination)
                {
                    cleanup_staging(&staging);
                    let failure = RequiresRollbackDecision {
                        path: source_path,
                        operation: "copy snapshot file".to_owned(),
                        reason: format!("clone failed: {clone_error}; copy failed: {source}"),
                    };
                    return self.handle_failure(
                        options.allow_without_rollback,
                        roots,
                        failure,
                        scan.not_covered.clone(),
                    );
                }
            }
            if let Err(reason) = source_replacement_reason(&source_path) {
                cleanup_staging(&staging);
                let failure = RequiresRollbackDecision {
                    path: source_path,
                    operation: "verify workspace file after snapshot copy".to_owned(),
                    reason,
                };
                return self.handle_failure(
                    options.allow_without_rollback,
                    roots,
                    failure,
                    scan.not_covered.clone(),
                );
            }
            if let Err(source) = preserve_snapshot_metadata(&destination, &source_metadata) {
                cleanup_staging(&staging);
                let failure = RequiresRollbackDecision {
                    path: destination,
                    operation: "preserve snapshot file metadata".to_owned(),
                    reason: source.to_string(),
                };
                return self.handle_failure(
                    options.allow_without_rollback,
                    roots,
                    failure,
                    scan.not_covered.clone(),
                );
            }
            let persisted = match metadata_for_persisted_file(&destination, &file.path) {
                Ok(mut file) => {
                    // Bytes are measured from the persisted destination, while mode/mtime come
                    // from the verified no-follow source handle.
                    file.mode = unix_mode(&source_metadata);
                    file.mtime = mtime_nanos(&source_metadata);
                    file
                }
                Err(reason) => {
                    cleanup_staging(&staging);
                    let failure = RequiresRollbackDecision {
                        path: destination,
                        operation: "hash persisted snapshot file".to_owned(),
                        reason,
                    };
                    return self.handle_failure(
                        options.allow_without_rollback,
                        roots,
                        failure,
                        scan.not_covered.clone(),
                    );
                }
            };
            copied.push(persisted);
        }

        let manifest = SnapshotManifest {
            version: MANIFEST_VERSION,
            files: copied,
        };
        let manifest_bytes = match serde_json::to_vec_pretty(&manifest) {
            Ok(bytes) => bytes,
            Err(error) => {
                cleanup_staging(&staging);
                let failure = RequiresRollbackDecision {
                    path: staging.join(MANIFEST_FILE),
                    operation: "serialize snapshot manifest".to_owned(),
                    reason: error.to_string(),
                };
                return self.handle_failure(
                    options.allow_without_rollback,
                    roots,
                    failure,
                    scan.not_covered,
                );
            }
        };
        if let Err(source) = fs::write(staging.join(MANIFEST_FILE), manifest_bytes) {
            cleanup_staging(&staging);
            let failure = RequiresRollbackDecision {
                path: staging.join(MANIFEST_FILE),
                operation: "write snapshot manifest".to_owned(),
                reason: source.to_string(),
            };
            return self.handle_failure(
                options.allow_without_rollback,
                roots,
                failure,
                scan.not_covered,
            );
        }

        if let Err(source) = publish_staging(&staging, &roots.snapshot_root) {
            cleanup_staging(&staging);
            let failure = RequiresRollbackDecision {
                path: roots.snapshot_root.clone(),
                operation: "publish snapshot".to_owned(),
                reason: source.to_string(),
            };
            return self.handle_failure(
                options.allow_without_rollback,
                roots,
                failure,
                scan.not_covered,
            );
        }
        Ok(SnapshotPreparation::Snapshot(WorkspaceSnapshot {
            workspace_root: roots.workspace_root,
            snapshot_root: roots.snapshot_root,
            manifest,
            not_covered: scan.not_covered,
        }))
    }

    /// Convenience method that requires a real rollback-capable snapshot.
    pub fn snapshot(&self) -> Result<WorkspaceSnapshot, SnapshotError> {
        match self.create()? {
            SnapshotPreparation::Snapshot(snapshot) => Ok(snapshot),
            SnapshotPreparation::NoRollback(preparation) => {
                Err(SnapshotError::RequiresRollbackDecision(preparation.failure))
            }
        }
    }

    /// Compare the workspace represented by `snapshot` to its manifest.
    pub fn compare(
        &self,
        snapshot: &WorkspaceSnapshot,
    ) -> Result<SnapshotComparison, SnapshotError> {
        let roots = ValidatedRoots::new(&self.config)?;
        if roots.workspace_root != snapshot.workspace_root {
            return Err(SnapshotError::InvalidConfig(
                "snapshot workspace root does not match service workspace root".to_owned(),
            ));
        }
        let snapshot_input = make_absolute(&snapshot.snapshot_root)?;
        if let Ok(metadata) = fs::symlink_metadata(&snapshot_input) {
            if metadata.file_type().is_symlink() {
                return Err(SnapshotError::InvalidConfig(
                    "snapshot root must not be a symlink".to_owned(),
                ));
            }
        }
        let snapshot_root = canonicalize_allow_missing(&snapshot_input)?;
        if snapshot_root != roots.snapshot_root {
            return Err(SnapshotError::InvalidConfig(
                "snapshot root does not match service snapshot root".to_owned(),
            ));
        }
        validate_manifest(&snapshot.manifest)?;
        let matcher =
            IgnoreMatcher::new(&roots.workspace_root).map_err(SnapshotError::InvalidConfig)?;
        let scan = scan_workspace(&roots.workspace_root, &matcher)
            .map_err(|(failure, _)| SnapshotError::InvalidConfig(failure.reason))?;
        Ok(compare_manifests(
            &snapshot.manifest,
            &scan.files,
            scan.not_covered,
        ))
    }

    /// Restore a freshly verified comparison from the snapshot. Only modified/deleted manifest
    /// paths are restored, and only paths classified as added by that exact comparison are
    /// removed. A stale comparison or a changed/symlink target returns a conflict report without
    /// touching any workspace file.
    pub fn rollback(
        &self,
        snapshot: &WorkspaceSnapshot,
        comparison: &SnapshotComparison,
    ) -> Result<RollbackReport, SnapshotError> {
        let roots = ValidatedRoots::new(&self.config)?;
        if roots.workspace_root != snapshot.workspace_root {
            return Err(SnapshotError::RollbackRejected(
                "snapshot workspace root does not match service root".to_owned(),
            ));
        }
        let snapshot_input = make_absolute(&snapshot.snapshot_root)?;
        if let Ok(metadata) = fs::symlink_metadata(&snapshot_input) {
            if metadata.file_type().is_symlink() {
                return Err(SnapshotError::RollbackRejected(
                    "snapshot root must not be a symlink".to_owned(),
                ));
            }
        }
        if canonicalize_allow_missing(&snapshot_input)? != roots.snapshot_root {
            return Err(SnapshotError::RollbackRejected(
                "snapshot root does not match service root".to_owned(),
            ));
        }
        validate_manifest(&snapshot.manifest)?;
        for change in &comparison.changes {
            let normalized = validate_relative_path(&change.path)?;
            if normalized != change.path {
                return Err(SnapshotError::RollbackRejected(format!(
                    "comparison path is not normalized: {}",
                    change.path
                )));
            }
        }

        let matcher =
            IgnoreMatcher::new(&roots.workspace_root).map_err(SnapshotError::RollbackRejected)?;
        let scan = scan_workspace(&roots.workspace_root, &matcher).map_err(|(failure, _)| {
            SnapshotError::RollbackRejected(format!("{}: {}", failure.operation, failure.reason))
        })?;
        let fresh = compare_manifests(&snapshot.manifest, &scan.files, scan.not_covered.clone());
        if fresh.changes != comparison.changes || fresh.not_covered != comparison.not_covered {
            return Ok(RollbackReport {
                restored: Vec::new(),
                removed: Vec::new(),
                not_covered: fresh.not_covered,
                conflicts: vec![RollbackConflict {
                    path: "<comparison>".to_owned(),
                    reason: "comparison is stale or does not match a fresh workspace scan"
                        .to_owned(),
                }],
            });
        }

        let mut plans = Vec::with_capacity(comparison.changes.len());
        let mut conflicts = Vec::new();
        for change in &comparison.changes {
            let normalized = validate_relative_path(&change.path)?;
            if normalized != change.path {
                return Err(SnapshotError::RollbackRejected(format!(
                    "comparison path is not normalized: {}",
                    change.path
                )));
            }
            let target = safe_workspace_path(&roots.workspace_root, &normalized, true)?;
            match change.kind {
                SnapshotChangeKind::Added => {
                    if change.before.is_some() || change.after.is_none() {
                        return Err(SnapshotError::RollbackRejected(format!(
                            "added comparison has invalid metadata: {}",
                            change.path
                        )));
                    }
                    let Some(after) = change.after.as_ref() else {
                        unreachable!()
                    };
                    match current_file_metadata(&target, &normalized) {
                        Ok(current) if current == *after => plans.push(RollbackPlan::Remove {
                            path: normalized,
                            target,
                            expected: after.clone(),
                        }),
                        Ok(_) => conflicts.push(RollbackConflict {
                            path: normalized,
                            reason: "added file changed since comparison".to_owned(),
                        }),
                        Err(reason) if reason == "path does not exist" => {
                            conflicts.push(RollbackConflict {
                                path: normalized,
                                reason: "added file disappeared since comparison".to_owned(),
                            })
                        }
                        Err(reason) => conflicts.push(RollbackConflict {
                            path: normalized,
                            reason,
                        }),
                    }
                }
                SnapshotChangeKind::Modified => {
                    let Some(before) = change.before.as_ref() else {
                        return Err(SnapshotError::RollbackRejected(format!(
                            "modified comparison lacks snapshot metadata: {}",
                            change.path
                        )));
                    };
                    let Some(after) = change.after.as_ref() else {
                        return Err(SnapshotError::RollbackRejected(format!(
                            "modified comparison lacks current metadata: {}",
                            change.path
                        )));
                    };
                    let source = safe_snapshot_content(&roots.snapshot_root, &normalized)?;
                    verify_snapshot_content(&source, before)?;
                    match current_file_metadata(&target, &normalized) {
                        Ok(current) if current == *after => plans.push(RollbackPlan::Restore {
                            path: normalized,
                            target,
                            source,
                            metadata: before.clone(),
                            expected: Some(after.clone()),
                        }),
                        Ok(_) => conflicts.push(RollbackConflict {
                            path: normalized,
                            reason: "modified file changed since comparison".to_owned(),
                        }),
                        Err(reason) => conflicts.push(RollbackConflict {
                            path: normalized,
                            reason,
                        }),
                    }
                }
                SnapshotChangeKind::Deleted => {
                    let Some(before) = change.before.as_ref() else {
                        return Err(SnapshotError::RollbackRejected(format!(
                            "deleted comparison lacks snapshot metadata: {}",
                            change.path
                        )));
                    };
                    if change.after.is_some() {
                        return Err(SnapshotError::RollbackRejected(format!(
                            "deleted comparison has current metadata: {}",
                            change.path
                        )));
                    }
                    let source = safe_snapshot_content(&roots.snapshot_root, &normalized)?;
                    verify_snapshot_content(&source, before)?;
                    match fs::symlink_metadata(&target) {
                        Err(error) if error.kind() == io::ErrorKind::NotFound => {
                            plans.push(RollbackPlan::Restore {
                                path: normalized,
                                target,
                                source,
                                metadata: before.clone(),
                                expected: None,
                            });
                        }
                        Err(error) => conflicts.push(RollbackConflict {
                            path: normalized,
                            reason: error.to_string(),
                        }),
                        Ok(metadata) if metadata.file_type().is_symlink() => {
                            conflicts.push(RollbackConflict {
                                path: normalized,
                                reason: "deleted path was replaced by a symlink".to_owned(),
                            })
                        }
                        Ok(_) => conflicts.push(RollbackConflict {
                            path: normalized,
                            reason: "deleted path reappeared since comparison".to_owned(),
                        }),
                    }
                }
            }
        }
        if !conflicts.is_empty() {
            return Ok(RollbackReport {
                restored: Vec::new(),
                removed: Vec::new(),
                not_covered: fresh.not_covered,
                conflicts,
            });
        }

        apply_rollback_plans(
            &roots.workspace_root,
            plans,
            fresh.not_covered,
            self.config.rollback_hook.as_deref(),
        )
    }

    fn handle_failure(
        &self,
        allow_without_rollback: bool,
        roots: ValidatedRoots,
        failure: RequiresRollbackDecision,
        not_covered: Vec<NotCoveredPath>,
    ) -> Result<SnapshotPreparation, SnapshotError> {
        if allow_without_rollback {
            Ok(SnapshotPreparation::NoRollback(NoRollbackPreparation {
                workspace_root: roots.workspace_root,
                provider_cwd: roots.provider_cwd,
                failure,
                not_covered,
            }))
        } else {
            Err(SnapshotError::RequiresRollbackDecision(failure))
        }
    }
}

struct ValidatedRoots {
    workspace_root: PathBuf,
    snapshot_root: PathBuf,
    provider_cwd: Option<PathBuf>,
}

impl ValidatedRoots {
    fn new(config: &SnapshotConfig) -> Result<Self, SnapshotError> {
        let workspace_input = make_absolute(&config.workspace_root)?;
        let workspace_meta =
            fs::symlink_metadata(&workspace_input).map_err(|source| SnapshotError::Io {
                operation: "inspect workspace root",
                path: workspace_input.clone(),
                source,
            })?;
        if workspace_meta.file_type().is_symlink() {
            return Err(SnapshotError::InvalidConfig(
                "workspace root must not be a symlink".to_owned(),
            ));
        }
        if !workspace_meta.is_dir() {
            return Err(SnapshotError::InvalidConfig(
                "workspace root must be a directory".to_owned(),
            ));
        }
        let workspace_root =
            fs::canonicalize(&workspace_input).map_err(|source| SnapshotError::Io {
                operation: "canonicalize workspace root",
                path: workspace_input,
                source,
            })?;

        let snapshot_input = make_absolute(&config.snapshot_root)?;
        if snapshot_input == workspace_root {
            return Err(SnapshotError::InvalidConfig(
                "snapshot root must be outside workspace root".to_owned(),
            ));
        }
        if let Ok(metadata) = fs::symlink_metadata(&snapshot_input) {
            if metadata.file_type().is_symlink() {
                return Err(SnapshotError::InvalidConfig(
                    "snapshot root must not be a symlink".to_owned(),
                ));
            }
            if !metadata.is_dir() {
                return Err(SnapshotError::InvalidConfig(
                    "snapshot root must be a directory".to_owned(),
                ));
            }
        }
        let snapshot_root = canonicalize_allow_missing(&snapshot_input)?;
        if is_within(&snapshot_root, &workspace_root) {
            return Err(SnapshotError::InvalidConfig(
                "snapshot root must be outside workspace root".to_owned(),
            ));
        }

        let provider_cwd = match config.provider_cwd.as_ref() {
            None => None,
            Some(path) => {
                let input = make_absolute(path)?;
                let metadata =
                    fs::symlink_metadata(&input).map_err(|source| SnapshotError::Io {
                        operation: "inspect provider cwd",
                        path: input.clone(),
                        source,
                    })?;
                if metadata.file_type().is_symlink() || !metadata.is_dir() {
                    return Err(SnapshotError::InvalidConfig(
                        "provider cwd must be a real directory".to_owned(),
                    ));
                }
                Some(
                    fs::canonicalize(&input).map_err(|source| SnapshotError::Io {
                        operation: "canonicalize provider cwd",
                        path: input,
                        source,
                    })?,
                )
            }
        };
        if let Some(provider_cwd) = provider_cwd.as_ref() {
            if is_within(&snapshot_root, provider_cwd) {
                return Err(SnapshotError::InvalidConfig(
                    "snapshot root must be outside provider cwd".to_owned(),
                ));
            }
        }
        Ok(Self {
            workspace_root,
            snapshot_root,
            provider_cwd,
        })
    }
}

enum RollbackPlan {
    Restore {
        path: String,
        target: PathBuf,
        source: PathBuf,
        metadata: SnapshotFile,
        expected: Option<SnapshotFile>,
    },
    Remove {
        path: String,
        target: PathBuf,
        expected: SnapshotFile,
    },
}

fn safe_workspace_path(
    root: &Path,
    relative: &str,
    allow_missing_final: bool,
) -> Result<PathBuf, SnapshotError> {
    safe_path(root, relative, allow_missing_final, "workspace")
}

fn safe_snapshot_content(root: &Path, relative: &str) -> Result<PathBuf, SnapshotError> {
    let content_root = root.join(CONTENT_DIR);
    let content_metadata = fs::symlink_metadata(&content_root).map_err(|error| {
        SnapshotError::RollbackRejected(format!("snapshot content root is inaccessible: {error}"))
    })?;
    if content_metadata.file_type().is_symlink() || !content_metadata.is_dir() {
        return Err(SnapshotError::RollbackRejected(
            "snapshot content root must be a real directory".to_owned(),
        ));
    }
    let path = safe_path(&content_root, relative, false, "snapshot content")?;
    let metadata = fs::symlink_metadata(&path).map_err(|error| {
        SnapshotError::RollbackRejected(format!("snapshot content {}: {error}", relative))
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(SnapshotError::RollbackRejected(format!(
            "snapshot content is not a regular file: {relative}"
        )));
    }
    Ok(path)
}

fn safe_path(
    root: &Path,
    relative: &str,
    allow_missing_final: bool,
    label: &str,
) -> Result<PathBuf, SnapshotError> {
    let normalized = validate_relative_path(relative)?;
    if normalized != relative {
        return Err(SnapshotError::RollbackRejected(format!(
            "{label} path is not normalized: {relative}"
        )));
    }
    let mut current = root.to_path_buf();
    let components = Path::new(relative).components().collect::<Vec<_>>();
    for (index, component) in components.iter().enumerate() {
        let Component::Normal(name) = component else {
            return Err(SnapshotError::RollbackRejected(format!(
                "{label} path escapes root: {relative}"
            )));
        };
        current.push(name);
        let final_component = index + 1 == components.len();
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(SnapshotError::RollbackRejected(format!(
                    "{label} path contains a symlink: {relative}"
                )))
            }
            Ok(metadata) if !final_component && !metadata.is_dir() => {
                return Err(SnapshotError::RollbackRejected(format!(
                    "{label} path parent is not a directory: {relative}"
                )))
            }
            Ok(_) => {}
            Err(error)
                if final_component
                    && allow_missing_final
                    && error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(SnapshotError::RollbackRejected(format!(
                    "{label} path is inaccessible: {relative}: {error}"
                )))
            }
        }
    }
    Ok(current)
}

fn current_file_metadata(path: &Path, normalized: &str) -> Result<SnapshotFile, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Err("path does not exist".to_owned())
        }
        Err(error) => return Err(error.to_string()),
    };
    if metadata.file_type().is_symlink() {
        return Err("path is a symlink".to_owned());
    }
    if !metadata.is_file() {
        return Err("path is not a regular file".to_owned());
    }
    metadata_for_persisted_file(path, normalized)
}

fn verify_snapshot_content(path: &Path, expected: &SnapshotFile) -> Result<(), SnapshotError> {
    let actual = current_file_metadata(path, &expected.path)
        .map_err(|reason| SnapshotError::RollbackRejected(reason))?;
    if actual.size != expected.size || actual.blake3 != expected.blake3 {
        return Err(SnapshotError::RollbackRejected(format!(
            "snapshot content does not match manifest: {}",
            expected.path
        )));
    }
    Ok(())
}

fn apply_rollback_plans(
    workspace_root: &Path,
    plans: Vec<RollbackPlan>,
    not_covered: Vec<NotCoveredPath>,
    hook: Option<&dyn RollbackHook>,
) -> Result<RollbackReport, SnapshotError> {
    let mut report = RollbackReport {
        restored: Vec::new(),
        removed: Vec::new(),
        not_covered,
        conflicts: Vec::new(),
    };
    let mut created_dirs = Vec::new();
    for plan in plans {
        match plan {
            RollbackPlan::Restore {
                path,
                target,
                source,
                metadata,
                expected,
            } => {
                if let Some(hook) = hook {
                    hook.before_apply(&path);
                }
                let current = if let Some(expected) = expected.as_ref() {
                    current_file_metadata(&target, &path)
                        .map(|actual| actual == *expected)
                        .unwrap_or(false)
                } else {
                    matches!(
                        fs::symlink_metadata(&target),
                        Err(error) if error.kind() == io::ErrorKind::NotFound
                    )
                };
                if !current {
                    report.conflicts.push(RollbackConflict {
                        path,
                        reason: "restore target changed before replacement".to_owned(),
                    });
                    continue;
                }
                if let Err(reason) =
                    ensure_parent_dirs(workspace_root, target.parent(), &mut created_dirs)
                {
                    report.conflicts.push(RollbackConflict { path, reason });
                    continue;
                }
                if let Err(reason) = atomic_restore(
                    workspace_root,
                    &source,
                    &target,
                    &metadata,
                    expected.as_ref(),
                    hook,
                    &path,
                ) {
                    if is_rollback_conflict_reason(&reason) {
                        report.conflicts.push(RollbackConflict { path, reason });
                        continue;
                    }
                    cleanup_created_dirs(&created_dirs);
                    return Err(SnapshotError::RollbackRejected(format!(
                        "restore {path}: {reason}"
                    )));
                }
                report.restored.push(path);
            }
            RollbackPlan::Remove {
                path,
                target,
                expected,
            } => {
                if let Some(hook) = hook {
                    hook.before_apply(&path);
                }
                match safe_remove_file(workspace_root, &target, &path, &expected) {
                    Ok(()) => report.removed.push(path),
                    Err(reason) => report.conflicts.push(RollbackConflict { path, reason }),
                }
            }
        }
    }
    cleanup_created_dirs(&created_dirs);
    Ok(report)
}

fn is_rollback_conflict_reason(reason: &str) -> bool {
    reason.contains("changed before replacement")
        || reason.contains("disappeared before replacement")
        || reason.contains("appeared before replacement")
        || reason.contains("replaced by a symlink")
        || reason.contains("target is a symlink")
}

#[cfg(unix)]
fn safe_remove_file(
    workspace_root: &Path,
    target: &Path,
    normalized: &str,
    expected: &SnapshotFile,
) -> Result<(), String> {
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::fs::OpenOptionsExt;

    let relative = target
        .strip_prefix(workspace_root)
        .map_err(|_| "added file is outside workspace root".to_owned())?;
    let mut components = relative.components().collect::<Vec<_>>();
    let target_name = components
        .pop()
        .and_then(|component| match component {
            Component::Normal(name) => Some(name),
            _ => None,
        })
        .ok_or_else(|| "added file has no file name".to_owned())?;
    let target_name = CString::new(target_name.as_encoded_bytes())
        .map_err(|_| "added file contains NUL".to_owned())?;
    let mut directory = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(workspace_root)
        .map_err(|error| format!("open workspace root: {error}"))?;
    for component in components {
        let Component::Normal(name) = component else {
            return Err("added file contains traversal".to_owned());
        };
        let name = CString::new(name.as_encoded_bytes())
            .map_err(|_| "added file contains NUL".to_owned())?;
        let next_fd = unsafe {
            libc::openat(
                directory.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                0,
            )
        };
        if next_fd < 0 {
            return Err(format!(
                "open added-file parent: {}",
                io::Error::last_os_error()
            ));
        }
        // SAFETY: openat returned a fresh owned descriptor.
        directory = unsafe { File::from_raw_fd(next_fd) };
    }
    let target_fd = unsafe {
        libc::openat(
            directory.as_raw_fd(),
            target_name.as_ptr(),
            libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            0,
        )
    };
    if target_fd < 0 {
        let error = io::Error::last_os_error();
        return Err(if error.raw_os_error() == Some(libc::ELOOP) {
            "added file is a symlink".to_owned()
        } else if error.raw_os_error() == Some(libc::ENOENT) {
            "path does not exist".to_owned()
        } else {
            format!("open added file: {error}")
        });
    }
    // SAFETY: openat returned a fresh owned descriptor.
    let mut target_file = unsafe { File::from_raw_fd(target_fd) };
    let current = metadata_for_open_file(normalized, &mut target_file)?;
    if current != *expected {
        return Err("added file changed before removal".to_owned());
    }
    let result = unsafe { libc::unlinkat(directory.as_raw_fd(), target_name.as_ptr(), 0) };
    if result != 0 {
        return Err(format!("remove added file: {}", io::Error::last_os_error()));
    }
    Ok(())
}

#[cfg(not(unix))]
fn safe_remove_file(
    _workspace_root: &Path,
    target: &Path,
    normalized: &str,
    expected: &SnapshotFile,
) -> Result<(), String> {
    let current = current_file_metadata(target, normalized)?;
    if current != *expected {
        return Err("added file changed before removal".to_owned());
    }
    fs::remove_file(target).map_err(|error| error.to_string())
}

fn ensure_parent_dirs(
    workspace_root: &Path,
    parent: Option<&Path>,
    created: &mut Vec<PathBuf>,
) -> Result<(), String> {
    let Some(parent) = parent else {
        return Err("rollback target has no parent".to_owned());
    };
    let relative_parent = parent
        .strip_prefix(workspace_root)
        .map_err(|_| "rollback target parent is outside workspace root".to_owned())?;
    let mut check = workspace_root.to_path_buf();
    for component in relative_parent.components() {
        let Component::Normal(name) = component else {
            return Err("rollback target parent contains traversal".to_owned());
        };
        check.push(name);
        if let Ok(metadata) = fs::symlink_metadata(&check) {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err("rollback target parent contains a symlink or non-directory".to_owned());
            }
        }
    }
    let mut missing = Vec::new();
    let mut current = parent.to_path_buf();
    while !current.exists() {
        missing.push(current.clone());
        let Some(next) = current.parent() else {
            return Err("rollback target parent has no existing ancestor".to_owned());
        };
        current = next.to_path_buf();
    }
    let metadata = fs::symlink_metadata(&current).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("rollback target parent contains a symlink or non-directory".to_owned());
    }
    for directory in missing.iter().rev() {
        if let Ok(metadata) = fs::symlink_metadata(directory) {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(format!(
                    "rollback parent is unsafe: {}",
                    directory.display()
                ));
            }
            continue;
        }
        fs::create_dir(directory).map_err(|error| error.to_string())?;
        created.push(directory.clone());
    }
    Ok(())
}

fn cleanup_created_dirs(created: &[PathBuf]) {
    for directory in created.iter().rev() {
        let _ = fs::remove_dir(directory);
    }
}

#[cfg(unix)]
fn atomic_restore(
    workspace_root: &Path,
    source: &Path,
    target: &Path,
    metadata: &SnapshotFile,
    expected: Option<&SnapshotFile>,
    hook: Option<&dyn RollbackHook>,
    path: &str,
) -> Result<(), String> {
    atomic_restore_unix(
        workspace_root,
        source,
        target,
        metadata,
        expected,
        hook,
        path,
    )
}

#[cfg(not(unix))]
fn atomic_restore(
    _workspace_root: &Path,
    source: &Path,
    target: &Path,
    metadata: &SnapshotFile,
    expected: Option<&SnapshotFile>,
    hook: Option<&dyn RollbackHook>,
    path: &str,
) -> Result<(), String> {
    let mut source_file = open_source_no_follow(source).map_err(|error| error.to_string())?;
    let parent = target
        .parent()
        .ok_or_else(|| "rollback target has no parent".to_owned())?;
    let name = target
        .file_name()
        .ok_or_else(|| "rollback target has no file name".to_owned())?
        .to_string_lossy();
    let temporary = parent.join(format!(".{name}.codetwo-rollback-{}", Uuid::new_v4()));
    let result = (|| {
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| error.to_string())?;
        source_file
            .seek(SeekFrom::Start(0))
            .map_err(|error| error.to_string())?;
        io::copy(&mut source_file, &mut output).map_err(|error| error.to_string())?;
        output.flush().map_err(|error| error.to_string())?;
        preserve_snapshot_metadata_from_manifest(&temporary, metadata)?;
        if let Some(hook) = hook {
            hook.before_commit(path);
        }
        if let Ok(current) = fs::symlink_metadata(target) {
            if current.file_type().is_symlink() {
                return Err("rollback target was replaced by a symlink".to_owned());
            }
            if !current.is_file() {
                return Err("rollback target is not a regular file".to_owned());
            }
            let Some(expected) = expected else {
                return Err("rollback target appeared before replacement".to_owned());
            };
            if current_file_metadata(target, path)? != *expected {
                return Err("rollback target changed before replacement".to_owned());
            }
        } else if expected.is_some() {
            return Err("rollback target disappeared before replacement".to_owned());
        }
        fs::rename(&temporary, target).map_err(|error| error.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(unix)]
fn atomic_restore_unix(
    workspace_root: &Path,
    source: &Path,
    target: &Path,
    metadata: &SnapshotFile,
    expected: Option<&SnapshotFile>,
    hook: Option<&dyn RollbackHook>,
    path: &str,
) -> Result<(), String> {
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::fs::OpenOptionsExt;

    let source_file = open_source_no_follow(source).map_err(|error| error.to_string())?;
    let relative = target
        .strip_prefix(workspace_root)
        .map_err(|_| "rollback target is outside workspace root".to_owned())?;
    let mut components = relative.components().collect::<Vec<_>>();
    let target_name = components
        .pop()
        .and_then(|component| match component {
            Component::Normal(name) => Some(name),
            _ => None,
        })
        .ok_or_else(|| "rollback target has no file name".to_owned())?;
    let target_name = CString::new(target_name.as_encoded_bytes())
        .map_err(|_| "rollback target contains NUL".to_owned())?;
    let mut directory = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(workspace_root)
        .map_err(|error| format!("open workspace root: {error}"))?;
    for component in components {
        let Component::Normal(name) = component else {
            return Err("rollback target contains traversal".to_owned());
        };
        let name = CString::new(name.as_encoded_bytes())
            .map_err(|_| "rollback target contains NUL".to_owned())?;
        let next_fd = unsafe {
            libc::openat(
                directory.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                0,
            )
        };
        if next_fd < 0 {
            return Err(format!(
                "open rollback parent: {}",
                io::Error::last_os_error()
            ));
        }
        // SAFETY: openat returned a fresh owned descriptor.
        directory = unsafe { File::from_raw_fd(next_fd) };
    }

    let temporary_name = CString::new(format!(".codetwo-rollback-{}", Uuid::new_v4()))
        .map_err(|_| "temporary rollback name contains NUL".to_owned())?;
    let temporary_fd = unsafe {
        libc::openat(
            directory.as_raw_fd(),
            temporary_name.as_ptr(),
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            0o600,
        )
    };
    if temporary_fd < 0 {
        return Err(format!(
            "create temporary rollback file: {}",
            io::Error::last_os_error()
        ));
    }
    // SAFETY: openat returned a fresh owned descriptor.
    let mut output = unsafe { File::from_raw_fd(temporary_fd) };
    let result = (|| {
        let mut source_file = source_file;
        source_file
            .seek(SeekFrom::Start(0))
            .map_err(|error| error.to_string())?;
        io::copy(&mut source_file, &mut output).map_err(|error| error.to_string())?;
        output.flush().map_err(|error| error.to_string())?;
        preserve_snapshot_metadata_fd(output.as_raw_fd(), metadata)?;
        if let Some(hook) = hook {
            hook.before_commit(path);
        }
        verify_target_before_commit(directory.as_raw_fd(), target_name.as_ptr(), path, expected)?;
        let rename_result = unsafe {
            libc::renameat(
                directory.as_raw_fd(),
                temporary_name.as_ptr(),
                directory.as_raw_fd(),
                target_name.as_ptr(),
            )
        };
        if rename_result != 0 {
            return Err(format!(
                "replace rollback target: {}",
                io::Error::last_os_error()
            ));
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = unsafe { libc::unlinkat(directory.as_raw_fd(), temporary_name.as_ptr(), 0) };
    }
    result
}

#[cfg(unix)]
fn verify_target_before_commit(
    directory_fd: std::os::fd::RawFd,
    target_name: *const libc::c_char,
    normalized: &str,
    expected: Option<&SnapshotFile>,
) -> Result<(), String> {
    use std::os::fd::FromRawFd;

    let target_fd = unsafe {
        libc::openat(
            directory_fd,
            target_name,
            libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            0,
        )
    };
    if target_fd < 0 {
        let error = io::Error::last_os_error();
        return match (expected, error.raw_os_error()) {
            (None, Some(libc::ENOENT)) => Ok(()),
            (None, Some(libc::ELOOP)) => Err("rollback target is a symlink".to_owned()),
            (None, _) => Err(format!("inspect rollback target: {error}")),
            (Some(_), Some(libc::ENOENT)) => {
                Err("rollback target disappeared before replacement".to_owned())
            }
            (Some(_), Some(libc::ELOOP)) => {
                Err("rollback target was replaced by a symlink".to_owned())
            }
            (Some(_), _) => Err(format!("inspect rollback target: {error}")),
        };
    }
    // SAFETY: openat returned a fresh owned descriptor.
    let mut target_file = unsafe { File::from_raw_fd(target_fd) };
    let Some(expected) = expected else {
        return Err("rollback target appeared before replacement".to_owned());
    };
    let actual = metadata_for_open_file(normalized, &mut target_file)?;
    if actual != *expected {
        return Err("rollback target changed before replacement".to_owned());
    }
    Ok(())
}

#[cfg(unix)]
fn preserve_snapshot_metadata_fd(
    fd: std::os::fd::RawFd,
    metadata: &SnapshotFile,
) -> Result<(), String> {
    if let Some(mode) = metadata.mode {
        let result = unsafe { libc::fchmod(fd, mode as libc::mode_t) };
        if result != 0 {
            return Err(format!("set rollback mode: {}", io::Error::last_os_error()));
        }
    }
    let seconds = metadata.mtime.div_euclid(1_000_000_000);
    let nanos = metadata.mtime.rem_euclid(1_000_000_000) as libc::c_long;
    let times = [
        libc::timespec {
            tv_sec: seconds as libc::time_t,
            tv_nsec: nanos,
        },
        libc::timespec {
            tv_sec: seconds as libc::time_t,
            tv_nsec: nanos,
        },
    ];
    let result = unsafe { libc::futimens(fd, times.as_ptr()) };
    if result != 0 {
        return Err(format!(
            "set rollback mtime: {}",
            io::Error::last_os_error()
        ));
    }
    Ok(())
}

#[cfg(not(unix))]
fn preserve_snapshot_metadata_from_manifest(
    path: &Path,
    metadata: &SnapshotFile,
) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(path)
            .map_err(|error| error.to_string())?
            .permissions();
        if let Some(mode) = metadata.mode {
            permissions.set_mode(mode);
            fs::set_permissions(path, permissions).map_err(|error| error.to_string())?;
        }
    }
    let seconds = metadata.mtime.div_euclid(1_000_000_000);
    let nanos = metadata.mtime.rem_euclid(1_000_000_000) as u32;
    set_file_mtime(path, FileTime::from_unix_time(seconds, nanos))
        .map_err(|error| error.to_string())
}

fn make_absolute(path: &Path) -> Result<PathBuf, SnapshotError> {
    if path.as_os_str().is_empty() {
        return Err(SnapshotError::InvalidConfig(
            "path must not be empty".to_owned(),
        ));
    }
    if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(path))
            .map_err(|source| SnapshotError::Io {
                operation: "resolve relative path",
                path: path.to_path_buf(),
                source,
            })
    }
}

fn canonicalize_allow_missing(path: &Path) -> Result<PathBuf, SnapshotError> {
    if path.exists() {
        return fs::canonicalize(path).map_err(|source| SnapshotError::Io {
            operation: "canonicalize snapshot root",
            path: path.to_path_buf(),
            source,
        });
    }
    let mut missing = Vec::new();
    let mut current = path.to_path_buf();
    while !current.exists() {
        let Some(name) = current.file_name() else {
            return Err(SnapshotError::InvalidConfig(
                "snapshot root has no existing parent".to_owned(),
            ));
        };
        missing.push(name.to_os_string());
        let Some(parent) = current.parent() else {
            return Err(SnapshotError::InvalidConfig(
                "snapshot root has no existing parent".to_owned(),
            ));
        };
        current = parent.to_path_buf();
    }
    let mut canonical = fs::canonicalize(&current).map_err(|source| SnapshotError::Io {
        operation: "canonicalize snapshot parent",
        path: current.clone(),
        source,
    })?;
    for name in missing.iter().rev() {
        canonical.push(name);
    }
    Ok(canonical)
}

fn is_within(path: &Path, parent: &Path) -> bool {
    path == parent || path.starts_with(parent)
}

fn staging_path(snapshot_root: &Path) -> Result<PathBuf, SnapshotError> {
    let parent = snapshot_root.parent().ok_or_else(|| {
        SnapshotError::InvalidConfig("snapshot root must have a parent".to_owned())
    })?;
    fs::create_dir_all(parent).map_err(|source| SnapshotError::Io {
        operation: "create snapshot parent",
        path: parent.to_path_buf(),
        source,
    })?;
    let name = snapshot_root
        .file_name()
        .ok_or_else(|| SnapshotError::InvalidConfig("snapshot root must have a name".to_owned()))?
        .to_string_lossy();
    Ok(parent.join(format!(".{name}.codetwo-staging-{}", Uuid::new_v4())))
}

fn publish_staging(staging: &Path, destination: &Path) -> io::Result<()> {
    if destination.exists() {
        let mut entries = fs::read_dir(destination)?;
        if entries.next().transpose()?.is_some() {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "snapshot root is not empty",
            ));
        }
        fs::remove_dir(destination)?;
    }
    fs::rename(staging, destination)
}

fn cleanup_staging(staging: &Path) {
    let _ = fs::remove_dir_all(staging);
}

struct IgnoreMatcher {
    matcher: Gitignore,
}

impl IgnoreMatcher {
    fn new(root: &Path) -> Result<Self, String> {
        let mut builder = GitignoreBuilder::new(root);
        for name in BUILTIN_IGNORES {
            builder
                .add_line(None, &format!("{name}/"))
                .map_err(|error| error.to_string())?;
        }
        builder
            .add_line(None, ".codetwoignore")
            .map_err(|error| error.to_string())?;
        let ignore_file = root.join(".codetwoignore");
        if let Ok(metadata) = fs::symlink_metadata(&ignore_file) {
            if metadata.is_file() && !metadata.file_type().is_symlink() {
                if let Some(error) = builder.add(ignore_file) {
                    return Err(error.to_string());
                }
            }
        }
        builder
            .build()
            .map(|matcher| Self { matcher })
            .map_err(|error| error.to_string())
    }

    fn ignored(&self, path: &Path, is_dir: bool) -> bool {
        self.matcher
            .matched_path_or_any_parents(path, is_dir)
            .is_ignore()
    }
}

struct ScanResult {
    files: Vec<SnapshotFile>,
    not_covered: Vec<NotCoveredPath>,
}

fn scan_workspace(
    root: &Path,
    matcher: &IgnoreMatcher,
) -> Result<ScanResult, (RequiresRollbackDecision, Vec<NotCoveredPath>)> {
    let mut files = Vec::new();
    let mut not_covered = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(directory) = stack.pop() {
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(source) => {
                let rel = relative_for_report(root, &directory);
                let failure = RequiresRollbackDecision {
                    path: directory,
                    operation: "walk workspace".to_owned(),
                    reason: source.to_string(),
                };
                if !rel.is_empty() {
                    not_covered.push(NotCoveredPath {
                        path: rel,
                        reason: NotCoveredReason::Inaccessible,
                    });
                }
                return Err((failure, not_covered));
            }
        };
        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(source) => {
                    return Err((
                        RequiresRollbackDecision {
                            path: directory.clone(),
                            operation: "read workspace entry".to_owned(),
                            reason: source.to_string(),
                        },
                        not_covered,
                    ));
                }
            };
            let path = entry.path();
            let relative = relative_for_report(root, &path);
            let metadata = match fs::symlink_metadata(&path) {
                Ok(metadata) => metadata,
                Err(source) => {
                    not_covered.push(NotCoveredPath {
                        path: relative,
                        reason: NotCoveredReason::Inaccessible,
                    });
                    return Err((
                        RequiresRollbackDecision {
                            path,
                            operation: "inspect workspace entry".to_owned(),
                            reason: source.to_string(),
                        },
                        not_covered,
                    ));
                }
            };
            let is_dir = metadata.is_dir();
            if matcher.ignored(&path, is_dir) {
                not_covered.push(NotCoveredPath {
                    path: relative,
                    reason: NotCoveredReason::Ignored,
                });
                continue;
            }
            if metadata.file_type().is_symlink() {
                not_covered.push(NotCoveredPath {
                    path: relative,
                    reason: NotCoveredReason::Symlink,
                });
                continue;
            }
            if is_dir {
                stack.push(path);
                continue;
            }
            if !metadata.is_file() {
                not_covered.push(NotCoveredPath {
                    path: relative,
                    reason: NotCoveredReason::NonRegular,
                });
                continue;
            }
            let normalized = match validate_relative_path(&relative) {
                Ok(path) => path,
                Err(error) => {
                    return Err((
                        RequiresRollbackDecision {
                            path,
                            operation: "normalize workspace path".to_owned(),
                            reason: error.to_string(),
                        },
                        not_covered,
                    ));
                }
            };
            match metadata_for_file(&path, &normalized, &metadata) {
                Ok(file) => files.push(file),
                Err((failure, covered)) => {
                    if !covered {
                        not_covered.push(NotCoveredPath {
                            path: normalized,
                            reason: NotCoveredReason::Inaccessible,
                        });
                    }
                    return Err((failure, not_covered));
                }
            }
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    not_covered.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(ScanResult { files, not_covered })
}

fn metadata_for_file(
    path: &Path,
    normalized: &str,
    _metadata: &Metadata,
) -> Result<SnapshotFile, (RequiresRollbackDecision, bool)> {
    let mut file = match open_source_no_follow(path) {
        Ok(file) => file,
        Err(source) => {
            return Err((
                RequiresRollbackDecision {
                    path: path.to_path_buf(),
                    operation: "read workspace file".to_owned(),
                    reason: source.to_string(),
                },
                false,
            ))
        }
    };
    metadata_for_open_file(normalized, &mut file).map_err(|reason| {
        (
            RequiresRollbackDecision {
                path: path.to_path_buf(),
                operation: "hash workspace file".to_owned(),
                reason,
            },
            false,
        )
    })
}

fn metadata_for_persisted_file(path: &Path, normalized: &str) -> Result<SnapshotFile, String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("persisted snapshot content must not be a symlink".to_owned());
    }
    if !metadata.is_file() {
        return Err("persisted snapshot content must be a regular file".to_owned());
    }
    let mut file = open_source_no_follow(path).map_err(|error| error.to_string())?;
    metadata_for_open_file(normalized, &mut file)
}

fn metadata_for_open_file(normalized: &str, file: &mut File) -> Result<SnapshotFile, String> {
    file.seek(SeekFrom::Start(0))
        .map_err(|error| error.to_string())?;
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    Ok(SnapshotFile {
        path: normalized.to_owned(),
        size: metadata.len(),
        mtime: mtime_nanos(&metadata),
        mode: unix_mode(&metadata),
        blake3: hasher.finalize().to_hex().to_string(),
    })
}

fn open_source_no_follow(path: &Path) -> io::Result<File> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(path)?;
        let metadata = file.metadata()?;
        if !metadata.is_file() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "workspace entry is not a regular file",
            ));
        }
        Ok(file)
    }
    #[cfg(not(unix))]
    {
        let file = File::open(path)?;
        let metadata = file.metadata()?;
        if !metadata.is_file() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "workspace entry is not a regular file",
            ));
        }
        Ok(file)
    }
}

fn source_replacement_reason(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("workspace file was replaced by a symlink".to_owned());
    }
    if !metadata.is_file() {
        return Err("workspace file was replaced by a non-regular entry".to_owned());
    }
    Ok(())
}

fn compare_manifests(
    manifest: &SnapshotManifest,
    current: &[SnapshotFile],
    not_covered: Vec<NotCoveredPath>,
) -> SnapshotComparison {
    let before: BTreeMap<&str, &SnapshotFile> = manifest
        .files
        .iter()
        .map(|file| (file.path.as_str(), file))
        .collect();
    let after: BTreeMap<&str, &SnapshotFile> = current
        .iter()
        .map(|file| (file.path.as_str(), file))
        .collect();
    let mut paths = before
        .keys()
        .chain(after.keys())
        .copied()
        .collect::<Vec<_>>();
    paths.sort_unstable();
    paths.dedup();
    let mut changes = Vec::new();
    for path in paths {
        match (before.get(path), after.get(path)) {
            (None, Some(after)) => changes.push(SnapshotChange {
                path: path.to_owned(),
                kind: SnapshotChangeKind::Added,
                before: None,
                after: Some((*after).clone()),
            }),
            (Some(before), None) => changes.push(SnapshotChange {
                path: path.to_owned(),
                kind: SnapshotChangeKind::Deleted,
                before: Some((*before).clone()),
                after: None,
            }),
            (Some(before), Some(after)) if before != after => changes.push(SnapshotChange {
                path: path.to_owned(),
                kind: SnapshotChangeKind::Modified,
                before: Some((*before).clone()),
                after: Some((*after).clone()),
            }),
            _ => {}
        }
    }
    SnapshotComparison {
        changes,
        not_covered,
    }
}

fn relative_for_report(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .ok()
        .map(path_to_slash)
        .unwrap_or_else(|| path_to_slash(path))
}

fn path_to_slash(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().into_owned()),
            Component::CurDir => None,
            Component::ParentDir => Some("..".to_owned()),
            Component::RootDir | Component::Prefix(_) => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn validate_relative_path(path: &str) -> Result<String, SnapshotError> {
    if path.is_empty() || path.contains('\0') {
        return Err(SnapshotError::InvalidManifest(
            "manifest path must be non-empty and contain no NUL".to_owned(),
        ));
    }
    let normalized = path.replace('\\', "/");
    let candidate = Path::new(&normalized);
    let has_windows_drive = normalized.len() >= 3
        && normalized.as_bytes()[1] == b':'
        && normalized.as_bytes()[2] == b'/'
        && normalized.as_bytes()[0].is_ascii_alphabetic();
    if candidate.is_absolute() || has_windows_drive {
        return Err(SnapshotError::InvalidManifest(format!(
            "manifest path must be relative: {path}"
        )));
    }
    let mut components = Vec::new();
    for component in candidate.components() {
        match component {
            Component::Normal(value) => components.push(value.to_string_lossy().into_owned()),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(SnapshotError::InvalidManifest(format!(
                    "manifest path escapes root: {path}"
                )))
            }
        }
    }
    if components.is_empty() {
        return Err(SnapshotError::InvalidManifest(format!(
            "manifest path is not a file: {path}"
        )));
    }
    Ok(components.join("/"))
}

fn path_from_slash(path: &str) -> PathBuf {
    path.split('/').collect::<PathBuf>()
}

fn content_destination(snapshot_root: &Path, relative: &str) -> Result<PathBuf, SnapshotError> {
    let relative = validate_relative_path(relative)?;
    Ok(snapshot_root
        .join(CONTENT_DIR)
        .join(path_from_slash(&relative)))
}

fn validate_manifest(manifest: &SnapshotManifest) -> Result<(), SnapshotError> {
    if manifest.version != MANIFEST_VERSION {
        return Err(SnapshotError::InvalidManifest(format!(
            "unsupported manifest version {}",
            manifest.version
        )));
    }
    let mut previous = None;
    for file in &manifest.files {
        let normalized = validate_relative_path(&file.path)?;
        if normalized != file.path {
            return Err(SnapshotError::InvalidManifest(format!(
                "manifest path is not normalized: {}",
                file.path
            )));
        }
        if let Some(previous) = previous {
            if previous >= file.path.as_str() {
                return Err(SnapshotError::InvalidManifest(
                    "manifest files must be unique and sorted".to_owned(),
                ));
            }
        }
        if file.blake3.len() != 64 || !file.blake3.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(SnapshotError::InvalidManifest(format!(
                "invalid BLAKE3 digest for {}",
                file.path
            )));
        }
        previous = Some(file.path.as_str());
    }
    Ok(())
}

fn mtime_nanos(metadata: &Metadata) -> i64 {
    let modified = metadata.modified().unwrap_or(UNIX_EPOCH);
    match modified.duration_since(UNIX_EPOCH) {
        Ok(duration) => duration
            .as_secs()
            .saturating_mul(1_000_000_000)
            .saturating_add(u64::from(duration.subsec_nanos()))
            .min(i64::MAX as u64) as i64,
        Err(error) => {
            let duration = error.duration();
            let nanos = duration
                .as_secs()
                .saturating_mul(1_000_000_000)
                .saturating_add(u64::from(duration.subsec_nanos()));
            -(nanos.min(i64::MAX as u64) as i64)
        }
    }
}

fn unix_mode(metadata: &Metadata) -> Option<u32> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Some(metadata.mode())
    }
    #[cfg(not(unix))]
    {
        let _ = metadata;
        None
    }
}

fn preserve_snapshot_metadata(destination: &Path, source: &Metadata) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        let mut permissions = fs::metadata(destination)?.permissions();
        permissions.set_mode(source.mode());
        fs::set_permissions(destination, permissions)?;
    }
    set_file_mtime(destination, FileTime::from_last_modification_time(source))
}

fn platform_clone_file(source: &Path, destination: &Path) -> io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        // libc does not expose Apple's CLONE_NOFOLLOW on all supported SDK bindings. The value is
        // documented by clonefile(2); using it keeps this fd-based clone defensive on macOS too.
        const CLONE_NOFOLLOW: u32 = 0x0001;
        use std::os::fd::AsRawFd;
        use std::os::unix::fs::OpenOptionsExt;

        let source_file = open_source_no_follow(source)?;
        let source_metadata = source_file.metadata()?;
        if !source_metadata.is_file() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "clone source is not a regular file",
            ));
        }
        let parent = destination.parent().ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "clone destination has no parent",
            )
        })?;
        let destination_name = destination.file_name().ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "clone destination has no file name",
            )
        })?;
        let destination_name = CString::new(destination_name.as_encoded_bytes())
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "destination contains NUL"))?;
        let destination_dir = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW)
            .open(parent)?;
        // SAFETY: source and destination directory descriptors are live, and the basename is a
        // NUL-terminated string owned for the duration of the call. The kernel resolves the
        // source by fd, so a path symlink swap cannot redirect this clone.
        let result = unsafe {
            libc::fclonefileat(
                source_file.as_raw_fd(),
                destination_dir.as_raw_fd(),
                destination_name.as_ptr(),
                CLONE_NOFOLLOW,
            )
        };
        if result == 0 {
            Ok(())
        } else {
            Err(io::Error::last_os_error())
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (source, destination);
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "clonefile is only available on macOS",
        ))
    }
}
