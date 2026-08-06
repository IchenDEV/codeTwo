//! Bounded, read-only content search for the active workspace.
//!
//! The module deliberately shells out to ripgrep with an explicit, config-free argv rather than
//! maintaining a second persistent index. It owns the process, byte, time, file, and result limits
//! so every frontend gets the same truthful truncation semantics.

use std::collections::HashMap;
use std::ffi::OsString;
use std::future::pending;
use std::path::{Path, PathBuf};
use std::process::{ExitStatus, Stdio};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;
use tokio::sync::{mpsc, watch};

const MAX_QUERY_CHARS: usize = 256;
const MAX_RESULTS: usize = 500;
const MAX_MATCHES_PER_FILE: usize = 100;
const RG_MATCHES_PER_FILE_PROBE: usize = MAX_MATCHES_PER_FILE + 1;
const MAX_STDOUT_BYTES: usize = 4 * 1024 * 1024;
const MAX_STDERR_BYTES: usize = 64 * 1024;
const MAX_PREVIEW_CHARS: usize = 1_000;
const SEARCH_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceSearchOptions {
    #[serde(default)]
    pub regex: bool,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub whole_word: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceContentMatch {
    /// Canonical workspace-relative path, with `/` separators for frontend portability.
    pub path: String,
    /// One-based line number.
    pub line: usize,
    /// One-based UTF-16 column, matching Monaco's position model.
    pub column: usize,
    /// The source line without its line ending. It is capped independently of process output.
    pub preview: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceSearchResult {
    pub matches: Vec<WorkspaceContentMatch>,
    pub truncated: bool,
    pub truncation_reason: Option<String>,
}

/// One-shot cancellation for an in-flight workspace search.
///
/// A frontend should create one handle per request, retain a clone beside its request id, and call
/// [`cancel`](Self::cancel) when a newer query supersedes it. Cancellation kills and reaps ripgrep;
/// it never returns partial matches that a caller might mistake for a complete response.
#[derive(Debug, Clone)]
pub struct WorkspaceSearchCancellation {
    sender: watch::Sender<bool>,
}

impl Default for WorkspaceSearchCancellation {
    fn default() -> Self {
        Self::new()
    }
}

impl WorkspaceSearchCancellation {
    pub fn new() -> Self {
        let (sender, _receiver) = watch::channel(false);
        Self { sender }
    }

    pub fn cancel(&self) {
        self.sender.send_replace(true);
    }

    pub fn is_cancelled(&self) -> bool {
        *self.sender.borrow()
    }

    fn subscribe(&self) -> watch::Receiver<bool> {
        self.sender.subscribe()
    }
}

#[derive(Debug, Clone, Copy)]
struct SearchLimits {
    results: usize,
    stdout_bytes: usize,
    stderr_bytes: usize,
    timeout: Duration,
}

impl Default for SearchLimits {
    fn default() -> Self {
        Self {
            results: MAX_RESULTS,
            stdout_bytes: MAX_STDOUT_BYTES,
            stderr_bytes: MAX_STDERR_BYTES,
            timeout: SEARCH_TIMEOUT,
        }
    }
}

/// Search text files below `cwd` with ripgrep.
///
/// Ripgrep configuration is disabled, ignored/generated directories are explicitly excluded, and
/// symlinks are not followed. Missing ripgrep is an actionable error rather than an implicit slow
/// recursive fallback with different semantics.
pub async fn search_contents(
    cwd: &Path,
    query: &str,
    options: WorkspaceSearchOptions,
    limit: usize,
) -> std::io::Result<WorkspaceSearchResult> {
    validate_query(query, limit)?;
    let ripgrep = crate::provider::which("rg").ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "workspace content search requires ripgrep (rg) on PATH",
        )
    })?;
    search_with_limits(
        cwd,
        query,
        options,
        SearchLimits {
            results: limit,
            ..Default::default()
        },
        &ripgrep,
    )
    .await
}

/// The cancellable form of [`search_contents`].
///
/// Cancellation is intentionally an explicit request-scoped capability instead of a global flag:
/// simultaneous frontends must not be able to cancel each other's searches accidentally.
pub async fn search_contents_with_cancellation(
    cwd: &Path,
    query: &str,
    options: WorkspaceSearchOptions,
    limit: usize,
    cancellation: &WorkspaceSearchCancellation,
) -> std::io::Result<WorkspaceSearchResult> {
    validate_query(query, limit)?;
    if cancellation.is_cancelled() {
        return Err(cancelled_error());
    }
    let ripgrep = crate::provider::which("rg").ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "workspace content search requires ripgrep (rg) on PATH",
        )
    })?;
    search_with_limits_and_cancellation(
        cwd,
        query,
        options,
        SearchLimits {
            results: limit,
            ..Default::default()
        },
        &ripgrep,
        Some(cancellation.subscribe()),
    )
    .await
}

