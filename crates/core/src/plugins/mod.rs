//! C2's plugin composition layer — built-in adapters, CoreApp, extension Bundles, and protocol.
//!
//! Turns Core capabilities into kernel runtime modules, manages installed extension Bundles,
//! and exposes the single host-facing [`CoreApp`] seam.

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
