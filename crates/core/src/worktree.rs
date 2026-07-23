//! Git worktree isolation, one worktree per session.
//!
//! We shell out to the `git` CLI (the ecosystem norm — t3code, container-use, opencode plugins —
//! and more capable here than git libraries). The session's `cwd` becomes the worktree path, so the
//! provider runs against an isolated checkout + branch sharing the repo's `.git`.

use std::io;
use std::path::{Path, PathBuf};

use tokio::process::Command;

#[derive(Debug, Clone)]
pub struct Worktree {
    pub path: PathBuf,
    pub branch: String,
}

async fn run_git(repo: &Path, args: &[&std::ffi::OsStr]) -> io::Result<String> {
    let out = Command::new("git").arg("-C").arg(repo).args(args).output().await?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(io::Error::new(io::ErrorKind::Other, format!("git failed: {stderr}")));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// `git worktree add -b <branch> <path>` — a fresh branch checked out at `path`.
pub async fn add(repo: &Path, path: &Path, branch: &str) -> io::Result<Worktree> {
    use std::ffi::OsStr;
    run_git(
        repo,
        &[OsStr::new("worktree"), OsStr::new("add"), OsStr::new("-b"), OsStr::new(branch), path.as_os_str()],
    )
    .await?;
    Ok(Worktree { path: path.to_path_buf(), branch: branch.to_string() })
}

/// `git worktree remove --force <path>` — used on session cleanup.
pub async fn remove(repo: &Path, path: &Path) -> io::Result<()> {
    use std::ffi::OsStr;
    run_git(repo, &[OsStr::new("worktree"), OsStr::new("remove"), OsStr::new("--force"), path.as_os_str()])
        .await
        .map(|_| ())
}

/// Parse `git worktree list --porcelain` into worktree paths.
pub async fn list(repo: &Path) -> io::Result<Vec<PathBuf>> {
    use std::ffi::OsStr;
    let out = run_git(repo, &[OsStr::new("worktree"), OsStr::new("list"), OsStr::new("--porcelain")]).await?;
    Ok(out
        .lines()
        .filter_map(|l| l.strip_prefix("worktree "))
        .map(PathBuf::from)
        .collect())
}

/// Is `path` inside a git work tree? Used to gate the "use worktree" toggle.
pub async fn is_git_repo(path: &Path) -> bool {
    use std::ffi::OsStr;
    run_git(path, &[OsStr::new("rev-parse"), OsStr::new("--is-inside-work-tree")]).await.is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsStr;

    async fn git(dir: &Path, args: &[&str]) {
        let osargs: Vec<&OsStr> = args.iter().map(|a| OsStr::new(*a)).collect();
        run_git(dir, &osargs).await.unwrap();
    }

    #[tokio::test]
    async fn add_list_remove_worktree() {
        // Skip gracefully if git isn't installed.
        if crate::provider::which("git").is_none() {
            eprintln!("git not found; skipping worktree test");
            return;
        }

        let base = std::env::temp_dir().join(format!("codetwo-wt-{}", uuid::Uuid::new_v4()));
        let repo = base.join("repo");
        std::fs::create_dir_all(&repo).unwrap();

        // Init a repo with one commit so a branch/HEAD exists.
        git(&repo, &["init", "-q"]).await;
        git(&repo, &["config", "user.email", "t@t.dev"]).await;
        git(&repo, &["config", "user.name", "t"]).await;
        git(&repo, &["commit", "--allow-empty", "-qm", "init"]).await;

        let wt = base.join("wt-feature");
        let created = add(&repo, &wt, "feature/x").await.unwrap();
        assert!(created.path.is_dir());
        assert_eq!(created.branch, "feature/x");

        let listed = list(&repo).await.unwrap();
        assert!(listed.iter().any(|p| p.ends_with("wt-feature")));

        remove(&repo, &wt).await.unwrap();
        assert!(!wt.exists());

        let _ = std::fs::remove_dir_all(&base);
    }
}
