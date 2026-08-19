//! Git state and review primitives shared by every C2 client.
//!
//! Paths are always passed to git as literal arguments after `--`; status and name lists use
//! NUL-delimited porcelain output so whitespace and newlines in filenames are not ambiguous.

use std::ffi::OsString;
use std::path::Path;
use std::process::{ExitStatus, Stdio};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;
use tokio::sync::mpsc;
use tokio::time::Instant;

const MAX_PATHS_PER_OPERATION: usize = 256;
const MAX_DIFF_STDOUT_BYTES: usize = 2 * 1024 * 1024;
const MAX_DIFF_STDERR_BYTES: usize = 64 * 1024;
const MAX_DIFF_FILES: usize = 256;
const DIFF_TIMEOUT: Duration = Duration::from_secs(10);

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
    /// The source path for a rename/copy, when git reports one.
    #[serde(default)]
    pub original_path: Option<String>,
    /// Whether the index differs from HEAD for this path.
    pub staged: bool,
    /// Whether the working tree differs from the index for this path.
    #[serde(default)]
    pub unstaged: bool,
    /// A compact display state retained for existing clients.
    /// One of: modified | added | deleted | renamed | copied | untracked | unmerged.
    pub state: String,
    /// The independent index-side state. `MM` therefore reports `modified` here and below.
    #[serde(default)]
    pub staged_state: Option<String>,
    /// The independent worktree-side state.
    #[serde(default)]
    pub unstaged_state: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DiffScope {
    #[default]
    All,
    Staged,
    Unstaged,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiffResult {
    pub text: String,
    pub truncated: bool,
    pub truncation_reason: Option<String>,
    pub returned_bytes: usize,
    pub files: usize,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiffStat {
    pub added: u64,
    pub deleted: u64,
    pub files: usize,
    pub truncated: bool,
    pub truncation_reason: Option<String>,
}

/// Fetch a compact status for `cwd`. A non-repo (or missing git) yields `is_repo: false`.
pub async fn status(cwd: &Path) -> GitStatus {
    let out = Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(["status", "--porcelain=v2", "--branch", "--renames", "-z"])
        .output()
        .await;
    let Ok(out) = out else {
        return GitStatus::default();
    };
    if !out.status.success() {
        return GitStatus::default();
    }
    parse_status_z(&out.stdout)
}

/// Parse the NUL-delimited form of `git status --porcelain=v2 --branch -z`.
pub fn parse_status_z(bytes: &[u8]) -> GitStatus {
    let records: Vec<String> = bytes
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
        .map(|record| String::from_utf8_lossy(record).into_owned())
        .collect();
    parse_status_records(&records, true)
}

/// Parse the human-readable line-delimited porcelain-v2 form. This compatibility helper is useful
/// for fixtures; production status always uses [`parse_status_z`].
pub fn parse_status(text: &str) -> GitStatus {
    if text.as_bytes().contains(&0) {
        return parse_status_z(text.as_bytes());
    }
    let records: Vec<String> = text.lines().map(str::to_owned).collect();
    parse_status_records(&records, false)
}

fn parse_status_records(records: &[String], nul_delimited: bool) -> GitStatus {
    let mut status = GitStatus {
        is_repo: true,
        ..Default::default()
    };
    let mut index = 0;
    while index < records.len() {
        let record = &records[index];
        if let Some(rest) = record.strip_prefix("# branch.head ") {
            status.branch = rest.to_string();
        } else if let Some(rest) = record.strip_prefix("# branch.ab ") {
            for token in rest.split_whitespace() {
                if let Some(value) = token.strip_prefix('+') {
                    status.ahead = value.parse().unwrap_or(0);
                } else if let Some(value) = token.strip_prefix('-') {
                    status.behind = value.parse().unwrap_or(0);
                }
            }
        } else if record.starts_with("1 ") {
            if let Some(file) = parse_tracked_record(record) {
                status.files.push(file);
            }
        } else if record.starts_with("2 ") {
            let mut fields = record.splitn(10, ' ');
            let fields: Vec<&str> = fields.by_ref().collect();
            if fields.len() == 10 {
                let (path, original_path) = if nul_delimited {
                    let original = records.get(index + 1).cloned();
                    if original.is_some() {
                        index += 1;
                    }
                    (fields[9].to_string(), original)
                } else if let Some((path, original)) = fields[9].split_once('\t') {
                    (path.to_string(), Some(original.to_string()))
                } else {
                    (fields[9].to_string(), None)
                };
                if let Some(file) = git_file(fields[1], path, original_path, false) {
                    status.files.push(file);
                }
            }
        } else if record.starts_with("u ") {
            let fields: Vec<&str> = record.splitn(11, ' ').collect();
            if fields.len() == 11 {
                status.files.push(GitFile {
                    path: fields[10].to_string(),
                    original_path: None,
                    staged: true,
                    unstaged: true,
                    state: "unmerged".into(),
                    staged_state: Some("unmerged".into()),
                    unstaged_state: Some("unmerged".into()),
                });
            }
        } else if let Some(path) = record.strip_prefix("? ") {
            status.files.push(GitFile {
                path: path.to_string(),
                original_path: None,
                staged: false,
                unstaged: true,
                state: "untracked".into(),
                staged_state: None,
                unstaged_state: Some("untracked".into()),
            });
        }
        index += 1;
    }
    status
}

fn parse_tracked_record(record: &str) -> Option<GitFile> {
    let fields: Vec<&str> = record.splitn(9, ' ').collect();
    if fields.len() != 9 {
        return None;
    }
    git_file(fields[1], fields[8].to_string(), None, false)
}

fn git_file(
    xy: &str,
    path: String,
    original_path: Option<String>,
    force_unmerged: bool,
) -> Option<GitFile> {
    if path.is_empty() {
        return None;
    }
    let mut chars = xy.chars();
    let x = chars.next().unwrap_or('.');
    let y = chars.next().unwrap_or('.');
    let staged_state = if force_unmerged {
        Some("unmerged".into())
    } else {
        classify_status_code(x)
    };
    let unstaged_state = if force_unmerged {
        Some("unmerged".into())
    } else {
        classify_status_code(y)
    };
    let state = if force_unmerged || x == 'U' || y == 'U' {
        "unmerged".to_string()
    } else {
        staged_state
            .as_deref()
            .or(unstaged_state.as_deref())
            .unwrap_or("modified")
            .to_string()
    };
    Some(GitFile {
        path,
        original_path,
        staged: staged_state.is_some(),
        unstaged: unstaged_state.is_some(),
        state,
        staged_state,
        unstaged_state,
    })
}

fn classify_status_code(code: char) -> Option<String> {
    match code {
        '.' | ' ' => None,
        'A' => Some("added".into()),
        'D' => Some("deleted".into()),
        'R' => Some("renamed".into()),
        'C' => Some("copied".into()),
        'U' => Some("unmerged".into()),
        _ => Some("modified".into()),
    }
}

// ---- checkpoints, index operations, bounded diffs, commit/push -------------------------------

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
    let mut command = Command::new("git");
    command.arg("-C").arg(cwd).args(args);
    for (key, value) in env {
        command.env(key, value);
    }
    let output = command.output().await?;
    if !output.status.success() {
        return Err(command_error(&output.stderr));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn command_error(stderr: &[u8]) -> std::io::Error {
    let message = String::from_utf8_lossy(stderr).trim().to_string();
    std::io::Error::other(if message.is_empty() {
        "git command failed".into()
    } else {
        message
    })
}

pub async fn is_repo(cwd: &Path) -> bool {
    run(cwd, &["rev-parse", "--is-inside-work-tree"])
        .await
        .is_ok()
}

/// Snapshot the entire working tree (including untracked files) into a hidden ref, without touching
/// the user's index — uses a throwaway `GIT_INDEX_FILE`.
pub async fn checkpoint(cwd: &Path, message: &str) -> std::io::Result<Checkpoint> {
    let id = uuid::Uuid::new_v4().simple().to_string();
    let index = std::env::temp_dir().join(format!("codetwo-index-{id}"));
    let env = [("GIT_INDEX_FILE", index.to_string_lossy().to_string())];
    let env_ref: Vec<(&str, &str)> = env
        .iter()
        .map(|(key, value)| (*key, value.as_str()))
        .collect();

    let _ = run_env(cwd, &["read-tree", "HEAD"], &env_ref).await;
    run_env(cwd, &["add", "-A"], &env_ref).await?;
    let tree = run_env(cwd, &["write-tree"], &env_ref)
        .await?
        .trim()
        .to_string();

    let parent = run(cwd, &["rev-parse", "HEAD"])
        .await
        .ok()
        .map(|value| value.trim().to_string());
    let commit = match &parent {
        Some(parent) => {
            run(
                cwd,
                &[
                    "commit-tree",
                    tree.as_str(),
                    "-p",
                    parent.as_str(),
                    "-m",
                    message,
                ],
            )
            .await?
        }
        None => run(cwd, &["commit-tree", tree.as_str(), "-m", message]).await?,
    };
    let commit = commit.trim().to_string();

    let refname = format!("refs/codetwo/checkpoints/{id}");
    run(cwd, &["update-ref", refname.as_str(), commit.as_str()]).await?;
    let _ = std::fs::remove_file(&index);

    Ok(Checkpoint {
        id,
        refname,
        commit,
        message: message.to_string(),
    })
}

/// Checkpoints for `cwd`, newest first.
pub async fn list_checkpoints(cwd: &Path) -> Vec<Checkpoint> {
    let output = run(
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
    output
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(3, ' ');
            let refname = parts.next()?.to_string();
            let commit = parts.next().unwrap_or("").to_string();
            let message = parts.next().unwrap_or("").to_string();
            let id = refname.rsplit('/').next().unwrap_or("").to_string();
            (!refname.is_empty()).then_some(Checkpoint {
                id,
                refname,
                commit,
                message,
            })
        })
        .collect()
}

/// Stage only the supplied literal paths. Callers can include both sides of a rename in one call.
pub async fn stage_paths(cwd: &Path, paths: &[String]) -> std::io::Result<()> {
    run_path_operation(cwd, &["add"], paths).await
}

/// Remove only the supplied literal paths from the index. On an unborn branch this uses
/// `git rm --cached`, because there is no HEAD tree for `git restore --staged` to restore from.
pub async fn unstage_paths(cwd: &Path, paths: &[String]) -> std::io::Result<()> {
    validate_path_batch(paths)?;
    if paths.is_empty() {
        return Ok(());
    }
    let has_head = run(cwd, &["rev-parse", "--verify", "HEAD"]).await.is_ok();
    if has_head {
        run_path_operation(cwd, &["restore", "--staged"], paths).await
    } else {
        // `-f` is required when an unborn-path has both index and worktree changes (AM). The
        // operation remains bounded to the caller's explicit literal paths.
        run_path_operation(
            cwd,
            &["rm", "--cached", "--ignore-unmatch", "-r", "-f"],
            paths,
        )
        .await
    }
}

fn validate_path_batch(paths: &[String]) -> std::io::Result<()> {
    if paths.len() > MAX_PATHS_PER_OPERATION {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("at most {MAX_PATHS_PER_OPERATION} paths may be changed per git operation"),
        ));
    }
    if paths.iter().any(|path| path.is_empty()) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "git paths must not be empty",
        ));
    }
    Ok(())
}

