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
            let (bucket_secs, bucket_count) = if args.days <= 7 {
                (3_600i64, 7 * 24)
            } else {
                (86_400i64, 30)
            };
            let cutoff = now - bucket_secs * 1000 * bucket_count as i64;
            json(UsageHistoryReport {
                history: codetwo_core::usage::history(
                    &scan.records,
                    now,
                    bucket_secs,
                    bucket_count,
                ),
                by_source: codetwo_core::usage::by_source_detailed(&scan.records, cutoff),
            })
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
