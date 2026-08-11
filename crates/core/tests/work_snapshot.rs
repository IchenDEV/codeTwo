use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

use codetwo_core::{
    SnapshotChangeKind, SnapshotConfig, SnapshotCopier, SnapshotError, SnapshotFile,
    SnapshotPreparation, SnapshotPreparationOptions, WorkspaceSnapshotService,
};
use tempfile::tempdir;

fn service(root: &Path, snapshot_root: &Path) -> WorkspaceSnapshotService {
    WorkspaceSnapshotService::new(SnapshotConfig::new(root, snapshot_root))
}

fn snapshot_from(preparation: SnapshotPreparation) -> codetwo_core::WorkspaceSnapshot {
    match preparation {
        SnapshotPreparation::Snapshot(snapshot) => snapshot,
        SnapshotPreparation::NoRollback(_) => panic!("expected snapshot"),
    }
}

#[test]
fn creates_manifest_with_metadata_hash_and_outside_root() {
    let workspace = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    fs::write(workspace.path().join("hello.txt"), b"hello").unwrap();
    let snapshot = snapshot_from(service(workspace.path(), &snapshot_root).create().unwrap());

    assert!(!snapshot.snapshot_root.starts_with(&snapshot.workspace_root));
    assert_eq!(snapshot.manifest.version, 1);
    assert_eq!(snapshot.manifest.files.len(), 1);
    let file = &snapshot.manifest.files[0];
    assert_eq!(file.path, "hello.txt");
    assert_eq!(file.size, 5);
    assert_eq!(file.blake3, blake3::hash(b"hello").to_hex().to_string());
    assert!(snapshot.manifest_path().is_file());
    assert_eq!(
        fs::read(snapshot.content_path("hello.txt").unwrap()).unwrap(),
        b"hello"
    );
    assert!(serde_json::from_slice::<serde_json::Value>(
        &fs::read(snapshot.manifest_path()).unwrap()
    )
    .is_ok());
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[test]
fn compare_reports_add_modify_delete_deterministically() {
    let workspace = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    fs::write(workspace.path().join("same.txt"), b"same").unwrap();
    fs::write(workspace.path().join("modify.txt"), b"before").unwrap();
    fs::write(workspace.path().join("delete.txt"), b"delete").unwrap();
    let snapshot = snapshot_from(service(workspace.path(), &snapshot_root).create().unwrap());

    fs::write(workspace.path().join("modify.txt"), b"after").unwrap();
    fs::remove_file(workspace.path().join("delete.txt")).unwrap();
    fs::write(workspace.path().join("add.txt"), b"add").unwrap();
    let comparison = service(workspace.path(), &snapshot_root)
        .compare(&snapshot)
        .unwrap();
    assert_eq!(
        comparison
            .changes
            .iter()
            .map(|change| (change.path.as_str(), change.kind))
            .collect::<Vec<_>>(),
        vec![
            ("add.txt", SnapshotChangeKind::Added),
            ("delete.txt", SnapshotChangeKind::Deleted),
            ("modify.txt", SnapshotChangeKind::Modified),
        ]
    );
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[test]
fn builtins_codetwoignore_and_symlinks_are_not_covered() {
    let workspace = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    for directory in [
        ".git",
        "node_modules",
        "target",
        "dist",
        "build",
        ".next",
        ".cache",
    ] {
        fs::create_dir_all(workspace.path().join(directory)).unwrap();
        fs::write(
            workspace.path().join(directory).join("generated.txt"),
            b"untouched",
        )
        .unwrap();
    }
    fs::write(workspace.path().join(".codetwoignore"), "custom/").unwrap();
    fs::create_dir_all(workspace.path().join("custom")).unwrap();
    fs::write(
        workspace.path().join("custom").join("ignored.txt"),
        b"untouched",
    )
    .unwrap();
    fs::write(workspace.path().join("kept.txt"), b"kept").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink("kept.txt", workspace.path().join("link.txt")).unwrap();

    let snapshot = snapshot_from(service(workspace.path(), &snapshot_root).create().unwrap());
    assert_eq!(
        snapshot
            .manifest
            .files
            .iter()
            .map(|file| file.path.as_str())
            .collect::<Vec<_>>(),
        vec!["kept.txt"]
    );
    assert!(snapshot
        .not_covered
        .iter()
        .any(|item| item.path == ".codetwoignore"));
    assert!(snapshot.not_covered.iter().any(|item| item.path == "dist"));
    #[cfg(unix)]
    assert!(snapshot
        .not_covered
        .iter()
        .any(|item| item.path == "link.txt"));
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[derive(Clone)]
struct RecordingCopier {
    clone_attempts: Arc<Mutex<usize>>,
    copies: Arc<Mutex<usize>>,
    clone_error: bool,
}

impl SnapshotCopier for RecordingCopier {
    fn clone_file(&self, _source: &Path, _destination: &Path) -> io::Result<()> {
        *self.clone_attempts.lock().unwrap() += 1;
        if self.clone_error {
            Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "forced clone failure",
            ))
        } else {
            unreachable!("test copier only exercises fallback")
        }
    }

    fn copy_file(&self, source: &Path, destination: &Path) -> io::Result<()> {
        *self.copies.lock().unwrap() += 1;
        fs::copy(source, destination).map(|_| ())
    }

    fn copy_file_from_open(
        &self,
        _source: &Path,
        source_file: &mut fs::File,
        destination: &Path,
    ) -> io::Result<()> {
        use std::io::{Seek, SeekFrom};
        *self.copies.lock().unwrap() += 1;
        source_file.seek(SeekFrom::Start(0))?;
        let mut output = fs::File::create(destination)?;
        io::copy(source_file, &mut output)?;
        Ok(())
    }
}

#[test]
fn injected_clone_failure_uses_copy_fallback() {
    let workspace = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    fs::write(workspace.path().join("hello.txt"), b"hello").unwrap();
    let attempts = Arc::new(Mutex::new(0));
    let copies = Arc::new(Mutex::new(0));
    let copier = RecordingCopier {
        clone_attempts: attempts.clone(),
        copies: copies.clone(),
        clone_error: true,
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let source = workspace.path().join("hello.txt");
        let mut permissions = fs::metadata(&source).unwrap().permissions();
        permissions.set_mode(0o640);
        fs::set_permissions(&source, permissions).unwrap();
        filetime::set_file_mtime(
            &source,
            filetime::FileTime::from_unix_time(1_600_000_000, 123_000_000),
        )
        .unwrap();
    }
    let snapshot_service = service(workspace.path(), &snapshot_root).with_copier(copier);
    let snapshot = snapshot_from(snapshot_service.create().unwrap());
    assert_eq!(*attempts.lock().unwrap(), 1);
    assert_eq!(*copies.lock().unwrap(), 1);
    assert_eq!(
        fs::read(snapshot.content_path("hello.txt").unwrap()).unwrap(),
        b"hello"
    );
    let comparison = service(workspace.path(), &snapshot_root)
        .compare(&snapshot)
        .unwrap();
    assert!(comparison.changes.is_empty());
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let source = fs::symlink_metadata(workspace.path().join("hello.txt")).unwrap();
        let persisted = fs::symlink_metadata(snapshot.content_path("hello.txt").unwrap()).unwrap();
        assert_eq!(source.mode(), persisted.mode());
        assert_eq!(snapshot.manifest.files[0].mode, Some(source.mode()));
        assert_eq!(snapshot.manifest.files[0].mtime, {
            let modified = source.modified().unwrap();
            modified
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
                .saturating_mul(1_000_000_000)
                .saturating_add(u64::from(
                    modified
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .subsec_nanos(),
                )) as i64
        });
    }
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[test]
fn snapshot_failure_blocks_or_returns_typed_no_rollback_preparation() {
    let workspace = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    fs::write(workspace.path().join("hello.txt"), b"hello").unwrap();
    let copier = RecordingCopier {
        clone_attempts: Arc::new(Mutex::new(0)),
        copies: Arc::new(Mutex::new(0)),
        clone_error: true,
    };
    let failing = FailingCopyCopier;
    let blocked = service(workspace.path(), &snapshot_root)
        .with_copier(failing.clone())
        .create()
        .unwrap_err();
    assert!(matches!(
        blocked,
        SnapshotError::RequiresRollbackDecision(_)
    ));

    let allowed = service(workspace.path(), &snapshot_root)
        .with_copier(failing)
        .create_with_options(SnapshotPreparationOptions {
            allow_without_rollback: true,
        })
        .unwrap();
    assert!(matches!(allowed, SnapshotPreparation::NoRollback(_)));
    assert!(
        !snapshot_root.exists(),
        "no-rollback preparation must not persist a snapshot"
    );
    let _ = copier;
}

#[derive(Clone)]
struct MutatingCloneCopier;

impl SnapshotCopier for MutatingCloneCopier {
    fn clone_file(&self, source: &Path, _destination: &Path) -> io::Result<()> {
        fs::write(source, b"after").unwrap();
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "forced clone fallback",
        ))
    }

    fn copy_file_from_open(
        &self,
        source: &Path,
        source_file: &mut std::fs::File,
        destination: &Path,
    ) -> io::Result<()> {
        use std::io::{Seek, SeekFrom};
        source_file.seek(SeekFrom::Start(0))?;
        let mut output = fs::File::create(destination)?;
        io::copy(source_file, &mut output)?;
        fs::write(source, b"final")?;
        Ok(())
    }
}

