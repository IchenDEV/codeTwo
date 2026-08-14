//! Every built-in plugin, and the registry that makes them loadable by name.
//!
//! Adding a subsystem to Code2 means writing one file here and one line in the config. Nothing
//! else in the codebase has to learn about it — not a state struct, not a constructor, not a
//! dispatch table.

mod canvas;
mod engine;
mod extensions;
mod foundation;
mod hub;
mod issues;
mod library;
mod memory;
mod runtime;
mod scene_commands;
mod terminal;
mod utility;
mod workspace;
mod workspace_io;

pub use canvas::{CanvasPlugin, DocumentPlugin};
pub use engine::{EngineBuilder, EngineInputs, EnginePlugin};
pub use extensions::ExtensionsPlugin;
pub use foundation::{BusPlugin, PathsPlugin, ProvidersPlugin, StorePlugin};
pub use hub::{HubPlugin, KernelPlugin};
pub use issues::IssuesPlugin;
pub use library::{ScenesPlugin, SkillsPlugin};
pub use memory::MemoryPlugin;
pub use runtime::{CostPlugin, SceneRuntimePlugin};
pub use scene_commands::SceneCommandsPlugin;
pub use terminal::TerminalPlugin;
pub use utility::{UsagePlugin, VoicePlugin};
pub use workspace::{GitPlugin, KeymapPlugin, MarketPlugin};
pub use workspace_io::{ArtifactsPlugin, ProjectsPlugin, WorkspacePlugin, WorkspaceSearchPlugin};

use codetwo_kernel::PluginRegistry;

/// The names of every built-in, in the order a fresh config enables them.
///
/// Order is documentation, not sequencing — the kernel resolves the real order from each plugin's
/// injections. `engine` listed last would load just the same.
pub const BUILTIN: &[&str] = &[
    "paths",
    "store",
    "bus",
    "providers",
    "plugin-hub",
    "skills",
    "scenes",
    "engine",
    "git",
    "memory",
    "market",
    "workspace",
    "projects",
    "artifacts",
    "workspace-search",
    "usage",
    "voice",
    "issues",
    "canvas",
    "document",
    "keymap",
    "scene-runtime",
    "scene-commands",
    "terminal",
    "cost",
    "kernel",
    "extensions",
];

/// Everything Code2 ships, ready to be loaded by name from a config file.
pub fn builtin_registry() -> PluginRegistry {
    let mut registry = PluginRegistry::new();
    registry.register(|| PathsPlugin);
    registry.register(|| StorePlugin);
    registry.register(|| BusPlugin);
    registry.register(|| ProvidersPlugin);
    registry.register(|| HubPlugin);
    registry.register(|| SkillsPlugin);
    registry.register(|| ScenesPlugin);
    registry.register(EnginePlugin::new);
    registry.register(|| GitPlugin);
    registry.register(|| MemoryPlugin);
    registry.register(|| MarketPlugin);
    registry.register(|| WorkspacePlugin);
    registry.register(|| ProjectsPlugin);
    registry.register(|| ArtifactsPlugin);
    registry.register(|| WorkspaceSearchPlugin);
    registry.register(|| UsagePlugin);
    registry.register(|| VoicePlugin);
    registry.register(|| IssuesPlugin);
    registry.register(|| CanvasPlugin);
    registry.register(|| DocumentPlugin);
    registry.register(|| KeymapPlugin);
    registry.register(|| SceneRuntimePlugin);
    registry.register(|| SceneCommandsPlugin);
    registry.register(|| TerminalPlugin);
    registry.register(|| CostPlugin);
    registry.register(|| KernelPlugin);
    registry.register(|| ExtensionsPlugin);
    registry
}
