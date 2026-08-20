//! The engine: the bridge between the frontend-facing SQ/EQ interface ([`Op`]/[`Event`]) and the
//! ACP client. It owns sessions, spawns/initializes a provider per session, implements the ACP
//! [`ClientHandler`] to translate `session/update` into [`Event`]s, and routes
//! `session/request_permission` either by auto-answering from the [`PermissionPolicy`] or by parking
//! the request and surfacing an [`Event::PermissionRequest`] the UI answers via
//! [`Op::AnswerPermission`].
//!
//! Both frontends use this identically: the desktop sidecar forwards `Op`s and streams `Event`s;
//! the TUI calls [`Engine::submit`] and reads the same `Event` receiver.

use std::collections::{BTreeMap, HashMap};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use serde_json::{Map, Value};
use tokio::sync::{mpsc, oneshot};

use crate::acp::wire::{
    AgentCaps, ContentBlock, CreateElicitationRequest, CreateElicitationResponse, PermissionOption,
    PermissionOutcome, RequestPermissionRequest, RequestPermissionResponse, SessionNotification,
    SessionUpdate, StopReason,
};
use crate::acp::{self, AcpClient, ClientHandler};
use crate::activity::{ActivityTracker, TurnLease};
use crate::artifact::{ArtifactStore, ToolOutputNormalizer, ToolSource};
use crate::canvas::{
    encode_canvas_history_marker, CanvasError, CanvasFeatureGate, CanvasPixelPolicy,
    CanvasPromptPayload, CanvasProviderImageCapability,
};
use crate::error::AcpError;
use crate::event::{ConfigOptionInfo, Event, ModelChoice, Op};
use crate::memory::{prompt_source, MemoryCanvasRef, MemoryCapability, MemoryTurnProvenance};
use crate::models::{available_models, builtin_models};
use crate::permission::{
    Action, ExecutionPolicy, PermissionContext, PermissionContextKind, PermissionMode,
    PermissionPolicy, SandboxPolicy,
};
use crate::provider::{Provider, ProviderId};
use crate::session::{
    initial_session_title, transcript_context_with_omission, Part, Role, Session, SessionActivity,
    SessionId, SessionRunState, SessionTitleOrigin, TranscriptCursor, TranscriptPage,
    DEFAULT_TRANSCRIPT_TURNS,
};
use crate::skill::{
    canonical_doc_text, compile_with_canvas, compile_with_sessions, CompiledPrompt, DocBlock,
    McpServer, McpTransport, SkillLibrary,
};
use crate::store::{SessionSearchHit, Store, StoreError};
use crate::worktree::WorktreeBaseline;

/// Routes parked permission requests (awaiting a user decision) back to the ACP handler.
/// Cloneable; shared between the engine (which answers) and each session handler (which parks).
#[derive(Clone, Default)]
pub struct PermissionRouter {
    legacy_pending: Arc<Mutex<HashMap<String, oneshot::Sender<PermissionOutcome>>>>,
    tracker: Option<ActivityTracker>,
}

impl PermissionRouter {
    fn with_tracker(tracker: ActivityTracker) -> Self {
        Self {
            legacy_pending: Arc::default(),
            tracker: Some(tracker),
        }
    }

    /// Park a request, returning the receiver the handler awaits.
    pub fn park(&self, request_id: String) -> oneshot::Receiver<PermissionOutcome> {
        let (tx, rx) = oneshot::channel();
        self.legacy_pending.lock().unwrap().insert(request_id, tx);
        rx
    }

    fn park_permission(
        &self,
        session: &str,
        title: String,
        options: Vec<(String, String)>,
        option_kinds: BTreeMap<String, String>,
        context: PermissionContext,
    ) -> Option<(String, oneshot::Receiver<PermissionOutcome>)> {
        match &self.tracker {
            Some(tracker) => {
                tracker.park_permission(session, title, options, option_kinds, context)
            }
            None => {
                let request_id = uuid::Uuid::new_v4().to_string();
                let receiver = self.park(request_id.clone());
                Some((request_id, receiver))
            }
        }
    }

    /// Park a structured question. Unlike permissions there is no tracker-less fallback: an
    /// elicitation only exists inside an accepted turn, which is exactly what the tracker owns.
    fn park_elicitation(
        &self,
        session: &str,
        form: crate::elicitation::ElicitationForm,
    ) -> Option<(String, oneshot::Receiver<CreateElicitationResponse>)> {
        self.tracker
            .as_ref()
            .and_then(|tracker| tracker.park_elicitation(session, form))
    }

    fn answer_elicitation_for_session(
        &self,
        session: &str,
        request_id: &str,
        answer: crate::elicitation::ElicitationAnswer,
    ) -> bool {
        self.tracker
            .as_ref()
            .map(|tracker| tracker.answer_elicitation(session, request_id, answer))
            .unwrap_or(false)
    }

    /// Resolve a parked request. Returns false if the id was unknown (already answered/expired).
    pub fn answer(&self, request_id: &str, outcome: PermissionOutcome) -> bool {
        if let Some(tx) = self.legacy_pending.lock().unwrap().remove(request_id) {
            return tx.send(outcome).is_ok();
        }
        self.tracker
            .as_ref()
            .map(|tracker| tracker.answer_any(request_id, outcome))
            .unwrap_or(false)
    }

    fn answer_for_session(&self, session: &str, request_id: &str, option_id: Option<&str>) -> bool {
        self.tracker
            .as_ref()
            .map(|tracker| tracker.answer_permission(session, request_id, option_id))
            .unwrap_or_else(|| {
                let outcome = match option_id {
                    Some(option_id) => PermissionOutcome::Selected {
                        option_id: option_id.to_string(),
                    },
                    None => PermissionOutcome::Cancelled,
                };
                self.answer(request_id, outcome)
            })
    }
}

/// The ACP client-side callbacks for one session: turns updates into events, persists transcript
/// parts, and resolves permissions.
pub struct SessionHandler {
    session_id: SessionId,
    provider: ProviderId,
    events: mpsc::UnboundedSender<Event>,
    policy: Arc<Mutex<PermissionPolicy>>,
    router: PermissionRouter,
    store: Option<Arc<Store>>,
    normalizer: ToolOutputNormalizer,
    tool_contexts: Mutex<HashMap<String, ToolContext>>,
    /// True while a `session/load` replay is in flight. The replayed history already lives in the
    /// store and the UI, so updates arriving under this flag are dropped — neither re-persisted
    /// nor re-emitted. Set/cleared by the engine around the `session/load` call.
    replaying: Arc<AtomicBool>,
}

impl SessionHandler {
    pub fn new(
        session_id: SessionId,
        provider: ProviderId,
        events: mpsc::UnboundedSender<Event>,
        policy: Arc<Mutex<PermissionPolicy>>,
        router: PermissionRouter,
        store: Option<Arc<Store>>,
    ) -> Self {
        Self {
            session_id,
            provider,
            events,
            policy,
            router,
            normalizer: ToolOutputNormalizer::new(
                store.clone().and_then(ArtifactStore::from_store),
            ),
            store,
            tool_contexts: Mutex::new(HashMap::new()),
            replaying: Arc::default(),
        }
    }

    /// The shared flag that mutes this handler during a `session/load` replay.
    pub fn replay_flag(&self) -> Arc<AtomicBool> {
        self.replaying.clone()
    }

    fn emit(&self, event: Event) {
        let _ = self.events.send(event);
    }

    fn persist(&self, role: Role, part: &Part) -> Option<i64> {
        if let Some(store) = &self.store {
            match store.append_part(&self.session_id, role, part) {
                Ok(seq) => return Some(seq),
                Err(e) => tracing::warn!("persist part failed: {e}"),
            }
        }
        None
    }

    fn remember_tool(&self, id: &str, context: ToolContext) {
        let mut contexts = self.tool_contexts.lock().unwrap();
        if contexts.len() >= 256 && !contexts.contains_key(id) {
            if let Some(oldest) = contexts.keys().next().cloned() {
                contexts.remove(&oldest);
            }
        }
        contexts.insert(id.to_string(), context);
    }

    fn tool_context(&self, id: &str) -> ToolContext {
        self.tool_contexts
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone, Default)]
struct ToolContext {
    title: String,
    kind: Option<String>,
    source: ToolSource,
    /// Set at the initial ToolCall when [`crate::testsignal::classify_test_command`] recognizes a
    /// test run; carried through updates so the terminal status can emit [`Event::TestSignal`].
    test_command: Option<String>,
    /// One signal per tool call: set when the terminal outcome has been emitted.
    test_signaled: bool,
}

fn bounded_string(value: Option<&Value>, key: &str) -> Option<String> {
    value
        .and_then(|value| value.get(key))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.chars().take(128).collect())
}

fn tool_source(title: &str, raw_input: Option<&Value>) -> ToolSource {
    ToolSource {
        image_generation: title.eq_ignore_ascii_case("image generation"),
        server: bounded_string(raw_input, "server"),
        tool: bounded_string(raw_input, "tool"),
    }
}

fn rich_tool_kind(kind: Option<String>, source: &ToolSource, title: &str) -> Option<String> {
    let server = source
        .server
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let tool = source
        .tool
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let title = title.to_ascii_lowercase();
    if source.image_generation {
        Some("image_generation".into())
    } else if server == "codetwo_browser" {
        Some("codetwo_browser".into())
    } else if server.contains("sites") || tool.starts_with("sites_") || tool.contains("__sites_") {
        Some("sites".into())
    } else if server.contains("chrome") || tool.contains("chrome") || title.contains("chrome") {
        Some("chrome_browser".into())
    } else if tool.contains("computer") || tool.contains("cua") || title.contains("computer use") {
        Some("computer_use".into())
    } else {
        kind
    }
}

/// What we tell the agent we can do at `initialize`.
///
/// Only form elicitation so far. It matters more than it looks: the Claude adapter routes its
/// built-in `AskUserQuestion` tool through `elicitation/create` *only* when this is advertised,
/// and otherwise degrades the whole question into an allow/reject permission prompt that shows the
/// tool's name and none of its questions. URL elicitation stays unadvertised — we have nowhere
/// honest to send the user — and `fs` remains unclaimed, so agents keep doing their own file I/O.
fn client_capabilities() -> Value {
    serde_json::json!({"elicitation": {"form": {}}})
}