#[test]
fn manifest_describes_persisted_bytes_when_source_changes_during_copy() {
    let workspace = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    fs::write(workspace.path().join("changing.txt"), b"before").unwrap();
    let snapshot = snapshot_from(
        service(workspace.path(), &snapshot_root)
            .with_copier(MutatingCloneCopier)
            .create()
            .unwrap(),
    );
    let persisted = fs::read(snapshot.content_path("changing.txt").unwrap()).unwrap();
    assert_eq!(persisted, b"after");
    assert_eq!(
        snapshot.manifest.files[0].blake3,
        blake3::hash(&persisted).to_hex().to_string()
    );
    let comparison = service(workspace.path(), &snapshot_root)
        .compare(&snapshot)
        .unwrap();
    assert_eq!(comparison.changes.len(), 1);
    assert_eq!(comparison.changes[0].kind, SnapshotChangeKind::Modified);
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[derive(Clone)]
struct SymlinkSwapCopier {
    sentinel: PathBuf,
}

impl SnapshotCopier for SymlinkSwapCopier {
    fn clone_file(&self, source: &Path, _destination: &Path) -> io::Result<()> {
        fs::remove_file(source).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&self.sentinel, source).unwrap();
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "forced clone failure after symlink swap",
        ))
    }

    fn copy_file_from_open(
        &self,
        _source: &Path,
        _source_file: &mut fs::File,
        _destination: &Path,
    ) -> io::Result<()> {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "copy must not run after symlink replacement",
        ))
    }
}

