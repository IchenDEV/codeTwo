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
use crate::scene::{Pipeline, Scene, SceneLibrary, SceneSource};
use crate::scene_artifact::SceneArtifactStore;
use crate::skill::{Skill, SkillKind, SkillPayload, SlotDef};
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Deserialize)]
struct CwdArgs {
    #[serde(default)]
    cwd: Option<String>,
}

#[derive(Serialize)]
struct SceneInfo {
    reference: String,
    name: String,
    title: String,
    description: String,
    icon: Option<String>,
    source: &'static str,
    plugin_id: Option<String>,
    keywords: Vec<String>,
    has_brief: bool,
    localizations: std::collections::HashMap<String, crate::scene::SceneLocalization>,
    execution: Option<crate::scene::SceneExecution>,
    brief: Option<crate::scene::SceneBrief>,
    artifacts: Vec<crate::scene::SceneArtifactSpec>,
    skills: Option<crate::scene::SceneSkills>,
    exit: Option<crate::scene::SceneExit>,
}

impl SceneInfo {
    fn from_resolved(entry: &crate::scene::ResolvedScene) -> Self {
        let plugin_id = match &entry.source {
            SceneSource::Plugin { plugin_id } => Some(plugin_id.clone()),
            _ => None,
        };
        Self {
            reference: SceneLibrary::reference_for(entry),
            name: entry.scene.name.clone(),
            title: entry.scene.title.clone(),
            description: entry.scene.description.clone(),
            icon: entry.scene.icon.clone(),
            source: entry.source.source_label(),
            plugin_id,
            keywords: entry.scene.keywords.clone(),
            has_brief: entry.scene.brief.is_some(),
            localizations: entry.scene.localizations.clone(),
            execution: entry.scene.execution.clone(),
            brief: entry.scene.brief.clone(),
            artifacts: entry.scene.artifacts.clone(),
            skills: entry.scene.skills.clone(),
            exit: entry.scene.exit.clone(),
        }
    }
}

#[derive(Serialize)]
struct SceneDetail {
    reference: String,
    source: &'static str,
    scene: Scene,
}

#[derive(Serialize)]
struct PipelineInfo {
    reference: String,
    name: String,
    title: String,
    description: String,
    icon: Option<String>,
    source: &'static str,
    stage_count: usize,
}