fn is_mcp_elicitation(req: &RequestPermissionRequest) -> bool {
    req.meta
        .as_ref()
        .and_then(|meta| meta.get("is_mcp_tool_approval"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

/// The app-owned Auto Scene selector is a brokered capability, not an arbitrary third-party MCP
/// mutation. Let the initial tool invocation reach that broker without a redundant generic MCP
/// prompt: the broker authenticates the per-session key, rejects calls unless Auto Scene is on,
/// and emits a separate elicitation when the selected scene would loosen permissions.
///
/// A broker-generated escalation carries explanatory content, so it deliberately does not match
/// this exemption even if the provider reuses the same MCP tool title.
fn is_internal_scene_selection(
    req: &RequestPermissionRequest,
    tool: &ToolContext,
    title: &str,
) -> bool {
    is_mcp_elicitation(req)
        && tool.source.server.as_deref() == Some("codetwo_scenes")
        && tool.source.tool.as_deref() == Some("scene_select")
        && title.eq_ignore_ascii_case("mcp.codetwo_scenes.scene_select")
        && elicitation_message(&req.tool_call).is_none()
}

fn elicitation_message(tool_call: &Value) -> Option<String> {
    tool_call
        .get("content")
        .and_then(Value::as_array)
        .and_then(|content| {
            content.iter().find_map(|item| {
                item.pointer("/content/text")
                    .or_else(|| item.get("text"))
                    .and_then(Value::as_str)
            })
        })
        .filter(|message| !message.trim().is_empty())
        .map(|message| message.chars().take(256).collect())
}

fn permission_context(
    req: &RequestPermissionRequest,
    tool: &ToolContext,
    title: &str,
) -> PermissionContext {
    let explicit_elicitation = is_mcp_elicitation(req);
    let lower = title.to_ascii_lowercase();
    let sites_context = sites_permission_kind(&tool.source);
    let kind =
        if let Some((kind, _)) = sites_context {
            kind
        } else if lower.contains("website access") || lower.contains("site access") {
            PermissionContextKind::WebsiteAccess
        } else if lower.contains("sensitive web action") || lower.contains("confirm browser action")
        {
            PermissionContextKind::SensitiveWebAction
        } else if tool.source.server.as_deref().is_some_and(|server| {
            server.contains("computer-use") || server.contains("computer_use")
        }) || lower.contains("computer use")
        {
            PermissionContextKind::ComputerUseApplication
        } else if explicit_elicitation {
            PermissionContextKind::McpElicitation
        } else {
            PermissionContextKind::Acp
        };
    PermissionContext {
        kind,
        server: tool.source.server.clone(),
        tool: tool.source.tool.clone(),
        origin: req
            .meta
            .as_ref()
            .and_then(|meta| meta.get("origin"))
            .and_then(Value::as_str)
            .map(|value| value.chars().take(2_048).collect()),
        risk: req
            .meta
            .as_ref()
            .and_then(|meta| meta.get("risk"))
            .and_then(Value::as_str)
            .map(|value| value.chars().take(128).collect())
            .or_else(|| sites_context.map(|(_, risk)| risk.to_string())),
        application: req
            .meta
            .as_ref()
            .and_then(|meta| meta.get("application"))
            .and_then(Value::as_str)
            .map(|value| value.chars().take(256).collect()),
    }
}

fn sites_permission_kind(source: &ToolSource) -> Option<(PermissionContextKind, &'static str)> {
    let server = source
        .server
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let tool = source
        .tool
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let is_sites =
        server.contains("sites") || tool.starts_with("sites_") || tool.contains("__sites_");
    if !is_sites {
        return None;
    }

    let production_or_sensitive = [
        "deploy_",
        "delete_site",
        "update_site_access",
        "update_environment",
        "add_custom_domain",
        "remove_custom_domain",
        "generate_siwc_bypass_token",
    ]
    .iter()
    .any(|needle| tool.contains(needle));
    if production_or_sensitive {
        return Some((
            PermissionContextKind::SitesProduction,
            "Production deployment, access, secret, domain, token, or destructive Sites change",
        ));
    }

    let read_only = [
        "sites_get_",
        "sites_list_",
        "sites_inspect_",
        "sites_download_",
    ]
    .iter()
    .any(|prefix| tool.starts_with(prefix));
    if read_only {
        None
    } else {
        Some((
            PermissionContextKind::SitesMutation,
            "Creates or changes hosted Sites state",
        ))
    }
}

/// Flatten ACP config options into the frontend shape. Non-select options (booleans we never
/// advertise support for, future types) are dropped — the UI can only render selectors.
fn config_option_infos(options: &[crate::acp::wire::SessionConfigOption]) -> Vec<ConfigOptionInfo> {
    options
        .iter()
        .filter(|o| o.option_type.as_deref().unwrap_or("select") == "select")
        .map(|o| ConfigOptionInfo {
            id: o.id.clone(),
            name: o.name.clone(),
            category: o.category.clone(),
            current: o.current().unwrap_or_default(),
            choices: o
                .choices()
                .into_iter()
                .map(|c| ModelChoice {
                    id: c.value,
                    name: c.name,
                    description: c.description,
                })
                .collect(),
        })
        .collect()
}

/// Normalize only provider values that are protocol-valid aliases for the same real behavior.
/// glm-acp-agent 1.6 currently exposes six accepted strings for GLM-5.3, while Z.AI documents
/// three distinct service levels; presenting all six would give the slider fake precision.
fn provider_config_option_infos(
    provider: &ProviderId,
    options: &[crate::acp::wire::SessionConfigOption],
) -> Vec<ConfigOptionInfo> {
    let mut infos = config_option_infos(options);
    let is_effort = |option: &ConfigOptionInfo| {
        option.category.as_deref() == Some("thought_level")
            || option.id == "effort"
            || option.id == "reasoning_effort"
    };
    if *provider == ProviderId::Pi {
        // pi-acp 0.0.33 advertises the same six strings for every model and omits Pi's supported
        // `max` value. Until the adapter consumes Pi's model-specific thinking-level RPC, hiding
        // that known-false menu is more truthful than presenting a selectable fake capability.
        infos.retain(|option| !is_effort(option));
        return infos;
    }
    if *provider != ProviderId::ZCode {
        return infos;
    }
    let is_glm_53 = infos
        .iter()
        .find(|option| option.category.as_deref() == Some("model") || option.id == "model")
        .map(|option| {
            option.current.starts_with("glm-5.3")
                || option.current.starts_with("glm-5.2")
                || option.current.starts_with("glm-5.1")
        })
        .unwrap_or(false);
    if !is_glm_53 {
        return infos;
    }
    if let Some(effort) = infos.iter_mut().find(|option| is_effort(option)) {
        effort.current = match effort.current.as_str() {
            "minimal" | "light" => "low",
            "medium" => "high",
            "xhigh" | "ultra" => "max",
            current => current,
        }
        .to_string();
        effort
            .choices
            .retain(|choice| matches!(choice.id.as_str(), "low" | "high" | "max"));
    }
    infos
}

/// Some agents expose a model-specific effort ladder before ACP's config-options surface. Grok's
/// current ACP server puts it in `ModelInfo._meta.reasoningEfforts` and switches it through the
/// legacy `session/set_mode` method. Turn that provider-owned metadata into the same frontend shape
/// without inventing levels or applying one provider's matrix to another.
fn reasoning_option_from_models(
    models: Option<&crate::acp::wire::SessionModelState>,
) -> Option<ConfigOptionInfo> {
    let models = models?;
    let model = models
        .available_models
        .iter()
        .find(|model| model.model_id == models.current_model_id)
        .or_else(|| models.available_models.first())?;
    let raw = model.meta.get("reasoningEfforts")?.as_array()?;
    let mut choices: Vec<ModelChoice> = raw
        .iter()
        .filter_map(|effort| {
            let id = effort
                .get("value")
                .or_else(|| effort.get("id"))?
                .as_str()?
                .to_string();
            let name = effort
                .get("label")
                .and_then(serde_json::Value::as_str)
                .unwrap_or(&id)
                .to_string();
            let description = effort
                .get("description")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string);
            Some(ModelChoice {
                id,
                name,
                description,
            })
        })
        .collect();
    if choices.len() < 2 {
        return None;
    }
    const ORDER: [&str; 9] = [
        "off", "none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra",
    ];
    choices.sort_by_key(|choice| {
        ORDER
            .iter()
            .position(|effort| *effort == choice.id)
            .unwrap_or(ORDER.len())
    });
    let current = model
        .meta
        .get("reasoningEffort")
        .and_then(serde_json::Value::as_str)
        .filter(|current| choices.iter().any(|choice| choice.id == *current))
        .map(str::to_string)
        .or_else(|| {
            raw.iter().find_map(|effort| {
                effort
                    .get("default")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false)
                    .then(|| {
                        effort
                            .get("value")
                            .or_else(|| effort.get("id"))
                            .and_then(serde_json::Value::as_str)
                            .map(str::to_string)
                    })
                    .flatten()
            })
        })
        .unwrap_or_else(|| choices[0].id.clone());
    Some(ConfigOptionInfo {
        id: "reasoning_effort".into(),
        name: "Reasoning Effort".into(),
        category: Some("thought_level".into()),
        current,
        choices,
    })
}

/// The current model implied by a config option set, for the session record: the display name of
/// the selected choice in the "model"-category option (falling back to the raw value id).
fn current_model_from_options(options: &[ConfigOptionInfo]) -> Option<String> {
    let model = options
        .iter()
        .find(|o| o.category.as_deref() == Some("model") || o.id == "model")?;
    if model.current.is_empty() {
        return None;
    }
    Some(model.current.clone())
}

/// Keep Codex's newer split model/effort selectors aligned after applying one of the flat
/// pre-session model variants (for example `gpt-5.6-sol[high]`) through `session/set_model`.
fn reflect_flat_model_in_options(options: &mut [ConfigOptionInfo], selected: &str) {
    let (model, effort) = selected
        .strip_suffix(']')
        .and_then(|value| value.rsplit_once('['))
        .map(|(model, effort)| (model, Some(effort)))
        .unwrap_or((selected, None));

    if let Some(option) = options
        .iter_mut()
        .find(|option| option.category.as_deref() == Some("model") || option.id == "model")
    {
        if option.choices.iter().any(|choice| choice.id == model) {
            option.current = model.to_string();
        }
    }
    if let Some(effort) = effort {
        if let Some(option) = options.iter_mut().find(|option| {
            option.category.as_deref() == Some("thought_level")
                || option.id == "effort"
                || option.id == "reasoning_effort"
        }) {
            if option.choices.iter().any(|choice| choice.id == effort) {
                option.current = effort.to_string();
            }
        }
    }
}

/// Lower one resolved immutable Canvas payload to ACP blocks.  The summary is always textual;
/// ordered overview/detail PNG exports are attached only when the explicit policy permits them.
/// A known-unsupported provider fails before any summary-only degradation can occur.
pub fn lower_canvas_prompt_payload(
    payload: &CanvasPromptPayload,
    policy: CanvasPixelPolicy,
    capability: CanvasProviderImageCapability,
) -> Result<Vec<ContentBlock>, CanvasError> {
    if policy == CanvasPixelPolicy::Required
        && matches!(capability, CanvasProviderImageCapability::Unsupported)
    {
        return Err(CanvasError::ProviderImageUnsupported { capability });
    }
    let mut blocks = vec![ContentBlock::text(format!(
        "**Canvas {} (revision {}) structural summary:**\n{}",
        payload.title, payload.revision, payload.summary
    ))];
    if policy == CanvasPixelPolicy::StructureOnly {
        return Ok(blocks);
    }
    for export in &payload.exports {
        blocks.push(ContentBlock::Image {
            data: crate::workspace::base64_encode(&export.bytes),
            mime_type: export.mime_type.clone(),
        });
    }
    Ok(blocks)
}

fn canvas_history_projection(canonical: String, compiled: Option<&CompiledPrompt>) -> String {
    let Some(compiled) = compiled else {
        return canonical;
    };
    if compiled.canvases.is_empty() {
        return canonical;
    }
    let mut out = canonical;
    for canvas in &compiled.canvases {
        out.push_str("\n\n");
        out.push_str(&encode_canvas_history_marker(
            &canvas.payload.id,
            canvas.payload.revision,
            &canvas.payload.title,
            &canvas.payload.text_originals,
        ));
    }
    out
}

fn encode_mcp_servers(
    servers: &[McpServer],
    caps: AgentCaps,
) -> Result<Vec<serde_json::Value>, String> {
    servers
        .iter()
        .map(|server| {
            let supported = match &server.transport {
                McpTransport::Stdio { .. } => true,
                McpTransport::Http { .. } => caps.mcp_http,
                McpTransport::Sse { .. } => caps.mcp_sse,
            };
            if supported {
                Ok(server.to_acp_json())
            } else {
                let transport = match &server.transport {
                    McpTransport::Http { .. } => "HTTP",
                    McpTransport::Sse { .. } => "SSE",
                    McpTransport::Stdio { .. } => unreachable!(),
                };
                Err(format!(
                    "MCP server '{}' needs {transport} transport, but this agent did not advertise that ACP capability",
                    server.name
                ))
            }
        })
        .collect()
}

const CODETWO_BROWSER_ROUTING_INSTRUCTIONS: &str = "[C2 desktop browser routing]\nFor any browser or website task, use the codetwo_browser MCP tools by default. Do not use node_repl, the host in-app browser, or Chrome unless the user explicitly asks for Chrome, an existing browser tab, or an existing login state. This routing rule applies even when another available skill describes a different in-app browser. Website access and sensitive actions still require the approvals requested by codetwo_browser.";
const CODEX_SITES_INSTRUCTIONS: &str = "[C2 Sites routing and safety]\nWhen the user asks to build, save, publish, deploy, manage, or inspect a hosted site, or when .openai/hosting.json exists, use the official OpenAI Sites plugin and its Sites skills. Reuse the exact project_id from .openai/hosting.json; never invent or transform Sites identifiers, and never expose or persist connector credentials. Treat saving a version and deploying it as separate stages, and remember that every Sites deployment URL is production. Immediately before any deployment, access-policy change, environment/secret change, custom-domain change, bypass-token generation, or deletion, require an explicit ACP or MCP approval even in Full Access; if the connector does not request one, stop and ask the user. A request for a local build or saved version alone never authorizes production deployment.";

fn with_codetwo_browser_routing(prompt: String, enabled: bool) -> String {
    if enabled {
        format!("{CODETWO_BROWSER_ROUTING_INSTRUCTIONS}\n\n{prompt}")
    } else {
        prompt
    }
}

fn with_codex_sites_routing(prompt: String, enabled: bool) -> String {
    if enabled {
        format!("{CODEX_SITES_INSTRUCTIONS}\n\n{prompt}")
    } else {
        prompt
    }
}

fn auto_scene_routing_instructions(
    scenes: &crate::scene::SceneLibrary,
    current: Option<&str>,
) -> String {
    let current = current
        .and_then(|reference| scenes.resolve(reference))
        .map(|entry| {
            format!(
                "`{}` ({})",
                crate::scene::SceneLibrary::reference_for(entry),
                entry.scene.title
            )
        })
        .unwrap_or_else(|| "none".into());
    let mut catalog = String::new();
    for entry in scenes.scenes().iter().take(50) {
        let description = entry
            .scene
            .description
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        let description: String = description.chars().take(240).collect();
        catalog.push_str(&format!(
            "- `{}` — {}: {}\n",
            crate::scene::SceneLibrary::reference_for(entry),
            entry.scene.title,
            description
        ));
    }
    format!(
        "[C2 Auto Scene]\nAuto Scene is enabled for this session. At the start of this turn, decide which available scene best fits the user's current task. The active scene is {current}. If none is active, call `scene_select` before substantive work. If one is active, keep it only while it remains the best fit; call `scene_select` when the task changes. Use an exact reference from the catalog. The tool returns the selected scene's current-turn instructions; follow them immediately. A switch that would loosen permissions requires user approval and is not applied until the tool confirms it. Never claim a scene changed from your own text.\n\nAvailable scenes:\n{catalog}"
    )
}

fn with_auto_scene_routing(prompt: String, instructions: Option<String>) -> String {
    match instructions {
        Some(instructions) => format!("{instructions}\n\n{prompt}"),
        None => prompt,
    }
}

/// Decode the adapter-owned idempotency key carried through the existing `NewSession` request id.
/// JSON keeps arbitrary T3 thread/command identifiers unambiguous without widening the public Op.
fn t3_session_create_receipt(request_id: Option<&str>) -> Option<(String, String)> {
    let encoded = request_id?.strip_prefix("t3-create:")?;
    let (command_id, public_thread_id): (String, String) = serde_json::from_str(encoded).ok()?;
    if command_id.trim().is_empty() || public_thread_id.trim().is_empty() {
        return None;
    }
    Some((command_id, public_thread_id))
}

fn t3_prompt_receipt(request_id: Option<&str>) -> Option<(String, Option<String>)> {
    let encoded = request_id?.strip_prefix("t3-command:")?;
    if let Ok((command_id, message_id)) = serde_json::from_str::<(String, String)>(encoded) {
        if !command_id.trim().is_empty() && !message_id.trim().is_empty() {
            return Some((command_id, Some(message_id)));
        }
        return None;
    }
    // Accept the pre-message-id encoding for in-flight migrations and non-T3 test callers.
    (!encoded.trim().is_empty()).then(|| (encoded.to_string(), None))
}

fn select_kind(options: &[PermissionOption], prefix: &str) -> PermissionOutcome {
    options
        .iter()
        .find(|o| o.kind.starts_with(prefix))
        .map(|o| PermissionOutcome::Selected {
            option_id: o.option_id.clone(),
        })
        .unwrap_or(PermissionOutcome::Cancelled)
}

/// Keep only the small subset of launch arguments needed to describe delegated work. ACP's raw
/// input may contain commands, patches, credentials, or arbitrary MCP arguments; persisting and
/// broadcasting that whole object just to draw an Agents row would be an unnecessary data leak.
fn agent_input_projection(
    kind: Option<&str>,
    title: Option<&str>,
    raw: Option<&Value>,
) -> Option<Value> {
    const SIGNALS: [&str; 12] = [
        "agent",
        "delegate",
        "delegate_task",
        "run_agent",
        "run_subagent",
        "run_workflow",
        "spawn_agent",
        "spawn_subagent",
        "start_agent",
        "start_subagent",
        "subagent",
        "workflow",
    ];
    const NESTED: [&str; 4] = ["arguments", "args", "input", "params"];
    const ALLOWED: [&str; 20] = [
        "agent_type",
        "agentType",
        "subagent_type",
        "subagentType",
        "task_name",
        "taskName",
        "role",
        "title",
        "name",
        "description",
        "message",
        "prompt",
        "task",
        "objective",
        "instructions",
        "workflow",
        "tool",
        "tool_name",
        "toolName",
        "operation",
    ];

    fn normalize(value: &str) -> String {
        let mut out = String::new();
        let mut separator = false;
        for ch in value.chars() {
            if ch.is_ascii_alphanumeric() {
                if ch.is_ascii_uppercase() && !out.is_empty() && !separator {
                    out.push('_');
                }
                out.push(ch.to_ascii_lowercase());
                separator = false;
            } else if !out.is_empty() {
                separator = true;
            }
            if separator && !out.ends_with('_') {
                out.push('_');
            }
        }
        out.trim_matches('_').to_string()
    }

    fn is_signal(value: &str, signals: &[&str]) -> bool {
        let value = normalize(value);
        signals
            .iter()
            .any(|signal| value == *signal || value.ends_with(&format!("_{signal}")))
    }

    fn object(value: &Value) -> Option<Map<String, Value>> {
        match value {
            Value::Object(map) => Some(map.clone()),
            Value::String(text) => serde_json::from_str::<Value>(text)
                .ok()?
                .as_object()
                .cloned(),
            _ => None,
        }
    }

    let mut input = object(raw?)?;
    for key in NESTED {
        if let Some(nested) = input.get(key).and_then(object) {
            input.extend(nested);
        }
    }
    let string = |keys: &[&str]| {
        keys.iter().find_map(|key| {
            input
                .get(*key)
                .and_then(Value::as_str)
                .filter(|v| !v.trim().is_empty())
        })
    };
    let typed = string(&["agent_type", "agentType", "subagent_type", "subagentType"]).is_some();
    let named_task = string(&["task_name", "taskName"]).is_some()
        && string(&["message", "prompt", "task", "objective"]).is_some();
    let operation = string(&["tool", "tool_name", "toolName", "operation"])
        .map(|value| is_signal(value, &SIGNALS))
        .unwrap_or(false);
    if !kind
        .map(|value| is_signal(value, &SIGNALS))
        .unwrap_or(false)
        && !title
            .map(|value| is_signal(value, &SIGNALS))
            .unwrap_or(false)
        && !typed
        && !named_task
        && !operation
    {
        return None;
    }

    // Enough for a readable assignment without turning the transcript DB into a shadow copy of
    // provider tool arguments. Individual fields and the whole projection are both bounded.
    let mut budget = 8_192usize;
    let mut projected = Map::new();
    for key in ALLOWED {
        let Some(value) = input.get(key).and_then(Value::as_str) else {
            continue;
        };
        if budget == 0 {
            break;
        }
        let limit = budget.min(2_048);
        let text: String = value.chars().take(limit).collect();
        budget = budget.saturating_sub(text.chars().count());
        if !text.trim().is_empty() {
            projected.insert(key.to_string(), Value::String(text));
        }
    }
    (!projected.is_empty()).then_some(Value::Object(projected))
}

#[cfg(test)]
mod agent_input_projection_tests {
    use super::agent_input_projection;
    use serde_json::json;

    #[test]
    fn ordinary_tool_inputs_are_not_retained() {
        let raw = json!({
            "command": "deploy --token secret-value",
            "task": "ordinary build step",
            "secret": "secret-value",
        });

        assert_eq!(
            agent_input_projection(Some("execute"), Some("Task"), Some(&raw)),
            None
        );
    }

    #[test]
    fn agent_launches_keep_only_bounded_descriptive_fields() {
        let raw = json!({
            "arguments": {
                "agent_type": "explorer",
                "task_name": "review_ui",
                "message": "Review the rendered interface",
                "command": "printenv",
                "secret": "do-not-persist",
                "cwd": "/private/work",
            },
            "request_id": "private-provider-id",
        });

        let projected =
            agent_input_projection(Some("tool"), Some("functions.spawn_agent"), Some(&raw))
                .unwrap();
        let object = projected.as_object().unwrap();

        assert_eq!(object.get("agent_type"), Some(&json!("explorer")));
        assert_eq!(object.get("task_name"), Some(&json!("review_ui")));
        assert_eq!(
            object.get("message"),
            Some(&json!("Review the rendered interface"))
        );
        for excluded in ["arguments", "command", "secret", "cwd", "request_id"] {
            assert!(
                !object.contains_key(excluded),
                "unexpected retained field: {excluded}"
            );
        }
    }

    #[test]
    fn retained_agent_fields_are_size_limited() {
        let raw = json!({
            "agent_type": "worker",
            "message": "x".repeat(3_000),
        });

        let projected = agent_input_projection(Some("agent"), None, Some(&raw)).unwrap();
        assert_eq!(
            projected["message"].as_str().unwrap().chars().count(),
            2_048
        );
    }
}

#[cfg(test)]
mod usage_update_tests {
    use std::sync::{Arc, Mutex};

    use super::SessionHandler;
    use crate::acp::wire::{SessionNotification, SessionUpdate};
    use crate::acp::ClientHandler;
    use crate::engine::PermissionRouter;
    use crate::event::Event;
    use crate::permission::PermissionPolicy;
    use crate::provider::ProviderId;
    use tokio::sync::mpsc;

    #[tokio::test]
    async fn usage_update_propagates_during_replay_without_transcript_persistence() {
        let (events, mut received) = mpsc::unbounded_channel();
        let handler = SessionHandler::new(
            "session-1".into(),
            ProviderId::Grok,
            events,
            Arc::new(Mutex::new(PermissionPolicy::default())),
            PermissionRouter::default(),
            None,
        );
        handler
            .replay_flag()
            .store(true, std::sync::atomic::Ordering::SeqCst);

        handler
            .session_update(SessionNotification {
                session_id: "provider-session-1".into(),
                update: SessionUpdate::UsageUpdate {
                    used: 53_000,
                    size: 200_000,
                    cost: None,
                },
            })
            .await;

        // The legacy rolling projection precedes the authoritative context-window figure.
        assert!(matches!(
            received.recv().await,
            Some(Event::Usage {
                session,
                input_tokens: 53_000,
                output_tokens: 0,
            }) if session == "session-1"
        ));
        assert!(matches!(
            received.recv().await,
            Some(Event::ContextWindow {
                session,
                used_tokens: 53_000,
                context_window: 200_000,
                cost_usd: None,
            }) if session == "session-1"
        ));

        // Replay transcript chunks remain muted and no transcript part is written by the usage
        // path. The channel therefore has no second event to consume.
        handler
            .session_update(SessionNotification {
                session_id: "provider-session-1".into(),
                update: SessionUpdate::AgentMessageChunk {
                    content: crate::acp::wire::ContentBlock::text("replayed"),
                },
            })
            .await;
        assert!(received.try_recv().is_err());
    }
}

#[async_trait]
impl ClientHandler for SessionHandler {
    async fn session_update(&self, note: SessionNotification) {
        // History replayed by `session/load` is already persisted and rendered; drop it.
        // Usage is provider state rather than transcript content, so it must still reach the UI
        // while the provider replays a loaded session's history.
        if self.replaying.load(Ordering::SeqCst)
            && !matches!(&note.update, SessionUpdate::UsageUpdate { .. })
        {
            return;
        }
        let session = self.session_id.clone();
        // Build the UI event and the persisted transcript part together, then emit + persist.
        let (event, part, warnings): (Option<Event>, Option<Part>, Vec<String>) = match note.update
        {
            SessionUpdate::AgentMessageChunk {
                content: ContentBlock::Text { text },
            } => (
                Some(Event::AgentText {
                    session,
                    message_id: String::new(),
                    text: text.clone(),
                    transcript_seq: None,
                }),
                Some(Part::Text { text }),
                Vec::new(),
            ),
            SessionUpdate::AgentThoughtChunk {
                content: ContentBlock::Text { text },
            } => (
                Some(Event::AgentThought {
                    session,
                    text: text.clone(),
                    transcript_seq: None,
                }),
                Some(Part::Reasoning { text }),
                Vec::new(),
            ),
            SessionUpdate::ToolCall(tc) => {
                let provider_kind = tc.kind;
                let agent_input = agent_input_projection(
                    provider_kind.as_deref(),
                    tc.title.as_deref(),
                    tc.raw_input.as_ref(),
                );
                let title = tc.title.unwrap_or_default();
                let status = tc.status.unwrap_or_else(|| "pending".into());
                let source = tool_source(&title, tc.raw_input.as_ref());
                // Classified against the raw ACP kind (only execute/None may signal), before the
                // rich-kind projection rewrites it for the UI.
                let test_command = crate::testsignal::classify_test_command(
                    provider_kind.as_deref(),
                    &title,
                    tc.raw_input.as_ref(),
                );
                let tool_kind = rich_tool_kind(provider_kind, &source, &title);
                let context = ToolContext {
                    title: title.clone(),
                    kind: tool_kind.clone(),
                    source,
                    test_command,
                    test_signaled: false,
                };
                self.remember_tool(&tc.tool_call_id, context.clone());
                let normalized = self.normalizer.normalize(
                    tc.content.as_ref(),
                    tc.raw_output.as_ref(),
                    &context.source,
                    &self.session_id,
                    &tc.tool_call_id,
                );
                (
                    Some(Event::ToolCall {
                        session,
                        id: tc.tool_call_id.clone(),
                        title: title.clone(),
                        status: status.clone(),
                        kind: tool_kind.clone(),
                        agent_input: agent_input.clone(),
                        outputs: normalized.outputs.clone(),
                        transcript_seq: None,
                    }),
                    Some(Part::ToolCall {
                        id: tc.tool_call_id,
                        title,
                        status,
                        tool_kind,
                        agent_input,
                        outputs: normalized.outputs,
                    }),
                    normalized.warnings,
                )
            }
            SessionUpdate::ToolCallUpdate(u) => {
                let previous = self.tool_context(&u.tool_call_id);
                let title = u
                    .title
                    .filter(|title| !title.trim().is_empty())
                    .unwrap_or_else(|| previous.title.clone());
                let status = u.status.unwrap_or_else(|| "in_progress".into());
                let source = if u.raw_input.is_some() {
                    tool_source(&title, u.raw_input.as_ref())
                } else {
                    previous.source
                };
                let kind =
                    rich_tool_kind(u.kind.or_else(|| previous.kind.clone()), &source, &title);
                self.remember_tool(
                    &u.tool_call_id,
                    ToolContext {
                        title: title.clone(),
                        kind: kind.clone(),
                        source: source.clone(),
                        // The initial ToolCall owns classification; updates only carry it through.
                        test_command: previous.test_command.clone(),
                        test_signaled: previous.test_signaled,
                    },
                );
                let normalized = self.normalizer.normalize(
                    u.content.as_ref(),
                    u.raw_output.as_ref(),
                    &source,
                    &self.session_id,
                    &u.tool_call_id,
                );
                (
                    Some(Event::ToolCall {
                        session,
                        id: u.tool_call_id.clone(),
                        title: title.clone(),
                        status: status.clone(),
                        kind: kind.clone(),
                        agent_input: None,
                        outputs: normalized.outputs.clone(),
                        transcript_seq: None,
                    }),
                    Some(Part::ToolCall {
                        id: u.tool_call_id,
                        title,
                        status,
                        tool_kind: kind,
                        agent_input: None,
                        outputs: normalized.outputs,
                    }),
                    normalized.warnings,
                )
            }
            SessionUpdate::Plan { entries } => {
                let items: Vec<String> = entries.into_iter().map(|e| e.content).collect();
                (
                    Some(Event::Plan {
                        session,
                        entries: items.clone(),
                        transcript_seq: None,
                    }),
                    Some(Part::Plan { entries: items }),
                    Vec::new(),
                )
            }
            // Agent-side config change (e.g. it switched model itself): forward the new set to the
            // UI. Not a transcript part — configuration isn't conversation.
            SessionUpdate::ConfigOptionUpdate { config_options } => (
                Some(Event::ConfigOptions {
                    session,
                    options: provider_config_option_infos(&self.provider, &config_options),
                }),
                None,
                Vec::new(),
            ),
            SessionUpdate::UsageUpdate { used, size, cost } => {
                // The legacy rolling-usage projection for cost tracking. ACP reports one context
                // figure, not an input/output split, so the whole count rides `input_tokens`.
                self.emit(Event::Usage {
                    session: session.clone(),
                    input_tokens: used,
                    output_tokens: 0,
                });
                (
                    Some(Event::ContextWindow {
                        session,
                        used_tokens: used,
                        context_window: size,
                        // Only a plainly numeric cost is forwarded; structured provider cost
                        // objects stay out of the context-window contract.
                        cost_usd: cost.as_ref().and_then(Value::as_f64),
                    }),
                    None,
                    Vec::new(),
                )
            }
            // Our own echoed input and any image/resource chunks aren't rendered/persisted here.
            _ => (None, None, Vec::new()),
        };
        // Persistence precedes publication, so a sequence-bearing live event can be merged with a
        // snapshot without races. A failed/disabled store still produces the live event with no
        // sequence rather than hiding provider output.
        let transcript_seq = part
            .as_ref()
            .and_then(|part| self.persist(Role::Agent, part));
        // Terminal outcome of a classified test run — once per tool call, decided by the pure
        // heuristic ([`crate::testsignal`]); never inferred from stderr or non-terminal states.
        let test_signal = match &event {
            Some(Event::ToolCall {
                id,
                status,
                outputs,
                ..
            }) if status == "completed" || status == "failed" => {
                let mut contexts = self.tool_contexts.lock().unwrap();
                match contexts.get_mut(id) {
                    Some(context) if context.test_command.is_some() && !context.test_signaled => {
                        crate::testsignal::test_outcome(status, outputs).map(|outcome| {
                            context.test_signaled = true;
                            Event::TestSignal {
                                session: self.session_id.clone(),
                                tool_call_id: id.clone(),
                                command: context.test_command.clone().unwrap_or_default(),
                                passed: outcome.passed,
                                exit_code: outcome.exit_code,
                            }
                        })
                    }
                    _ => None,
                }
            }
            _ => None,
        };
        if let Some(mut event) = event {
            match &mut event {
                Event::AgentText {
                    transcript_seq: seq,
                    ..
                }
                | Event::AgentThought {
                    transcript_seq: seq,
                    ..
                }
                | Event::ToolCall {
                    transcript_seq: seq,
                    ..
                }
                | Event::Plan {
                    transcript_seq: seq,
                    ..
                } => *seq = transcript_seq,
                _ => {}
            }
            self.emit(event);
        }
        if let Some(signal) = test_signal {
            self.emit(signal);
        }
        for warning in warnings {
            self.emit(Event::Error {
                session: Some(self.session_id.clone()),
                message: format!("tool output warning: {warning}"),
                terminal: false,
                request_id: None,
            });
        }
    }

    async fn request_permission(&self, req: RequestPermissionRequest) -> RequestPermissionResponse {
        let kind = req
            .tool_call
            .get("kind")
            .and_then(|v| v.as_str())
            .unwrap_or("other");
        let tool_call_id = req
            .tool_call
            .get("toolCallId")
            .or_else(|| req.tool_call.get("tool_call_id"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        let tool = self.tool_context(tool_call_id);
        let explicit_elicitation = is_mcp_elicitation(&req);
        let title = req
            .tool_call
            .get("title")
            .and_then(|v| v.as_str())
            .filter(|title| !title.trim().is_empty())
            .map(str::to_string)
            .or_else(|| {
                explicit_elicitation
                    .then(|| elicitation_message(&req.tool_call))
                    .flatten()
            })
            .or_else(|| (!tool.title.trim().is_empty()).then(|| tool.title.clone()))
            .unwrap_or_else(|| "Tool call".to_string());

        let context = permission_context(&req, &tool, &title);

        let action = if is_internal_scene_selection(&req, &tool, &title) {
            Action::Allow
        } else if context.kind == PermissionContextKind::Acp {
            self.policy.lock().unwrap().decide(kind, &title)
        } else {
            // MCP elicitation, site access, sensitive browser actions, and Computer Use app
            // approvals are user-presence boundaries. Full Access never bypasses them.
            Action::Ask
        };
        let outcome = match action {
            Action::Allow => select_kind(&req.options, "allow"),
            Action::Deny => select_kind(&req.options, "reject"),
            Action::Ask => {
                // Park the request and ask the UI. The turn stays open until answered.
                let options = req
                    .options
                    .iter()
                    .map(|o| (o.option_id.clone(), o.name.clone()))
                    .collect::<Vec<_>>();
                let option_kinds = req
                    .options
                    .iter()
                    .map(|option| (option.option_id.clone(), option.kind.clone()))
                    .collect::<BTreeMap<_, _>>();
                let Some((request_id, rx)) = self.router.park_permission(
                    &self.session_id,
                    title.clone(),
                    options.clone(),
                    option_kinds,
                    context.clone(),
                ) else {
                    return RequestPermissionResponse {
                        outcome: PermissionOutcome::Cancelled,
                    };
                };
                self.emit(Event::PermissionRequest {
                    session: self.session_id.clone(),
                    request_id,
                    title,
                    options,
                    context,
                });
                rx.await.unwrap_or(PermissionOutcome::Cancelled)
            }
        };
        RequestPermissionResponse { outcome }
    }

    /// A structured question from the agent (Claude Code's `AskUserQuestion`, an MCP form
    /// elicitation). Unlike a permission request this is never auto-answered: no policy can know
    /// what the user would have picked, and the permission modes govern what the agent may *do*,
    /// not what it may ask. Anything we can't render — URL mode, a schema with no answerable field
    /// — is declined, which tells the agent "nothing was chosen" and lets the turn continue.
    async fn create_elicitation(&self, req: CreateElicitationRequest) -> CreateElicitationResponse {
        if !req.is_form() {
            return CreateElicitationResponse::Decline;
        }
        let Some(form) = crate::elicitation::parse_form(
            &req.message,
            req.tool_call_id.as_deref(),
            req.requested_schema.as_ref().unwrap_or(&Value::Null),
        ) else {
            return CreateElicitationResponse::Decline;
        };
        let Some((request_id, rx)) = self.router.park_elicitation(&self.session_id, form.clone())
        else {
            return CreateElicitationResponse::Decline;
        };
        self.emit(Event::ElicitationRequest {
            session: self.session_id.clone(),
            request_id,
            form,
        });
        rx.await.unwrap_or(CreateElicitationResponse::Cancel)
    }
}

struct SessionRuntime {
    session: Session,
    client: Arc<AcpClient>,
    /// `None` until the first prompt creates the ACP session (so MCP servers from the document
    /// attach at `session/new`).
    acp_session_id: Option<String>,
    /// The resume cursor (t3code-style): a previous process's ACP session id, carried by a revived
    /// session. When [`SessionRuntime::caps`] says the agent supports `session/load`, the first
    /// prompt re-attaches to it — restoring the agent's conversation context — instead of running
    /// `session/new` with a blank memory. Cleared once consumed (either way).
    resume_acp_session_id: Option<String>,
    /// What the agent advertised at `initialize`.
    caps: AgentCaps,
    /// MCP servers already attached to the live ACP session. ACP only accepts them on session
    /// creation/load, so later turns may reuse but cannot silently add a new server.
    mcp_servers: Vec<McpServer>,
    /// Mutes this session's [`SessionHandler`] while `session/load` replays history.
    replaying: Arc<AtomicBool>,
    cwd: String,
    policy: Arc<Mutex<PermissionPolicy>>,
    /// The models this session can be switched to: what the agent reported at `session/new`, or
    /// [`builtin_models`] for its provider when it reports none — which is most of them today,
    /// since the ACP model API is UNSTABLE and widely unimplemented.
    models: Vec<ModelChoice>,
    /// Last complete selector set received from the agent. Most providers return a replacement
    /// set after each change; Grok's legacy mode method returns `{}`, so its metadata-derived
    /// effort option is updated here after a successful switch.
    config_options: Vec<ConfigOptionInfo>,
    /// Whether [`SessionRuntime::models`] came from the agent rather than our built-in list. A
    /// built-in choice is one the agent never advertised, so it's applied on a best-effort
    /// `session/set_model` and reported honestly when the agent won't take it.
    models_reported: bool,
}

struct EngineState {
    providers: Vec<Provider>,
    /// Shared + mutable so the library-management UI can add/remove skills that the picker and the
    /// prompt compiler see immediately.
    skills: Arc<Mutex<SkillLibrary>>,
    /// Resolved scene library for prompt-preamble injection ([`Engine::set_scenes`], mirroring
    /// skills). Empty until a frontend supplies one; every lookup degrades to "no scene".
    scenes: Mutex<Arc<crate::scene::SceneLibrary>>,
    /// Scene-artifact capture layer for the TurnEnded auto-capture glue; `None` without a store.
    scene_artifacts: Mutex<Option<crate::scene_artifact::SceneArtifactStore>>,
    events: mpsc::UnboundedSender<Event>,
    sessions: Mutex<HashMap<SessionId, SessionRuntime>>,
    /// Provider processes that have spawned but are not yet a fully initialized session.
    starting_clients: Mutex<Vec<Arc<AcpClient>>>,
    shutting_down: AtomicBool,
    activity: ActivityTracker,
    router: PermissionRouter,
    store: Option<Arc<Store>>,
    /// Optional because persistence and provider-neutral memory have independent lifecycles.
    memory: Option<MemoryCapability>,
    canvas_gate: CanvasFeatureGate,
    desktop_mcp: Option<DesktopMcpConfig>,
}

/// Desktop-only bootstrap material for C2's authenticated browser MCP sidecar. The master
/// key never leaves the process: each session receives a distinct derived key in its child
/// environment, and the broker validates it before dispatching a request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DesktopMcpConfig {
    pub command: String,
    pub socket_path: String,
    pub master_key: String,
}

impl DesktopMcpConfig {
    fn server_for_session(&self, session: &str, name: &str, surface: &str) -> McpServer {
        let session_key =
            blake3::hash(format!("codetwo-browser\0{}\0{session}", self.master_key).as_bytes())
                .to_hex()
                .to_string();
        McpServer {
            name: name.into(),
            cwd: None,
            transport: McpTransport::Stdio {
                command: self.command.clone(),
                args: vec!["--codetwo-browser-mcp".into()],
                env: vec![
                    ("CODETWO_BROWSER_SOCKET".into(), self.socket_path.clone()),
                    ("CODETWO_BROWSER_SESSION".into(), session.to_string()),
                    ("CODETWO_BROWSER_SESSION_KEY".into(), session_key),
                    ("CODETWO_DESKTOP_MCP_SURFACE".into(), surface.into()),
                ],
            },
        }
    }

    fn browser_server_for_session(&self, session: &str) -> McpServer {
        self.server_for_session(session, "codetwo_browser", "browser")
    }

    fn scene_server_for_session(&self, session: &str) -> McpServer {
        self.server_for_session(session, "codetwo_scenes", "scenes")
    }
}

/// Owns the sessions and drives providers. Construct with [`Engine::new`], which also hands back the
/// [`Event`] receiver a frontend renders.
pub struct Engine {
    state: Arc<EngineState>,
}

impl Engine {
    pub fn new(
        providers: Vec<Provider>,
        skills: SkillLibrary,
    ) -> (Engine, mpsc::UnboundedReceiver<Event>) {
        Self::build(
            providers,
            skills,
            None,
            None,
            CanvasFeatureGate::default(),
            None,
        )
    }

    /// Like [`Engine::new`] but persists sessions and transcripts to `store`.
    pub fn with_store(
        providers: Vec<Provider>,
        skills: SkillLibrary,
        store: Arc<Store>,
    ) -> (Engine, mpsc::UnboundedReceiver<Event>) {
        let memory = Self::permanent_memory(store.clone());
        Self::build(
            providers,
            skills,
            Some(store),
            Some(memory),
            CanvasFeatureGate::default(),
            None,
        )
    }

    /// Plugin construction path: persistence remains available when `memory` is absent or later
    /// revoked. Direct constructors retain their historical always-on memory for compatibility.
    pub fn with_store_and_memory(
        providers: Vec<Provider>,
        skills: SkillLibrary,
        store: Arc<Store>,
        memory: Option<MemoryCapability>,
    ) -> (Engine, mpsc::UnboundedReceiver<Event>) {
        Self::build(
            providers,
            skills,
            Some(store),
            memory,
            CanvasFeatureGate::default(),
            None,
        )
    }

    /// Like [`Engine::with_store`] with an explicitly injected Canvas gate for trusted physical
    /// QA. The default constructors remain disabled and never read an environment toggle.
    #[doc(hidden)]
    pub fn with_store_and_canvas_gate(
        providers: Vec<Provider>,
        skills: SkillLibrary,
        store: Arc<Store>,
        canvas_gate: CanvasFeatureGate,
    ) -> (Engine, mpsc::UnboundedReceiver<Event>) {
        let memory = Self::permanent_memory(store.clone());
        Self::build(
            providers,
            skills,
            Some(store),
            Some(memory),
            canvas_gate,
            None,
        )
    }

    /// Desktop construction path that attaches C2's internal browser MCP to every Codex
    /// session. Other providers and non-desktop frontends remain unchanged.
    #[doc(hidden)]
    pub fn with_store_canvas_and_desktop_mcp(
        providers: Vec<Provider>,
        skills: SkillLibrary,
        store: Arc<Store>,
        memory: Option<MemoryCapability>,
        canvas_gate: CanvasFeatureGate,
        desktop_mcp: DesktopMcpConfig,
    ) -> (Engine, mpsc::UnboundedReceiver<Event>) {
        Self::build(
            providers,
            skills,
            Some(store),
            memory,
            canvas_gate,
            Some(desktop_mcp),
        )
    }

    fn permanent_memory(store: Arc<Store>) -> MemoryCapability {
        let memory = MemoryCapability::new(store);
        if let Err(error) = memory.catch_up() {
            tracing::warn!("memory catch-up failed: {error}");
        }
        memory
    }

    fn build(
        providers: Vec<Provider>,
        skills: SkillLibrary,
        store: Option<Arc<Store>>,
        memory: Option<MemoryCapability>,
        canvas_gate: CanvasFeatureGate,
        desktop_mcp: Option<DesktopMcpConfig>,
    ) -> (Engine, mpsc::UnboundedReceiver<Event>) {
        let (events, rx) = mpsc::unbounded_channel();
        if let Some(store) = &store {
            if let Err(error) = store.normalize_interrupted_activities() {
                tracing::warn!("normalize interrupted session activity failed: {error}");
            }
        }
        let activity = ActivityTracker::new(events.clone(), store.clone());
        let router = PermissionRouter::with_tracker(activity.clone());
        let state = Arc::new(EngineState {
            providers,
            skills: Arc::new(Mutex::new(skills)),
            scenes: Mutex::new(Arc::new(crate::scene::SceneLibrary::default())),
            scene_artifacts: Mutex::new(None),
            events,
            sessions: Mutex::new(HashMap::new()),
            starting_clients: Mutex::new(Vec::new()),
            shutting_down: AtomicBool::new(false),
            activity,
            router,
            store,
            memory,
            canvas_gate,
            desktop_mcp,
        });
        (Engine { state }, rx)
    }

    pub fn router(&self) -> &PermissionRouter {
        &self.state.router
    }

    fn track_starting_client(&self, client: &Arc<AcpClient>) -> bool {
        let mut starting = self.state.starting_clients.lock().unwrap();
        if self.state.shutting_down.load(Ordering::Acquire) {
            client.terminate();
            return false;
        }
        starting.push(client.clone());
        true
    }

    fn untrack_starting_client(&self, client: &Arc<AcpClient>) {
        self.state
            .starting_clients
            .lock()
            .unwrap()
            .retain(|candidate| !Arc::ptr_eq(candidate, client));
    }

    /// Stop every live provider owned by this engine.
    ///
    /// This is the synchronous unload boundary used by the engine plugin. Pending local approval
    /// routes are released first, then ACP receives a best-effort cancellation, and finally the
    /// provider process is terminated so an in-flight prompt cannot outlive the plugin scope.
    pub fn shutdown(&self) {
        if self.state.shutting_down.swap(true, Ordering::AcqRel) {
            return;
        }
        let sessions = self
            .state
            .sessions
            .lock()
            .unwrap()
            .iter()
            .map(|(session, runtime)| {
                (
                    session.clone(),
                    runtime.client.clone(),
                    runtime.acp_session_id.clone(),
                )
            })
            .collect::<Vec<_>>();
        let starting = self.state.starting_clients.lock().unwrap().clone();
        for (session, client, acp_session_id) in sessions {
            self.state.activity.cancel_pending(&session);
            if let Some(acp_session_id) = acp_session_id {
                let _ = client.cancel(&acp_session_id);
            }
            client.terminate();
        }
        for client in starting {
            client.terminate();
        }
    }

    /// Atomically resolve one pending permission. Protocol adapters use the boolean result as the
    /// business acknowledgement; a stale/duplicate answer must not be reported as accepted.
    pub fn answer_permission(
        &self,
        session: &str,
        request_id: &str,
        option_id: Option<&str>,
    ) -> bool {
        self.state
            .router
            .answer_for_session(session, request_id, option_id)
    }

    /// Answer a parked structured question. Returns false when the id is unknown or already
    /// answered, or when it names a permission rather than an elicitation.
    pub fn answer_elicitation(
        &self,
        session: &str,
        request_id: &str,
        answer: crate::elicitation::ElicitationAnswer,
    ) -> bool {
        self.state
            .router
            .answer_elicitation_for_session(session, request_id, answer)
    }

    /// The shared skill library (for the picker / management UI).
    /// The persistence layer, when one is configured. Frontends reach through this for the things
    /// that are pure bookkeeping — the project list — rather than routing them through `Op`, which
    /// is for anything that touches a running agent.
    pub fn store(&self) -> Option<Arc<Store>> {
        self.state.store.clone()
    }

    pub fn skills(&self) -> Arc<Mutex<SkillLibrary>> {
        self.state.skills.clone()
    }

    /// Replace the skill library (after add/remove on disk).
    pub fn set_skills(&self, library: SkillLibrary) {
        *self.state.skills.lock().unwrap() = library;
    }

    /// Replace the resolved scene library (mirroring [`Engine::set_skills`]; the desktop's
    /// `reload_scenes` calls both). Prompts compiled afterwards see the new definitions.
    pub fn set_scenes(&self, library: Arc<crate::scene::SceneLibrary>) {
        *self.state.scenes.lock().unwrap() = library;
    }

    /// Attach the scene-artifact capture layer (desktop wiring; mirrors store wiring).
    pub fn set_scene_artifacts(&self, artifacts: crate::scene_artifact::SceneArtifactStore) {
        *self.state.scene_artifacts.lock().unwrap() = Some(artifacts);
    }

    fn session_for_checkout_validation(&self, id: &str) -> Result<Option<Session>, String> {
        if let Some(session) = self
            .state
            .sessions
            .lock()
            .unwrap()
            .get(id)
            .map(|runtime| runtime.session.clone())
        {
            return Ok(Some(session));
        }
        self.state
            .store
            .as_ref()
            .map(|store| {
                store
                    .get_session(id)
                    .map_err(|error| format!("couldn't read persisted session {id}: {error}"))
            })
            .transpose()
            .map(|session| session.flatten())
    }

    fn session_activity(&self, session: &str) -> Option<SessionActivity> {
        self.state
            .activity
            .activity(session)
            .or_else(|| {
                self.state
                    .sessions
                    .lock()
                    .unwrap()
                    .get(session)
                    .map(|runtime| runtime.session.activity.clone())
            })
            .or_else(|| {
                self.state
                    .store
                    .as_ref()
                    .and_then(|store| store.get_session(session).ok().flatten())
                    .map(|session| session.activity)
            })
    }

    /// Atomically reserve one core-owned turn generation for this session.
    fn try_start_turn(&self, session: &str, request_id: Option<String>) -> Option<TurnLease> {
        let initial = self.session_activity(session)?;
        self.state.activity.claim(session, request_id, initial)
    }

    fn preflight_canvas_document(
        &self,
        doc: &[DocBlock],
        cwd: &str,
    ) -> Result<Option<CompiledPrompt>, CanvasError> {
        if !doc
            .iter()
            .any(|block| matches!(block, DocBlock::Canvas { .. }))
        {
            return Ok(None);
        }
        let library = self.state.skills.lock().unwrap();
        let resolve_session =
            |id: &str| -> Option<String> { self.referenced_session_context(id).ok().flatten() };
        let store = self.state.store.clone();
        let resolve_canvas = move |id: &str, revision: u64| {
            store
                .as_ref()
                .ok_or_else(|| CanvasError::NotFound(format!("{id}@{revision}")))?
                .resolve_canvas_prompt_frozen(id, revision)
        };
        compile_with_canvas(
            doc,
            &library,
            Some(std::path::Path::new(cwd)),
            Some(&resolve_session),
            self.state.canvas_gate,
            CanvasProviderImageCapability::Unknown,
            &resolve_canvas,
        )
        .map(Some)
    }

    /// A session's persisted transcript (empty if not using a store).
    pub fn transcript(&self, session_id: &str) -> Vec<(Role, Part)> {
        match &self.state.store {
            Some(store) => store.transcript(session_id).unwrap_or_default(),
            None => Vec::new(),
        }
    }

    pub fn transcript_with_seq(&self, session_id: &str) -> Vec<(i64, Role, Part)> {
        match &self.state.store {
            Some(store) => store.transcript_with_seq(session_id).unwrap_or_default(),
            None => Vec::new(),
        }
    }

    /// One turn-aligned transcript page. Unlike the legacy convenience method above, storage and
    /// cursor failures remain visible to callers so protocol bridges can report invalid cursors.
    pub fn transcript_page(
        &self,
        session_id: &str,
        before: Option<TranscriptCursor>,
        limit: usize,
    ) -> Result<TranscriptPage, StoreError> {
        match &self.state.store {
            Some(store) => store.transcript_page(session_id, before, limit),
            None => Ok(TranscriptPage::empty()),
        }
    }

    /// Resolve a chat mention from the bounded recent transcript page used by a real send and by
    /// prompt previews. Unknown/empty sessions return `None`; storage failures stay distinguishable.
    pub fn referenced_session_context(
        &self,
        session_id: &str,
    ) -> Result<Option<String>, StoreError> {
        let Some(store) = &self.state.store else {
            return Ok(None);
        };
        let Some(session) = store.get_session(session_id)? else {
            return Ok(None);
        };
        let page = store.transcript_page(session_id, None, DEFAULT_TRANSCRIPT_TURNS)?;
        let earlier_omitted = page.next_before.is_some();
        let transcript: Vec<(Role, Part)> = page
            .entries
            .into_iter()
            .map(|entry| (entry.role, entry.part))
            .collect();
        let context =
            transcript_context_with_omission(&session.title, &transcript, earlier_omitted);
        Ok((!context.trim().is_empty()).then_some(context))
    }

    /// Rename a session (persisted).
    pub fn rename_session(&self, id: &str, title: &str) {
        if let Some(store) = &self.state.store {
            let _ = store.rename_session(id, title);
        }
        if let Some(rt) = self.state.sessions.lock().unwrap().get_mut(id) {
            rt.session.title = title.to_string();
            rt.session.title_origin = SessionTitleOrigin::Manual;
        }
    }

    /// Give a newly prompted session its first useful title without ever replacing a manual one.
    fn set_initial_title(&self, id: &str, title: &str) {
        let durable_changed = match &self.state.store {
            Some(store) => store.set_initial_title(id, title).unwrap_or(false),
            None => true,
        };
        if !durable_changed {
            return;
        }
        if let Some(rt) = self.state.sessions.lock().unwrap().get_mut(id) {
            if rt.session.title_origin == SessionTitleOrigin::Default {
                rt.session.title = title.to_string();
                rt.session.title_origin = SessionTitleOrigin::Automatic;
            }
        }
        self.emit(Event::SessionTitleChanged {
            session: id.to_string(),
            title: title.to_string(),
        });
    }

    /// Archive / unarchive a session (archived ones drop out of the main list).
    pub fn set_archived(&self, id: &str, archived: bool) {
        if let Some(store) = &self.state.store {
            let _ = store.set_archived(id, archived);
        }
        if archived {
            if let Some(rt) = self.state.sessions.lock().unwrap().get_mut(id) {
                rt.session.pinned = false;
            }
        }
    }

    /// Pin or unpin a session in the persistent active-session list.
    pub fn set_pinned(&self, id: &str, pinned: bool) {
        let effective = match &self.state.store {
            Some(store) => {
                let _ = store.set_pinned(id, pinned);
                store
                    .get_session(id)
                    .ok()
                    .flatten()
                    .map(|s| s.pinned)
                    .unwrap_or(pinned)
            }
            None => pinned,
        };
        if let Some(rt) = self.state.sessions.lock().unwrap().get_mut(id) {
            rt.session.pinned = effective;
        }
    }

    /// Archived sessions.
    pub fn list_archived(&self) -> Result<Vec<Session>, StoreError> {
        let sessions = match &self.state.store {
            Some(store) => store.list_archived_sessions()?,
            None => Vec::new(),
        };
        Ok(self.overlay_activities(sessions))
    }

    /// Explicit, user-confirmed permanent discard of a session's isolated checkout and branch.
    ///
    /// The session itself is retained as readable history, marked `worktree_discarded`, and can no
    /// longer run prompts. Fails closed while the session is running or awaiting input, and reuses
    /// every durable checkout receipt check before anything destructive happens.
    pub async fn discard_session_worktree(
        &self,
        id: &str,
    ) -> Result<crate::worktree::DiscardedWorktree, String> {
        let session = self
            .session_for_checkout_validation(id)?
            .ok_or_else(|| "no such session".to_string())?;
        let Some(root) = session.worktree_path.clone() else {
            return Err("session has no worktree to discard".into());
        };
        if session.worktree_discarded {
            // A previous discard already ran; repeating it is a no-op rather than an error so a
            // client that missed the receipt can converge.
            return Ok(crate::worktree::DiscardedWorktree {
                removed_checkout: false,
                deleted_branch: None,
            });
        }
        if let Some(activity) = self.session_activity(id) {
            match activity.state {
                SessionRunState::Idle | SessionRunState::Failed { .. } => {}
                SessionRunState::Running { .. } | SessionRunState::AwaitingInput { .. } => {
                    return Err(
                        "session is still running; stop it before discarding its worktree".into(),
                    );
                }
            }
        }
        let root_path = std::path::Path::new(&root);
        let checkout_present = match std::fs::symlink_metadata(root_path) {
            Ok(_) => true,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
            Err(error) => {
                return Err(format!(
                    "couldn't inspect session worktree at {root}: {error}"
                ))
            }
        };
        if checkout_present {
            // The same fail-closed receipt checks that gate running a provider in this checkout
            // also gate deleting it: identity, repository, registration, and branch must all match.
            validate_session_checkout(&session).await?;
        }
        let common_dir = match session.worktree_common_dir.as_deref() {
            Some(dir) => std::fs::canonicalize(dir)
                .map_err(|error| format!("session repository identity is unavailable: {error}"))?,
            None if checkout_present => crate::worktree::common_dir(root_path)
                .await
                .map_err(|error| format!("couldn't identify session repository: {error}"))?,
            None => {
                return Err(format!(
                    "session worktree at {root} is already gone and no repository identity was recorded; clean up any leftover branch manually"
                ));
            }
        };
        let branch = crate::worktree::branch_for_session(&session.id)
            .map_err(|error| format!("invalid session worktree identity: {error}"))?;
        let outcome = crate::worktree::discard_session_worktree(
            &common_dir,
            root_path,
            session.worktree_identity.as_ref(),
            &branch,
        )
        .await
        .map_err(|error| format!("couldn't discard session worktree: {error}"))?;

        if let Some(store) = &self.state.store {
            store.mark_worktree_discarded(id).map_err(|error| {
                format!("worktree was discarded, but couldn't record it: {error}")
            })?;
        }
        // Drop any live runtime: a provider process must never keep running against a removed
        // checkout, and the durable discarded flag refuses future revivals with a clear error.
        self.state.sessions.lock().unwrap().remove(id);
        self.emit(Event::WorktreeDiscarded {
            session: id.to_string(),
            worktree_path: root,
            removed_checkout: outcome.removed_checkout,
            deleted_branch: outcome.deleted_branch.clone(),
        });
        Ok(outcome)
    }

    /// Every session checkout, orphaned registration, and stale directory associated with one
    /// project's repository, for the management UI.
    pub async fn list_project_worktrees(
        &self,
        project_path: &str,
    ) -> Result<Vec<WorktreeStatusEntry>, String> {
        let root = crate::worktree::repo_root(std::path::Path::new(project_path))
            .await
            .map_err(|error| format!("not a git repository: {error}"))?;
        let common_dir = crate::worktree::common_dir(&root)
            .await
            .map_err(|error| format!("couldn't identify repository: {error}"))?;
        let registrations = crate::worktree::registrations_from_common_dir(&common_dir)
            .await
            .map_err(|error| format!("couldn't list worktrees: {error}"))?;

        let mut sessions: Vec<Session> = Vec::new();
        if let Some(store) = &self.state.store {
            sessions.extend(store.list_sessions().map_err(|e| e.to_string())?);
            sessions.extend(store.list_archived_sessions().map_err(|e| e.to_string())?);
        }
        // `archived` isn't a Session field; derive it from which list a row came from.
        let archived_ids: std::collections::HashSet<String> = match &self.state.store {
            Some(store) => store
                .list_archived_sessions()
                .map_err(|e| e.to_string())?
                .into_iter()
                .map(|session| session.id)
                .collect(),
            None => Default::default(),
        };

        let mut entries: Vec<WorktreeStatusEntry> = Vec::new();
        let mut claimed_paths: std::collections::HashSet<std::path::PathBuf> = Default::default();
        for session in &sessions {
            let Some(worktree_path) = session.worktree_path.as_deref() else {
                continue;
            };
            let session_common = session.worktree_common_dir.as_deref().map(|dir| {
                std::fs::canonicalize(dir).unwrap_or_else(|_| std::path::PathBuf::from(dir))
            });
            if session_common.as_deref() != Some(common_dir.as_path()) {
                continue;
            }
            let recorded = std::path::PathBuf::from(worktree_path);
            let canonical = std::fs::canonicalize(&recorded).ok();
            let checkout_present = canonical.is_some();
            let lookup = canonical.clone().unwrap_or_else(|| recorded.clone());
            let registration = registrations.iter().find(|registration| {
                std::fs::canonicalize(&registration.path)
                    .map(|path| Some(path.as_path()) == canonical.as_deref())
                    .unwrap_or(registration.path == lookup)
            });
            let registered = registration.is_some();
            let branch = registration.and_then(|registration| registration.branch.clone());
            claimed_paths.insert(lookup);
            // A fully discarded session leaves nothing actionable behind; only surface it while
            // some leftover (directory or registration) still exists.
            if session.worktree_discarded && !checkout_present && !registered {
                continue;
            }
            entries.push(WorktreeStatusEntry {
                path: worktree_path.to_string(),
                branch,
                kind: WorktreeEntryKind::Session,
                registered,
                checkout_present,
                session_id: Some(session.id.clone()),
                session_title: Some(session.title.clone()),
                session_archived: archived_ids.contains(&session.id),
                worktree_discarded: session.worktree_discarded,
            });
        }

        // Registrations under our branch namespace with no session row: orphans from deleted
        // stores or interrupted creations.
        for registration in &registrations {
            let is_session_branch = registration
                .branch
                .as_deref()
                .is_some_and(|branch| branch.starts_with("refs/heads/codetwo/"));
            if !is_session_branch {
                continue;
            }
            let canonical = std::fs::canonicalize(&registration.path)
                .unwrap_or_else(|_| registration.path.clone());
            if claimed_paths.contains(&canonical) {
                continue;
            }
            claimed_paths.insert(canonical.clone());
            entries.push(WorktreeStatusEntry {
                path: registration.path.to_string_lossy().into_owned(),
                branch: registration.branch.clone(),
                kind: WorktreeEntryKind::Orphan,
                registered: true,
                checkout_present: registration.path.exists(),
                session_id: None,
                session_title: None,
                session_archived: false,
                worktree_discarded: false,
            });
        }

        // Directories in the shared container that Git no longer registers: leftovers from prunes,
        // failed creations, or manual deletions inside the checkout.
        if let Some(container) = crate::worktree::session_container_dir(&root) {
            if let Ok(read_dir) = std::fs::read_dir(&container) {
                for entry in read_dir.flatten() {
                    let path = entry.path();
                    let canonical = std::fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
                    if claimed_paths.contains(&canonical) {
                        continue;
                    }
                    let repo_name = root
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("repo");
                    let name = entry.file_name();
                    let name = name.to_string_lossy();
                    let ours = name.starts_with(&format!("{repo_name}-"))
                        || name.starts_with(".codetwo-rollback-");
                    if !ours {
                        continue;
                    }
                    entries.push(WorktreeStatusEntry {
                        path: path.to_string_lossy().into_owned(),
                        branch: None,
                        kind: WorktreeEntryKind::Stale,
                        registered: false,
                        checkout_present: true,
                        session_id: None,
                        session_title: None,
                        session_archived: false,
                        worktree_discarded: false,
                    });
                }
            }
        }
        Ok(entries)
    }

    /// Explicit, user-confirmed removal of a checkout that no session claims: an orphaned
    /// registration under the `codetwo/` namespace, or a stale unregistered directory inside the
    /// shared `.codetwo-worktrees` container. Anything a session still records is refused and must
    /// go through [`Engine::discard_session_worktree`].
    pub async fn discard_orphan_worktree(
        &self,
        project_path: &str,
        worktree_path: &str,
    ) -> Result<crate::worktree::DiscardedWorktree, String> {
        let root = crate::worktree::repo_root(std::path::Path::new(project_path))
            .await
            .map_err(|error| format!("not a git repository: {error}"))?;
        let common_dir = crate::worktree::common_dir(&root)
            .await
            .map_err(|error| format!("couldn't identify repository: {error}"))?;
        let container = crate::worktree::session_container_dir(&root)
            .ok_or_else(|| "repository has no parent directory".to_string())?;
        let container = std::fs::canonicalize(&container)
            .map_err(|error| format!("worktree container is unavailable: {error}"))?;
        let target_raw = std::path::PathBuf::from(worktree_path);
        let target = std::fs::canonicalize(&target_raw).unwrap_or_else(|_| target_raw.clone());
        if target.parent() != Some(container.as_path()) {
            return Err(format!(
                "refusing to discard {}: only checkouts directly inside {} can be cleaned up here",
                target.display(),
                container.display()
            ));
        }

        let mut sessions: Vec<Session> = Vec::new();
        if let Some(store) = &self.state.store {
            sessions.extend(store.list_sessions().map_err(|e| e.to_string())?);
            sessions.extend(store.list_archived_sessions().map_err(|e| e.to_string())?);
        }
        for session in &sessions {
            let Some(recorded) = session.worktree_path.as_deref() else {
                continue;
            };
            let recorded_path = std::path::PathBuf::from(recorded);
            let recorded_canonical = std::fs::canonicalize(&recorded_path).unwrap_or(recorded_path);
            if recorded_canonical == target && !session.worktree_discarded {
                return Err(format!(
                    "refusing to discard {}: it belongs to session “{}”; discard it from that session instead",
                    target.display(),
                    session.title
                ));
            }
        }

        let registration = crate::worktree::registrations_from_common_dir(&common_dir)
            .await
            .map_err(|error| format!("couldn't list worktrees: {error}"))?
            .into_iter()
            .find(|registration| {
                std::fs::canonicalize(&registration.path)
                    .map(|path| path == target)
                    .unwrap_or(registration.path == target_raw)
            });
        match registration {
            Some(registration) => {
                let branch = registration
                    .branch
                    .as_deref()
                    .and_then(|branch| branch.strip_prefix("refs/heads/"))
                    .ok_or_else(|| {
                        format!(
                            "refusing to discard {}: its checkout is not on a codetwo/ session branch",
                            target.display()
                        )
                    })?;
                crate::worktree::discard_session_worktree(&common_dir, &target, None, branch)
                    .await
                    .map_err(|error| format!("couldn't discard orphan worktree: {error}"))
            }
            None => {
                // Git no longer knows this directory; it exists only inside our own container and
                // no session claims it, so plain removal is the only cleanup left.
                std::fs::remove_dir_all(&target).map_err(|error| {
                    format!("couldn't remove stale worktree directory: {error}")
                })?;
                let _ = std::fs::remove_dir(&container);
                Ok(crate::worktree::DiscardedWorktree {
                    removed_checkout: true,
                    deleted_branch: None,
                })
            }
        }
    }

    /// Sessions for the left-hand list. Reads the store when persistent, else live sessions.
    pub fn list_sessions(&self) -> Result<Vec<Session>, StoreError> {
        let sessions = match &self.state.store {
            Some(store) => store.list_sessions()?,
            None => {
                let mut sessions: Vec<_> = self
                    .state
                    .sessions
                    .lock()
                    .unwrap()
                    .values()
                    .map(|r| r.session.clone())
                    .collect();
                sessions.sort_by(|a, b| {
                    b.pinned
                        .cmp(&a.pinned)
                        .then_with(|| b.created_at.cmp(&a.created_at))
                });
                sessions
            }
        };
        Ok(self.overlay_activities(sessions))
    }

    fn overlay_activities(&self, mut sessions: Vec<Session>) -> Vec<Session> {
        for session in &mut sessions {
            if let Some(activity) = self.state.activity.activity(&session.id) {
                if activity.revision >= session.activity.revision {
                    session.activity = activity;
                }
            }
        }
        sessions
    }

    /// Conversation-content search for frontends. Store-level limits and projection rules keep
    /// this bounded and exclude tool/reasoning payloads.
    pub fn search_sessions(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SessionSearchHit>, crate::store::StoreError> {
        match &self.state.store {
            Some(store) => store.search_sessions(query, limit),
            None => Ok(Vec::new()),
        }
    }

    /// Re-arm a stored session whose runtime died with a previous process: respawn its provider
    /// CLI and re-insert a [`SessionRuntime`]. The stored ACP session id is kept as a resume
    /// cursor — when the respawned agent advertises `session/load`, the next prompt re-attaches to
    /// that session and the agent's own context survives the restart. When it doesn't (or the load
    /// fails), the prompt falls back to `session/new`: the app-side transcript still carries the
    /// history, but the agent starts with a clean memory — and the UI is told so, rather than
    /// silently degrading. Without this, every session in the rail is stranded the moment the app
    /// restarts.
    async fn revive_session(
        &self,
        id: &str,
    ) -> Result<(Arc<AcpClient>, Option<String>, String), String> {
        let store = self
            .state
            .store
            .as_ref()
            .ok_or_else(|| "no such session".to_string())?;
        let sess = store
            .get_session(id)
            .map_err(|error| format!("couldn't read persisted session {id}: {error}"))?
            .ok_or_else(|| "no such session".to_string())?;
        validate_session_checkout(&sess).await?;
        let prov = self
            .state
            .providers
            .iter()
            .find(|p| p.id == sess.provider)
            .cloned()
            .ok_or_else(|| format!("unknown provider {:?}", sess.provider))?;
        let policy = Arc::new(Mutex::new(PermissionPolicy {
            mode: sess.permission_mode,
            sandbox: sess.sandbox_policy,
            ..Default::default()
        }));
        let handler = Arc::new(SessionHandler::new(
            id.to_string(),
            sess.provider.clone(),
            self.state.events.clone(),
            policy.clone(),
            self.state.router.clone(),
            self.state.store.clone(),
        ));
        let replaying = handler.replay_flag();
        let client = Arc::new(
            acp::spawn(&prov.launch, handler)
                .await
                .map_err(|e| format!("couldn't relaunch {}: {e}", prov.display_name))?,
        );
        if !self.track_starting_client(&client) {
            return Err("engine is shutting down".into());
        }
        let init = match client.initialize(client_capabilities()).await {
            Ok(init) => init,
            Err(error) => {
                self.untrack_starting_client(&client);
                return Err(format!("couldn't relaunch {}: {error}", prov.display_name));
            }
        };

        // The stored ACP session id becomes the resume cursor; the live id stays unset until the
        // next prompt either re-attaches (`session/load`) or starts over (`session/new`).
        let resume = sess.acp_session_id.clone();
        let cwd = sess.cwd.clone();
        let models = available_models(&prov).await;
        let current = sess.model.clone().unwrap_or_default();
        let mut sessions = self.state.sessions.lock().unwrap();
        if self.state.shutting_down.load(Ordering::Acquire) {
            drop(sessions);
            self.untrack_starting_client(&client);
            client.terminate();
            return Err("engine is shutting down".into());
        }
        self.untrack_starting_client(&client);
        sessions.insert(
            id.to_string(),
            SessionRuntime {
                session: sess,
                client: client.clone(),
                acp_session_id: None,
                resume_acp_session_id: resume,
                caps: init.caps(),
                mcp_servers: Vec::new(),
                replaying,
                cwd: cwd.clone(),
                policy,
                models: models.clone(),
                config_options: Vec::new(),
                models_reported: false,
            },
        );
        drop(sessions);
        if !models.is_empty() {
            self.emit(Event::Models {
                session: id.to_string(),
                available: models,
                current,
            });
        }
        Ok((client, None, cwd))
    }

    /// Serialize policy mutations across the durable row and the live handler. Legacy one-axis
    /// operations pass `None` for the axis they do not change, but still commit the resolved pair
    /// with the same atomic store update as the combined operation.
    fn update_execution_policy(
        &self,
        session: &str,
        mode: Option<PermissionMode>,
        sandbox: Option<SandboxPolicy>,
    ) -> Result<Option<ExecutionPolicy>, StoreError> {
        let mut sessions = self.state.sessions.lock().unwrap();
        let current = if let Some(runtime) = sessions.get(session) {
            Some(ExecutionPolicy {
                mode: runtime.session.permission_mode,
                sandbox: runtime.session.sandbox_policy,
            })
        } else if let Some(store) = &self.state.store {
            store.get_session(session)?.map(|stored| ExecutionPolicy {
                mode: stored.permission_mode,
                sandbox: stored.sandbox_policy,
            })
        } else {
            None
        };
        let Some(current) = current else {
            return Ok(None);
        };
        let next = ExecutionPolicy {
            mode: mode.unwrap_or(current.mode),
            sandbox: sandbox.unwrap_or(current.sandbox),
        };

        // Block permission decisions while the durable and live projections cross the commit
        // boundary. A callback can observe either the complete old pair or the complete new pair,
        // never a database state that has advanced while the handler still uses the old policy.
        let live_policy = sessions.get(session).map(|runtime| runtime.policy.clone());
        let mut live_policy = live_policy.as_ref().map(|policy| policy.lock().unwrap());

        // Persist first. On a disk error the live policy deliberately remains unchanged, so a
        // restart can never resurrect a different execution posture from the one just used.
        if let Some(store) = &self.state.store {
            if !store.set_execution_policy(session, next.mode, next.sandbox)? {
                return Ok(None);
            }
        }

        if let Some(live) = live_policy.as_mut() {
            live.mode = next.mode;
            live.sandbox = next.sandbox;
        }
        if let Some(runtime) = sessions.get_mut(session) {
            runtime.session.permission_mode = next.mode;
            runtime.session.sandbox_policy = next.sandbox;
        }
        Ok(Some(next))
    }

    /// Publish one terminal, authoritative outcome for an execution-policy mutation. Success is
    /// broadcast only after the durable and live projections commit; failure is correlated and
    /// leaves both projections on the previous pair.
    fn handle_execution_policy_update(
        &self,
        session: String,
        mode: Option<PermissionMode>,
        sandbox: Option<SandboxPolicy>,
        request_id: Option<String>,
    ) {
        match self.update_execution_policy(&session, mode, sandbox) {
            Ok(Some(policy)) => self.emit(Event::ExecutionPolicyChanged {
                session,
                policy,
                request_id,
            }),
            Ok(None) => self.emit(Event::Error {
                session: Some(session),
                message: "couldn't update execution policy: no such session".into(),
                terminal: false,
                request_id,
            }),
            Err(error) => self.emit(Event::Error {
                session: Some(session),
                message: format!("couldn't persist execution policy: {error}"),
                terminal: false,
                request_id,
            }),
        }
    }

    /// Process one submission. Long-running work (a prompt turn) is spawned so this returns promptly.
    pub async fn submit(&self, op: Op) -> Result<(), AcpError> {
        if self.state.shutting_down.load(Ordering::Acquire) {
            return Err(AcpError::Closed);
        }
        match op {
            Op::NewSession {
                provider,
                cwd,
                use_worktree,
                worktree_base,
                worktree_base_sha,
                request_id,
                initial_policy,
            } => {
                let creation_receipt = t3_session_create_receipt(request_id.as_deref());
                if let (Some(store), Some((command_id, public_thread_id))) =
                    (&self.state.store, creation_receipt.as_ref())
                {
                    match store.command_receipt("t3-create", command_id) {
                        Ok(Some((session_id, subject_id, _)))
                            if subject_id.as_deref() == Some(public_thread_id.as_str()) =>
                        {
                            match store.get_session(&session_id) {
                                Ok(Some(existing)) => {
                                    self.emit(Event::SessionCreated {
                                        session: existing.id,
                                        cwd: existing.cwd,
                                        project_path: existing.project_path,
                                        worktree_path: existing.worktree_path,
                                        worktree_baseline: existing.worktree_baseline,
                                        request_id,
                                    });
                                }
                                Ok(None) => self.emit(Event::Error {
                                    session: None,
                                    message: "T3 session receipt points to a missing session".into(),
                                    terminal: true,
                                    request_id,
                                }),
                                Err(error) => self.emit(Event::Error {
                                    session: None,
                                    message: format!(
                                        "couldn't load the session recorded for the T3 command: {error}"
                                    ),
                                    terminal: true,
                                    request_id,
                                }),
                            }
                            return Ok(());
                        }
                        Ok(Some(_)) => {
                            self.emit(Event::Error {
                                session: None,
                                message: "T3 command id was already used for another thread".into(),
                                terminal: true,
                                request_id,
                            });
                            return Ok(());
                        }
                        Ok(None) => {}
                        Err(error) => {
                            self.emit(Event::Error {
                                session: None,
                                message: format!(
                                    "couldn't check the durable T3 session receipt: {error}"
                                ),
                                terminal: true,
                                request_id,
                            });
                            return Ok(());
                        }
                    }
                }
                let Some(prov) = self
                    .state
                    .providers
                    .iter()
                    .find(|p| p.id == provider)
                    .cloned()
                else {
                    self.emit(Event::Error {
                        session: None,
                        message: format!("unknown provider {:?}", provider),
                        terminal: true,
                        request_id,
                    });
                    return Ok(());
                };
                // ACP requires an absolute `cwd`, and every frontend has a natural way to hand us a
                // relative one ("." is the obvious default). Resolve it once, here, so the session
                // record, the worktree, git, and `session/new` all agree on one real path.
                let cwd = match resolve_cwd(&cwd) {
                    Ok(p) => p,
                    Err(message) => {
                        self.emit(Event::Error {
                            session: None,
                            message,
                            terminal: true,
                            request_id,
                        });
                        return Ok(());
                    }
                };
                let mut sess = Session::new(provider, cwd.clone());
                let initial_policy = initial_policy.unwrap_or_default();
                sess.permission_mode = initial_policy.mode;
                sess.sandbox_policy = initial_policy.sandbox;
                let policy = Arc::new(Mutex::new(PermissionPolicy {
                    mode: sess.permission_mode,
                    sandbox: sess.sandbox_policy,
                    ..Default::default()
                }));
                let handler = Arc::new(SessionHandler::new(
                    sess.id.clone(),
                    sess.provider.clone(),
                    self.state.events.clone(),
                    policy.clone(),
                    self.state.router.clone(),
                    self.state.store.clone(),
                ));

                let replaying = handler.replay_flag();
                let client = Arc::new(acp::spawn(&prov.launch, handler).await?);
                if !self.track_starting_client(&client) {
                    return Err(AcpError::Closed);
                }
                let init = match client.initialize(client_capabilities()).await {
                    Ok(init) => init,
                    Err(error) => {
                        self.untrack_starting_client(&client);
                        return Err(error);
                    }
                };
                // Note: `session/new` is deferred to the first prompt (see Op::Prompt) so the
                // document's MCP servers are attached then.

                // Provider startup is verified before mutating Git. A worktree is durable session
                // state: archive/restart must keep using the same isolated checkout, so the source
                // project, working subdirectory, and checkout root are persisted independently;
                // cleanup is left to an explicit discard flow.
                let mut hook_errors = Vec::new();
                let mut prepared_worktree = None;
                if use_worktree {
                    let baseline = worktree_base.unwrap_or(WorktreeBaseline::Current);
                    match prepare_session_worktree_with_expected_sha(
                        std::path::Path::new(&cwd),
                        &mut sess,
                        baseline,
                        worktree_base_sha.as_deref(),
                    )
                    .await
                    {
                        Ok(prepared) => {
                            hook_errors = prepared.hook_errors;
                            prepared_worktree = Some((prepared.repo_root, prepared.worktree));
                        }
                        Err(error) => {
                            self.untrack_starting_client(&client);
                            self.emit(Event::Error {
                                session: None,
                                message: format!("couldn't create worktree: {error}"),
                                terminal: true,
                                request_id,
                            });
                            return Ok(());
                        }
                    }
                }

                // Offer the provider's built-in models straight away. Keep the client tracked
                // while this async probe runs so plugin unload can still terminate it.
                let models = available_models(&prov).await;

                // Moving a starting client into the live session map is atomic with shutdown:
                // shutdown sets the flag before taking this same lock, so it either sees the new
                // session or this path refuses to persist/insert it.
                let mut live_sessions = self.state.sessions.lock().unwrap();
                if self.state.shutting_down.load(Ordering::Acquire) {
                    drop(live_sessions);
                    self.untrack_starting_client(&client);
                    if let (Some((repo, worktree)), Some(baseline)) =
                        (prepared_worktree.as_ref(), sess.worktree_baseline.as_ref())
                    {
                        let _ =
                            crate::worktree::rollback_created(repo, worktree, &baseline.sha).await;
                    }
                    return Err(AcpError::Closed);
                }

                if let Some(store) = &self.state.store {
                    let persisted = match creation_receipt.as_ref() {
                        Some((command_id, public_thread_id)) => store
                            .upsert_session_with_command_receipt(
                                "t3-create",
                                command_id,
                                public_thread_id,
                                &sess,
                            ),
                        None => store.upsert_session(&sess),
                    };
                    if let Err(e) = persisted {
                        drop(live_sessions);
                        self.untrack_starting_client(&client);
                        let mut message = format!("couldn't persist new session: {e}");
                        if let (Some((repo, worktree)), Some(baseline)) =
                            (prepared_worktree.as_ref(), sess.worktree_baseline.as_ref())
                        {
                            let cleanup =
                                crate::worktree::rollback_created(repo, worktree, &baseline.sha)
                                    .await;
                            if let Err(cleanup) = cleanup {
                                message
                                    .push_str(&format!("; couldn't roll back worktree: {cleanup}"));
                            }
                        }
                        self.emit(Event::Error {
                            session: None,
                            message,
                            terminal: true,
                            request_id,
                        });
                        return Ok(());
                    }
                }

                let session_id = sess.id.clone();
                let cwd_stored = sess.cwd.clone();
                let project_path = sess.project_path.clone();
                let worktree_path = sess.worktree_path.clone();
                let worktree_baseline = sess.worktree_baseline.clone();
                self.state
                    .activity
                    .register(&session_id, sess.activity.clone());
                self.untrack_starting_client(&client);
                live_sessions.insert(
                    session_id.clone(),
                    SessionRuntime {
                        session: sess,
                        client: client.clone(),
                        acp_session_id: None,
                        resume_acp_session_id: None,
                        caps: init.caps(),
                        mcp_servers: Vec::new(),
                        replaying,
                        cwd: cwd_stored.clone(),
                        policy,
                        models: models.clone(),
                        config_options: Vec::new(),
                        models_reported: false,
                    },
                );
                drop(live_sessions);
                self.emit(Event::SessionCreated {
                    session: session_id.clone(),
                    cwd: cwd_stored,
                    project_path,
                    worktree_path,
                    worktree_baseline,
                    request_id,
                });
                for (hook, error) in hook_errors {
                    self.emit(Event::Error {
                        session: Some(session_id.clone()),
                        message: format!("worktree hook {hook} failed: {error}"),
                        terminal: false,
                        request_id: None,
                    });
                }
                if !models.is_empty() {
                    // No `current`: nothing has been chosen yet, and claiming a default the CLI
                    // never told us about would be a guess at its config.
                    self.emit(Event::Models {
                        session: session_id,
                        available: models,
                        current: String::new(),
                    });
                }
            }

            Op::Prompt {
                session,
                doc,
                request_id,
            } => {
                // Memory observes the user's document, not its expanded files, rules, skills, or a
                // previous memory block. Keeping this source separate prevents feedback loops.
                let memory_source = prompt_source(&doc);
                let checkout = match self.session_for_checkout_validation(&session) {
                    Ok(Some(checkout)) => checkout,
                    Ok(None) => {
                        self.emit(Event::Error {
                            session: Some(session),
                            message: "no such session".into(),
                            terminal: true,
                            request_id,
                        });
                        return Ok(());
                    }
                    Err(message) => {
                        self.emit(Event::Error {
                            session: Some(session),
                            message,
                            terminal: true,
                            request_id,
                        });
                        return Ok(());
                    }
                };
                // A provider process may live much longer than the directory it was created for.
                // Recheck the durable checkout receipt for every prompt before accepting the turn
                // or sending anything to that process. Revived sessions repeat the same check
                // immediately before spawning a replacement provider.
                if let Err(message) = validate_session_checkout(&checkout).await {
                    self.emit(Event::Error {
                        session: Some(session),
                        message,
                        terminal: true,
                        request_id,
                    });
                    return Ok(());
                }
                // Canvas references are resolved and validated before the turn claim and before
                // any canonical prompt/activity row is persisted. A gate/provider/budget error
                // therefore cannot become accepted history.
                let canvas_preflight = match self.preflight_canvas_document(&doc, &checkout.cwd) {
                    Ok(compiled) => compiled,
                    Err(error) => {
                        self.emit(Event::Error {
                            session: Some(session),
                            message: error.to_string(),
                            terminal: true,
                            request_id,
                        });
                        return Ok(());
                    }
                };
                let turn_lease = match self.try_start_turn(&session, request_id.clone()) {
                    Some(lease) => lease,
                    None => {
                        // This prompt never started. Marking the rejection terminal would clear the
                        // real turn that already owns the session in every connected frontend.
                        self.emit(Event::Error {
                            session: Some(session),
                            message: "a turn is already running for this session".into(),
                            terminal: false,
                            request_id,
                        });
                        return Ok(());
                    }
                };

                // Preserve exactly what the user authored before compiling rules, skills, files
                // and referenced chats into the provider prompt. Search, replay and title
                // generation must never mistake that hidden context for user prose.
                let canonical_user_prompt = canonical_doc_text(&doc);
                let canonical_prompt = canvas_history_projection(
                    canonical_user_prompt.clone(),
                    canvas_preflight.as_ref(),
                );
                let mut prompt_display: String = canonical_user_prompt.chars().take(400).collect();
                if canonical_user_prompt.chars().count() > 400 {
                    prompt_display.push('…');
                }
                let title = doc
                    .iter()
                    .find_map(|block| match block {
                        DocBlock::Text { text } => initial_session_title(text),
                        _ => None,
                    })
                    .or_else(|| initial_session_title(&canonical_user_prompt));
                let prompt_part = Part::Prompt {
                    text: canonical_prompt,
                    display: prompt_display,
                };
                let (expected_activity_revision, running_activity) = turn_lease
                    .prepare_running()
                    .expect("new turn claim can prepare Running activity");

                // Acceptance is one transaction when persistence is configured: the canonical
                // prompt and Running activity either both commit or neither does.
                let (transcript_seq, replayed) = if let Some(store) = &self.state.store {
                    let persisted = if let Some((command_id, message_id)) =
                        t3_prompt_receipt(request_id.as_deref())
                    {
                        store.append_prompt_activity_and_receipt(
                            "t3-prompt",
                            &command_id,
                            message_id.as_deref(),
                            &session,
                            &prompt_part,
                            expected_activity_revision,
                            &running_activity,
                        )
                    } else {
                        store
                            .append_prompt_and_activity(
                                &session,
                                &prompt_part,
                                expected_activity_revision,
                                &running_activity,
                            )
                            .map(|seq| (seq, false))
                    };
                    match persisted {
                        Ok((seq, replayed)) => (Some(seq), replayed),
                        Err(error) => {
                            drop(turn_lease);
                            self.emit(Event::Error {
                                session: Some(session),
                                message: format!("couldn't persist prompt: {error}"),
                                terminal: true,
                                request_id,
                            });
                            return Ok(());
                        }
                    }
                } else {
                    (None, false)
                };
                if replayed {
                    drop(turn_lease);
                    // The original accepted turn may already be finished. Reusing TurnStarted for
                    // a durable receipt replay would fabricate a running turn in every frontend;
                    // the protocol adapter verifies the receipt directly after submit instead.
                    return Ok(());
                }
                let activity_was_persisted = self.state.store.is_some();
                if !turn_lease.commit_running(running_activity, activity_was_persisted) {
                    self.emit(Event::Error {
                        session: Some(session),
                        message: "couldn't publish accepted turn activity".into(),
                        terminal: true,
                        request_id,
                    });
                    return Ok(());
                }
                if let Some(title) = title.as_deref() {
                    self.set_initial_title(&session, title);
                }
                self.emit(Event::TurnStarted {
                    session: session.clone(),
                    request_id: request_id.clone(),
                    transcript_seq,
                });

                // Resolve the session first so the compiler has the workspace: project rules and
                // `@`-mentioned file contents are pulled in relative to the session's cwd.
                let looked = {
                    let map = self.state.sessions.lock().unwrap();
                    map.get(&session)
                        .map(|r| (r.client.clone(), r.acp_session_id.clone(), r.cwd.clone()))
                };
                // A session picked from the rail can predate this process — runtimes die with the
                // app, the store doesn't. Revive it instead of stranding it.
                let (client, mut acp_sid, cwd) = match looked {
                    Some(l) => l,
                    None => match self.revive_session(&session).await {
                        Ok(l) => l,
                        Err(message) => {
                            turn_lease.fail_provider(message.clone());
                            self.emit(Event::Error {
                                session: Some(session),
                                message,
                                terminal: true,
                                request_id,
                            });
                            return Ok(());
                        }
                    },
                };
                // `cwd` is consumed by `session/new` below; keep a copy for reading attachments.
                let cwd_for_images = cwd.clone();

                let mut compiled = match canvas_preflight {
                    Some(compiled) => compiled,
                    None => {
                        let lib = self.state.skills.lock().unwrap();
                        // `@`-mentioned past chats resolve against the store; without one (tests,
                        // in-memory runs) they surface as unresolved rather than silently vanishing.
                        let resolve = |id: &str| -> Option<String> {
                            self.referenced_session_context(id).ok().flatten()
                        };
                        compile_with_sessions(
                            &doc,
                            &lib,
                            Some(std::path::Path::new(&cwd)),
                            Some(&resolve),
                        )
                    }
                };
                // Scene preamble (R8): guardrails, inline fragments, artifact-capture and clarify
                // instructions of the session's persisted active scene, injected AFTER project
                // rules and BEFORE the user's document. An unresolvable reference degrades to no
                // preamble — never an error.
                let scene_preamble = self.state.store.as_ref().and_then(|store| {
                    let (scene_ref, _) = store.session_scene(&session).ok().flatten()?;
                    let scenes = self.state.scenes.lock().unwrap().clone();
                    let entry = scenes.resolve(&scene_ref)?;
                    // R9: a stage-bound session compiles its stage's `carry` list against the
                    // newest stored versions on every prompt — the artifact store, not session
                    // memory, is the inter-stage contract. Unbound sessions carry nothing.
                    let carried: Vec<crate::scene::CarriedArtifact> = store
                        .session_pipeline(&session)
                        .ok()
                        .flatten()
                        .and_then(|(instance_id, stage_id)| {
                            let instance =
                                store.get_pipeline_instance(&instance_id).ok().flatten()?;
                            let pipeline = scenes.resolve_pipeline(&instance.pipeline_ref)?;
                            let stage = pipeline
                                .pipeline
                                .stages
                                .iter()
                                .find(|stage| stage.id == stage_id)?;
                            let artifacts = self.state.scene_artifacts.lock().unwrap().clone()?;
                            Some(artifacts.resolve_carry(&instance_id, stage))
                        })
                        .unwrap_or_default();
                    let preamble = crate::scene::prompt_preamble(&entry.scene, &carried);
                    (!preamble.trim().is_empty()).then_some(preamble)
                });
                if let Some(preamble) = scene_preamble {
                    // The compiler emits `rules ⧺ "\n\n" ⧺ rest`; splice the preamble between the
                    // two so project rules stay first, exactly as the normative order requires.
                    let rules_context =
                        crate::rules::to_context(&crate::rules::load(std::path::Path::new(&cwd)));
                    if compiled.prompt.is_empty() {
                        compiled.prompt = preamble;
                    } else if !rules_context.is_empty()
                        && compiled.prompt.starts_with(&rules_context)
                    {
                        let rest = compiled.prompt[rules_context.len()..].to_string();
                        compiled.prompt = format!(
                            "{rules_context}\n\n{preamble}{}",
                            if rest.is_empty() {
                                String::new()
                            } else {
                                format!("\n\n{}", rest.trim_start_matches('\n'))
                            }
                        );
                    } else {
                        compiled.prompt = format!("{preamble}\n\n{}", compiled.prompt);
                    }
                }
                let current_provider = {
                    let sessions = self.state.sessions.lock().unwrap();
                    sessions
                        .get(&session)
                        .map(|runtime| runtime.session.provider.clone())
                        .unwrap_or_else(|| ProviderId::Custom("unknown".into()))
                };
                let is_codex = current_provider == ProviderId::Codex;
                if let Some(config) = &self.state.desktop_mcp {
                    let server = config.scene_server_for_session(&session);
                    if !compiled
                        .mcp_servers
                        .iter()
                        .any(|candidate| candidate.name == server.name)
                    {
                        compiled.mcp_servers.push(server);
                    }
                    if is_codex {
                        let server = config.browser_server_for_session(&session);
                        if !compiled
                            .mcp_servers
                            .iter()
                            .any(|candidate| candidate.name == server.name)
                        {
                            compiled.mcp_servers.push(server);
                        }
                    }
                }
                for id in &compiled.unresolved {
                    self.emit(Event::Error {
                        session: Some(session.clone()),
                        message: format!("unresolved: {id}"),
                        terminal: false,
                        request_id: request_id.clone(),
                    });
                }
                let memory_turn = self.state.memory.as_ref().and_then(|memory| {
                    match memory.recall(&cwd, &session, &memory_source) {
                        Ok(turn) => turn,
                        Err(e) => {
                            tracing::warn!("load memory context failed: {e}");
                            None
                        }
                    }
                });
                let memory_context = memory_turn
                    .as_ref()
                    .map(|turn| turn.context().clone())
                    .unwrap_or_default();
                let provider_prompt = if memory_context.block.is_empty() {
                    compiled.prompt.clone()
                } else {
                    format!("{}\n\n{}", memory_context.block, compiled.prompt)
                };
                let auto_scene_instructions = self.state.store.as_ref().and_then(|store| {
                    store
                        .session_auto_scene(&session)
                        .ok()
                        .filter(|enabled| *enabled)?;
                    let current = store
                        .session_scene(&session)
                        .ok()
                        .flatten()
                        .map(|(reference, _)| reference);
                    let scenes = self.state.scenes.lock().unwrap().clone();
                    Some(auto_scene_routing_instructions(&scenes, current.as_deref()))
                });
                let provider_prompt =
                    with_auto_scene_routing(provider_prompt, auto_scene_instructions);
                let provider_prompt = with_codetwo_browser_routing(
                    provider_prompt,
                    is_codex && self.state.desktop_mcp.is_some(),
                );
                let provider_prompt = with_codex_sites_routing(provider_prompt, is_codex);
                let provenance = MemoryTurnProvenance {
                    used_mcp: !compiled.mcp_servers.is_empty(),
                    used_files: !compiled.files.is_empty(),
                    used_images: !compiled.images.is_empty(),
                    used_session_refs: !compiled.sessions.is_empty(),
                    used_web: doc.iter().any(|block| {
                        matches!(block, crate::skill::DocBlock::Text { text }
                            if text.contains("**Browser context**"))
                    }),
                    used_tools: false,
                    used_recalled_memory: !memory_context.items.is_empty(),
                    canvas_refs: compiled
                        .canvases
                        .iter()
                        .map(|canvas| MemoryCanvasRef {
                            id: canvas.payload.id.clone(),
                            revision: canvas.payload.revision,
                        })
                        .collect(),
                };
                let (caps, attached_mcp) = {
                    let map = self.state.sessions.lock().unwrap();
                    map.get(&session)
                        .map(|runtime| (runtime.caps, runtime.mcp_servers.clone()))
                        .unwrap_or_default()
                };
                if acp_sid.is_some() {
                    let late = compiled
                        .mcp_servers
                        .iter()
                        .find(|server| !attached_mcp.contains(server));
                    if let Some(server) = late {
                        let message = format!(
                            "MCP server '{}' must be attached when the session starts; open a new session to use it",
                            server.name
                        );
                        turn_lease.fail_provider(message.clone());
                        self.emit(Event::Error {
                            session: Some(session),
                            message,
                            terminal: true,
                            request_id,
                        });
                        return Ok(());
                    }
                }
                let mcp = match encode_mcp_servers(&compiled.mcp_servers, caps) {
                    Ok(mcp) => mcp,
                    Err(message) => {
                        turn_lease.fail_provider(message.clone());
                        self.emit(Event::Error {
                            session: Some(session),
                            message,
                            terminal: true,
                            request_id,
                        });
                        return Ok(());
                    }
                };
                // The canonical prompt was already persisted atomically with Running activity.
                // Attach Memory's receipt to that same sequence instead of writing a duplicate user
                // part; the transient recalled block remains provider-only context.
                if let (Some(memory), Some(turn), Some(seq)) =
                    (&self.state.memory, &memory_turn, transcript_seq)
                {
                    match memory.receipt(turn, &cwd, &session, seq, &memory_source) {
                        Ok(Some(receipt)) => self.emit(Event::MemoryContext {
                            session: session.clone(),
                            receipt,
                        }),
                        Ok(None) => {}
                        Err(e) => tracing::warn!("persist memory receipt failed: {e}"),
                    }
                }

                // Auto-checkpoint the workspace before the turn (best-effort), t3code-style: a
                // hidden git ref you can diff/revert to later.
                {
                    let cp_cwd = cwd.clone();
                    let cp_msg = format!(
                        "before turn: {}",
                        compiled.prompt.chars().take(60).collect::<String>()
                    );
                    tokio::spawn(async move {
                        let p = std::path::Path::new(&cp_cwd);
                        if crate::git::is_repo(p).await {
                            let _ = crate::git::checkpoint(p, &cp_msg).await;
                        }
                    });
                }

                // A revived session first tries to re-attach the previous process's ACP session
                // (`session/load`) so the agent's own context survives the restart — the
                // t3code-style resume cursor. Gated on the agent advertising `loadSession`;
                // anything else falls through to `session/new` below.
                if acp_sid.is_none() {
                    let resume = {
                        let map = self.state.sessions.lock().unwrap();
                        map.get(&session).and_then(|r| {
                            r.caps
                                .load_session
                                .then(|| r.resume_acp_session_id.clone())
                                .flatten()
                                .map(|id| (id, r.replaying.clone()))
                        })
                    };
                    if let Some((resume_id, replaying)) = resume {
                        // The agent replays the whole history before answering; the handler drops
                        // it (it's already in the store and on screen).
                        replaying.store(true, Ordering::SeqCst);
                        let loaded = client
                            .load_session(&resume_id, cwd.clone(), mcp.clone())
                            .await;
                        replaying.store(false, Ordering::SeqCst);
                        match loaded {
                            Ok(resp) => {
                                let mut restored_options = resp
                                    .config_options
                                    .as_deref()
                                    .map(|options| {
                                        provider_config_option_infos(&current_provider, options)
                                    })
                                    .unwrap_or_default();
                                if !restored_options.iter().any(|option| {
                                    option.category.as_deref() == Some("thought_level")
                                }) {
                                    if let Some(option) =
                                        reasoning_option_from_models(resp.models.as_ref())
                                    {
                                        restored_options.push(option);
                                    }
                                }
                                let (models, current, options) = {
                                    let mut map = self.state.sessions.lock().unwrap();
                                    let mut models = Vec::new();
                                    let mut current = String::new();
                                    if let Some(r) = map.get_mut(&session) {
                                        r.acp_session_id = Some(resume_id.clone());
                                        r.session.acp_session_id = Some(resume_id.clone());
                                        r.resume_acp_session_id = None;
                                        r.mcp_servers = compiled.mcp_servers.clone();
                                        if let Some(m) = &resp.models {
                                            r.models = m
                                                .available_models
                                                .iter()
                                                .map(|x| ModelChoice {
                                                    id: x.model_id.clone(),
                                                    name: x.name.clone(),
                                                    description: x.description.clone(),
                                                })
                                                .collect();
                                            r.models_reported = true;
                                            current = m.current_model_id.clone();
                                        }
                                        models = r.models.clone();
                                        r.config_options = restored_options.clone();
                                    }
                                    (models, current, restored_options)
                                };
                                if !models.is_empty() {
                                    self.emit(Event::Models {
                                        session: session.clone(),
                                        available: models,
                                        current,
                                    });
                                }
                                if !options.is_empty() {
                                    self.emit(Event::ConfigOptions {
                                        session: session.clone(),
                                        options,
                                    });
                                }
                                acp_sid = Some(resume_id);
                            }
                            Err(e) => {
                                // The cursor is dead (agent pruned the session, different install,
                                // …). Fall back to `session/new`, and say so — the transcript is
                                // kept, but the agent's memory of it is not. Never degrade
                                // silently.
                                {
                                    let mut map = self.state.sessions.lock().unwrap();
                                    if let Some(r) = map.get_mut(&session) {
                                        r.resume_acp_session_id = None;
                                    }
                                }
                                self.emit(Event::Error {
                                    session: Some(session.clone()),
                                    message: format!(
                                        "couldn't restore this session's saved context (session/load: {e}); \
                                         the transcript is kept, but the agent is starting with a fresh memory"
                                    ),
                                    terminal: false,
                                    request_id: request_id.clone(),
                                });
                            }
                        }
                    }
                }

                // Lazily create the ACP session on the first prompt, attaching the document's MCP
                // servers at `session/new`.
                if acp_sid.is_none() {
                    match client.new_session_full(cwd, mcp).await {
                        Ok(resp) => {
                            let id = resp.session_id;
                            // Models are optional in ACP and reported only here, so this is the one
                            // chance to learn them.
                            let reported: Vec<ModelChoice> = resp
                                .models
                                .as_ref()
                                .map(|m| {
                                    m.available_models
                                        .iter()
                                        .map(|x| ModelChoice {
                                            id: x.model_id.clone(),
                                            name: x.name.clone(),
                                            description: x.description.clone(),
                                        })
                                        .collect()
                                })
                                .unwrap_or_default();
                            let mut current = resp
                                .models
                                .as_ref()
                                .map(|m| m.current_model_id.clone())
                                .unwrap_or_default();

                            // The newer config-options surface: model selector + thought level.
                            let mut options = resp
                                .config_options
                                .as_deref()
                                .map(|options| {
                                    provider_config_option_infos(&current_provider, options)
                                })
                                .unwrap_or_default();
                            if !options
                                .iter()
                                .any(|option| option.category.as_deref() == Some("thought_level"))
                            {
                                if let Some(option) =
                                    reasoning_option_from_models(resp.models.as_ref())
                                {
                                    options.push(option);
                                }
                            }
                            let option_model = current_model_from_options(&options);

                            // A model chosen before this point had no ACP session to be sent to,
                            // so the choice is still only ours. Apply it below.
                            let (models, pending) = {
                                let mut map = self.state.sessions.lock().unwrap();
                                let pending =
                                    map.get(&session).and_then(|r| r.session.model.clone());
                                let models = if let Some(r) = map.get_mut(&session) {
                                    r.acp_session_id = Some(id.clone());
                                    r.session.acp_session_id = Some(id.clone());
                                    r.mcp_servers = compiled.mcp_servers.clone();
                                    if !reported.is_empty() {
                                        r.models = reported;
                                        r.models_reported = true;
                                    }
                                    if let Some(m) = &option_model {
                                        r.session.model = Some(m.clone());
                                    }
                                    r.models.clone()
                                } else {
                                    Vec::new()
                                };
                                if let Some(store) = &self.state.store {
                                    if let Some(r) = map.get(&session) {
                                        let _ = store.upsert_session(&r.session);
                                    }
                                }
                                (models, pending)
                            };

                            // Current Codex accepts the same flat variant ids exposed by its model
                            // catalogue even though it also reports split model/effort selectors.
                            // Preserve a deliberate pre-session choice there; retain the old
                            // provider-owned-selector behavior for adapters we have not verified.
                            let pending = pending.filter(|_| option_model.is_none() || is_codex);
                            if let Some(want) = pending.filter(|m| *m != current) {
                                match client.set_model(&id, &want).await {
                                    Ok(()) => {
                                        current = want.clone();
                                        reflect_flat_model_in_options(&mut options, &want);
                                        let mut map = self.state.sessions.lock().unwrap();
                                        if let Some(r) = map.get_mut(&session) {
                                            r.session.model = Some(want);
                                            if let Some(store) = &self.state.store {
                                                let _ = store.upsert_session(&r.session);
                                            }
                                        }
                                    }
                                    // Not fatal — the turn runs on whatever the CLI is configured
                                    // for. Say so rather than leave the chip claiming otherwise.
                                    Err(e) => {
                                        let mut map = self.state.sessions.lock().unwrap();
                                        if let Some(r) = map.get_mut(&session) {
                                            r.session.model =
                                                (!current.is_empty()).then(|| current.clone());
                                        }
                                        drop(map);
                                        self.emit(Event::Error {
                                            session: Some(session.clone()),
                                            message: format!("{want} wasn't accepted: {e}"),
                                            terminal: false,
                                            request_id: request_id.clone(),
                                        });
                                    }
                                }
                            }

                            if let Some(runtime) =
                                self.state.sessions.lock().unwrap().get_mut(&session)
                            {
                                runtime.config_options = options.clone();
                            }

                            if !models.is_empty() {
                                self.emit(Event::Models {
                                    session: session.clone(),
                                    available: models,
                                    current,
                                });
                            }
                            if !options.is_empty() {
                                self.emit(Event::ConfigOptions {
                                    session: session.clone(),
                                    options,
                                });
                            }
                            acp_sid = Some(id);
                        }
                        Err(e) => {
                            let message = e.to_string();
                            turn_lease.fail_provider(message.clone());
                            self.emit(Event::Error {
                                session: Some(session),
                                message,
                                terminal: true,
                                request_id,
                            });
                            return Ok(());
                        }
                    }
                }
                let acp_sid = acp_sid.expect("acp session id set above");
                let events = self.state.events.clone();
                let sess_for_task = session.clone();
                let images_cwd = cwd_for_images;
                let turn_store = self.state.store.clone();
                let turn_memory = self.state.memory.clone();
                let memory_project = images_cwd.clone();
                // Scene artifact auto-capture context (R8), resolved now so the spawned turn task
                // carries plain handles instead of engine references. Best-effort by design:
                // no active scene, no declared artifacts, or no capture layer all mean "skip".
                let scene_capture = self.state.store.as_ref().and_then(|store| {
                    let (scene_ref, _) = store.session_scene(&session).ok().flatten()?;
                    let scenes = self.state.scenes.lock().unwrap().clone();
                    let entry = scenes.resolve(&scene_ref)?;
                    let specs = entry.scene.artifacts.clone();
                    let artifacts = self.state.scene_artifacts.lock().unwrap().clone()?;
                    (!specs.is_empty()).then_some((scene_ref, specs, artifacts))
                });
                let mut canvas_image_blocks = Vec::new();
                for canvas in &compiled.canvases {
                    match lower_canvas_prompt_payload(
                        &canvas.payload,
                        canvas.reference.pixel_policy,
                        CanvasProviderImageCapability::Unknown,
                    ) {
                        Ok(lowered) => canvas_image_blocks.extend(lowered.into_iter().skip(1)),
                        Err(error) => {
                            let message = error.to_string();
                            turn_lease.fail_provider(message.clone());
                            self.emit(Event::Error {
                                session: Some(session),
                                message,
                                terminal: true,
                                request_id,
                            });
                            return Ok(());
                        }
                    }
                }
                tokio::spawn(async move {
                    let mut blocks = vec![ContentBlock::text(provider_prompt)];
                    // Attached images ride along as ACP image content blocks.
                    for path in &compiled.images {
                        if let Ok((mime_type, data)) = crate::workspace::read_image_base64(
                            std::path::Path::new(&images_cwd),
                            path,
                        ) {
                            blocks.push(ContentBlock::Image { data, mime_type });
                        }
                    }
                    // Canvas exports are already normalized and ordered. Unknown provider
                    // capability intentionally attempted every image above; any provider failure
                    // remains visible through the ACP error path.
                    blocks.extend(canvas_image_blocks);
                    match client.prompt(&acp_sid, blocks).await {
                        Ok(stop) => {
                            // A cancelled turn is intentionally incomplete; do not memorialize its
                            // partial outcome or index it as a completed answer. Other terminal stop
                            // reasons still describe a completed provider response, even when it was
                            // bounded or refused.
                            if stop != StopReason::Cancelled {
                                if let Some(store) = turn_store {
                                    if let Err(error) = store.finalize_agent_search(&sess_for_task)
                                    {
                                        tracing::warn!(
                                            "finalize conversation search failed: {error}"
                                        );
                                    }
                                    if let (Some(memory), Some(turn), Some(seq)) =
                                        (&turn_memory, &memory_turn, transcript_seq)
                                    {
                                        if let Err(e) = memory.complete_turn(
                                            turn,
                                            &memory_project,
                                            &sess_for_task,
                                            &memory_source,
                                            seq,
                                            provenance,
                                        ) {
                                            tracing::warn!("capture memory failed: {e}");
                                        }
                                    }
                                    // Scene artifact auto-capture (R8): scan the turn's agent
                                    // text for declared `artifact:<id>` fenced blocks (the
                                    // convention the preamble teaches), record each version, and
                                    // announce it before TurnEnded so exit evaluation sees it.
                                    if let (Some((scene_ref, specs, artifacts)), Some(seq)) =
                                        (scene_capture, transcript_seq)
                                    {
                                        let agent_text: String = store
                                            .transcript_with_seq(&sess_for_task)
                                            .unwrap_or_default()
                                            .into_iter()
                                            .filter(|(part_seq, role, _)| {
                                                *part_seq > seq && *role == Role::Agent
                                            })
                                            .filter_map(|(_, _, part)| match part {
                                                Part::Text { text } => Some(text),
                                                _ => None,
                                            })
                                            .collect();
                                        for (id, content) in
                                            crate::scene_artifact::extract_artifact_blocks(
                                                &agent_text,
                                                &specs,
                                            )
                                        {
                                            let Some(spec) =
                                                specs.iter().find(|spec| spec.id == id)
                                            else {
                                                continue;
                                            };
                                            match artifacts.record(
                                                &scene_ref,
                                                spec,
                                                &sess_for_task,
                                                None,
                                                &content,
                                            ) {
                                                Ok(record) => {
                                                    let _ = events.send(Event::ArtifactProduced {
                                                        session: sess_for_task.clone(),
                                                        scene_ref: scene_ref.clone(),
                                                        artifact_key: record.artifact_key,
                                                        kind: record.kind,
                                                        version: record.version,
                                                        record_id: record.id,
                                                    });
                                                }
                                                Err(error) => tracing::warn!(
                                                    "scene artifact capture failed: {error}"
                                                ),
                                            }
                                        }
                                    }
                                }
                            }
                            turn_lease.finish_success();
                            let _ = events.send(Event::TurnEnded {
                                session: sess_for_task,
                                stop_reason: format!("{stop:?}"),
                            });
                        }
                        Err(e) => {
                            let message = e.to_string();
                            turn_lease.fail_provider(message.clone());
                            let _ = events.send(Event::Error {
                                session: Some(sess_for_task),
                                message,
                                terminal: true,
                                request_id,
                            });
                        }
                    }
                });
            }

            Op::Cancel { session } => {
                self.state.activity.cancel_pending(&session);
                let map = self.state.sessions.lock().unwrap();
                if let Some(rt) = map.get(&session) {
                    if let Some(acp_sid) = &rt.acp_session_id {
                        let _ = rt.client.cancel(acp_sid);
                    }
                }
            }

            Op::AnswerPermission {
                session,
                request_id,
                option_id,
            } => {
                self.answer_permission(&session, &request_id, option_id.as_deref());
            }

            Op::AnswerElicitation {
                session,
                request_id,
                answer,
            } => {
                self.answer_elicitation(&session, &request_id, answer);
            }

            Op::SetPermissionMode { session, mode } => {
                self.handle_execution_policy_update(session, Some(mode), None, None);
            }

            Op::SetSandbox { session, sandbox } => {
                self.handle_execution_policy_update(session, None, Some(sandbox), None);
            }

            Op::SetExecutionPolicy {
                session,
                mode,
                sandbox,
                request_id,
            } => {
                self.handle_execution_policy_update(session, Some(mode), Some(sandbox), request_id);
            }

            Op::SetModel { session, model } => {
                // Tell the agent, then record it. Storing it without the ACP call would leave the
                // UI claiming a model the agent never switched to. Before the first prompt there's
                // no ACP session to tell, so the choice is just recorded and `session/new` sends it.
                let live = {
                    let map = self.state.sessions.lock().unwrap();
                    map.get(&session).map(|runtime| {
                        (
                            runtime.client.clone(),
                            runtime.acp_session_id.clone(),
                            runtime.session.clone(),
                            runtime.models.clone(),
                        )
                    })
                };
                if let Some((client, Some(acp_sid), _, _)) = live.as_ref() {
                    if let Err(e) = client.set_model(&acp_sid, &model).await {
                        // t3code's `requiresNewThreadForModelChange` honesty: the agent can't
                        // change models mid-conversation, so say what *would* work instead of
                        // leaving a bare protocol error.
                        self.emit(Event::Error {
                            session: Some(session),
                            message: format!(
                                "this agent can't switch models mid-session ({e}); start a new session to use {model}"
                            ),
                            terminal: false,
                            request_id: None,
                        });
                        return Ok(());
                    }
                }
                let (mut updated, available, was_live) = match live {
                    Some((_, _, stored_session, models)) => (stored_session, models, true),
                    None => match &self.state.store {
                        Some(store) => match store.get_session(&session) {
                            Ok(Some(stored_session)) => {
                                let models = match self
                                    .state
                                    .providers
                                    .iter()
                                    .find(|provider| provider.id == stored_session.provider)
                                    .cloned()
                                {
                                    Some(provider) => available_models(&provider).await,
                                    None => builtin_models(&stored_session.provider),
                                };
                                (stored_session, models, false)
                            }
                            Ok(None) => {
                                self.emit(Event::Error {
                                    session: Some(session),
                                    message: "couldn't change model: no such session".into(),
                                    terminal: false,
                                    request_id: None,
                                });
                                return Ok(());
                            }
                            Err(error) => {
                                self.emit(Event::Error {
                                    session: Some(session),
                                    message: format!(
                                        "couldn't load session to change model: {error}"
                                    ),
                                    terminal: false,
                                    request_id: None,
                                });
                                return Ok(());
                            }
                        },
                        None => {
                            self.emit(Event::Error {
                                session: Some(session),
                                message: "couldn't change model: no such session".into(),
                                terminal: false,
                                request_id: None,
                            });
                            return Ok(());
                        }
                    },
                };
                updated.model = Some(model.clone());
                if let Some(store) = &self.state.store {
                    if let Err(error) = store.upsert_session(&updated) {
                        self.emit(Event::Error {
                            session: Some(session),
                            message: format!("couldn't persist model change: {error}"),
                            terminal: false,
                            request_id: None,
                        });
                        return Ok(());
                    }
                }
                if was_live {
                    if let Some(runtime) = self.state.sessions.lock().unwrap().get_mut(&session) {
                        runtime.session.model = Some(model.clone());
                    }
                }
                self.emit(Event::Models {
                    session,
                    available,
                    current: model,
                });
            }

            Op::SetConfigOption {
                session,
                config_id,
                value,
            } => {
                let target = {
                    let map = self.state.sessions.lock().unwrap();
                    map.get(&session).map(|r| {
                        (
                            r.client.clone(),
                            r.acp_session_id.clone(),
                            r.session.provider.clone(),
                            r.config_options.clone(),
                        )
                    })
                };
                let Some((client, Some(acp_sid), provider, previous_options)) = target else {
                    // No live ACP session yet (fresh or resumed): nothing to switch on. The UI's
                    // pickers are populated by the agent, so this is a "try again after the first
                    // prompt" state, not a crash.
                    self.emit(Event::Error {
                        session: Some(session),
                        message: format!("can't set {config_id} before the session's first prompt"),
                        terminal: false,
                        request_id: None,
                    });
                    return Ok(());
                };

                // Grok's current ACP extension advertises effort in ModelInfo metadata and uses
                // the legacy mode method to change it. Keep the generic frontend contract while
                // sending the method this provider actually implements.
                if provider == ProviderId::Grok && config_id == "reasoning_effort" {
                    match client.set_mode(&acp_sid, &value).await {
                        Ok(()) => {
                            let mut options = previous_options;
                            if let Some(option) = options.iter_mut().find(|option| {
                                option.id == config_id
                                    && option.choices.iter().any(|choice| choice.id == value)
                            }) {
                                option.current = value;
                            }
                            if let Some(runtime) =
                                self.state.sessions.lock().unwrap().get_mut(&session)
                            {
                                runtime.config_options = options.clone();
                            }
                            self.emit(Event::ConfigOptions { session, options });
                        }
                        Err(e) => self.emit(Event::Error {
                            session: Some(session),
                            message: format!("reasoning effort can't be changed here: {e}"),
                            terminal: false,
                            request_id: None,
                        }),
                    }
                    return Ok(());
                }

                match client.set_config_option(&acp_sid, &config_id, &value).await {
                    Ok(options) => {
                        let options = provider_config_option_infos(&provider, &options);
                        {
                            let mut map = self.state.sessions.lock().unwrap();
                            if let Some(rt) = map.get_mut(&session) {
                                rt.config_options = options.clone();
                                if let Some(model) = current_model_from_options(&options) {
                                    rt.session.model = Some(model);
                                    if let Some(store) = &self.state.store {
                                        let _ = store.upsert_session(&rt.session);
                                    }
                                }
                            }
                        }
                        // Echo the agent's authoritative set even if empty — the UI un-does its
                        // optimistic selection from this.
                        self.emit(Event::ConfigOptions { session, options });
                    }
                    Err(e) => {
                        self.emit(Event::Error {
                            session: Some(session),
                            message: format!("{config_id} can't be changed here: {e}"),
                            terminal: false,
                            request_id: None,
                        });
                    }
                }
            }
        }
        Ok(())
    }

    fn emit(&self, event: Event) {
        let _ = self.state.events.send(event);
    }
}

/// Materialize and attach a session worktree without involving an ACP provider. Keeping this seam
/// separate makes the Git mutation independently testable and ensures the Session is only changed
/// after `git worktree add` has succeeded.
#[derive(Debug)]
struct PreparedSessionWorktree {
    hook_errors: Vec<(String, String)>,
    repo_root: std::path::PathBuf,
    worktree: crate::worktree::Worktree,
}

#[cfg(test)]
async fn prepare_session_worktree(
    source: &std::path::Path,
    session: &mut Session,
    baseline: WorktreeBaseline,
) -> std::io::Result<Vec<(String, String)>> {
    Ok(
        prepare_session_worktree_with_expected_sha(source, session, baseline, None)
            .await?
            .hook_errors,
    )
}

async fn prepare_session_worktree_with_expected_sha(
    source: &std::path::Path,
    session: &mut Session,
    baseline: WorktreeBaseline,
    expected_sha: Option<&str>,
) -> std::io::Result<PreparedSessionWorktree> {
    let source = source.canonicalize()?;
    let repo_root = crate::worktree::repo_root(&source).await?;
    let relative = source.strip_prefix(&repo_root).map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!(
                "selected directory {} is outside repository {}",
                source.display(),
                repo_root.display()
            ),
        )
    })?;
    let common_dir = crate::worktree::common_dir(&repo_root).await?;
    let resolved = crate::worktree::resolve_baseline(&repo_root, baseline).await?;
    if let Some(expected_sha) = expected_sha {
        if resolved.sha != expected_sha {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!(
                    "worktree baseline changed after preview: expected {expected_sha}, found {}; refresh the baseline picker and try again",
                    resolved.sha
                ),
            ));
        }
    }
    let worktree =
        crate::worktree::add_for_session_from_baseline(&repo_root, &session.id, &resolved).await?;
    let git_dir = match crate::worktree::git_dir(&worktree.path).await {
        Ok(git_dir) => git_dir,
        Err(error) => rollback_failed_worktree(&repo_root, &worktree, &resolved.sha, error).await?,
    };
    let selected = worktree.path.join(relative);
    let selected = match selected.canonicalize() {
        Ok(path) if path.is_dir() => path,
        Ok(path) => {
            let error = std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("worktree directory {} is not a directory", path.display()),
            );
            rollback_failed_worktree(&repo_root, &worktree, &resolved.sha, error).await?
        }
        Err(error) => rollback_failed_worktree(&repo_root, &worktree, &resolved.sha, error).await?,
    };
    let hook_errors = crate::project::run_worktree_hooks(&selected)
        .await
        .into_iter()
        .filter_map(|(id, result)| result.err().map(|error| (id, error)))
        .collect();

    // Hooks may mutate Git as well as files. Re-establish the exact checkout identity after every
    // hook before making this worktree durable; an exit status of zero does not prove it stayed put.
    let selected = match validate_prepared_worktree(
        &common_dir,
        Some(&git_dir),
        &worktree,
        relative,
        &resolved.sha,
    )
    .await
    {
        Ok(selected) => selected,
        Err(message) => {
            let error = std::io::Error::other(message);
            rollback_failed_worktree(&repo_root, &worktree, &resolved.sha, error).await?
        }
    };

    // Transfer ownership to the durable session only after the checkout and selected directory are
    // both usable. Until here, every failure leaves the caller's Session unchanged.
    session.project_path = Some(source.to_string_lossy().into_owned());
    session.cwd = selected.to_string_lossy().into_owned();
    session.worktree_path = Some(worktree.path.to_string_lossy().into_owned());
    session.worktree_identity = Some(worktree.directory_identity().clone());
    session.worktree_common_dir = Some(common_dir.to_string_lossy().into_owned());
    session.worktree_git_dir = Some(git_dir.to_string_lossy().into_owned());
    session.worktree_baseline = Some(resolved);
    Ok(PreparedSessionWorktree {
        hook_errors,
        repo_root,
        worktree,
    })
}

