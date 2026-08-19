//! The core's services — every capability Code2 has, published under a name.
//!
//! Before this module, these were fields on a `AppState` struct built by a 200-line `setup()` in
//! the Tauri bridge: twenty subsystems constructed in a fixed order, each one reachable only by
//! whoever held the struct. Now each is a [`Service`] published by the plugin that owns it, and
//! reached by anything that declares it in `inject`. The wiring is no longer a place in the code.

use crate::canvas::CanvasFeatureGate;
use crate::codex_runtime::CodexRuntimeDiscovery;
use crate::engine::Engine;
use crate::event::Event;
use crate::keymap::Keymap;
use crate::models::available_models;
use crate::provider::{Provider, ProviderCapability};
use crate::scene::SceneLibrary;
use crate::scene_artifact::SceneArtifactStore;
use crate::skill::{builtin_skills, Skill, SkillLibrary};
use crate::store::Store;
use codetwo_kernel::Service;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;

/// The loader itself, published as a service so a plugin can manage the plugin graph.
///
/// This is the reflexive step that makes the system finished rather than merely layered: the
/// plugin manager is not privileged infrastructure, it is a plugin that injects `loader` like
/// anything else, and it can be turned off.
pub struct LoaderService(pub Arc<Mutex<codetwo_kernel::Loader>>);

impl Service for LoaderService {
    const NAME: &'static str = "loader";
}

/// Where everything lives on disk. Every other plugin asks this instead of recomputing paths.
pub struct Paths {
    pub data_dir: PathBuf,
}

impl Service for Paths {
    const NAME: &'static str = "paths";
}

impl Paths {
    pub fn new(data_dir: impl Into<PathBuf>) -> Paths {
        Paths {
            data_dir: data_dir.into(),
        }
    }

    pub fn db(&self) -> PathBuf {
        self.data_dir.join("codetwo.db")
    }

    pub fn skills(&self) -> PathBuf {
        self.data_dir.join("skills")
    }

    pub fn plugins(&self) -> PathBuf {
        self.data_dir.join("plugins")
    }

    pub fn scenes(&self) -> PathBuf {
        self.data_dir.join("scenes")
    }

    pub fn keymap(&self) -> PathBuf {
        self.data_dir.join("keymap.json")
    }
}

/// Persistent storage (SQLite): sessions, transcripts, memory, artifacts, usage.
pub struct StoreService(pub Arc<Store>);

impl Service for StoreService {
    const NAME: &'static str = "store";
}

/// Canvas persistence policy and owner identity. The gate remains closed in production builds;
/// publishing it as a service keeps every canvas command behind the same check.
pub struct CanvasService {
    pub gate: CanvasFeatureGate,
    pub owner: String,
    pub store: Arc<Store>,
}

impl Service for CanvasService {
    const NAME: &'static str = "canvas";
}

impl std::ops::Deref for StoreService {
    type Target = Store;
    fn deref(&self) -> &Store {
        &self.0
    }
}

/// The engine's [`Event`] fan-out. Anything that wants to watch the agent loop subscribes here
/// instead of being handed a receiver at construction time.
pub struct EventBus(pub broadcast::Sender<Event>);

impl Service for EventBus {
    const NAME: &'static str = "bus";
}

#[derive(Debug, Clone)]
pub enum TerminalEvent {
    Data { id: String, data: String },
    Title { id: String, title: String },
    Exit { id: String },
}

/// Live terminal emulators and their host-facing event stream.
pub struct TerminalService {
    pub(crate) terminals: Mutex<HashMap<String, crate::term::TerminalHandle>>,
    events: broadcast::Sender<TerminalEvent>,
}

impl Service for TerminalService {
    const NAME: &'static str = "terminal";
}

impl TerminalService {
    pub fn new() -> Self {
        let (events, _) = broadcast::channel(512);
        Self {
            terminals: Mutex::new(HashMap::new()),
            events,
        }
    }

    pub fn publish(&self, event: TerminalEvent) {
        let _ = self.events.send(event);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<TerminalEvent> {
        self.events.subscribe()
    }
}

impl EventBus {
    pub fn new(capacity: usize) -> EventBus {
        let (tx, _) = broadcast::channel(capacity);
        EventBus(tx)
    }

