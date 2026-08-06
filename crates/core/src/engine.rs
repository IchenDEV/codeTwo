//! The engine: the bridge between the frontend-facing SQ/EQ interface ([`Op`]/[`Event`]) and the
//! ACP client. It owns sessions, spawns/initializes a provider per session, implements the ACP
//! [`ClientHandler`] to translate `session/update` into [`Event`]s, and routes
//! `session/request_permission` either by auto-answering from the [`PermissionPolicy`] or by parking
//! the request and surfacing an [`Event::PermissionRequest`] the UI answers via
//! [`Op::AnswerPermission`].
//!
//! Both frontends use this identically: the Tauri bridge forwards `Op`s and streams `Event`s over a
//! channel; the TUI calls [`Engine::submit`] and reads the same `Event` receiver.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use tokio::sync::{mpsc, oneshot};

use crate::acp::wire::{
    AgentCaps, ContentBlock, PermissionOption, PermissionOutcome, RequestPermissionRequest,
    RequestPermissionResponse, SessionNotification, SessionUpdate,
};
use crate::acp::{self, AcpClient, ClientHandler};
use crate::error::AcpError;
use crate::event::{ConfigOptionInfo, Event, ModelChoice, Op};
use crate::models::builtin_models;
use crate::memory::{prompt_source, MemoryTurnProvenance, MEMORY_SETTLE_DELAY_SECS};
use crate::permission::{Action, PermissionMode, PermissionPolicy};
use crate::provider::Provider;
use crate::session::{Part, Role, Session, SessionId};
use crate::skill::{compile_with_sessions, McpServer, McpTransport, SkillLibrary};
use crate::store::Store;

/// Routes parked permission requests (awaiting a user decision) back to the ACP handler.
/// Cloneable; shared between the engine (which answers) and each session handler (which parks).
#[derive(Clone, Default)]
pub struct PermissionRouter {
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<PermissionOutcome>>>>,
}

impl PermissionRouter {
    /// Park a request, returning the receiver the handler awaits.
    pub fn park(&self, request_id: String) -> oneshot::Receiver<PermissionOutcome> {
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(request_id, tx);
        rx
    }
    /// Resolve a parked request. Returns false if the id was unknown (already answered/expired).
    pub fn answer(&self, request_id: &str, outcome: PermissionOutcome) -> bool {
        match self.pending.lock().unwrap().remove(request_id) {
            Some(tx) => tx.send(outcome).is_ok(),
            None => false,
        }
    }
}

/// The ACP client-side callbacks for one session: turns updates into events, persists transcript
/// parts, and resolves permissions.
pub struct SessionHandler {
    session_id: SessionId,
    events: mpsc::UnboundedSender<Event>,
    policy: Arc<Mutex<PermissionPolicy>>,
    router: PermissionRouter,
    store: Option<Arc<Store>>,
    /// True while a `session/load` replay is in flight. The replayed history already lives in the
    /// store and the UI, so updates arriving under this flag are dropped — neither re-persisted
    /// nor re-emitted. Set/cleared by the engine around the `session/load` call.
    replaying: Arc<AtomicBool>,
}

impl SessionHandler {
    pub fn new(
        session_id: SessionId,
        events: mpsc::UnboundedSender<Event>,
        policy: Arc<Mutex<PermissionPolicy>>,
        router: PermissionRouter,
        store: Option<Arc<Store>>,
    ) -> Self {
        Self { session_id, events, policy, router, store, replaying: Arc::default() }
    }

    /// The shared flag that mutes this handler during a `session/load` replay.
    pub fn replay_flag(&self) -> Arc<AtomicBool> {
        self.replaying.clone()
    }

    fn emit(&self, event: Event) {
        let _ = self.events.send(event);
    }

    fn persist(&self, role: Role, part: &Part) {
        if let Some(store) = &self.store {
            if let Err(e) = store.append_part(&self.session_id, role, part) {
                tracing::warn!("persist part failed: {e}");
            }
        }
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
                .map(|c| ModelChoice { id: c.value, name: c.name, description: c.description })
                .collect(),
        })
        .collect()
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

