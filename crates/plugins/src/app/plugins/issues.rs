//! Issue tracker reads, comments, brief structuring, and the delegation activity trail.

use crate::app::service::StoreService;
use crate::app::{json, take_args};
use codetwo_core::issues::{self, Issue};
use codetwo_core::skill::SlotDef;
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginError, PluginResult};
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;

pub struct IssuesPlugin;

#[async_trait]
impl Plugin for IssuesPlugin {
    fn name(&self) -> &str {
        "issues"
    }

    fn description(&self) -> Option<&str> {
        Some("GitHub and Linear issue import, comments, and delegation history.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["store"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        ctx.command("issues.github_available", |_| async move {
            Ok(Value::Bool(issues::gh_available()))
        })?;

        #[derive(Deserialize)]
        struct GitHubArgs {
            cwd: String,
            #[serde(default)]
            limit: Option<u32>,
        }
        ctx.command("issues.list_github", |args| async move {
            let args: GitHubArgs = take_args(args)?;
            json(
                issues::list_github(Path::new(&args.cwd), args.limit.unwrap_or(30))
                    .await
                    .map_err(PluginError::new)?,
            )
        })?;

        #[derive(Deserialize)]
        struct LinearArgs {
            token: String,
            #[serde(default)]
            limit: Option<u32>,
        }
        ctx.command("issues.list_linear", |args| async move {
            let args: LinearArgs = take_args(args)?;
            json(
                issues::list_linear(&args.token, args.limit.unwrap_or(30))
                    .await
                    .map_err(PluginError::new)?,
            )
        })?;

        #[derive(Deserialize)]
        struct ContextArgs {
            issue: Issue,
        }
        ctx.command("issues.context", |args| async move {
            let args: ContextArgs = take_args(args)?;
            json(args.issue.to_context())
        })?;

        #[derive(Deserialize)]
        struct CommentArgs {
            cwd: String,
            source: String,
            id: String,
            body: String,
            #[serde(default)]
            token: Option<String>,
        }
        ctx.command("issues.comment", |args| async move {
            let args: CommentArgs = take_args(args)?;
            let url = match args.source.as_str() {
                "github" => issues::comment_github(Path::new(&args.cwd), &args.id, &args.body)
                    .await
                    .map_err(PluginError::new)?,
                "linear" => {
                    let token = args
                        .token
                        .ok_or_else(|| PluginError::new("Linear token required"))?;
                    let issue_id = issues::resolve_linear_issue_id(&token, &args.id)
                        .await
                        .map_err(PluginError::new)?;
                    issues::comment_linear(&token, &issue_id, &args.body)
                        .await
                        .map_err(PluginError::new)?
                }
                other => return Err(PluginError::new(format!("unknown issue source: {other}"))),
            };
            json(url)
        })?;

        #[derive(Deserialize)]
        struct BriefArgs {
            transcript: String,
            slots: Vec<SlotDef>,
        }
        ctx.command("issues.structure_brief", |args| async move {
            let args: BriefArgs = take_args(args)?;
            json(codetwo_core::brief::structure_brief_heuristic(
                &args.transcript,
                &args.slots,
            ))
        })?;

        let store = ctx.expect::<StoreService>()?;
        #[derive(Deserialize)]
        struct RecordArgs {
            source: String,
            issue_id: String,
            issue_title: String,
            scene_ref: String,
            scene_title: String,
        }
        let recording = store.clone();
        ctx.command("issues.record_delegation", move |args| {
            let store = recording.clone();
            async move {
                let args: RecordArgs = take_args(args)?;
                json(
                    store
                        .record_issue_delegation(
                            &args.source,
                            &args.issue_id,
                            &args.issue_title,
                            &args.scene_ref,
                            &args.scene_title,
                        )
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        #[derive(Deserialize)]
        struct SessionArgs {
            id: i64,
            session: String,
        }
        let session = store.clone();
        ctx.command("issues.set_delegation_session", move |args| {
            let store = session.clone();
            async move {
                let args: SessionArgs = take_args(args)?;
                store
                    .set_issue_delegation_session(args.id, &args.session)
                    .map_err(PluginError::new)?;
                Ok(Value::Bool(true))
            }
        })?;

        #[derive(Deserialize)]
        struct CommentUrlArgs {
            id: i64,
            url: String,
        }
        let comment = store.clone();
        ctx.command("issues.set_delegation_comment", move |args| {
            let store = comment.clone();
            async move {
                let args: CommentUrlArgs = take_args(args)?;
                store
                    .set_issue_delegation_comment(args.id, &args.url)
                    .map_err(PluginError::new)?;
                Ok(Value::Bool(true))
            }
        })?;

        #[derive(Deserialize)]
        struct ListArgs {
            source: String,
            issue_id: String,
        }
        ctx.command("issues.delegations", move |args| {
            let store = store.clone();
            async move {
                let args: ListArgs = take_args(args)?;
                json(
                    store
                        .list_issue_delegations(&args.source, &args.issue_id)
                        .map_err(PluginError::new)?,
                )
            }
        })?;
        Ok(())
    }
}
