use std::fs::{self, File, OpenOptions};
use std::io;
use std::os::fd::AsRawFd;
use std::os::unix::fs::{DirBuilderExt, FileTypeExt, MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum OwnershipError {
    #[error("unsafe runtime path {0}")]
    UnsafeRuntimePath(PathBuf),
    #[error("runtime path is not a directory: {0}")]
    RuntimeNotDirectory(PathBuf),
    #[error("invalid lock file: {0}")]
    InvalidLock(PathBuf),
    #[error("daemon is already running")]
    AlreadyRunning,
    #[error("invalid socket path: {0}")]
    InvalidSocket(PathBuf),
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SocketIdentity {
    dev: u64,
    ino: u64,
}

impl SocketIdentity {
    pub fn capture(path: &Path) -> Result<Self, OwnershipError> {
        let metadata = fs::symlink_metadata(path)?;
        if !metadata.file_type().is_socket() {
            return Err(OwnershipError::InvalidSocket(path.to_owned()));
        }
        Ok(Self {
            dev: metadata.dev(),
            ino: metadata.ino(),
        })
    }

    pub fn remove_if_matches(self, path: &Path) -> Result<bool, OwnershipError> {
        let metadata = match fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
            Err(error) => return Err(error.into()),
        };
        if !metadata.file_type().is_socket() {
            return Err(OwnershipError::InvalidSocket(path.to_owned()));
        }
        if metadata.dev() != self.dev || metadata.ino() != self.ino {
            return Ok(false);
        }
        fs::remove_file(path)?;
        Ok(true)
    }
}
pub struct RuntimeOwnership {
    runtime_dir: PathBuf,
    _runtime_file: File,
    _lock_file: File,
}

impl RuntimeOwnership {
    pub fn acquire(runtime_dir: impl AsRef<Path>) -> Result<Self, OwnershipError> {
        let runtime_dir = runtime_dir.as_ref().to_owned();
        let home = std::env::var_os("HOME").map(PathBuf::from);
        let current = std::env::current_dir().ok();
        if !runtime_dir.is_absolute()
            || runtime_dir.components().count() <= 2
            || home.as_ref().is_some_and(|home| *home == runtime_dir)
            || current
                .as_ref()
                .is_some_and(|current| *current == runtime_dir)
        {
            return Err(OwnershipError::UnsafeRuntimePath(runtime_dir));
        }
        match fs::symlink_metadata(&runtime_dir) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(OwnershipError::RuntimeNotDirectory(runtime_dir));
            }
            Ok(metadata) if !metadata.is_dir() => {
                return Err(OwnershipError::RuntimeNotDirectory(runtime_dir));
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                fs::DirBuilder::new().mode(0o700).create(&runtime_dir)?;
            }
            Err(error) => return Err(error.into()),
        }
        let metadata = fs::symlink_metadata(&runtime_dir)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(OwnershipError::RuntimeNotDirectory(runtime_dir));
        }
        let runtime_file = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(&runtime_dir)?;
        let result = unsafe { libc::fchmod(runtime_file.as_raw_fd(), 0o700) };
        if result == -1 {
            return Err(io::Error::last_os_error().into());
        }

        let lock_path = runtime_dir.join("daemon.lock");
        if matches!(fs::symlink_metadata(&lock_path), Ok(metadata) if metadata.file_type().is_symlink())
        {
            return Err(OwnershipError::InvalidLock(lock_path));
        }
        let lock_file = match OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .mode(0o600)
            .custom_flags(libc::O_CLOEXEC | libc::O_NOFOLLOW)
            .open(&lock_path)
        {
            Ok(file) => file,
            Err(error) if error.raw_os_error() == Some(libc::ELOOP) => {
                return Err(OwnershipError::InvalidLock(lock_path));
            }
            Err(error) => return Err(error.into()),
        };
        if !lock_file.metadata()?.is_file() {
            return Err(OwnershipError::InvalidLock(lock_path));
        }
        lock_file.set_permissions(fs::Permissions::from_mode(0o600))?;
        let result = unsafe { libc::flock(lock_file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) };
        if result == -1 {
            let error = io::Error::last_os_error();
            if error.raw_os_error() == Some(libc::EWOULDBLOCK)
                || error.raw_os_error() == Some(libc::EAGAIN)
            {
                return Err(OwnershipError::AlreadyRunning);
            }
            return Err(error.into());
        }
        Ok(Self {
            runtime_dir,
            _runtime_file: runtime_file,
            _lock_file: lock_file,
        })
    }
    pub fn remove_stale_socket(&self, socket_path: &Path) -> Result<(), OwnershipError> {
        if socket_path.parent() != Some(self.runtime_dir.as_path()) {
            return Err(OwnershipError::InvalidSocket(socket_path.to_owned()));
        }
        match fs::symlink_metadata(socket_path) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
            Ok(metadata)
                if metadata.file_type().is_symlink() || !metadata.file_type().is_socket() =>
            {
                Err(OwnershipError::InvalidSocket(socket_path.to_owned()))
            }
            Ok(_) => {
                fs::remove_file(socket_path)?;
                Ok(())
            }
        }
    }
}
impl Drop for RuntimeOwnership {
    fn drop(&mut self) {
        let _ = unsafe { libc::flock(self._lock_file.as_raw_fd(), libc::LOCK_UN) };
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::net::UnixListener;
    use uuid::Uuid;

    fn temp_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!("c2-own-{}", Uuid::new_v4().simple()));
        fs::create_dir(&path).unwrap();
        path
    }

    fn cleanup(path: &Path) {
        let _ = fs::remove_file(path.join("daemon.lock"));
        let _ = fs::remove_dir(path);
    }
    #[test]
    fn modes_lock_contention_and_persistent_inode() {
        let path = temp_dir();
        assert!(matches!(
            RuntimeOwnership::acquire("relative-runtime"),
            Err(OwnershipError::UnsafeRuntimePath(_))
        ));
        if let Some(home) = std::env::var_os("HOME") {
            assert!(matches!(
                RuntimeOwnership::acquire(home),
                Err(OwnershipError::UnsafeRuntimePath(_))
            ));
        }
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
        let owner = RuntimeOwnership::acquire(&path).unwrap();
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o700
        );
        let lock = path.join("daemon.lock");
        let inode = fs::metadata(&lock).unwrap().ino();
        assert_eq!(
            fs::metadata(&lock).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert!(matches!(
            RuntimeOwnership::acquire(&path),
            Err(OwnershipError::AlreadyRunning)
        ));
        drop(owner);
        let owner = RuntimeOwnership::acquire(&path).unwrap();
        assert_eq!(fs::metadata(&lock).unwrap().ino(), inode);
        drop(owner);
        cleanup(&path);
    }

    #[test]
    fn symlinks_and_socket_cleanup_are_rejected_or_safe() {
        let path = temp_dir();
        let link = path.join("link");
        std::os::unix::fs::symlink(path.join("target"), &link).unwrap();
        assert!(matches!(
            RuntimeOwnership::acquire(&link),
            Err(OwnershipError::RuntimeNotDirectory(_))
        ));
        let owner = RuntimeOwnership::acquire(&path).unwrap();
        let lock_link = path.join("daemon.lock");
        fs::remove_file(&lock_link).unwrap();
        std::os::unix::fs::symlink(path.join("target"), &lock_link).unwrap();
        assert!(matches!(
            RuntimeOwnership::acquire(&path),
            Err(OwnershipError::InvalidLock(_))
        ));
        fs::remove_file(&lock_link).unwrap();
        let socket = path.join("daemon.sock");
        fs::write(&socket, b"not a socket").unwrap();
        assert!(matches!(
            owner.remove_stale_socket(&socket),
            Err(OwnershipError::InvalidSocket(_))
        ));
        fs::remove_file(&socket).unwrap();
        std::os::unix::fs::symlink(path.join("target"), &socket).unwrap();
        assert!(matches!(
            owner.remove_stale_socket(&socket),
            Err(OwnershipError::InvalidSocket(_))
        ));
        fs::remove_file(&socket).unwrap();
        let listener = UnixListener::bind(&socket).unwrap();
        owner.remove_stale_socket(&socket).unwrap();
        drop(listener);
        let listener = UnixListener::bind(&socket).unwrap();
        let identity = SocketIdentity::capture(&socket).unwrap();
        drop(listener);
        fs::remove_file(&socket).unwrap();
        let replacement = UnixListener::bind(&socket).unwrap();
        assert!(!identity.remove_if_matches(&socket).unwrap());
        drop(replacement);
        drop(owner);
        let _ = fs::remove_file(&link);
        cleanup(&path);
    }
}
