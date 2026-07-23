//! Usage tracking across providers — the CodexBar-style "how much have I burned, and when does it
//! reset" view.
//!
//! Provider CLIs keep local session transcripts (Codex under `~/.codex/sessions`, Claude Code under
//! `~/.claude/projects`) that record token counts. We scan those JSONL files, sum the tokens per
//! file, and bucket them into **rolling windows** (5-hour session, week, month) with a percentage of
//! your limit and a countdown to when the window frees up.
//!
//! Deliberately local and best-effort: no API calls, no credentials, and tolerant of format drift —
//! we look for the usual token keys anywhere in each line rather than assuming a fixed schema. A
//! file's modification time is used as its timestamp, which is plenty precise for 5h/7d/30d buckets.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// One chunk of accounted usage (typically one session transcript file).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UsageRecord {
    /// Unix milliseconds (the transcript's last-modified time).
    pub at_ms: i64,
    pub input_tokens: u64,
    /// Cache reads — shown for context but excluded from [`UsageRecord::total`].
    #[serde(default)]
    pub cached_tokens: u64,
    pub output_tokens: u64,
    /// `codex` | `claude` | `codetwo` | …
    pub source: String,
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
        let get = |k: &str| std::env::var(k).ok().and_then(|v| v.trim().parse::<u64>().ok());
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
            return Some(LineUsage { input, cached, output, cumulative: false });
        }
        let total = get(node, "total_tokens");
        if total > 0 {
            return Some(LineUsage { input: total, cached: 0, output: 0, cumulative: true });
        }
    }
    None
}

/// Find a nested object by key, searching a few levels down (Codex buries `total_token_usage`
/// under `payload` → `info`).
fn find_key<'a>(value: &'a serde_json::Value, key: &str, depth: usize) -> Option<&'a serde_json::Value> {
    if depth > 4 {
        return None;
    }
    if let Some(v) = value.get(key) {
        return Some(v);
    }
    value.as_object()?.values().find_map(|v| find_key(v, key, depth + 1))
}

/// Reduce a single JSONL transcript to one record, timestamped by the file's mtime.
///
/// Cumulative lines win over summed per-message lines: a Codex transcript restates the running
/// total on every line, so the largest total *is* the session's usage.
pub fn scan_jsonl_file(path: &Path, source: &str) -> Option<UsageRecord> {
    let text = std::fs::read_to_string(path).ok()?;
    let (mut summed_in, mut summed_cached, mut summed_out) = (0u64, 0u64, 0u64);
    let mut cumulative: Option<(u64, u64, u64)> = None;

    for line in text.lines() {
        let Some(u) = parse_usage_line(line) else { continue };
        if u.cumulative {
            let best = cumulative.unwrap_or((0, 0, 0));
            if u.input + u.output > best.0 + best.2 {
                cumulative = Some((u.input, u.cached, u.output));
            }
        } else {
            summed_in += u.input;
            summed_cached += u.cached;
            summed_out += u.output;
        }
    }

    let (input, cached, output) =
        cumulative.unwrap_or((summed_in, summed_cached, summed_out));
    if input == 0 && output == 0 && cached == 0 {
        return None;
    }
    let at_ms = std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    Some(UsageRecord {
        at_ms,
        input_tokens: input,
        cached_tokens: cached,
        output_tokens: output,
        source: source.into(),
    })
}

/// Recursively scan a directory of JSONL transcripts.
pub fn scan_jsonl_dir(dir: &Path, source: &str) -> Vec<UsageRecord> {
    let mut out = Vec::new();
    collect(dir, source, 0, &mut out);
    out
}

fn collect(dir: &Path, source: &str, depth: usize, out: &mut Vec<UsageRecord>) {
    if depth > 6 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect(&path, source, depth + 1, out);
        } else if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
            if let Some(rec) = scan_jsonl_file(&path, source) {
                out.push(rec);
            }
        }
    }
}

fn home() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}

/// Scan every provider transcript store we know about.
pub fn scan_all() -> Vec<UsageRecord> {
    let Some(home) = home() else { return Vec::new() };
    let mut out = Vec::new();
    out.extend(scan_jsonl_dir(&home.join(".codex").join("sessions"), "codex"));
    out.extend(scan_jsonl_dir(&home.join(".claude").join("projects"), "claude"));
    out
}

