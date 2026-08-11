//! TUI application state + rendering + input handling. The state transitions in [`App::on_engine_event`]
//! are pure (no engine, no terminal), so they're unit-tested; input handling drives the shared core
//! [`Engine`] exactly like the desktop bridge does.

use std::collections::{HashMap, VecDeque};

use codetwo_core::event::Event;
use codetwo_core::permission::{ExecutionPolicy, PermissionMode, SandboxPolicy};
use codetwo_core::provider::Provider;
use codetwo_core::session::{
    Part, PendingInputKind, Role, Session, SessionActivity, SessionRunState, TranscriptEntry,
    TranscriptPage, DEFAULT_TRANSCRIPT_TURNS,
};
use codetwo_core::skill::{DocBlock, Skill};
use codetwo_core::worktree::WorktreeBaseline;
use codetwo_core::{parse_canvas_history_marker, Engine, Op, StoreError};

use ratatui::crossterm::event::{KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use ratatui::layout::{Constraint, Flex, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, List, ListItem, Paragraph, Wrap};
use ratatui::Frame;

pub struct TItem {
    pub kind: &'static str,
    pub text: String,
}

pub struct PermReq {
    pub session: String,
    pub request_id: String,
    pub title: String,
    pub options: Vec<(String, String)>,
    /// Core-global ordering for restored requests. Legacy live events have no sequence and stay
    /// behind authoritative activity-backed requests while preserving arrival order.
    pub sequence: u64,
}

struct PendingCreation {
    request_id: String,
    doc: Option<Vec<DocBlock>>,
    user_echo_index: Option<usize>,
}

struct PendingPrompt {
    session: String,
    request_id: String,
    doc: Vec<DocBlock>,
    user_echo_index: Option<usize>,
}

pub struct App {
    pub providers: Vec<Provider>,
    pub provider_idx: usize,
    pub skills: Vec<Skill>,
    pub sessions: Vec<Session>,
    pub active: Option<String>,
    pub transcript: Vec<TItem>,
    pub input: String,
    pub composed_skills: Vec<(String, String)>,
    pub picker: Option<usize>,
    pub permissions: VecDeque<PermReq>,
    pub mode: PermissionMode,
    pub sandbox: SandboxPolicy,
    pub cwd: String,
    pub worktree_base: Option<WorktreeBaseline>,
    pub status: String,
    pub should_quit: bool,
    pending_creation: Option<PendingCreation>,
    pending_prompt: Option<PendingPrompt>,
    pending_send: Option<(String, Vec<DocBlock>, String)>,
    /// Authoritative live turns by session, with the accepted prompt request when one was sent.
    running_sessions: HashMap<String, Option<String>>,
    /// Highest core activity projection observed for each session. This also covers a just-created
    /// session whose full shell has not reached the TUI's session snapshot yet.
    activities: HashMap<String, SessionActivity>,
}

impl App {
    pub fn new(providers: Vec<Provider>, skills: Vec<Skill>) -> Self {
        App {
            providers,
            provider_idx: 0,
            skills,
            sessions: Vec::new(),
            active: None,
            transcript: Vec::new(),
            input: String::new(),
            composed_skills: Vec::new(),
            picker: None,
            permissions: VecDeque::new(),
            mode: PermissionMode::Ask,
            sandbox: SandboxPolicy::WorkspaceWrite,
            cwd: ".".into(),
            worktree_base: None,
            status: "ready".into(),
            should_quit: false,
            pending_creation: None,
            pending_prompt: None,
            pending_send: None,
            running_sessions: HashMap::new(),
            activities: HashMap::new(),
        }
    }

    fn provider_name(&self) -> &str {
        self.providers
            .get(self.provider_idx)
            .map(|p| p.display_name.as_str())
            .unwrap_or("?")
    }

    /// Replace the durable session snapshot while retaining any newer activity event that raced
    /// with the list read. Startup and reconnect both use this path.
    pub fn set_sessions(&mut self, mut sessions: Vec<Session>) {
        for session in &mut sessions {
            if let Some(live) = self.activities.get(&session.id) {
                if live.revision > session.activity.revision {
                    session.activity = live.clone();
                }
            }
            self.activities
                .insert(session.id.clone(), session.activity.clone());
        }
        self.sessions = sessions;
        let active_policy = self.active.as_deref().and_then(|active| {
            self.sessions
                .iter()
                .find(|session| session.id == active)
                .map(|session| {
                    (
                        session.cwd.clone(),
                        session.permission_mode,
                        session.sandbox_policy,
                    )
                })
        });
        if let Some((cwd, mode, sandbox)) = active_policy {
            self.cwd = cwd;
            self.mode = mode;
            self.sandbox = sandbox;
        }

        self.running_sessions.clear();
        self.permissions.clear();
        let activities = self
            .activities
            .iter()
            .map(|(session, activity)| (session.clone(), activity.clone()))
            .collect::<Vec<_>>();
        for (session, activity) in activities {
            self.sync_activity_projection(&session, &activity);
        }
    }

    /// Hydrate one persisted session into the existing flat TUI transcript projection. The
    /// caller owns session selection; this method only reads a bounded recent page and replaces
    /// the current transcript with its read-only projection.
    pub fn load_session_history(
        &mut self,
        engine: &Engine,
        session_id: &str,
    ) -> Result<bool, StoreError> {
        let Some(session) = self
            .sessions
            .iter()
            .find(|session| session.id == session_id)
        else {
            return Ok(false);
        };
        let page = engine.transcript_page(session_id, None, DEFAULT_TRANSCRIPT_TURNS)?;

        self.active = Some(session.id.clone());
        self.cwd = session.cwd.clone();
        self.mode = session.permission_mode;
        self.sandbox = session.sandbox_policy;
        self.status = format!("session {}", short(&session.id));
        self.hydrate_transcript_page(page);
        Ok(true)
    }

    /// Select the deterministic first session from the durable list and hydrate its recent
    /// history. `Engine::list_sessions` orders pinned sessions first, then newest sessions, so
    /// this is a stable startup choice without introducing a second session navigator in the TUI.
    pub fn load_recent_session_history(&mut self, engine: &Engine) -> Result<(), StoreError> {
        let Some(session_id) = self.sessions.first().map(|session| session.id.clone()) else {
            return Ok(());
        };
        let _ = self.load_session_history(engine, &session_id)?;
        Ok(())
    }

    /// Replace the current transcript with a bounded, read-only projection of persisted entries.
    /// Canvas history markers are parsed by core and rendered as text placeholders; scene bytes
    /// and authoring state never enter the TUI projection.
    pub fn hydrate_transcript_page(&mut self, page: TranscriptPage) {
        self.transcript = page
            .entries
            .iter()
            .filter_map(project_transcript_entry)
            .collect();
    }

    fn apply_activity(&mut self, session: String, activity: SessionActivity) {
        if self
            .activities
            .get(&session)
            .is_some_and(|current| current.revision >= activity.revision)
        {
            return;
        }
        self.activities.insert(session.clone(), activity.clone());
        if let Some(shell) = self.sessions.iter_mut().find(|shell| shell.id == session) {
            shell.activity = activity.clone();
        }
        self.sync_activity_projection(&session, &activity);

        if self.active.as_deref() == Some(session.as_str()) {
            self.status = match &activity.state {
                SessionRunState::Idle => "ready".into(),
                SessionRunState::Running { .. } => "running…".into(),
                SessionRunState::AwaitingInput { pending, .. } => {
                    format!("awaiting input ({} queued)", pending.len())
                }
                SessionRunState::Failed { message, .. } => format!("turn failed: {message}"),
            };
        }
    }

    fn sync_activity_projection(&mut self, session: &str, activity: &SessionActivity) {
        match &activity.state {
            SessionRunState::Running {
                prompt_request_id, ..
            }
            | SessionRunState::AwaitingInput {
                prompt_request_id, ..
            } => {
                self.running_sessions
                    .insert(session.to_string(), prompt_request_id.clone());
            }
            SessionRunState::Idle | SessionRunState::Failed { .. } => {
                self.running_sessions.remove(session);
            }
        }

        self.clear_permissions_for_session(session);
        if let SessionRunState::AwaitingInput { pending, .. } = &activity.state {
            for input in pending {
                if input.kind != PendingInputKind::Permission {
                    continue;
                }
                self.permissions.push_back(PermReq {
                    session: session.to_string(),
                    request_id: input.input_id.clone(),
                    title: input.title.clone(),
                    options: input.options.clone(),
                    sequence: input.sequence,
                });
            }
        }
        let mut ordered = self.permissions.drain(..).collect::<Vec<_>>();
        ordered.sort_by_key(|permission| permission.sequence);
        self.permissions = ordered.into();
    }

    /// Pure state transition for a core event. Unit-tested.
    pub fn on_engine_event(&mut self, ev: Event) {
        match ev {
            Event::SessionCreated {
                session,
                cwd,
                request_id,
                ..
            } => {
                let matches_pending = self.pending_creation.as_ref().is_some_and(|pending| {
                    request_id.as_deref() == Some(pending.request_id.as_str())
                });
                if matches_pending {
                    let pending = self.pending_creation.take().expect("checked above");
                    self.active = Some(session.clone());
                    if !cwd.is_empty() {
                        self.cwd = cwd;
                    }
                    self.status = format!("session {}", short(&session));
                    if let Some(doc) = pending.doc {
                        let prompt_request_id = self.begin_prompt(
                            session.clone(),
                            doc.clone(),
                            pending.user_echo_index,
                        );
                        self.pending_send = Some((session, doc, prompt_request_id));
                    }
                }
            }
            Event::SessionTitleChanged { session, title } => {
                if let Some(shell) = self.sessions.iter_mut().find(|shell| shell.id == session) {
                    shell.title = title.clone();
                }
                if self.active.as_deref() == Some(session.as_str()) {
                    self.status = format!("session: {title}");
                }
            }
            Event::SessionActivityChanged { session, activity } => {
                self.apply_activity(session, activity);
            }
            Event::TurnStarted {
                session,
                request_id,
                ..
            } => {
                let matches_pending = self.pending_prompt.as_ref().is_some_and(|pending| {
                    pending.session == session
                        && request_id.as_deref() == Some(pending.request_id.as_str())
                });
                if matches_pending {
                    self.pending_prompt = None;
                }
                self.running_sessions
                    .insert(session.clone(), request_id.clone());
                if self.active.as_deref() == Some(session.as_str()) {
                    self.status = "running…".into();
                }
            }
            Event::AgentText { session, text, .. } => {
                if self.active.as_deref() == Some(session.as_str()) {
                    self.push("agent", text);
                }
            }
            Event::AgentThought { session, text, .. } => {
                if self.active.as_deref() == Some(session.as_str()) {
                    self.push("thought", text);
                }
            }
            Event::ToolCall {
                session,
                id,
                title,
                status,
                outputs,
                ..
            } => {
                if self.active.as_deref() == Some(session.as_str()) {
                    let label = if title.is_empty() { id } else { title };
                    self.push("tool", format!("{label} — {status}"));
                    for output in outputs {
                        if let codetwo_core::ToolOutput::Image { artifact } = output {
                            let dimensions = format!(" {}×{}", artifact.width, artifact.height);
                            self.push(
                                "artifact",
                                format!(
                                    "[artifact {}{} · {} bytes · {}]",
                                    artifact.mime_type, dimensions, artifact.bytes, artifact.id
                                ),
                            );
                        }
                    }
                }
            }
            Event::Plan {
                session, entries, ..
            } => {
                if self.active.as_deref() == Some(session.as_str()) {
                    self.push("plan", entries.join("\n"));
                }
            }
            Event::PermissionRequest {
                session,
                request_id,
                title,
                options,
                ..
            } => {
                let duplicate = self
                    .permissions
                    .iter()
                    .any(|pending| pending.session == session && pending.request_id == request_id);
                if !duplicate {
                    self.permissions.push_back(PermReq {
                        session,
                        request_id,
                        title,
                        options,
                        sequence: u64::MAX,
                    });
                }
            }
            Event::Usage { .. } => {}
            // Context-window data is rendered by the desktop Composer; the TUI keeps the event
            // exhaustive without conflating it with the legacy rolling usage projection.
            Event::ContextWindow { .. } => {}
            Event::MemoryContext { receipt, .. } => {
                self.status = format!("memory: {} recalled", receipt.items.len());
            }
            // The TUI has no picker yet, but the agent's choice belongs in the status line rather
            // than being dropped on the floor.
            Event::Models {
                session,
                available,
                current,
            } => {
                if self.active.as_deref() != Some(session.as_str()) {
                    return;
                }
                let name = available
                    .iter()
                    .find(|m| m.id == current)
                    .map(|m| m.name.clone())
                    .unwrap_or(current);
                if !name.is_empty() {
                    self.status = format!("model: {name}");
                }
            }
            // Same as Models, via the newer config-options surface: surface the current model.
            Event::ConfigOptions { session, options } => {
                if self.active.as_deref() != Some(session.as_str()) {
                    return;
                }
                if let Some(m) = options
                    .iter()
                    .find(|o| o.category.as_deref() == Some("model") || o.id == "model")
                {
                    let name = m
                        .choices
                        .iter()
                        .find(|c| c.id == m.current)
                        .map(|c| c.name.clone())
                        .unwrap_or_else(|| m.current.clone());
                    if !name.is_empty() {
                        self.status = format!("model: {name}");
                    }
                }
            }
            Event::ExecutionPolicyChanged {
                session, policy, ..
            } => {
                if let Some(shell) = self.sessions.iter_mut().find(|shell| shell.id == session) {
                    shell.permission_mode = policy.mode;
                    shell.sandbox_policy = policy.sandbox;
                }
                if self.active.as_deref() == Some(session.as_str()) {
                    self.mode = policy.mode;
                    self.sandbox = policy.sandbox;
                    self.status =
                        format!("execution policy: {:?} / {:?}", policy.mode, policy.sandbox);
                }
            }
            Event::TurnEnded {
                session,
                stop_reason,
            } => {
                self.running_sessions.remove(&session);
                self.clear_permissions_for_session(&session);
                if self.active.as_deref() == Some(session.as_str()) {
                    self.status = format!("turn ended: {stop_reason}");
                    self.push("end", stop_reason);
                }
            }
            Event::Error {
                session,
                message,
                terminal,
                request_id,
            } => {
                let active_session = session
                    .as_deref()
                    .is_some_and(|session| self.active.as_deref() == Some(session));
                let accepted_request = match (session.as_deref(), request_id.as_deref()) {
                    (Some(session), Some(request_id)) => {
                        self.running_sessions
                            .get(session)
                            .and_then(Option::as_deref)
                            == Some(request_id)
                    }
                    _ => false,
                };
                let creation_owned = request_id.as_deref().is_some_and(|request_id| {
                    session.is_none()
                        && self
                            .pending_creation
                            .as_ref()
                            .is_some_and(|pending| pending.request_id == request_id)
                });
                let prompt_restored = request_id.as_deref().is_some_and(|request_id| {
                    let matches_pending = self.pending_prompt.as_ref().is_some_and(|pending| {
                        session.as_deref() == Some(pending.session.as_str())
                            && pending.request_id == request_id
                    });
                    matches_pending && self.restore_failed_prompt(request_id, &message)
                });
                if terminal {
                    if let Some(session) = session.as_deref() {
                        self.running_sessions.remove(session);
                        self.clear_permissions_for_session(session);
                        if active_session && !prompt_restored {
                            self.status = if request_id.is_some() && !accepted_request {
                                "turn stopped".into()
                            } else {
                                format!("turn failed: {message}")
                            };
                        }
                    } else if creation_owned && !prompt_restored {
                        self.restore_failed_creation(
                            request_id.as_deref().expect("owned request has an id"),
                            &message,
                        );
                    }
                }
                // Request-scoped failures are broadcast. Render only this TUI's pending/accepted
                // request (or the active live turn); foreign clients cannot write into our view.
                let should_render = prompt_restored
                    || creation_owned
                    || (active_session && (request_id.is_none() || accepted_request))
                    || (session.is_none() && request_id.is_none());
                if should_render {
                    self.push("error", message);
                }
            }
        }
    }

    fn push(&mut self, kind: &'static str, text: String) {
        self.transcript.push(TItem { kind, text });
    }

    fn clear_permissions_for_session(&mut self, session: &str) {
        self.permissions
            .retain(|pending| pending.session != session);
    }

    fn begin_creation(
        &mut self,
        doc: Option<Vec<DocBlock>>,
        user_echo_index: Option<usize>,
    ) -> String {
        let request_id = uuid::Uuid::new_v4().to_string();
        self.pending_creation = Some(PendingCreation {
            request_id: request_id.clone(),
            doc,
            user_echo_index,
        });
        request_id
    }

    fn begin_prompt(
        &mut self,
        session: String,
        doc: Vec<DocBlock>,
        user_echo_index: Option<usize>,
    ) -> String {
        debug_assert!(self.pending_prompt.is_none());
        let request_id = uuid::Uuid::new_v4().to_string();
        self.pending_prompt = Some(PendingPrompt {
            session,
            request_id: request_id.clone(),
            doc,
            user_echo_index,
        });
        request_id
    }

    fn remove_optimistic_user_echo(&mut self, user_echo_index: Option<usize>, doc: &[DocBlock]) {
        let Some(index) = user_echo_index else {
            return;
        };
        let expected = summarize(doc);
        if self
            .transcript
            .get(index)
            .is_some_and(|item| item.kind == "user" && item.text == expected)
        {
            self.transcript.remove(index);
        }
    }

    /// Restore a document only when the failure belongs to this TUI's outstanding creation.
    fn restore_failed_creation(&mut self, request_id: &str, message: &str) -> bool {
        let matches_pending = self
            .pending_creation
            .as_ref()
            .is_some_and(|pending| pending.request_id == request_id);
        if !matches_pending {
            return false;
        }

        let pending = self.pending_creation.take().expect("checked above");
        if let Some(doc) = pending.doc.as_deref() {
            self.remove_optimistic_user_echo(pending.user_echo_index, doc);
        }
        if let Some(doc) = pending.doc {
            self.restore_doc(doc);
        }
        self.status = format!("session creation failed: {message}");
        true
    }

    fn restore_failed_prompt(&mut self, request_id: &str, message: &str) -> bool {
        let matches_pending = self
            .pending_prompt
            .as_ref()
            .is_some_and(|pending| pending.request_id == request_id);
        if !matches_pending {
            return false;
        }

        let pending = self.pending_prompt.take().expect("checked above");
        self.remove_optimistic_user_echo(pending.user_echo_index, &pending.doc);
        self.restore_doc(pending.doc);
        self.status = format!("prompt rejected: {message}");
        true
    }

    /// The event loop owns the auto-send after session creation, so it reports synchronous
    /// submission failures through this same correlated rollback path.
    pub fn on_prompt_submit_error(&mut self, request_id: &str, message: &str) {
        if self.restore_failed_prompt(request_id, message) {
            self.push("error", message.to_string());
        }
    }

    fn restore_doc(&mut self, doc: Vec<DocBlock>) {
        let mut skills = Vec::new();
        let mut text = Vec::new();
        for block in doc {
            match block {
                DocBlock::Text { text: block_text } => text.push(block_text),
                DocBlock::Skill { skill_id, .. } => {
                    let name = self
                        .skills
                        .iter()
                        .find(|skill| skill.id == skill_id)
                        .map(|skill| skill.name.clone())
                        .unwrap_or_else(|| skill_id.clone());
                    skills.push((skill_id, name));
                }
                other => text.push(summarize(std::slice::from_ref(&other))),
            }
        }

        skills.append(&mut self.composed_skills);
        self.composed_skills = skills;
        let restored_text = text.join("\n");
        if !restored_text.is_empty() {
            if self.input.is_empty() {
                self.input = restored_text;
            } else {
                self.input = format!("{restored_text}\n{}", self.input);
            }
        }
    }

    /// A pending prompt to send once the session exists (returned to the loop, which owns the engine).
    pub fn take_pending_send(&mut self) -> Option<(String, Vec<DocBlock>, String)> {
        self.pending_send.take()
    }

    pub async fn handle_key(&mut self, key: KeyEvent, engine: &Engine) {
        if key.kind != KeyEventKind::Press {
            return;
        }
        let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);

        // Permission overlay captures input.
        if !self.permissions.is_empty() {
            self.handle_permission_key(key, engine).await;
            return;
        }
        // Skill picker overlay captures input.
        if self.picker.is_some() {
            self.handle_picker_key(key);
            return;
        }

        match key.code {
            KeyCode::Char('c') if ctrl => self.should_quit = true,
            KeyCode::Char('q') if ctrl => self.should_quit = true,
            KeyCode::Char('n') if ctrl => self.new_session(engine).await,
            KeyCode::Char('k') if ctrl => self.cycle_mode(engine).await,
            KeyCode::Char('w') if ctrl => self.cycle_worktree_base(),
            KeyCode::Tab => {
                if !self.providers.is_empty() {
                    self.provider_idx = (self.provider_idx + 1) % self.providers.len();
                    self.status = format!("provider: {}", self.provider_name());
                }
            }
            KeyCode::Char('/') => self.picker = Some(0),
            KeyCode::Enter => self.submit(engine).await,
            KeyCode::Backspace => {
                self.input.pop();
            }
            KeyCode::Char(c) => self.input.push(c),
            KeyCode::Esc => self.should_quit = true,
            _ => {}
        }
    }

    async fn handle_permission_key(&mut self, key: KeyEvent, engine: &Engine) {
        let Some(perm) = self.permissions.front() else {
            return;
        };
        let option_id = match key.code {
            KeyCode::Char(c) if c.is_ascii_digit() => {
                let idx = c.to_digit(10).unwrap() as usize;
                if idx >= 1 && idx <= perm.options.len() {
                    Some(perm.options[idx - 1].0.clone())
                } else {
                    return;
                }
            }
            KeyCode::Esc => None,
            _ => return,
        };
        let perm = self.permissions.pop_front().expect("front existed");
        if let Err(error) = engine
            .submit(Op::AnswerPermission {
                session: perm.session,
                request_id: perm.request_id,
                option_id,
            })
            .await
        {
            self.status = format!("couldn't answer permission: {error}");
        }
    }

    fn handle_picker_key(&mut self, key: KeyEvent) {
        let Some(sel) = self.picker else { return };
        match key.code {
            KeyCode::Up => self.picker = Some(sel.saturating_sub(1)),
            KeyCode::Down => {
                if sel + 1 < self.skills.len() {
                    self.picker = Some(sel + 1);
                }
            }
            KeyCode::Enter => {
                if let Some(sk) = self.skills.get(sel) {
                    self.composed_skills.push((sk.id.clone(), sk.name.clone()));
                    self.status = format!("added skill: {}", sk.name);
                }
                self.picker = None;
            }
            KeyCode::Esc => self.picker = None,
            _ => {}
        }
    }

    async fn submit(&mut self, engine: &Engine) {
        if self.pending_prompt.is_some() {
            self.status = "prompt acceptance already pending".into();
            return;
        }
        if self
            .active
            .as_deref()
            .is_some_and(|session| self.running_sessions.contains_key(session))
        {
            self.status = "a turn is already running for this session".into();
            return;
        }
        if self.active.is_none() && self.pending_creation.is_some() {
            self.status = "session creation already pending".into();
            return;
        }
        let mut doc: Vec<DocBlock> = self
            .composed_skills
            .iter()
            .map(|(id, _)| DocBlock::Skill {
                skill_id: id.clone(),
                params: HashMap::new(),
            })
            .collect();
        if !self.input.trim().is_empty() {
            doc.push(DocBlock::Text {
                text: std::mem::take(&mut self.input),
            });
        }
        self.input.clear();
        if doc.is_empty() {
            return;
        }
        let user_echo_index = self.transcript.len();
        self.push("user", summarize(&doc));
        self.composed_skills.clear();

        match self.active.clone() {
            Some(s) => {
                let request_id = self.begin_prompt(s.clone(), doc.clone(), Some(user_echo_index));
                if let Err(error) = engine
                    .submit(Op::Prompt {
                        session: s,
                        doc,
                        request_id: Some(request_id.clone()),
                    })
                    .await
                {
                    self.on_prompt_submit_error(&request_id, &error.to_string());
                }
            }
            None => {
                let cwd = match self.session_creation_source() {
                    Ok(cwd) => cwd,
                    Err(message) => {
                        self.remove_optimistic_user_echo(Some(user_echo_index), &doc);
                        self.restore_doc(doc);
                        self.status = message.into();
                        return;
                    }
                };
                self.cwd = cwd.clone();
                let request_id = self.begin_creation(Some(doc), Some(user_echo_index));
                let provider = self.providers[self.provider_idx].id.clone();
                self.status = "creating session…".into();
                if let Err(error) = engine
                    .submit(Op::NewSession {
                        provider,
                        cwd,
                        use_worktree: self.worktree_base.is_some(),
                        worktree_base: self.worktree_base,
                        worktree_base_sha: None,
                        request_id: Some(request_id.clone()),
                        initial_policy: Some(ExecutionPolicy {
                            mode: self.mode,
                            sandbox: self.sandbox,
                        }),
                    })
                    .await
                {
                    let message = error.to_string();
                    self.restore_failed_creation(&request_id, &message);
                    self.push("error", message);
                }
            }
        }
    }

    async fn new_session(&mut self, engine: &Engine) {
        if self.pending_prompt.is_some() {
            self.status = "prompt acceptance already pending".into();
            return;
        }
        if self
            .active
            .as_deref()
            .is_some_and(|session| self.running_sessions.contains_key(session))
        {
            self.status = "finish or cancel the running turn before starting a new session".into();
            return;
        }
        if self.pending_creation.is_some() {
            self.status = "session creation already pending".into();
            return;
        }
        let cwd = match self.session_creation_source() {
            Ok(cwd) => cwd,
            Err(message) => {
                self.status = message.into();
                return;
            }
        };
        self.active = None;
        self.cwd = cwd.clone();
        self.transcript.clear();
        let provider = self.providers[self.provider_idx].id.clone();
        let request_id = self.begin_creation(None, None);
        self.status = "creating session…".into();
        if let Err(error) = engine
            .submit(Op::NewSession {
                provider,
                cwd,
                use_worktree: self.worktree_base.is_some(),
                worktree_base: self.worktree_base,
                worktree_base_sha: None,
                request_id: Some(request_id.clone()),
                initial_policy: Some(ExecutionPolicy {
                    mode: self.mode,
                    sandbox: self.sandbox,
                }),
            })
            .await
        {
            let message = error.to_string();
            self.restore_failed_creation(&request_id, &message);
            self.push("error", message);
        }
    }

    async fn cycle_mode(&mut self, engine: &Engine) {
        let next_mode = match self.mode {
            PermissionMode::Ask => PermissionMode::AcceptEdits,
            PermissionMode::AcceptEdits => PermissionMode::Yolo,
            PermissionMode::Yolo => PermissionMode::Ask,
        };
        self.status = format!("updating mode to {:?}…", next_mode);
        if let Some(s) = self.active.clone() {
            let _ = engine
                .submit(Op::SetExecutionPolicy {
                    session: s,
                    mode: next_mode,
                    sandbox: self.sandbox,
                    request_id: None,
                })
                .await;
        } else {
            self.mode = next_mode;
        }
    }

    fn cycle_worktree_base(&mut self) {
        self.worktree_base = match self.worktree_base {
            None => Some(WorktreeBaseline::Current),
            Some(WorktreeBaseline::Current) => Some(WorktreeBaseline::OriginDefault),
            Some(WorktreeBaseline::OriginDefault) => None,
        };
        self.status = format!("next worktree baseline: {}", self.worktree_base_label());
    }

    fn worktree_base_label(&self) -> &'static str {
        match self.worktree_base {
            None => "off",
            Some(WorktreeBaseline::Current) => "current",
            Some(WorktreeBaseline::OriginDefault) => "origin",
        }
    }

    fn session_creation_source(&self) -> Result<String, &'static str> {
        let Some(active) = self.active.as_deref() else {
            return Ok(self.cwd.clone());
        };
        let Some(session) = self.sessions.iter().find(|session| session.id == active) else {
            return Err("can't create session: active session provenance is unavailable");
        };
        if session.worktree_path.is_some() {
            return session.project_path.clone().ok_or(
                "can't create session: legacy worktree has no source project; select a project first",
            );
        }
        Ok(session
            .project_path
            .clone()
            .unwrap_or_else(|| session.cwd.clone()))
    }

    fn displayed_worktree_baseline(&self) -> String {
        let Some(active) = self.active.as_deref() else {
            return format!("next-baseline:{}", self.worktree_base_label());
        };
        let Some(session) = self.sessions.iter().find(|session| session.id == active) else {
            return "baseline:?".into();
        };
        if session.worktree_path.is_some() && session.worktree_identity.is_none() {
            return "baseline:legacy?".into();
        }
        if let Some(baseline) = &session.worktree_baseline {
            let label = match baseline.kind {
                WorktreeBaseline::Current => "current",
                WorktreeBaseline::OriginDefault => "origin",
            };
            return format!("baseline:{label}");
        }
        "baseline:off".into()
    }

    // ---- rendering -------------------------------------------------------------------------

    pub fn render(&self, f: &mut Frame) {
        let [body, status] =
            Layout::vertical([Constraint::Min(0), Constraint::Length(1)]).areas(f.area());
        let [left, right] =
            Layout::horizontal([Constraint::Length(26), Constraint::Min(0)]).areas(body);

        self.render_sessions(f, left);
        let [transcript, compose] =
            Layout::vertical([Constraint::Min(0), Constraint::Length(6)]).areas(right);
        self.render_transcript(f, transcript);
        self.render_compose(f, compose);
        self.render_status(f, status);

        if self.picker.is_some() {
            self.render_picker(f);
        }
        if !self.permissions.is_empty() {
            self.render_permission(f);
        }
    }

    fn render_sessions(&self, f: &mut Frame, area: Rect) {
        let items: Vec<ListItem> = if self.sessions.is_empty() {
            vec![ListItem::new(Line::from(Span::styled(
                "no sessions",
                Style::default().fg(Color::DarkGray),
            )))]
        } else {
            self.sessions
                .iter()
                .map(|s| {
                    let active = self.active.as_deref() == Some(&s.id);
                    let marker = if active { "▸ " } else { "  " };
                    let (state, style) = if self.running_sessions.contains_key(&s.id) {
                        if matches!(&s.activity.state, SessionRunState::AwaitingInput { .. }) {
                            ("  waiting", Style::default().fg(Color::Yellow))
                        } else {
                            ("  running", Style::default().fg(Color::Cyan))
                        }
                    } else if matches!(&s.activity.state, SessionRunState::Failed { .. }) {
                        ("  failed", Style::default().fg(Color::Red))
                    } else {
                        ("", Style::default().fg(Color::DarkGray))
                    };
                    ListItem::new(Line::from(vec![
                        Span::raw(format!("{marker}{}", s.title)),
                        Span::styled(state, style),
                    ]))
                })
                .collect()
        };
        let list =
            List::new(items).block(Block::default().borders(Borders::ALL).title(" sessions "));
        f.render_widget(list, area);
    }

    fn render_transcript(&self, f: &mut Frame, area: Rect) {
        let lines: Vec<Line> = self
            .transcript
            .iter()
            .flat_map(|item| transcript_lines(item))
            .collect();
        let take = lines
            .len()
            .saturating_sub(area.height.saturating_sub(2) as usize);
        let visible: Vec<Line> = lines.into_iter().skip(take).collect();
        let p = Paragraph::new(visible)
            .block(Block::default().borders(Borders::ALL).title(" transcript "))
            .wrap(Wrap { trim: false });
        f.render_widget(p, area);
    }

    fn render_compose(&self, f: &mut Frame, area: Rect) {
        let chips = if self.composed_skills.is_empty() {
            Line::from(Span::styled(
                "no skills — press / to add",
                Style::default().fg(Color::DarkGray),
            ))
        } else {
            let spans: Vec<Span> = self
                .composed_skills
                .iter()
                .map(|(_, name)| {
                    Span::styled(format!(" ▸{name} "), Style::default().fg(Color::Cyan))
                })
                .collect();
            Line::from(spans)
        };
        let body = vec![chips, Line::from(format!("> {}", self.input))];
        let p = Paragraph::new(body)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(" compose (Enter=run  /=skill) "),
            )
            .wrap(Wrap { trim: false });
        f.render_widget(p, area);
    }

    fn render_status(&self, f: &mut Frame, area: Rect) {
        let mode = format!("{:?}", self.mode);
        let text = format!(
            " {}  │  provider:{}  mode:{}  {}  │  Tab=provider ^N=new ^K=mode ^W=next-worktree ^C=quit ",
            self.status,
            self.provider_name(),
            mode,
            self.displayed_worktree_baseline(),
        );
        f.render_widget(
            Paragraph::new(text).style(Style::default().bg(Color::Indexed(236)).fg(Color::White)),
            area,
        );
    }

    fn render_picker(&self, f: &mut Frame) {
        let sel = self.picker.unwrap_or(0);
        let items: Vec<ListItem> = self
            .skills
            .iter()
            .enumerate()
            .map(|(i, s)| {
                let icon = s.icon.clone().unwrap_or_default();
                let line = format!("{icon} {}", s.name);
                if i == sel {
                    ListItem::new(Line::from(Span::styled(
                        line,
                        Style::default().add_modifier(Modifier::REVERSED),
                    )))
                } else {
                    ListItem::new(Line::from(line))
                }
            })
            .collect();
        let area = centered(f.area(), 46, 40);
        f.render_widget(Clear, area);
        f.render_widget(
            List::new(items).block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(" skills (↑↓ Enter Esc) "),
            ),
            area,
        );
    }

    fn render_permission(&self, f: &mut Frame) {
        let Some(perm) = self.permissions.front() else {
            return;
        };
        let mut lines = vec![
            Line::from(Span::styled(
                perm.title.clone(),
                Style::default().add_modifier(Modifier::BOLD),
            )),
            Line::from(""),
        ];
        for (i, (_, label)) in perm.options.iter().enumerate() {
            lines.push(Line::from(format!("  {}. {label}", i + 1)));
        }
        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            "Esc to cancel",
            Style::default().fg(Color::DarkGray),
        )));
        let area = centered(f.area(), 50, 40);
        f.render_widget(Clear, area);
        f.render_widget(
            Paragraph::new(lines)
                .block(Block::default().borders(Borders::ALL).title(format!(
                    " permission requested ({} queued) ",
                    self.permissions.len()
                )))
                .wrap(Wrap { trim: false }),
            area,
        );
    }
}

