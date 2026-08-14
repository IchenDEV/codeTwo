//! Typed events on the kernel bus.
//!
//! These are how plugins learn about each other without holding each other. The engine does not
//! know the skill library exists; it listens for [`SkillsChanged`]. The cost tracker does not know
//! the engine exists; it listens for [`EngineEvent`]. Delete either plugin and the other keeps
//! working — which is the property a giant `AppState` could never give us.

use codetwo_kernel::Event;
use std::path::PathBuf;

/// The skill library was rebuilt (a skill was saved or deleted, a plugin was toggled, the
/// workspace changed). Anything holding a compiled copy should take a fresh one.
pub struct SkillsChanged;

impl Event for SkillsChanged {
    type Output = ();
    const NAME: &'static str = "skills/changed";
}

/// The scene/pipeline library was re-resolved.
pub struct ScenesChanged;

impl Event for ScenesChanged {
    type Output = ();
    const NAME: &'static str = "scenes/changed";
}

/// The set of installed plugin bundles changed.
pub struct PluginsChanged;

impl Event for PluginsChanged {
    type Output = ();
    const NAME: &'static str = "plugins/changed";
}

/// The frontend moved to a different workspace.
pub struct WorkspaceChanged {
    pub cwd: PathBuf,
}

impl Event for WorkspaceChanged {
    type Output = ();
    const NAME: &'static str = "workspace/changed";
}

/// One event from the agent loop, republished on the kernel bus.
///
/// [`crate::app::EventBus`] carries the same stream over a broadcast channel for consumers that
/// want a receiver (the Tauri pump, the remote server). This carries it to *plugins*, so a
/// listener is owned by a scope and disappears when that plugin unloads.
pub struct EngineEvent(pub crate::event::Event);

impl Event for EngineEvent {
    type Output = ();
    const NAME: &'static str = "engine/event";
}
