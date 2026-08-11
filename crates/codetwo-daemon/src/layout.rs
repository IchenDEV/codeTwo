use std::fs::{self, File, OpenOptions};
use std::io;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use uuid::Uuid;

const DATA_DIR_ENV: &str = "CODETWO_DATA_DIR";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DataLayout {
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    pub socket_path: PathBuf,
    pub lock_path: PathBuf,
}

impl DataLayout {
    pub fn for_data_dir(data_dir: impl Into<PathBuf>) -> Self {
        let data_dir = data_dir.into();
        Self {
            db_path: data_dir.join("codetwo.db"),
            socket_path: data_dir.join("daemon.sock"),
            lock_path: data_dir.join("daemon.lock"),
            data_dir,
        }
    }

    pub fn from_env() -> Self {
        Self::for_data_dir(canonical_data_dir())
    }
}

pub fn canonical_data_dir() -> PathBuf {
    if let Some(path) = std::env::var_os(DATA_DIR_ENV) {
        return PathBuf::from(path);
    }
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    if cfg!(target_os = "macos") {
        home.join("Library/Application Support/dev.codetwo.app")
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".local/share"))
            .join("dev.codetwo.app")
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LegacyDataDecision {
    None,
    CopyLegacyToCanonical { legacy: PathBuf, canonical: PathBuf },
    CanonicalAlreadyNewer { canonical: PathBuf, legacy: PathBuf },
    LegacyAppearsNewer { canonical: PathBuf, legacy: PathBuf },
}

pub fn inspect_legacy_data(canonical: impl AsRef<Path>) -> io::Result<LegacyDataDecision> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    inspect_legacy_data_from(&home, canonical.as_ref())
}

fn inspect_legacy_data_from(home: &Path, canonical: &Path) -> io::Result<LegacyDataDecision> {
    let canonical = canonical.to_owned();
    let legacy = home.join(".codetwo");
    if !legacy.exists() {
        return Ok(LegacyDataDecision::None);
    }
    if !canonical.exists() {
        return Ok(LegacyDataDecision::CopyLegacyToCanonical { legacy, canonical });
    }
    let legacy_time = modified_time(&legacy)?;
    let canonical_time = modified_time(&canonical)?;
    if legacy_time > canonical_time {
        Ok(LegacyDataDecision::LegacyAppearsNewer { canonical, legacy })
    } else {
        Ok(LegacyDataDecision::CanonicalAlreadyNewer { canonical, legacy })
    }
}

fn modified_time(path: &Path) -> io::Result<SystemTime> {
    fs::symlink_metadata(path).and_then(|metadata| metadata.modified())
}

/// Copy a legacy data tree into a new canonical location. The source is never changed, an existing
/// canonical tree is never merged or overwritten, and the final directory appears through one
/// rename only after the complete staging copy succeeds.
pub fn copy_legacy_data(decision: &LegacyDataDecision) -> io::Result<bool> {
    let LegacyDataDecision::CopyLegacyToCanonical { legacy, canonical } = decision else {
        return Ok(false);
    };
    if canonical.exists() {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "canonical data appeared after the import decision",
        ));
    }
    let source_metadata = fs::symlink_metadata(legacy)?;
    if source_metadata.file_type().is_symlink() || !source_metadata.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "legacy data root must be a real directory",
        ));
    }
    let parent = canonical.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "canonical data directory has no parent",
        )
    })?;
    fs::create_dir_all(parent)?;
    let leaf = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("codetwo");
    let staging = parent.join(format!(".{leaf}.import-{}", Uuid::new_v4().simple()));
    let copied = copy_tree(legacy, &staging).and_then(|()| {
        fs::set_permissions(&staging, fs::Permissions::from_mode(0o700))?;
        fs::rename(&staging, canonical)
    });
    if let Err(error) = copied {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    Ok(true)
}

fn copy_tree(source: &Path, destination: &Path) -> io::Result<()> {
    fs::create_dir(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let name = entry.file_name();
        if name == "daemon.sock" || name == "daemon.lock" {
            continue;
        }
        let source_path = entry.path();
        let destination_path = destination.join(&name);
        let metadata = fs::symlink_metadata(&source_path)?;
        if metadata.file_type().is_symlink() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("legacy import refuses symlink: {}", source_path.display()),
            ));
        }
        if metadata.is_dir() {
            copy_tree(&source_path, &destination_path)?;
        } else if metadata.is_file() {
            let mut input = File::open(&source_path)?;
            let mut output = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&destination_path)?;
            io::copy(&mut input, &mut output)?;
        } else {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!(
                    "legacy import refuses special file: {}",
                    source_path.display()
                ),
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout_uses_one_database_and_transport_root() {
        let root = tempfile::tempdir().unwrap();
        let layout = DataLayout::for_data_dir(root.path());
        assert_eq!(layout.db_path, root.path().join("codetwo.db"));
        assert_eq!(layout.socket_path, root.path().join("daemon.sock"));
        assert_eq!(layout.lock_path, root.path().join("daemon.lock"));
    }

    #[test]
    fn legacy_copy_is_atomic_non_destructive_and_one_time() {
        let root = tempfile::tempdir().unwrap();
        let legacy = root.path().join(".codetwo");
        let canonical = root
            .path()
            .join("Library/Application Support/dev.codetwo.app");
        fs::create_dir(&legacy).unwrap();
        fs::write(legacy.join("codetwo.db"), b"legacy database").unwrap();
        let decision = inspect_legacy_data_from(root.path(), &canonical).unwrap();
        assert!(matches!(
            decision,
            LegacyDataDecision::CopyLegacyToCanonical { .. }
        ));
        assert!(copy_legacy_data(&decision).unwrap());
        assert_eq!(
            fs::read(canonical.join("codetwo.db")).unwrap(),
            b"legacy database"
        );
        assert_eq!(
            fs::read(legacy.join("codetwo.db")).unwrap(),
            b"legacy database"
        );
        assert!(copy_legacy_data(&decision).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn legacy_copy_rejects_symlinks_without_publishing_partial_data() {
        use std::os::unix::fs::symlink;

        let root = tempfile::tempdir().unwrap();
        let legacy = root.path().join(".codetwo");
        let canonical = root.path().join("canonical");
        fs::create_dir(&legacy).unwrap();
        fs::write(legacy.join("kept.txt"), b"kept").unwrap();
        symlink(root.path().join("outside"), legacy.join("escape")).unwrap();
        let decision = LegacyDataDecision::CopyLegacyToCanonical {
            legacy,
            canonical: canonical.clone(),
        };
        assert_eq!(
            copy_legacy_data(&decision).unwrap_err().kind(),
            io::ErrorKind::InvalidInput
        );
        assert!(!canonical.exists());
        assert!(fs::read_dir(root.path()).unwrap().all(|entry| !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .contains(".import-")));
    }
}