async fn search_with_limits(
    cwd: &Path,
    query: &str,
    options: WorkspaceSearchOptions,
    limits: SearchLimits,
    ripgrep: &Path,
) -> std::io::Result<WorkspaceSearchResult> {
    search_with_limits_and_cancellation(cwd, query, options, limits, ripgrep, None).await
}

async fn search_with_limits_and_cancellation(
    cwd: &Path,
    query: &str,
    options: WorkspaceSearchOptions,
    limits: SearchLimits,
    ripgrep: &Path,
    cancellation: Option<watch::Receiver<bool>>,
) -> std::io::Result<WorkspaceSearchResult> {
    validate_query(query, limits.results)?;
    let root = cwd.canonicalize().map_err(|error| {
        std::io::Error::new(
            error.kind(),
            format!("can't open workspace {}: {error}", cwd.display()),
        )
    })?;
    if !root.is_dir() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "workspace search root is not a directory",
        ));
    }

    let mut command = Command::new(ripgrep);
    command
        .current_dir(&root)
        .args(rg_arguments(query, options));

    let output = run_bounded(
        command,
        root.clone(),
        limits.results,
        limits.stdout_bytes,
        limits.stderr_bytes,
        limits.timeout,
        cancellation,
    )
    .await?;
    if output.cancelled {
        return Err(cancelled_error());
    }
    let deliberately_stopped = output.timed_out
        || output.stdout_truncated
        || output.stderr_truncated
        || output.result_truncated;
    let exit_code = output.status.and_then(|status| status.code());
    if !deliberately_stopped && !matches!(exit_code, Some(0 | 1)) {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            if detail.is_empty() {
                "ripgrep rejected the workspace search".to_string()
            } else {
                detail
            },
        ));
    }

    let mut reasons = Vec::new();
    if output.timed_out {
        reasons.push("timeout".to_string());
    }
    if output.stdout_truncated {
        reasons.push("stdout_limit".to_string());
    }
    if output.stderr_truncated {
        reasons.push("stderr_limit".to_string());
    }
    if output.result_truncated {
        reasons.push("result_limit".to_string());
    }
    let mut matches = parse_rg_json(&root, &output.stdout, limits.results, &mut reasons)?;
    if matches.len() > limits.results {
        matches.truncate(limits.results);
        push_reason(&mut reasons, "result_limit");
    }

    Ok(WorkspaceSearchResult {
        matches,
        truncated: !reasons.is_empty(),
        truncation_reason: (!reasons.is_empty()).then(|| reasons.join(",")),
    })
}

fn rg_arguments(query: &str, options: WorkspaceSearchOptions) -> Vec<OsString> {
    let mut arguments = [
        "--no-config",
        "--json",
        "--color",
        "never",
        "--no-messages",
        "--no-follow",
        "--line-number",
        "--column",
        "--max-filesize",
        "2M",
        "--max-count",
    ]
    .into_iter()
    .map(OsString::from)
    .collect::<Vec<_>>();
    arguments.push(RG_MATCHES_PER_FILE_PROBE.to_string().into());
    arguments.push(
        if options.case_sensitive {
            "--case-sensitive"
        } else {
            "--ignore-case"
        }
        .into(),
    );
    if !options.regex {
        arguments.push("--fixed-strings".into());
    }
    if options.whole_word {
        arguments.push("--word-regexp".into());
    }
    for directory in [
        ".git",
        "node_modules",
        "target",
        "dist",
        "build",
        "vendor",
        ".next",
        "__pycache__",
        ".venv",
    ] {
        arguments.push("--glob".into());
        arguments.push(format!("!**/{directory}/**").into());
    }
    arguments.extend(["--".into(), query.into(), ".".into()]);
    arguments
}

fn cancelled_error() -> std::io::Error {
    std::io::Error::new(
        std::io::ErrorKind::Interrupted,
        "workspace content search was cancelled",
    )
}

fn validate_query(query: &str, limit: usize) -> std::io::Result<()> {
    if query.trim().is_empty() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "workspace search query is empty",
        ));
    }
    if query.chars().count() > MAX_QUERY_CHARS {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("workspace search query exceeds {MAX_QUERY_CHARS} characters"),
        ));
    }
    if query.chars().any(char::is_control) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "workspace search query contains control characters",
        ));
    }
    if limit == 0 || limit > MAX_RESULTS {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("workspace search limit must be between 1 and {MAX_RESULTS}"),
        ));
    }
    Ok(())
}

