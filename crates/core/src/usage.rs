//! Usage tracking across providers — the CodexBar-style "how much have I burned, and when does it
//! reset" view.
//!
//! Provider CLIs keep local session transcripts (Codex under `~/.codex/sessions`, Claude Code under
//! `~/.claude/projects`) that record token counts. We stream their usage events into **rolling
//! windows** (5-hour session, week, month) with a percentage of your limit and a countdown to when
//! the window frees up.
//!
//! Deliberately local and best-effort: no API calls, no credentials, and tolerant of format drift —
//! we look for the usual token keys anywhere in each line rather than assuming a fixed schema.
//! Provider timestamps drive rolling buckets; file mtime is only a fallback for legacy records.

use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs::File,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, OnceLock,
    },
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader as AsyncBufReader},
    process::Command,
};

use crate::provider::{which, ProviderId};

/// Whether Code2 could obtain a provider-owned quota snapshot.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuotaStatus {
    Available,
    Unavailable,
    Unsupported,
}

/// Stable reason codes let the frontend explain failures without exposing subprocess output.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuotaReason {
    CliNotFound,
    QueryFailed,
    UnsupportedProvider,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProviderQuotaWindow {
    /// Percentage consumed, as reported by the provider. Clamped to 0–100 for rendering.
    pub used_percent: f32,
    /// Provider-defined rolling-window size. `None` means the provider omitted the duration.
    pub window_minutes: Option<i64>,
    /// Unix seconds at which the provider says this window resets.
    pub resets_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderQuotaCredits {
    pub has_credits: bool,
    pub unlimited: bool,
    /// Kept as text because providers may return fractional balances.
    pub balance: Option<String>,
}

/// A provider-owned quota result. Unsupported and unavailable states are explicit data so the UI
/// cannot silently substitute local transcript estimates for an official account limit.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProviderQuotaReport {
    pub provider: String,
    pub status: QuotaStatus,
    pub reason: Option<QuotaReason>,
    pub source: Option<String>,
    pub plan: Option<String>,
    pub limit_name: Option<String>,
    pub windows: Vec<ProviderQuotaWindow>,
    pub credits: Option<ProviderQuotaCredits>,
    pub fetched_at_ms: i64,
}

impl ProviderQuotaReport {
    fn unavailable(provider: &ProviderId, reason: QuotaReason) -> Self {
        Self {
            provider: provider.as_str().to_string(),
            status: QuotaStatus::Unavailable,
            reason: Some(reason),
            source: None,
            plan: None,
            limit_name: None,
            windows: Vec::new(),
            credits: None,
            fetched_at_ms: crate::session::now_millis(),
        }
    }

