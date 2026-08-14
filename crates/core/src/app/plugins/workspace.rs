//! Workspace-facing plugins: git, key bindings, the skill market.
//!
//! `git` is the clearest example of what the command registry buys us. It injects nothing, owns no
//! state, and every one of its thirteen commands is a two-line call into [`crate::git`] — yet
//! before this each one existed twice, as a core function and as a hand-written `#[tauri::command]`
//! wrapper listed in a 185-entry table. Here the plugin *is* the registration.

use crate::app::service::{KeymapService, Paths};
use crate::app::{json, take_args};
use crate::git;
use crate::keymap::Action;
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginError, PluginResult};
use serde::Deserialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Deserialize)]
struct CwdArgs {
    cwd: String,
}

// ---- git --------------------------------------------------------------------------------------

pub struct GitPlugin;

#[async_trait]
impl Plugin for GitPlugin {
    fn name(&self) -> &str {
        "git"
    }

    fn description(&self) -> Option<&str> {
        Some("Status, checkpoints, diffs, staging, commit and push.")
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        ctx.command("git.status", |args| async move {
            let args: CwdArgs = take_args(args)?;
            json(git::status(Path::new(&args.cwd)).await)
        })?;

        ctx.command("git.is_repo", |args| async move {
            let args: CwdArgs = take_args(args)?;
            Ok(Value::Bool(git::is_repo(Path::new(&args.cwd)).await))
        })?;

        #[derive(Deserialize)]
        struct MessageArgs {
            cwd: String,
            message: String,
        }
        ctx.command("git.checkpoint", |args| async move {
            let args: MessageArgs = take_args(args)?;
            json(git::checkpoint(Path::new(&args.cwd), &args.message).await?)
        })?;

        ctx.command("git.checkpoints", |args| async move {
            let args: CwdArgs = take_args(args)?;
            json(git::list_checkpoints(Path::new(&args.cwd)).await)
        })?;

        #[derive(Deserialize)]
        struct DiffArgs {
            cwd: String,
            #[serde(default)]
            path: Option<String>,
            #[serde(default)]
            scope: Option<git::DiffScope>,
        }
        ctx.command("git.diff", |args| async move {
            let args: DiffArgs = take_args(args)?;
            json(
                git::diff(
                    Path::new(&args.cwd),
                    args.path.as_deref(),
                    args.scope.unwrap_or_default(),
                )
                .await?,
            )
        })?;

        #[derive(Deserialize)]
        struct SinceArgs {
            cwd: String,
            commit: String,
        }
        ctx.command("git.diff_since", |args| async move {
            let args: SinceArgs = take_args(args)?;
            json(git::diff_since(Path::new(&args.cwd), &args.commit).await?)
        })?;

        ctx.command("git.diff_stat", |args| async move {
            let args: CwdArgs = take_args(args)?;
            json(git::diff_stat(Path::new(&args.cwd)).await?)
        })?;

        #[derive(Deserialize)]
        struct PathsArgs {
            cwd: String,
            paths: Vec<String>,
        }
        ctx.command("git.stage", |args| async move {
            let args: PathsArgs = take_args(args)?;
            git::stage_paths(Path::new(&args.cwd), &args.paths).await?;
            Ok(Value::Bool(true))
        })?;

        ctx.command("git.unstage", |args| async move {
            let args: PathsArgs = take_args(args)?;
            git::unstage_paths(Path::new(&args.cwd), &args.paths).await?;
            Ok(Value::Bool(true))
        })?;

        ctx.command("git.revert", |args| async move {
            let args: SinceArgs = take_args(args)?;
            git::revert_to(Path::new(&args.cwd), &args.commit).await?;
            Ok(Value::Bool(true))
        })?;

        ctx.command("git.commit", |args| async move {
            let args: MessageArgs = take_args(args)?;
            json(git::commit(Path::new(&args.cwd), &args.message).await?)
        })?;

        ctx.command("git.push", |args| async move {
            let args: CwdArgs = take_args(args)?;
            json(git::push(Path::new(&args.cwd)).await?)
        })?;

        #[derive(Deserialize)]
        struct PrArgs {
            cwd: String,
            title: String,
            #[serde(default)]
            body: String,
        }
        ctx.command("git.create_pr", |args| async move {
            let args: PrArgs = take_args(args)?;
            json(git::create_pr(Path::new(&args.cwd), &args.title, &args.body).await?)
        })?;

        ctx.command("git.suggest_message", |args| async move {
            let args: CwdArgs = take_args(args)?;
            json(git::suggest_commit_message(Path::new(&args.cwd)).await)
        })?;
        Ok(())
    }
}

// ---- keymap -----------------------------------------------------------------------------------

pub struct KeymapPlugin;

#[async_trait]
impl Plugin for KeymapPlugin {
    fn name(&self) -> &str {
        "keymap"
    }

    fn description(&self) -> Option<&str> {
        Some("Editable key bindings.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["paths"])
    }

    async fn apply(&self, ctx: Context, config: Value) -> PluginResult {
        #[derive(Default, Deserialize)]
        struct Config {
            #[serde(default)]
            path: Option<String>,
        }
        let config: Config = serde_json::from_value(config).unwrap_or_default();
        let paths = ctx.expect::<Paths>()?;
        let path = config.path.map(PathBuf::from).unwrap_or_else(|| paths.keymap());
        let keymap = Arc::new(KeymapService::load(path));
        ctx.provide(keymap.clone())?;

        let read = keymap.clone();
        ctx.command("keymap.get", move |_| {
            let keymap = read.clone();
            async move { json(keymap.snapshot()) }
        })?;

        #[derive(Deserialize)]
        struct SetArgs {
            action: Action,
            key: String,
        }
        ctx.command("keymap.set", move |args| {
            let keymap = keymap.clone();
            async move {
                let args: SetArgs = take_args(args)?;
                json(keymap.set(args.action, args.key)?)
            }
        })?;
        Ok(())
    }
}

// ---- market -----------------------------------------------------------------------------------

/// The built-in skill catalogue. Small enough to look trivial, which is the point: a feature this
/// size should cost one file and one line of config, not a place in a central table.
pub struct MarketPlugin;

#[async_trait]
impl Plugin for MarketPlugin {
    fn name(&self) -> &str {
        "market"
    }

    fn description(&self) -> Option<&str> {
        Some("The built-in skill catalogue.")
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        ctx.command("market.catalog", |_| async move { json(crate::market::builtin_catalog()) })?;

        #[derive(Deserialize)]
        struct ParseArgs {
            json: String,
        }
        ctx.command("market.parse", |args| async move {
            let args: ParseArgs = take_args(args)?;
            json(crate::market::parse_catalog(&args.json).map_err(PluginError::new)?)
        })?;
        Ok(())
    }
}