/// Totals per source, for the "where did it go" breakdown.
pub fn by_source(records: &[UsageRecord]) -> Vec<(String, u64)> {
    let mut map: std::collections::BTreeMap<String, u64> = std::collections::BTreeMap::new();
    for r in records {
        *map.entry(r.source.clone()).or_insert(0) += r.total();
    }
    map.into_iter().collect()
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
        }
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
        }];
        let w = windows(&records, now, &Limits::default());
        assert_eq!(w[0].total_tokens, 150, "cache reads must not inflate the headline total");
        assert_eq!(w[0].cached_tokens, 900_000, "…but they're still reported");
    }

    #[test]
    fn parses_other_shapes_and_rejects_junk() {
        assert_eq!(
            parse_usage_line(r#"{"usage":{"input_tokens":100,"output_tokens":20}}"#),
            Some(LineUsage { input: 100, cached: 0, output: 20, cumulative: false })
        );
        assert_eq!(
            parse_usage_line(r#"{"prompt_tokens":5,"completion_tokens":6}"#),
            Some(LineUsage { input: 5, cached: 0, output: 6, cumulative: false })
        );
        assert_eq!(parse_usage_line(r#"{"hello":"world"}"#), None);
        assert_eq!(parse_usage_line("not json"), None);
    }

    /// A Codex transcript restates its total on every line; the file's usage is the largest total,
    /// not the sum (which would be ~N× too big).
    #[test]
    fn cumulative_lines_are_maxed_not_summed() {
        let dir = std::env::temp_dir().join(format!("codetwo-usage-cum-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("rollout.jsonl"),
            "{\"total_token_usage\":{\"input_tokens\":100,\"output_tokens\":10}}\n\
             {\"total_token_usage\":{\"input_tokens\":250,\"output_tokens\":30}}\n\
             {\"total_token_usage\":{\"input_tokens\":400,\"output_tokens\":50}}\n",
        )
        .unwrap();

        let recs = scan_jsonl_dir(&dir, "codex");
        assert_eq!(recs.len(), 1);
        assert_eq!(recs[0].input_tokens, 400, "final running total, not 100+250+400");
        assert_eq!(recs[0].output_tokens, 50);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn windows_bucket_by_recency_and_report_reset() {
        let now = 1_000_000_000_000i64;
        let hour = 3_600_000i64;
        let records = vec![
            rec(now - hour, 100, 10, "codex"),          // inside 5h
            rec(now - 10 * hour, 200, 20, "codex"),     // outside 5h, inside week
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

        assert_eq!(w[1].total_tokens, 110 + 220, "week includes the 10h-old entry");
        assert_eq!(w[2].total_tokens, 110 + 220 + 440, "month adds the 10d-old entry");
        assert!(w[2].total_tokens < 999 + 99 + 770, "the 60d-old entry is excluded");
    }

    #[test]
    fn fraction_uses_limits_and_clamps() {
        let now = 1_000_000_000_000i64;
        let records = vec![rec(now - 1000, 900, 300, "codex")]; // 1200 total
        let limits = Limits { session_5h: Some(1000), weekly: None, monthly: None };
        let w = windows(&records, now, &limits);
        assert_eq!(w[0].fraction, Some(1.0), "over the limit clamps to 1.0");
        assert!(w[1].fraction.is_none());
    }

    #[test]
    fn empty_window_has_no_reset_countdown() {
        let w = windows(&[], 1_000, &Limits::default());
        assert!(w.iter().all(|x| x.total_tokens == 0 && x.resets_in_secs == 0));
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
        std::fs::write(dir.join("2026/07/24/empty.jsonl"), "{\"hello\":\"world\"}\n").unwrap();
        std::fs::write(dir.join("ignored.txt"), "{\"usage\":{\"input_tokens\":999}}").unwrap();

        let recs = scan_jsonl_dir(&dir, "codex");
        assert_eq!(recs.len(), 1, "one record per transcript with usage");
        assert_eq!(recs[0].input_tokens, 11);
        assert_eq!(recs[0].output_tokens, 6);
        assert_eq!(recs[0].source, "codex");
        assert!(recs[0].at_ms > 0, "timestamped from file mtime");

        assert_eq!(by_source(&recs), vec![("codex".to_string(), 17)]);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