async fn validate_registered_worktree(
    common_dir: &std::path::Path,
    expected_git_dir: Option<&std::path::Path>,
    root: &std::path::Path,
    expected_branch: Option<&str>,
    expected_sha: Option<&str>,
) -> Result<std::path::PathBuf, String> {
    let metadata = std::fs::symlink_metadata(root).map_err(|error| {
        format!(
            "session worktree is unavailable at {}: {error}",
            root.display()
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(format!(
            "session worktree root is not the recorded directory: {}",
            root.display()
        ));
    }
    let root = std::fs::canonicalize(root)
        .map_err(|error| format!("couldn't canonicalize session worktree: {error}"))?;
    let common_dir = std::fs::canonicalize(common_dir)
        .map_err(|error| format!("session repository identity is unavailable: {error}"))?;
    let actual_common = crate::worktree::common_dir(&root)
        .await
        .map_err(|error| format!("couldn't identify session repository: {error}"))?;
    if actual_common != common_dir {
        return Err(format!(
            "session worktree belongs to {}, expected repository {}",
            actual_common.display(),
            common_dir.display()
        ));
    }
    if let Some(expected_git_dir) = expected_git_dir {
        let expected_git_dir = std::fs::canonicalize(expected_git_dir)
            .map_err(|error| format!("session worktree identity is unavailable: {error}"))?;
        let actual_git_dir = crate::worktree::git_dir(&root)
            .await
            .map_err(|error| format!("couldn't identify exact session worktree: {error}"))?;
        if actual_git_dir != expected_git_dir {
            return Err(format!(
                "session worktree identity changed: expected {}, found {}",
                expected_git_dir.display(),
                actual_git_dir.display()
            ));
        }
    }

    let registrations = crate::worktree::registrations_from_common_dir(&common_dir)
        .await
        .map_err(|error| format!("couldn't verify session worktree: {error}"))?;
    let registration = registrations.iter().find(|registration| {
        std::fs::canonicalize(&registration.path)
            .map(|path| path == root)
            .unwrap_or(false)
    });
    let Some(registration) = registration else {
        return Err(format!(
            "session worktree is no longer registered: {}",
            root.display()
        ));
    };
    if let Some(expected_branch) = expected_branch {
        let expected_ref = format!("refs/heads/{expected_branch}");
        if registration.branch.as_deref() != Some(expected_ref.as_str()) {
            return Err(format!(
                "session worktree branch mismatch at {}: expected {}, found {}",
                root.display(),
                expected_ref,
                registration.branch.as_deref().unwrap_or("detached HEAD")
            ));
        }
    }
    if let Some(expected_sha) = expected_sha {
        let actual_sha = crate::worktree::head_commit(&root)
            .await
            .map_err(|error| format!("couldn't verify session worktree commit: {error}"))?;
        if actual_sha != expected_sha {
            return Err(format!(
                "session worktree commit changed during creation: expected {expected_sha}, found {actual_sha}"
            ));
        }
    }
    Ok(root)
}

async fn validate_prepared_worktree(
    common_dir: &std::path::Path,
    git_dir: Option<&std::path::Path>,
    worktree: &crate::worktree::Worktree,
    relative: &std::path::Path,
    expected_sha: &str,
) -> Result<std::path::PathBuf, String> {
    if !worktree
        .still_owns_path()
        .map_err(|error| format!("couldn't verify worktree path ownership: {error}"))?
    {
        return Err(format!(
            "session worktree path identity changed during setup: {}",
            worktree.path.display()
        ));
    }
    let root = validate_registered_worktree(
        common_dir,
        git_dir,
        &worktree.path,
        Some(&worktree.branch),
        Some(expected_sha),
    )
    .await?;
    let selected = std::fs::canonicalize(root.join(relative))
        .map_err(|error| format!("session working directory changed during setup: {error}"))?;
    if !selected.is_dir() || !selected.starts_with(&root) {
        return Err(format!(
            "session working directory {} is outside its worktree {}",
            selected.display(),
            root.display()
        ));
    }
    Ok(selected)
}

async fn validate_session_checkout(session: &Session) -> Result<(), String> {
    if session.worktree_discarded {
        return Err(
            "session worktree was permanently discarded; start a new session from the source project"
                .into(),
        );
    }
    let cwd = std::path::Path::new(&session.cwd);
    if !cwd.is_dir() {
        return Err(format!(
            "session working directory is unavailable: {}",
            cwd.display()
        ));
    }
    let Some(stored_root) = session.worktree_path.as_deref() else {
        return Ok(());
    };
    let root_path = std::path::Path::new(stored_root);
    if let Some(identity) = session.worktree_identity.as_ref() {
        let still_matches = identity.matches_path(root_path).map_err(|error| {
            format!(
                "couldn't verify session worktree path identity at {}: {error}",
                root_path.display()
            )
        })?;
        if !still_matches {
            return Err(format!(
                "session worktree path identity changed at {}; refusing to run the provider in a replacement directory",
                root_path.display()
            ));
        }
    }
    // Legacy rows have no filesystem receipt. Keep their narrower path/Git registry checks below
    // for compatibility, but never treat them as proof that this is the directory originally
    // created for the session.
    let root = std::fs::canonicalize(root_path)
        .map_err(|error| format!("session worktree is unavailable at {stored_root}: {error}"))?;
    let selected = std::fs::canonicalize(cwd).map_err(|error| {
        format!(
            "session working directory is unavailable at {}: {error}",
            cwd.display()
        )
    })?;
    if !selected.starts_with(&root) {
        return Err(format!(
            "session working directory {} is outside its recorded worktree {}",
            selected.display(),
            root.display()
        ));
    }
    let actual_common = crate::worktree::common_dir(&root)
        .await
        .map_err(|error| format!("couldn't identify session repository: {error}"))?;
    // Current sessions persist the common Git directory, which survives deletion of a linked source
    // worktree. Older rows try the recorded source when it still exists. Rows from before source
    // provenance existed explicitly degrade to the checkout's own common directory: they remain
    // path/registry checked, but are intentionally presented as legacy/unverified by frontends.
    let common_dir =
        if let Some(common_dir) = session.worktree_common_dir.as_deref() {
            std::fs::canonicalize(common_dir)
                .map_err(|error| format!("session repository identity is unavailable: {error}"))?
        } else if let Some(source) = session.project_path.as_deref() {
            let source = std::path::Path::new(source);
            let mut existing = source.to_path_buf();
            while !existing.is_dir() {
                if !existing.pop() {
                    break;
                }
            }
            match crate::worktree::common_dir(&existing).await {
                Ok(common_dir) if source.starts_with(existing) => common_dir,
                _ => return Err(
                    "legacy worktree source is unavailable and has no durable repository identity"
                        .into(),
                ),
            }
        } else {
            actual_common.clone()
        };
    if common_dir != actual_common {
        return Err(format!(
            "session worktree repository changed: expected {}, found {}",
            common_dir.display(),
            actual_common.display()
        ));
    }
    let branch = crate::worktree::branch_for_session(&session.id)
        .map_err(|error| format!("invalid session worktree identity: {error}"))?;
    let git_dir = session
        .worktree_git_dir
        .as_deref()
        .map(std::path::Path::new);
    let branch =
        (session.worktree_baseline.is_some() || git_dir.is_some()).then_some(branch.as_str());
    validate_registered_worktree(&common_dir, git_dir, root_path, branch, None).await?;
    Ok(())
}

async fn rollback_failed_worktree(
    repo_root: &std::path::Path,
    worktree: &crate::worktree::Worktree,
    expected_sha: &str,
    cause: std::io::Error,
) -> std::io::Result<std::path::PathBuf> {
    match crate::worktree::rollback_created(repo_root, worktree, expected_sha).await {
        Ok(()) => Err(cause),
        Err(cleanup) => Err(std::io::Error::new(
            cause.kind(),
            format!(
                "{cause}; additionally couldn't roll back worktree {}: {cleanup}",
                worktree.path.display()
            ),
        )),
    }
}

/// Turn a possibly-relative working directory into the absolute one ACP demands.
///
/// Agents reject a relative `cwd` outright (`-32602 … must be an absolute path`), and the error
/// names the symptom rather than the fix, so resolve before we ever get there. A path that doesn't
/// exist is reported as itself — canonicalizing would only say "No such file or directory" without
/// saying which one.
fn resolve_cwd(cwd: &str) -> Result<String, String> {
    let raw = if cwd.trim().is_empty() {
        "."
    } else {
        cwd.trim()
    };
    let path = std::path::Path::new(raw);
    let abs = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|e| {
                format!("can't resolve “{raw}”: the current directory is unavailable ({e})")
            })?
            .join(path)
    };
    if !abs.is_dir() {
        return Err(format!(
            "working directory “{}” doesn't exist",
            abs.display()
        ));
    }
    // `canonicalize` also resolves `..` and symlinks; keep the joined path if it somehow fails.
    Ok(abs
        .canonicalize()
        .unwrap_or(abs)
        .to_string_lossy()
        .into_owned())
}

