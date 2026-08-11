//! Daemon-owned, no-follow registration of provider-declared Work artifacts.

use std::ffi::CString;
use std::fs::{self, File};
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

#[cfg(unix)]
use std::os::fd::{AsRawFd, FromRawFd};
#[cfg(unix)]
use std::os::unix::ffi::OsStrExt;

use thiserror::Error;

use crate::{Deliverable, DeliverableSaveResult, Store, StoreError, WorkMutationGuard};

pub const MAX_WORK_ARTIFACT_BYTES: u64 = 50 * 1024 * 1024;
const DELIVERABLES_DIR: &str = "Deliverables";

pub type ArtifactRegistration = DeliverableSaveResult;

#[derive(Debug, Error)]
pub enum WorkArtifactError {
    #[error("work store: {0}")]
    Store(#[from] StoreError),
    #[error("invalid Work artifact request: {0}")]
    Invalid(String),
    #[error("unsafe Work artifact path: {0}")]
    UnsafePath(String),
    #[error("unsupported Work artifact: {0}")]
    Unsupported(String),
    #[error("Work artifact changed while it was being registered")]
    Changed,
    #[error("filesystem {operation} failed: {source}")]
    Io {
        operation: &'static str,
        #[source]
        source: io::Error,
    },
}

#[derive(Clone)]
pub struct WorkArtifactService {
    store: Arc<Store>,
}

impl WorkArtifactService {
    pub fn new(store: Arc<Store>) -> Self {
        Self { store }
    }

    pub fn register(
        &self,
        task_id: &str,
        run_id: &str,
        relative_path: &str,
        guard: &WorkMutationGuard,
    ) -> Result<ArtifactRegistration, WorkArtifactError> {
        let path = normalize_artifact_path(relative_path)?;
        let mime = mime_for_path(Path::new(&path)).ok_or_else(|| {
            WorkArtifactError::Unsupported("file type is not previewable".to_owned())
        })?;
        let root = self.store.work_artifact_root(task_id, run_id)?;
        let root = canonical_root(&root)?;

        let mut file = open_artifact_no_follow(&root, &path)?;
        let before = file.metadata().map_err(|source| WorkArtifactError::Io {
            operation: "inspect artifact",
            source,
        })?;
        if !before.is_file() {
            return Err(WorkArtifactError::Unsupported(
                "artifact is not a regular file".to_owned(),
            ));
        }
        if before.len() > MAX_WORK_ARTIFACT_BYTES {
            return Err(WorkArtifactError::Unsupported(
                "artifact exceeds the 50 MiB registration limit".to_owned(),
            ));
        }
        let hash = hash_reader(&mut file)?;
        let after = file.metadata().map_err(|source| WorkArtifactError::Io {
            operation: "reinspect artifact",
            source,
        })?;
        let verify_hash = hash_reader(&mut file)?;
        if !same_file_stamp(&before, &after) || hash != verify_hash {
            return Err(WorkArtifactError::Changed);
        }

        // Reopen every component relative to the canonical Workspace root. This rejects a file
        // or parent directory swapped to a symlink between the first hash and persistence.
        let mut reopened = open_artifact_no_follow(&root, &path)?;
        let reopened_before = reopened
            .metadata()
            .map_err(|source| WorkArtifactError::Io {
                operation: "inspect reopened artifact",
                source,
            })?;
        let reopened_hash = hash_reader(&mut reopened)?;
        let reopened_after = reopened
            .metadata()
            .map_err(|source| WorkArtifactError::Io {
                operation: "reinspect reopened artifact",
                source,
            })?;
        if !same_file_stamp(&before, &reopened_before)
            || !same_file_stamp(&reopened_before, &reopened_after)
            || hash != reopened_hash
        {
            return Err(WorkArtifactError::Changed);
        }

        let deliverable = Deliverable {
            id: uuid::Uuid::new_v4().to_string(),
            task_id: task_id.to_owned(),
            run_id: run_id.to_owned(),
            path,
            mime: Some(mime.to_owned()),
            hash,
            version: 1,
            current: true,
            missing: false,
            created_at: 0,
            updated_at: 0,
        };
        let result = self.store.work_save_deliverable(deliverable, guard)?;
        Ok(result)
    }
}

fn normalize_artifact_path(value: &str) -> Result<String, WorkArtifactError> {
    if value.is_empty()
        || value.len() > 4096
        || value.trim() != value
        || value.contains('\\')
        || value.contains('\0')
    {
        return Err(WorkArtifactError::UnsafePath(
            "artifact path is malformed".to_owned(),
        ));
    }
    let path = Path::new(value);
    let drive_form = value.as_bytes().get(1) == Some(&b':')
        && value
            .as_bytes()
            .first()
            .is_some_and(|byte| byte.is_ascii_alphabetic());
    if path.is_absolute() || drive_form {
        return Err(WorkArtifactError::UnsafePath(
            "artifact path must be Workspace-relative".to_owned(),
        ));
    }
    let mut components = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => {
                let part = part.to_str().ok_or_else(|| {
                    WorkArtifactError::UnsafePath("artifact path is not UTF-8".to_owned())
                })?;
                components.push(part.to_owned());
            }
            _ => {
                return Err(WorkArtifactError::UnsafePath(
                    "artifact path contains traversal".to_owned(),
                ));
            }
        }
    }
    let normalized = components.join("/");
    if !normalized
        .strip_prefix(DELIVERABLES_DIR)
        .is_some_and(|suffix| suffix.starts_with('/') && suffix.len() > 1)
    {
        return Err(WorkArtifactError::UnsafePath(
            "artifact must be inside Deliverables/".to_owned(),
        ));
    }
    Ok(normalized)
}