fn parse_rg_json(
    root: &Path,
    bytes: &[u8],
    result_limit: usize,
    reasons: &mut Vec<String>,
) -> std::io::Result<Vec<WorkspaceContentMatch>> {
    let mut matches = Vec::new();
    let mut per_file = HashMap::<String, usize>::new();
    let line_count = bytes.split(|byte| *byte == b'\n').count();
    let may_have_partial_tail = !bytes.ends_with(b"\n")
        && reasons.iter().any(|reason| {
            matches!(
                reason.as_str(),
                "timeout" | "stdout_limit" | "stderr_limit" | "result_limit"
            )
        });
    for (index, raw_line) in bytes.split(|byte| *byte == b'\n').enumerate() {
        if raw_line.is_empty() {
            continue;
        }
        let message: serde_json::Value = match serde_json::from_slice(raw_line) {
            Ok(message) => message,
            Err(_) if may_have_partial_tail && index + 1 == line_count => {
                push_reason(reasons, "partial_record");
                break;
            }
            Err(error) => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("ripgrep returned invalid JSON: {error}"),
                ));
            }
        };
        let Some(parsed) = parse_match_message(root, &message, &mut per_file, reasons)? else {
            continue;
        };
        matches.push(WorkspaceContentMatch {
            path: parsed.path,
            line: parsed.line,
            column: parsed.text[..parsed.start].encode_utf16().count() + 1,
            preview: capped_preview(parsed.text, parsed.start),
        });
        // Parse one sentinel result so callers can distinguish an exact fit from truncation.
        if matches.len() > result_limit {
            push_reason(reasons, "result_limit");
            break;
        }
    }
    Ok(matches)
}

struct ParsedMatch<'a> {
    path: String,
    line: usize,
    text: &'a str,
    start: usize,
}

fn parse_match_message<'a>(
    root: &Path,
    message: &'a serde_json::Value,
    per_file: &mut HashMap<String, usize>,
    reasons: &mut Vec<String>,
) -> std::io::Result<Option<ParsedMatch<'a>>> {
    if message.get("type").and_then(|value| value.as_str()) != Some("match") {
        return Ok(None);
    }
    let data = message
        .get("data")
        .ok_or_else(|| invalid_rg_record("match record has no data"))?;
    let path_value = data
        .get("path")
        .ok_or_else(|| invalid_rg_record("match record has no path"))?;
    let path_text = match path_value.get("text").and_then(|value| value.as_str()) {
        Some(path) => path,
        None if path_value.get("bytes").is_some() => {
            push_reason(reasons, "unsupported_path_encoding");
            return Ok(None);
        }
        None => return Err(invalid_rg_record("match path is neither text nor bytes")),
    };
    let Some(path) = safe_result_path(root, path_text) else {
        push_reason(reasons, "unsafe_or_stale_path");
        return Ok(None);
    };
    let line = data
        .get("line_number")
        .and_then(|value| value.as_u64())
        .and_then(|value| usize::try_from(value).ok())
        .filter(|value| *value > 0)
        .ok_or_else(|| invalid_rg_record("match line number is missing or invalid"))?;
    let lines_value = data
        .get("lines")
        .ok_or_else(|| invalid_rg_record("match record has no line text"))?;
    let text = match lines_value.get("text").and_then(|value| value.as_str()) {
        Some(text) => text,
        None if lines_value.get("bytes").is_some() => {
            push_reason(reasons, "unsupported_content_encoding");
            return Ok(None);
        }
        None => return Err(invalid_rg_record("match line is neither text nor bytes")),
    };
    let start = data
        .get("submatches")
        .and_then(|value| value.as_array())
        .and_then(|values| values.first())
        .and_then(|value| value.get("start"))
        .and_then(|value| value.as_u64())
        .and_then(|value| usize::try_from(value).ok())
        .filter(|value| *value <= text.len() && text.is_char_boundary(*value))
        .ok_or_else(|| invalid_rg_record("first submatch has an invalid byte offset"))?;

    let seen = per_file.entry(path.clone()).or_default();
    *seen += 1;
    if *seen > MAX_MATCHES_PER_FILE {
        push_reason(reasons, "per_file_limit");
        return Ok(None);
    }
    Ok(Some(ParsedMatch {
        path,
        line,
        text,
        start,
    }))
}

fn invalid_rg_record(detail: &str) -> std::io::Error {
    std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        format!("ripgrep returned an invalid match record: {detail}"),
    )
}

fn safe_result_path(root: &Path, value: &str) -> Option<String> {
    let relative = Path::new(value);
    let portable = portable_relative_path(relative)?;
    let canonical = root.join(relative).canonicalize().ok()?;
    if !canonical.is_file() || !canonical.starts_with(root) {
        return None;
    }
    Some(portable)
}

fn portable_relative_path(path: &Path) -> Option<String> {
    if path.is_absolute() {
        return None;
    }
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::Normal(value) => parts.push(value.to_str()?.to_string()),
            std::path::Component::ParentDir
            | std::path::Component::RootDir
            | std::path::Component::Prefix(_) => return None,
        }
    }
    (!parts.is_empty()).then(|| parts.join("/"))
}