/// What one row in the worktree management list is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorktreeEntryKind {
    /// A checkout recorded by a durable session (active or archived).
    Session,
    /// A Git registration on a `codetwo/…` branch that no session claims — typically left by a
    /// deleted store or an interrupted creation.
    Orphan,
    /// A directory inside the shared `.codetwo-worktrees` container that Git no longer registers.
    Stale,
}

/// One row in the worktree management list.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WorktreeStatusEntry {
    /// Checkout root as recorded (session rows) or as registered/found on disk.
    pub path: String,
    /// Full ref (`refs/heads/codetwo/…`) when Git still registers this checkout on a branch.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    pub kind: WorktreeEntryKind,
    /// Whether `git worktree list` still knows this path.
    pub registered: bool,
    /// Whether the directory currently exists on disk.
    pub checkout_present: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_title: Option<String>,
    #[serde(default)]
    pub session_archived: bool,
    #[serde(default)]
    pub worktree_discarded: bool,
}

/// Default permission mode for a fresh session.
pub const DEFAULT_MODE: PermissionMode = PermissionMode::Ask;

#[cfg(test)]
mod cwd_tests {
    use super::resolve_cwd;

    #[test]
    fn relative_becomes_absolute() {
        let out = resolve_cwd(".").expect("cwd resolves");
        assert!(std::path::Path::new(&out).is_absolute(), "got {out}");
    }