fn encode_mcp_servers(servers: &[McpServer], caps: AgentCaps) -> Result<Vec<serde_json::Value>, String> {
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

fn select_kind(options: &[PermissionOption], prefix: &str) -> PermissionOutcome {
    options
        .iter()
        .find(|o| o.kind.starts_with(prefix))
        .map(|o| PermissionOutcome::Selected { option_id: o.option_id.clone() })
        .unwrap_or(PermissionOutcome::Cancelled)
}

#[async_trait]
impl ClientHandler for SessionHandler {
    async fn session_update(&self, note: SessionNotification) {
        // History replayed by `session/load` is already persisted and rendered; drop it.
        if self.replaying.load(Ordering::SeqCst) {
            return;
        }
        let session = self.session_id.clone();
        // Build the UI event and the persisted transcript part together, then emit + persist.
        let (event, part): (Option<Event>, Option<Part>) = match note.update {
            SessionUpdate::AgentMessageChunk { content: ContentBlock::Text { text } } => (
                Some(Event::AgentText { session, message_id: String::new(), text: text.clone() }),
                Some(Part::Text { text }),
            ),
            SessionUpdate::AgentThoughtChunk { content: ContentBlock::Text { text } } => (
                Some(Event::AgentThought { session, text: text.clone() }),
                Some(Part::Reasoning { text }),
            ),
            SessionUpdate::ToolCall(tc) => {
                let title = tc.title.unwrap_or_default();
                let status = tc.status.unwrap_or_else(|| "pending".into());
                (
                    Some(Event::ToolCall { session, id: tc.tool_call_id.clone(), title: title.clone(), status: status.clone() }),
                    Some(Part::ToolCall { id: tc.tool_call_id, title, status }),
                )
            }
            SessionUpdate::ToolCallUpdate(u) => {
                let title = u.title.unwrap_or_default();
                let status = u.status.unwrap_or_else(|| "in_progress".into());
                (
                    Some(Event::ToolCall { session, id: u.tool_call_id.clone(), title: title.clone(), status: status.clone() }),
                    Some(Part::ToolCall { id: u.tool_call_id, title, status }),
                )
            }
            SessionUpdate::Plan { entries } => {
                let items: Vec<String> = entries.into_iter().map(|e| e.content).collect();
                (Some(Event::Plan { session, entries: items.clone() }), Some(Part::Plan { entries: items }))
            }
            // Agent-side config change (e.g. it switched model itself): forward the new set to the
            // UI. Not a transcript part — configuration isn't conversation.
            SessionUpdate::ConfigOptionUpdate { config_options } => {
                (Some(Event::ConfigOptions { session, options: config_option_infos(&config_options) }), None)
            }
            // Our own echoed input and any image/resource chunks aren't rendered/persisted here.
            _ => (None, None),
        };
        if let Some(event) = event {
            self.emit(event);
        }
        if let Some(part) = part {
            self.persist(Role::Agent, &part);
        }
    }

    async fn request_permission(&self, req: RequestPermissionRequest) -> RequestPermissionResponse {
        let kind = req.tool_call.get("kind").and_then(|v| v.as_str()).unwrap_or("other");
        let title = req
            .tool_call
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Tool call")
            .to_string();

        let action = self.policy.lock().unwrap().decide(kind, &title);
        let outcome = match action {
            Action::Allow => select_kind(&req.options, "allow"),
            Action::Deny => select_kind(&req.options, "reject"),
            Action::Ask => {
                // Park the request and ask the UI. The turn stays open until answered.
                let request_id = uuid::Uuid::new_v4().to_string();
                let rx = self.router.park(request_id.clone());
                self.emit(Event::PermissionRequest {
                    session: self.session_id.clone(),
                    request_id,
                    title,
                    options: req.options.iter().map(|o| (o.option_id.clone(), o.name.clone())).collect(),
                });
                rx.await.unwrap_or(PermissionOutcome::Cancelled)
            }
        };
        RequestPermissionResponse { outcome }
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
    events: mpsc::UnboundedSender<Event>,
    sessions: Mutex<HashMap<SessionId, SessionRuntime>>,
    router: PermissionRouter,
    store: Option<Arc<Store>>,
}

/// Owns the sessions and drives providers. Construct with [`Engine::new`], which also hands back the
/// [`Event`] receiver a frontend renders.
pub struct Engine {
    state: Arc<EngineState>,
}

impl Engine {
    pub fn new(providers: Vec<Provider>, skills: SkillLibrary) -> (Engine, mpsc::UnboundedReceiver<Event>) {
        Self::build(providers, skills, None)
    }

    /// Like [`Engine::new`] but persists sessions and transcripts to `store`.
    pub fn with_store(
        providers: Vec<Provider>,
        skills: SkillLibrary,
        store: Arc<Store>,
    ) -> (Engine, mpsc::UnboundedReceiver<Event>) {
        Self::build(providers, skills, Some(store))
    }

    fn build(
        providers: Vec<Provider>,
        skills: SkillLibrary,
        store: Option<Arc<Store>>,
    ) -> (Engine, mpsc::UnboundedReceiver<Event>) {
        let (events, rx) = mpsc::unbounded_channel();
        let state = Arc::new(EngineState {
            providers,
            skills: Arc::new(Mutex::new(skills)),
            events,
            sessions: Mutex::new(HashMap::new()),
            router: PermissionRouter::default(),
            store,
        });
        (Engine { state }, rx)
    }

    pub fn router(&self) -> &PermissionRouter {
        &self.state.router
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

    /// Rename a session (persisted).
    pub fn rename_session(&self, id: &str, title: &str) {
        if let Some(store) = &self.state.store {
            let _ = store.rename_session(id, title);
        }
        if let Some(rt) = self.state.sessions.lock().unwrap().get_mut(id) {
            rt.session.title = title.to_string();
        }
    }

    /// Archive / unarchive a session (archived ones drop out of the main list).
    pub fn set_archived(&self, id: &str, archived: bool) {
        if let Some(store) = &self.state.store {
            let _ = store.set_archived(id, archived);
        }
    }

    /// Archived sessions.
    pub fn list_archived(&self) -> Vec<Session> {
        match &self.state.store {
            Some(store) => store.list_archived_sessions().unwrap_or_default(),
            None => Vec::new(),
        }
    }

    /// Sessions for the left-hand list. Reads the store when persistent, else live sessions.
    pub fn list_sessions(&self) -> Vec<Session> {
        match &self.state.store {
            Some(store) => store.list_sessions().unwrap_or_default(),
            None => self.state.sessions.lock().unwrap().values().map(|r| r.session.clone()).collect(),
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
        let sess = self
            .state
            .store
            .as_ref()
            .and_then(|s| s.get_session(id).ok().flatten())
            .ok_or_else(|| "no such session".to_string())?;
        let prov = self
            .state
            .providers
            .iter()
            .find(|p| p.id == sess.provider)
            .cloned()
            .ok_or_else(|| format!("unknown provider {:?}", sess.provider))?;
        let policy = Arc::new(Mutex::new(PermissionPolicy {
            mode: sess.permission_mode,
            ..Default::default()
        }));
        let handler = Arc::new(SessionHandler::new(
            id.to_string(),
            self.state.events.clone(),
            policy.clone(),
            self.state.router.clone(),
            self.state.store.clone(),
        ));
        let replaying = handler.replay_flag();
        let client = acp::spawn(&prov.launch, handler)
            .await
            .map_err(|e| format!("couldn't relaunch {}: {e}", prov.display_name))?;
        let init = client
            .initialize(serde_json::json!({}))
            .await
            .map_err(|e| format!("couldn't relaunch {}: {e}", prov.display_name))?;
        let client = Arc::new(client);

        // The stored ACP session id becomes the resume cursor; the live id stays unset until the
        // next prompt either re-attaches (`session/load`) or starts over (`session/new`).
        let resume = sess.acp_session_id.clone();
        let cwd = sess.cwd.clone();
        let models = builtin_models(&prov.id);
        let current = sess.model.clone().unwrap_or_default();
        self.state.sessions.lock().unwrap().insert(
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
                models_reported: false,
            },
        );
        if !models.is_empty() {
            self.emit(Event::Models { session: id.to_string(), available: models, current });
        }
        Ok((client, None, cwd))
    }

    /// Process one submission. Long-running work (a prompt turn) is spawned so this returns promptly.
    pub async fn submit(&self, op: Op) -> Result<(), AcpError> {
        match op {
            Op::NewSession { provider, cwd, use_worktree: _ } => {
                let Some(prov) = self.state.providers.iter().find(|p| p.id == provider).cloned() else {
                    self.emit(Event::Error { session: None, message: format!("unknown provider {:?}", provider) });
                    return Ok(());
                };
                // ACP requires an absolute `cwd`, and every frontend has a natural way to hand us a
                // relative one ("." is the obvious default). Resolve it once, here, so the session
                // record, the worktree, git, and `session/new` all agree on one real path.
                let cwd = match resolve_cwd(&cwd) {
                    Ok(p) => p,
                    Err(message) => {
                        self.emit(Event::Error { session: None, message });
                        return Ok(());
                    }
                };
                let sess = Session::new(provider, cwd.clone());
                let policy = Arc::new(Mutex::new(PermissionPolicy {
                    mode: sess.permission_mode,
                    ..Default::default()
                }));
                let handler = Arc::new(SessionHandler::new(
                    sess.id.clone(),
                    self.state.events.clone(),
                    policy.clone(),
                    self.state.router.clone(),
                    self.state.store.clone(),
                ));

                let replaying = handler.replay_flag();
                let client = acp::spawn(&prov.launch, handler).await?;
                let init = client.initialize(serde_json::json!({})).await?;
                // Note: `session/new` is deferred to the first prompt (see Op::Prompt) so the
                // document's MCP servers are attached then.

                if let Some(store) = &self.state.store {
                    if let Err(e) = store.upsert_session(&sess) {
                        tracing::warn!("persist session failed: {e}");
                    }
                }

                let session_id = sess.id.clone();
                let cwd_stored = sess.cwd.clone();
                // Offer the provider's built-in models straight away. The agent's own list, if it
                // has one, only arrives at `session/new` — i.e. after the first prompt — and until
                // then the picker would otherwise have nothing in it at all.
                let models = builtin_models(&prov.id);
                self.state.sessions.lock().unwrap().insert(
                    session_id.clone(),
                    SessionRuntime {
                        session: sess,
                        client: Arc::new(client),
                        acp_session_id: None,
                        resume_acp_session_id: None,
                        caps: init.caps(),
                        mcp_servers: Vec::new(),
                        replaying,
                        cwd: cwd_stored,
                        policy,
                        models: models.clone(),
                        models_reported: false,
                    },
                );
                self.emit(Event::SessionCreated { session: session_id.clone() });
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

            Op::Prompt { session, doc } => {
                // Memory observes the user's document, not its expanded files, rules, skills, or a
                // previous memory block. Keeping this source separate prevents feedback loops.
                let memory_source = prompt_source(&doc);
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
                            self.emit(Event::Error { session: Some(session), message });
                            return Ok(());
                        }
                    },
                };
                // `cwd` is consumed by `session/new` below; keep a copy for reading attachments.
                let cwd_for_images = cwd.clone();

                let compiled = {
                    let lib = self.state.skills.lock().unwrap();
                    // `@`-mentioned past chats resolve against the store; without one (tests,
                    // in-memory runs) they surface as unresolved rather than silently vanishing.
                    let resolve = |id: &str| -> Option<String> {
                        let store = self.state.store.as_ref()?;
                        let sess = store.get_session(id).ok().flatten()?;
                        let transcript = store.transcript(id).ok()?;
                        Some(crate::session::transcript_context(&sess.title, &transcript))
                    };
                    compile_with_sessions(&doc, &lib, Some(std::path::Path::new(&cwd)), Some(&resolve))
                };
                for id in &compiled.unresolved {
                    self.emit(Event::Error {
                        session: Some(session.clone()),
                        message: format!("unresolved: {id}"),
                    });
                }
                let memory_context = self
                    .state
                    .store
                    .as_ref()
                    .and_then(|store| {
                        match store.memory_context_with_receipt(&cwd, &session, &memory_source) {
                            Ok(context) => Some(context),
                            Err(e) => {
                                tracing::warn!("load memory context failed: {e}");
                                None
                            }
                        }
                    })
                    .unwrap_or_default();
                let provider_prompt = if memory_context.block.is_empty() {
                    compiled.prompt.clone()
                } else {
                    format!("{}\n\n{}", memory_context.block, compiled.prompt)
                };
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
                };
                let (caps, attached_mcp) = {
                    let map = self.state.sessions.lock().unwrap();
                    map.get(&session).map(|runtime| (runtime.caps, runtime.mcp_servers.clone())).unwrap_or_default()
                };
                if acp_sid.is_some() {
                    let late = compiled.mcp_servers.iter().find(|server| !attached_mcp.contains(server));
                    if let Some(server) = late {
                        self.emit(Event::Error {
                            session: Some(session),
                            message: format!(
                                "MCP server '{}' must be attached when the session starts; open a new session to use it",
                                server.name
                            ),
                        });
                        return Ok(());
                    }
                }
                let mcp = match encode_mcp_servers(&compiled.mcp_servers, caps) {
                    Ok(mcp) => mcp,
                    Err(message) => {
                        self.emit(Event::Error { session: Some(session), message });
                        return Ok(());
                    }
                };
                // Estimate how much of the context window this prompt uses (the UI meter).
                let usage = crate::context::usage(&provider_prompt, crate::context::DEFAULT_CONTEXT_WINDOW);
                self.emit(Event::Usage {
                    session: session.clone(),
                    input_tokens: usage.input_tokens,
                    output_tokens: 0,
                });

                // Persist only the compiled user document. The transient recalled block must not
                // appear as user-authored transcript or become a future extraction source.
                let user_part_seq = self.state.store.as_ref().and_then(|store| {
                    match store.append_part(&session, Role::User, &Part::Text { text: compiled.prompt.clone() }) {
                        Ok(seq) => Some(seq),
                        Err(e) => {
                            tracing::warn!("persist prompt failed: {e}");
                            None
                        }
                    }
                });
                if let (Some(store), Some(seq)) = (&self.state.store, user_part_seq) {
                    match store.save_memory_receipt(
                        &cwd,
                        &session,
                        seq,
                        &memory_source,
                        &memory_context,
                    ) {
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
                    let cp_msg = format!("before turn: {}", compiled.prompt.chars().take(60).collect::<String>());
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
                        let loaded = client.load_session(&resume_id, cwd.clone(), mcp.clone()).await;
                        replaying.store(false, Ordering::SeqCst);
                        match loaded {
                            Ok(resp) => {
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
                                    }
                                    let options = resp
                                        .config_options
                                        .as_deref()
                                        .map(config_option_infos)
                                        .unwrap_or_default();
                                    (models, current, options)
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
                            let options = resp
                                .config_options
                                .as_deref()
                                .map(config_option_infos)
                                .unwrap_or_default();
                            let option_model = current_model_from_options(&options);

                            // A model chosen before this point had no ACP session to be sent to,
                            // so the choice is still only ours. Apply it below.
                            let (models, pending) = {
                                let mut map = self.state.sessions.lock().unwrap();
                                let pending = map.get(&session).and_then(|r| r.session.model.clone());
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

                            // Unless the agent reported a model selector of its own, in which case
                            // what it says is live wins and the pre-session pick was only ever a
                            // guess at a list we didn't have.
                            let pending = pending.filter(|_| option_model.is_none());
                            if let Some(want) = pending.filter(|m| *m != current) {
                                match client.set_model(&id, &want).await {
                                    Ok(()) => {
                                        current = want.clone();
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
                                        });
                                    }
                                }
                            }

                            if !models.is_empty() {
                                self.emit(Event::Models {
                                    session: session.clone(),
                                    available: models,
                                    current,
                                });
                            }
                            if !options.is_empty() {
                                self.emit(Event::ConfigOptions { session: session.clone(), options });
                            }
                            acp_sid = Some(id);
                        }
                        Err(e) => {
                            self.emit(Event::Error { session: Some(session), message: e.to_string() });
                            return Ok(());
                        }
                    }
                }
                let acp_sid = acp_sid.expect("acp session id set above");
                let events = self.state.events.clone();
                let sess_for_task = session.clone();
                let images_cwd = cwd_for_images;
                let memory_store = self.state.store.clone();
                let memory_project = images_cwd.clone();
                tokio::spawn(async move {
                    let mut blocks = vec![ContentBlock::text(provider_prompt)];
                    // Attached images ride along as ACP image content blocks.
                    for path in &compiled.images {
                        if let Ok((mime_type, data)) =
                            crate::workspace::read_image_base64(std::path::Path::new(&images_cwd), path)
                        {
                            blocks.push(ContentBlock::Image { data, mime_type });
                        }
                    }
                    match client.prompt(&acp_sid, blocks).await {
                        Ok(stop) => {
                            // A cancelled turn is intentionally incomplete; do not memorialize its
                            // partial outcome. Other terminal stop reasons still describe a
                            // completed provider response, even when it was bounded or refused.
                            if !matches!(stop, acp::StopReason::Cancelled) {
                                if let (Some(store), Some(seq)) = (memory_store, user_part_seq) {
                                    match store.capture_completed_turn_with_provenance(
                                        &memory_project,
                                        &sess_for_task,
                                        &memory_source,
                                        seq,
                                        provenance,
                                    ) {
                                        Ok(_) => {
                                            let maintenance_store = store.clone();
                                            tokio::spawn(async move {
                                                tokio::time::sleep(std::time::Duration::from_secs(
                                                    MEMORY_SETTLE_DELAY_SECS,
                                                ))
                                                .await;
                                                if let Err(e) = maintenance_store.run_memory_maintenance() {
                                                    tracing::warn!("memory maintenance failed: {e}");
                                                }
                                            });
                                        }
                                        Err(e) => tracing::warn!("capture memory failed: {e}"),
                                    }
                                }
                            }
                            let _ = events.send(Event::TurnEnded {
                                session: sess_for_task,
                                stop_reason: format!("{stop:?}"),
                            });
                        }
                        Err(e) => {
                            let _ = events.send(Event::Error {
                                session: Some(sess_for_task),
                                message: e.to_string(),
                            });
                        }
                    }
                });
            }

            Op::Cancel { session } => {
                let map = self.state.sessions.lock().unwrap();
                if let Some(rt) = map.get(&session) {
                    if let Some(acp_sid) = &rt.acp_session_id {
                        let _ = rt.client.cancel(acp_sid);
                    }
                }
            }

            Op::AnswerPermission { session: _, request_id, option_id } => {
                let outcome = match option_id {
                    Some(id) => PermissionOutcome::Selected { option_id: id },
                    None => PermissionOutcome::Cancelled,
                };
                self.state.router.answer(&request_id, outcome);
            }

            Op::SetPermissionMode { session, mode } => {
                let map = self.state.sessions.lock().unwrap();
                if let Some(rt) = map.get(&session) {
                    rt.policy.lock().unwrap().mode = mode;
                }
            }

            Op::SetSandbox { session, sandbox } => {
                let map = self.state.sessions.lock().unwrap();
                if let Some(rt) = map.get(&session) {
                    rt.policy.lock().unwrap().sandbox = sandbox;
                }
            }

            Op::SetModel { session, model } => {
                // Tell the agent, then record it. Storing it without the ACP call would leave the
                // UI claiming a model the agent never switched to. Before the first prompt there's
                // no ACP session to tell, so the choice is just recorded and `session/new` sends it.
                let target = {
                    let map = self.state.sessions.lock().unwrap();
                    map.get(&session).map(|r| (r.client.clone(), r.acp_session_id.clone()))
                };
                if let Some((client, Some(acp_sid))) = target {
                    if let Err(e) = client.set_model(&acp_sid, &model).await {
                        // t3code's `requiresNewThreadForModelChange` honesty: the agent can't
                        // change models mid-conversation, so say what *would* work instead of
                        // leaving a bare protocol error.
                        self.emit(Event::Error {
                            session: Some(session),
                            message: format!(
                                "this agent can't switch models mid-session ({e}); start a new session to use {model}"
                            ),
                        });
                        return Ok(());
                    }
                }
                let available = {
                    let mut map = self.state.sessions.lock().unwrap();
                    match map.get_mut(&session) {
                        Some(rt) => {
                            rt.session.model = Some(model.clone());
                            if let Some(store) = &self.state.store {
                                let _ = store.upsert_session(&rt.session);
                            }
                            rt.models.clone()
                        }
                        None => Vec::new(),
                    }
                };
                self.emit(Event::Models { session, available, current: model });
            }

            Op::SetConfigOption { session, config_id, value } => {
                let target = {
                    let map = self.state.sessions.lock().unwrap();
                    map.get(&session).map(|r| (r.client.clone(), r.acp_session_id.clone()))
                };
                let Some((client, Some(acp_sid))) = target else {
                    // No live ACP session yet (fresh or resumed): nothing to switch on. The UI's
                    // pickers are populated by the agent, so this is a "try again after the first
                    // prompt" state, not a crash.
                    self.emit(Event::Error {
                        session: Some(session),
                        message: format!("can't set {config_id} before the session's first prompt"),
                    });
                    return Ok(());
                };
                match client.set_config_option(&acp_sid, &config_id, &value).await {
                    Ok(options) => {
                        let options = config_option_infos(&options);
                        if let Some(model) = current_model_from_options(&options) {
                            let mut map = self.state.sessions.lock().unwrap();
                            if let Some(rt) = map.get_mut(&session) {
                                rt.session.model = Some(model);
                                if let Some(store) = &self.state.store {
                                    let _ = store.upsert_session(&rt.session);
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

/// Turn a possibly-relative working directory into the absolute one ACP demands.
///
/// Agents reject a relative `cwd` outright (`-32602 … must be an absolute path`), and the error
/// names the symptom rather than the fix, so resolve before we ever get there. A path that doesn't
/// exist is reported as itself — canonicalizing would only say "No such file or directory" without
/// saying which one.
fn resolve_cwd(cwd: &str) -> Result<String, String> {
    let raw = if cwd.trim().is_empty() { "." } else { cwd.trim() };
    let path = std::path::Path::new(raw);
    let abs = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|e| format!("can't resolve “{raw}”: the current directory is unavailable ({e})"))?
            .join(path)
    };
    if !abs.is_dir() {
        return Err(format!("working directory “{}” doesn't exist", abs.display()));
    }
    // `canonicalize` also resolves `..` and symlinks; keep the joined path if it somehow fails.
    Ok(abs.canonicalize().unwrap_or(abs).to_string_lossy().into_owned())
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
        assert!(err.contains("/definitely/not/a/real/directory"), "got {err}");
    }
}

#[cfg(test)]
mod mcp_tests {
    use super::encode_mcp_servers;
    use crate::acp::wire::AgentCaps;
    use crate::skill::{McpServer, McpTransport};

    #[test]
    fn remote_transport_requires_advertised_capability() {
        let server = McpServer {
            name: "remote".into(),
            transport: McpTransport::Http { url: "https://example.test/mcp".into(), headers: Vec::new() },
        };
        assert!(encode_mcp_servers(&[server.clone()], AgentCaps::default()).is_err());
        let encoded = encode_mcp_servers(&[server], AgentCaps { mcp_http: true, ..AgentCaps::default() }).unwrap();
        assert_eq!(encoded[0]["type"], "http");
    }
}
