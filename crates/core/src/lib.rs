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
pub mod activity;
pub mod automation;
pub mod browser;
pub mod canvas;
pub mod context;
pub mod credential;
pub mod delegate;
pub mod engine;
pub mod error;
pub mod event;
pub mod git;
pub mod github_skills;
pub mod harness;
pub mod issues;
pub mod keymap;
pub mod market;
pub mod memory;
pub mod models;
pub mod permission;
pub mod plugin;
pub mod plugin_marketplace;
pub mod project;
pub mod provider;
pub mod pty;
pub mod rules;
pub mod session;
pub mod skill;
pub mod source_control;
pub mod store;
pub mod term;
pub mod tmux;
pub mod usage;
pub mod voice;
pub mod work;
pub mod work_artifact;
pub mod work_snapshot;
pub mod workspace;
pub mod workspace_search;
pub mod worktree;

pub use activity::{ActivityTracker, TurnLease};
pub use automation::{
    AutomationError, AutomationFailure, AutomationFailureCode, AutomationNotification,
    AutomationNotificationKind, AutomationPage, AutomationPathPolicy, AutomationRun,
    AutomationRunStatus, AutomationSpec, AutomationTrigger, AutomationTriggerConfig,
    AutomationValidation, AutomationWait, AutomationWaitCode, CronTrigger, DueOccurrence,
    DueSummary, FilesystemTrigger, OneShotTrigger, RecurringTrigger, ScheduleTrigger,
};
pub use browser::Annotation;
pub use canvas::{
    canvas_search_projection, deterministic_summary, encode_canvas_history_marker, normalize_media,
    parse_canvas_history_marker, resolve_prompt_payload, CanvasAssetRef, CanvasDraft,
    CanvasDraftUpdate, CanvasError, CanvasExport, CanvasExportBudget, CanvasExportKind,
    CanvasFeatureGate, CanvasFreezeInput, CanvasHistoryMarker, CanvasId, CanvasManifest,
    CanvasObject, CanvasObjectKind, CanvasPixelPolicy, CanvasPoint, CanvasPromptPayload,
    CanvasProviderImageCapability, CanvasRect, CanvasRef, CanvasRevision, CanvasSceneEnvelope,
    CanvasSnapshot, CanvasStaticAsset, CanvasTheme, CanvasTool, CANVAS_FEATURE_GATE,
    CANVAS_SCHEMA_VERSION, EXCALIDRAW_ENGINE, EXCALIDRAW_ENGINE_VERSION,
};
pub use context::{estimate_tokens, ContextUsage};
pub use credential::{
    decode_legacy_mcp_server, disabled_legacy_mcp_server, map_keychain_os_status,
    migrate_json_file, migrate_mcp_config, migrate_plugin_dir, migrate_plugin_metadata,
    migrate_skill_json_dir, platform_secret_store, sanitize_json_bytes, InMemorySecretStore,
    MigrationError, MigrationReport, MigrationResult, SecretRef, SecretStore, SecretStoreError,
    UnsupportedSecretStore,
};
pub use engine::{
    encode_mcp_servers_with_gateway, lower_canvas_prompt_payload, Engine, McpGatewayBroker,
    PermissionRouter, SessionHandler,
};
pub use error::{AcpError, RpcError};
pub use event::{Event, Op};
pub use git::{Checkpoint, GitFile, GitStatus};
pub use issues::Issue;
pub use keymap::{Action as KeyAction, Keymap};
pub use market::MarketEntry;
pub use memory::{
    MemoryCanvasRef, MemoryContext, MemoryReceipt, MemoryReceiptItem, MemoryRecord, MemorySettings,
    MemorySourceRef, MemoryStats, MemoryTurnAudit, MemoryTurnProvenance,
};
pub use models::builtin_models;
pub use permission::{
    Action, ExecutionPolicy, PermissionMode, PermissionPolicy, Rule, SandboxPolicy,
};
pub use project::{ProjectConfig, ProjectScript};
pub use provider::{default_registry, LaunchSpec, Provider, ProviderId};
pub use pty::PtySession;
pub use session::{
    MemoryAccess, Message, Part, PendingInput, PendingInputKind, Role, RunFailureReason, Session,
    SessionActivity, SessionId, SessionRunState, SessionTitleOrigin, TranscriptCursor,
    TranscriptEntry, TranscriptPage, DEFAULT_TRANSCRIPT_TURNS, MAX_TRANSCRIPT_TURNS,
};
pub use skill::{
    canonical_doc_text, compile, compile_with_canvas, CompiledCanvas, CompiledPrompt, DocBlock,
    McpCredentialState, McpCredentialValidation, McpEncodeError, McpGatewayBinding,
    McpGatewayTransport, McpSecretBinding, McpServer, McpTransport, Skill, SkillKind, SkillLibrary,
    SkillPayload, SubagentDefinition,
};
pub use source_control::{SourceControlInfo, SourceControlProviderKind};
pub use store::{SessionSearchHit, Store, StoreError};
pub use term::{Scope, TerminalConfig, TerminalHandle, TerminalOutput};
pub use work::{
    entity_head as work_entity_head, high_water as work_high_water,
    install_schema as install_work_schema, mutation_history as work_mutation_history,
    BriefRevision, BriefSaveResult, Deliverable, DeliverableSaveResult, Run, RunChange,
    RunSnapshot, Task, TaskExperience, TaskStatus, WorkAuditContext, WorkEntityHead,
    WorkEntityKind, WorkMutation, WorkMutationGuard, WorkPage, WorkRunBinding, WorkVersioned,
    Workspace, WorkspaceKind, MAX_WORK_PAGE_SIZE,
};
pub use work_artifact::{
    ArtifactRegistration, WorkArtifactError, WorkArtifactService, MAX_WORK_ARTIFACT_BYTES,
};
pub use work_snapshot::{
    NoRollbackPreparation, NotCoveredPath, NotCoveredReason, PlatformSnapshotCopier,
    RequiresRollbackDecision, RollbackConflict, RollbackHook, RollbackReport, SnapshotChange,
    SnapshotChangeKind, SnapshotComparison, SnapshotConfig, SnapshotCopier, SnapshotError,
    SnapshotFile, SnapshotManifest, SnapshotPreparation, SnapshotPreparationOptions,
    WorkspaceSnapshot, WorkspaceSnapshotService,
};
pub use workspace_search::{WorkspaceContentMatch, WorkspaceSearchOptions, WorkspaceSearchResult};