    #[test]
    fn empty_means_here() {
        assert_eq!(resolve_cwd("").unwrap(), resolve_cwd(".").unwrap());
        assert_eq!(resolve_cwd("  ").unwrap(), resolve_cwd(".").unwrap());
    }

    #[test]
    fn absolute_is_kept() {
        let tmp = std::env::temp_dir();
        let out = resolve_cwd(&tmp.to_string_lossy()).unwrap();
        assert_eq!(
            std::path::Path::new(&out).canonicalize().unwrap(),
            tmp.canonicalize().unwrap()
        );
    }

    #[test]
    fn missing_directory_names_itself() {
        let err = resolve_cwd("/definitely/not/a/real/directory").unwrap_err();
        assert!(
            err.contains("/definitely/not/a/real/directory"),
            "got {err}"
        );
    }
}

#[cfg(test)]
mod model_option_tests {
    use super::{
        provider_config_option_infos, reasoning_option_from_models, reflect_flat_model_in_options,
    };
    use crate::acp::wire::{ModelInfo, SessionModelState};
    use crate::event::{ConfigOptionInfo, ModelChoice};
    use crate::provider::ProviderId;

    fn choice(id: &str) -> ModelChoice {
        ModelChoice {
            id: id.to_string(),
            name: id.to_string(),
            description: None,
        }
    }