fn canonical_root(root: &Path) -> Result<PathBuf, WorkArtifactError> {
    let metadata = fs::symlink_metadata(root).map_err(|source| WorkArtifactError::Io {
        operation: "inspect Workspace root",
        source,
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(WorkArtifactError::UnsafePath(
            "Workspace root is not a real directory".to_owned(),
        ));
    }
    fs::canonicalize(root).map_err(|source| WorkArtifactError::Io {
        operation: "canonicalize Workspace root",
        source,
    })
}

#[cfg(unix)]
fn open_artifact_no_follow(root: &Path, relative: &str) -> Result<File, WorkArtifactError> {
    let root_name = CString::new(root.as_os_str().as_bytes())
        .map_err(|_| WorkArtifactError::UnsafePath("Workspace root contains NUL".to_owned()))?;
    let root_fd = unsafe {
        libc::open(
            root_name.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
        )
    };
    if root_fd < 0 {
        return Err(WorkArtifactError::Io {
            operation: "open Workspace root",
            source: io::Error::last_os_error(),
        });
    }
    let mut directory = unsafe { File::from_raw_fd(root_fd) };
    let mut components = Path::new(relative).components().peekable();
    while let Some(Component::Normal(part)) = components.next() {
        let name = CString::new(part.as_bytes()).map_err(|_| {
            WorkArtifactError::UnsafePath("artifact component contains NUL".to_owned())
        })?;
        let last = components.peek().is_none();
        let flags = if last {
            libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC
        } else {
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC
        };
        let fd = unsafe { libc::openat(directory.as_raw_fd(), name.as_ptr(), flags) };
        if fd < 0 {
            return Err(WorkArtifactError::Io {
                operation: "open artifact component",
                source: io::Error::last_os_error(),
            });
        }
        let next = unsafe { File::from_raw_fd(fd) };
        if last {
            return Ok(next);
        }
        directory = next;
    }
    Err(WorkArtifactError::UnsafePath(
        "artifact path is empty".to_owned(),
    ))
}

#[cfg(not(unix))]
fn open_artifact_no_follow(root: &Path, relative: &str) -> Result<File, WorkArtifactError> {
    let candidate = root.join(relative);
    let canonical = fs::canonicalize(&candidate).map_err(|source| WorkArtifactError::Io {
        operation: "canonicalize artifact",
        source,
    })?;
    if !canonical.starts_with(root) {
        return Err(WorkArtifactError::UnsafePath(
            "artifact escapes Workspace".to_owned(),
        ));
    }
    File::open(canonical).map_err(|source| WorkArtifactError::Io {
        operation: "open artifact",
        source,
    })
}

fn hash_reader(file: &mut File) -> Result<String, WorkArtifactError> {
    file.seek(SeekFrom::Start(0))
        .map_err(|source| WorkArtifactError::Io {
            operation: "rewind artifact",
            source,
        })?;
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0_u8; 128 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|source| WorkArtifactError::Io {
                operation: "hash artifact",
                source,
            })?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

fn same_file_stamp(before: &fs::Metadata, after: &fs::Metadata) -> bool {
    if before.len() != after.len() || before.modified().ok() != after.modified().ok() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        before.dev() == after.dev() && before.ino() == after.ino()
    }
    #[cfg(not(unix))]
    {
        true
    }
}

fn mime_for_path(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    Some(match extension.as_str() {
        "md" | "markdown" => "text/markdown",
        "txt" | "text" => "text/plain",
        "html" | "htm" => "text/html",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => return None,
    })
}
