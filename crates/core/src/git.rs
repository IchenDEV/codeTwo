//! Quick git state for a session's working directory — the t3code-style status view (branch,
//! ahead/behind, and changed files). We shell out to `git status --porcelain=v2 --branch` (the norm
//! in this codebase; see [`crate::worktree`]) and parse it into a compact, serializable shape the
//! GUI/TUI render.

use std::path::Path;

use serde::{Deserialize, Serialize};
use tokio::process::Command;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitStatus {
    pub is_repo: bool,
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<GitFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitFile {
    pub path: String,
    pub staged: bool,
    /// One of: modified | added | deleted | renamed | untracked | unmerged.
    pub state: String,
}

/// Fetch a compact status for `cwd`. A non-repo (or missing git) yields `is_repo: false`.
pub async fn status(cwd: &Path) -> GitStatus {
    let out = Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(["status", "--porcelain=v2", "--branch"])
        .output()
        .await;
    let Ok(out) = out else { return GitStatus::default() };
    if !out.status.success() {
        return GitStatus::default();
    }
    let text = String::from_utf8_lossy(&out.stdout);
    parse_status(&text)
}

/// Parse `git status --porcelain=v2 --branch` output. Public for unit testing.
pub fn parse_status(text: &str) -> GitStatus {
    let mut s = GitStatus { is_repo: true, ..Default::default() };
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            s.branch = rest.trim().to_string();
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            // Format: "+<ahead> -<behind>"
            for tok in rest.split_whitespace() {
                if let Some(n) = tok.strip_prefix('+') {
                    s.ahead = n.parse().unwrap_or(0);
                } else if let Some(n) = tok.strip_prefix('-') {
                    s.behind = n.parse().unwrap_or(0);
                }
            }
        } else if let Some(rest) = line.strip_prefix("1 ") {
            // Ordinary change: "<xy> <sub> <mH> <mI> <mW> <hH> <hI> <path>"
            if let Some(f) = parse_ordinary(rest, false) {
                s.files.push(f);
            }
        } else if let Some(rest) = line.strip_prefix("2 ") {
            // Renamed/copied: like ordinary but with an extra score field, path is "<new>\t<orig>".
            if let Some(f) = parse_ordinary(rest, true) {
                s.files.push(f);
            }
        } else if let Some(rest) = line.strip_prefix("u ") {
            // Unmerged.
            if let Some(path) = rest.split_whitespace().last() {
                s.files.push(GitFile { path: path.to_string(), staged: false, state: "unmerged".into() });
            }
        } else if let Some(rest) = line.strip_prefix("? ") {
            s.files.push(GitFile { path: rest.trim().to_string(), staged: false, state: "untracked".into() });
        }
    }
    s
}

fn parse_ordinary(rest: &str, renamed: bool) -> Option<GitFile> {
    let mut it = rest.split_whitespace();
    let xy = it.next()?; // e.g. ".M", "M.", "A.", "MM"
    // Skip the fixed fields: sub mH mI mW hH hI (6), plus a rename score for '2' lines.
    let skip = if renamed { 7 } else { 6 };
    for _ in 0..skip {
        it.next()?;
    }
    // The path is the remainder; for renames it's "<new>\t<orig>".
    let tail: Vec<&str> = it.collect();
    let path_field = tail.join(" ");
    let path = path_field.split('\t').next().unwrap_or(&path_field).to_string();
    if path.is_empty() {
        return None;
    }
    let x = xy.chars().next().unwrap_or('.');
    let y = xy.chars().nth(1).unwrap_or('.');
    let staged = x != '.';
    let state = classify(x, y, renamed);
    Some(GitFile { path, staged, state })
}

fn classify(x: char, y: char, renamed: bool) -> String {
    if renamed || x == 'R' || y == 'R' {
        "renamed".into()
    } else if x == 'A' || y == 'A' {
        "added".into()
    } else if x == 'D' || y == 'D' {
        "deleted".into()
    } else {
        "modified".into()
    }
}

// ---- checkpoints, diffs, commit/push (t3code-style review → ship loop) ------------------------

/// A workspace snapshot stored as a hidden git ref (`refs/codetwo/checkpoints/<id>`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Checkpoint {
    pub id: String,
    pub refname: String,
    pub commit: String,
    pub message: String,
}

async fn run(cwd: &Path, args: &[&str]) -> std::io::Result<String> {
    run_env(cwd, args, &[]).await
}

async fn run_env(cwd: &Path, args: &[&str], env: &[(&str, &str)]) -> std::io::Result<String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(cwd).args(args);
    for (k, v) in env {
        cmd.env(k, v);
    }
    let out = cmd.output().await?;
    if !out.status.success() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

pub async fn is_repo(cwd: &Path) -> bool {
    run(cwd, &["rev-parse", "--is-inside-work-tree"]).await.is_ok()
}

/// Snapshot the entire working tree (including untracked files) into a hidden ref, without touching
/// the user's index — uses a throwaway `GIT_INDEX_FILE`. This is how t3code checkpoints per turn.
pub async fn checkpoint(cwd: &Path, message: &str) -> std::io::Result<Checkpoint> {
    let id = uuid::Uuid::new_v4().simple().to_string();
    let index = std::env::temp_dir().join(format!("codetwo-index-{id}"));
    let env = [("GIT_INDEX_FILE", index.to_string_lossy().to_string())];
    let env_ref: Vec<(&str, &str)> = env.iter().map(|(k, v)| (*k, v.as_str())).collect();

    // Seed the temp index from HEAD (ignored if unborn), then stage everything into it.
    let _ = run_env(cwd, &["read-tree", "HEAD"], &env_ref).await;
    run_env(cwd, &["add", "-A"], &env_ref).await?;
    let tree = run_env(cwd, &["write-tree"], &env_ref).await?.trim().to_string();

    let parent = run(cwd, &["rev-parse", "HEAD"]).await.ok().map(|s| s.trim().to_string());
    let commit = match &parent {
        Some(p) => run(cwd, &["commit-tree", tree.as_str(), "-p", p.as_str(), "-m", message]).await?,
        None => run(cwd, &["commit-tree", tree.as_str(), "-m", message]).await?,
    };
    let commit = commit.trim().to_string();

    let refname = format!("refs/codetwo/checkpoints/{id}");
    run(cwd, &["update-ref", refname.as_str(), commit.as_str()]).await?;
    let _ = std::fs::remove_file(&index);

    Ok(Checkpoint { id, refname, commit, message: message.to_string() })
}

