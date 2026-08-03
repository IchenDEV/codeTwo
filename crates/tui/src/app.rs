//! TUI application state + rendering + input handling. The state transitions in [`App::on_engine_event`]
//! are pure (no engine, no terminal), so they're unit-tested; input handling drives the shared core
//! [`Engine`] exactly like the desktop bridge does.

use std::collections::HashMap;

use codetwo_core::event::Event;
use codetwo_core::permission::PermissionMode;
use codetwo_core::provider::Provider;
use codetwo_core::session::Session;
use codetwo_core::skill::{DocBlock, Skill};
use codetwo_core::{Engine, Op};

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
    pub permission: Option<PermReq>,
    pub mode: PermissionMode,
    pub cwd: String,
    pub use_worktree: bool,
    pub status: String,
    pub should_quit: bool,
    pending_doc: Option<Vec<DocBlock>>,
    pending_send: Option<(String, Vec<DocBlock>)>,
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
            permission: None,
            mode: PermissionMode::Ask,
            cwd: ".".into(),
            use_worktree: false,
            status: "ready".into(),
            should_quit: false,
            pending_doc: None,
            pending_send: None,
        }
    }

    fn provider_name(&self) -> &str {
        self.providers.get(self.provider_idx).map(|p| p.display_name.as_str()).unwrap_or("?")
    }

    /// Pure state transition for a core event. Unit-tested.
    pub fn on_engine_event(&mut self, ev: Event) {
        match ev {
            Event::SessionCreated { session } => {
                self.active = Some(session.clone());
                self.status = format!("session {}", short(&session));
                if let Some(doc) = self.pending_doc.take() {
                    self.pending_send = Some((session, doc));
                }
            }
            Event::AgentText { text, .. } => self.push("agent", text),
            Event::AgentThought { text, .. } => self.push("thought", text),
            Event::ToolCall { id, title, status, .. } => {
                let label = if title.is_empty() { id } else { title };
                self.push("tool", format!("{label} — {status}"));
            }
            Event::Plan { entries, .. } => self.push("plan", entries.join("\n")),
            Event::PermissionRequest { session, request_id, title, options } => {
                self.permission = Some(PermReq { session, request_id, title, options });
            }
            Event::Usage { .. } => {}
            // The TUI has no picker yet, but the agent's choice belongs in the status line rather
            // than being dropped on the floor.
            Event::Models { available, current, .. } => {
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
            Event::ConfigOptions { options, .. } => {
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
            Event::TurnEnded { stop_reason, .. } => {
                self.status = format!("turn ended: {stop_reason}");
                self.push("end", stop_reason);
            }
            Event::Error { message, .. } => self.push("error", message),
        }
    }

    fn push(&mut self, kind: &'static str, text: String) {
        self.transcript.push(TItem { kind, text });
    }

    /// A pending prompt to send once the session exists (returned to the loop, which owns the engine).
    pub fn take_pending_send(&mut self) -> Option<(String, Vec<DocBlock>)> {
        self.pending_send.take()
    }

    pub async fn handle_key(&mut self, key: KeyEvent, engine: &Engine) {
        if key.kind != KeyEventKind::Press {
            return;
        }
        let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);

        // Permission overlay captures input.
        if self.permission.is_some() {
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
        let Some(perm) = &self.permission else { return };
        match key.code {
            KeyCode::Char(c) if c.is_ascii_digit() => {
                let idx = c.to_digit(10).unwrap() as usize;
                if idx >= 1 && idx <= perm.options.len() {
                    let opt = perm.options[idx - 1].0.clone();
                    let (session, rid) = (perm.session.clone(), perm.request_id.clone());
                    self.permission = None;
                    let _ = engine
                        .submit(Op::AnswerPermission { session, request_id: rid, option_id: Some(opt) })
                        .await;
                }
            }
            KeyCode::Esc => {
                let (session, rid) = (perm.session.clone(), perm.request_id.clone());
                self.permission = None;
                let _ = engine
                    .submit(Op::AnswerPermission { session, request_id: rid, option_id: None })
                    .await;
            }
            _ => {}
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
        let mut doc: Vec<DocBlock> = self
            .composed_skills
            .iter()
            .map(|(id, _)| DocBlock::Skill { skill_id: id.clone(), params: HashMap::new() })
            .collect();
        if !self.input.trim().is_empty() {
            doc.push(DocBlock::Text { text: std::mem::take(&mut self.input) });
        }
        self.input.clear();
        if doc.is_empty() {
            return;
        }
        self.push("user", summarize(&doc));
        self.composed_skills.clear();

        match self.active.clone() {
            Some(s) => {
                let _ = engine.submit(Op::Prompt { session: s, doc }).await;
            }
            None => {
                self.pending_doc = Some(doc);
                let provider = self.providers[self.provider_idx].id.clone();
                self.status = "creating session…".into();
                let _ = engine
                    .submit(Op::NewSession { provider, cwd: self.cwd.clone(), use_worktree: self.use_worktree })
                    .await;
            }
        }
    }

    async fn new_session(&mut self, engine: &Engine) {
        self.pending_doc = None;
        self.active = None;
        self.transcript.clear();
        let provider = self.providers[self.provider_idx].id.clone();
        self.status = "creating session…".into();
        let _ = engine
            .submit(Op::NewSession { provider, cwd: self.cwd.clone(), use_worktree: self.use_worktree })
            .await;
    }

    async fn cycle_mode(&mut self, engine: &Engine) {
        self.mode = match self.mode {
            PermissionMode::Ask => PermissionMode::AcceptEdits,
            PermissionMode::AcceptEdits => PermissionMode::Yolo,
            PermissionMode::Yolo => PermissionMode::Ask,
        };
        self.status = format!("mode: {:?}", self.mode);
        if let Some(s) = self.active.clone() {
            let _ = engine.submit(Op::SetPermissionMode { session: s, mode: self.mode }).await;
        }
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
        if self.permission.is_some() {
            self.render_permission(f);
        }
    }

    fn render_sessions(&self, f: &mut Frame, area: Rect) {
        let items: Vec<ListItem> = if self.sessions.is_empty() {
            vec![ListItem::new(Line::from(Span::styled("no sessions", Style::default().fg(Color::DarkGray))))]
        } else {
            self.sessions
                .iter()
                .map(|s| {
                    let active = self.active.as_deref() == Some(&s.id);
                    let marker = if active { "▸ " } else { "  " };
                    ListItem::new(Line::from(format!("{marker}{}", s.title)))
                })
                .collect()
        };
        let list = List::new(items).block(Block::default().borders(Borders::ALL).title(" sessions "));
        f.render_widget(list, area);
    }

    fn render_transcript(&self, f: &mut Frame, area: Rect) {
        let lines: Vec<Line> = self
            .transcript
            .iter()
            .flat_map(|item| transcript_lines(item))
            .collect();
        let take = lines.len().saturating_sub(area.height.saturating_sub(2) as usize);
        let visible: Vec<Line> = lines.into_iter().skip(take).collect();
        let p = Paragraph::new(visible)
            .block(Block::default().borders(Borders::ALL).title(" transcript "))
            .wrap(Wrap { trim: false });
        f.render_widget(p, area);
    }

    fn render_compose(&self, f: &mut Frame, area: Rect) {
        let chips = if self.composed_skills.is_empty() {
            Line::from(Span::styled("no skills — press / to add", Style::default().fg(Color::DarkGray)))
        } else {
            let spans: Vec<Span> = self
                .composed_skills
                .iter()
                .map(|(_, name)| Span::styled(format!(" ▸{name} "), Style::default().fg(Color::Cyan)))
                .collect();
            Line::from(spans)
        };
        let body = vec![chips, Line::from(format!("> {}", self.input))];
        let p = Paragraph::new(body)
            .block(Block::default().borders(Borders::ALL).title(" compose (Enter=run  /=skill) "))
            .wrap(Wrap { trim: false });
        f.render_widget(p, area);
    }

    fn render_status(&self, f: &mut Frame, area: Rect) {
        let mode = format!("{:?}", self.mode);
        let text = format!(
            " {}  │  provider:{}  mode:{}  wt:{}  │  Tab=provider ^N=new ^K=mode ^C=quit ",
            self.status,
            self.provider_name(),
            mode,
            if self.use_worktree { "on" } else { "off" },
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
                    ListItem::new(Line::from(Span::styled(line, Style::default().add_modifier(Modifier::REVERSED))))
                } else {
                    ListItem::new(Line::from(line))
                }
            })
            .collect();
        let area = centered(f.area(), 46, 40);
        f.render_widget(Clear, area);
        f.render_widget(
            List::new(items).block(Block::default().borders(Borders::ALL).title(" skills (↑↓ Enter Esc) ")),
            area,
        );
    }

    fn render_permission(&self, f: &mut Frame) {
        let Some(perm) = &self.permission else { return };
        let mut lines = vec![
            Line::from(Span::styled(perm.title.clone(), Style::default().add_modifier(Modifier::BOLD))),
            Line::from(""),
        ];
        for (i, (_, label)) in perm.options.iter().enumerate() {
            lines.push(Line::from(format!("  {}. {label}", i + 1)));
        }
        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled("Esc to cancel", Style::default().fg(Color::DarkGray))));
        let area = centered(f.area(), 50, 40);
        f.render_widget(Clear, area);
        f.render_widget(
            Paragraph::new(lines)
                .block(Block::default().borders(Borders::ALL).title(" permission requested "))
                .wrap(Wrap { trim: false }),
            area,
        );
    }
}

