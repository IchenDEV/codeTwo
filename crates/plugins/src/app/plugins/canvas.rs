//! Canvas persistence and prompt compilation.

use crate::app::service::{CanvasService, EngineService, Paths, SkillService, StoreService};
use crate::app::{json, take_args};
use codetwo_core::canvas::{
    CanvasAssetRef, CanvasDraft, CanvasDraftUpdate, CanvasExport, CanvasFeatureGate,
    CanvasFreezeInput, CanvasManifest, CanvasObject, CanvasSceneEnvelope, CanvasSnapshot,
    CanvasStaticAsset,
};
use codetwo_core::skill::DocBlock;
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginError, PluginResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;

pub struct CanvasPlugin;

#[async_trait]
impl Plugin for CanvasPlugin {
    fn name(&self) -> &str {
        "canvas"
    }

    fn description(&self) -> Option<&str> {
        Some("Versioned canvas drafts, immutable snapshots, media, and exports.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["store", "paths"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let store = ctx.expect::<StoreService>()?;
        let paths = ctx.expect::<Paths>()?;
        let canvas = Arc::new(CanvasService {
            gate: CanvasFeatureGate::disabled(),
            owner: format!("core:{}", paths.data_dir.to_string_lossy()),
            store: store.0.clone(),
        });
        ctx.provide(canvas.clone())?;
        register_canvas_commands(&ctx, canvas)
    }
}

fn register_canvas_commands(ctx: &Context, canvas: Arc<CanvasService>) -> PluginResult {
    ctx.command("canvas.feature_state", |_| async move {
        json(CanvasFeatureStateDto {
            feature: codetwo_core::canvas::CANVAS_FEATURE_GATE,
            enabled: false,
            status: "not production-enabled",
        })
    })?;

    #[derive(Deserialize)]
    struct TitleArgs {
        title: String,
    }
    let creating = canvas.clone();
    ctx.command("canvas.create_draft", move |args| {
        let canvas = creating.clone();
        async move {
            let args: TitleArgs = take_args(args)?;
            require_canvas(&canvas)?;
            json(CanvasDraftDto::from(
                canvas
                    .store
                    .create_canvas_draft_with_gate(
                        canvas.gate,
                        &canvas.owner,
                        &args.title,
                        codetwo_core::session::now_millis(),
                    )
                    .map_err(PluginError::new)?,
            ))
        }
    })?;

    #[derive(Deserialize)]
    struct IdArgs {
        id: String,
    }
    let reading = canvas.clone();
    ctx.command("canvas.get_draft", move |args| {
        let canvas = reading.clone();
        async move {
            let args: IdArgs = take_args(args)?;
            require_canvas(&canvas)?;
            json(
                canvas
                    .store
                    .get_canvas_draft(&args.id, &canvas.owner)
                    .map_err(PluginError::new)?
                    .map(CanvasDraftDto::from),
            )
        }
    })?;

    #[derive(Deserialize)]
    struct UpdateArgs {
        id: String,
        expected_revision: u64,
        update: CanvasDraftUpdate,
    }
    let updating = canvas.clone();
    ctx.command("canvas.update_draft", move |args| {
        let canvas = updating.clone();
        async move {
            let args: UpdateArgs = take_args(args)?;
            require_canvas(&canvas)?;
            json(CanvasDraftDto::from(
                canvas
                    .store
                    .update_canvas_draft_cas(
                        &args.id,
                        &canvas.owner,
                        args.expected_revision,
                        args.update,
                        codetwo_core::session::now_millis(),
                    )
                    .map_err(PluginError::new)?,
            ))
        }
    })?;

    #[derive(Deserialize)]
    struct MediaArgs {
        bytes: Vec<u8>,
        #[serde(default)]
        declared_mime: Option<String>,
    }
    let normalizing = canvas.clone();
    ctx.command("canvas.normalize_media", move |args| {
        let canvas = normalizing.clone();
        async move {
            let args: MediaArgs = take_args(args)?;
            require_canvas(&canvas)?;
            json(CanvasAssetDto::from(
                codetwo_core::canvas::normalize_media(&args.bytes, args.declared_mime.as_deref())
                    .map_err(PluginError::new)?,
            ))
        }
    })?;

    #[derive(Deserialize)]
    struct FreezeArgs {
        id: String,
        expected_revision: u64,
        input: CanvasFreezeCommandInput,
    }
    let freezing = canvas.clone();
    ctx.command("canvas.freeze", move |args| {
        let canvas = freezing.clone();
        async move {
            let args: FreezeArgs = take_args(args)?;
            require_canvas(&canvas)?;
            json(CanvasSnapshotDto::from(
                canvas
                    .store
                    .freeze_canvas_with_gate(
                        canvas.gate,
                        &args.id,
                        &canvas.owner,
                        args.expected_revision,
                        args.input.into_core(codetwo_core::session::now_millis()),
                    )
                    .map_err(PluginError::new)?,
            ))
        }
    })?;

    #[derive(Deserialize)]
    struct RevisionArgs {
        id: String,
        revision: u64,
    }
    let snapshot = canvas.clone();
    ctx.command("canvas.get_snapshot", move |args| {
        let canvas = snapshot.clone();
        async move {
            let args: RevisionArgs = take_args(args)?;
            require_canvas(&canvas)?;
            json(
                canvas
                    .store
                    .get_canvas_snapshot_frozen(&args.id, args.revision)
                    .map_err(PluginError::new)?
                    .map(CanvasSnapshotDto::from),
            )
        }
    })?;

    #[derive(Deserialize)]
    struct AssetArgs {
        id: String,
        revision: u64,
        asset_id: String,
    }
    let asset = canvas.clone();
    ctx.command("canvas.get_asset", move |args| {
        let canvas = asset.clone();
        async move {
            let args: AssetArgs = take_args(args)?;
            require_canvas(&canvas)?;
            let snapshot = canvas
                .store
                .get_canvas_snapshot_frozen(&args.id, args.revision)
                .map_err(PluginError::new)?;
            json(
                snapshot
                    .and_then(|snapshot| {
                        snapshot
                            .assets
                            .into_iter()
                            .find(|asset| asset.id == args.asset_id)
                    })
                    .map(CanvasAssetDto::from),
            )
        }
    })?;

    #[derive(Deserialize)]
    struct ExportArgs {
        id: String,
        revision: u64,
        export_id: String,
    }
    let export = canvas.clone();
    ctx.command("canvas.get_export", move |args| {
        let canvas = export.clone();
        async move {
            let args: ExportArgs = take_args(args)?;
            require_canvas(&canvas)?;
            let snapshot = canvas
                .store
                .get_canvas_snapshot_frozen(&args.id, args.revision)
                .map_err(PluginError::new)?;
            json(
                snapshot
                    .and_then(|snapshot| {
                        snapshot
                            .exports
                            .into_iter()
                            .find(|export| export.id == args.export_id)
                    })
                    .map(CanvasExportDto::from),
            )
        }
    })?;

    let duplicate = canvas.clone();
    ctx.command("canvas.duplicate", move |args| {
        let canvas = duplicate.clone();
        async move {
            let args: RevisionArgs = take_args(args)?;
            require_canvas(&canvas)?;
            json(CanvasDraftDto::from(
                canvas
                    .store
                    .duplicate_canvas_to_owner_with_gate(
                        canvas.gate,
                        &args.id,
                        args.revision,
                        &canvas.owner,
                        codetwo_core::session::now_millis(),
                    )
                    .map_err(PluginError::new)?,
            ))
        }
    })?;

    let tombstone = canvas.clone();
    ctx.command("canvas.tombstone", move |args| {
        let canvas = tombstone.clone();
        async move {
            let args: IdArgs = take_args(args)?;
            require_canvas(&canvas)?;
            canvas
                .store
                .tombstone_canvas(&args.id, &canvas.owner, codetwo_core::session::now_millis())
                .map_err(PluginError::new)?;
            Ok(Value::Bool(true))
        }
    })?;

    let restore = canvas.clone();
    ctx.command("canvas.restore", move |args| {
        let canvas = restore.clone();
        async move {
            let args: IdArgs = take_args(args)?;
            require_canvas(&canvas)?;
            canvas
                .store
                .restore_canvas(&args.id, &canvas.owner, codetwo_core::session::now_millis())
                .map_err(PluginError::new)?;
            Ok(Value::Bool(true))
        }
    })?;

    ctx.command("canvas.purge", move |args| {
        let canvas = canvas.clone();
        async move {
            let args: IdArgs = take_args(args)?;
            require_canvas(&canvas)?;
            json(
                canvas
                    .store
                    .purge_canvas(&args.id, &canvas.owner, codetwo_core::session::now_millis())
                    .map_err(PluginError::new)?,
            )
        }
    })?;
    Ok(())
}

fn require_canvas(canvas: &CanvasService) -> Result<(), PluginError> {
    canvas.gate.require().map_err(PluginError::new)
}

pub struct DocumentPlugin;

#[async_trait]
impl Plugin for DocumentPlugin {
    fn name(&self) -> &str {
        "document"
    }