    #[test]
    fn flat_codex_variant_updates_split_model_and_effort_options() {
        let mut options = vec![
            ConfigOptionInfo {
                id: "model".into(),
                name: "Model".into(),
                category: Some("model".into()),
                current: "gpt-5.6-sol".into(),
                choices: vec![choice("gpt-5.6-sol"), choice("gpt-5.6-terra")],
            },
            ConfigOptionInfo {
                id: "effort".into(),
                name: "Reasoning".into(),
                category: Some("thought_level".into()),
                current: "medium".into(),
                choices: vec![choice("low"), choice("high")],
            },
        ];

        reflect_flat_model_in_options(&mut options, "gpt-5.6-terra[high]");

        assert_eq!(options[0].current, "gpt-5.6-terra");
        assert_eq!(options[1].current, "high");
    }

    #[test]
    fn provider_model_metadata_supplies_only_its_own_effort_ladder() {
        let models = SessionModelState {
            current_model_id: "grok-4.6".into(),
            available_models: vec![ModelInfo {
                model_id: "grok-4.6".into(),
                name: "Grok 4.6".into(),
                description: None,
                meta: serde_json::json!({
                    "reasoningEffort": "xhigh",
                    "reasoningEfforts": [
                        {"value":"xhigh","label":"Extra High Effort"},
                        {"value":"high","label":"High Effort","default":true},
                        {"value":"medium","label":"Medium Effort"},
                        {"value":"low","label":"Low Effort"}
                    ]
                }),
            }],
        };

        let option = reasoning_option_from_models(Some(&models)).expect("effort metadata");
        assert_eq!(option.current, "xhigh");
        assert_eq!(
            option
                .choices
                .iter()
                .map(|choice| choice.id.as_str())
                .collect::<Vec<_>>(),
            ["low", "medium", "high", "xhigh"]
        );
    }