    pub fn publish(&self, event: Event) {
        let _ = self.0.send(event);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Event> {
        self.0.subscribe()
    }
}

/// What the UI needs to know about one provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderSummary {
    pub id: String,
    pub display_name: String,
    pub available: bool,
    pub needs_node: bool,
    pub models: Vec<crate::event::ModelChoice>,
    pub capabilities: Vec<ProviderCapability>,
}

/// The provider registry plus the one-shot Codex runtime probe it was built from.
pub struct ProviderService {
    pub providers: Vec<Provider>,
    pub codex: CodexRuntimeDiscovery,
}

impl Service for ProviderService {
    const NAME: &'static str = "providers";
}

impl ProviderService {
    pub async fn summaries(&self) -> Vec<ProviderSummary> {
        let mut summaries = Vec::with_capacity(self.providers.len());
        for provider in &self.providers {
            summaries.push(ProviderSummary {
                id: provider.id.as_str().to_string(),
                display_name: provider.display_name.clone(),
                available: provider.is_available(),
                needs_node: provider.needs_node,
                models: available_models(provider).await,
                capabilities: if provider.id == crate::provider::ProviderId::Codex {
                    self.codex.capability_projection(true)
                } else {
                    Vec::new()
                },
            });
        }
        summaries
    }
}

/// The live skill library: built-ins + user skills on disk + installed plugin components +
/// skills discovered from the harness directories of the current workspace.
pub struct SkillService {
    paths: Arc<Paths>,
    library: Mutex<SkillLibrary>,
    cwd: Mutex<Option<PathBuf>>,
}

impl Service for SkillService {
    const NAME: &'static str = "skills";
}

impl SkillService {
    pub fn new(paths: Arc<Paths>) -> SkillService {
        let service = SkillService {
            paths,
            library: Mutex::new(SkillLibrary::default()),
            cwd: Mutex::new(None),
        };
        service.reload(None);
        service
    }

    /// A snapshot of the library. Callers get a clone: the engine holds its own copy and is
    /// refreshed through [`crate::app::events::SkillsChanged`], not by sharing a lock.
    pub fn library(&self) -> SkillLibrary {
        self.library.lock().unwrap().clone()
    }

    pub fn list(&self) -> Vec<Skill> {
        self.library.lock().unwrap().all().cloned().collect()
    }

    /// Rebuild from every source. `cwd` selects the workspace whose project-level harness
    /// directories are scanned; `None` keeps the last one.
    pub fn reload(&self, cwd: Option<&Path>) {
        if let Some(cwd) = cwd {
            *self.cwd.lock().unwrap() = Some(cwd.to_path_buf());
        }
        let cwd = self.cwd.lock().unwrap().clone();

        let mut skills = builtin_skills();
        if let Ok(loaded) = SkillLibrary::load_dir(&self.paths.skills()) {
            skills.extend(loaded.all().cloned());
        }
        if let Ok(plugins) = crate::plugin::load_dir(&self.paths.plugins()) {
            skills.extend(
                plugins
                    .into_iter()
                    .filter(|plugin| plugin.enabled)
                    .flat_map(|p| p.components),
            );
        }
        skills.extend(crate::harness::discover(cwd.as_deref()));
        *self.library.lock().unwrap() = SkillLibrary::new(skills);
    }

    pub fn save(&self, skill: &Skill) -> std::io::Result<()> {
        SkillLibrary::save_to_dir(&self.paths.skills(), skill)?;
        self.reload(None);
        Ok(())
    }

    pub fn delete(&self, id: &str) -> std::io::Result<()> {
        SkillLibrary::delete_from_dir(&self.paths.skills(), id)?;
        self.reload(None);
        Ok(())
    }
}

/// The resolved scene/pipeline library and the artifact captures that go with it.
pub struct SceneService {
    library: Mutex<Arc<SceneLibrary>>,
    cwd: Mutex<Option<PathBuf>>,
    /// `None` when the store has no blob root (an in-memory database). Scene *resolution* is pure
    /// data and works regardless; only capturing artifacts needs somewhere to put them, and losing
    /// captures is not a reason to take the whole scene layer down.
    pub artifacts: Option<SceneArtifactStore>,
}

impl Service for SceneService {
    const NAME: &'static str = "scenes";
}

impl SceneService {
    pub fn new(artifacts: Option<SceneArtifactStore>) -> SceneService {
        SceneService {
            library: Mutex::new(Arc::new(SceneLibrary::builtin())),
            cwd: Mutex::new(None),
            artifacts,
        }
    }