async fn run_path_operation(cwd: &Path, args: &[&str], paths: &[String]) -> std::io::Result<()> {
    validate_path_batch(paths)?;
    if paths.is_empty() {
        return Ok(());
    }
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(cwd)
        .args(args)
        .arg("--")
        .args(paths)
        .env("GIT_LITERAL_PATHSPECS", "1");
    let output = command.output().await?;
    if !output.status.success() {
        return Err(command_error(&output.stderr));
    }
    Ok(())
}

/// Restore tracked files in the working tree to a checkpoint's state.
pub async fn revert_to(cwd: &Path, commit: &str) -> std::io::Result<()> {
    let commit = resolve_commit(cwd, commit).await?;
    run(
        cwd,
        &["restore", "--source", &commit, "--worktree", "--", "."],
    )
    .await
    .map(|_| ())
}

/// A bounded unified diff. `All` compares the full working tree to HEAD, `Staged` compares the
/// index to HEAD, and `Unstaged` compares the working tree to the index.
pub async fn diff(cwd: &Path, path: Option<&str>, scope: DiffScope) -> std::io::Result<DiffResult> {
    let base = match scope {
        DiffScope::All | DiffScope::Staged => Some(head_or_empty_tree(cwd).await?),
        DiffScope::Unstaged => None,
    };
    let plan = DiffPlan {
        scope,
        base,
        path: path.map(str::to_owned),
    };
    diff_with_limits(cwd, &plan, DiffLimits::default()).await
}

/// A bounded diff of the full working tree against `commit`.
pub async fn diff_since(cwd: &Path, commit: &str) -> std::io::Result<DiffResult> {
    diff_since_scoped(cwd, commit, DiffScope::All).await
}

/// Scoped variant of [`diff_since`]. For `Unstaged`, the meaningful comparison remains worktree
/// versus index; the supplied commit is still validated so caller mistakes are not hidden.
pub async fn diff_since_scoped(
    cwd: &Path,
    commit: &str,
    scope: DiffScope,
) -> std::io::Result<DiffResult> {
    let commit = resolve_commit(cwd, commit).await?;
    let base = match scope {
        DiffScope::All | DiffScope::Staged => Some(commit),
        DiffScope::Unstaged => None,
    };
    let plan = DiffPlan {
        scope,
        base,
        path: None,
    };
    diff_with_limits(cwd, &plan, DiffLimits::default()).await
}

/// Aggregate line counts without pulling a full patch into the client.
pub async fn diff_stat(cwd: &Path) -> std::io::Result<DiffStat> {
    diff_stat_scoped(cwd, DiffScope::All).await
}

pub async fn diff_stat_scoped(cwd: &Path, scope: DiffScope) -> std::io::Result<DiffStat> {
    let base = match scope {
        DiffScope::All | DiffScope::Staged => Some(head_or_empty_tree(cwd).await?),
        DiffScope::Unstaged => None,
    };
    let plan = DiffPlan {
        scope,
        base,
        path: None,
    };
    diff_stat_with_limits(cwd, &plan, DiffLimits::default()).await
}

#[derive(Debug, Clone)]
struct DiffPlan {
    scope: DiffScope,
    base: Option<String>,
    path: Option<String>,
}

#[derive(Debug, Clone, Copy)]
struct DiffLimits {
    stdout_bytes: usize,
    stderr_bytes: usize,
    files: usize,
    timeout: Duration,
}