    #[test]
    fn glm_53_aliases_collapse_to_three_real_service_levels() {
        let wire = serde_json::from_value::<Vec<crate::acp::wire::SessionConfigOption>>(
            serde_json::json!([
                {"id":"model","name":"Model","type":"select","category":"model",
                 "currentValue":"glm-5.3","options":[{"value":"glm-5.3","name":"GLM-5.3"}]},
                {"id":"thought_level","name":"Thinking","type":"select","category":"thought_level",
                 "currentValue":"xhigh","options":[
                    {"value":"minimal","name":"Minimal"},{"value":"low","name":"Low"},
                    {"value":"medium","name":"Medium"},{"value":"high","name":"High"},
                    {"value":"xhigh","name":"X-High"},{"value":"max","name":"Max"}
                 ]}
            ]),
        )
        .unwrap();

        let options = provider_config_option_infos(&ProviderId::ZCode, &wire);
        let effort = options
            .iter()
            .find(|option| option.id == "thought_level")
            .unwrap();
        assert_eq!(effort.current, "max");
        assert_eq!(
            effort
                .choices
                .iter()
                .map(|choice| choice.id.as_str())
                .collect::<Vec<_>>(),
            ["low", "high", "max"]
        );
    }

    #[test]
    fn pi_fixed_adapter_ladder_is_not_presented_as_model_specific_truth() {
        let wire: Vec<crate::acp::wire::SessionConfigOption> =
            serde_json::from_value(serde_json::json!([
                {
                    "id": "model",
                    "name": "Model",
                    "category": "model",
                    "type": "select",
                    "currentValue": "anthropic/claude-opus-4-8",
                    "options": [{"value": "anthropic/claude-opus-4-8", "name": "Claude Opus 4.8"}]
                },
                {
                    "id": "thought_level",
                    "name": "Thinking",
                    "category": "thought_level",
                    "type": "select",
                    "currentValue": "high",
                    "options": [
                        {"value": "off", "name": "Off"},
                        {"value": "minimal", "name": "Minimal"},
                        {"value": "low", "name": "Low"},
                        {"value": "medium", "name": "Medium"},
                        {"value": "high", "name": "High"},
                        {"value": "xhigh", "name": "Extra High"}
                    ]
                }
            ]))
            .unwrap();

        let options = provider_config_option_infos(&ProviderId::Pi, &wire);
        assert_eq!(options.len(), 1);
        assert_eq!(options[0].id, "model");
    }
}

#[cfg(test)]
mod worktree_session_tests {
    use std::path::Path;
    use std::sync::Arc;
    use std::time::Duration;

    use super::{
        prepare_session_worktree, prepare_session_worktree_with_expected_sha,
        validate_session_checkout, Engine,
    };
    use crate::event::{Event, Op};
    use crate::provider::{LaunchSpec, Provider, ProviderId};
    use crate::session::Session;
    use crate::skill::{DocBlock, SkillLibrary};
    use crate::worktree::WorktreeBaseline;
    use crate::Store;

    const QUIET_AGENT: &str = r#"
import json, sys

def send(message):
    print(json.dumps(message), flush=True)

for line in sys.stdin:
    message = json.loads(line)
    method = message.get("method")
    mid = message.get("id")
    if method == "initialize":
        send({"jsonrpc":"2.0","id":mid,"result":{"protocolVersion":1}})
    elif method == "session/new":
        send({"jsonrpc":"2.0","id":mid,"result":{"sessionId":"agent-session"}})
    elif method == "session/prompt":
        send({"jsonrpc":"2.0","id":mid,"result":{"stopReason":"end_turn"}})
"#;