fn short(id: &str) -> String {
    id.chars().take(8).collect()
}

const MAX_HISTORY_PROMPT_CHARS: usize = 4_096;

fn bounded_history_text(text: &str) -> String {
    let mut bounded = text
        .chars()
        .take(MAX_HISTORY_PROMPT_CHARS)
        .collect::<String>();
    if text.chars().count() > MAX_HISTORY_PROMPT_CHARS {
        bounded.push('…');
    }
    bounded
}

fn canvas_history_placeholder(marker: &codetwo_core::CanvasHistoryMarker) -> String {
    let title = marker
        .title
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let title = if title.is_empty() {
        "untitled"
    } else {
        title.as_str()
    };
    let text_count = marker.text_originals.len();
    let label = if text_count == 1 {
        "text object"
    } else {
        "text objects"
    };
    format!(
        "[Canvas history: {title} · {}@{} · {text_count} {label} · read-only]",
        short(&marker.id),
        marker.revision
    )
}

fn looks_like_canvas_history_marker(line: &str) -> bool {
    line.trim_start()
        .starts_with(codetwo_core::canvas::CANVAS_HISTORY_MARKER_PREFIX)
}

/// Replace exact core JSON marker lines with a bounded human-readable placeholder. A marker-like
/// line that fails core validation stays visible, so malformed or user-authored text is never
/// silently discarded.
fn project_prompt_history(text: &str, display: &str) -> String {
    let mut found_marker = false;
    let mut malformed_marker = false;
    let mut lines = Vec::new();
    for line in text.lines() {
        let candidate = line.trim();
        if let Some(marker) = parse_canvas_history_marker(candidate) {
            found_marker = true;
            lines.push(canvas_history_placeholder(&marker));
        } else {
            malformed_marker |= looks_like_canvas_history_marker(candidate);
            lines.push(line.to_string());
        }
    }

    if !found_marker && !malformed_marker && !display.is_empty() {
        return bounded_history_text(display);
    }

    // `lines` is based on canonical prompt text, which is the only persisted source that can
    // contain a Canvas marker. Keeping its ordinary lines preserves prompt order and surrounding
    // text while removing only validated markers.
    bounded_history_text(&lines.join("\n"))
}