impl Default for DiffLimits {
    fn default() -> Self {
        Self {
            stdout_bytes: MAX_DIFF_STDOUT_BYTES,
            stderr_bytes: MAX_DIFF_STDERR_BYTES,
            files: MAX_DIFF_FILES,
            timeout: DIFF_TIMEOUT,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ChangedFile {
    path: String,
    original_path: Option<String>,
    untracked: bool,
}

#[derive(Debug, Default)]
struct FileSelection {
    files: Vec<ChangedFile>,
    reasons: Vec<String>,
}

async fn diff_with_limits(
    cwd: &Path,
    plan: &DiffPlan,
    limits: DiffLimits,
) -> std::io::Result<DiffResult> {
    let started = Instant::now();
    let mut selection = select_changed_files(cwd, plan, limits, started).await?;
    if selection.reasons.iter().any(|reason| reason == "timeout") {
        return Ok(DiffResult {
            truncated: true,
            truncation_reason: joined_reasons(&selection.reasons),
            files: selection.files.len(),
            ..Default::default()
        });
    }

    if selection.files.is_empty() {
        if selection.reasons.is_empty() {
            revalidate_selection(
                cwd,
                plan,
                limits,
                started,
                &selection.files,
                &mut selection.reasons,
            )
            .await?;
        }
        return Ok(DiffResult {
            truncated: !selection.reasons.is_empty(),
            truncation_reason: joined_reasons(&selection.reasons),
            ..Default::default()
        });
    }

    let (bytes, output_reasons) = collect_selected_output(
        cwd,
        plan,
        &selection.files,
        DiffOutput::Patch,
        limits,
        started,
    )
    .await?;
    for reason in output_reasons {
        push_reason(&mut selection.reasons, &reason);
    }
    if selection.reasons.is_empty() {
        revalidate_selection(
            cwd,
            plan,
            limits,
            started,
            &selection.files,
            &mut selection.reasons,
        )
        .await?;
    }
    if selection.reasons.is_empty() {
        let (verified_bytes, verification_reasons) = collect_selected_output(
            cwd,
            plan,
            &selection.files,
            DiffOutput::Patch,
            limits,
            started,
        )
        .await?;
        for reason in verification_reasons {
            push_reason(&mut selection.reasons, &reason);
        }
        if verified_bytes != bytes {
            push_reason(&mut selection.reasons, "working_tree_changed");
        }
    }
    let (text, utf8_truncated) = bounded_text(bytes, limits.stdout_bytes);
    if utf8_truncated {
        push_reason(&mut selection.reasons, "stdout_limit");
    }
    let returned_bytes = text.len();
    Ok(DiffResult {
        text,
        truncated: !selection.reasons.is_empty(),
        truncation_reason: joined_reasons(&selection.reasons),
        returned_bytes,
        files: selection.files.len(),
    })
}

async fn diff_stat_with_limits(
    cwd: &Path,
    plan: &DiffPlan,
    limits: DiffLimits,
) -> std::io::Result<DiffStat> {
    let started = Instant::now();
    let mut selection = select_changed_files(cwd, plan, limits, started).await?;
    if selection.files.is_empty() || selection.reasons.iter().any(|reason| reason == "timeout") {
        if selection.files.is_empty() && selection.reasons.is_empty() {
            revalidate_selection(
                cwd,
                plan,
                limits,
                started,
                &selection.files,
                &mut selection.reasons,
            )
            .await?;
        }
        return Ok(DiffStat {
            truncated: !selection.reasons.is_empty(),
            truncation_reason: joined_reasons(&selection.reasons),
            ..Default::default()
        });
    }
    let (bytes, output_reasons) = collect_selected_output(
        cwd,
        plan,
        &selection.files,
        DiffOutput::NumStat,
        limits,
        started,
    )
    .await?;
    for reason in output_reasons {
        push_reason(&mut selection.reasons, &reason);
    }
    if selection.reasons.is_empty() {
        revalidate_selection(
            cwd,
            plan,
            limits,
            started,
            &selection.files,
            &mut selection.reasons,
        )
        .await?;
    }
    if selection.reasons.is_empty() {
        let (verified_bytes, verification_reasons) = collect_selected_output(
            cwd,
            plan,
            &selection.files,
            DiffOutput::NumStat,
            limits,
            started,
        )
        .await?;
        for reason in verification_reasons {
            push_reason(&mut selection.reasons, &reason);
        }
        if verified_bytes != bytes {
            push_reason(&mut selection.reasons, "working_tree_changed");
        }
    }
    let (added, deleted, files) = parse_numstat(&bytes, limits.files);
    if files >= limits.files && selection.files.len() > limits.files {
        push_reason(&mut selection.reasons, "file_limit");
    }
    Ok(DiffStat {
        added,
        deleted,
        files,
        truncated: !selection.reasons.is_empty(),
        truncation_reason: joined_reasons(&selection.reasons),
    })
}

async fn revalidate_selection(
    cwd: &Path,
    plan: &DiffPlan,
    limits: DiffLimits,
    started: Instant,
    before: &[ChangedFile],
    reasons: &mut Vec<String>,
) -> std::io::Result<()> {
    let after = select_changed_files(cwd, plan, limits, started).await?;
    for reason in after.reasons {
        push_reason(reasons, &reason);
    }
    if after.files != before {
        push_reason(reasons, "working_tree_changed");
    }
    Ok(())
}

async fn collect_selected_output(
    cwd: &Path,
    plan: &DiffPlan,
    files: &[ChangedFile],
    output_kind: DiffOutput,
    limits: DiffLimits,
    started: Instant,
) -> std::io::Result<(Vec<u8>, Vec<String>)> {
    let tracked: Vec<ChangedFile> = files
        .iter()
        .filter(|file| !file.untracked)
        .cloned()
        .collect();
    let untracked: Vec<String> = files
        .iter()
        .filter(|file| file.untracked)
        .map(|file| file.path.clone())
        .collect();
    let mut bytes = Vec::new();
    let mut reasons = Vec::new();

    if !tracked.is_empty() {
        let remaining = limits.timeout.saturating_sub(started.elapsed());
        if remaining.is_zero() {
            push_reason(&mut reasons, "timeout");
            return Ok((bytes, reasons));
        }
        let paths = selection_pathspecs(&tracked);
        let args = diff_args(plan, output_kind, Some(&paths));
        let output = run_bounded_git(
            cwd,
            &args,
            limits.stdout_bytes,
            limits.stderr_bytes,
            remaining,
        )
        .await?;
        incorporate_output_reasons(&output, &mut reasons, "");
        ensure_diff_success(&output)?;
        bytes.extend_from_slice(&output.stdout);
        if output.timed_out || output.stdout_truncated || output.stderr_truncated {
            return Ok((bytes, reasons));
        }
    }

    if !untracked.is_empty() {
        let remaining_stdout = limits.stdout_bytes.saturating_sub(bytes.len());
        let (mut untracked_bytes, untracked_reasons) = run_untracked_output(
            cwd,
            &untracked,
            output_kind,
            remaining_stdout,
            limits.stderr_bytes,
            limits.timeout.saturating_sub(started.elapsed()),
        )
        .await?;
        if matches!(output_kind, DiffOutput::Patch)
            && !bytes.is_empty()
            && !bytes.ends_with(b"\n")
            && !untracked_bytes.is_empty()
        {
            if bytes.len() < limits.stdout_bytes {
                bytes.push(b'\n');
            } else {
                push_reason(&mut reasons, "stdout_limit");
            }
        }
        let remaining_stdout = limits.stdout_bytes.saturating_sub(bytes.len());
        if untracked_bytes.len() > remaining_stdout {
            untracked_bytes.truncate(remaining_stdout);
            push_reason(&mut reasons, "stdout_limit");
        }
        bytes.extend_from_slice(&untracked_bytes);
        for reason in untracked_reasons {
            push_reason(&mut reasons, &reason);
        }
    }

    Ok((bytes, reasons))
}

struct TemporaryIndex {
    path: std::path::PathBuf,
}

impl Drop for TemporaryIndex {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
        let lock = self.path.with_extension("lock");
        let _ = std::fs::remove_file(lock);
    }
}

async fn run_untracked_output(
    cwd: &Path,
    paths: &[String],
    output_kind: DiffOutput,
    stdout_limit: usize,
    stderr_limit: usize,
    timeout: Duration,
) -> std::io::Result<(Vec<u8>, Vec<String>)> {
    if timeout.is_zero() {
        return Ok((Vec::new(), vec!["timeout".into()]));
    }
    let started = Instant::now();
    let index = TemporaryIndex {
        path: std::env::temp_dir().join(format!(
            "codetwo-diff-index-{}",
            uuid::Uuid::new_v4().simple()
        )),
    };
    let mut add_args: Vec<OsString> = ["add", "-N", "--"]
        .into_iter()
        .map(OsString::from)
        .collect();
    add_args.extend(paths.iter().map(OsString::from));
    let add_output = run_bounded_git_with_index(
        cwd,
        &add_args,
        &index.path,
        MAX_DIFF_STDOUT_BYTES,
        stderr_limit,
        timeout,
    )
    .await?;
    let mut reasons = Vec::new();
    incorporate_output_reasons(&add_output, &mut reasons, "untracked_index_");
    ensure_diff_success(&add_output)?;
    if add_output.timed_out || add_output.stdout_truncated || add_output.stderr_truncated {
        return Ok((Vec::new(), reasons));
    }

    let remaining = timeout.saturating_sub(started.elapsed());
    if remaining.is_zero() {
        push_reason(&mut reasons, "timeout");
        return Ok((Vec::new(), reasons));
    }
    let temp_plan = DiffPlan {
        scope: DiffScope::Unstaged,
        base: None,
        path: None,
    };
    let args = diff_args(&temp_plan, output_kind, Some(paths));
    let output = run_bounded_git_with_index(
        cwd,
        &args,
        &index.path,
        stdout_limit,
        stderr_limit,
        remaining,
    )
    .await?;
    incorporate_output_reasons(&output, &mut reasons, "");
    ensure_diff_success(&output)?;
    Ok((output.stdout, reasons))
}

async fn select_changed_files(
    cwd: &Path,
    plan: &DiffPlan,
    limits: DiffLimits,
    started: Instant,
) -> std::io::Result<FileSelection> {
    // Detect renames over the full scope before applying a single-path filter. Asking git for only
    // the new path makes it lose the old side and report a rename as a plain addition.
    let mut discovery_plan = plan.clone();
    discovery_plan.path = None;
    let args = diff_args(&discovery_plan, DiffOutput::NameStatus, None);
    let remaining = limits.timeout.saturating_sub(started.elapsed());
    if remaining.is_zero() {
        return Ok(FileSelection {
            reasons: vec!["timeout".into()],
            ..Default::default()
        });
    }
    let output = run_bounded_git(
        cwd,
        &args,
        limits.stdout_bytes,
        limits.stderr_bytes,
        remaining,
    )
    .await?;
    let mut reasons = Vec::new();
    incorporate_output_reasons(&output, &mut reasons, "path_list_");
    ensure_diff_success(&output)?;
    let mut files = parse_name_status(&output.stdout);
    if let Some(path) = &plan.path {
        files.retain(|file| {
            file.path == *path || file.original_path.as_deref() == Some(path.as_str())
        });
    }

    if matches!(plan.scope, DiffScope::All | DiffScope::Unstaged)
        && !reasons.iter().any(|reason| reason == "timeout")
    {
        let remaining = limits.timeout.saturating_sub(started.elapsed());
        if remaining.is_zero() {
            push_reason(&mut reasons, "timeout");
        } else {
            let mut args: Vec<OsString> =
                ["ls-files", "--others", "--exclude-standard", "-z", "--"]
                    .into_iter()
                    .map(OsString::from)
                    .collect();
            if let Some(path) = &plan.path {
                args.push(path.into());
            }
            let output = run_bounded_git(
                cwd,
                &args,
                limits.stdout_bytes,
                limits.stderr_bytes,
                remaining,
            )
            .await?;
            incorporate_output_reasons(&output, &mut reasons, "untracked_list_");
            ensure_diff_success(&output)?;
            for path in parse_nul_paths(&output.stdout) {
                if !files.iter().any(|file| file.path == path) {
                    files.push(ChangedFile {
                        path,
                        original_path: None,
                        untracked: true,
                    });
                }
            }
        }
    }
    if files.len() > limits.files {
        files.truncate(limits.files);
        push_reason(&mut reasons, "file_limit");
    }
    Ok(FileSelection { files, reasons })
}

#[derive(Debug, Clone, Copy)]
enum DiffOutput {
    Patch,
    NameStatus,
    NumStat,
}

fn diff_args(
    plan: &DiffPlan,
    output: DiffOutput,
    limited_paths: Option<&[String]>,
) -> Vec<OsString> {
    let mut args: Vec<OsString> = [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--find-renames",
    ]
    .into_iter()
    .map(OsString::from)
    .collect();
    match output {
        DiffOutput::Patch => {}
        DiffOutput::NameStatus => args.extend(["--name-status", "-z"].map(OsString::from)),
        DiffOutput::NumStat => args.extend(["--numstat", "-z"].map(OsString::from)),
    }
    if plan.scope == DiffScope::Staged {
        args.push("--cached".into());
    }
    if let Some(base) = &plan.base {
        args.push(base.into());
    }
    args.push("--".into());
    if let Some(paths) = limited_paths {
        args.extend(paths.iter().map(OsString::from));
    } else if let Some(path) = &plan.path {
        args.push(path.into());
    }
    args
}

fn selection_pathspecs(files: &[ChangedFile]) -> Vec<String> {
    let mut paths = Vec::with_capacity(files.len() * 2);
    for file in files {
        if let Some(original_path) = &file.original_path {
            if !paths.contains(original_path) {
                paths.push(original_path.clone());
            }
        }
        if !paths.contains(&file.path) {
            paths.push(file.path.clone());
        }
    }
    paths
}

fn parse_name_status(bytes: &[u8]) -> Vec<ChangedFile> {
    let fields: Vec<&[u8]> = bytes
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty())
        .collect();
    let mut files = Vec::new();
    let mut index = 0;
    while index < fields.len() {
        let status = fields[index];
        index += 1;
        let renamed = matches!(status.first(), Some(b'R' | b'C'));
        if renamed {
            let (Some(original), Some(path)) = (fields.get(index), fields.get(index + 1)) else {
                break;
            };
            files.push(ChangedFile {
                path: String::from_utf8_lossy(path).into_owned(),
                original_path: Some(String::from_utf8_lossy(original).into_owned()),
                untracked: false,
            });
            index += 2;
        } else if let Some(path) = fields.get(index) {
            files.push(ChangedFile {
                path: String::from_utf8_lossy(path).into_owned(),
                original_path: None,
                untracked: false,
            });
            index += 1;
        }
    }
    files
}

fn parse_nul_paths(bytes: &[u8]) -> Vec<String> {
    bytes
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
        .map(|path| String::from_utf8_lossy(path).into_owned())
        .collect()
}

fn parse_numstat(bytes: &[u8], file_limit: usize) -> (u64, u64, usize) {
    let fields: Vec<&[u8]> = bytes.split(|byte| *byte == 0).collect();
    let mut added = 0_u64;
    let mut deleted = 0_u64;
    let mut files = 0_usize;
    let mut index = 0;
    while index < fields.len() && files < file_limit {
        let record = fields[index];
        index += 1;
        if record.is_empty() {
            continue;
        }
        let mut parts = record.splitn(3, |byte| *byte == b'\t');
        let Some(added_part) = parts.next() else {
            continue;
        };
        let Some(deleted_part) = parts.next() else {
            continue;
        };
        let path = parts.next().unwrap_or_default();
        added = added.saturating_add(parse_numstat_count(added_part));
        deleted = deleted.saturating_add(parse_numstat_count(deleted_part));
        files += 1;
        if path.is_empty() {
            // `--numstat -z` encodes renames as header\0old\0new\0.
            index = index.saturating_add(2).min(fields.len());
        }
    }
    (added, deleted, files)
}

fn parse_numstat_count(bytes: &[u8]) -> u64 {
    std::str::from_utf8(bytes)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0)
}