#[cfg(unix)]
#[test]
fn source_symlink_replacement_blocks_and_never_persists_sentinel() {
    let workspace = tempdir().unwrap();
    let outside = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    let source = workspace.path().join("changing.txt");
    let sentinel = outside.path().join("sentinel.txt");
    fs::write(&source, b"before").unwrap();
    fs::write(&sentinel, b"outside-secret").unwrap();
    let blocked = service(workspace.path(), &snapshot_root)
        .with_copier(SymlinkSwapCopier {
            sentinel: sentinel.clone(),
        })
        .create()
        .unwrap_err();
    assert!(matches!(
        blocked,
        SnapshotError::RequiresRollbackDecision(_)
    ));
    assert!(!snapshot_root.exists());
    assert_eq!(fs::read(&sentinel).unwrap(), b"outside-secret");
}

#[test]
fn compare_rejects_snapshot_root_mismatch_and_provider_cwd_destination() {
    let workspace = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    fs::write(workspace.path().join("hello.txt"), b"hello").unwrap();
    let mut snapshot = snapshot_from(service(workspace.path(), &snapshot_root).create().unwrap());
    snapshot.snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join("different-snapshot");
    let mismatch = service(workspace.path(), &snapshot_root)
        .compare(&snapshot)
        .unwrap_err();
    assert!(matches!(mismatch, SnapshotError::InvalidConfig(_)));
    fs::remove_dir_all(&snapshot_root).unwrap();

    let provider = tempdir().unwrap();
    let nested_snapshot = provider.path().join("snapshot");
    let error = WorkspaceSnapshotService::new(
        SnapshotConfig::new(workspace.path(), &nested_snapshot).provider_cwd(provider.path()),
    )
    .create()
    .unwrap_err();
    assert!(matches!(error, SnapshotError::InvalidConfig(_)));
}

