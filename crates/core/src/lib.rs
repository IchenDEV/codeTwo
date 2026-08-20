//! C2 core — the shared brain behind both the Electrobun desktop app and the ratatui TUI.
//!
//! Nothing in here knows about a UI. Frontends drive the core through the SQ/EQ interface
//! ([`Op`] in, [`Event`] out) and render the [`Event`] stream however they like.
//!
//! Module map:
//! - [`app`] — the plugin graph: every subsystem below, wired by declaration instead of by a
//!   constructor. Start here; the modules it lists are its parts.
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
pub mod app;
pub mod artifact;
pub mod automation;
pub mod brief;
pub mod browser;
pub mod canvas;
pub mod codex_runtime;
pub mod context;
pub mod cost;
pub mod delegate;
pub mod elicitation;
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
pub mod scene;
pub mod scene_artifact;
pub mod scene_runtime;
pub mod scene_v2;
pub mod session;
pub mod skill;
pub mod source_control;
pub mod store;
pub mod task;
pub mod term;
pub mod testsignal;
pub mod tmux;
pub mod usage;
pub mod voice;
pub mod workspace;
pub mod workspace_search;
pub mod worktree;

pub use activity::{ActivityTracker, TurnLease};
pub use artifact::{ArtifactRef, ArtifactStore, ToolOutput, ToolOutputNormalizer};
pub use automation::{
    next_automation_run_after, Automation, AutomationInput, AutomationRun,
    AutomationRunStatus,
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
pub use engine::{
    lower_canvas_prompt_payload, DesktopMcpConfig, Engine, PermissionRouter, SessionHandler,
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
    Action, ExecutionPolicy, PermissionContext, PermissionContextKind, PermissionMode,
    PermissionPolicy, Rule, SandboxPolicy,
};
pub use project::{ProjectConfig, ProjectScript};
pub use provider::{
    default_registry, registry_with_codex_runtime, CapabilityState, LaunchSpec, Provider,
    ProviderCapability, ProviderCapabilityId, ProviderId,
};
pub use pty::PtySession;
pub use scene::{
    apply_execution, is_artifact_id, is_slug, memory_preset_policy, outgoing_edges, plan_apply,
    policy_session_mode, prompt_preamble, session_mode_policy, validate_pipeline, validate_scene,
    ApplyStrength, BriefClarify, CarriedArtifact, CarrySpec, EffectiveTransition,
    EscalationRequired, ExitCriterion, ExitCriterionKind, Gate, HookAction, HookActionKind,
    HookEvent, NextSuggestion, PendingField, Pipeline, PipelineStage, PipelineTransition,
    ResolvedPipeline, ResolvedScene, Scene, SceneApplyPlan, SceneArtifactKind, SceneArtifactSpec,
    SceneBrief, SceneConstraints, SceneExecution, SceneExit, SceneHook, SceneInlineFragment,
    SceneLibrary, SceneLocalization, SceneMemoryPreset, SceneSessionMode, SceneSessionParams,
    SceneSkills, SceneSource, SceneWorktree, ToolHints, TransitionTrigger, PIPELINE_SCHEMA_ID,
    SCENE_SCHEMA_ID,
};
pub use scene_artifact::{
    extract_artifact_blocks, SceneArtifactRecord, SceneArtifactStore, MAX_CARRY_CONTENT_BYTES,
};
pub use scene_runtime::{evaluate_exit, ExitEvaluation, SceneRuntime};
pub use scene_v2::{
    parse_scene_v2, validate_scene_v2, ResolvedSceneV2, SceneCatalogDiagnostic, SceneCatalogV2,
    SceneDefinitionV2, SceneV2Author, SceneV2Error, SceneV2Localization, SceneV2Origin,
    SCENE_V2_SCHEMA_ID,
};
pub use session::{
    MemoryAccess, Message, Part, PendingInput, PendingInputKind, Role, RunFailureReason, Session,
    SessionActivity, SessionId, SessionRunState, SessionTitleOrigin, TranscriptCursor,
    TranscriptEntry, TranscriptPage, DEFAULT_TRANSCRIPT_TURNS, MAX_TRANSCRIPT_TURNS,
};
pub use skill::{
    canonical_doc_text, compile, compile_full, compile_with_canvas, CompiledCanvas, CompiledPrompt,
    DocBlock, McpServer, McpTransport, Skill, SkillKind, SkillLibrary, SkillPayload, SlotDef,
    SlotKind, SubagentDefinition,
};
pub use source_control::{SourceControlInfo, SourceControlProviderKind};
pub use store::{IssueDelegation, 
    PipelineInstance, PipelineTransitionRecord, SessionSearchHit, Store, StoreError,
};
pub use task::{
    AgentAssignment, AgentId, AgentRole, AgentSkillOrigin, AgentSkillRef, AgentStatus,
    ArtifactProvenance, ProviderConfiguration, ResultContract, RunSnapshot, SceneOrigin, SceneRef,
    Task, TaskArtifactStatus, TaskBudget, TaskGraph, TaskId, TaskStatus, WorkItem, WorkItemEdge,
    WorkItemId, WorkItemStatus,
};
pub use term::{Scope, TerminalConfig, TerminalHandle, TerminalOutput};
pub use testsignal::{classify_test_command, test_outcome, TestOutcome};
pub use workspace_search::{WorkspaceContentMatch, WorkspaceSearchOptions, WorkspaceSearchResult};