async fn head_or_empty_tree(cwd: &Path) -> std::io::Result<String> {
    if let Ok(head) = run(cwd, &["rev-parse", "--verify", "HEAD"]).await {
        let head = head.trim();
        if !head.is_empty() {
            return Ok(head.to_string());
        }
    }

    // Do not hard-code SHA-1's well-known empty-tree ID. This asks the target repository to hash
    // and persist an empty tree using its configured object format (SHA-1 or SHA-256).
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(cwd)
        .args(["hash-object", "-t", "tree", "--stdin", "-w"])
        .stdin(Stdio::null());
    let output = command.output().await?;
    if !output.status.success() {
        return Err(command_error(&output.stderr));
    }
    let tree = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if tree.is_empty() {
        return Err(std::io::Error::other("git did not return an empty-tree id"));
    }
    Ok(tree)
}

async fn resolve_commit(cwd: &Path, commit: &str) -> std::io::Result<String> {
    if commit.is_empty() || commit.contains('\0') {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "commit must not be empty",
        ));
    }
    let revision = format!("{commit}^{{commit}}");
    let resolved = run(
        cwd,
        &["rev-parse", "--verify", "--end-of-options", &revision],
    )
    .await?;
    Ok(resolved.trim().to_string())
}

#[derive(Debug, Clone, Copy)]
enum StreamLimit {
    Stdout,
    Stderr,
}

