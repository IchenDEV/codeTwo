use fs2::FileExt;
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;

/// The file must never be unlinked: every contender must lock the same inode.
#[derive(Debug)]
pub(crate) struct DataDirLock {
    _file: File,
}

impl DataDirLock {
    pub(crate) fn acquire(data_dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir).map_err(|error| error.to_string())?;
        let path = data_dir.join("core.lock");
        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&path)
            .map_err(|error| {
                format!(
                    "cannot open Core ownership lock {}: {error}",
                    path.display()
                )
            })?;
        if let Err(error) = file.try_lock_exclusive() {
            let mut owner = String::new();
            let _ = (&mut file).take(512).read_to_string(&mut owner);
            return Err(format!(
                "profile already running or ownership unavailable: data={} owner={} ({error})",
                data_dir.display(),
                owner.trim()
            ));
        }
        file.set_len(0).map_err(|error| error.to_string())?;
        file.seek(SeekFrom::Start(0))
            .map_err(|error| error.to_string())?;
        // Diagnostics are written only after ownership; stale metadata never grants access.
        writeln!(file, "pid={}", std::process::id()).map_err(|error| error.to_string())?;
        Ok(Self { _file: file })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ownership_is_exclusive_and_released_on_drop() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        let first = DataDirLock::acquire(a.path()).unwrap();
        let metadata = std::fs::read(a.path().join("core.lock")).unwrap();
        assert!(DataDirLock::acquire(a.path())
            .unwrap_err()
            .contains("profile already running"));
        assert_eq!(std::fs::read(a.path().join("core.lock")).unwrap(), metadata);
        let _other = DataDirLock::acquire(b.path()).unwrap();
        drop(first);
        let _restart = DataDirLock::acquire(a.path()).unwrap();
    }
}