#[test]
fn rollback_restores_modified_deleted_and_removes_only_added() {
    let workspace = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    let modify = workspace.path().join("modify.txt");
    let deleted = workspace.path().join("deleted.txt");
    fs::write(&modify, b"original").unwrap();
    fs::write(&deleted, b"to restore").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(&modify).unwrap().permissions();
        permissions.set_mode(0o640);
        fs::set_permissions(&modify, permissions).unwrap();
        filetime::set_file_mtime(
            &modify,
            filetime::FileTime::from_unix_time(1_600_000_001, 321_000_000),
        )
        .unwrap();
    }
    let snapshot = snapshot_from(service(workspace.path(), &snapshot_root).create().unwrap());
    let before_modify = snapshot
        .manifest
        .files
        .iter()
        .find(|file| file.path == "modify.txt")
        .unwrap()
        .clone();
    fs::write(&modify, b"changed by provider").unwrap();
    fs::remove_file(&deleted).unwrap();
    fs::write(workspace.path().join("added.txt"), b"provider output").unwrap();
    let comparison = service(workspace.path(), &snapshot_root)
        .compare(&snapshot)
        .unwrap();
    let report = service(workspace.path(), &snapshot_root)
        .rollback(&snapshot, &comparison)
        .unwrap();
    assert_eq!(report.restored, vec!["deleted.txt", "modify.txt"]);
    assert_eq!(report.removed, vec!["added.txt"]);
    assert!(report.conflicts.is_empty());
    assert_eq!(fs::read(&modify).unwrap(), b"original");
    assert_eq!(fs::read(&deleted).unwrap(), b"to restore");
    assert!(!workspace.path().join("added.txt").exists());
    let after_modify = fs::symlink_metadata(&modify).unwrap();
    assert_eq!(after_modify.len(), before_modify.size);
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        assert_eq!(after_modify.mode(), before_modify.mode.unwrap());
    }
    let clean = service(workspace.path(), &snapshot_root)
        .compare(&snapshot)
        .unwrap();
    assert!(clean.changes.is_empty());
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[test]
fn rollback_paths_restores_only_reviewed_selection() {
    let workspace = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    let selected = workspace.path().join("selected.txt");
    let untouched = workspace.path().join("untouched.txt");
    let added = workspace.path().join("added.txt");
    fs::write(&selected, b"selected before").unwrap();
    fs::write(&untouched, b"untouched before").unwrap();
    let snapshot = snapshot_from(service(workspace.path(), &snapshot_root).create().unwrap());

    fs::write(&selected, b"selected after").unwrap();
    fs::write(&untouched, b"untouched after").unwrap();
    fs::write(&added, b"added after").unwrap();
    let comparison = service(workspace.path(), &snapshot_root)
        .compare(&snapshot)
        .unwrap();

    let report = service(workspace.path(), &snapshot_root)
        .rollback_paths(&snapshot, &comparison, &["selected.txt".to_owned()])
        .unwrap();

    assert_eq!(report.restored, vec!["selected.txt"]);
    assert!(report.removed.is_empty());
    assert!(report.conflicts.is_empty());
    assert_eq!(fs::read(&selected).unwrap(), b"selected before");
    assert_eq!(fs::read(&untouched).unwrap(), b"untouched after");
    assert_eq!(fs::read(&added).unwrap(), b"added after");
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[test]
fn rollback_paths_rejects_path_missing_from_reviewed_comparison() {
    let workspace = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    let changed = workspace.path().join("changed.txt");
    fs::write(&changed, b"before").unwrap();
    let snapshot = snapshot_from(service(workspace.path(), &snapshot_root).create().unwrap());
    fs::write(&changed, b"after").unwrap();
    let comparison = service(workspace.path(), &snapshot_root)
        .compare(&snapshot)
        .unwrap();

    let error = service(workspace.path(), &snapshot_root)
        .rollback_paths(&snapshot, &comparison, &["not-reviewed.txt".to_owned()])
        .unwrap_err();

    assert!(matches!(error, SnapshotError::RollbackRejected(_)));
    assert_eq!(fs::read(&changed).unwrap(), b"after");
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[cfg(unix)]
#[test]
fn rollback_ignored_symlink_and_outside_paths_are_untouched() {
    let workspace = tempdir().unwrap();
    let outside = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    fs::write(workspace.path().join("kept.txt"), b"before").unwrap();
    fs::create_dir_all(workspace.path().join("dist")).unwrap();
    let ignored = workspace.path().join("dist/generated.txt");
    fs::write(&ignored, b"ignored-before").unwrap();
    let sentinel = outside.path().join("sentinel.txt");
    fs::write(&sentinel, b"outside-before").unwrap();
    std::os::unix::fs::symlink(&sentinel, workspace.path().join("link.txt")).unwrap();
    let snapshot = snapshot_from(service(workspace.path(), &snapshot_root).create().unwrap());
    fs::write(workspace.path().join("kept.txt"), b"provider-change").unwrap();
    fs::write(&ignored, b"ignored-after").unwrap();
    fs::write(&sentinel, b"outside-after").unwrap();
    let comparison = service(workspace.path(), &snapshot_root)
        .compare(&snapshot)
        .unwrap();
    let report = service(workspace.path(), &snapshot_root)
        .rollback(&snapshot, &comparison)
        .unwrap();
    assert_eq!(
        fs::read(workspace.path().join("kept.txt")).unwrap(),
        b"before"
    );
    assert_eq!(fs::read(&ignored).unwrap(), b"ignored-after");
    assert_eq!(fs::read(&sentinel).unwrap(), b"outside-after");
    assert!(fs::symlink_metadata(workspace.path().join("link.txt"))
        .unwrap()
        .file_type()
        .is_symlink());
    assert!(report
        .not_covered
        .iter()
        .any(|item| item.path == "link.txt"));
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[test]
fn rollback_rejects_manifest_traversal_before_touching_workspace() {
    let workspace = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    fs::write(workspace.path().join("kept.txt"), b"kept").unwrap();
    let mut snapshot = snapshot_from(service(workspace.path(), &snapshot_root).create().unwrap());
    snapshot.manifest.files.push(SnapshotFile {
        path: "../outside.txt".to_owned(),
        size: 0,
        mtime: 0,
        mode: None,
        blake3: blake3::hash(b"").to_hex().to_string(),
    });
    let error = service(workspace.path(), &snapshot_root)
        .rollback(
            &snapshot,
            &codetwo_core::SnapshotComparison {
                changes: Vec::new(),
                not_covered: Vec::new(),
            },
        )
        .unwrap_err();
    assert!(matches!(error, SnapshotError::InvalidManifest(_)));
    assert_eq!(
        fs::read(workspace.path().join("kept.txt")).unwrap(),
        b"kept"
    );
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[test]
fn rollback_rejects_windows_drive_form_path_without_touching_workspace() {
    let workspace = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    fs::write(workspace.path().join("kept.txt"), b"kept").unwrap();
    let snapshot = snapshot_from(service(workspace.path(), &snapshot_root).create().unwrap());
    let error = service(workspace.path(), &snapshot_root)
        .rollback(
            &snapshot,
            &codetwo_core::SnapshotComparison {
                changes: vec![codetwo_core::SnapshotChange {
                    path: "C:/outside.txt".to_owned(),
                    kind: SnapshotChangeKind::Added,
                    before: None,
                    after: Some(SnapshotFile {
                        path: "C:/outside.txt".to_owned(),
                        size: 0,
                        mtime: 0,
                        mode: None,
                        blake3: blake3::hash(b"").to_hex().to_string(),
                    }),
                }],
                not_covered: Vec::new(),
            },
        )
        .unwrap_err();
    assert!(matches!(
        error,
        SnapshotError::InvalidManifest(_) | SnapshotError::RollbackRejected(_)
    ));
    assert_eq!(
        fs::read(workspace.path().join("kept.txt")).unwrap(),
        b"kept"
    );
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[cfg(unix)]
#[test]
fn rollback_symlink_replacement_is_a_conflict_and_preserves_link() {
    let workspace = tempdir().unwrap();
    let outside = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    let target = workspace.path().join("target.txt");
    let sentinel = outside.path().join("sentinel.txt");
    fs::write(&target, b"before").unwrap();
    fs::write(&sentinel, b"outside").unwrap();
    let snapshot = snapshot_from(service(workspace.path(), &snapshot_root).create().unwrap());
    fs::write(&target, b"provider-change").unwrap();
    let comparison = service(workspace.path(), &snapshot_root)
        .compare(&snapshot)
        .unwrap();
    fs::remove_file(&target).unwrap();
    std::os::unix::fs::symlink(&sentinel, &target).unwrap();
    let report = service(workspace.path(), &snapshot_root)
        .rollback(&snapshot, &comparison)
        .unwrap();
    assert!(!report.conflicts.is_empty());
    assert!(fs::symlink_metadata(&target)
        .unwrap()
        .file_type()
        .is_symlink());
    assert_eq!(fs::read(&sentinel).unwrap(), b"outside");
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[test]
fn rollback_stale_comparison_conflict_preserves_later_user_edit() {
    let workspace = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    let target = workspace.path().join("target.txt");
    fs::write(&target, b"before").unwrap();
    let snapshot = snapshot_from(service(workspace.path(), &snapshot_root).create().unwrap());
    fs::write(&target, b"provider-change").unwrap();
    let comparison = service(workspace.path(), &snapshot_root)
        .compare(&snapshot)
        .unwrap();
    fs::write(&target, b"later-user-edit").unwrap();
    let report = service(workspace.path(), &snapshot_root)
        .rollback(&snapshot, &comparison)
        .unwrap();
    assert!(report.restored.is_empty());
    assert!(!report.conflicts.is_empty());
    assert_eq!(fs::read(&target).unwrap(), b"later-user-edit");
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[derive(Clone)]
struct MutateBeforeApplyHook {
    target: PathBuf,
    fired: Arc<AtomicBool>,
}

impl codetwo_core::RollbackHook for MutateBeforeApplyHook {
    fn before_apply(&self, path: &str) {
        if path == "target.txt" && !self.fired.swap(true, Ordering::SeqCst) {
            fs::write(&self.target, b"later-user-edit").unwrap();
        }
    }
}

#[test]
fn rollback_hook_mutation_after_planning_is_conflict() {
    let workspace = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    let target = workspace.path().join("target.txt");
    fs::write(&target, b"before").unwrap();
    let snapshot = snapshot_from(service(workspace.path(), &snapshot_root).create().unwrap());
    fs::write(&target, b"provider-change").unwrap();
    let comparison = service(workspace.path(), &snapshot_root)
        .compare(&snapshot)
        .unwrap();
    let report = WorkspaceSnapshotService::new(
        SnapshotConfig::new(workspace.path(), &snapshot_root).rollback_hook(
            MutateBeforeApplyHook {
                target: target.clone(),
                fired: Arc::new(AtomicBool::new(false)),
            },
        ),
    )
    .rollback(&snapshot, &comparison)
    .unwrap();
    assert!(report.restored.is_empty());
    assert!(!report.conflicts.is_empty());
    assert_eq!(fs::read(target).unwrap(), b"later-user-edit");
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[cfg(unix)]
#[derive(Clone)]
struct ParentSymlinkSwapHook {
    parent: PathBuf,
    moved: PathBuf,
    outside: PathBuf,
    fired: Arc<AtomicBool>,
}

#[cfg(unix)]
impl codetwo_core::RollbackHook for ParentSymlinkSwapHook {
    fn before_apply(&self, path: &str) {
        if path == "nested/target.txt" && !self.fired.swap(true, Ordering::SeqCst) {
            fs::rename(&self.parent, &self.moved).unwrap();
            std::os::unix::fs::symlink(&self.outside, &self.parent).unwrap();
        }
    }
}

#[cfg(unix)]
#[test]
fn rollback_parent_symlink_swap_conflicts_without_writing_outside() {
    let workspace = tempdir().unwrap();
    let outside = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    let parent = workspace.path().join("nested");
    let target = parent.join("target.txt");
    fs::create_dir_all(&parent).unwrap();
    fs::write(&target, b"before").unwrap();
    let sentinel_parent = outside.path().join("nested");
    fs::create_dir_all(&sentinel_parent).unwrap();
    let sentinel = sentinel_parent.join("target.txt");
    fs::write(&sentinel, b"outside-sentinel").unwrap();
    let snapshot = snapshot_from(service(workspace.path(), &snapshot_root).create().unwrap());
    fs::write(&target, b"provider-change").unwrap();
    let comparison = service(workspace.path(), &snapshot_root)
        .compare(&snapshot)
        .unwrap();
    let moved = workspace.path().join("nested-moved");
    let report = WorkspaceSnapshotService::new(
        SnapshotConfig::new(workspace.path(), &snapshot_root).rollback_hook(
            ParentSymlinkSwapHook {
                parent: parent.clone(),
                moved,
                outside: sentinel_parent,
                fired: Arc::new(AtomicBool::new(false)),
            },
        ),
    )
    .rollback(&snapshot, &comparison)
    .unwrap();
    assert!(report.restored.is_empty());
    assert!(!report.conflicts.is_empty());
    assert_eq!(fs::read(sentinel).unwrap(), b"outside-sentinel");
    assert!(fs::symlink_metadata(&parent)
        .unwrap()
        .file_type()
        .is_symlink());
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[derive(Clone)]
struct MutateBeforeCommitHook {
    target: PathBuf,
    fired: Arc<AtomicBool>,
}

impl codetwo_core::RollbackHook for MutateBeforeCommitHook {
    fn before_apply(&self, _path: &str) {}

    fn before_commit(&self, path: &str) {
        if path == "target.txt" && !self.fired.swap(true, Ordering::SeqCst) {
            fs::write(&self.target, b"later-user-edit").unwrap();
        }
    }
}

#[test]
fn rollback_before_commit_mutation_is_conflict_and_preserves_edit() {
    let workspace = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    let target = workspace.path().join("target.txt");
    fs::write(&target, b"before").unwrap();
    let snapshot = snapshot_from(service(workspace.path(), &snapshot_root).create().unwrap());
    fs::write(&target, b"provider-change").unwrap();
    let comparison = service(workspace.path(), &snapshot_root)
        .compare(&snapshot)
        .unwrap();
    let report = WorkspaceSnapshotService::new(
        SnapshotConfig::new(workspace.path(), &snapshot_root).rollback_hook(
            MutateBeforeCommitHook {
                target: target.clone(),
                fired: Arc::new(AtomicBool::new(false)),
            },
        ),
    )
    .rollback(&snapshot, &comparison)
    .unwrap();
    assert!(report.restored.is_empty());
    assert!(!report.conflicts.is_empty());
    assert_eq!(fs::read(target).unwrap(), b"later-user-edit");
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[cfg(unix)]
#[derive(Clone)]
struct AddedParentSymlinkSwapHook {
    parent: PathBuf,
    moved: PathBuf,
    outside: PathBuf,
    fired: Arc<AtomicBool>,
}

#[cfg(unix)]
impl codetwo_core::RollbackHook for AddedParentSymlinkSwapHook {
    fn before_apply(&self, path: &str) {
        if path == "nested/add.txt" && !self.fired.swap(true, Ordering::SeqCst) {
            fs::rename(&self.parent, &self.moved).unwrap();
            std::os::unix::fs::symlink(&self.outside, &self.parent).unwrap();
        }
    }
}

#[cfg(unix)]
#[test]
fn rollback_added_parent_symlink_swap_does_not_unlink_outside() {
    let workspace = tempdir().unwrap();
    let outside = tempdir().unwrap();
    let snapshot_root = workspace
        .path()
        .parent()
        .unwrap()
        .join(format!("codetwo-snapshot-test-{}", uuid::Uuid::new_v4()));
    let parent = workspace.path().join("nested");
    fs::create_dir_all(&parent).unwrap();
    fs::write(parent.join("stable.txt"), b"stable").unwrap();
    let snapshot = snapshot_from(service(workspace.path(), &snapshot_root).create().unwrap());
    let added = parent.join("add.txt");
    fs::write(&added, b"provider-output").unwrap();
    let outside_file = outside.path().join("add.txt");
    fs::write(&outside_file, b"outside-sentinel").unwrap();
    let comparison = service(workspace.path(), &snapshot_root)
        .compare(&snapshot)
        .unwrap();
    let moved = workspace.path().join("nested-moved");
    let report = WorkspaceSnapshotService::new(
        SnapshotConfig::new(workspace.path(), &snapshot_root).rollback_hook(
            AddedParentSymlinkSwapHook {
                parent: parent.clone(),
                moved,
                outside: outside.path().to_path_buf(),
                fired: Arc::new(AtomicBool::new(false)),
            },
        ),
    )
    .rollback(&snapshot, &comparison)
    .unwrap();
    assert!(report.removed.is_empty());
    assert!(!report.conflicts.is_empty());
    assert_eq!(fs::read(outside_file).unwrap(), b"outside-sentinel");
    assert!(fs::symlink_metadata(&parent)
        .unwrap()
        .file_type()
        .is_symlink());
    fs::remove_dir_all(snapshot_root).unwrap();
}

#[derive(Clone)]
struct FailingCopyCopier;

impl SnapshotCopier for FailingCopyCopier {
    fn clone_file(&self, _source: &Path, _destination: &Path) -> io::Result<()> {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "forced clone failure",
        ))
    }

    fn copy_file_from_open(
        &self,
        _source: &Path,
        _source_file: &mut fs::File,
        _destination: &Path,
    ) -> io::Result<()> {
        Err(io::Error::new(io::ErrorKind::Other, "forced copy failure"))
    }
}