#[derive(Debug)]
struct LimitedBytes {
    bytes: Vec<u8>,
    truncated: bool,
}

#[derive(Debug)]
struct BoundedOutput {
    status: Option<ExitStatus>,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    stdout_truncated: bool,
    stderr_truncated: bool,
    timed_out: bool,
}

async fn run_bounded_git(
    cwd: &Path,
    args: &[OsString],
    stdout_limit: usize,
    stderr_limit: usize,
    timeout: Duration,
) -> std::io::Result<BoundedOutput> {
    run_bounded_git_inner(cwd, args, None, stdout_limit, stderr_limit, timeout).await
}

async fn run_bounded_git_with_index(
    cwd: &Path,
    args: &[OsString],
    index: &Path,
    stdout_limit: usize,
    stderr_limit: usize,
    timeout: Duration,
) -> std::io::Result<BoundedOutput> {
    run_bounded_git_inner(cwd, args, Some(index), stdout_limit, stderr_limit, timeout).await
}

async fn run_bounded_git_inner(
    cwd: &Path,
    args: &[OsString],
    index: Option<&Path>,
    stdout_limit: usize,
    stderr_limit: usize,
    timeout: Duration,
) -> std::io::Result<BoundedOutput> {
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(cwd)
        .arg("--no-pager")
        .args(args)
        .env("GIT_LITERAL_PATHSPECS", "1")
        .env_remove("GIT_EXTERNAL_DIFF")
        .env_remove("GIT_DIFF_OPTS")
        .env_remove("GIT_PAGER")
        .env_remove("PAGER")
        .env_remove("LESS");
    if let Some(index) = index {
        command.env("GIT_INDEX_FILE", index);
    }
    run_bounded_command(command, stdout_limit, stderr_limit, timeout).await
}

async fn run_bounded_command(
    mut command: Command,
    stdout_limit: usize,
    stderr_limit: usize,
    timeout: Duration,
) -> std::io::Result<BoundedOutput> {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn()?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| std::io::Error::other("missing stdout pipe"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| std::io::Error::other("missing stderr pipe"))?;
    let (limit_tx, mut limit_rx) = mpsc::unbounded_channel();
    // Keep the channel open until the child exits. Otherwise both readers can reach EOF just
    // before `wait()` resolves, making `recv()` return `None` and falsely look like a limit hit.
    let limit_guard = limit_tx.clone();
    let stdout_task = tokio::spawn(read_limited(
        stdout,
        stdout_limit,
        limit_tx.clone(),
        StreamLimit::Stdout,
    ));
    let stderr_task = tokio::spawn(read_limited(
        stderr,
        stderr_limit,
        limit_tx,
        StreamLimit::Stderr,
    ));

    enum End {
        Exited(std::io::Result<ExitStatus>),
        Limit,
        Timeout,
    }
    let end = tokio::select! {
        status = child.wait() => End::Exited(status),
        _ = limit_rx.recv() => End::Limit,
        _ = tokio::time::sleep(timeout) => End::Timeout,
    };
    drop(limit_guard);
    let (status, timed_out) = match end {
        End::Exited(status) => (Some(status?), false),
        End::Limit => {
            let _ = child.kill().await;
            let status = child.wait().await.ok();
            (status, false)
        }
        End::Timeout => {
            let _ = child.kill().await;
            let status = child.wait().await.ok();
            (status, true)
        }
    };
    let stdout = stdout_task.await.map_err(join_error)??;
    let stderr = stderr_task.await.map_err(join_error)??;
    Ok(BoundedOutput {
        status,
        stdout: stdout.bytes,
        stderr: stderr.bytes,
        stdout_truncated: stdout.truncated,
        stderr_truncated: stderr.truncated,
        timed_out,
    })
}

async fn read_limited<R: AsyncRead + Unpin>(
    mut reader: R,
    limit: usize,
    limit_tx: mpsc::UnboundedSender<StreamLimit>,
    stream: StreamLimit,
) -> std::io::Result<LimitedBytes> {
    let mut bytes = Vec::with_capacity(limit.min(64 * 1024));
    let mut buffer = [0_u8; 8192];
    loop {
        let read = reader.read(&mut buffer).await?;
        if read == 0 {
            return Ok(LimitedBytes {
                bytes,
                truncated: false,
            });
        }
        let remaining = limit.saturating_sub(bytes.len());
        if read > remaining {
            bytes.extend_from_slice(&buffer[..remaining]);
            let _ = limit_tx.send(stream);
            return Ok(LimitedBytes {
                bytes,
                truncated: true,
            });
        }
        bytes.extend_from_slice(&buffer[..read]);
    }
}

fn join_error(error: tokio::task::JoinError) -> std::io::Error {
    std::io::Error::other(format!("diff reader failed: {error}"))
}

fn incorporate_output_reasons(output: &BoundedOutput, reasons: &mut Vec<String>, prefix: &str) {
    if output.timed_out {
        push_reason(reasons, "timeout");
    }
    if output.stdout_truncated {
        push_reason(reasons, &format!("{prefix}stdout_limit"));
    }
    if output.stderr_truncated {
        push_reason(reasons, &format!("{prefix}stderr_limit"));
    }
}

fn ensure_diff_success(output: &BoundedOutput) -> std::io::Result<()> {
    let deliberately_stopped =
        output.timed_out || output.stdout_truncated || output.stderr_truncated;
    if !deliberately_stopped && output.status.is_some_and(|status| !status.success()) {
        return Err(command_error(&output.stderr));
    }
    Ok(())
}