    pub fn library(&self) -> Arc<SceneLibrary> {
        self.library.lock().unwrap().clone()
    }

    pub fn set_library(&self, library: Arc<SceneLibrary>) {
        *self.library.lock().unwrap() = library;
    }

    pub fn cwd(&self) -> Option<PathBuf> {
        self.cwd.lock().unwrap().clone()
    }

    /// Re-resolve from every source, in precedence order: the workspace, the user's config
    /// directory, enabled plugin bundles, then the built-ins.
    ///
    /// Callers announce the result with [`crate::app::events::ScenesChanged`]; the engine and the
    /// hook runtime follow that rather than being updated by hand.
    pub fn reload(&self, cwd: Option<&Path>, hub: Option<&PluginHub>) {
        if let Some(cwd) = cwd {
            *self.cwd.lock().unwrap() = Some(cwd.to_path_buf());
        }
        let cwd = self.cwd.lock().unwrap().clone();
        let project_dir = cwd.map(|cwd| cwd.join(".codetwo/scenes"));
        let user_dir =
            std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config/codetwo/scenes"));
        let plugins = hub.map(PluginHub::scene_dirs).unwrap_or_default();
        self.set_library(Arc::new(SceneLibrary::load(
            project_dir.as_deref(),
            user_dir.as_deref(),
            &plugins,
        )));
    }
}

/// The Agent Scenes hook dispatcher.
pub struct SceneRuntimeService(pub Arc<crate::scene_runtime::SceneRuntime>);

impl Service for SceneRuntimeService {
    const NAME: &'static str = "scene-runtime";
}

impl std::ops::Deref for SceneRuntimeService {
    type Target = crate::scene_runtime::SceneRuntime;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// Per-session token and cost accounting.
pub struct CostService(pub Arc<crate::cost::SessionCostTracker>);

impl Service for CostService {
    const NAME: &'static str = "cost";
}

impl std::ops::Deref for CostService {
    type Target = crate::cost::SessionCostTracker;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// The agent loop.
pub struct EngineService(pub Arc<Engine>);

impl Service for EngineService {
    const NAME: &'static str = "engine";
}

impl std::ops::Deref for EngineService {
    type Target = Engine;
    fn deref(&self) -> &Engine {
        &self.0
    }
}

/// Editable key bindings, persisted next to the store.
pub struct KeymapService {
    path: PathBuf,
    keymap: Mutex<Keymap>,
}

impl Service for KeymapService {
    const NAME: &'static str = "keymap";
}

impl KeymapService {
    pub fn load(path: PathBuf) -> KeymapService {
        let keymap = Keymap::load(&path);
        KeymapService {
            path,
            keymap: Mutex::new(keymap),
        }
    }

    pub fn snapshot(&self) -> Keymap {
        self.keymap.lock().unwrap().clone()
    }

    pub fn set(&self, action: crate::keymap::Action, key: String) -> std::io::Result<Keymap> {
        let mut keymap = self.keymap.lock().unwrap();
        keymap.set(action, key);
        keymap.save(&self.path)?;
        Ok(keymap.clone())
    }
}

/// Installed plugin *bundles* — the data-only packages (skills, subagents, MCP servers, scenes,
/// scaffolds) users install from GitHub.
///
/// Note the two senses of "plugin" that meet here: a [`codetwo_kernel::Plugin`] is code that runs
/// in this process, a [`crate::plugin::InstalledPlugin`] is content the app loads. This service is
/// the bridge — a kernel plugin whose job is managing the other kind.
pub struct PluginHub {
    pub dir: PathBuf,
}

impl Service for PluginHub {
    const NAME: &'static str = "plugin-hub";
}

impl PluginHub {
    pub fn installed(&self) -> Vec<crate::plugin::InstalledPlugin> {
        crate::plugin::load_dir(&self.dir).unwrap_or_default()
    }

    /// `(id, scenes dir)` for every enabled plugin that ships scenes — what the scene loader reads.
    pub fn scene_dirs(&self) -> Vec<(String, PathBuf)> {
        self.installed()
            .into_iter()
            .filter(|plugin| plugin.enabled)
            .map(|plugin| {
                let dir = crate::plugin::plugin_scenes_dir(&self.dir, &plugin.id);
                (plugin.id, dir)
            })
            .filter(|(_, dir)| dir.is_dir())
            .collect()
    }
}
