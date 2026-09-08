//! Host-neutral utility plugins: local usage reports and voice transcription.

use crate::app::{json, take_args};
use codetwo_kernel::{async_trait, Context, Plugin, PluginError, PluginResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub struct UsagePlugin;

#[derive(Serialize)]
struct UsageReport {
    windows: Vec<codetwo_core::usage::UsageWindow>,
    by_source: Vec<(String, u64)>,
    transcripts: usize,
}

#[derive(Serialize)]
struct UsageHistoryReport {
    history: codetwo_core::usage::UsageHistory,
    by_source: Vec<codetwo_core::usage::SourceUsage>,
}

fn usage_history_report(
    mut records: Vec<codetwo_core::usage::UsageRecord>,
    now: i64,
    days: u32,
) -> UsageHistoryReport {
    let days = days.clamp(1, 365) as usize;
    let (bucket_secs, bucket_count) = if days <= 7 {
        (3_600, days * 24)
    } else {
        (86_400, days)
    };
    let history = codetwo_core::usage::history(&records, now, bucket_secs, bucket_count);
    let end = history.start_ms + bucket_secs * 1000 * bucket_count as i64;
    records.retain(|record| record.at_ms >= history.start_ms && record.at_ms < end);
    let by_source = codetwo_core::usage::by_source_detailed(&records, history.start_ms);
    UsageHistoryReport { history, by_source }
}

#[async_trait]
impl Plugin for UsagePlugin {
    fn name(&self) -> &str {
        "usage"
    }

    fn description(&self) -> Option<&str> {
        Some("Rolling local provider usage windows and history.")
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        ctx.command("usage.report", |_| async move {
            let scan = tokio::task::spawn_blocking(codetwo_core::usage::scan_all_with_count)
                .await
                .unwrap_or_default();
            let now = codetwo_core::session::now_millis();
            let limits = codetwo_core::usage::Limits::from_env();
            json(UsageReport {
                windows: codetwo_core::usage::windows(&scan.records, now, &limits),
                by_source: codetwo_core::usage::by_source(&scan.records),
                transcripts: scan.transcripts,
            })
        })?;

        #[derive(Deserialize)]
        struct HistoryArgs {
            days: u32,
        }
        ctx.command("usage.history", |args| async move {
            let args: HistoryArgs = take_args(args)?;
            let scan = tokio::task::spawn_blocking(codetwo_core::usage::scan_all_with_count)
                .await
                .unwrap_or_default();
            let now = codetwo_core::session::now_millis();
            json(usage_history_report(scan.records, now, args.days))
        })?;

        #[derive(Deserialize)]
        struct ProviderQuotaArgs {
            provider: String,
        }
        ctx.command("usage.provider_quota", |args| async move {
            let args: ProviderQuotaArgs = take_args(args)?;
            let provider = match args.provider.as_str() {
                "claude_code" => codetwo_core::provider::ProviderId::ClaudeCode,
                "codex" => codetwo_core::provider::ProviderId::Codex,
                "grok" => codetwo_core::provider::ProviderId::Grok,
                "cursor" => codetwo_core::provider::ProviderId::Cursor,
                "opencode" => codetwo_core::provider::ProviderId::OpenCode,
                "opencode2" => codetwo_core::provider::ProviderId::OpenCode2,
                "pi" => codetwo_core::provider::ProviderId::Pi,
                "kimi" => codetwo_core::provider::ProviderId::Kimi,
                "zcode" => codetwo_core::provider::ProviderId::ZCode,
                "amp" => codetwo_core::provider::ProviderId::Amp,
                "droid" => codetwo_core::provider::ProviderId::Droid,
                other => codetwo_core::provider::ProviderId::Custom(other.to_string()),
            };
            json(codetwo_core::usage::provider_quota(&provider).await)
        })?;
        Ok(())
    }
}

pub struct VoicePlugin;

#[async_trait]
impl Plugin for VoicePlugin {
    fn name(&self) -> &str {
        "voice"
    }

    fn description(&self) -> Option<&str> {
        Some("Local speech transcription when a supported backend is available.")
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        ctx.command("voice.available", |_| async move {
            Ok(Value::Bool(codetwo_core::voice::is_available()))
        })?;

        #[derive(Deserialize)]
        struct TranscribeArgs {
            bytes: Vec<u8>,
            #[serde(default)]
            ext: Option<String>,
        }
        ctx.command("voice.transcribe", |args| async move {
            let args: TranscribeArgs = take_args(args)?;
            let path =
                codetwo_core::voice::save_audio(&args.bytes, args.ext.as_deref().unwrap_or("webm"))
                    .map_err(PluginError::new)?;
            let result = codetwo_core::voice::transcribe(&path)
                .await
                .map_err(PluginError::new);
            let _ = std::fs::remove_file(&path);
            json(result?)
        })?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_history_honors_days_and_shares_chart_boundaries() {
        let day = 86_400_000;
        let now = 100 * day + day / 2;
        let record = |at_ms| codetwo_core::usage::UsageRecord {
            at_ms,
            input_tokens: 10,
            cached_tokens: 0,
            output_tokens: 0,
            source: "codex".into(),
            model: None,
            dedupe_key: None,
        };
        let report = usage_history_report(
            vec![
                record(10 * day + day / 2),
                record(11 * day),
                record(now),
                record(101 * day),
            ],
            now,
            90,
        );
        assert_eq!(report.history.bucket_count, 90);
        assert_eq!(report.history.start_ms, 11 * day);
        let chart_total: u64 = report
            .history
            .series
            .iter()
            .flat_map(|series| &series.totals)
            .sum();
        let provider_total: u64 = report
            .by_source
            .iter()
            .map(|source| source.total_tokens)
            .sum();
        assert_eq!(chart_total, 20);
        assert_eq!(chart_total, provider_total);
    }
}