fn push_reason(reasons: &mut Vec<String>, reason: &str) {
    if !reasons.iter().any(|existing| existing == reason) {
        reasons.push(reason.to_string());
    }
}

fn joined_reasons(reasons: &[String]) -> Option<String> {
    (!reasons.is_empty()).then(|| reasons.join(","))
}

fn bounded_text(bytes: Vec<u8>, limit: usize) -> (String, bool) {
    let mut text = String::from_utf8_lossy(&bytes).into_owned();
    if text.len() <= limit {
        return (text, false);
    }
    let mut boundary = limit;
    while boundary > 0 && !text.is_char_boundary(boundary) {
        boundary -= 1;
    }
    text.truncate(boundary);
    (text, true)
}

/// Commit exactly the current index. Staging is always an explicit operation through
/// [`stage_paths`]; this function never performs an implicit `git add`.
pub async fn commit(cwd: &Path, message: &str) -> std::io::Result<String> {
    run(cwd, &["commit", "-m", message]).await
}

/// `git push` (uses the branch's configured upstream).
pub async fn push(cwd: &Path) -> std::io::Result<String> {
    run(cwd, &["push"]).await
}

/// Push the current branch and open a provider-backed change request. Returns its URL.
///
/// Kept as a compatibility entry point for existing frontends; provider detection, capability
/// checks, and CLI dispatch live behind the hosted source-control seam.
pub async fn create_pr(cwd: &Path, title: &str, body: &str) -> std::io::Result<String> {
    crate::source_control::create_change_request(cwd, title, body).await
}

/// Suggest a Conventional-Commits-style message from the working-tree changes.
pub async fn suggest_commit_message(cwd: &Path) -> String {
    let status = status(cwd).await;
    let staged: Vec<GitFile> = status
        .files
        .into_iter()
        .filter(|file| file.staged)
        .collect();
    suggest_from_files(&staged)
}