fn capped_preview(text: &str, match_start: usize) -> String {
    let text = text.trim_end_matches(['\r', '\n']);
    let total_chars = text.chars().count();
    if total_chars <= MAX_PREVIEW_CHARS {
        return text.to_string();
    }
    let content_limit = MAX_PREVIEW_CHARS.saturating_sub(2).max(1);
    let match_start = match_start.min(text.len());
    let match_char = text[..match_start].chars().count();
    let window_start = match_char
        .saturating_sub(content_limit / 2)
        .min(total_chars.saturating_sub(content_limit));
    let window_end = (window_start + content_limit).min(total_chars);
    let mut preview = String::new();
    if window_start > 0 {
        preview.push('…');
    }
    preview.extend(
        text.chars()
            .skip(window_start)
            .take(window_end - window_start),
    );
    if window_end < total_chars {
        preview.push('…');
    }
    preview
}

fn push_reason(reasons: &mut Vec<String>, reason: &str) {
    if !reasons.iter().any(|existing| existing == reason) {
        reasons.push(reason.to_string());
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SearchStop {
    StdoutLimit,
    StderrLimit,
    ResultLimit,
}

#[derive(Debug)]
struct LimitedBytes {
    bytes: Vec<u8>,
    truncated: bool,
    result_truncated: bool,
}

#[derive(Debug)]
struct BoundedOutput {
    status: Option<ExitStatus>,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    stdout_truncated: bool,
    stderr_truncated: bool,
    result_truncated: bool,
    timed_out: bool,
    cancelled: bool,
}

async fn run_bounded(
    mut command: Command,
    root: PathBuf,
    result_limit: usize,
    stdout_limit: usize,
    stderr_limit: usize,
    timeout: Duration,
    cancellation: Option<watch::Receiver<bool>>,
) -> std::io::Result<BoundedOutput> {
    command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = command.spawn()?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| std::io::Error::other("missing workspace-search stdout pipe"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| std::io::Error::other("missing workspace-search stderr pipe"))?;
    let (stop_tx, mut stop_rx) = mpsc::unbounded_channel();
    let stop_guard = stop_tx.clone();
    let stdout_task = tokio::spawn(read_rg_stdout(
        stdout,
        stdout_limit,
        result_limit,
        root,
        stop_tx.clone(),
    ));
    let stderr_task = tokio::spawn(read_limited(
        stderr,
        stderr_limit,
        stop_tx,
        SearchStop::StderrLimit,
    ));

    enum End {
        Exited(std::io::Result<ExitStatus>),
        Limit(SearchStop),
        Timeout,
        Cancelled,
    }
    let cancellation = wait_for_cancellation(cancellation);
    tokio::pin!(cancellation);
    let end = if timeout.is_zero() {
        End::Timeout
    } else {
        tokio::select! {
            status = child.wait() => End::Exited(status),
            Some(reason) = stop_rx.recv() => End::Limit(reason),
            _ = tokio::time::sleep(timeout) => End::Timeout,
            _ = &mut cancellation => End::Cancelled,
        }
    };
    drop(stop_guard);
    let (status, stop_reason, timed_out, cancelled) = match end {
        End::Exited(status) => (Some(status?), None, false, false),
        End::Limit(reason) => {
            let _ = child.kill().await;
            (child.wait().await.ok(), Some(reason), false, false)
        }
        End::Timeout => {
            let _ = child.kill().await;
            (child.wait().await.ok(), None, true, false)
        }
        End::Cancelled => {
            let _ = child.kill().await;
            (child.wait().await.ok(), None, false, true)
        }
    };
    let stdout = stdout_task.await.map_err(join_error)??;
    let stderr = stderr_task.await.map_err(join_error)??;
    Ok(BoundedOutput {
        status,
        stdout: stdout.bytes,
        stderr: stderr.bytes,
        stdout_truncated: stdout.truncated || stop_reason == Some(SearchStop::StdoutLimit),
        stderr_truncated: stderr.truncated || stop_reason == Some(SearchStop::StderrLimit),
        result_truncated: stdout.result_truncated || stop_reason == Some(SearchStop::ResultLimit),
        timed_out,
        cancelled,
    })
}

async fn wait_for_cancellation(mut cancellation: Option<watch::Receiver<bool>>) {
    let Some(receiver) = cancellation.as_mut() else {
        pending::<()>().await;
        return;
    };
    loop {
        if *receiver.borrow_and_update() {
            return;
        }
        if receiver.changed().await.is_err() {
            pending::<()>().await;
        }
    }
}

async fn read_rg_stdout<R: AsyncRead + Unpin>(
    mut reader: R,
    limit: usize,
    result_limit: usize,
    root: PathBuf,
    stop_tx: mpsc::UnboundedSender<SearchStop>,
) -> std::io::Result<LimitedBytes> {
    let mut bytes = Vec::with_capacity(limit.min(64 * 1024));
    let mut buffer = [0_u8; 8192];
    let mut scanned = 0;
    let mut accepted = 0;
    let mut per_file = HashMap::<String, usize>::new();
    let mut ignored_reasons = Vec::new();
    loop {
        let read = reader.read(&mut buffer).await?;
        if read == 0 {
            return Ok(LimitedBytes {
                bytes,
                truncated: false,
                result_truncated: false,
            });
        }
        let remaining = limit.saturating_sub(bytes.len());
        if read > remaining {
            bytes.extend_from_slice(&buffer[..remaining]);
            let _ = stop_tx.send(SearchStop::StdoutLimit);
            return Ok(LimitedBytes {
                bytes,
                truncated: true,
                result_truncated: false,
            });
        }
        bytes.extend_from_slice(&buffer[..read]);

        while let Some(newline) = bytes[scanned..].iter().position(|byte| *byte == b'\n') {
            let end = scanned + newline;
            let raw_line = &bytes[scanned..end];
            scanned = end + 1;
            if raw_line.is_empty() {
                continue;
            }
            let message: serde_json::Value = serde_json::from_slice(raw_line).map_err(|error| {
                std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("ripgrep returned invalid JSON: {error}"),
                )
            })?;
            if parse_match_message(&root, &message, &mut per_file, &mut ignored_reasons)?.is_some()
            {
                accepted += 1;
                if accepted > result_limit {
                    let _ = stop_tx.send(SearchStop::ResultLimit);
                    return Ok(LimitedBytes {
                        bytes,
                        truncated: false,
                        result_truncated: true,
                    });
                }
            }
        }
    }
}

async fn read_limited<R: AsyncRead + Unpin>(
    mut reader: R,
    limit: usize,
    stop_tx: mpsc::UnboundedSender<SearchStop>,
    stop: SearchStop,
) -> std::io::Result<LimitedBytes> {
    let mut bytes = Vec::with_capacity(limit.min(64 * 1024));
    let mut buffer = [0_u8; 8192];
    loop {
        let read = reader.read(&mut buffer).await?;
        if read == 0 {
            return Ok(LimitedBytes {
                bytes,
                truncated: false,
                result_truncated: false,
            });
        }
        let remaining = limit.saturating_sub(bytes.len());
        if read > remaining {
            bytes.extend_from_slice(&buffer[..remaining]);
            let _ = stop_tx.send(stop);
            return Ok(LimitedBytes {
                bytes,
                truncated: true,
                result_truncated: false,
            });
        }
        bytes.extend_from_slice(&buffer[..read]);
    }
}

fn join_error(error: tokio::task::JoinError) -> std::io::Error {
    std::io::Error::other(format!("workspace-search reader failed: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::Instant;

    fn match_record(path: &str, text: &str, line: usize, start: usize) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({
            "type": "match",
            "data": {
                "path": { "text": path },
                "lines": { "text": text },
                "line_number": line,
                "absolute_offset": 0,
                "submatches": [{
                    "match": { "text": "needle" },
                    "start": start,
                    "end": start + "needle".len(),
                }],
            },
        }))
        .unwrap()
    }

    #[cfg(unix)]
    fn executable_script(root: &Path, name: &str, body: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;

        let path = root.join(name);
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        let mut permissions = std::fs::metadata(&path).unwrap().permissions();
        permissions.set_mode(0o700);
        std::fs::set_permissions(&path, permissions).unwrap();
        path
    }

    fn fixture() -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("codetwo-workspace-search-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::write(
            root.join("src/main.rs"),
            "fn main() {\r\n    println!(\"Needle café\");\r\n}\r\n",
        )
        .unwrap();
        std::fs::write(
            root.join("src/lib.rs"),
            "pub fn needlework() {}\npub fn needle() {}\n",
        )
        .unwrap();
        std::fs::write(root.join("node_modules/pkg/index.js"), "needle\n").unwrap();
        std::fs::write(root.join(".git/config"), "needle\n").unwrap();
        std::fs::write(root.join("binary.bin"), b"needle\0ignored").unwrap();
        root
    }

    async fn search_fixture(
        root: &Path,
        query: &str,
        options: WorkspaceSearchOptions,
        limits: SearchLimits,
    ) -> WorkspaceSearchResult {
        let Some(rg) = crate::provider::which("rg") else {
            return WorkspaceSearchResult::default();
        };
        search_with_limits(root, query, options, limits, &rg)
            .await
            .unwrap()
    }

    #[test]
    fn argv_is_config_free_bounded_and_option_exact() {
        let literal = rg_arguments("-needle", WorkspaceSearchOptions::default());
        assert_eq!(literal.first().unwrap(), "--no-config");
        assert!(literal.iter().any(|argument| argument == "--no-follow"));
        assert!(!literal.iter().any(|argument| argument == "--max-columns"));
        assert!(literal.iter().any(|argument| argument == "--fixed-strings"));
        assert!(literal.iter().any(|argument| argument == "--ignore-case"));
        assert!(literal
            .windows(2)
            .any(|pair| pair[0] == "--glob" && pair[1] == "!**/node_modules/**"));
        let separator = literal
            .iter()
            .position(|argument| argument == "--")
            .unwrap();
        assert_eq!(literal[separator + 1], "-needle");
        assert_eq!(literal[separator + 2], ".");

        let regex = rg_arguments(
            "Needle.*",
            WorkspaceSearchOptions {
                regex: true,
                case_sensitive: true,
                whole_word: true,
            },
        );
        assert!(!regex.iter().any(|argument| argument == "--fixed-strings"));
        assert!(regex.iter().any(|argument| argument == "--case-sensitive"));
        assert!(regex.iter().any(|argument| argument == "--word-regexp"));
    }

    #[tokio::test]
    async fn literal_search_is_case_insensitive_and_reports_monaco_positions() {
        if crate::provider::which("rg").is_none() {
            return;
        }
        let root = fixture();
        let result = search_fixture(
            &root,
            "NEEDLE café",
            WorkspaceSearchOptions::default(),
            SearchLimits::default(),
        )
        .await;
        assert_eq!(result.matches.len(), 1, "{result:?}");
        assert_eq!(result.matches[0].path, "src/main.rs");
        assert_eq!(result.matches[0].line, 2);
        assert_eq!(result.matches[0].column, 15);
        assert!(!result.matches[0].preview.ends_with('\r'));
        assert!(!result.truncated);
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn utf16_column_and_long_preview_keep_the_match_visible() {
        if crate::provider::which("rg").is_none() {
            return;
        }
        let root = fixture();
        std::fs::write(root.join("src/emoji.rs"), "😀 needle\n").unwrap();
        std::fs::write(
            root.join("src/minified.js"),
            format!("{}needle\n", "x".repeat(1_200)),
        )
        .unwrap();
        let result = search_fixture(
            &root,
            "needle",
            WorkspaceSearchOptions::default(),
            SearchLimits::default(),
        )
        .await;
        let emoji = result
            .matches
            .iter()
            .find(|hit| hit.path == "src/emoji.rs")
            .unwrap();
        assert_eq!(emoji.column, 4, "emoji occupies two Monaco UTF-16 columns");
        let long = result
            .matches
            .iter()
            .find(|hit| hit.path == "src/minified.js")
            .unwrap();
        assert_eq!(long.column, 1_201);
        assert!(long.preview.contains("needle"), "{}", long.preview);
        assert!(long.preview.chars().count() <= MAX_PREVIEW_CHARS);
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn case_sensitive_search_does_not_silently_use_smart_case() {
        if crate::provider::which("rg").is_none() {
            return;
        }
        let root = fixture();
        let absent = search_fixture(
            &root,
            "NEEDLE CAFÉ",
            WorkspaceSearchOptions {
                case_sensitive: true,
                ..Default::default()
            },
            SearchLimits::default(),
        )
        .await;
        assert!(absent.matches.is_empty(), "{absent:?}");
        let present = search_fixture(
            &root,
            "Needle café",
            WorkspaceSearchOptions {
                case_sensitive: true,
                ..Default::default()
            },
            SearchLimits::default(),
        )
        .await;
        assert_eq!(present.matches.len(), 1, "{present:?}");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn whole_word_and_regex_have_distinct_semantics() {
        if crate::provider::which("rg").is_none() {
            return;
        }
        let root = fixture();
        let whole = search_fixture(
            &root,
            "needle",
            WorkspaceSearchOptions {
                whole_word: true,
                ..Default::default()
            },
            SearchLimits::default(),
        )
        .await;
        assert!(whole.matches.iter().any(|hit| hit.line == 2));
        assert!(!whole
            .matches
            .iter()
            .any(|hit| hit.path == "src/lib.rs" && hit.line == 1));

        let regex = search_fixture(
            &root,
            "needle(work)?",
            WorkspaceSearchOptions {
                regex: true,
                ..Default::default()
            },
            SearchLimits::default(),
        )
        .await;
        assert!(regex.matches.len() >= 3, "{regex:?}");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn ignores_generated_hidden_binary_and_symlink_escape_content() {
        if crate::provider::which("rg").is_none() {
            return;
        }
        let root = fixture();
        for generated in [
            "packages/a/node_modules/pkg",
            "packages/a/target/debug",
            "packages/a/dist/assets",
            "packages/a/build/output",
            "packages/a/vendor/pkg",
        ] {
            std::fs::create_dir_all(root.join(generated)).unwrap();
            std::fs::write(root.join(generated).join("generated.txt"), "needle\n").unwrap();
        }
        let mut giant = vec![b'x'; 2 * 1024 * 1024 + 1];
        giant[.."needle".len()].copy_from_slice(b"needle");
        std::fs::write(root.join("giant.txt"), giant).unwrap();
        #[cfg(unix)]
        {
            let outside = root.with_extension("outside");
            std::fs::write(&outside, "needle\n").unwrap();
            std::os::unix::fs::symlink(&outside, root.join("outside-link.txt")).unwrap();
        }
        let result = search_fixture(
            &root,
            "needle",
            WorkspaceSearchOptions::default(),
            SearchLimits::default(),
        )
        .await;
        assert!(result.matches.iter().all(|hit| {
            !hit.path.contains("node_modules")
                && !hit.path.contains(".git")
                && hit.path != "binary.bin"
                && hit.path != "giant.txt"
                && hit.path != "outside-link.txt"
                && !hit.path.contains("/node_modules/")
                && !hit.path.contains("/target/")
                && !hit.path.contains("/dist/")
                && !hit.path.contains("/build/")
                && !hit.path.contains("/vendor/")
        }));
        #[cfg(unix)]
        {
            let _ = std::fs::remove_file(root.with_extension("outside"));
        }
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn result_and_process_limits_are_truthful() {
        if crate::provider::which("rg").is_none() {
            return;
        }
        let root = fixture();
        for index in 0..10 {
            std::fs::write(root.join(format!("match-{index}.txt")), "needle\n").unwrap();
        }
        let limited = search_fixture(
            &root,
            "needle",
            WorkspaceSearchOptions::default(),
            SearchLimits {
                results: 2,
                ..Default::default()
            },
        )
        .await;
        assert_eq!(limited.matches.len(), 2);
        assert!(limited.truncated);
        assert!(limited
            .truncation_reason
            .as_deref()
            .unwrap_or_default()
            .contains("result_limit"));

        let timed_out = search_fixture(
            &root,
            "needle",
            WorkspaceSearchOptions::default(),
            SearchLimits {
                timeout: Duration::ZERO,
                ..Default::default()
            },
        )
        .await;
        assert!(timed_out.truncated);
        assert!(timed_out
            .truncation_reason
            .as_deref()
            .unwrap_or_default()
            .contains("timeout"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn parser_accepts_only_a_partial_final_record_after_a_deliberate_stop() {
        let root = fixture().canonicalize().unwrap();
        let mut bytes = match_record("src/lib.rs", "needle\n", 1, 0);
        bytes.extend_from_slice(b"\n{\"type\":\"match\"");
        for stop in ["timeout", "stdout_limit", "stderr_limit"] {
            let mut reasons = vec![stop.to_string()];
            let parsed = parse_rg_json(&root, &bytes, MAX_RESULTS, &mut reasons).unwrap();
            assert_eq!(parsed.len(), 1, "{stop}: {parsed:?}");
            assert!(reasons.iter().any(|reason| reason == "partial_record"));
        }

        let mut complete_bad_line = match_record("src/lib.rs", "needle\n", 1, 0);
        complete_bad_line.extend_from_slice(b"\nnot-json\n");
        let mut reasons = vec!["timeout".to_string()];
        let error =
            parse_rg_json(&root, &complete_bad_line, MAX_RESULTS, &mut reasons).unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn parser_rejects_malformed_match_records_and_marks_unsupported_encodings() {
        let root = fixture().canonicalize().unwrap();
        for malformed in [
            serde_json::json!({"type": "match"}),
            serde_json::json!({"type": "match", "data": {}}),
            serde_json::json!({
                "type": "match",
                "data": {
                    "path": {"text": "src/lib.rs"},
                    "lines": {"text": "needle\n"},
                    "line_number": 1,
                    "submatches": []
                }
            }),
            serde_json::json!({
                "type": "match",
                "data": {
                    "path": {"text": "src/lib.rs"},
                    "lines": {"text": "éneedle\n"},
                    "line_number": 1,
                    "submatches": [{"start": 1, "end": 7}]
                }
            }),
        ] {
            let bytes = serde_json::to_vec(&malformed).unwrap();
            let error = parse_rg_json(&root, &bytes, MAX_RESULTS, &mut Vec::new()).unwrap_err();
            assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
        }

        let path_bytes = serde_json::to_vec(&serde_json::json!({
            "type": "match",
            "data": {
                "path": {"bytes": "L/8="},
                "lines": {"text": "needle\n"},
                "line_number": 1,
                "submatches": [{"start": 0, "end": 6}]
            }
        }))
        .unwrap();
        let mut reasons = Vec::new();
        assert!(parse_rg_json(&root, &path_bytes, MAX_RESULTS, &mut reasons)
            .unwrap()
            .is_empty());
        assert!(reasons
            .iter()
            .any(|reason| reason == "unsupported_path_encoding"));

        let line_bytes = serde_json::to_vec(&serde_json::json!({
            "type": "match",
            "data": {
                "path": {"text": "src/lib.rs"},
                "lines": {"bytes": "/25lZWRsZQo="},
                "line_number": 1,
                "submatches": [{"start": 1, "end": 7}]
            }
        }))
        .unwrap();
        let mut reasons = Vec::new();
        assert!(parse_rg_json(&root, &line_bytes, MAX_RESULTS, &mut reasons)
            .unwrap()
            .is_empty());
        assert!(reasons
            .iter()
            .any(|reason| reason == "unsupported_content_encoding"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn parser_enforces_per_file_and_path_boundaries_truthfully() {
        let root = fixture().canonicalize().unwrap();
        let mut records = Vec::new();
        for line in 1..=MAX_MATCHES_PER_FILE + 1 {
            records.extend(match_record("src/lib.rs", "needle\n", line, 0));
            records.push(b'\n');
        }
        let mut reasons = Vec::new();
        let parsed = parse_rg_json(&root, &records, MAX_RESULTS, &mut reasons).unwrap();
        assert_eq!(parsed.len(), MAX_MATCHES_PER_FILE);
        assert!(reasons.iter().any(|reason| reason == "per_file_limit"));

        let unsafe_record = match_record("../outside.txt", "needle\n", 1, 0);
        let mut reasons = Vec::new();
        assert!(
            parse_rg_json(&root, &unsafe_record, MAX_RESULTS, &mut reasons)
                .unwrap()
                .is_empty()
        );
        assert!(reasons
            .iter()
            .any(|reason| reason == "unsafe_or_stale_path"));
        assert!(portable_relative_path(Path::new("../outside.txt")).is_none());
        assert!(portable_relative_path(Path::new("/outside.txt")).is_none());
        assert_eq!(
            portable_relative_path(Path::new("./src/main.rs")).as_deref(),
            Some("src/main.rs")
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(windows)]
    #[test]
    fn windows_drive_unc_and_verbatim_prefixes_are_never_workspace_relative() {
        for path in [
            r"C:relative.txt",
            r"C:\absolute.txt",
            r"\\server\share\file.txt",
            r"\\?\C:\verbatim.txt",
        ] {
            assert!(
                portable_relative_path(Path::new(path)).is_none(),
                "{path} must retain its Windows prefix and be rejected"
            );
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn result_limit_and_explicit_cancellation_kill_without_waiting_for_timeout() {
        let root = fixture();
        let first = String::from_utf8(match_record("src/lib.rs", "needle\n", 1, 0)).unwrap();
        let second = String::from_utf8(match_record("src/main.rs", "needle\n", 2, 0)).unwrap();
        let result_script = executable_script(
            &root,
            "result-limit-rg",
            &format!("printf '%s\\n' '{first}' '{second}'\nwhile :; do :; done"),
        );
        let started = Instant::now();
        let result = search_with_limits(
            &root,
            "needle",
            WorkspaceSearchOptions::default(),
            SearchLimits {
                results: 1,
                timeout: Duration::from_secs(5),
                ..Default::default()
            },
            &result_script,
        )
        .await
        .unwrap();
        assert!(started.elapsed() < Duration::from_secs(2));
        assert_eq!(result.matches.len(), 1);
        assert_eq!(result.truncation_reason.as_deref(), Some("result_limit"));

        let cancellation_script = executable_script(&root, "cancel-rg", "while :; do :; done");
        let cancellation = WorkspaceSearchCancellation::new();
        let canceller = cancellation.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            canceller.cancel();
        });
        let started = Instant::now();
        let error = search_with_limits_and_cancellation(
            &root,
            "needle",
            WorkspaceSearchOptions::default(),
            SearchLimits {
                timeout: Duration::from_secs(5),
                ..Default::default()
            },
            &cancellation_script,
            Some(cancellation.subscribe()),
        )
        .await
        .unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::Interrupted);
        assert!(started.elapsed() < Duration::from_secs(2));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn invalid_regex_and_invalid_requests_fail_explicitly() {
        if let Some(rg) = crate::provider::which("rg") {
            let root = fixture();
            let error = search_with_limits(
                &root,
                "(",
                WorkspaceSearchOptions {
                    regex: true,
                    ..Default::default()
                },
                SearchLimits::default(),
                &rg,
            )
            .await
            .unwrap_err();
            assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
            let _ = std::fs::remove_dir_all(root);
        }

        assert!(validate_query("", 20).is_err());
        assert!(validate_query("needle", 0).is_err());
        assert!(validate_query("needle", MAX_RESULTS + 1).is_err());
        assert!(validate_query(&"界".repeat(MAX_QUERY_CHARS), 20).is_ok());
        assert!(validate_query(&"x".repeat(MAX_QUERY_CHARS + 1), 20).is_err());
        assert!(validate_query("line\nbreak", 20).is_err());
        assert!(validate_query("\t", 20).is_err());

        let cancelled = WorkspaceSearchCancellation::new();
        cancelled.cancel();
        let error = search_contents_with_cancellation(
            Path::new("missing-workspace"),
            "needle",
            WorkspaceSearchOptions::default(),
            20,
            &cancelled,
        )
        .await
        .unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::Interrupted);
    }
}