    fn git(repo: &Path, args: &[&str]) -> String {
        let output = std::process::Command::new("git")
            .arg("-C")
            .arg(repo)
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git {:?}: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    fn initialized_repo(label: &str) -> Option<(std::path::PathBuf, std::path::PathBuf)> {
        if crate::provider::which("git").is_none() {
            eprintln!("git not found; skipping worktree test");
            return None;
        }
        let base =
            std::env::temp_dir().join(format!("codetwo-engine-{label}-{}", uuid::Uuid::new_v4()));
        let repo = base.join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        git(&repo, &["init", "-q"]);
        git(&repo, &["config", "user.email", "test@codetwo.dev"]);
        git(&repo, &["config", "user.name", "C2 Test"]);
        git(&repo, &["commit", "--allow-empty", "-qm", "init"]);
        Some((base, repo))
    }

    fn replace_checkout_with_copied_git_marker(root: &Path) -> std::path::PathBuf {
        assert!(
            root.join(".git").is_file(),
            "linked checkout uses a .git marker"
        );
        let moved = std::path::PathBuf::from(format!("{}-moved", root.display()));
        std::fs::rename(root, &moved).unwrap();
        std::fs::create_dir(root).unwrap();
        std::fs::copy(moved.join(".git"), root.join(".git")).unwrap();
        moved
    }

    async fn next_event(events: &mut tokio::sync::mpsc::UnboundedReceiver<Event>) -> Event {
        tokio::time::timeout(Duration::from_secs(10), events.recv())
            .await
            .expect("event before timeout")
            .expect("event stream remains open")
    }

    #[tokio::test]
    async fn worktree_creation_updates_the_session_and_runs_hooks() {
        if crate::provider::which("git").is_none() {
            eprintln!("git not found; skipping worktree session test");
            return;
        }
        let base = std::env::temp_dir().join(format!("codetwo-engine-wt-{}", uuid::Uuid::new_v4()));
        let repo = base.join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        git(&repo, &["init", "-q"]);
        git(&repo, &["config", "user.email", "test@codetwo.dev"]);
        git(&repo, &["config", "user.name", "C2 Test"]);
        std::fs::write(
            repo.join(".codetwo.json"),
            r#"{"scripts":[{"id":"setup","command":"printf ready > hook-ran","run_on_worktree_create":true}]}"#,
        )
        .unwrap();
        git(&repo, &["add", ".codetwo.json"]);
        git(&repo, &["commit", "-qm", "init"]);
        let head = git(&repo, &["rev-parse", "HEAD"]);

        let original = repo.canonicalize().unwrap().to_string_lossy().to_string();
        let mut session = Session::new(ProviderId::Grok, original.clone());
        let expected_branch = format!(
            "codetwo/{}",
            session
                .id
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
                .collect::<String>()
        );
        let errors = prepare_session_worktree(&repo, &mut session, WorktreeBaseline::Current)
            .await
            .unwrap();

        assert!(errors.is_empty());
        let worktree = session.worktree_path.clone().expect("worktree path");
        assert_eq!(session.cwd, worktree);
        assert_eq!(session.project_path.as_deref(), Some(original.as_str()));
        assert!(session.worktree_identity.is_some());
        let baseline = session
            .worktree_baseline
            .as_ref()
            .expect("resolved worktree baseline");
        assert_eq!(baseline.kind, WorktreeBaseline::Current);
        assert_eq!(baseline.sha, head);
        assert!(!Path::new(&worktree).starts_with(&repo));
        assert_eq!(
            git(Path::new(&worktree), &["branch", "--show-current"]),
            expected_branch
        );
        assert_eq!(
            std::fs::read_to_string(Path::new(&worktree).join("hook-ran")).unwrap(),
            "ready"
        );
        assert!(crate::worktree::list(&repo)
            .await
            .unwrap()
            .iter()
            .any(|path| path == Path::new(&worktree)));
        validate_session_checkout(&session).await.unwrap();

        crate::worktree::remove(&repo, Path::new(&worktree))
            .await
            .unwrap();
        let _ = std::fs::remove_dir_all(&base);
    }

    #[tokio::test]
    async fn origin_default_session_uses_and_records_the_exact_local_ref_commit() {
        if crate::provider::which("git").is_none() {
            eprintln!("git not found; skipping origin baseline session test");
            return;
        }
        let base =
            std::env::temp_dir().join(format!("codetwo-engine-origin-{}", uuid::Uuid::new_v4()));
        let repo = base.join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        git(&repo, &["init", "-q"]);
        git(&repo, &["config", "user.email", "test@codetwo.dev"]);
        git(&repo, &["config", "user.name", "C2 Test"]);
        git(
            &repo,
            &["commit", "--allow-empty", "-qm", "origin baseline"],
        );
        let origin_sha = git(&repo, &["rev-parse", "HEAD"]);
        git(
            &repo,
            &["update-ref", "refs/remotes/origin/trunk", &origin_sha],
        );
        git(
            &repo,
            &[
                "symbolic-ref",
                "refs/remotes/origin/HEAD",
                "refs/remotes/origin/trunk",
            ],
        );
        git(&repo, &["commit", "--allow-empty", "-qm", "local advance"]);
        assert_ne!(git(&repo, &["rev-parse", "HEAD"]), origin_sha);

        let original = repo.canonicalize().unwrap().to_string_lossy().into_owned();
        let mut session = Session::new(ProviderId::Grok, original);
        let errors = prepare_session_worktree(&repo, &mut session, WorktreeBaseline::OriginDefault)
            .await
            .unwrap();

        assert!(errors.is_empty());
        let baseline = session
            .worktree_baseline
            .as_ref()
            .expect("resolved origin baseline");
        assert_eq!(baseline.kind, WorktreeBaseline::OriginDefault);
        assert_eq!(baseline.reference, "refs/remotes/origin/trunk");
        assert_eq!(baseline.sha, origin_sha);
        let worktree = session.worktree_path.as_deref().expect("worktree path");
        assert_eq!(git(Path::new(worktree), &["rev-parse", "HEAD"]), origin_sha);

        crate::worktree::remove(&repo, Path::new(worktree))
            .await
            .unwrap();
        let _ = std::fs::remove_dir_all(&base);
    }

    #[tokio::test]
    async fn failed_worktree_creation_leaves_the_session_unchanged() {
        let dir = std::env::temp_dir().join(format!("codetwo-not-repo-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let original = dir.canonicalize().unwrap().to_string_lossy().to_string();
        let mut session = Session::new(ProviderId::Grok, original.clone());

        assert!(
            prepare_session_worktree(&dir, &mut session, WorktreeBaseline::Current)
                .await
                .is_err()
        );
        assert_eq!(session.cwd, original);
        assert_eq!(session.project_path.as_deref(), Some(original.as_str()));
        assert!(session.worktree_path.is_none());
        assert!(session.worktree_identity.is_none());
        assert!(session.worktree_baseline.is_none());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn worktree_preserves_the_selected_repository_subdirectory() {
        if crate::provider::which("git").is_none() {
            eprintln!("git not found; skipping worktree subdirectory test");
            return;
        }
        let base =
            std::env::temp_dir().join(format!("codetwo-engine-subdir-{}", uuid::Uuid::new_v4()));
        let repo = base.join("repo");
        let selected = repo.join("packages").join("app");
        std::fs::create_dir_all(&selected).unwrap();
        git(&repo, &["init", "-q"]);
        git(&repo, &["config", "user.email", "test@codetwo.dev"]);
        git(&repo, &["config", "user.name", "C2 Test"]);
        std::fs::write(
            selected.join(".codetwo.json"),
            r#"{"scripts":[{"id":"setup","command":"pwd > hook-cwd","run_on_worktree_create":true}]}"#,
        )
        .unwrap();
        std::fs::write(selected.join("tracked.txt"), "tracked").unwrap();
        git(&repo, &["add", "."]);
        git(&repo, &["commit", "-qm", "init"]);

        let original = selected
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let mut session = Session::new(ProviderId::Grok, original.clone());
        let errors = prepare_session_worktree(&selected, &mut session, WorktreeBaseline::Current)
            .await
            .unwrap();

        assert!(errors.is_empty());
        assert_eq!(session.project_path.as_deref(), Some(original.as_str()));
        let worktree_root = session.worktree_path.clone().expect("worktree root");
        let expected_cwd = Path::new(&worktree_root).join("packages").join("app");
        assert_eq!(Path::new(&session.cwd), expected_cwd);
        assert_ne!(session.cwd, worktree_root);
        assert_eq!(
            std::fs::read_to_string(expected_cwd.join("hook-cwd"))
                .unwrap()
                .trim(),
            expected_cwd.to_string_lossy()
        );

        crate::worktree::remove(&repo, Path::new(&worktree_root))
            .await
            .unwrap();
        let _ = std::fs::remove_dir_all(&base);
    }

    #[tokio::test]
    async fn missing_untracked_subdirectory_rolls_back_and_leaves_session_unchanged() {
        if crate::provider::which("git").is_none() {
            eprintln!("git not found; skipping worktree rollback test");
            return;
        }
        let base =
            std::env::temp_dir().join(format!("codetwo-engine-rollback-{}", uuid::Uuid::new_v4()));
        let repo = base.join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        git(&repo, &["init", "-q"]);
        git(&repo, &["config", "user.email", "test@codetwo.dev"]);
        git(&repo, &["config", "user.name", "C2 Test"]);
        git(&repo, &["commit", "--allow-empty", "-qm", "init"]);

        // This directory exists in the source checkout but not in HEAD, so the sibling checkout
        // cannot preserve it. Safe rollback retains the claimed root, registration, and ref for
        // manual cleanup because no supported platform offers compare-identity-and-remove.
        let selected = repo.join("local-only");
        std::fs::create_dir_all(&selected).unwrap();
        let original = selected
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let mut session = Session::new(ProviderId::Grok, original.clone());
        let branch = crate::worktree::branch_for_session(&session.id).unwrap();

        let error = prepare_session_worktree(&selected, &mut session, WorktreeBaseline::Current)
            .await
            .unwrap_err();
        assert!(error.to_string().contains("manual cleanup"));
        assert_eq!(session.cwd, original);
        assert_eq!(session.project_path.as_deref(), Some(original.as_str()));
        assert!(session.worktree_path.is_none());
        assert!(session.worktree_identity.is_none());
        assert!(session.worktree_baseline.is_none());
        let registrations = crate::worktree::registrations(&repo).await.unwrap();
        assert_eq!(registrations.len(), 2);
        let retained = registrations
            .iter()
            .find(|entry| entry.branch.as_deref() == Some(format!("refs/heads/{branch}").as_str()))
            .expect("created registration is retained");
        assert!(retained.path.is_dir(), "claimed checkout is retained");
        let retained_path = retained.path.clone();
        let branch_exists = std::process::Command::new("git")
            .arg("-C")
            .arg(&repo)
            .args([
                "show-ref",
                "--verify",
                "--quiet",
                &format!("refs/heads/{branch}"),
            ])
            .status()
            .unwrap()
            .success();
        assert!(branch_exists, "safe rollback retains the acquired branch");
        crate::worktree::remove(&repo, &retained_path)
            .await
            .unwrap();
        let reference = format!("refs/heads/{branch}");
        let expected = std::process::Command::new("git")
            .arg("-C")
            .arg(&repo)
            .args(["rev-parse", "HEAD"])
            .output()
            .unwrap();
        let expected = String::from_utf8(expected.stdout)
            .unwrap()
            .trim()
            .to_string();
        git(&repo, &["update-ref", "-d", &reference, &expected]);

        let _ = std::fs::remove_dir_all(&base);
    }

    #[tokio::test]
    async fn revive_validation_rejects_an_unrelated_repo_reusing_the_old_path() {
        if crate::provider::which("git").is_none() {
            eprintln!("git not found; skipping worktree provenance test");
            return;
        }
        let base = std::env::temp_dir().join(format!(
            "codetwo-engine-provenance-{}",
            uuid::Uuid::new_v4()
        ));
        let repo = base.join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        git(&repo, &["init", "-q"]);
        git(&repo, &["config", "user.email", "test@codetwo.dev"]);
        git(&repo, &["config", "user.name", "C2 Test"]);
        git(&repo, &["commit", "--allow-empty", "-qm", "init"]);

        let source = repo.canonicalize().unwrap().to_string_lossy().into_owned();
        let mut session = Session::new(ProviderId::Grok, source);
        prepare_session_worktree(&repo, &mut session, WorktreeBaseline::Current)
            .await
            .unwrap();
        let old_path = Path::new(session.worktree_path.as_deref().unwrap()).to_path_buf();
        crate::worktree::remove(&repo, &old_path).await.unwrap();

        // A different repository at the same path lists itself as a worktree. Validation must use
        // the recorded source repository's registry, where this path is no longer registered.
        std::fs::create_dir_all(&old_path).unwrap();
        git(&old_path, &["init", "-q"]);
        git(&old_path, &["config", "user.email", "test@codetwo.dev"]);
        git(&old_path, &["config", "user.name", "C2 Test"]);
        git(&old_path, &["commit", "--allow-empty", "-qm", "impostor"]);
        session.cwd = old_path.to_string_lossy().into_owned();

        let error = validate_session_checkout(&session).await.unwrap_err();
        assert!(
            error.contains("path identity changed"),
            "unexpected error: {error}"
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[tokio::test]
    async fn revive_validation_allows_a_removed_source_subdirectory() {
        if crate::provider::which("git").is_none() {
            eprintln!("git not found; skipping source subdirectory validation test");
            return;
        }
        let base = std::env::temp_dir().join(format!(
            "codetwo-engine-source-subdir-{}",
            uuid::Uuid::new_v4()
        ));
        let repo = base.join("repo");
        let source_subdir = repo.join("packages").join("app");
        std::fs::create_dir_all(&source_subdir).unwrap();
        git(&repo, &["init", "-q"]);
        git(&repo, &["config", "user.email", "test@codetwo.dev"]);
        git(&repo, &["config", "user.name", "C2 Test"]);
        std::fs::write(source_subdir.join("tracked.txt"), "tracked").unwrap();
        git(&repo, &["add", "."]);
        git(&repo, &["commit", "-qm", "init"]);

        let source = source_subdir.canonicalize().unwrap();
        let mut session = Session::new(ProviderId::Grok, source.to_string_lossy().into_owned());
        prepare_session_worktree(&source, &mut session, WorktreeBaseline::Current)
            .await
            .unwrap();
        std::fs::remove_dir_all(&source_subdir).unwrap();

        validate_session_checkout(&session).await.unwrap();

        let worktree = session.worktree_path.as_deref().unwrap();
        crate::worktree::remove(&repo, Path::new(worktree))
            .await
            .unwrap();
        let _ = std::fs::remove_dir_all(&base);
    }

    #[tokio::test]
    async fn previewed_baseline_sha_must_still_match_before_creation() {
        let Some((base, repo)) = initialized_repo("baseline-preview") else {
            return;
        };
        let previewed = git(&repo, &["rev-parse", "HEAD"]);
        git(
            &repo,
            &["commit", "--allow-empty", "-qm", "advance after preview"],
        );
        let current = git(&repo, &["rev-parse", "HEAD"]);
        assert_ne!(previewed, current);
        let source = repo.canonicalize().unwrap().to_string_lossy().into_owned();
        let mut session = Session::new(ProviderId::Grok, source.clone());

        let error = prepare_session_worktree_with_expected_sha(
            &repo,
            &mut session,
            WorktreeBaseline::Current,
            Some(&previewed),
        )
        .await
        .unwrap_err();

        assert!(error.to_string().contains("baseline changed after preview"));
        assert!(error.to_string().contains("refresh the baseline picker"));
        assert_eq!(session.cwd, source);
        assert!(session.worktree_path.is_none());
        assert_eq!(
            crate::worktree::list(&repo).await.unwrap(),
            vec![repo.canonicalize().unwrap()]
        );
        assert!(git(&repo, &["branch", "--list", "codetwo/*"]).is_empty());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[tokio::test]
    async fn legacy_worktree_without_source_identity_uses_degraded_registry_validation() {
        let Some((base, repo)) = initialized_repo("legacy-revive") else {
            return;
        };
        let source = repo.canonicalize().unwrap().to_string_lossy().into_owned();
        let mut session = Session::new(ProviderId::Grok, source);
        prepare_session_worktree(&repo, &mut session, WorktreeBaseline::Current)
            .await
            .unwrap();

        session.project_path = None;
        session.worktree_common_dir = None;
        session.worktree_git_dir = None;
        session.worktree_baseline = None;

        validate_session_checkout(&session).await.unwrap();

        let worktree = session.worktree_path.as_deref().unwrap();
        crate::worktree::remove(&repo, Path::new(worktree))
            .await
            .unwrap();
        let _ = std::fs::remove_dir_all(&base);
    }

    #[tokio::test]
    async fn restart_rejects_a_replacement_directory_with_a_copied_git_marker() {
        let Some((base, repo)) = initialized_repo("durable-identity-restart") else {
            return;
        };
        let source = repo.canonicalize().unwrap().to_string_lossy().into_owned();
        let mut session = Session::new(ProviderId::Grok, source);
        prepare_session_worktree(&repo, &mut session, WorktreeBaseline::Current)
            .await
            .unwrap();
        assert!(session.worktree_identity.is_some());

        let db = base.join("codetwo.sqlite");
        let store = Store::open(db.to_str().unwrap()).unwrap();
        store.upsert_session(&session).unwrap();
        drop(store);

        let root = std::path::PathBuf::from(session.worktree_path.as_deref().unwrap());
        let _moved = replace_checkout_with_copied_git_marker(&root);

        // The older validation contract used only the path and copied Git marker. Keep that
        // compatibility for identity-less rows, but make the degraded boundary explicit here.
        let mut legacy = session.clone();
        legacy.worktree_identity = None;
        validate_session_checkout(&legacy).await.unwrap();

        // Reopen the database to exercise the serialized receipt rather than the in-memory value.
        let store = Arc::new(Store::open(db.to_str().unwrap()).unwrap());
        let restored = store.get_session(&session.id).unwrap().unwrap();
        assert_eq!(restored.worktree_identity, session.worktree_identity);
        let (engine, _events) =
            Engine::with_store(Vec::new(), SkillLibrary::default(), store.clone());
        let error = match engine.revive_session(&session.id).await {
            Ok(_) => panic!("replacement checkout must not revive"),
            Err(error) => error,
        };
        assert!(
            error.contains("path identity changed"),
            "unexpected error: {error}"
        );
        assert!(error.contains("replacement directory"));

        drop(engine);
        drop(store);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[tokio::test]
    async fn live_prompt_revalidates_the_durable_directory_identity_before_turn_start() {
        let Some((base, repo)) = initialized_repo("durable-identity-prompt") else {
            return;
        };
        let db = base.join("codetwo.sqlite");
        let store = Arc::new(Store::open(db.to_str().unwrap()).unwrap());
        let provider = Provider {
            id: ProviderId::Grok,
            display_name: "Quiet mock".into(),
            launch: LaunchSpec::new("python3", ["-c", QUIET_AGENT]),
            needs_node: false,
        };
        let (engine, mut events) =
            Engine::with_store(vec![provider], SkillLibrary::default(), store.clone());
        engine
            .submit(Op::NewSession {
                provider: ProviderId::Grok,
                cwd: repo.to_string_lossy().into_owned(),
                use_worktree: true,
                worktree_base: Some(WorktreeBaseline::Current),
                worktree_base_sha: None,
                request_id: Some("create-with-identity".into()),
                initial_policy: None,
            })
            .await
            .unwrap();
        let (session_id, root) = loop {
            if let Event::SessionCreated {
                session,
                worktree_path: Some(worktree_path),
                ..
            } = next_event(&mut events).await
            {
                break (session, std::path::PathBuf::from(worktree_path));
            }
        };
        assert!(store
            .get_session(&session_id)
            .unwrap()
            .unwrap()
            .worktree_identity
            .is_some());
        let _moved = replace_checkout_with_copied_git_marker(&root);

        engine
            .submit(Op::Prompt {
                session: session_id.clone(),
                doc: vec![DocBlock::Text {
                    text: "must not reach provider".into(),
                }],
                request_id: Some("identity-recheck".into()),
            })
            .await
            .unwrap();
        loop {
            match next_event(&mut events).await {
                Event::TurnStarted { .. } => {
                    panic!("identity failure must reject before accepting the turn")
                }
                Event::Error {
                    session,
                    message,
                    terminal,
                    request_id,
                } if terminal => {
                    assert_eq!(session.as_deref(), Some(session_id.as_str()));
                    assert_eq!(request_id.as_deref(), Some("identity-recheck"));
                    assert!(message.contains("path identity changed"));
                    break;
                }
                _ => {}
            }
        }
        assert!(store.transcript(&session_id).unwrap().is_empty());

        drop(engine);
        drop(events);
        drop(store);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[tokio::test]
    async fn explicit_discard_removes_checkout_branch_and_blocks_future_prompts() {
        let Some((base, repo)) = initialized_repo("explicit-discard") else {
            return;
        };
        let db = base.join("codetwo.sqlite");
        let store = Arc::new(Store::open(db.to_str().unwrap()).unwrap());
        let provider = Provider {
            id: ProviderId::Grok,
            display_name: "Quiet mock".into(),
            launch: LaunchSpec::new("python3", ["-c", QUIET_AGENT]),
            needs_node: false,
        };
        let (engine, mut events) =
            Engine::with_store(vec![provider], SkillLibrary::default(), store.clone());
        engine
            .submit(Op::NewSession {
                provider: ProviderId::Grok,
                cwd: repo.to_string_lossy().into_owned(),
                use_worktree: true,
                worktree_base: Some(WorktreeBaseline::Current),
                worktree_base_sha: None,
                request_id: Some("create-then-discard".into()),
                initial_policy: None,
            })
            .await
            .unwrap();
        let (session_id, root) = loop {
            if let Event::SessionCreated {
                session,
                worktree_path: Some(worktree_path),
                ..
            } = next_event(&mut events).await
            {
                break (session, std::path::PathBuf::from(worktree_path));
            }
        };
        let expected_branch = crate::worktree::branch_for_session(&session_id).unwrap();

        let outcome = engine.discard_session_worktree(&session_id).await.unwrap();

        assert!(outcome.removed_checkout);
        assert_eq!(
            outcome.deleted_branch.as_deref(),
            Some(expected_branch.as_str())
        );
        assert!(!root.exists());
        assert_eq!(
            crate::worktree::registrations(&repo).await.unwrap().len(),
            1
        );
        let branches = git(&repo, &["branch", "--list", &expected_branch]);
        assert!(branches.is_empty(), "branch must be deleted: {branches}");
        loop {
            if let Event::WorktreeDiscarded {
                session,
                removed_checkout,
                deleted_branch,
                ..
            } = next_event(&mut events).await
            {
                assert_eq!(session, session_id);
                assert!(removed_checkout);
                assert_eq!(deleted_branch.as_deref(), Some(expected_branch.as_str()));
                break;
            }
        }
        let stored = store.get_session(&session_id).unwrap().unwrap();
        assert!(stored.worktree_discarded);
        assert!(stored.worktree_path.is_some(), "history is retained");

        // Prompting the discarded session is refused with a clear terminal error.
        engine
            .submit(Op::Prompt {
                session: session_id.clone(),
                doc: vec![DocBlock::Text {
                    text: "must not run".into(),
                }],
                request_id: Some("prompt-after-discard".into()),
            })
            .await
            .unwrap();
        loop {
            match next_event(&mut events).await {
                Event::TurnStarted { .. } => panic!("discarded session must not accept a turn"),
                Event::Error {
                    message, terminal, ..
                } if terminal => {
                    assert!(message.contains("discarded"), "unexpected error: {message}");
                    break;
                }
                _ => {}
            }
        }

        // Repeating the discard converges as a no-op instead of failing.
        let repeated = engine.discard_session_worktree(&session_id).await.unwrap();
        assert!(!repeated.removed_checkout);
        assert_eq!(repeated.deleted_branch, None);

        drop(engine);
        drop(events);
        drop(store);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[tokio::test]
    async fn discard_refuses_while_the_session_is_running() {
        let Some((base, repo)) = initialized_repo("discard-running") else {
            return;
        };
        let mut session = Session::new(ProviderId::Grok, repo.to_string_lossy().into_owned());
        prepare_session_worktree(&repo, &mut session, WorktreeBaseline::Current)
            .await
            .unwrap();
        let db = base.join("codetwo.sqlite");
        let store = Arc::new(Store::open(db.to_str().unwrap()).unwrap());
        store.upsert_session(&session).unwrap();
        let (engine, _events) =
            Engine::with_store(Vec::new(), SkillLibrary::default(), store.clone());
        // A persisted Running row is normalized to interrupted on open; only live in-process
        // activity means "running", so inject it through the tracker like a real turn does.
        engine.state.activity.register(
            &session.id,
            crate::session::SessionActivity {
                revision: 1,
                state: crate::session::SessionRunState::Running {
                    turn_id: "turn-1".into(),
                    prompt_request_id: None,
                },
            },
        );

        let error = engine
            .discard_session_worktree(&session.id)
            .await
            .unwrap_err();
        assert!(error.contains("still running"), "unexpected error: {error}");
        assert!(Path::new(session.worktree_path.as_deref().unwrap()).exists());

        drop(engine);
        drop(store);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[tokio::test]
    async fn list_and_orphan_discard_cover_sessions_orphans_and_stale_directories() {
        let Some((base, repo)) = initialized_repo("worktree-inventory") else {
            return;
        };
        let db = base.join("codetwo.sqlite");
        let store = Arc::new(Store::open(db.to_str().unwrap()).unwrap());

        // A session-claimed checkout.
        let mut session = Session::new(ProviderId::Grok, repo.to_string_lossy().into_owned());
        prepare_session_worktree(&repo, &mut session, WorktreeBaseline::Current)
            .await
            .unwrap();
        store.upsert_session(&session).unwrap();
        let session_root = session.worktree_path.clone().unwrap();

        // An orphaned registration: a codetwo/ checkout no session row claims.
        let baseline = crate::worktree::resolve_baseline(&repo, WorktreeBaseline::Current)
            .await
            .unwrap();
        let orphan = crate::worktree::add_for_session_from_baseline(&repo, "orphan-1", &baseline)
            .await
            .unwrap();

        // A stale directory inside the shared container that Git does not register.
        let container = orphan.path.parent().unwrap().to_path_buf();
        let repo_name = repo
            .canonicalize()
            .unwrap()
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let stale = container.join(format!("{repo_name}-stale-leftover"));
        std::fs::create_dir(&stale).unwrap();

        let (engine, _events) =
            Engine::with_store(Vec::new(), SkillLibrary::default(), store.clone());
        let project = repo.to_string_lossy().into_owned();
        let entries = engine.list_project_worktrees(&project).await.unwrap();

        let find = |path: &str| {
            entries
                .iter()
                .find(|entry| {
                    std::fs::canonicalize(&entry.path)
                        .map(|canonical| Some(canonical) == std::fs::canonicalize(path).ok())
                        .unwrap_or(entry.path == path)
                })
                .unwrap_or_else(|| panic!("no entry for {path} in {entries:?}"))
        };
        let session_entry = find(&session_root);
        assert_eq!(session_entry.kind, super::WorktreeEntryKind::Session);
        assert_eq!(
            session_entry.session_id.as_deref(),
            Some(session.id.as_str())
        );
        assert!(session_entry.registered);
        let orphan_entry = find(&orphan.path.to_string_lossy());
        assert_eq!(orphan_entry.kind, super::WorktreeEntryKind::Orphan);
        assert!(orphan_entry.session_id.is_none());
        let stale_entry = find(&stale.to_string_lossy());
        assert_eq!(stale_entry.kind, super::WorktreeEntryKind::Stale);
        assert!(!stale_entry.registered);

        // A session-claimed checkout is refused by the orphan flow.
        let refused = engine
            .discard_orphan_worktree(&project, &session_root)
            .await
            .unwrap_err();
        assert!(refused.contains("belongs to session"), "{refused}");
        assert!(Path::new(&session_root).exists());

        // The orphan registration and the stale directory are both removable.
        let outcome = engine
            .discard_orphan_worktree(&project, &orphan.path.to_string_lossy())
            .await
            .unwrap();
        assert!(outcome.removed_checkout);
        assert_eq!(outcome.deleted_branch.as_deref(), Some("codetwo/orphan-1"));
        assert!(!orphan.path.exists());
        let outcome = engine
            .discard_orphan_worktree(&project, &stale.to_string_lossy())
            .await
            .unwrap();
        assert!(outcome.removed_checkout);
        assert!(!stale.exists());

        drop(engine);
        drop(store);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[tokio::test]
    async fn persisted_common_dir_survives_removal_of_a_linked_source_worktree() {
        let Some((base, repo)) = initialized_repo("linked-source") else {
            return;
        };
        let linked = base.join("linked-source");
        git(&repo, &["branch", "linked-source"]);
        git(
            &repo,
            &[
                "worktree",
                "add",
                "-q",
                linked.to_str().unwrap(),
                "linked-source",
            ],
        );
        let mut session = Session::new(
            ProviderId::Grok,
            linked
                .canonicalize()
                .unwrap()
                .to_string_lossy()
                .into_owned(),
        );
        prepare_session_worktree(&linked, &mut session, WorktreeBaseline::Current)
            .await
            .unwrap();
        let session_worktree = session.worktree_path.clone().unwrap();

        crate::worktree::remove(&repo, &linked).await.unwrap();
        validate_session_checkout(&session).await.unwrap();

        crate::worktree::remove(&repo, Path::new(&session_worktree))
            .await
            .unwrap();
        let _ = std::fs::remove_dir_all(&base);
    }

    #[tokio::test]
    async fn exact_git_dir_rejects_another_worktree_moved_onto_the_recorded_path() {
        let Some((base, repo)) = initialized_repo("worktree-substitution") else {
            return;
        };
        let source = repo.canonicalize().unwrap().to_string_lossy().into_owned();
        let mut original = Session::new(ProviderId::Grok, source.clone());
        prepare_session_worktree(&repo, &mut original, WorktreeBaseline::Current)
            .await
            .unwrap();
        let recorded_path = std::path::PathBuf::from(original.worktree_path.as_deref().unwrap());
        let original_branch = crate::worktree::branch_for_session(&original.id).unwrap();
        crate::worktree::remove(&repo, &recorded_path)
            .await
            .unwrap();

        let mut replacement = Session::new(ProviderId::Grok, source);
        prepare_session_worktree(&repo, &mut replacement, WorktreeBaseline::Current)
            .await
            .unwrap();
        let replacement_path =
            std::path::PathBuf::from(replacement.worktree_path.as_deref().unwrap());
        git(&replacement_path, &["checkout", "-q", &original_branch]);
        git(
            &repo,
            &[
                "worktree",
                "move",
                replacement_path.to_str().unwrap(),
                recorded_path.to_str().unwrap(),
            ],
        );

        let error = validate_session_checkout(&original).await.unwrap_err();
        assert!(
            error.contains("path identity changed"),
            "unexpected error: {error}"
        );

        crate::worktree::remove(&repo, &recorded_path)
            .await
            .unwrap();
        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn hook_replacing_the_checkout_with_a_copied_git_marker_is_never_deleted() {
        let Some((base, repo)) = initialized_repo("hook-replacement") else {
            return;
        };
        std::fs::write(
            repo.join(".codetwo.json"),
            r#"{"scripts":[{"id":"replace","command":"moved=\"$PWD-moved\"; mv \"$PWD\" \"$moved\"; mkdir \"$PWD\"; cp \"$moved/.git\" \"$PWD/.git\"; touch \"$PWD/sentinel\"","run_on_worktree_create":true}]}"#,
        )
        .unwrap();
        git(&repo, &["add", ".codetwo.json"]);
        git(&repo, &["commit", "-qm", "replacement hook"]);
        let source = repo.canonicalize().unwrap().to_string_lossy().into_owned();
        let mut session = Session::new(ProviderId::Grok, source.clone());
        let branch = crate::worktree::branch_for_session(&session.id).unwrap();
        let safe_id = branch.strip_prefix("codetwo/").unwrap();
        let expected_path = base
            .join(".codetwo-worktrees")
            .join(format!("repo-{safe_id}"));
        let moved_path = std::path::PathBuf::from(format!("{}-moved", expected_path.display()));

        let error = prepare_session_worktree(&repo, &mut session, WorktreeBaseline::Current)
            .await
            .unwrap_err();

        assert!(error.to_string().contains("path identity changed"));
        assert!(error.to_string().contains("refusing destructive cleanup"));
        assert_eq!(session.cwd, source);
        assert!(session.worktree_path.is_none());
        assert!(expected_path.join("sentinel").is_file());
        assert!(moved_path.is_dir());
        assert!(crate::worktree::registrations(&repo)
            .await
            .unwrap()
            .iter()
            .any(|entry| { entry.path.canonicalize().ok() == expected_path.canonicalize().ok() }));

        let _ = std::fs::remove_dir_all(&base);
    }
}

#[cfg(test)]
mod session_management_tests {
    use std::sync::Arc;

    use super::Engine;
    use crate::provider::ProviderId;
    use crate::session::{Part, Role, Session};
    use crate::skill::SkillLibrary;
    use crate::Store;

    #[test]
    fn set_pinned_delegates_to_the_store() {
        let store = Arc::new(Store::open_in_memory().unwrap());
        let session = Session::new(ProviderId::Grok, "/work");
        store.upsert_session(&session).unwrap();
        let (engine, _events) =
            Engine::with_store(Vec::new(), SkillLibrary::default(), store.clone());

        engine.set_pinned(&session.id, true);

        assert!(store.get_session(&session.id).unwrap().unwrap().pinned);
        assert!(engine.list_sessions().unwrap()[0].pinned);
    }

    #[tokio::test]
    async fn corrupt_persisted_session_is_reported_instead_of_becoming_an_empty_or_missing_row() {
        let path = std::env::temp_dir().join(format!(
            "codetwo-corrupt-session-{}.sqlite",
            uuid::Uuid::new_v4()
        ));
        let store = Arc::new(Store::open(path.to_str().unwrap()).unwrap());
        let session = Session::new(ProviderId::Grok, "/work");
        store.upsert_session(&session).unwrap();
        let external = rusqlite::Connection::open(&path).unwrap();
        external
            .execute(
                "UPDATE sessions SET provider='not-json' WHERE id=?1",
                [&session.id],
            )
            .unwrap();
        drop(external);
        let (engine, _events) =
            Engine::with_store(Vec::new(), SkillLibrary::default(), store.clone());

        let list_error = engine.list_sessions().unwrap_err().to_string();
        assert!(!list_error.is_empty());
        let revive_error = match engine.revive_session(&session.id).await {
            Ok(_) => panic!("corrupt session must not revive"),
            Err(error) => error,
        };
        assert!(revive_error.contains("couldn't read persisted session"));
        assert!(!revive_error.contains("no such session"));

        drop(engine);
        drop(store);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn referenced_context_uses_only_the_recent_twenty_user_turns() {
        let store = Arc::new(Store::open_in_memory().unwrap());
        let mut session = Session::new(ProviderId::Grok, "/work");
        session.title = "History".into();
        store.upsert_session(&session).unwrap();
        for turn in 0..25 {
            store
                .append_part(
                    &session.id,
                    Role::User,
                    &Part::Prompt {
                        text: format!("TURN_{turn:03}_USER_ONLY"),
                        display: format!("turn {turn}"),
                    },
                )
                .unwrap();
            store
                .append_part(
                    &session.id,
                    Role::Agent,
                    &Part::Text {
                        text: format!("TURN_{turn:03}_AGENT_ONLY"),
                    },
                )
                .unwrap();
        }
        let (engine, _events) =
            Engine::with_store(Vec::new(), SkillLibrary::default(), store.clone());

        let context = engine
            .referenced_session_context(&session.id)
            .unwrap()
            .unwrap();
        assert!(!context.contains("TURN_004_USER_ONLY"));
        assert!(context.contains("TURN_005_USER_ONLY"));
        assert!(context.contains("TURN_024_AGENT_ONLY"));
        assert!(context.contains("_(earlier messages omitted)_"));
        assert!(context.chars().count() <= 16_000);
    }

    #[test]
    fn referenced_context_bounds_an_oversized_latest_turn_and_keeps_its_tail() {
        let store = Arc::new(Store::open_in_memory().unwrap());
        let session = Session::new(ProviderId::Grok, "/work");
        store.upsert_session(&session).unwrap();
        store
            .append_part(
                &session.id,
                Role::User,
                &Part::Prompt {
                    text: "OLD_CONTEXT".into(),
                    display: "old".into(),
                },
            )
            .unwrap();
        store
            .append_part(
                &session.id,
                Role::Agent,
                &Part::Text {
                    text: format!("{}LATEST_CONTEXT_END", "界".repeat(24_000)),
                },
            )
            .unwrap();
        let (engine, _events) =
            Engine::with_store(Vec::new(), SkillLibrary::default(), store.clone());

        let context = engine
            .referenced_session_context(&session.id)
            .unwrap()
            .unwrap();
        assert!(context.chars().count() <= 16_000);
        assert!(context.contains("_(earlier messages omitted)_"));
        assert!(context.ends_with("LATEST_CONTEXT_END"));
        assert!(!context.contains("OLD_CONTEXT"));
    }
}

#[cfg(test)]
mod mcp_tests {
    use super::{
        auto_scene_routing_instructions, elicitation_message, encode_mcp_servers, rich_tool_kind,
        sites_permission_kind, with_auto_scene_routing, with_codetwo_browser_routing,
        with_codex_sites_routing, DesktopMcpConfig,
    };
    use crate::acp::wire::AgentCaps;
    use crate::artifact::ToolSource;
    use crate::permission::PermissionContextKind;
    use crate::skill::{McpServer, McpTransport};

    #[test]
    fn remote_transport_requires_advertised_capability() {
        let server = McpServer {
            name: "remote".into(),
            cwd: None,
            transport: McpTransport::Http {
                url: "https://example.test/mcp".into(),
                headers: Vec::new(),
            },
        };
        assert!(encode_mcp_servers(&[server.clone()], AgentCaps::default()).is_err());
        let encoded = encode_mcp_servers(
            &[server],
            AgentCaps {
                mcp_http: true,
                ..AgentCaps::default()
            },
        )
        .unwrap();
        assert_eq!(encoded[0]["type"], "http");
    }

    #[test]
    fn desktop_browser_mcp_uses_a_distinct_session_key() {
        let config = DesktopMcpConfig {
            command: "/Applications/C2.app/Contents/MacOS/C2".into(),
            socket_path: "/tmp/codetwo-browser.sock".into(),
            master_key: "launch-secret".into(),
        };
        let first = config.browser_server_for_session("session-a");
        let second = config.browser_server_for_session("session-b");
        assert_eq!(first.name, "codetwo_browser");
        let env = |server: &McpServer| match &server.transport {
            McpTransport::Stdio { args, env, .. } => {
                assert_eq!(args, &["--codetwo-browser-mcp"]);
                env.iter()
                    .find(|(name, _)| name == "CODETWO_BROWSER_SESSION_KEY")
                    .unwrap()
                    .1
                    .clone()
            }
            _ => panic!("desktop browser must use stdio"),
        };
        assert_ne!(env(&first), env(&second));
        assert!(!env(&first).contains("launch-secret"));
    }

    #[test]
    fn auto_scene_routing_requires_a_first_selection_and_names_only_installed_scenes() {
        let scenes = crate::scene::SceneLibrary::builtin();
        let instructions = auto_scene_routing_instructions(&scenes, None);
        assert!(instructions.contains("call `scene_select` before substantive work"));
        assert!(instructions.contains("`builtin:research`"));
        assert!(instructions.contains("`builtin:develop`"));
        assert!(!instructions.contains("builtin:missing"));
        let prompt = with_auto_scene_routing("fix the tests".into(), Some(instructions));
        assert!(prompt.starts_with("[C2 Auto Scene]"));
        assert!(prompt.ends_with("fix the tests"));
    }

    #[test]
    fn desktop_browser_routing_overrides_host_browser_skills() {
        let prompt = with_codetwo_browser_routing("open example.test".into(), true);
        assert!(prompt.contains("use the codetwo_browser MCP tools by default"));
        assert!(prompt.contains("Do not use node_repl"));
        assert!(prompt.ends_with("open example.test"));

        assert_eq!(
            with_codetwo_browser_routing("open example.test".into(), false),
            "open example.test"
        );
    }

    #[test]
    fn codex_sites_routing_preserves_the_production_boundary() {
        let prompt = with_codex_sites_routing("publish the landing page".into(), true);
        assert!(prompt.contains("use the official OpenAI Sites plugin"));
        assert!(prompt.contains("every Sites deployment URL is production"));
        assert!(prompt.contains("require an explicit ACP or MCP approval even in Full Access"));
        assert!(prompt.ends_with("publish the landing page"));

        assert_eq!(
            with_codex_sites_routing("local work only".into(), false),
            "local work only"
        );
    }

    #[test]
    fn sites_tools_have_a_distinct_kind_and_permission_risk() {
        let source = ToolSource {
            server: Some("codex_apps".into()),
            tool: Some("sites_deploy_site_version".into()),
            ..Default::default()
        };
        assert_eq!(
            rich_tool_kind(None, &source, "Deploy site"),
            Some("sites".into())
        );
        assert_eq!(
            sites_permission_kind(&source).map(|value| value.0),
            Some(PermissionContextKind::SitesProduction)
        );

        let read_only = ToolSource {
            server: Some("codex_apps".into()),
            tool: Some("sites_get_site".into()),
            ..Default::default()
        };
        assert_eq!(sites_permission_kind(&read_only), None);

        let mutation = ToolSource {
            server: Some("codex_apps".into()),
            tool: Some("sites_save_site_version".into()),
            ..Default::default()
        };
        assert_eq!(
            sites_permission_kind(&mutation).map(|value| value.0),
            Some(PermissionContextKind::SitesMutation)
        );
    }

    #[test]
    fn mcp_elicitation_uses_the_safe_visible_message_as_its_title() {
        let tool_call = serde_json::json!({
            "content": [{
                "type": "content",
                "content": {
                    "type": "text",
                    "text": "Website access: Allow navigation to the requested origin"
                }
            }]
        });
        assert_eq!(
            elicitation_message(&tool_call).as_deref(),
            Some("Website access: Allow navigation to the requested origin")
        );
    }
}