fn short(id: &str) -> String {
    id.chars().take(8).collect()
}

fn summarize(doc: &[DocBlock]) -> String {
    doc.iter()
        .map(|b| match b {
            DocBlock::Text { text } => text.clone(),
            DocBlock::Skill { skill_id, .. } => format!("[skill:{skill_id}]"),
            DocBlock::File { path } => format!("[@{path}]"),
            DocBlock::Image { path } => format!("[img:{path}]"),
            DocBlock::Session { session_id } => format!("[chat:{}]", short(session_id)),
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn transcript_lines(item: &TItem) -> Vec<Line<'static>> {
    let (prefix, style) = match item.kind {
        "user" => ("▶ ", Style::default().add_modifier(Modifier::BOLD)),
        "thought" => ("· ", Style::default().fg(Color::DarkGray).add_modifier(Modifier::ITALIC)),
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
    let [h] = Layout::horizontal([Constraint::Length(width)]).flex(Flex::Center).areas(v);
    h
}

#[cfg(test)]
mod tests {
    use super::*;
    use codetwo_core::default_registry;
    use codetwo_core::skill::builtin_skills;

    fn app() -> App {
        App::new(default_registry(), builtin_skills())
    }

    #[test]
    fn session_created_sets_active_and_flushes_pending() {
        let mut a = app();
        a.pending_doc = Some(vec![DocBlock::Text { text: "hi".into() }]);
        a.on_engine_event(Event::SessionCreated { session: "sess-123456789".into() });
        assert_eq!(a.active.as_deref(), Some("sess-123456789"));
        let pending = a.take_pending_send().expect("pending prompt flushed");
        assert_eq!(pending.0, "sess-123456789");
    }

    #[test]
    fn events_render_into_transcript_and_permission() {
        let mut a = app();
        a.on_engine_event(Event::AgentText { session: "s".into(), message_id: String::new(), text: "hello".into() });
        assert_eq!(a.transcript.len(), 1);
        assert_eq!(a.transcript[0].kind, "agent");

        a.on_engine_event(Event::PermissionRequest {
            session: "s".into(),
            request_id: "r".into(),
            title: "rm -rf".into(),
            options: vec![("allow".into(), "Allow".into())],
        });
        assert!(a.permission.is_some());
    }
}
