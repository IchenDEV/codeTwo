//! Code2 core — the shared brain behind both the Tauri desktop app and the ratatui TUI.
//!
//! Nothing in here knows about a UI. Frontends drive the core through the SQ/EQ interface
//! ([`Op`] in, [`Event`] out) and render the [`Event`] stream however they like.
//!
//! Module map:
//! - [`acp`] — Agent Client Protocol client (JSON-RPC over stdio) used to drive provider CLIs.
//! - [`provider`] — registry of provider launch specs (Claude Code / Codex / Grok).
//! - [`models`] — built-in model lists for providers that don't report their own over ACP.
//! - [`session`] — session / message / part model.
//! - [`skill`] — skill library + the document → prompt compiler (the product differentiator).
//! - [`permission`] — ask/allow/deny engine and permission modes (incl. YOLO).
//! - [`event`] — the Op/Event types exchanged with frontends.
//! - [`error`] — shared error types.

pub mod acp;
pub mod browser;
pub mod context;
pub mod delegate;
pub mod engine;
pub mod error;
pub mod event;
pub mod git;
pub mod issues;
pub mod keymap;
pub mod market;
pub mod models;
pub mod permission;
pub mod project;
pub mod provider;
pub mod pty;
pub mod rules;
pub mod session;
pub mod skill;
pub mod store;
pub mod term;
pub mod tmux;
pub mod usage;
pub mod voice;
pub mod workspace;
pub mod worktree;

pub use browser::Annotation;
pub use engine::{Engine, PermissionRouter, SessionHandler};
pub use error::{AcpError, RpcError};
pub use event::{Event, Op};
pub use git::{Checkpoint, GitFile, GitStatus};
pub use issues::Issue;
pub use keymap::{Action as KeyAction, Keymap};
pub use market::MarketEntry;
pub use models::builtin_models;
pub use context::{estimate_tokens, ContextUsage};
pub use permission::{Action, PermissionMode, PermissionPolicy, Rule, SandboxPolicy};
pub use project::{ProjectConfig, ProjectScript};
pub use provider::{default_registry, LaunchSpec, Provider, ProviderId};
pub use pty::PtySession;
pub use session::{Message, Part, Role, Session, SessionId};
pub use skill::{compile, CompiledPrompt, DocBlock, McpServer, Skill, SkillKind, SkillLibrary, SkillPayload};
pub use store::{Store, StoreError};
pub use term::{Scope, TerminalConfig, TerminalHandle, TerminalOutput};