/// The pure part of [`suggest_commit_message`], for testing.
pub fn suggest_from_files(files: &[GitFile]) -> String {
    if files.is_empty() {
        return "chore: no staged changes".to_string();
    }
    let kind = if files.iter().all(|file| file.state == "added") {
        "feat"
    } else if files.iter().any(|file| file.path.contains("test")) {
        "test"
    } else if files.iter().all(|file| file.path.ends_with(".md")) {
        "docs"
    } else {
        "chore"
    };

    let first_segment = |path: &str| path.split('/').next().unwrap_or("").to_string();
    let scopes: std::collections::BTreeSet<String> =
        files.iter().map(|file| first_segment(&file.path)).collect();
    let scope = if scopes.len() == 1 {
        scopes.into_iter().next().unwrap_or_default()
    } else {
        String::new()
    };

    let summary = if files.len() == 1 {
        format!("update {}", files[0].path)
    } else {
        format!("update {} files", files.len())
    };

    if scope.is_empty() || scope.contains('.') {
        format!("{kind}: {summary}")
    } else {
        format!("{kind}({scope}): {summary}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestRepo {
        path: std::path::PathBuf,
    }

    impl TestRepo {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "codetwo-git-{label}-{}",
                uuid::Uuid::new_v4().simple()
            ));
            std::fs::create_dir_all(&path).unwrap();
            let repo = Self { path };
            repo.git(&["init", "-q"]);
            repo.git(&["config", "user.email", "t@t.dev"]);
            repo.git(&["config", "user.name", "C2 Test"]);
            repo
        }

        fn new_sha256(label: &str) -> Option<Self> {
            let path = std::env::temp_dir().join(format!(
                "codetwo-git-{label}-{}",
                uuid::Uuid::new_v4().simple()
            ));
            std::fs::create_dir_all(&path).unwrap();
            let output = std::process::Command::new("git")
                .arg("-C")
                .arg(&path)
                .args(["init", "-q", "--object-format=sha256"])
                .output()
                .unwrap();
            if !output.status.success() {
                let _ = std::fs::remove_dir_all(&path);
                return None;
            }
            let repo = Self { path };
            repo.git(&["config", "user.email", "t@t.dev"]);
            repo.git(&["config", "user.name", "C2 Test"]);
            Some(repo)
        }

        fn git(&self, args: &[&str]) -> String {
            let output = std::process::Command::new("git")
                .arg("-C")
                .arg(&self.path)
                .args(args)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "git {args:?} failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            String::from_utf8_lossy(&output.stdout).into_owned()
        }

        fn write(&self, path: &str, contents: &str) {
            let path = self.path.join(path);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).unwrap();
            }
            std::fs::write(path, contents).unwrap();
        }

        async fn stage_and_commit(&self, paths: &[&str], message: &str) {
            let paths: Vec<String> = paths.iter().map(|path| (*path).to_string()).collect();
            stage_paths(&self.path, &paths).await.unwrap();
            commit(&self.path, message).await.unwrap();
        }
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn file(path: &str, state: &str) -> GitFile {
        GitFile {
            path: path.into(),
            original_path: None,
            staged: false,
            unstaged: true,
            state: state.into(),
            staged_state: None,
            unstaged_state: Some(state.into()),
        }
    }

    #[test]
    fn parses_branch_ahead_behind_and_dual_state() {
        let sample = "\
# branch.oid abc123
# branch.head main
# branch.ab +2 -1
1 MM N... 100644 100644 100644 aaa bbb src/main.rs
1 A. N... 000000 100644 100644 000 ccc new.rs
? notes.txt
";
        let status = parse_status(sample);
        assert!(status.is_repo);
        assert_eq!(status.branch, "main");
        assert_eq!((status.ahead, status.behind), (2, 1));
        let modified = status
            .files
            .iter()
            .find(|file| file.path == "src/main.rs")
            .unwrap();
        assert!(modified.staged && modified.unstaged);
        assert_eq!(modified.staged_state.as_deref(), Some("modified"));
        assert_eq!(modified.unstaged_state.as_deref(), Some("modified"));
        assert!(status
            .files
            .iter()
            .any(|file| file.path == "new.rs" && file.staged && !file.unstaged));
        assert!(status.files.iter().any(|file| {
            file.path == "notes.txt" && file.state == "untracked" && file.unstaged
        }));
    }

    #[test]
    fn parses_nul_delimited_rename_with_original_path() {
        let sample = b"# branch.head main\0\
2 RM N... 100644 100644 100644 aaa bbb R100 new name\nline.txt\0old name\nline.txt\0";
        let status = parse_status_z(sample);
        let renamed = &status.files[0];
        assert_eq!(renamed.path, "new name\nline.txt");
        assert_eq!(renamed.original_path.as_deref(), Some("old name\nline.txt"));
        assert_eq!(renamed.staged_state.as_deref(), Some("renamed"));
        assert_eq!(renamed.unstaged_state.as_deref(), Some("modified"));
    }

    #[tokio::test]
    async fn real_status_reports_mm_and_rename() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("status");
        repo.write("both.txt", "one\n");
        repo.write("old name.txt", "rename me\n");
        repo.stage_and_commit(&["both.txt", "old name.txt"], "init")
            .await;

        repo.write("both.txt", "two\n");
        stage_paths(&repo.path, &["both.txt".into()]).await.unwrap();
        repo.write("both.txt", "three\n");
        std::fs::rename(
            repo.path.join("old name.txt"),
            repo.path.join("new name.txt"),
        )
        .unwrap();
        stage_paths(&repo.path, &["old name.txt".into(), "new name.txt".into()])
            .await
            .unwrap();
        repo.write("new name.txt", "rename me\nthen modify\n");

        let staged_status = status(&repo.path).await;
        let both = staged_status
            .files
            .iter()
            .find(|file| file.path == "both.txt")
            .unwrap();
        assert!(both.staged && both.unstaged, "{both:?}");
        let renamed = staged_status
            .files
            .iter()
            .find(|file| file.path == "new name.txt")
            .unwrap();
        assert_eq!(renamed.original_path.as_deref(), Some("old name.txt"));
        assert!(renamed.staged && renamed.unstaged, "{renamed:?}");

        unstage_paths(&repo.path, &["old name.txt".into(), "new name.txt".into()])
            .await
            .unwrap();
        let status = status(&repo.path).await;
        let rename_paths: Vec<&GitFile> = status
            .files
            .iter()
            .filter(|file| {
                file.path == "old name.txt"
                    || file.path == "new name.txt"
                    || file.original_path.as_deref() == Some("old name.txt")
            })
            .collect();
        assert!(!rename_paths.is_empty());
        assert!(rename_paths
            .iter()
            .all(|file| !file.staged && file.unstaged));
    }

    #[tokio::test]
    async fn literal_stage_and_unstage_paths_work_on_unborn_branch() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("literal-unborn");
        let literal = ":(glob)*.txt";
        let other = "other.txt";
        let newline = "line\nbreak.txt";
        repo.write(literal, "literal\n");
        repo.write(other, "other\n");
        repo.write(newline, "newline\n");

        stage_paths(&repo.path, &[literal.into(), newline.into()])
            .await
            .unwrap();
        let staged_status = status(&repo.path).await;
        assert!(staged_status
            .files
            .iter()
            .any(|file| file.path == literal && file.staged));
        assert!(staged_status
            .files
            .iter()
            .any(|file| file.path == other && !file.staged));

        // AM on an unborn branch still has to be removable from the index.
        repo.write(literal, "modified after staging\n");
        unstage_paths(&repo.path, &[literal.into(), newline.into()])
            .await
            .unwrap();
        let status = status(&repo.path).await;
        assert!(status
            .files
            .iter()
            .filter(|file| file.path == literal || file.path == newline)
            .all(|file| !file.staged && file.state == "untracked"));
    }

    #[tokio::test]
    async fn unborn_diff_supports_all_and_staged_scopes() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("unborn-diff");
        repo.write("new.txt", "staged version\n");
        stage_paths(&repo.path, &["new.txt".into()]).await.unwrap();
        repo.write("new.txt", "working version\n");

        let staged = diff(&repo.path, None, DiffScope::Staged).await.unwrap();
        let all = diff(&repo.path, None, DiffScope::All).await.unwrap();
        assert!(staged.text.contains("+staged version"), "{}", staged.text);
        assert!(!staged.text.contains("+working version"), "{}", staged.text);
        assert!(all.text.contains("+working version"), "{}", all.text);
        assert_eq!(staged.files, 1);
        assert_eq!(all.files, 1);
    }

    #[tokio::test]
    async fn unborn_sha256_repo_generates_its_own_empty_tree() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let Some(repo) = TestRepo::new_sha256("unborn-sha256") else {
            return;
        };
        repo.write("new.txt", "sha256\n");
        stage_paths(&repo.path, &["new.txt".into()]).await.unwrap();

        let empty_tree = head_or_empty_tree(&repo.path).await.unwrap();
        assert_eq!(empty_tree.len(), 64, "{empty_tree}");
        let result = diff(&repo.path, None, DiffScope::Staged).await.unwrap();
        assert!(result.text.contains("+sha256"), "{}", result.text);
    }

    #[tokio::test]
    async fn path_operations_reject_more_than_256_paths() {
        let repo = TestRepo::new("path-cap");
        let paths: Vec<String> = (0..=MAX_PATHS_PER_OPERATION)
            .map(|index| format!("{index}.txt"))
            .collect();
        let error = stage_paths(&repo.path, &paths).await.unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
    }

    #[tokio::test]
    async fn commit_is_index_only() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("index-only");
        repo.write("staged.txt", "old staged\n");
        repo.write("unstaged.txt", "old unstaged\n");
        repo.stage_and_commit(&["staged.txt", "unstaged.txt"], "init")
            .await;

        repo.write("staged.txt", "new staged\n");
        repo.write("unstaged.txt", "new unstaged\n");
        stage_paths(&repo.path, &["staged.txt".into()])
            .await
            .unwrap();
        commit(&repo.path, "selected only").await.unwrap();

        assert_eq!(repo.git(&["show", "HEAD:staged.txt"]), "new staged\n");
        assert_eq!(repo.git(&["show", "HEAD:unstaged.txt"]), "old unstaged\n");
        let status = status(&repo.path).await;
        assert!(status
            .files
            .iter()
            .any(|file| { file.path == "unstaged.txt" && !file.staged && file.unstaged }));
    }

    #[tokio::test]
    async fn diff_scopes_and_stat_are_distinct() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("scope");
        repo.write("both.txt", "one\n");
        repo.stage_and_commit(&["both.txt"], "init").await;
        repo.write("both.txt", "two\n");
        stage_paths(&repo.path, &["both.txt".into()]).await.unwrap();
        repo.write("both.txt", "three\n");

        let staged = diff(&repo.path, None, DiffScope::Staged).await.unwrap();
        let unstaged = diff(&repo.path, None, DiffScope::Unstaged).await.unwrap();
        let all = diff(&repo.path, None, DiffScope::All).await.unwrap();
        assert!(staged.text.contains("+two"), "{}", staged.text);
        assert!(!staged.text.contains("+three"), "{}", staged.text);
        assert!(unstaged.text.contains("+three"), "{}", unstaged.text);
        assert!(all.text.contains("+three"), "{}", all.text);
        let stat = diff_stat(&repo.path).await.unwrap();
        assert_eq!((stat.added, stat.deleted, stat.files), (1, 1, 1));
    }

    #[tokio::test]
    async fn diff_stat_counts_a_rename_once() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("rename-stat");
        repo.write("old.txt", "one\ntwo\n");
        repo.stage_and_commit(&["old.txt"], "init").await;
        std::fs::rename(repo.path.join("old.txt"), repo.path.join("new.txt")).unwrap();
        stage_paths(&repo.path, &["old.txt".into(), "new.txt".into()])
            .await
            .unwrap();

        let stat = diff_stat(&repo.path).await.unwrap();
        assert_eq!((stat.added, stat.deleted, stat.files), (0, 0, 1));
        assert!(!stat.truncated);
    }

    #[tokio::test]
    async fn path_scoped_diff_preserves_both_sides_of_a_rename() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("path-rename");
        repo.write("old.txt", "same contents\n");
        repo.stage_and_commit(&["old.txt"], "init").await;
        std::fs::rename(repo.path.join("old.txt"), repo.path.join("new.txt")).unwrap();
        stage_paths(&repo.path, &["old.txt".into(), "new.txt".into()])
            .await
            .unwrap();

        let result = diff(&repo.path, Some("new.txt"), DiffScope::Staged)
            .await
            .unwrap();
        assert!(
            result.text.contains("rename from old.txt"),
            "{}",
            result.text
        );
        assert!(result.text.contains("rename to new.txt"), "{}", result.text);
        assert_eq!(result.files, 1);
    }

    #[tokio::test]
    async fn all_and_unstaged_include_untracked_but_staged_does_not() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("untracked-diff");
        repo.write("base.txt", "base\n");
        repo.stage_and_commit(&["base.txt"], "init").await;
        repo.write("untracked name.txt", "first\nsecond\n");

        let all = diff(&repo.path, None, DiffScope::All).await.unwrap();
        let unstaged = diff(&repo.path, Some("untracked name.txt"), DiffScope::Unstaged)
            .await
            .unwrap();
        let staged = diff(&repo.path, None, DiffScope::Staged).await.unwrap();
        assert!(all.text.contains("new file mode"), "{}", all.text);
        assert!(all.text.contains("+first"), "{}", all.text);
        assert!(unstaged.text.contains("+second"), "{}", unstaged.text);
        assert!(staged.text.is_empty(), "{}", staged.text);

        let stat = diff_stat(&repo.path).await.unwrap();
        assert_eq!((stat.added, stat.deleted, stat.files), (2, 0, 1));
    }

    #[tokio::test]
    async fn diff_does_not_execute_external_diff_or_textconv() {
        if crate::provider::which("git").is_none() {
            return;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;

            let repo = TestRepo::new("no-external");
            repo.write("tracked.txt", "one\n");
            repo.write(".gitattributes", "*.txt diff=evil\n");
            repo.stage_and_commit(&["tracked.txt", ".gitattributes"], "init")
                .await;
            let marker = repo.path.join("external-ran");
            let script = repo.path.join("evil-diff");
            std::fs::write(
                &script,
                format!("#!/bin/sh\ntouch '{}'\nexit 0\n", marker.display()),
            )
            .unwrap();
            let mut permissions = std::fs::metadata(&script).unwrap().permissions();
            permissions.set_mode(0o755);
            std::fs::set_permissions(&script, permissions).unwrap();
            repo.git(&["config", "diff.external", script.to_str().unwrap()]);
            repo.git(&["config", "diff.evil.textconv", script.to_str().unwrap()]);
            repo.write("tracked.txt", "two\n");

            let result = diff(&repo.path, None, DiffScope::All).await.unwrap();
            assert!(result.text.contains("+two"), "{}", result.text);
            assert!(!marker.exists(), "external diff/textconv was executed");
        }
    }

    #[tokio::test]
    async fn diff_enforces_stdout_byte_limit() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("byte-limit");
        repo.write("large.txt", "old\n");
        repo.stage_and_commit(&["large.txt"], "init").await;
        repo.write("large.txt", &format!("{}\n", "new line\n".repeat(200)));
        let plan = DiffPlan {
            scope: DiffScope::All,
            base: Some(head_or_empty_tree(&repo.path).await.unwrap()),
            path: None,
        };
        let result = diff_with_limits(
            &repo.path,
            &plan,
            DiffLimits {
                stdout_bytes: 128,
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert!(result.truncated, "{result:?}");
        assert_eq!(result.truncation_reason.as_deref(), Some("stdout_limit"));
        assert!(result.returned_bytes <= 128, "{result:?}");
    }

    #[tokio::test]
    async fn diff_enforces_256_file_limit() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("file-limit");
        let mut paths = Vec::new();
        for index in 0..=MAX_DIFF_FILES {
            let path = format!("files/{index:03}.txt");
            repo.write(&path, "old\n");
            paths.push(path);
        }
        for chunk in paths.chunks(MAX_PATHS_PER_OPERATION) {
            stage_paths(&repo.path, chunk).await.unwrap();
        }
        commit(&repo.path, "init").await.unwrap();
        for path in &paths {
            repo.write(path, "new\n");
        }

        let result = diff(&repo.path, None, DiffScope::All).await.unwrap();
        assert!(result.truncated, "{result:?}");
        assert_eq!(result.truncation_reason.as_deref(), Some("file_limit"));
        assert_eq!(result.files, MAX_DIFF_FILES);
        assert!(!result.text.contains("files/256.txt"), "{}", result.text);

        let stat = diff_stat(&repo.path).await.unwrap();
        assert!(stat.truncated, "{stat:?}");
        assert_eq!(stat.truncation_reason.as_deref(), Some("file_limit"));
        assert_eq!(stat.files, MAX_DIFF_FILES);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn bounded_runner_kills_on_timeout() {
        use std::os::unix::fs::PermissionsExt;

        let repo = TestRepo::new("timeout");
        let script = repo.path.join("slow-command");
        std::fs::write(&script, "#!/bin/sh\nexec sleep 5\n").unwrap();
        let mut permissions = std::fs::metadata(&script).unwrap().permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&script, permissions).unwrap();
        let command = Command::new(script);
        let started = Instant::now();
        let output = run_bounded_command(command, 1024, 1024, Duration::from_millis(50))
            .await
            .unwrap();
        assert!(output.timed_out);
        assert!(started.elapsed() < Duration::from_secs(2));

        repo.write("tracked.txt", "one\n");
        repo.stage_and_commit(&["tracked.txt"], "init").await;
        repo.write("tracked.txt", "two\n");
        let plan = DiffPlan {
            scope: DiffScope::All,
            base: Some(head_or_empty_tree(&repo.path).await.unwrap()),
            path: None,
        };
        let result = diff_with_limits(
            &repo.path,
            &plan,
            DiffLimits {
                timeout: Duration::ZERO,
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert!(result.truncated);
        assert_eq!(result.truncation_reason.as_deref(), Some("timeout"));
    }

    #[test]
    fn commit_message_suggestions() {
        assert_eq!(suggest_from_files(&[]), "chore: no staged changes");
        assert_eq!(
            suggest_from_files(&[file("src/main.rs", "modified")]),
            "chore(src): update src/main.rs"
        );
        assert_eq!(
            suggest_from_files(&[file("src/a.rs", "added"), file("src/b.rs", "added")]),
            "feat(src): update 2 files"
        );
        assert!(suggest_from_files(&[file("README.md", "modified")]).starts_with("docs"));
        assert!(suggest_from_files(&[file("tests/x.rs", "modified")]).starts_with("test"));
    }

    #[tokio::test]
    async fn commit_message_uses_only_staged_files() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("suggest-staged");
        repo.write("src/new.rs", "new\n");
        repo.write("tests/untracked.rs", "test\n");
        stage_paths(&repo.path, &["src/new.rs".into()])
            .await
            .unwrap();
        assert_eq!(
            suggest_commit_message(&repo.path).await,
            "feat(src): update src/new.rs"
        );

        unstage_paths(&repo.path, &["src/new.rs".into()])
            .await
            .unwrap();
        assert_eq!(
            suggest_commit_message(&repo.path).await,
            "chore: no staged changes"
        );
    }

    #[tokio::test]
    async fn create_pr_stops_when_push_fails() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("pr-push-failure");
        repo.write("tracked.txt", "one\n");
        repo.stage_and_commit(&["tracked.txt"], "init").await;
        let error = create_pr(&repo.path, "must not open", "push has no remote")
            .await
            .unwrap_err();
        assert!(!error.to_string().is_empty());
    }

    #[tokio::test]
    async fn checkpoint_diff_revert_and_commit() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("checkpoint");
        repo.write("a.txt", "1\n");
        repo.stage_and_commit(&["a.txt"], "init").await;

        let checkpoint = checkpoint(&repo.path, "cp1").await.unwrap();
        repo.write("a.txt", "2\n");
        let result = diff_since(&repo.path, &checkpoint.commit).await.unwrap();
        assert!(result.text.contains("+2"), "{}", result.text);
        assert!(list_checkpoints(&repo.path)
            .await
            .iter()
            .any(|candidate| candidate.id == checkpoint.id));

        revert_to(&repo.path, &checkpoint.commit).await.unwrap();
        assert_eq!(
            std::fs::read_to_string(repo.path.join("a.txt")).unwrap(),
            "1\n"
        );
    }
}