    fn description(&self) -> Option<&str> {
        Some("Compile editor documents into the exact prompt sent to an agent.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["engine", "skills", "store", "canvas"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let engine = ctx.expect::<EngineService>()?;
        let skills = ctx.expect::<SkillService>()?;
        let store = ctx.expect::<StoreService>()?;
        let canvas = ctx.expect::<CanvasService>()?;
        ctx.command("document.compile", move |args| {
            let engine = engine.clone();
            let skills = skills.clone();
            let store = store.clone();
            let canvas = canvas.clone();
            async move {
                #[derive(Deserialize)]
                struct Args {
                    doc: Vec<DocBlock>,
                    #[serde(default)]
                    cwd: Option<String>,
                }
                let args: Args = take_args(args)?;
                let library = skills.library();
                let path = args.cwd.as_deref().map(Path::new);
                let resolve = |id: &str, through_seq: Option<i64>| -> Option<String> {
                    engine
                        .referenced_session_context_through(id, through_seq)
                        .ok()
                        .flatten()
                };
                let compiled = codetwo_core::skill::compile_with_canvas(
                    &args.doc,
                    &library,
                    path,
                    Some(&resolve),
                    canvas.gate,
                    codetwo_core::canvas::CanvasProviderImageCapability::Unknown,
                    &|id, revision| store.resolve_canvas_prompt_frozen(id, revision),
                )
                .map_err(PluginError::new)?;
                json(CompiledPromptDto {
                    prompt: compiled.prompt,
                    mcp_servers: compiled
                        .mcp_servers
                        .into_iter()
                        .map(|server| server.name)
                        .collect(),
                    agent_skills: compiled.agent_skills,
                    subagents: compiled.subagents,
                    files: compiled.files,
                    sessions: compiled.sessions,
                    unresolved: compiled.unresolved,
                    canvases: compiled
                        .canvases
                        .into_iter()
                        .map(|canvas| CompiledCanvasDto {
                            id: canvas.payload.id,
                            frozen_revision: canvas.payload.revision,
                            title: canvas.payload.title,
                            summary: canvas.payload.summary,
                            exports: canvas
                                .payload
                                .exports
                                .into_iter()
                                .map(CanvasExportDto::from)
                                .collect(),
                        })
                        .collect(),
                })
            }
        })?;
        Ok(())
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CanvasAssetRefDto {
    id: String,
    mime_type: String,
    width: u32,
    height: u32,
    source_name: Option<String>,
}

impl From<CanvasAssetRef> for CanvasAssetRefDto {
    fn from(value: CanvasAssetRef) -> Self {
        Self {
            id: value.id,
            mime_type: value.mime_type,
            width: value.width,
            height: value.height,
            source_name: value.source_name,
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CanvasAssetDto {
    id: String,
    mime_type: String,
    width: u32,
    height: u32,
    bytes: Vec<u8>,
}

impl From<CanvasStaticAsset> for CanvasAssetDto {
    fn from(value: CanvasStaticAsset) -> Self {
        Self {
            id: value.id,
            mime_type: value.mime_type,
            width: value.width,
            height: value.height,
            bytes: value.bytes,
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CanvasEnvelopeDto {
    engine: String,
    engine_version: String,
    schema_version: u32,
    revision: u64,
    theme: codetwo_core::canvas::CanvasTheme,
    assets: Vec<CanvasAssetRefDto>,
    scene: Value,
}

impl From<CanvasSceneEnvelope> for CanvasEnvelopeDto {
    fn from(value: CanvasSceneEnvelope) -> Self {
        Self {
            engine: value.engine,
            engine_version: value.engine_version,
            schema_version: value.schema_version,
            revision: value.revision,
            theme: value.theme,
            assets: value.assets.into_iter().map(Into::into).collect(),
            scene: value.scene,
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CanvasObjectDto {
    id: String,
    kind: codetwo_core::canvas::CanvasObjectKind,
    original_text: String,
    bounds: codetwo_core::canvas::CanvasRect,
    layer: i64,
    arrow_start: Option<codetwo_core::canvas::CanvasPoint>,
    arrow_end: Option<codetwo_core::canvas::CanvasPoint>,
    asset_id: Option<String>,
}

impl From<CanvasObject> for CanvasObjectDto {
    fn from(value: CanvasObject) -> Self {
        Self {
            id: value.id,
            kind: value.kind,
            original_text: value.original_text,
            bounds: value.bounds,
            layer: value.layer,
            arrow_start: value.arrow_start,
            arrow_end: value.arrow_end,
            asset_id: value.asset_id,
        }
    }
}

#[derive(Serialize, Clone)]
struct CanvasManifestDto {
    objects: Vec<CanvasObjectDto>,
}

impl From<CanvasManifest> for CanvasManifestDto {
    fn from(value: CanvasManifest) -> Self {
        Self {
            objects: value.objects.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CanvasExportDto {
    id: String,
    kind: codetwo_core::canvas::CanvasExportKind,
    index: Option<u32>,
    mime_type: String,
    width: u32,
    height: u32,
    bytes: Vec<u8>,
}

impl From<CanvasExport> for CanvasExportDto {
    fn from(value: CanvasExport) -> Self {
        Self {
            id: value.id,
            kind: value.kind,
            index: value.index,
            mime_type: value.mime_type,
            width: value.width,
            height: value.height,
            bytes: value.bytes,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CanvasDraftDto {
    id: String,
    owner: String,
    revision: u64,
    title: String,
    theme: codetwo_core::canvas::CanvasTheme,
    envelope: CanvasEnvelopeDto,
    manifest: CanvasManifestDto,
    assets: Vec<CanvasAssetDto>,
    created_at: i64,
    updated_at: i64,
    tombstoned_at: Option<i64>,
}

impl From<CanvasDraft> for CanvasDraftDto {
    fn from(value: CanvasDraft) -> Self {
        Self {
            id: value.id,
            owner: value.owner,
            revision: value.revision,
            title: value.title,
            theme: value.theme,
            envelope: value.envelope.into(),
            manifest: value.manifest.into(),
            assets: value.assets.into_iter().map(Into::into).collect(),
            created_at: value.created_at,
            updated_at: value.updated_at,
            tombstoned_at: value.tombstoned_at,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CanvasSnapshotDto {
    id: String,
    revision: u64,
    title: String,
    theme: codetwo_core::canvas::CanvasTheme,
    created_at: i64,
    frozen_at: i64,
    object_count: usize,
    envelope: CanvasEnvelopeDto,
    manifest: CanvasManifestDto,
    assets: Vec<CanvasAssetDto>,
    summary: String,
    exports: Vec<CanvasExportDto>,
}

impl From<CanvasSnapshot> for CanvasSnapshotDto {
    fn from(value: CanvasSnapshot) -> Self {
        Self {
            id: value.id,
            revision: value.revision,
            title: value.title,
            theme: value.theme,
            created_at: value.created_at,
            frozen_at: value.frozen_at,
            object_count: value.object_count,
            envelope: value.envelope.into(),
            manifest: value.manifest.into(),
            assets: value.assets.into_iter().map(Into::into).collect(),
            summary: value.summary,
            exports: value.exports.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Deserialize)]
struct CanvasFreezeCommandInput {
    title: String,
    theme: codetwo_core::canvas::CanvasTheme,
    envelope: CanvasSceneEnvelope,
    manifest: CanvasManifest,
    #[serde(default)]
    assets: Vec<CanvasStaticAsset>,
    #[serde(default)]
    exports: Vec<CanvasExport>,
}

impl CanvasFreezeCommandInput {
    fn into_core(self, now: i64) -> CanvasFreezeInput {
        CanvasFreezeInput {
            title: self.title,
            theme: self.theme,
            envelope: self.envelope,
            manifest: self.manifest,
            assets: self.assets,
            exports: self.exports,
            now,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CanvasFeatureStateDto {
    feature: &'static str,
    enabled: bool,
    status: &'static str,
}

#[derive(Serialize)]
struct CompiledPromptDto {
    prompt: String,
    mcp_servers: Vec<String>,
    agent_skills: Vec<String>,
    subagents: Vec<String>,
    files: Vec<String>,
    sessions: Vec<String>,
    unresolved: Vec<String>,
    #[serde(default)]
    canvases: Vec<CompiledCanvasDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompiledCanvasDto {
    id: String,
    frozen_revision: u64,
    title: String,
    summary: String,
    exports: Vec<CanvasExportDto>,
}
