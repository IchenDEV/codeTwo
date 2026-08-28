//! Project memory, as a plugin.
//!
//! Every command here injects `store` and does nothing else. Turn `store` off and the memory
//! surface disappears from the app instead of failing at call time with "memory store
//! unavailable" — which is what the old wrappers had to say, nine times, because nothing in the
//! type system stopped them from being called without one.

use crate::app::service::{MemoryService, StoreService};
use crate::app::{json, take_args};
use codetwo_core::memory::{MemoryCapability, MemoryProjectPolicy, MemorySettings};
use codetwo_core::session::MemoryAccess;
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginError, PluginResult};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

#[derive(Deserialize)]
struct ProjectArgs {
    project_path: String,
    #[serde(default)]
    limit: Option<usize>,
}

pub struct MemoryPlugin;

#[async_trait]
impl Plugin for MemoryPlugin {
    fn name(&self) -> &str {
        "memory"
    }

    fn description(&self) -> Option<&str> {
        Some("Provider-neutral project memory (L0–L3 recall).")
    }

    fn inject(&self) -> Injection {
        Injection::required(["store"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let store = ctx.expect::<StoreService>()?;
        let memory = MemoryCapability::new(store.0.clone());
        memory.catch_up().map_err(PluginError::new)?;
        ctx.provide(Arc::new(MemoryService(memory.clone())))?;
        ctx.effect(move || memory.deactivate());

        let read = store.clone();
        ctx.command("memory.settings", move |_| {
            let store = read.clone();
            async move { json(store.memory_settings().map_err(PluginError::new)?) }
        })?;

        #[derive(Deserialize)]
        struct SettingsArgs {
            settings: MemorySettings,
        }
        let write = store.clone();
        ctx.command("memory.set_settings", move |args| {
            let store = write.clone();
            async move {
                let args: SettingsArgs = take_args(args)?;
                store
                    .set_memory_settings(args.settings)
                    .map_err(PluginError::new)?;
                Ok(Value::Bool(true))
            }
        })?;

        let project_policy = store.clone();
        ctx.command("memory.project_policy", move |args| {
            let store = project_policy.clone();
            async move {
                let args: ProjectArgs = take_args(args)?;
                json(
                    store
                        .memory_project_policy(&args.project_path)
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        #[derive(Deserialize)]
        struct ProjectPolicyArgs {
            project_path: String,
            policy: MemoryProjectPolicy,
        }
        let set_project_policy = store.clone();
        ctx.command("memory.set_project_policy", move |args| {
            let store = set_project_policy.clone();
            async move {
                let args: ProjectPolicyArgs = take_args(args)?;
                if args.policy.project_path != args.project_path {
                    return Err(PluginError::new("project policy path mismatch"));
                }
                store
                    .set_memory_project_policy(&args.policy)
                    .map_err(PluginError::new)?;
                Ok(Value::Bool(true))
            }
        })?;

        let listed = store.clone();
        ctx.command("memory.list", move |args| {
            let store = listed.clone();
            async move {
                let args: ProjectArgs = take_args(args)?;
                json(
                    store
                        .list_memories(&args.project_path, args.limit.unwrap_or(100).min(500))
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        let managed = store.clone();
        ctx.command("memory.manage_list", move |args| {
            let store = managed.clone();
            async move {
                let args: ProjectArgs = take_args(args)?;
                json(
                    store
                        .list_managed_memories(
                            &args.project_path,
                            args.limit.unwrap_or(500).min(500),
                        )
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        #[derive(Deserialize)]
        struct SearchArgs {
            project_path: String,
            query: String,
            #[serde(default)]
            limit: Option<usize>,
        }
        let searched = store.clone();
        ctx.command("memory.search", move |args| {
            let store = searched.clone();
            async move {
                let args: SearchArgs = take_args(args)?;
                json(
                    store
                        .search_memories(
                            &args.project_path,
                            &args.query,
                            args.limit.unwrap_or(50).min(100),
                        )
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        let stats = store.clone();
        ctx.command("memory.stats", move |args| {
            let store = stats.clone();
            async move {
                let args: ProjectArgs = take_args(args)?;
                json(
                    store
                        .memory_stats(&args.project_path)
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        #[derive(Deserialize)]
        struct AddArgs {
            project_path: String,
            category: String,
            content: String,
            #[serde(default)]
            pinned: bool,
        }
        let added = store.clone();
        ctx.command("memory.add", move |args| {
            let store = added.clone();
            async move {
                let args: AddArgs = take_args(args)?;
                json(
                    store
                        .add_memory(
                            &args.project_path,
                            &args.category,
                            &args.content,
                            args.pinned,
                        )
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        #[derive(Deserialize)]
        struct FlagArgs {
            id: String,
            value: bool,
        }
        let pinned = store.clone();
        ctx.command("memory.set_pinned", move |args| {
            let store = pinned.clone();
            async move {
                let args: FlagArgs = take_args(args)?;
                store
                    .set_memory_pinned(&args.id, args.value)
                    .map_err(PluginError::new)?;
                Ok(Value::Bool(true))
            }
        })?;

        let active = store.clone();
        ctx.command("memory.set_active", move |args| {
            let store = active.clone();
            async move {
                let args: FlagArgs = take_args(args)?;
                store
                    .set_memory_active(&args.id, args.value)
                    .map_err(PluginError::new)?;
                Ok(Value::Bool(true))
            }
        })?;

        #[derive(Deserialize)]
        struct EditArgs {
            id: String,
            category: String,
            content: String,
        }
        let updated = store.clone();
        ctx.command("memory.update", move |args| {
            let store = updated.clone();
            async move {
                let args: EditArgs = take_args(args)?;
                json(
                    store
                        .update_memory(&args.id, &args.category, &args.content)
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        #[derive(Deserialize)]
        struct CategoryArgs {
            id: String,
            category: String,
        }
        let categorized = store.clone();
        ctx.command("memory.set_category", move |args| {
            let store = categorized.clone();
            async move {
                let args: CategoryArgs = take_args(args)?;
                json(
                    store
                        .set_memory_category(&args.id, &args.category)
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        let corrected = store.clone();
        ctx.command("memory.correct", move |args| {
            let store = corrected.clone();
            async move {
                let args: EditArgs = take_args(args)?;
                json(
                    store
                        .correct_memory(&args.id, &args.category, &args.content)
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        #[derive(Deserialize)]
        struct IdArgs {
            id: String,
        }
        let deleted = store.clone();
        ctx.command("memory.delete", move |args| {
            let store = deleted.clone();
            async move {
                let args: IdArgs = take_args(args)?;
                store.delete_memory(&args.id).map_err(PluginError::new)?;
                Ok(Value::Bool(true))
            }
        })?;

        #[derive(Deserialize)]
        struct EvidenceArgs {
            id: String,
            #[serde(default)]
            reveal: bool,
        }
        let evidence = store.clone();
        ctx.command("memory.evidence", move |args| {
            let store = evidence.clone();
            async move {
                let args: EvidenceArgs = take_args(args)?;
                json(
                    store
                        .memory_evidence(&args.id, args.reveal)
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        let usages = store.clone();
        ctx.command("memory.usages", move |args| {
            let store = usages.clone();
            async move {
                let args: IdArgs = take_args(args)?;
                json(store.memory_usages(&args.id).map_err(PluginError::new)?)
            }
        })?;

        #[derive(Deserialize)]
        struct PolicyArgs {
            session: String,
            read: MemoryAccess,
            write: MemoryAccess,
        }
        let policy = store.clone();
        ctx.command("memory.set_session_policy", move |args| {
            let store = policy.clone();
            async move {
                let args: PolicyArgs = take_args(args)?;
                store
                    .set_session_memory_policy(&args.session, args.read, args.write)
                    .map_err(PluginError::new)?;
                Ok(Value::Bool(true))
            }
        })?;

        #[derive(Deserialize)]
        struct SessionArgs {
            session: String,
        }
        ctx.command("memory.receipts", move |args| {
            let store = store.clone();
            async move {
                let args: SessionArgs = take_args(args)?;
                json(
                    store
                        .list_memory_receipts(&args.session)
                        .map_err(PluginError::new)?,
                )
            }
        })?;
        Ok(())
    }
}
