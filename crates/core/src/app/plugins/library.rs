//! Skills and scenes — the two libraries the document compiler resolves against.
//!
//! Both are *derived* state: built-ins, plus user files, plus whatever the installed plugin
//! bundles contribute, plus what the current workspace's harness directories reveal. They used to
//! be rebuilt by free functions reaching into `AppState`. Now each owns its own rebuild and
//! announces it, and whoever cares listens.

use crate::app::events::{PluginsChanged, ScenesChanged, SkillsChanged, WorkspaceChanged};
use crate::app::service::{Paths, PluginHub, SceneService, SkillService, StoreService};
use crate::app::{json, take_args};
use crate::artifact::ArtifactStore;
use crate::scene::SceneLibrary;
use crate::scene_artifact::SceneArtifactStore;
use crate::skill::Skill;
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginResult};
use serde::Deserialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Deserialize)]
struct CwdArgs {
    #[serde(default)]
    cwd: Option<String>,
}

// ---- skills -----------------------------------------------------------------------------------

/// The skill library and the commands that edit it.
pub struct SkillsPlugin;

#[async_trait]
impl Plugin for SkillsPlugin {
    fn name(&self) -> &str {
        "skills"
    }

    fn description(&self) -> Option<&str> {
        Some("The skill library: built-ins, user skills, plugin components, harness discovery.")
    }

    fn inject(&self) -> Injection {
        // `plugin-hub` is optional: without it the library is simply built without plugin
        // components, and it rebuilds by itself when the hub shows up.
        Injection::required(["paths"]).with_optional(["plugin-hub"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let paths = ctx.expect::<Paths>()?;
        let skills = Arc::new(SkillService::new(paths));
        ctx.provide(skills.clone())?;

        // Announce rebuilds instead of reaching into whoever might be holding a copy.
        let announce = {
            let weak = ctx.weak();
            move || {
                let weak = weak.clone();
                tokio::spawn(async move {
                    if let Some(ctx) = weak.upgrade() {
                        ctx.emit(SkillsChanged).await;
                    }
                });
            }
        };

        let listed = skills.clone();
        ctx.command("skills.list", move |args| {
            let skills = listed.clone();
            async move {
                let args: CwdArgs = take_args(args)?;
                if let Some(cwd) = args.cwd {
                    skills.reload(Some(std::path::Path::new(&cwd)));
                }
                json(skills.list())
            }
        })?;

        #[derive(Deserialize)]
        struct SaveArgs {
            skill: Skill,
        }
        let saved = skills.clone();
        let after_save = announce.clone();
        ctx.command("skills.save", move |args| {
            let skills = saved.clone();
            let announce = after_save.clone();
            async move {
                let args: SaveArgs = take_args(args)?;
                skills.save(&args.skill)?;
                announce();
                json(skills.list())
            }
        })?;

        #[derive(Deserialize)]
        struct DeleteArgs {
            id: String,
        }
        let deleted = skills.clone();
        let after_delete = announce.clone();
        ctx.command("skills.delete", move |args| {
            let skills = deleted.clone();
            let announce = after_delete.clone();
            async move {
                let args: DeleteArgs = take_args(args)?;
                skills.delete(&args.id)?;
                announce();
                json(skills.list())
            }
        })?;

        // A new workspace or a changed plugin set both invalidate the library.
        let on_workspace = skills.clone();
        let announce_workspace = announce.clone();
        ctx.on::<WorkspaceChanged, _>(move |event| {
            on_workspace.reload(Some(&event.cwd));
            announce_workspace();
            None
        });
        let on_plugins = skills.clone();
        ctx.on::<PluginsChanged, _>(move |_| {
            on_plugins.reload(None);
            announce();
            None
        });
        Ok(())
    }
}

// ---- scenes -----------------------------------------------------------------------------------

/// The scene/pipeline library plus the versioned artifact captures scenes produce.
pub struct ScenesPlugin;

#[async_trait]
impl Plugin for ScenesPlugin {
    fn name(&self) -> &str {
        "scenes"
    }

    fn description(&self) -> Option<&str> {
        Some("Agent Scenes: the resolved scene/pipeline library and its artifact captures.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["store"]).with_optional(["plugin-hub"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let store = ctx.expect::<StoreService>()?;
        let artifacts = match ArtifactStore::from_store(store.0.clone()) {
            Some(artifacts) => Some(SceneArtifactStore::new(store.0.clone(), artifacts)),
            None => {
                tracing::warn!("scene artifact capture is off: this store has no blob root");
                None
            }
        };
        let scenes = Arc::new(SceneService::new(artifacts));

        let hub = ctx.get::<PluginHub>();
        scenes.reload(None, hub.as_deref());
        ctx.provide(scenes.clone())?;

        let listed = scenes.clone();
        ctx.command("scenes.list", move |_| {
            let scenes = listed.clone();
            async move {
                let library = scenes.library();
                let scenes: Vec<Value> = library
                    .scenes()
                    .iter()
                    .map(|entry| {
                        serde_json::json!({
                            "reference": SceneLibrary::reference_for(entry),
                            "source": entry.source.source_label(),
                            "scene": entry.scene,
                        })
                    })
                    .collect();
                let pipelines: Vec<Value> = library
                    .pipelines()
                    .iter()
                    .map(|entry| {
                        serde_json::json!({
                            "reference": SceneLibrary::pipeline_reference_for(entry),
                            "source": entry.source.source_label(),
                            "pipeline": entry.pipeline,
                        })
                    })
                    .collect();
                json(serde_json::json!({ "scenes": scenes, "pipelines": pipelines }))
            }
        })?;

        let reloaded = scenes.clone();
        let reload_hub = hub.clone();
        let weak = ctx.weak();
        ctx.command("scenes.reload", move |args| {
            let scenes = reloaded.clone();
            let hub = reload_hub.clone();
            let weak = weak.clone();
            async move {
                let args: CwdArgs = take_args(args)?;
                let cwd = args.cwd.map(PathBuf::from);
                scenes.reload(cwd.as_deref(), hub.as_deref());
                if let Some(ctx) = weak.upgrade() {
                    ctx.emit(ScenesChanged).await;
                }
                Ok(Value::Bool(true))
            }
        })?;

        let on_workspace = scenes.clone();
        let workspace_hub = hub.clone();
        ctx.on::<WorkspaceChanged, _>(move |event| {
            on_workspace.reload(Some(&event.cwd), workspace_hub.as_deref());
            None
        });
        let on_plugins = scenes.clone();
        ctx.on::<PluginsChanged, _>(move |_| {
            on_plugins.reload(None, hub.as_deref());
            None
        });
        Ok(())
    }
}
