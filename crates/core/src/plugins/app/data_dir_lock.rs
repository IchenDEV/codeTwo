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
pub(crate) fn acquire_within(
    data_dir: &Path,
    timeout: std::time::Duration,
) -> Result<DataDirLock, String> {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        match DataDirLock::acquire(data_dir) {
            Ok(lock) => return Ok(lock),
            Err(_error) if std::time::Instant::now() < deadline => {
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            Err(error) => return Err(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Re-acquiring immediately after the previous owner released can lose a race with an unrelated
    /// `fork`/`exec` elsewhere in the test process: a forked child briefly inherits the lock's open
    /// file description, and the kernel keeps the `flock` until that child execs. The product
    /// contract is "one live owner"; these tests therefore assert eventual release rather than
    /// instantaneous release. Exclusivity while held is still asserted immediately.
    fn release_window() -> std::time::Duration {
        std::time::Duration::from_secs(5)
    }

    #[test]
    fn acquisition_is_reusable_after_release() {
        for _ in 0..20 {
            let dir = tempfile::tempdir().unwrap();
            let first = DataDirLock::acquire(dir.path()).unwrap();
            assert!(DataDirLock::acquire(dir.path()).is_err());
            drop(first);
            acquire_within(dir.path(), release_window()).unwrap();
        }
    }

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
        let _restart = acquire_within(a.path(), release_window()).unwrap();
    }
}