    fn unsupported(provider: &ProviderId) -> Self {
        Self {
            provider: provider.as_str().to_string(),
            status: QuotaStatus::Unsupported,
            reason: Some(QuotaReason::UnsupportedProvider),
            source: None,
            plan: None,
            limit_name: None,
            windows: Vec::new(),
            credits: None,
            fetched_at_ms: crate::session::now_millis(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexRateLimitsResponse {
    rate_limits: CodexRateLimitSnapshot,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexRateLimitSnapshot {
    #[serde(default)]
    limit_name: Option<String>,
    #[serde(default)]
    plan_type: Option<String>,
    #[serde(default)]
    primary: Option<CodexRateLimitWindow>,
    #[serde(default)]
    secondary: Option<CodexRateLimitWindow>,
    #[serde(default)]
    credits: Option<CodexCreditsSnapshot>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexRateLimitWindow {
    used_percent: f32,
    #[serde(default)]
    window_duration_mins: Option<i64>,
    #[serde(default)]
    resets_at: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexCreditsSnapshot {
    #[serde(default)]
    has_credits: bool,
    #[serde(default)]
    unlimited: bool,
    #[serde(default)]
    balance: Option<String>,
}

/// Read the selected provider's current quota without guessing limits from local token activity.
pub async fn provider_quota(provider: &ProviderId) -> ProviderQuotaReport {
    match provider {
        ProviderId::Codex => match codex_quota().await {
            Ok(report) => report,
            Err(CodexQuotaError::CliNotFound) => {
                ProviderQuotaReport::unavailable(provider, QuotaReason::CliNotFound)
            }
            Err(CodexQuotaError::QueryFailed) => {
                ProviderQuotaReport::unavailable(provider, QuotaReason::QueryFailed)
            }
        },
        _ => ProviderQuotaReport::unsupported(provider),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CodexQuotaError {
    CliNotFound,
    QueryFailed,
}

/// Ask the installed Codex CLI for its account rate limits over the official local app-server
/// protocol. Authentication remains owned by Codex; Code2 neither reads nor stores credentials.
async fn codex_quota() -> Result<ProviderQuotaReport, CodexQuotaError> {
    let executable = which("codex").ok_or(CodexQuotaError::CliNotFound)?;
    let mut child = Command::new(executable)
        .args(["app-server", "--stdio"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| CodexQuotaError::QueryFailed)?;

    let mut stdin = child.stdin.take().ok_or(CodexQuotaError::QueryFailed)?;
    let stdout = child.stdout.take().ok_or(CodexQuotaError::QueryFailed)?;

    write_rpc(
        &mut stdin,
        serde_json::json!({
            "method": "initialize",
            "id": 1,
            "params": {
                "clientInfo": { "name": "codetwo", "title": "Code2", "version": env!("CARGO_PKG_VERSION") },
                "capabilities": null
            }
        }),
    )
    .await?;

    let exchange = async {
        let mut lines = AsyncBufReader::new(stdout).lines();
        while let Some(line) = lines
            .next_line()
            .await
            .map_err(|_| CodexQuotaError::QueryFailed)?
        {
            let message: serde_json::Value =
                serde_json::from_str(&line).map_err(|_| CodexQuotaError::QueryFailed)?;
            match message.get("id").and_then(serde_json::Value::as_i64) {
                Some(1) if message.get("error").is_some() => {
                    return Err(CodexQuotaError::QueryFailed);
                }
                Some(1) => {
                    write_rpc(
                        &mut stdin,
                        serde_json::json!({ "method": "initialized", "params": {} }),
                    )
                    .await?;
                    write_rpc(
                        &mut stdin,
                        serde_json::json!({ "method": "account/rateLimits/read", "id": 2, "params": null }),
                    )
                    .await?;
                }
                Some(2) if message.get("error").is_some() => {
                    return Err(CodexQuotaError::QueryFailed);
                }
                Some(2) => {
                    let result = message.get("result").ok_or(CodexQuotaError::QueryFailed)?;
                    return parse_codex_quota(result);
                }
                _ => {}
            }
        }
        Err(CodexQuotaError::QueryFailed)
    };

    let result = tokio::time::timeout(Duration::from_secs(8), exchange)
        .await
        .map_err(|_| CodexQuotaError::QueryFailed)?;
    drop(stdin);
    let _ = child.kill().await;
    let _ = child.wait().await;
    result
}

async fn write_rpc(
    stdin: &mut tokio::process::ChildStdin,
    message: serde_json::Value,
) -> Result<(), CodexQuotaError> {
    let mut bytes = serde_json::to_vec(&message).map_err(|_| CodexQuotaError::QueryFailed)?;
    bytes.push(b'\n');
    stdin
        .write_all(&bytes)
        .await
        .map_err(|_| CodexQuotaError::QueryFailed)?;
    stdin
        .flush()
        .await
        .map_err(|_| CodexQuotaError::QueryFailed)
}

fn parse_codex_quota(result: &serde_json::Value) -> Result<ProviderQuotaReport, CodexQuotaError> {
    let response: CodexRateLimitsResponse =
        serde_json::from_value(result.clone()).map_err(|_| CodexQuotaError::QueryFailed)?;
    let snapshot = response.rate_limits;
    let windows = [snapshot.primary, snapshot.secondary]
        .into_iter()
        .flatten()
        .map(|window| ProviderQuotaWindow {
            used_percent: window.used_percent.clamp(0.0, 100.0),
            window_minutes: window.window_duration_mins,
            resets_at: window.resets_at,
        })
        .collect();
    let credits = snapshot.credits.map(|credits| ProviderQuotaCredits {
        has_credits: credits.has_credits,
        unlimited: credits.unlimited,
        balance: credits.balance,
    });

    Ok(ProviderQuotaReport {
        provider: ProviderId::Codex.as_str().to_string(),
        status: QuotaStatus::Available,
        reason: None,
        source: Some("codex_app_server".into()),
        plan: snapshot.plan_type,
        limit_name: snapshot.limit_name,
        windows,
        credits,
        fetched_at_ms: crate::session::now_millis(),
    })
}

/// One provider usage event, or one compatibility aggregate for legacy callers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UsageRecord {
    /// Unix milliseconds from the provider event; file mtime is a legacy fallback.
    pub at_ms: i64,
    pub input_tokens: u64,
    /// Cache reads — shown for context but excluded from [`UsageRecord::total`].
    #[serde(default)]
    pub cached_tokens: u64,
    pub output_tokens: u64,
    /// `codex` | `claude` | `codetwo` | …
    pub source: String,
    /// Model that produced this usage, when the transcript records one (`claude-opus-4-5-…`,
    /// `gpt-5-codex`, …). Drives the best-effort cost estimate; `None` means "can't price this".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// In-memory identity for cross-file de-duplication. Never leaves the local scanner.
    #[doc(hidden)]
    #[serde(skip)]
    pub dedupe_key: Option<String>,
}

impl UsageRecord {
    /// Fresh work only: cache reads are excluded (see [`LineUsage`]).
    pub fn total(&self) -> u64 {
        self.input_tokens + self.output_tokens
    }
}

/// Token budgets per window. `None` means "unknown" — we then show usage without a percentage
/// rather than inventing a limit.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Limits {
    pub session_5h: Option<u64>,
    pub weekly: Option<u64>,
    pub monthly: Option<u64>,
}

impl Limits {
    /// Read optional budgets from the environment so users can pin their plan's numbers.
    pub fn from_env() -> Self {
        let get = |k: &str| {
            std::env::var(k)
                .ok()
                .and_then(|v| v.trim().parse::<u64>().ok())
        };
        Limits {
            session_5h: get("CODETWO_LIMIT_5H"),
            weekly: get("CODETWO_LIMIT_WEEK"),
            monthly: get("CODETWO_LIMIT_MONTH"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UsageWindow {
    pub label: String,
    /// Window length in seconds.
    pub window_secs: i64,
    pub input_tokens: u64,
    /// Cache reads in this window (excluded from `total_tokens`).
    pub cached_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub limit: Option<u64>,
    /// 0.0–1.0 of the limit, when a limit is known.
    pub fraction: Option<f32>,
    /// Seconds until the oldest usage in this window ages out (0 when the window is empty).
    pub resets_in_secs: i64,
}

pub const FIVE_HOURS: i64 = 5 * 60 * 60;
pub const ONE_WEEK: i64 = 7 * 24 * 60 * 60;
pub const ONE_MONTH: i64 = 30 * 24 * 60 * 60;

/// Bucket records into the rolling windows.
pub fn windows(records: &[UsageRecord], now_ms: i64, limits: &Limits) -> Vec<UsageWindow> {
    vec![
        window(records, now_ms, "5h session", FIVE_HOURS, limits.session_5h),
        window(records, now_ms, "week", ONE_WEEK, limits.weekly),
        window(records, now_ms, "month", ONE_MONTH, limits.monthly),
    ]
}

fn window(
    records: &[UsageRecord],
    now_ms: i64,
    label: &str,
    window_secs: i64,
    limit: Option<u64>,
) -> UsageWindow {
    let cutoff = now_ms - window_secs * 1000;
    let inside: Vec<&UsageRecord> = records.iter().filter(|r| r.at_ms > cutoff).collect();

    let input_tokens: u64 = inside.iter().map(|r| r.input_tokens).sum();
    let cached_tokens: u64 = inside.iter().map(|r| r.cached_tokens).sum();
    let output_tokens: u64 = inside.iter().map(|r| r.output_tokens).sum();
    let total_tokens = input_tokens + output_tokens;

    // A rolling window "resets" as its oldest entry ages out.
    let resets_in_secs = inside
        .iter()
        .map(|r| r.at_ms)
        .min()
        .map(|oldest| ((oldest + window_secs * 1000) - now_ms).max(0) / 1000)
        .unwrap_or(0);

    UsageWindow {
        label: label.to_string(),
        window_secs,
        input_tokens,
        cached_tokens,
        output_tokens,
        total_tokens,
        limit,
        fraction: limit.map(|l| (total_tokens as f32 / l.max(1) as f32).min(1.0)),
        resets_in_secs,
    }
}

/// Tokens found on one transcript line.
///
/// `cached` is tracked separately and deliberately **excluded** from the headline total: a cached
/// read re-counts context the model already has, so summing it across a long session produces
/// numbers in the billions that mean nothing. `input` is fresh work (including cache *writes*).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LineUsage {
    pub input: u64,
    pub cached: u64,
    pub output: u64,
    /// True when the line reports a running total for the whole session (Codex's
    /// `total_token_usage`) rather than the cost of one message. Cumulative lines must be *maxed*,
    /// never summed, or a long session counts its tokens hundreds of times over.
    pub cumulative: bool,
}

/// Pull token counts out of one transcript line, handling the shapes providers actually emit.
pub fn parse_usage_line(line: &str) -> Option<LineUsage> {
    let value: serde_json::Value = serde_json::from_str(line).ok()?;
    let get = |node: &serde_json::Value, k: &str| node.get(k).and_then(|v| v.as_u64()).unwrap_or(0);

    // Codex: a cumulative session total nested a few levels down. Here `input_tokens` already
    // *includes* `cached_input_tokens`, so fresh input is the difference.
    if let Some(node) = find_key(&value, "total_token_usage", 0) {
        let raw_input = get(node, "input_tokens");
        let cached = get(node, "cached_input_tokens").min(raw_input);
        let output = get(node, "output_tokens");
        if raw_input > 0 || output > 0 {
            return Some(LineUsage {
                input: raw_input - cached,
                cached,
                output,
                cumulative: true,
            });
        }
    }

    // Claude & friends: per-message usage, where cache writes are new work and cache reads are not.
    for node in [
        value.get("usage"),
        value.get("message").and_then(|m| m.get("usage")),
        value.get("info").and_then(|i| i.get("usage")),
        Some(&value),
    ]
    .into_iter()
    .flatten()
    {
        let input = get(node, "input_tokens").max(get(node, "prompt_tokens"))
            + get(node, "cache_creation_input_tokens");
        let cached = get(node, "cache_read_input_tokens");
        let output = get(node, "output_tokens").max(get(node, "completion_tokens"));
        if input > 0 || cached > 0 || output > 0 {
            return Some(LineUsage {
                input,
                cached,
                output,
                cumulative: false,
            });
        }
        let total = get(node, "total_tokens");
        if total > 0 {
            return Some(LineUsage {
                input: total,
                cached: 0,
                output: 0,
                cumulative: true,
            });
        }
    }
    None
}

/// Find a nested object by key, searching a few levels down (Codex buries `total_token_usage`
/// under `payload` → `info`).
fn find_key<'a>(
    value: &'a serde_json::Value,
    key: &str,
    depth: usize,
) -> Option<&'a serde_json::Value> {
    if depth > 4 {
        return None;
    }
    if let Some(v) = value.get(key) {
        return Some(v);
    }
    value
        .as_object()?
        .values()
        .find_map(|v| find_key(v, key, depth + 1))
}

/// Result of a scan. `transcripts` counts files, not individual usage events.
#[derive(Debug, Clone, Default)]
pub struct UsageScan {
    pub records: Vec<UsageRecord>,
    pub transcripts: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FileSignature {
    path: PathBuf,
    size: u64,
    modified_ms: i64,
}

#[derive(Debug, Clone)]
struct CachedFile {
    signature: FileSignature,
    source: String,
    records: Vec<UsageRecord>,
    last_used: u64,
}

const MAX_CACHE_ENTRIES: usize = 1024;
static FILE_CACHE: OnceLock<Mutex<HashMap<PathBuf, CachedFile>>> = OnceLock::new();
static CACHE_CLOCK: AtomicU64 = AtomicU64::new(0);

fn cache_clock() -> u64 {
    CACHE_CLOCK
        .fetch_add(1, Ordering::Relaxed)
        .saturating_add(1)
}

fn file_signature(path: &Path) -> Option<FileSignature> {
    let metadata = std::fs::metadata(path).ok()?;
    let modified_ms = metadata
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis() as i64;
    Some(FileSignature {
        path: std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf()),
        size: metadata.len(),
        modified_ms,
    })
}

fn cached_records(signature: &FileSignature, source: &str) -> Option<Vec<UsageRecord>> {
    let used = cache_clock();
    let mut cache = FILE_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .ok()?;
    let entry = cache.get_mut(&signature.path)?;
    if entry.signature != *signature || entry.source != source {
        return None;
    }
    entry.last_used = used;
    Some(entry.records.clone())
}

fn cache_records(signature: FileSignature, source: &str, records: Vec<UsageRecord>) {
    let used = cache_clock();
    let mut cache = match FILE_CACHE.get_or_init(|| Mutex::new(HashMap::new())).lock() {
        Ok(cache) => cache,
        Err(_) => return,
    };
    if !cache.contains_key(&signature.path) && cache.len() >= MAX_CACHE_ENTRIES {
        if let Some(oldest) = cache
            .iter()
            .min_by_key(|(_, entry)| entry.last_used)
            .map(|(path, _)| path.clone())
        {
            cache.remove(&oldest);
        }
    }
    cache.insert(
        signature.path.clone(),
        CachedFile {
            signature,
            source: source.to_string(),
            records,
            last_used: used,
        },
    );
}

fn file_mtime_ms(path: &Path) -> i64 {
    file_signature(path).map(|s| s.modified_ms).unwrap_or(0)
}

fn record(at_ms: i64, usage: LineUsage, source: &str) -> UsageRecord {
    UsageRecord {
        at_ms,
        input_tokens: usage.input,
        cached_tokens: usage.cached,
        output_tokens: usage.output,
        source: source.into(),
        model: None,
        dedupe_key: None,
    }
}

/// Best-effort model extraction: a string-valued `model` key anywhere near the top of the line
/// (Claude puts it on `message.model`, Codex restates it in `turn_context` payloads).
fn find_model(value: &serde_json::Value) -> Option<String> {
    find_key(value, "model", 0)?
        .as_str()
        .map(str::trim)
        .filter(|m| !m.is_empty())
        .map(ToOwned::to_owned)
}

fn get_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value.get(key)?.as_str().map(ToOwned::to_owned)
}

fn original_timestamp_ms(value: &serde_json::Value) -> Option<i64> {
    for key in ["timestamp", "created_at", "createdAt"] {
        if let Some(raw) = value.get(key) {
            if let Some(ms) = raw.as_i64() {
                if ms <= 0 {
                    continue;
                }
                return Some(if ms < 10_000_000_000 {
                    ms.saturating_mul(1000)
                } else {
                    ms
                });
            }
            if let Some(text) = raw.as_str() {
                if let Some(ms) = parse_rfc3339_ms(text) {
                    return Some(ms);
                }
            }
        }
    }
    None
}

// Dependency-free RFC3339 parsing keeps the core crate small while preserving provider times.
fn parse_rfc3339_ms(text: &str) -> Option<i64> {
    let bytes = text.as_bytes();
    if bytes.len() < 19
        || bytes.get(4) != Some(&b'-')
        || bytes.get(7) != Some(&b'-')
        || !matches!(bytes.get(10), Some(b'T' | b't' | b' '))
        || bytes.get(13) != Some(&b':')
        || bytes.get(16) != Some(&b':')
    {
        return None;
    }
    let number = |start: usize, end: usize| {
        std::str::from_utf8(&bytes[start..end])
            .ok()?
            .parse::<i64>()
            .ok()
    };
    let (year, month, day, hour, minute, second) = (
        number(0, 4)?,
        number(5, 7)?,
        number(8, 10)?,
        number(11, 13)?,
        number(14, 16)?,
        number(17, 19)?,
    );
    if !(1..=12).contains(&month) || hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    let leap_year = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let max_day = match month {
        2 if leap_year => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    if !(1..=max_day).contains(&day) {
        return None;
    }
    let mut index = 19;
    let mut millis = 0i64;
    if bytes.get(index) == Some(&b'.') {
        index += 1;
        let start = index;
        while bytes.get(index).is_some_and(u8::is_ascii_digit) {
            index += 1;
        }
        let digits = &text[start..index];
        if digits.is_empty() {
            return None;
        }
        let mut fraction = digits.chars().take(3).collect::<String>();
        while fraction.len() < 3 {
            fraction.push('0');
        }
        millis = fraction.parse().ok()?;
    }
    let (offset_secs, consumed) = match bytes.get(index) {
        Some(b'Z' | b'z') => (0, index + 1),
        Some(sign @ (b'+' | b'-'))
            if bytes.len() >= index + 6 && bytes.get(index + 3) == Some(&b':') =>
        {
            let offset_hour = number(index + 1, index + 3)?;
            let offset_minute = number(index + 4, index + 6)?;
            if offset_hour > 23 || offset_minute > 59 {
                return None;
            }
            let seconds = offset_hour * 3600 + offset_minute * 60;
            let offset = if *sign == b'+' { seconds } else { -seconds };
            (offset, index + 6)
        }
        _ => return None,
    };
    if consumed != bytes.len() {
        return None;
    }
    let adjusted_year = year - i64::from(month <= 2);
    let era = if adjusted_year >= 0 {
        adjusted_year
    } else {
        adjusted_year - 399
    } / 400;
    let yoe = adjusted_year - era * 400;
    let month_index = month + if month > 2 { -3 } else { 9 };
    let doy = (153 * month_index + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some((((days * 24 + hour) * 60 + minute) * 60 + second - offset_secs) * 1000 + millis)
}

fn claude_usage(value: &serde_json::Value) -> Option<LineUsage> {
    let message = value.get("message")?;
    let is_assistant = value.get("type").and_then(|v| v.as_str()) == Some("assistant")
        || message.get("role").and_then(|v| v.as_str()) == Some("assistant");
    if !is_assistant {
        return None;
    }
    parse_usage_line(&message.to_string()).or_else(|| parse_usage_line(&value.to_string()))
}

fn claude_key(value: &serde_json::Value) -> Option<String> {
    let message_id = value.get("message").and_then(|m| get_string(m, "id"));
    let request_id = get_string(value, "requestId").or_else(|| get_string(value, "request_id"));
    if message_id.is_none() && request_id.is_none() {
        None
    } else {
        Some(format!(
            "{}:{}",
            message_id.as_deref().unwrap_or_default(),
            request_id.as_deref().unwrap_or_default()
        ))
    }
}

fn scan_claude(reader: impl BufRead, fallback_ms: i64, source: &str) -> Vec<UsageRecord> {
    let mut seen = HashSet::new();
    reader
        .lines()
        .map_while(Result::ok)
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(&line).ok())
        .filter_map(|value| {
            let usage = claude_usage(&value)?;
            let dedupe_key = claude_key(&value);
            if dedupe_key
                .as_ref()
                .is_some_and(|key| !seen.insert(key.clone()))
            {
                return None;
            }
            let mut usage_record = record(
                original_timestamp_ms(&value).unwrap_or(fallback_ms),
                usage,
                source,
            );
            usage_record.model = value
                .get("message")
                .and_then(|m| get_string(m, "model"))
                .or_else(|| find_model(&value));
            usage_record.dedupe_key = dedupe_key;
            Some(usage_record)
        })
        .collect()
}

fn raw_codex_usage(node: &serde_json::Value) -> Option<LineUsage> {
    let raw_input = node
        .get("input_tokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let cached = node
        .get("cached_input_tokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(0)
        .min(raw_input);
    let output = node
        .get("output_tokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    (raw_input > 0 || output > 0).then_some(LineUsage {
        input: raw_input - cached,
        cached,
        output,
        cumulative: false,
    })
}

fn scan_codex(reader: impl BufRead, fallback_ms: i64, source: &str) -> Vec<UsageRecord> {
    let mut deltas = Vec::new();
    let mut previous = None;
    let mut final_total = None;
    // Codex states the model on session/turn-context lines, not on every usage line; carry the
    // most recent sighting forward so each delta can be priced.
    let mut model: Option<String> = None;
    for line in reader.lines().map_while(Result::ok) {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        if let Some(seen) = find_model(&value) {
            model = Some(seen);
        }
        let at_ms = original_timestamp_ms(&value).unwrap_or(fallback_ms);
        if let Some(total) = find_key(&value, "total_token_usage", 0).and_then(raw_codex_usage) {
            final_total = Some((at_ms, total));
        }
        let Some(delta) = find_key(&value, "last_token_usage", 0).and_then(raw_codex_usage) else {
            continue;
        };
        if previous == Some(delta) {
            continue;
        }
        previous = Some(delta);
        let mut usage_record = record(at_ms, delta, source);
        usage_record.model = model.clone();
        deltas.push(usage_record);
    }
    let summed = deltas.iter().fold(
        LineUsage {
            input: 0,
            cached: 0,
            output: 0,
            cumulative: false,
        },
        |sum, r| LineUsage {
            input: sum.input.saturating_add(r.input_tokens),
            cached: sum.cached.saturating_add(r.cached_tokens),
            output: sum.output.saturating_add(r.output_tokens),
            cumulative: false,
        },
    );
    let Some((at_ms, total)) = final_total else {
        return deltas;
    };
    if summed.input == total.input && summed.cached == total.cached && summed.output == total.output
    {
        return deltas;
    }
    if summed.input <= total.input && summed.cached <= total.cached && summed.output <= total.output
    {
        // Preserve every known event timestamp and place only the unobserved residual at the
        // final total's timestamp. This keeps older windows truthful without inventing when a
        // missing delta occurred.
        let residual = LineUsage {
            input: total.input - summed.input,
            cached: total.cached - summed.cached,
            output: total.output - summed.output,
            cumulative: false,
        };
        if residual.input > 0 || residual.cached > 0 || residual.output > 0 {
            let mut usage_record = record(at_ms, residual, source);
            usage_record.model = model.clone();
            deltas.push(usage_record);
        }
        return deltas;
    }
    // Duplicate or malformed deltas exceeded the authoritative total. Discard their timestamps
    // rather than over-counting, and retain one conservative compatibility record.
    let mut usage_record = record(at_ms, total, source);
    usage_record.model = model;
    vec![usage_record]
}

fn scan_generic(reader: impl BufRead, fallback_ms: i64, source: &str) -> Vec<UsageRecord> {
    let mut events = Vec::new();
    let mut cumulative: Option<(LineUsage, Option<String>)> = None;
    for line in reader.lines().map_while(Result::ok) {
        let Some(usage) = parse_usage_line(&line) else {
            continue;
        };
        let model = serde_json::from_str::<serde_json::Value>(&line)
            .ok()
            .as_ref()
            .and_then(find_model);
        if usage.cumulative {
            let previous = cumulative
                .as_ref()
                .map(|(previous, _)| *previous)
                .unwrap_or(LineUsage {
                    input: 0,
                    cached: 0,
                    output: 0,
                    cumulative: true,
                });
            if usage.input.saturating_add(usage.output)
                > previous.input.saturating_add(previous.output)
            {
                cumulative = Some((usage, model));
            }
        } else {
            let mut usage_record = record(fallback_ms, usage, source);
            usage_record.model = model;
            events.push(usage_record);
        }
    }
    cumulative
        .map(|(usage, model)| {
            let mut usage_record = record(fallback_ms, usage, source);
            usage_record.model = model;
            vec![usage_record]
        })
        .unwrap_or(events)
}

fn scan_jsonl_file_records(path: &Path, source: &str) -> Vec<UsageRecord> {
    let Some(signature) = file_signature(path) else {
        return Vec::new();
    };
    if let Some(records) = cached_records(&signature, source) {
        return records;
    }
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };
    let records = match source {
        "claude" => scan_claude(BufReader::new(file), signature.modified_ms, source),
        "codex" => scan_codex(BufReader::new(file), signature.modified_ms, source),
        _ => scan_generic(BufReader::new(file), signature.modified_ms, source),
    };
    cache_records(signature, source, records.clone());
    records
}

/// Reduce a transcript to one compatibility record. Directory scans retain original timestamps.
pub fn scan_jsonl_file(path: &Path, source: &str) -> Option<UsageRecord> {
    let records = scan_jsonl_file_records(path, source);
    let first = records.first()?;
    Some(UsageRecord {
        at_ms: records
            .iter()
            .map(|record| record.at_ms)
            .max()
            .unwrap_or(first.at_ms),
        input_tokens: records.iter().map(|record| record.input_tokens).sum(),
        cached_tokens: records.iter().map(|record| record.cached_tokens).sum(),
        output_tokens: records.iter().map(|record| record.output_tokens).sum(),
        source: source.into(),
        model: first.model.clone(),
        dedupe_key: None,
    })
}

/// Recursively scan a directory of JSONL transcripts.
pub fn scan_jsonl_dir(dir: &Path, source: &str) -> Vec<UsageRecord> {
    scan_jsonl_dir_since(dir, source, i64::MIN).records
}

/// As [`scan_jsonl_dir`], but only parses files modified inside the supplied epoch-ms window.
pub fn scan_jsonl_dir_since(dir: &Path, source: &str, cutoff_ms: i64) -> UsageScan {
    let mut scan = UsageScan::default();
    collect(dir, source, cutoff_ms, 0, &mut scan);
    if source == "claude" {
        // Directory iteration order is platform-dependent. Keep the earliest copy of an identity
        // so a duplicated transcript cannot move usage across a rolling-window boundary.
        scan.records.sort_by_key(|record| record.at_ms);
        let mut seen = HashSet::new();
        scan.records.retain(|record| {
            record
                .dedupe_key
                .as_ref()
                .is_none_or(|key| seen.insert(key.clone()))
        });
    }
    scan
}

fn collect(dir: &Path, source: &str, cutoff_ms: i64, depth: usize, scan: &mut UsageScan) {
    if depth > 6 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect(&path, source, cutoff_ms, depth + 1, scan);
        } else if path.extension().and_then(|s| s.to_str()) == Some("jsonl")
            && file_mtime_ms(&path) >= cutoff_ms
        {
            scan.transcripts += 1;
            scan.records.extend(scan_jsonl_file_records(&path, source));
        }
    }
}

fn home() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}

/// Scan every provider transcript store we know about, bounded to the largest rolling window.
pub fn scan_all_with_count() -> UsageScan {
    let Some(home) = home() else {
        return UsageScan::default();
    };
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    let cutoff_ms = now_ms - ONE_MONTH * 1000;
    let mut scan = scan_jsonl_dir_since(&home.join(".codex").join("sessions"), "codex", cutoff_ms);
    let claude = scan_jsonl_dir_since(&home.join(".claude").join("projects"), "claude", cutoff_ms);
    scan.transcripts += claude.transcripts;
    scan.records.extend(claude.records);
    scan
}

/// Scan every provider transcript store we know about.
pub fn scan_all() -> Vec<UsageRecord> {
    scan_all_with_count().records
}

/// Totals per source, for the "where did it go" breakdown.
pub fn by_source(records: &[UsageRecord]) -> Vec<(String, u64)> {
    let mut map: BTreeMap<String, u64> = BTreeMap::new();
    for r in records {
        *map.entry(r.source.clone()).or_insert(0) += r.total();
    }
    map.into_iter().collect()
}

// ---- cost estimation ---------------------------------------------------------------------------

/// USD per **million** tokens: (model-id prefix, fresh input, cache read, output).
///
/// A static best-effort table for the mainstream models these transcripts actually contain
/// (Anthropic per platform.claude.com, OpenAI per developers.openai.com, as of 2026-08).
/// First matching prefix wins, so more specific prefixes must precede shorter ones. Records
/// whose model matches nothing stay unpriced rather than guessing — the UI reports them as
/// "cost unknown". Cache *writes* bill above the fresh-input rate and are not modeled, so
/// estimates skew slightly low; every figure derived from this is labeled an estimate (≈).
const MODEL_PRICES: &[(&str, f64, f64, f64)] = &[
    // Anthropic
    ("claude-fable-5", 10.0, 1.0, 50.0),
    ("claude-mythos-5", 10.0, 1.0, 50.0),
    ("claude-opus-4-1", 15.0, 1.5, 75.0),
    ("claude-opus-4-2", 15.0, 1.5, 75.0), // claude-opus-4-20250514
    ("claude-opus", 5.0, 0.5, 25.0),      // opus-5 and opus-4-5 … 4-8
    ("claude-sonnet", 3.0, 0.3, 15.0),
    ("claude-haiku-4", 1.0, 0.1, 5.0),
    ("claude-3-5-haiku", 0.8, 0.08, 4.0),
    ("claude-3-haiku", 0.25, 0.03, 1.25),
    // OpenAI (Codex CLI)
    ("gpt-5-mini", 0.25, 0.025, 2.0),
    ("gpt-5-nano", 0.05, 0.005, 0.40),
    ("gpt-5.2", 1.75, 0.175, 14.0),
    ("gpt-5.3", 1.75, 0.175, 14.0),
    ("gpt-5", 1.25, 0.125, 10.0), // gpt-5, gpt-5.1, gpt-5-codex, gpt-5.1-codex, …
    ("o3-mini", 1.1, 0.55, 4.4),
    ("o3", 2.0, 0.5, 8.0),
    ("o4-mini", 1.1, 0.275, 4.4),
];

fn model_price(model: &str) -> Option<(f64, f64, f64)> {
    let normalized = model.trim().to_ascii_lowercase();
    MODEL_PRICES
        .iter()
        .find(|(prefix, ..)| normalized.starts_with(prefix))
        .map(|&(_, input, cached, output)| (input, cached, output))
}

/// Estimated USD for one record, or `None` when its model is absent or unpriced.
pub fn record_cost_usd(record: &UsageRecord) -> Option<f64> {
    let (input, cached, output) = model_price(record.model.as_deref()?)?;
    Some(
        (record.input_tokens as f64 * input
            + record.cached_tokens as f64 * cached
            + record.output_tokens as f64 * output)
            / 1_000_000.0,
    )
}

// ---- time-bucketed history ----------------------------------------------------------------------

/// One provider's token totals per time bucket, oldest bucket first. Values are
/// [`UsageRecord::total`] (cache reads excluded), matching the headline numbers elsewhere.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UsageSeries {
    pub source: String,
    pub totals: Vec<u64>,
}

/// Time-bucketed usage for trend charts. Buckets align to `bucket_secs` boundaries; the last
/// bucket is the (partial) one containing `now`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UsageHistory {
    pub bucket_secs: i64,
    pub bucket_count: usize,
    /// Start of the first bucket (unix ms).
    pub start_ms: i64,
    pub series: Vec<UsageSeries>,
}

/// Bucket records into `bucket_count` fixed windows of `bucket_secs`, grouped by source.
pub fn history(
    records: &[UsageRecord],
    now_ms: i64,
    bucket_secs: i64,
    bucket_count: usize,
) -> UsageHistory {
    let bucket_ms = bucket_secs.max(1) * 1000;
    let end_ms = (now_ms.div_euclid(bucket_ms) + 1) * bucket_ms;
    let start_ms = end_ms - bucket_ms * bucket_count as i64;
    let mut by_source: BTreeMap<String, Vec<u64>> = BTreeMap::new();
    for r in records {
        if r.at_ms < start_ms || r.at_ms >= end_ms {
            continue;
        }
        let index = ((r.at_ms - start_ms) / bucket_ms) as usize;
        let totals = by_source
            .entry(r.source.clone())
            .or_insert_with(|| vec![0; bucket_count]);
        totals[index] = totals[index].saturating_add(r.total());
    }
    UsageHistory {
        bucket_secs,
        bucket_count,
        start_ms,
        series: by_source
            .into_iter()
            .map(|(source, totals)| UsageSeries { source, totals })
            .collect(),
    }
}

/// Per-source totals plus a best-effort cost estimate, for the provider breakdown table.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SourceUsage {
    pub source: String,
    pub input_tokens: u64,
    pub cached_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    /// Estimated spend over records whose model has a known price; `None` when nothing in this
    /// source was priceable.
    pub estimated_cost_usd: Option<f64>,
    /// Tokens from records with an unknown/unpriced model — excluded from the estimate and
    /// surfaced so the UI can say how much of the total the estimate does not cover.
    pub unpriced_tokens: u64,
}

/// Per-source totals over records at/after `cutoff_ms` (pass `i64::MIN` for everything).
pub fn by_source_detailed(records: &[UsageRecord], cutoff_ms: i64) -> Vec<SourceUsage> {
    let mut map: BTreeMap<String, SourceUsage> = BTreeMap::new();
    for r in records.iter().filter(|r| r.at_ms >= cutoff_ms) {
        let entry = map.entry(r.source.clone()).or_insert_with(|| SourceUsage {
            source: r.source.clone(),
            input_tokens: 0,
            cached_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            estimated_cost_usd: None,
            unpriced_tokens: 0,
        });
        entry.input_tokens += r.input_tokens;
        entry.cached_tokens += r.cached_tokens;
        entry.output_tokens += r.output_tokens;
        entry.total_tokens += r.total();
        match record_cost_usd(r) {
            Some(cost) => *entry.estimated_cost_usd.get_or_insert(0.0) += cost,
            None => entry.unpriced_tokens += r.total(),
        }
    }
    map.into_values().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(at_ms: i64, input: u64, output: u64, source: &str) -> UsageRecord {
        UsageRecord {
            at_ms,
            input_tokens: input,
            cached_tokens: 0,
            output_tokens: output,
            source: source.into(),
            model: None,
            dedupe_key: None,
        }
    }

    #[test]
    fn parses_provider_owned_codex_quota() {
        let result = serde_json::json!({
            "rateLimits": {
                "limitId": "codex",
                "limitName": "Codex",
                "planType": "pro",
                "primary": {
                    "usedPercent": 27,
                    "windowDurationMins": 300,
                    "resetsAt": 1_800_000_000
                },
                "secondary": {
                    "usedPercent": 104,
                    "windowDurationMins": 10080,
                    "resetsAt": 1_800_500_000
                },
                "credits": {
                    "hasCredits": true,
                    "unlimited": false,
                    "balance": "12.5"
                }
            }
        });

        let report = parse_codex_quota(&result).expect("valid app-server response");
        assert_eq!(report.status, QuotaStatus::Available);
        assert_eq!(report.provider, "codex");
        assert_eq!(report.plan.as_deref(), Some("pro"));
        assert_eq!(report.limit_name.as_deref(), Some("Codex"));
        assert_eq!(report.windows.len(), 2);
        assert_eq!(report.windows[0].used_percent, 27.0);
        assert_eq!(report.windows[0].window_minutes, Some(300));
        assert_eq!(
            report.windows[1].used_percent, 100.0,
            "rendered percentages are bounded"
        );
        assert_eq!(
            report
                .credits
                .and_then(|credits| credits.balance)
                .as_deref(),
            Some("12.5")
        );
    }

    #[tokio::test]
    async fn unsupported_provider_quota_is_explicit() {
        let report = provider_quota(&ProviderId::Grok).await;
        assert_eq!(report.provider, "grok");
        assert_eq!(report.status, QuotaStatus::Unsupported);
        assert_eq!(report.reason, Some(QuotaReason::UnsupportedProvider));
        assert!(report.windows.is_empty());
    }

    /// Real shape from `~/.claude/projects/**/*.jsonl`: the bulk of the input lives in the cache
    /// fields, so ignoring them would under-count by orders of magnitude.
    #[test]
    fn parses_claude_per_message_usage_splitting_cache_reads() {
        let line = r#"{"message":{"usage":{"input_tokens":2,"cache_creation_input_tokens":46785,"cache_read_input_tokens":21229,"output_tokens":615}}}"#;
        let u = parse_usage_line(line).unwrap();
        // Cache *writes* are fresh work; cache *reads* are re-served context and are tracked apart.
        assert_eq!(u.input, 2 + 46785);
        assert_eq!(u.cached, 21229);
        assert_eq!(u.output, 615);
        assert!(!u.cumulative, "per-message usage must be summed, not maxed");
    }

    /// Real shape from `~/.codex/sessions/**/rollout-*.jsonl`: a running total restated on every
    /// line, where `input_tokens` already includes `cached_input_tokens`.
    #[test]
    fn parses_codex_cumulative_total_and_nests_deeply() {
        // Codex buries the running total under payload → info.
        let line = r#"{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":4758485,"cached_input_tokens":4220416,"output_tokens":35162,"reasoning_output_tokens":11683,"total_tokens":4793647}}}}"#;
        let u = parse_usage_line(line).expect("must find the nested total_token_usage");
        // Here `cached_input_tokens` is a *subset* of `input_tokens`, so fresh input is the diff.
        assert_eq!(u.input, 4_758_485 - 4_220_416);
        assert_eq!(u.cached, 4_220_416);
        assert_eq!(u.output, 35_162);
        assert_eq!(
            u.input + u.cached + u.output,
            4_793_647,
            "the parts still reconstruct the reported total_tokens"
        );
        assert!(u.cumulative, "session totals must be maxed, not summed");
    }

    #[test]
    fn cache_reads_are_excluded_from_window_totals() {
        let now = 1_000_000_000_000i64;
        let records = vec![UsageRecord {
            at_ms: now - 1000,
            input_tokens: 100,
            cached_tokens: 900_000,
            output_tokens: 50,
            source: "claude".into(),
            model: None,
            dedupe_key: None,
        }];
        let w = windows(&records, now, &Limits::default());
        assert_eq!(
            w[0].total_tokens, 150,
            "cache reads must not inflate the headline total"
        );
        assert_eq!(w[0].cached_tokens, 900_000, "…but they're still reported");
    }

    #[test]
    fn parses_other_shapes_and_rejects_junk() {
        assert_eq!(
            parse_usage_line(r#"{"usage":{"input_tokens":100,"output_tokens":20}}"#),
            Some(LineUsage {
                input: 100,
                cached: 0,
                output: 20,
                cumulative: false
            })
        );
        assert_eq!(
            parse_usage_line(r#"{"prompt_tokens":5,"completion_tokens":6}"#),
            Some(LineUsage {
                input: 5,
                cached: 0,
                output: 6,
                cumulative: false
            })
        );
        assert_eq!(parse_usage_line(r#"{"hello":"world"}"#), None);
        assert_eq!(parse_usage_line("not json"), None);
    }

    #[test]
    fn provider_identity_and_timestamp_parsing_fail_closed() {
        let message_only = serde_json::json!({ "message": { "id": "message-only" } });
        assert_eq!(claude_key(&message_only).as_deref(), Some("message-only:"));
        assert_eq!(
            parse_rfc3339_ms("2026-08-02T03:04:05Z"),
            Some(1_785_639_845_000)
        );
        assert_eq!(parse_rfc3339_ms("2026-08-02T03:04:05Ztrailing"), None);
        assert_eq!(parse_rfc3339_ms("2026-02-31T03:04:05Z"), None);
        assert_eq!(parse_rfc3339_ms("not-a-time"), None);
    }

    /// Codex accounts per turn from `last_token_usage`, not from cumulative totals repeated in the
    /// transcript. An immediately replayed event must not become a second turn.
    #[test]
    fn codex_deltas_dedupe_replays_and_reconcile_final_total() {
        let dir = std::env::temp_dir().join(format!("codetwo-usage-cum-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("rollout.jsonl"),
            "{\"timestamp\":\"2026-08-01T00:00:00Z\",\"payload\":{\"info\":{\"last_token_usage\":{\"input_tokens\":100,\"output_tokens\":10}}}}\n\
             {\"timestamp\":\"2026-08-01T00:00:01Z\",\"payload\":{\"info\":{\"last_token_usage\":{\"input_tokens\":100,\"output_tokens\":10}}}}\n\
             {\"timestamp\":\"2026-08-01T00:00:02Z\",\"payload\":{\"info\":{\"last_token_usage\":{\"input_tokens\":50,\"output_tokens\":5},\"total_token_usage\":{\"input_tokens\":150,\"output_tokens\":15}}}}\n",
        )
        .unwrap();

        let recs = scan_jsonl_dir(&dir, "codex");
        assert_eq!(recs.len(), 2, "the consecutive replay is ignored");
        assert_eq!(
            recs.iter().map(|record| record.input_tokens).sum::<u64>(),
            150
        );
        assert_eq!(
            recs.iter().map(|record| record.output_tokens).sum::<u64>(),
            15
        );
        assert_eq!(
            recs[0].at_ms, 1_785_542_400_000,
            "provider timestamp, not file mtime"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn codex_adds_only_the_missing_residual_when_deltas_are_incomplete() {
        let dir =
            std::env::temp_dir().join(format!("codetwo-usage-fallback-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("rollout.jsonl"),
            "{\"timestamp\":\"2026-08-01T00:00:00Z\",\"payload\":{\"info\":{\"last_token_usage\":{\"input_tokens\":10,\"output_tokens\":1},\"total_token_usage\":{\"input_tokens\":100,\"output_tokens\":10}}}}\n",
        ).unwrap();
        let recs = scan_jsonl_dir(&dir, "codex");
        assert_eq!(recs.len(), 2, "known delta plus the unobserved residual");
        assert_eq!(
            recs.iter().map(|record| record.input_tokens).sum::<u64>(),
            100
        );
        assert_eq!(
            recs.iter().map(|record| record.output_tokens).sum::<u64>(),
            10
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn codex_discards_overcounted_deltas_in_favor_of_the_authoritative_total() {
        let line = "{\"timestamp\":\"2026-08-01T00:00:00Z\",\"payload\":{\"info\":{\"last_token_usage\":{\"input_tokens\":110,\"output_tokens\":11},\"total_token_usage\":{\"input_tokens\":100,\"output_tokens\":10}}}}\n";
        let recs = scan_codex(std::io::Cursor::new(line), 0, "codex");
        assert_eq!(recs.len(), 1);
        assert_eq!((recs[0].input_tokens, recs[0].output_tokens), (100, 10));
    }

    #[test]
    fn windows_bucket_by_recency_and_report_reset() {
        let now = 1_000_000_000_000i64;
        let hour = 3_600_000i64;
        let records = vec![
            rec(now - hour, 100, 10, "codex"),            // inside 5h
            rec(now - 10 * hour, 200, 20, "codex"),       // outside 5h, inside week
            rec(now - 10 * 24 * hour, 400, 40, "claude"), // outside week, inside month
            rec(now - 60 * 24 * hour, 999, 99, "claude"), // outside everything
        ];
        let w = windows(&records, now, &Limits::default());

        let five = &w[0];
        assert_eq!(five.label, "5h session");
        assert_eq!(five.total_tokens, 110);
        // The single 1h-old entry ages out 4h from now.
        assert_eq!(five.resets_in_secs, 4 * 3600);
        assert!(five.fraction.is_none(), "no limit ⇒ no percentage");

        assert_eq!(
            w[1].total_tokens,
            110 + 220,
            "week includes the 10h-old entry"
        );
        assert_eq!(
            w[2].total_tokens,
            110 + 220 + 440,
            "month adds the 10d-old entry"
        );
        assert!(
            w[2].total_tokens < 999 + 99 + 770,
            "the 60d-old entry is excluded"
        );
    }

    #[test]
    fn fraction_uses_limits_and_clamps() {
        let now = 1_000_000_000_000i64;
        let records = vec![rec(now - 1000, 900, 300, "codex")]; // 1200 total
        let limits = Limits {
            session_5h: Some(1000),
            weekly: None,
            monthly: None,
        };
        let w = windows(&records, now, &limits);
        assert_eq!(w[0].fraction, Some(1.0), "over the limit clamps to 1.0");
        assert!(w[1].fraction.is_none());
    }

    #[test]
    fn empty_window_has_no_reset_countdown() {
        let w = windows(&[], 1_000, &Limits::default());
        assert!(w
            .iter()
            .all(|x| x.total_tokens == 0 && x.resets_in_secs == 0));
    }

    #[test]
    fn scans_jsonl_files_and_totals_by_source() {
        let dir = std::env::temp_dir().join(format!("codetwo-usage-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("2026/07/24")).unwrap();
        std::fs::write(
            dir.join("2026/07/24/rollout-a.jsonl"),
            "{\"usage\":{\"input_tokens\":10,\"output_tokens\":5}}\n{\"noise\":1}\n{\"usage\":{\"input_tokens\":1,\"output_tokens\":1}}\n",
        )
        .unwrap();
        // A transcript with no usage at all is skipped entirely.
        std::fs::write(
            dir.join("2026/07/24/empty.jsonl"),
            "{\"hello\":\"world\"}\n",
        )
        .unwrap();
        std::fs::write(
            dir.join("ignored.txt"),
            "{\"usage\":{\"input_tokens\":999}}",
        )
        .unwrap();

        let recs = scan_jsonl_dir(&dir, "test");
        assert_eq!(recs.len(), 2, "one record per usage event");
        assert_eq!(
            recs.iter().map(|record| record.input_tokens).sum::<u64>(),
            11
        );
        assert_eq!(
            recs.iter().map(|record| record.output_tokens).sum::<u64>(),
            6
        );
        assert_eq!(recs[0].source, "test");
        assert!(recs[0].at_ms > 0, "timestamped from file mtime");

        assert_eq!(by_source(&recs), vec![("test".to_string(), 17)]);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn generic_cumulative_records_keep_only_the_largest_total() {
        let lines = "{\"total_token_usage\":{\"input_tokens\":10,\"output_tokens\":1}}\n\
                     {\"total_token_usage\":{\"input_tokens\":25,\"output_tokens\":3}}\n";
        let recs = scan_generic(std::io::Cursor::new(lines), 42, "legacy");
        assert_eq!(recs.len(), 1);
        assert_eq!((recs[0].input_tokens, recs[0].output_tokens), (25, 3));
    }

    #[test]
    fn claude_dedupes_assistant_message_request_and_uses_its_timestamp() {
        let dir =
            std::env::temp_dir().join(format!("codetwo-usage-claude-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("session.jsonl"),
            "{\"type\":\"assistant\",\"timestamp\":\"2026-08-02T03:04:05.006Z\",\"requestId\":\"req-1\",\"message\":{\"id\":\"message-1\",\"role\":\"assistant\",\"usage\":{\"input_tokens\":10,\"output_tokens\":2}}}\n\
             {\"type\":\"assistant\",\"timestamp\":\"2026-08-02T03:04:05.007Z\",\"requestId\":\"req-1\",\"message\":{\"id\":\"message-1\",\"role\":\"assistant\",\"usage\":{\"input_tokens\":10,\"output_tokens\":2}}}\n\
             {\"type\":\"assistant\",\"timestamp\":\"2026-08-02T03:04:06Z\",\"requestId\":\"req-2\",\"message\":{\"id\":\"message-2\",\"role\":\"assistant\",\"usage\":{\"input_tokens\":3,\"output_tokens\":1}}}\n",
        ).unwrap();
        std::fs::write(
            dir.join("session-copy.jsonl"),
            r#"{"type":"assistant","timestamp":"2026-08-02T03:04:05.008Z","requestId":"req-1","message":{"id":"message-1","role":"assistant","usage":{"input_tokens":10,"output_tokens":2}}}"#,
        )
        .unwrap();
        let scan = scan_jsonl_dir_since(&dir, "claude", i64::MIN);
        assert_eq!(
            scan.transcripts, 2,
            "file count is independent of de-duplication"
        );
        assert_eq!(
            scan.records.len(),
            2,
            "duplicates are removed across files too"
        );
        assert_eq!(scan.records[0].at_ms, 1_785_639_845_006);
        assert_eq!(by_source(&scan.records), vec![("claude".to_string(), 16)]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn priced(
        at_ms: i64,
        input: u64,
        cached: u64,
        output: u64,
        source: &str,
        model: Option<&str>,
    ) -> UsageRecord {
        UsageRecord {
            at_ms,
            input_tokens: input,
            cached_tokens: cached,
            output_tokens: output,
            source: source.into(),
            model: model.map(ToOwned::to_owned),
            dedupe_key: None,
        }
    }

    #[test]
    fn prices_match_by_prefix_and_unknown_models_stay_unpriced() {
        // Dated full IDs resolve through their family prefix.
        let claude = priced(
            0,
            1_000_000,
            1_000_000,
            1_000_000,
            "claude",
            Some("claude-opus-4-5-20251101"),
        );
        assert_eq!(record_cost_usd(&claude), Some(5.0 + 0.5 + 25.0));
        // The legacy expensive Opus generation is matched by its more specific prefix.
        let old_opus = priced(
            0,
            1_000_000,
            0,
            0,
            "claude",
            Some("claude-opus-4-1-20250805"),
        );
        assert_eq!(record_cost_usd(&old_opus), Some(15.0));
        let codex = priced(0, 2_000_000, 0, 100_000, "codex", Some("gpt-5.1-codex"));
        assert_eq!(record_cost_usd(&codex), Some(2.0 * 1.25 + 0.1 * 10.0));
        // Unknown or missing models never guess a price.
        assert_eq!(
            record_cost_usd(&priced(0, 1, 0, 1, "x", Some("mystery-lm"))),
            None
        );
        assert_eq!(record_cost_usd(&priced(0, 1, 0, 1, "x", None)), None);
    }

    #[test]
    fn history_buckets_align_and_group_by_source() {
        let hour = 3_600_000i64;
        // now sits mid-bucket; the last bucket must still contain it.
        let now = 100 * hour + 1_234_567;
        let records = vec![
            rec(now - 1000, 10, 1, "codex"),          // current (partial) bucket
            rec(now - 2 * hour, 100, 10, "codex"),    // two buckets back
            rec(now - 2 * hour, 200, 20, "claude"),   // same bucket, other source
            rec(now - 500 * hour, 999, 99, "claude"), // outside the window entirely
        ];
        let h = history(&records, now, 3600, 4);
        assert_eq!(h.bucket_count, 4);
        assert_eq!(h.start_ms % hour, 0, "buckets align to bucket boundaries");
        assert!(h.start_ms <= now - 3 * hour && now < h.start_ms + 4 * hour);
        assert_eq!(h.series.len(), 2);
        let claude = h.series.iter().find(|s| s.source == "claude").unwrap();
        let codex = h.series.iter().find(|s| s.source == "codex").unwrap();
        assert_eq!(codex.totals.iter().sum::<u64>(), 11 + 110);
        assert_eq!(
            codex.totals[3], 11,
            "newest record lands in the last bucket"
        );
        assert_eq!(
            claude.totals.iter().sum::<u64>(),
            220,
            "out-of-window record dropped"
        );
        // Both series in one bucket keeps them separate.
        let two_hours_back = codex.totals.iter().position(|&t| t == 110).unwrap();
        assert_eq!(claude.totals[two_hours_back], 220);
    }

    #[test]
    fn by_source_detailed_estimates_cost_and_tracks_unpriced_tokens() {
        let records = vec![
            priced(10, 1_000_000, 0, 0, "claude", Some("claude-sonnet-4-5")),
            priced(10, 50, 0, 5, "claude", Some("private-finetune")),
            priced(10, 30, 0, 3, "codex", None),
        ];
        let detailed = by_source_detailed(&records, i64::MIN);
        let claude = detailed.iter().find(|s| s.source == "claude").unwrap();
        assert_eq!(claude.total_tokens, 1_000_000 + 55);
        assert_eq!(
            claude.estimated_cost_usd,
            Some(3.0),
            "only the priced record is estimated"
        );
        assert_eq!(claude.unpriced_tokens, 55);
        let codex = detailed.iter().find(|s| s.source == "codex").unwrap();
        assert_eq!(
            codex.estimated_cost_usd, None,
            "nothing priceable ⇒ no estimate"
        );
        assert_eq!(codex.unpriced_tokens, 33);
        // The cutoff excludes older records.
        assert!(by_source_detailed(&records, 11).is_empty());
    }

    #[test]
    fn scanners_retain_the_model_for_pricing() {
        // Claude: model rides on message.model.
        let dir =
            std::env::temp_dir().join(format!("codetwo-usage-model-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("claude.jsonl"),
            "{\"type\":\"assistant\",\"requestId\":\"r1\",\"message\":{\"id\":\"m1\",\"role\":\"assistant\",\"model\":\"claude-opus-4-5-20251101\",\"usage\":{\"input_tokens\":10,\"output_tokens\":2}}}\n",
        )
        .unwrap();
        let recs = scan_jsonl_dir(&dir, "claude");
        assert_eq!(recs[0].model.as_deref(), Some("claude-opus-4-5-20251101"));
        let _ = std::fs::remove_dir_all(&dir);

        // Codex: the model appears on context lines and carries forward to later usage deltas.
        let lines = "{\"timestamp\":\"2026-08-01T00:00:00Z\",\"payload\":{\"turn_context\":{\"model\":\"gpt-5.1-codex\"}}}\n\
                     {\"timestamp\":\"2026-08-01T00:00:01Z\",\"payload\":{\"info\":{\"last_token_usage\":{\"input_tokens\":100,\"output_tokens\":10}}}}\n";
        let recs = scan_codex(std::io::Cursor::new(lines), 0, "codex");
        assert_eq!(recs.len(), 1);
        assert_eq!(recs[0].model.as_deref(), Some("gpt-5.1-codex"));
    }

    #[test]
    fn cache_invalidates_on_changed_size_and_bounded_scan_skips_old_window() {
        let dir =
            std::env::temp_dir().join(format!("codetwo-usage-cache-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("session.jsonl");
        std::fs::write(&path, "{\"type\":\"assistant\",\"requestId\":\"r\",\"message\":{\"id\":\"m\",\"role\":\"assistant\",\"usage\":{\"input_tokens\":1}}}\n").unwrap();
        assert_eq!(scan_jsonl_dir(&dir, "claude")[0].input_tokens, 1);
        std::fs::write(&path, "{\"type\":\"assistant\",\"requestId\":\"r\",\"message\":{\"id\":\"m\",\"role\":\"assistant\",\"usage\":{\"input_tokens\":12345}}}\n").unwrap();
        assert_eq!(
            scan_jsonl_dir(&dir, "claude")[0].input_tokens,
            12_345,
            "size/mtime cache key invalidates"
        );
        assert_eq!(
            scan_jsonl_dir(&dir, "test")[0].source,
            "test",
            "the cache identity includes the parser/source kind"
        );
        let bounded = scan_jsonl_dir_since(&dir, "claude", i64::MAX);
        assert_eq!(
            bounded.transcripts, 0,
            "outside the bounded window is not parsed or counted"
        );
        assert!(bounded.records.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
