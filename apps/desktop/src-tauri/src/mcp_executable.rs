use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// Keep the internal MCP entrypoint independent from the app bundle that launched this process.
///
/// Development builds are commonly opened from a disposable worktree. macOS keeps that process
/// alive after the bundle is removed, but a later MCP spawn through `current_exe()` then fails with
/// `ENOENT`. A content-addressed copy is stable for the lifetime of the desktop process and lets
/// identical builds reuse the same derived artifact.
pub(crate) fn stage(source: &Path, data_dir: &Path) -> io::Result<PathBuf> {
    let bytes = fs::read(source)?;
    let digest = blake3::hash(&bytes).to_hex();
    let directory = data_dir.join("mcp-entrypoints");
    fs::create_dir_all(&directory)?;

    let extension = source
        .extension()
        .map(|value| format!(".{}", value.to_string_lossy()))
        .unwrap_or_default();
    let target = directory.join(format!("codetwo-browser-mcp-{digest}{extension}"));
    if fs::read(&target).is_ok_and(|existing| existing == bytes) {
        fs::set_permissions(&target, fs::metadata(source)?.permissions())?;
        return Ok(target);
    }

    let temporary = directory.join(format!(".mcp-entrypoint-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        fs::set_permissions(&temporary, fs::metadata(source)?.permissions())?;
        fs::rename(&temporary, &target)?;
        Ok(target.clone())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(all(test, unix))]
mod tests {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::process::Command;

    use super::stage;

    #[test]
    fn staged_mcp_entrypoint_survives_removing_the_launched_bundle() {
        let root = std::env::temp_dir().join(format!(
            "codetwo-mcp-entrypoint-test-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).unwrap();
        let source = root.join("source-entrypoint");
        fs::write(&source, "#!/bin/sh\nprintf sidecar-ok\n").unwrap();
        fs::set_permissions(&source, fs::Permissions::from_mode(0o700)).unwrap();

        let staged = stage(&source, &root).unwrap();
        fs::set_permissions(&staged, fs::Permissions::from_mode(0o600)).unwrap();
        assert_eq!(stage(&source, &root).unwrap(), staged);
        assert_ne!(
            fs::metadata(&staged).unwrap().permissions().mode() & 0o111,
            0
        );
        fs::remove_file(&source).unwrap();

        let output = Command::new(&staged).output().unwrap();
        assert!(output.status.success());
        assert_eq!(output.stdout, b"sidecar-ok");

        fs::remove_dir_all(&root).unwrap();
    }
}