fn project_transcript_entry(entry: &TranscriptEntry) -> Option<TItem> {
    let (kind, text) = match (&entry.role, &entry.part) {
        (Role::User, Part::Prompt { text, display }) => {
            ("user", project_prompt_history(text, display))
        }
        (role, Part::Text { text }) => (role_kind(*role), text.clone()),
        (_, Part::Reasoning { text }) => ("thought", text.clone()),
        (
            _,
            Part::ToolCall {
                id, title, status, ..
            },
        ) => {
            let label = if title.is_empty() { id } else { title };
            ("tool", format!("{label} — {status}"))
        }
        (_, Part::Plan { entries }) => ("plan", entries.join("\n")),
        // Prompt parts are authored by the user; if legacy data labels one as agent, retain the
        // prompt's read-only text rather than dropping it from history.
        (_, Part::Prompt { text, display }) => ("user", project_prompt_history(text, display)),
    };
    Some(TItem { kind, text })
}

fn role_kind(role: Role) -> &'static str {
    match role {
        Role::User => "user",
        Role::Agent => "agent",
    }
}

fn summarize(doc: &[DocBlock]) -> String {
    doc.iter()
        .map(|b| match b {
            DocBlock::Text { text } => text.clone(),
            DocBlock::Skill { skill_id, .. } => format!("[skill:{skill_id}]"),
            DocBlock::File { path } => format!("[@{path}]"),
            DocBlock::Image { path } => format!("[img:{path}]"),
            DocBlock::Canvas {
                id,
                frozen_revision,
                pixel_policy,
            } => format!(
                "[canvas:{}@{} · {}]",
                short(id),
                frozen_revision,
                match pixel_policy {
                    codetwo_core::CanvasPixelPolicy::Required => "pixels",
                    codetwo_core::CanvasPixelPolicy::StructureOnly => "structure",
                }
            ),
            DocBlock::Session { session_id } => format!("[chat:{}]", short(session_id)),
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn transcript_lines(item: &TItem) -> Vec<Line<'static>> {
    let (prefix, style) = match item.kind {
        "user" => ("▶ ", Style::default().add_modifier(Modifier::BOLD)),
        "thought" => (
            "· ",
            Style::default()
                .fg(Color::DarkGray)
                .add_modifier(Modifier::ITALIC),
        ),
        "tool" => ("⚙ ", Style::default().fg(Color::Yellow)),
        "plan" => ("☰ ", Style::default().fg(Color::Cyan)),
        "error" => ("✗ ", Style::default().fg(Color::Red)),
        "end" => ("— ", Style::default().fg(Color::DarkGray)),
        _ => ("", Style::default()),
    };
    item.text
        .lines()
        .enumerate()
        .map(|(i, l)| {
            let p = if i == 0 { prefix } else { "  " };
            Line::from(Span::styled(format!("{p}{l}"), style))
        })
        .collect()
}

fn centered(area: Rect, width: u16, height_pct: u16) -> Rect {
    let [v] = Layout::vertical([Constraint::Percentage(height_pct)])
        .flex(Flex::Center)
        .areas(area);
    let [h] = Layout::horizontal([Constraint::Length(width)])
        .flex(Flex::Center)
        .areas(v);
    h
}

#[cfg(test)]
mod tests {
    use super::*;
    use codetwo_core::default_registry;
    use codetwo_core::provider::{LaunchSpec, ProviderId};
    use codetwo_core::skill::{builtin_skills, SkillLibrary};
    use codetwo_core::worktree::{DirectoryIdentity, ResolvedWorktreeBaseline};

    fn app() -> App {
        App::new(default_registry(), builtin_skills())
    }

    #[test]
    fn worktree_baseline_cycle_is_explicit_and_never_silently_falls_back() {
        let mut a = app();
        assert_eq!(a.worktree_base, None);
        assert_eq!(a.worktree_base_label(), "off");
        assert_eq!(a.displayed_worktree_baseline(), "next-baseline:off");

        a.cycle_worktree_base();
        assert_eq!(a.worktree_base, Some(WorktreeBaseline::Current));
        assert_eq!(a.worktree_base_label(), "current");
        assert_eq!(a.status, "next worktree baseline: current");
        assert_eq!(a.displayed_worktree_baseline(), "next-baseline:current");

        a.cycle_worktree_base();
        assert_eq!(a.worktree_base, Some(WorktreeBaseline::OriginDefault));
        assert_eq!(a.worktree_base_label(), "origin");

        a.cycle_worktree_base();
        assert_eq!(a.worktree_base, None);
        assert_eq!(a.worktree_base_label(), "off");
    }

    #[test]
    fn active_session_displays_its_durable_baseline_instead_of_the_next_selection() {
        let mut a = app();
        a.worktree_base = Some(WorktreeBaseline::OriginDefault);

        let mut ordinary = activity_session("ordinary", SessionActivity::default());
        ordinary.worktree_path = None;
        ordinary.worktree_baseline = None;
        a.active = Some(ordinary.id.clone());
        a.set_sessions(vec![ordinary]);
        assert_eq!(a.displayed_worktree_baseline(), "baseline:off");

        let mut legacy = activity_session("legacy", SessionActivity::default());
        legacy.worktree_path = Some("/tmp/legacy".into());
        legacy.worktree_baseline = None;
        a.active = Some(legacy.id.clone());
        a.set_sessions(vec![legacy]);
        assert_eq!(a.displayed_worktree_baseline(), "baseline:legacy?");

        let mut known = activity_session("known", SessionActivity::default());
        known.worktree_path = Some("/tmp/known".into());
        known.worktree_identity = Some(DirectoryIdentity::Unix {
            device: 1,
            inode: 2,
        });
        known.worktree_baseline = Some(ResolvedWorktreeBaseline {
            kind: WorktreeBaseline::Current,
            reference: "HEAD".into(),
            sha: "0123456789abcdef".into(),
            display: "HEAD".into(),
        });
        a.active = Some(known.id.clone());
        a.set_sessions(vec![known]);
        assert_eq!(a.displayed_worktree_baseline(), "baseline:current");
    }

    #[test]
    fn execution_policy_success_reconciles_active_and_durable_tui_state() {
        let mut a = app();
        let session = activity_session("policy-session", SessionActivity::default());
        a.active = Some(session.id.clone());
        a.set_sessions(vec![session]);

        a.on_engine_event(Event::ExecutionPolicyChanged {
            session: "policy-session".into(),
            policy: ExecutionPolicy {
                mode: PermissionMode::Yolo,
                sandbox: SandboxPolicy::DangerFullAccess,
            },
            request_id: Some("policy-request".into()),
        });

        assert_eq!(a.mode, PermissionMode::Yolo);
        assert_eq!(a.sandbox, SandboxPolicy::DangerFullAccess);
        assert_eq!(a.sessions[0].permission_mode, PermissionMode::Yolo);
        assert_eq!(
            a.sessions[0].sandbox_policy,
            SandboxPolicy::DangerFullAccess
        );
    }

    #[test]
    fn matching_session_created_tracks_the_automatic_prompt_until_acceptance() {
        let mut a = app();
        let doc = vec![DocBlock::Text { text: "hi".into() }];
        let echo_index = a.transcript.len();
        a.push("user", summarize(&doc));
        let request_id = a.begin_creation(Some(doc), Some(echo_index));
        a.on_engine_event(Event::SessionCreated {
            session: "sess-123456789".into(),
            cwd: "/durable/worktree/subdir".into(),
            project_path: Some("/source/subdir".into()),
            worktree_path: Some("/durable/worktree".into()),
            worktree_baseline: Some(ResolvedWorktreeBaseline {
                kind: WorktreeBaseline::Current,
                reference: "HEAD".into(),
                sha: "0123456789abcdef".into(),
                display: "HEAD".into(),
            }),
            request_id: Some(request_id),
        });
        assert_eq!(a.active.as_deref(), Some("sess-123456789"));
        assert_eq!(a.cwd, "/durable/worktree/subdir");
        let pending = a.take_pending_send().expect("pending prompt flushed");
        assert_eq!(pending.0, "sess-123456789");
        assert_eq!(pending.2, a.pending_prompt.as_ref().unwrap().request_id);
        assert!(a.pending_creation.is_none());
        assert!(a.pending_prompt.is_some());

        a.on_engine_event(Event::TurnStarted {
            session: "sess-123456789".into(),
            request_id: Some(pending.2),
            transcript_seq: None,
        });
        assert!(a.pending_prompt.is_none());
        assert_eq!(a.status, "running…");
    }

    #[test]
    fn automatic_prompt_submit_error_restores_the_creation_draft() {
        let mut a = app();
        let doc = vec![DocBlock::Text {
            text: "send after create".into(),
        }];
        let echo_index = a.transcript.len();
        a.push("user", summarize(&doc));
        let creation_request = a.begin_creation(Some(doc), Some(echo_index));
        a.on_engine_event(Event::SessionCreated {
            session: "created".into(),
            cwd: "/durable/created".into(),
            project_path: Some("/durable/created".into()),
            worktree_path: None,
            worktree_baseline: None,
            request_id: Some(creation_request),
        });
        let (_, _, prompt_request) = a.take_pending_send().unwrap();

        a.on_prompt_submit_error(&prompt_request, "submit channel failed");

        assert!(a.pending_prompt.is_none());
        assert_eq!(a.input, "send after create");
        assert!(a.transcript.iter().all(|item| item.kind != "user"));
        assert_eq!(a.transcript.last().unwrap().kind, "error");
    }

    #[test]
    fn unmatched_session_created_and_creation_error_are_ignored() {
        let mut a = app();
        let request_id = a.begin_creation(
            Some(vec![DocBlock::Text {
                text: "keep me".into(),
            }]),
            None,
        );

        a.on_engine_event(Event::SessionCreated {
            session: "somebody-elses-session".into(),
            cwd: "/foreign".into(),
            project_path: Some("/foreign".into()),
            worktree_path: None,
            worktree_baseline: None,
            request_id: Some("another-client".into()),
        });
        a.on_engine_event(Event::Error {
            session: None,
            message: "another client failed".into(),
            terminal: true,
            request_id: Some("another-client".into()),
        });

        assert!(a.active.is_none());
        assert!(a.pending_creation.is_some());
        assert!(a.input.is_empty());
        assert_eq!(a.cwd, ".");
        assert_eq!(a.pending_creation.as_ref().unwrap().request_id, request_id);
    }

    #[test]
    fn legacy_session_created_cwd_falls_back_to_the_refreshed_session_shell() {
        let mut a = app();
        let request_id = a.begin_creation(None, None);
        a.on_engine_event(Event::SessionCreated {
            session: "legacy-created".into(),
            cwd: String::new(),
            project_path: None,
            worktree_path: None,
            worktree_baseline: None,
            request_id: Some(request_id),
        });
        assert_eq!(a.cwd, ".");

        let mut session = activity_session("legacy-created", SessionActivity::default());
        session.cwd = "/durable/from-refresh".into();
        a.set_sessions(vec![session]);
        assert_eq!(a.cwd, "/durable/from-refresh");
    }

    #[test]
    fn matching_creation_error_restores_consumed_text_and_skills() {
        let mut a = app();
        let skill = a.skills.first().expect("built-in skill").clone();
        let doc = vec![
            DocBlock::Skill {
                skill_id: skill.id.clone(),
                params: HashMap::new(),
            },
            DocBlock::Text {
                text: "original draft".into(),
            },
        ];
        let user_echo_index = a.transcript.len();
        a.push("user", summarize(&doc));
        let request_id = a.begin_creation(Some(doc), Some(user_echo_index));
        a.input = "typed while waiting".into();

        a.on_engine_event(Event::Error {
            session: None,
            message: "provider did not start".into(),
            terminal: true,
            request_id: Some(request_id),
        });

        assert!(a.pending_creation.is_none());
        assert_eq!(a.input, "original draft\ntyped while waiting");
        assert_eq!(
            a.composed_skills,
            vec![(skill.id.clone(), skill.name.clone())]
        );
        assert!(a.transcript.iter().all(|item| item.kind != "user"));
        assert_eq!(a.transcript.last().unwrap().kind, "error");
    }

    #[tokio::test]
    async fn immediate_creation_submit_error_restores_the_document() {
        let provider = Provider {
            id: ProviderId::Custom("missing-test-provider".into()),
            display_name: "Missing test provider".into(),
            launch: LaunchSpec::new(
                "codetwo-provider-that-does-not-exist",
                std::iter::empty::<&'static str>(),
            ),
            needs_node: false,
        };
        let skills = builtin_skills();
        let skill = skills.first().expect("built-in skill").clone();
        let mut a = App::new(vec![provider.clone()], skills.clone());
        a.input = "retryable".into();
        a.composed_skills
            .push((skill.id.clone(), skill.name.clone()));
        let (engine, _events) = Engine::new(vec![provider], SkillLibrary::new(skills));

        a.submit(&engine).await;

        assert!(a.pending_creation.is_none());
        assert_eq!(a.input, "retryable");
        assert_eq!(a.composed_skills, vec![(skill.id, skill.name)]);
        assert!(a.status.starts_with("session creation failed:"));
    }

    fn begin_echoed_prompt(a: &mut App, doc: Vec<DocBlock>) -> String {
        a.active = Some("s".into());
        let echo_index = a.transcript.len();
        a.push("user", summarize(&doc));
        a.begin_prompt("s".into(), doc, Some(echo_index))
    }

    #[test]
    fn correlated_pre_accept_error_restores_only_its_echo_and_preserves_new_input() {
        let mut a = app();
        let skill = a.skills.first().expect("built-in skill").clone();
        let doc = vec![
            DocBlock::Skill {
                skill_id: skill.id.clone(),
                params: HashMap::new(),
            },
            DocBlock::Text {
                text: "original prompt".into(),
            },
        ];
        let summary = summarize(&doc);
        a.push("user", summary.clone());
        let request_id = begin_echoed_prompt(&mut a, doc);
        a.push("agent", "unrelated transcript item".into());
        a.input = "newer draft".into();
        a.composed_skills
            .push(("newer-skill".into(), "Newer skill".into()));

        a.on_engine_event(Event::Error {
            session: Some("s".into()),
            message: "turn already running".into(),
            terminal: false,
            request_id: Some(request_id),
        });

        assert!(a.pending_prompt.is_none());
        assert_eq!(a.input, "original prompt\nnewer draft");
        assert_eq!(
            a.composed_skills,
            vec![
                (skill.id, skill.name),
                ("newer-skill".into(), "Newer skill".into())
            ]
        );
        let user_echoes: Vec<_> = a
            .transcript
            .iter()
            .filter(|item| item.kind == "user")
            .collect();
        assert_eq!(user_echoes.len(), 1);
        assert_eq!(user_echoes[0].text, summary);
        assert!(a
            .transcript
            .iter()
            .any(|item| item.text == "unrelated transcript item"));
    }

    #[test]
    fn foreign_sessions_are_isolated_and_errors_after_acceptance_do_not_restore() {
        let mut a = app();
        let request_id = begin_echoed_prompt(
            &mut a,
            vec![DocBlock::Text {
                text: "accepted prompt".into(),
            }],
        );
        a.input = "newer draft".into();
        a.status = "waiting".into();

        a.on_engine_event(Event::TurnStarted {
            session: "another-session".into(),
            request_id: Some(request_id.clone()),
            transcript_seq: None,
        });
        a.on_engine_event(Event::Error {
            session: Some("another-session".into()),
            message: "same id on another session".into(),
            terminal: false,
            request_id: Some(request_id.clone()),
        });
        a.on_engine_event(Event::TurnStarted {
            session: "s".into(),
            request_id: Some("another-client".into()),
            transcript_seq: None,
        });
        a.on_engine_event(Event::Error {
            session: Some("s".into()),
            message: "another client failed".into(),
            terminal: false,
            request_id: Some("another-client".into()),
        });
        assert!(a.pending_prompt.is_some());
        assert_eq!(a.input, "newer draft");
        assert_eq!(a.status, "running…");

        a.on_engine_event(Event::TurnEnded {
            session: "s".into(),
            stop_reason: "remote done".into(),
        });

        a.on_engine_event(Event::TurnStarted {
            session: "s".into(),
            request_id: Some(request_id.clone()),
            transcript_seq: None,
        });
        assert!(a.pending_prompt.is_none());
        assert_eq!(a.status, "running…");

        a.on_engine_event(Event::Error {
            session: Some("s".into()),
            message: "provider failed after acceptance".into(),
            terminal: true,
            request_id: Some(request_id),
        });
        assert_eq!(a.input, "newer draft");
        assert_eq!(
            a.transcript
                .iter()
                .filter(|item| item.kind == "user")
                .count(),
            1
        );
    }

    #[tokio::test]
    async fn second_local_submit_is_not_consumed_while_acceptance_is_pending() {
        let mut a = app();
        a.active = Some("s".into());
        let request_id = begin_echoed_prompt(
            &mut a,
            vec![DocBlock::Text {
                text: "first".into(),
            }],
        );
        a.input = "second draft".into();
        a.composed_skills
            .push(("second-skill".into(), "Second skill".into()));
        let transcript_len = a.transcript.len();
        let (engine, _events) = Engine::new(Vec::new(), SkillLibrary::new(Vec::new()));

        a.submit(&engine).await;

        assert_eq!(a.pending_prompt.as_ref().unwrap().request_id, request_id);
        assert_eq!(a.input, "second draft");
        assert_eq!(
            a.composed_skills,
            vec![("second-skill".into(), "Second skill".into())]
        );
        assert_eq!(a.transcript.len(), transcript_len);
        assert_eq!(a.status, "prompt acceptance already pending");
    }

    #[tokio::test]
    async fn running_turn_blocks_submit_and_new_session_until_terminal_event() {
        let mut a = app();
        a.active = Some("s".into());
        a.on_engine_event(Event::TurnStarted {
            session: "s".into(),
            request_id: Some("live-request".into()),
            transcript_seq: None,
        });
        a.input = "keep this draft".into();
        let (engine, _events) = Engine::new(Vec::new(), SkillLibrary::new(Vec::new()));

        a.submit(&engine).await;
        assert_eq!(a.input, "keep this draft");
        assert!(a.pending_prompt.is_none());
        assert_eq!(a.status, "a turn is already running for this session");

        a.new_session(&engine).await;
        assert_eq!(a.active.as_deref(), Some("s"));
        assert_eq!(a.input, "keep this draft");
        assert_eq!(
            a.status,
            "finish or cancel the running turn before starting a new session"
        );

        a.on_engine_event(Event::Error {
            session: Some("s".into()),
            message: "provider stopped".into(),
            terminal: true,
            request_id: Some("live-request".into()),
        });
        assert!(!a.running_sessions.contains_key("s"));
        assert_eq!(a.status, "turn failed: provider stopped");
    }

    #[test]
    fn background_session_events_cannot_write_into_the_active_transcript() {
        let mut a = app();
        a.active = Some("active".into());
        a.status = "active ready".into();

        a.on_engine_event(Event::TurnStarted {
            session: "background".into(),
            request_id: Some("background-request".into()),
            transcript_seq: None,
        });
        a.on_engine_event(Event::AgentText {
            session: "background".into(),
            message_id: String::new(),
            text: "wrong conversation".into(),
            transcript_seq: None,
        });
        a.on_engine_event(Event::Error {
            session: Some("background".into()),
            message: "background warning".into(),
            terminal: false,
            request_id: Some("background-request".into()),
        });
        a.on_engine_event(Event::TurnEnded {
            session: "background".into(),
            stop_reason: "done".into(),
        });

        assert!(a.transcript.is_empty());
        assert_eq!(a.status, "active ready");
        assert!(!a.running_sessions.contains_key("background"));

        // A request-scoped rejection that this TUI never submitted or observed starting is also
        // foreign, even when it names the active session.
        a.on_engine_event(Event::Error {
            session: Some("active".into()),
            message: "another client's rejected prompt".into(),
            terminal: false,
            request_id: Some("unowned-request".into()),
        });
        assert!(a.transcript.is_empty());
    }

    fn permission_event(session: &str, request_id: &str) -> Event {
        Event::PermissionRequest {
            session: session.into(),
            request_id: request_id.into(),
            title: format!("permission {request_id}"),
            options: vec![("allow".into(), "Allow".into())],
            context: Default::default(),
        }
    }

    fn activity_session(id: &str, activity: SessionActivity) -> Session {
        let provider = default_registry()
            .first()
            .expect("default provider")
            .id
            .clone();
        let mut session = Session::new(provider, ".");
        session.id = id.into();
        session.title = format!("session {id}");
        session.activity = activity;
        session
    }

    #[tokio::test]
    async fn ctrl_n_from_an_active_worktree_uses_its_source_project_without_nesting() {
        let mut a = app();
        let mut session = activity_session("worktree", SessionActivity::default());
        session.cwd = "/tmp/session-worktree/packages/app".into();
        session.project_path = Some("/repo/packages/app".into());
        session.worktree_path = Some("/tmp/session-worktree".into());
        session.worktree_baseline = Some(ResolvedWorktreeBaseline {
            kind: WorktreeBaseline::Current,
            reference: "HEAD".into(),
            sha: "0123456789abcdef".into(),
            display: "HEAD".into(),
        });
        a.active = Some(session.id.clone());
        a.set_sessions(vec![session]);
        assert_eq!(a.cwd, "/tmp/session-worktree/packages/app");
        let (engine, _events) = Engine::new(Vec::new(), SkillLibrary::new(Vec::new()));

        a.handle_key(
            KeyEvent::new(KeyCode::Char('n'), KeyModifiers::CONTROL),
            &engine,
        )
        .await;

        assert!(a.active.is_none());
        assert_eq!(a.cwd, "/repo/packages/app");
        assert!(a.pending_creation.is_some());
    }

    #[tokio::test]
    async fn ctrl_n_fails_closed_for_a_legacy_worktree_without_source_provenance() {
        let mut a = app();
        let mut session = activity_session("legacy", SessionActivity::default());
        session.cwd = "/tmp/legacy-worktree".into();
        session.project_path = None;
        session.worktree_path = Some("/tmp/legacy-worktree".into());
        session.worktree_baseline = None;
        a.active = Some(session.id.clone());
        a.set_sessions(vec![session]);
        let (engine, _events) = Engine::new(Vec::new(), SkillLibrary::new(Vec::new()));

        a.handle_key(
            KeyEvent::new(KeyCode::Char('n'), KeyModifiers::CONTROL),
            &engine,
        )
        .await;

        assert_eq!(a.active.as_deref(), Some("legacy"));
        assert_eq!(a.cwd, "/tmp/legacy-worktree");
        assert!(a.pending_creation.is_none());
        assert!(a.status.contains("legacy worktree has no source project"));
    }

    fn permission_input(id: &str, sequence: u64) -> codetwo_core::PendingInput {
        codetwo_core::PendingInput {
            input_id: id.into(),
            kind: PendingInputKind::Permission,
            title: format!("permission {id}"),
            options: vec![("allow".into(), "Allow".into())],
            context: Default::default(),
            sequence,
        }
    }

    #[test]
    fn session_snapshot_restores_running_and_globally_ordered_permissions() {
        let mut a = app();
        a.set_sessions(vec![
            activity_session(
                "s1",
                SessionActivity {
                    revision: 3,
                    state: SessionRunState::AwaitingInput {
                        turn_id: "t1".into(),
                        prompt_request_id: Some("p1".into()),
                        pending: vec![permission_input("later", 8)],
                    },
                },
            ),
            activity_session(
                "s2",
                SessionActivity {
                    revision: 5,
                    state: SessionRunState::AwaitingInput {
                        turn_id: "t2".into(),
                        prompt_request_id: None,
                        pending: vec![permission_input("earlier", 2)],
                    },
                },
            ),
        ]);

        assert!(a.running_sessions.contains_key("s1"));
        assert!(a.running_sessions.contains_key("s2"));
        assert_eq!(
            a.permissions
                .iter()
                .map(|permission| permission.request_id.as_str())
                .collect::<Vec<_>>(),
            vec!["earlier", "later"]
        );
    }

    #[test]
    fn activity_revision_reconciles_multiple_permissions_without_rolling_back() {
        let mut a = app();
        a.set_sessions(vec![activity_session("s", SessionActivity::default())]);
        a.on_engine_event(Event::SessionActivityChanged {
            session: "s".into(),
            activity: SessionActivity {
                revision: 1,
                state: SessionRunState::AwaitingInput {
                    turn_id: "turn".into(),
                    prompt_request_id: Some("prompt".into()),
                    pending: vec![permission_input("one", 1), permission_input("two", 2)],
                },
            },
        });
        assert_eq!(a.permissions.len(), 2);

        a.on_engine_event(Event::SessionActivityChanged {
            session: "s".into(),
            activity: SessionActivity {
                revision: 2,
                state: SessionRunState::AwaitingInput {
                    turn_id: "turn".into(),
                    prompt_request_id: Some("prompt".into()),
                    pending: vec![permission_input("two", 2)],
                },
            },
        });
        assert_eq!(a.permissions.len(), 1);
        assert_eq!(a.permissions[0].request_id, "two");
        assert!(a.running_sessions.contains_key("s"));

        // A late list/event snapshot must not resurrect the answered request.
        a.on_engine_event(Event::SessionActivityChanged {
            session: "s".into(),
            activity: SessionActivity {
                revision: 1,
                state: SessionRunState::AwaitingInput {
                    turn_id: "turn".into(),
                    prompt_request_id: Some("prompt".into()),
                    pending: vec![permission_input("one", 1), permission_input("two", 2)],
                },
            },
        });
        assert_eq!(a.permissions.len(), 1);
        assert_eq!(a.permissions[0].request_id, "two");

        a.on_engine_event(Event::SessionActivityChanged {
            session: "s".into(),
            activity: SessionActivity {
                revision: 3,
                state: SessionRunState::Running {
                    turn_id: "turn".into(),
                    prompt_request_id: Some("prompt".into()),
                },
            },
        });
        assert!(a.permissions.is_empty());
        assert!(a.running_sessions.contains_key("s"));

        a.on_engine_event(Event::SessionActivityChanged {
            session: "s".into(),
            activity: SessionActivity {
                revision: 4,
                state: SessionRunState::Idle,
            },
        });
        assert!(!a.running_sessions.contains_key("s"));
    }

    #[test]
    fn session_list_renders_awaiting_and_failed_activity() {
        use codetwo_core::RunFailureReason;
        use ratatui::backend::TestBackend;
        use ratatui::Terminal;

        let mut a = app();
        a.set_sessions(vec![
            activity_session(
                "s1",
                SessionActivity {
                    revision: 1,
                    state: SessionRunState::AwaitingInput {
                        turn_id: "turn".into(),
                        prompt_request_id: None,
                        pending: vec![permission_input("permission", 1)],
                    },
                },
            ),
            activity_session(
                "s2",
                SessionActivity {
                    revision: 2,
                    state: SessionRunState::Failed {
                        turn_id: Some("turn".into()),
                        reason: RunFailureReason::ProviderError,
                        message: "provider stopped".into(),
                    },
                },
            ),
        ]);
        let backend = TestBackend::new(100, 30);
        let mut terminal = Terminal::new(backend).unwrap();
        terminal.draw(|frame| a.render(frame)).unwrap();
        let rendered = terminal
            .backend()
            .buffer()
            .content
            .iter()
            .map(|cell| cell.symbol())
            .collect::<String>();

        assert!(rendered.contains("waiting"));
        assert!(rendered.contains("failed"));
    }

    #[test]
    fn permissions_are_fifo_deduplicated_and_cleared_per_session() {
        let mut a = app();
        a.on_engine_event(permission_event("s1", "r1"));
        a.on_engine_event(permission_event("s1", "r1"));
        a.on_engine_event(permission_event("s1", "r2"));
        a.on_engine_event(permission_event("s2", "r3"));

        assert_eq!(a.permissions.len(), 3);
        assert_eq!(a.permissions.front().unwrap().request_id, "r1");
        a.on_engine_event(Event::TurnEnded {
            session: "s1".into(),
            stop_reason: "done".into(),
        });
        assert_eq!(a.permissions.len(), 1);
        assert_eq!(a.permissions.front().unwrap().request_id, "r3");

        a.on_engine_event(permission_event("s1", "r4"));
        a.on_engine_event(Event::Error {
            session: Some("s1".into()),
            message: "warning".into(),
            terminal: false,
            request_id: None,
        });
        assert_eq!(a.permissions.len(), 2, "warnings must not clear requests");
        a.on_engine_event(Event::Error {
            session: Some("s1".into()),
            message: "turn failed".into(),
            terminal: true,
            request_id: None,
        });
        assert_eq!(a.permissions.len(), 1);
        assert_eq!(a.permissions.front().unwrap().session, "s2");
    }

    #[test]
    fn permission_overlay_renders_the_queue_count() {
        use ratatui::backend::TestBackend;
        use ratatui::Terminal;

        let mut a = app();
        a.on_engine_event(permission_event("s", "r1"));
        a.on_engine_event(permission_event("s", "r2"));
        let backend = TestBackend::new(100, 30);
        let mut terminal = Terminal::new(backend).unwrap();

        terminal.draw(|frame| a.render(frame)).unwrap();

        let rendered = terminal
            .backend()
            .buffer()
            .content
            .iter()
            .map(|cell| cell.symbol())
            .collect::<String>();
        assert!(rendered.contains("permission requested (2 queued)"));
    }

    #[tokio::test]
    async fn permission_answer_pops_only_the_fifo_front() {
        let mut a = app();
        a.on_engine_event(permission_event("s", "r1"));
        a.on_engine_event(permission_event("s", "r2"));
        let (engine, _events) = Engine::new(Vec::new(), SkillLibrary::new(Vec::new()));

        a.handle_permission_key(
            KeyEvent::new(KeyCode::Char('9'), KeyModifiers::NONE),
            &engine,
        )
        .await;
        assert_eq!(a.permissions.len(), 2, "invalid choice must not pop");

        a.handle_permission_key(
            KeyEvent::new(KeyCode::Char('1'), KeyModifiers::NONE),
            &engine,
        )
        .await;
        assert_eq!(a.permissions.len(), 1);
        assert_eq!(a.permissions.front().unwrap().request_id, "r2");
    }

    #[test]
    fn events_render_into_transcript() {
        let mut a = app();
        a.active = Some("s".into());
        a.on_engine_event(Event::AgentText {
            session: "s".into(),
            message_id: String::new(),
            text: "hello".into(),
            transcript_seq: None,
        });
        assert_eq!(a.transcript.len(), 1);
        assert_eq!(a.transcript[0].kind, "agent");
    }

    #[test]
    fn canvas_summary_is_read_only_and_contains_revision_and_pixel_policy() {
        let doc = vec![DocBlock::Canvas {
            id: "canvas-123456".into(),
            frozen_revision: 7,
            pixel_policy: codetwo_core::CanvasPixelPolicy::Required,
        }];
        assert_eq!(summarize(&doc), "[canvas:canvas-1@7 · pixels]");
    }

    #[test]
    fn canvas_history_page_hydration_projects_read_only_markers_and_preserves_prompt_text() {
        let marker = codetwo_core::encode_canvas_history_marker(
            "canvas-123456789",
            7,
            "Planning board",
            &["first note".into(), "second note".into()],
        );
        let malformed =
            "[canvas-history-json {\"version\":1,\"id\":\"broken\",\"revision\":\"7\",\"title\":\"Nope\",\"text_originals\":[]}]";
        let page = TranscriptPage {
            entries: vec![
                TranscriptEntry {
                    seq: 1,
                    role: Role::User,
                    part: Part::Prompt {
                        text: format!("before\n\n{marker}\n\nafter"),
                        display: "before\n\nafter".into(),
                    },
                },
                TranscriptEntry {
                    seq: 2,
                    role: Role::User,
                    part: Part::Prompt {
                        text: format!("keep malformed\n{malformed}"),
                        display: String::new(),
                    },
                },
                TranscriptEntry {
                    seq: 3,
                    role: Role::Agent,
                    part: Part::Text {
                        text: "ordinary agent reply".into(),
                    },
                },
            ],
            next_before: None,
            snapshot_through: None,
        };
        let mut a = app();
        a.hydrate_transcript_page(page);

        assert_eq!(a.transcript.len(), 3);
        assert!(a.transcript[0].text.contains("before"));
        assert!(a.transcript[0].text.contains("after"));
        assert!(a.transcript[0].text.contains("Planning board"));
        assert!(a.transcript[0].text.contains("canvas-1@7"));
        assert!(a.transcript[0].text.contains("2 text objects"));
        assert!(a.transcript[0].text.contains("read-only"));
        assert!(!a.transcript[0].text.contains(&marker));
        assert!(a.transcript[1].text.contains("keep malformed"));
        assert!(a.transcript[1].text.contains(malformed));
        assert_eq!(a.transcript[2].text, "ordinary agent reply");
        assert!(a.pending_creation.is_none());
        assert!(a.pending_prompt.is_none());
        assert!(a.composed_skills.is_empty());
    }

    #[test]
    fn canvas_history_startup_path_hydrates_a_persisted_marker_for_the_recent_session() {
        use std::sync::Arc;

        let mut a = app();
        let session = activity_session("persisted-session", SessionActivity::default());
        let marker = codetwo_core::encode_canvas_history_marker(
            "canvas-persisted-123",
            11,
            "Saved board",
            &["one".into(), "two".into(), "three".into()],
        );
        let prompt = Part::Prompt {
            text: format!("ordinary persisted prompt\n\n{marker}"),
            display: "ordinary persisted prompt".into(),
        };
        let store = Arc::new(codetwo_core::Store::open_in_memory().unwrap());
        store.upsert_session(&session).unwrap();
        store.append_part(&session.id, Role::User, &prompt).unwrap();
        let (engine, _events) =
            Engine::with_store(Vec::new(), SkillLibrary::new(Vec::new()), store);

        a.set_sessions(engine.list_sessions().unwrap());
        a.load_recent_session_history(&engine).unwrap();

        assert_eq!(a.active.as_deref(), Some("persisted-session"));
        assert_eq!(a.transcript.len(), 1);
        assert!(a.transcript[0].text.contains("ordinary persisted prompt"));
        assert!(a.transcript[0].text.contains("Saved board"));
        assert!(a.transcript[0].text.contains("canvas-p@11"));
        assert!(a.transcript[0].text.contains("3 text objects"));
        assert!(a.transcript[0].text.contains("read-only"));
        assert!(!a.transcript[0].text.contains(&marker));
        assert!(a.pending_creation.is_none());
        assert!(a.pending_prompt.is_none());
        assert!(a.composed_skills.is_empty());
    }
}
