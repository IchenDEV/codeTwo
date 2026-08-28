//! C2's plugin composition layer.
//!
//! This is C2's shared composition root between the product [`codetwo_core`] and the generic
//! [`codetwo_kernel`]. It turns Core capabilities into built-in runtime modules, manages installed
//! extension Bundles, and exposes the single host-facing [`CoreApp`] seam. Host binaries may add
//! their own platform modules, but shared plugin behavior belongs here.
//!
//! Dependency direction is intentionally one way:
//!
//! ```text
//! codetwo-plugins -> codetwo-core
//!                 -> codetwo-kernel
//! ```
//!
//! Core contains no plugin lifecycle, bundle, or protocol knowledge.

mod app;

pub mod bundle;
pub mod marketplace;

pub use app::events;
pub use app::plugins as builtins;
pub use app::protocol;
#[doc(hidden)]
pub use app::testing;
pub use app::{
    normalize_project_path, AppConfig, CanvasService, CoreApp, CostService, EngineService,
    EventBus, HandoffService, KeymapService, LoaderService, MemoryService, Paths,
    PluginActiveResource, PluginCatalog, PluginCatalogEntry, PluginChangePlan, PluginChangeRequest,
    PluginChangeResult, PluginConfigDocument, PluginConfigError, PluginConfigService,
    PluginConfigStore, PluginHub, PluginManager, PluginManagerError, PluginOverride, PluginPolicy,
    PluginRecoveryState, PluginScope, ProjectActivityLease, ProviderService, ProviderSummary,
    SceneRuntimeService, SceneService, SkillService, StoreService, TerminalEvent,
    TerminalOutputEvent, TerminalService,
};
