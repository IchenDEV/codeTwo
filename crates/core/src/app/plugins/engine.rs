//! The agent loop, as a plugin.
//!
//! This is the one that proves the model. The engine is the biggest thing in the codebase and the
//! most connected — it needs storage, providers, the skill library, the scene library, and an
//! event sink. Under the old shape that meant a construction site in `setup()` that had to run in
//! exactly the right order and could never be undone.
//!
//! Here it declares five injections and gets torn down and rebuilt whenever any of them changes.
//! The event pump, the skill subscription, and the session commands all belong to its scope, so
//! "reload the engine" is a real operation rather than a restart.

use crate::app::events::{EngineEvent, ScenesChanged, SkillsChanged};
use crate::app::service::{
    EngineService, EventBus, ProviderService, SceneService, SkillService, StoreService,
};
use crate::app::{json, take_args};
use crate::engine::Engine;
use crate::event::Op;
use crate::session::TranscriptCursor;
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginError, PluginResult};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

/// What the engine is built from. A host that needs a different construction — the desktop
/// attaches its authenticated browser MCP to Codex sessions — gets these and returns an engine.
pub struct EngineInputs {
    pub providers: Vec<crate::provider::Provider>,
    pub skills: crate::skill::SkillLibrary,
    pub store: Arc<crate::store::Store>,
}

/// Replaces how the engine is constructed, without replacing what it is wired to.
pub type EngineBuilder = Arc<
    dyn Fn(EngineInputs) -> (Engine, tokio::sync::mpsc::UnboundedReceiver<crate::event::Event>)
        + Send
        + Sync,
>;

#[derive(Default)]
pub struct EnginePlugin {
    builder: Option<EngineBuilder>,
}

impl EnginePlugin {
    pub fn new() -> EnginePlugin {
        EnginePlugin::default()
    }

    /// Swap the construction step. Everything else — the injections, the event pump, the skill
    /// subscription, the session commands — stays exactly as it is, which is the point: a host
    /// customizes one seam instead of forking the boot sequence.
    pub fn with_builder(builder: EngineBuilder) -> EnginePlugin {
        EnginePlugin { builder: Some(builder) }
    }
}

#[async_trait]
impl Plugin for EnginePlugin {
    fn name(&self) -> &str {
        "engine"
    }

    fn description(&self) -> Option<&str> {
        Some("The ACP agent loop: sessions, prompts, permissions.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["store", "providers", "skills", "bus"]).with_optional(["scenes"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let store = ctx.expect::<StoreService>()?;
        let providers = ctx.expect::<ProviderService>()?;
        let skills = ctx.expect::<SkillService>()?;
        let bus = ctx.expect::<EventBus>()?;

        let inputs = EngineInputs {
            providers: providers.providers.clone(),
            skills: skills.library(),
            store: store.0.clone(),
        };
        let (engine, mut rx) = match &self.builder {
            Some(build) => build(inputs),
            None => Engine::with_store(inputs.providers, inputs.skills, inputs.store),
        };
        let engine = Arc::new(engine);

        // Scenes are optional: without them the engine compiles prompts against the default
        // (empty) library, exactly as it does in the TUI today.
        if let Some(scenes) = ctx.get::<SceneService>() {
            engine.set_scenes(scenes.library());
            if let Some(artifacts) = scenes.artifacts.clone() {
                engine.set_scene_artifacts(artifacts);
            }
        }

        // One pump, two audiences: the broadcast bus for subscribers that want a receiver, and the
        // kernel bus for plugins that want a scope-owned listener.
        let publisher = bus.clone();
        let weak = ctx.weak();
        ctx.spawn(async move {
            while let Some(event) = rx.recv().await {
                publisher.publish(event.clone());
                match weak.upgrade() {
                    Some(ctx) => ctx.emit(EngineEvent(event)).await,
                    None => break,
                }
            }
        });

        // The engine holds a compiled copy of both libraries; this is how they stay current
        // without the skills or scenes plugins knowing an engine exists.
        let refreshed = engine.clone();
        let source = skills.clone();
        ctx.on::<SkillsChanged, _>(move |_| {
            refreshed.set_skills(source.library());
            None
        });
        if let Some(scenes) = ctx.get::<SceneService>() {
            let refreshed = engine.clone();
            ctx.on::<ScenesChanged, _>(move |_| {
                refreshed.set_scenes(scenes.library());
                None
            });
        }

        ctx.provide(Arc::new(EngineService(engine.clone())))?;
        register_commands(&ctx, engine)?;
        Ok(())
    }
}

fn register_commands(ctx: &Context, engine: Arc<Engine>) -> Result<(), PluginError> {
    #[derive(Deserialize)]
    struct SubmitArgs {
        op: Op,
    }
    let submitting = engine.clone();
    ctx.command_described(
        "engine.submit",
        Some("Push one Op into the agent loop."),
        move |args| {
            let engine = submitting.clone();
            async move {
                let args: SubmitArgs = take_args(args)?;
                engine.submit(args.op).await.map_err(PluginError::new)?;
                Ok(Value::Bool(true))
            }
        },
    )?;

    let listing = engine.clone();
    ctx.command("sessions.list", move |_| {
        let engine = listing.clone();
        async move { json(engine.list_sessions().map_err(PluginError::new)?) }
    })?;

    let archived = engine.clone();
    ctx.command("sessions.archived", move |_| {
        let engine = archived.clone();
        async move { json(engine.list_archived().map_err(PluginError::new)?) }
    })?;

    #[derive(Deserialize)]
    struct SearchArgs {
        query: String,
        #[serde(default)]
        limit: Option<usize>,
    }
    let searching = engine.clone();
    ctx.command("sessions.search", move |args| {
        let engine = searching.clone();
        async move {
            let args: SearchArgs = take_args(args)?;
            json(
                engine
                    .search_sessions(&args.query, args.limit.unwrap_or(50).min(200))
                    .map_err(PluginError::new)?,
            )
        }
    })?;

    #[derive(Deserialize)]
    struct TranscriptArgs {
        session: String,
        #[serde(default)]
        before: Option<TranscriptCursor>,
        #[serde(default)]
        limit: Option<usize>,
    }
    let transcript = engine.clone();
    ctx.command("sessions.transcript", move |args| {
        let engine = transcript.clone();
        async move {
            let args: TranscriptArgs = take_args(args)?;
            json(
                engine
                    .transcript_page(
                        &args.session,
                        args.before,
                        args.limit.unwrap_or(crate::session::DEFAULT_TRANSCRIPT_TURNS),
                    )
                    .map_err(PluginError::new)?,
            )
        }
    })?;

    #[derive(Deserialize)]
    struct RenameArgs {
        session: String,
        title: String,
    }
    let renaming = engine.clone();
    ctx.command("sessions.rename", move |args| {
        let engine = renaming.clone();
        async move {
            let args: RenameArgs = take_args(args)?;
            engine.rename_session(&args.session, &args.title);
            Ok(Value::Bool(true))
        }
    })?;

    #[derive(Deserialize)]
    struct FlagArgs {
        session: String,
        value: bool,
    }
    let archiving = engine.clone();
    ctx.command("sessions.set_archived", move |args| {
        let engine = archiving.clone();
        async move {
            let args: FlagArgs = take_args(args)?;
            engine.set_archived(&args.session, args.value);
            Ok(Value::Bool(true))
        }
    })?;

    ctx.command("sessions.set_pinned", move |args| {
        let engine = engine.clone();
        async move {
            let args: FlagArgs = take_args(args)?;
            engine.set_pinned(&args.session, args.value);
            Ok(Value::Bool(true))
        }
    })?;
    Ok(())
}