#[derive(Serialize)]
struct PipelineDetail {
    reference: String,
    source: &'static str,
    pipeline: Pipeline,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
enum SceneSaveScope {
    User,
    Project,
}

/// Stable frontend projection for a skill. The plugin command owns this wire shape so every host
/// sees the same data; frontends must not reconstruct it from the storage representation.
#[derive(Serialize)]
struct SkillInfo {
    id: String,
    name: String,
    description: String,
    icon: Option<String>,
    kind: &'static str,
    source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    macro_template: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    macro_slots: Option<Vec<SlotDef>>,
}

impl SkillInfo {
    fn from_skill(skill: &Skill) -> SkillInfo {
        let (macro_template, macro_slots) = match &skill.payload {
            SkillPayload::Macro { template, slots } => {
                (Some(template.clone()), Some(slots.clone()))
            }
            _ => (None, None),
        };
        let kind = match skill.kind() {
            SkillKind::Fragment => "fragment",
            SkillKind::AgentSkill => "agent_skill",
            SkillKind::Subagent => "subagent",
            SkillKind::Mcp => "mcp",
            SkillKind::Macro => "macro",
        };
        SkillInfo {
            id: skill.id.clone(),
            name: skill.name.clone(),
            description: skill.description.clone(),
            icon: skill.icon.clone(),
            kind,
            source: skill
                .source
                .clone()
                .or_else(|| crate::harness::source_label(&skill.id).map(str::to_string)),
            macro_template,
            macro_slots,
        }
    }
}

fn skill_infos(skills: &SkillService) -> Vec<SkillInfo> {
    let mut infos: Vec<_> = skills.list().iter().map(SkillInfo::from_skill).collect();
    infos.sort_by(|a, b| (a.source.as_deref(), &a.name).cmp(&(b.source.as_deref(), &b.name)));
    infos
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
                if let Some(ctx) = weak.upgrade() {
                    let emitting = ctx.clone();
                    ctx.spawn(async move {
                        emitting.emit(SkillsChanged).await;
                    });
                }
            }
        };

        let listed = skills.clone();
        let list_ctx = ctx.weak();
        ctx.command("skills.list", move |args| {
            let skills = listed.clone();
            let weak = list_ctx.clone();
            async move {
                let args: CwdArgs = take_args(args)?;
                if let Some(cwd) = args.cwd {
                    skills.reload(Some(std::path::Path::new(&cwd)));
                    if let Some(ctx) = weak.upgrade() {
                        ctx.emit(SkillsChanged).await;
                    }
                }
                json(skill_infos(&skills))
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
                json(skill_infos(&skills))
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
                json(skill_infos(&skills))
            }
        })?;

        #[derive(Deserialize)]
        struct ProposeArgs {
            text: String,
        }
        #[derive(Serialize)]
        struct ProposedMacro {
            template: String,
            slots: Vec<SlotDef>,
        }
        ctx.command("skills.propose_macro", move |args| async move {
            let args: ProposeArgs = take_args(args)?;
            let (template, slots) = crate::skill::propose_macro_slots(&args.text);
            json(ProposedMacro { template, slots })
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

        let announce = {
            let weak = ctx.weak();
            move || {
                if let Some(ctx) = weak.upgrade() {
                    let emitting = ctx.clone();
                    ctx.spawn(async move {
                        emitting.emit(ScenesChanged).await;
                    });
                }
            }
        };

        let listed = scenes.clone();
        let list_hub = hub.clone();
        let after_list = announce.clone();
        ctx.command("scenes.list", move |args| {
            let scenes = listed.clone();
            let hub = list_hub.clone();
            let announce = after_list.clone();
            async move {
                let args: CwdArgs = take_args(args)?;
                if let Some(cwd) = args.cwd {
                    scenes.reload(Some(std::path::Path::new(&cwd)), hub.as_deref());
                    announce();
                }
                let library = scenes.library();
                json(
                    library
                        .scenes()
                        .iter()
                        .map(SceneInfo::from_resolved)
                        .collect::<Vec<_>>(),
                )
            }
        })?;

        #[derive(Deserialize)]
        struct ReferenceArgs {
            reference: String,
        }
        let getting = scenes.clone();
        ctx.command("scenes.get", move |args| {
            let scenes = getting.clone();
            async move {
                let args: ReferenceArgs = take_args(args)?;
                let library = scenes.library();
                let entry = library.resolve(&args.reference).ok_or_else(|| {
                    codetwo_kernel::PluginError::new(format!("unknown scene `{}`", args.reference))
                })?;
                json(SceneDetail {
                    reference: SceneLibrary::reference_for(entry),
                    source: entry.source.source_label(),
                    scene: entry.scene.clone(),
                })
            }
        })?;

        #[derive(Deserialize)]
        struct SaveArgs {
            scope: SceneSaveScope,
            #[serde(default)]
            cwd: Option<String>,
            #[serde(default)]
            previous_name: Option<String>,
            scene: Scene,
        }
        let saving = scenes.clone();
        let save_hub = hub.clone();
        let after_save = announce.clone();
        ctx.command("scenes.save", move |args| {
            let scenes = saving.clone();
            let hub = save_hub.clone();
            let announce = after_save.clone();
            async move {
                let args: SaveArgs = take_args(args)?;
                if let Some(cwd) = args.cwd.as_deref() {
                    scenes.reload(Some(std::path::Path::new(cwd)), hub.as_deref());
                }
                let dir = editable_scene_dir(&scenes, args.scope, args.cwd.as_deref())?;
                SceneLibrary::save_to_dir(&dir, &args.scene, args.previous_name.as_deref())?;
                scenes.reload(None, hub.as_deref());
                announce();

                let prefix = match args.scope {
                    SceneSaveScope::User => "user",
                    SceneSaveScope::Project => "project",
                };
                let reference = format!("{prefix}:{}", args.scene.name);
                let library = scenes.library();
                let entry = library.resolve(&reference).ok_or_else(|| {
                    codetwo_kernel::PluginError::new(format!(
                        "saved scene `{reference}` could not be reloaded"
                    ))
                })?;
                json(SceneInfo::from_resolved(entry))
            }
        })?;

        #[derive(Deserialize)]
        struct DeleteArgs {
            scope: SceneSaveScope,
            #[serde(default)]
            cwd: Option<String>,
            name: String,
        }
        let deleting = scenes.clone();
        let delete_hub = hub.clone();
        let after_delete = announce.clone();
        ctx.command("scenes.delete", move |args| {
            let scenes = deleting.clone();
            let hub = delete_hub.clone();
            let announce = after_delete.clone();
            async move {
                let args: DeleteArgs = take_args(args)?;
                if let Some(cwd) = args.cwd.as_deref() {
                    scenes.reload(Some(std::path::Path::new(cwd)), hub.as_deref());
                }
                let dir = editable_scene_dir(&scenes, args.scope, args.cwd.as_deref())?;
                SceneLibrary::delete_from_dir(&dir, &args.name)?;
                scenes.reload(None, hub.as_deref());
                announce();
                Ok(Value::Bool(true))
            }
        })?;

        let pipelines = scenes.clone();
        ctx.command("pipelines.list", move |_| {
            let scenes = pipelines.clone();
            async move {
                let library = scenes.library();
                json(
                    library
                        .pipelines()
                        .iter()
                        .map(|entry| PipelineInfo {
                            reference: SceneLibrary::pipeline_reference_for(entry),
                            name: entry.pipeline.name.clone(),
                            title: entry.pipeline.title.clone(),
                            description: entry.pipeline.description.clone(),
                            icon: entry.pipeline.icon.clone(),
                            source: entry.source.source_label(),
                            stage_count: entry.pipeline.stages.len(),
                        })
                        .collect::<Vec<_>>(),
                )
            }
        })?;

        let pipeline = scenes.clone();
        ctx.command("pipelines.get", move |args| {
            let scenes = pipeline.clone();
            async move {
                let args: ReferenceArgs = take_args(args)?;
                let library = scenes.library();
                let entry = library.resolve_pipeline(&args.reference).ok_or_else(|| {
                    codetwo_kernel::PluginError::new(format!(
                        "unknown pipeline `{}`",
                        args.reference
                    ))
                })?;
                json(PipelineDetail {
                    reference: SceneLibrary::pipeline_reference_for(entry),
                    source: entry.source.source_label(),
                    pipeline: entry.pipeline.clone(),
                })
            }
        })?;

        let exporting = scenes.clone();
        ctx.command("scenes.export_skill_md", move |args| {
            let scenes = exporting.clone();
            async move {
                let args: ReferenceArgs = take_args(args)?;
                let library = scenes.library();
                let entry = library.resolve(&args.reference).ok_or_else(|| {
                    codetwo_kernel::PluginError::new(format!("unknown scene `{}`", args.reference))
                })?;
                json(crate::scene::export_skill_md(&entry.scene))
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
        let announce_workspace = announce.clone();
        ctx.on::<WorkspaceChanged, _>(move |event| {
            on_workspace.reload(Some(&event.cwd), workspace_hub.as_deref());
            announce_workspace();
            None
        });
        let on_plugins = scenes.clone();
        let announce_plugins = announce.clone();
        ctx.on::<PluginsChanged, _>(move |_| {
            on_plugins.reload(None, hub.as_deref());
            announce_plugins();
            None
        });
        Ok(())
    }
}

fn editable_scene_dir(
    scenes: &SceneService,
    scope: SceneSaveScope,
    cwd: Option<&str>,
) -> Result<PathBuf, codetwo_kernel::PluginError> {
    match scope {
        SceneSaveScope::User => crate::provider::home_dir()
            .map(|home| home.join(".config/codetwo/scenes"))
            .ok_or_else(|| codetwo_kernel::PluginError::new("home directory is unavailable")),
        SceneSaveScope::Project => cwd
            .map(PathBuf::from)
            .or_else(|| scenes.cwd())
            .map(|root| root.join(".codetwo/scenes"))
            .ok_or_else(|| {
                codetwo_kernel::PluginError::new("a project is required for project scenes")
            }),
    }
}