/// Checkpoints for `cwd`, newest first.
pub async fn list_checkpoints(cwd: &Path) -> Vec<Checkpoint> {
    let out = run(
        cwd,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname) %(objectname) %(subject)",
            "refs/codetwo/checkpoints",
        ],
    )
    .await
    .unwrap_or_default();
    out.lines()
        .filter_map(|line| {
            let mut parts = line.splitn(3, ' ');
            let refname = parts.next()?.to_string();
            let commit = parts.next().unwrap_or("").to_string();
            let message = parts.next().unwrap_or("").to_string();
            let id = refname.rsplit('/').next().unwrap_or("").to_string();
            if refname.is_empty() {
                None
            } else {
                Some(Checkpoint { id, refname, commit, message })
            }
        })
        .collect()
}

/// Unified diff of the working tree against a checkpoint commit (tracked files).
pub async fn diff_since(cwd: &Path, commit: &str) -> std::io::Result<String> {
    run(cwd, &["diff", commit, "--"]).await
}

/// Restore tracked files in the working tree to a checkpoint's state.
pub async fn revert_to(cwd: &Path, commit: &str) -> std::io::Result<()> {
    run(cwd, &["restore", "--source", commit, "--worktree", "--", "."]).await.map(|_| ())
}

/// Working-tree diff against HEAD (optionally a single path) — for the review view.
pub async fn diff(cwd: &Path, path: Option<&str>) -> std::io::Result<String> {
    match path {
        Some(p) => run(cwd, &["diff", "HEAD", "--", p]).await,
        None => run(cwd, &["diff", "HEAD"]).await,
    }
}

/// Stage everything and commit. Returns git's output.
pub async fn commit(cwd: &Path, message: &str, all: bool) -> std::io::Result<String> {
    if all {
        run(cwd, &["add", "-A"]).await?;
    }
    run(cwd, &["commit", "-m", message]).await
}

/// `git push` (uses the branch's configured upstream).
pub async fn push(cwd: &Path) -> std::io::Result<String> {
    run(cwd, &["push"]).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_branch_ahead_behind_and_files() {
        let sample = "\
# branch.oid abc123
# branch.head main
# branch.ab +2 -1
1 .M N... 100644 100644 100644 aaa bbb src/main.rs
1 A. N... 000000 100644 100644 000 ccc new.rs
? notes.txt
";
        let s = parse_status(sample);
        assert!(s.is_repo);
        assert_eq!(s.branch, "main");
        assert_eq!(s.ahead, 2);
        assert_eq!(s.behind, 1);
        assert_eq!(s.files.len(), 3);
        assert!(s.files.iter().any(|f| f.path == "src/main.rs" && f.state == "modified" && !f.staged));
        assert!(s.files.iter().any(|f| f.path == "new.rs" && f.staged));
        assert!(s.files.iter().any(|f| f.path == "notes.txt" && f.state == "untracked"));
    }

    #[tokio::test]
    async fn status_on_real_repo() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let base = std::env::temp_dir().join(format!("codetwo-git-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&base).unwrap();
        let run = |args: &[&str]| {
            std::process::Command::new("git").arg("-C").arg(&base).args(args).output().unwrap();
        };
        run(&["init", "-q"]);
        run(&["config", "user.email", "t@t.dev"]);
        run(&["config", "user.name", "t"]);
        std::fs::write(base.join("hello.txt"), "hi").unwrap();

        let s = status(&base).await;
        assert!(s.is_repo);
        assert!(s.files.iter().any(|f| f.path == "hello.txt" && f.state == "untracked"));

        let _ = std::fs::remove_dir_all(&base);
    }

    #[tokio::test]
    async fn checkpoint_diff_revert_and_commit() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let base = std::env::temp_dir().join(format!("codetwo-cp-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&base).unwrap();
        let g = |args: &[&str]| {
            std::process::Command::new("git").arg("-C").arg(&base).args(args).output().unwrap();
        };
        g(&["init", "-q"]);
        g(&["config", "user.email", "t@t.dev"]);
        g(&["config", "user.name", "t"]);

        std::fs::write(base.join("a.txt"), "1\n").unwrap();
        commit(&base, "init", true).await.unwrap();

        // Checkpoint the current (a=1) state, then change the file.
        let cp = checkpoint(&base, "cp1").await.unwrap();
        std::fs::write(base.join("a.txt"), "2\n").unwrap();

        let d = diff_since(&base, &cp.commit).await.unwrap();
        assert!(d.contains("+2"), "diff should show the change, got: {d}");
        assert!(list_checkpoints(&base).await.iter().any(|c| c.id == cp.id));

        // Revert restores a=1.
        revert_to(&base, &cp.commit).await.unwrap();
        assert_eq!(std::fs::read_to_string(base.join("a.txt")).unwrap(), "1\n");

        let _ = std::fs::remove_dir_all(&base);
    }
}
