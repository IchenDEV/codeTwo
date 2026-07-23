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
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use tokio::sync::{mpsc, oneshot};

use crate::acp::wire::{
    ContentBlock, PermissionOption, PermissionOutcome, RequestPermissionRequest,
    RequestPermissionResponse, SessionNotification, SessionUpdate,
};
use crate::acp::{self, AcpClient, ClientHandler};
use crate::error::AcpError;
use crate::event::{Event, Op};
use crate::permission::{Action, PermissionMode, PermissionPolicy};
use crate::provider::Provider;
use crate::session::{Part, Role, Session, SessionId};
use crate::skill::{compile_with_context, SkillLibrary};
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
}

impl SessionHandler {
    pub fn new(
        session_id: SessionId,
        events: mpsc::UnboundedSender<Event>,
        policy: Arc<Mutex<PermissionPolicy>>,
        router: PermissionRouter,
        store: Option<Arc<Store>>,
    ) -> Self {
        Self { session_id, events, policy, router, store }
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
    cwd: String,
    policy: Arc<Mutex<PermissionPolicy>>,
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

    /// Process one submission. Long-running work (a prompt turn) is spawned so this returns promptly.
    pub async fn submit(&self, op: Op) -> Result<(), AcpError> {
        match op {
            Op::NewSession { provider, cwd, use_worktree: _ } => {
                let Some(prov) = self.state.providers.iter().find(|p| p.id == provider).cloned() else {
                    self.emit(Event::Error { session: None, message: format!("unknown provider {:?}", provider) });
                    return Ok(());
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

                let client = acp::spawn(&prov.launch, handler).await?;
                client.initialize(serde_json::json!({})).await?;
                // Note: `session/new` is deferred to the first prompt (see Op::Prompt) so the
                // document's MCP servers are attached then.

                if let Some(store) = &self.state.store {
                    if let Err(e) = store.upsert_session(&sess) {
                        tracing::warn!("persist session failed: {e}");
                    }
                }

                let session_id = sess.id.clone();
                let cwd_stored = sess.cwd.clone();
                self.state.sessions.lock().unwrap().insert(
                    session_id.clone(),
                    SessionRuntime {
                        session: sess,
                        client: Arc::new(client),
                        acp_session_id: None,
                        cwd: cwd_stored,
                        policy,
                    },
                );
                self.emit(Event::SessionCreated { session: session_id });
            }

            Op::Prompt { session, doc } => {
                // Resolve the session first so the compiler has the workspace: project rules and
                // `@`-mentioned file contents are pulled in relative to the session's cwd.
                let looked = {
                    let map = self.state.sessions.lock().unwrap();
                    map.get(&session)
                        .map(|r| (r.client.clone(), r.acp_session_id.clone(), r.cwd.clone()))
                };
                let Some((client, mut acp_sid, cwd)) = looked else {
                    self.emit(Event::Error { session: Some(session), message: "no such session".into() });
                    return Ok(());
                };
                // `cwd` is consumed by `session/new` below; keep a copy for reading attachments.
                let cwd_for_images = cwd.clone();

                let compiled = {
                    let lib = self.state.skills.lock().unwrap();
                    compile_with_context(&doc, &lib, Some(std::path::Path::new(&cwd)))
                };
                for id in &compiled.unresolved {
                    self.emit(Event::Error {
                        session: Some(session.clone()),
                        message: format!("unresolved: {id}"),
                    });
                }
                // Estimate how much of the context window this prompt uses (the UI meter).
                let usage = crate::context::usage(&compiled.prompt, crate::context::DEFAULT_CONTEXT_WINDOW);
                self.emit(Event::Usage {
                    session: session.clone(),
                    input_tokens: usage.input_tokens,
                    output_tokens: 0,
                });

                if let Some(store) = &self.state.store {
                    let _ = store.append_part(&session, Role::User, &Part::Text { text: compiled.prompt.clone() });
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

                // Lazily create the ACP session on the first prompt, attaching the document's MCP
                // servers at `session/new`.
                if acp_sid.is_none() {
                    let mcp: Vec<serde_json::Value> =
                        compiled.mcp_servers.iter().map(|s| s.to_acp_json()).collect();
                    match client.new_session(cwd, mcp).await {
                        Ok(id) => {
                            let mut map = self.state.sessions.lock().unwrap();
                            if let Some(r) = map.get_mut(&session) {
                                r.acp_session_id = Some(id.clone());
                                r.session.acp_session_id = Some(id.clone());
                            }
                            if let Some(store) = &self.state.store {
                                if let Some(r) = map.get(&session) {
                                    let _ = store.upsert_session(&r.session);
                                }
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
                tokio::spawn(async move {
                    let mut blocks = vec![ContentBlock::text(compiled.prompt)];
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
                let mut map = self.state.sessions.lock().unwrap();
                if let Some(rt) = map.get_mut(&session) {
                    rt.session.model = Some(model);
                }
            }
        }
        Ok(())
    }

    fn emit(&self, event: Event) {
        let _ = self.state.events.send(event);
    }
}

/// Default permission mode for a fresh session.
pub const DEFAULT_MODE: PermissionMode = PermissionMode::Ask;
