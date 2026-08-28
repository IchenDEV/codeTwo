//! One management interface over catalog, durable policy, planning, and loader reconciliation.
//!
//! Frontends should not coordinate a config file and a live loader themselves. They ask this
//! module to describe the graph, plan a mutation against one revision, then apply that exact plan.

use super::{
    bundle_runtime::bundle_runtime_descriptor, normalize_project_path, PluginConfigDocument,
    PluginConfigError, PluginConfigStore, PluginOverride, PluginPolicy, PluginRecoveryState,
    PluginScope,
};
use crate::bundle as plugin;
use codetwo_kernel::{
    events::StatusChanged, CommandRealm, Context, FnPlugin, Fork, Injection, KernelError, Loader,
    LoaderConfig, PluginEntry, PluginMetadata, PluginRegistry, PluginRole, PluginScopeSupport,
    Service, Status, WeakContext,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::watch;
use tokio::task::JoinHandle;
use uuid::Uuid;

const PROJECT_IDLE_TTL: Duration = Duration::from_secs(5 * 60);

#[derive(Debug, Clone, Serialize)]
pub struct PluginCatalog {
    pub graph_revision: u64,
    pub config_revision: u64,
    pub recovery: PluginRecoveryState,
    pub plugins: Vec<PluginCatalogEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PluginCatalogEntry {
    pub id: String,
    pub description: Option<String>,
    pub metadata: PluginMetadata,
    pub dependencies: Injection,
    /// The explicit policy at the requested scope. `enabled` is the inherited effective value.
    pub state: PluginOverride,
    pub enabled: bool,
    pub running: bool,
    pub status: Option<Status>,
    pub missing: Vec<String>,
    pub error: Option<String>,
    pub config: Value,
    pub schema: Option<Value>,
    pub available: bool,
    /// Contributions from this scope's live instance only.
    pub commands: Vec<String>,
    /// Services from this scope's live instance only.
    pub services: Vec<String>,
    /// Per-component policy is already durable even before a UI contribution registry is attached.
    pub components: BTreeMap<String, PluginOverride>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PluginChangeRequest {
    pub plugin: String,
    #[serde(default = "user_scope")]
    pub scope: PluginScope,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state: Option<PluginOverride>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub component: Option<String>,
}

fn user_scope() -> PluginScope {
    PluginScope::User
}

#[derive(Debug, Clone, Serialize)]
pub struct PluginChangePlan {
    pub id: String,
    pub graph_revision: u64,
    /// The relevant child graph revision. `None` means the project is not loaded yet.
    pub project_graph_revision: Option<u64>,
    pub config_revision: u64,
    pub request: PluginChangeRequest,
    pub affected: Vec<String>,
    pub active_resources: Vec<PluginActiveResource>,
    pub requires_confirmation: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PluginActiveResource {
    pub plugin: String,
    pub kind: String,
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PluginChangeResult {
    pub graph_revision: u64,
    pub config_revision: u64,
    pub affected: Vec<String>,
    #[serde(skip)]
    component_policy_changed: bool,
    #[serde(skip)]
    settle: Option<Arc<PluginSettleSnapshot>>,
}

#[derive(Debug, thiserror::Error)]
pub enum PluginManagerError {
    #[error("unknown plugin `{0}`")]
    UnknownPlugin(String),
    #[error("core module `{0}` is owned by host configuration, not extension policy")]
    CoreModule(String),
    #[error("plugin `{0}` does not support project scope")]
    UnsupportedProjectScope(String),
    #[error("plugin `{0}` is part of the management plane and cannot be disabled")]
    EssentialPlugin(String),
    #[error("plugin change plan is stale; refresh and try again")]
    StalePlan,
    #[error("plugin change plan was not found or was already used")]
    UnknownPlan,
    #[error("plugin config is invalid: {0}")]
    InvalidConfig(String),
    #[error("plugin loader rejected the change: {0}")]
    Loader(String),
    #[error(transparent)]
    Config(#[from] PluginConfigError),
    #[error("plugin runtime is no longer available")]
    RuntimeGone,
    #[error("dynamic plugin catalog conflicts with `{0}`")]
    DynamicFactoryConflict(String),
    #[error("plugin change did not settle: {0}")]
    Settle(String),
}

struct PendingPlan {
    plan: PluginChangePlan,
    project_revisions: ProjectRevisionSnapshot,
}

enum ProjectRevisionSnapshot {
    One { path: String, revision: Option<u64> },
    All(BTreeMap<String, u64>),
}

struct ProjectGraph {
    loader: Loader,
    context: Context,
    fallback_blockers: HashMap<String, Fork>,
    activity: Arc<ProjectActivity>,
}

#[derive(Clone, Default)]
struct DynamicPluginSource {
    registry: PluginRegistry,
    defaults: LoaderConfig,
    fingerprints: BTreeMap<String, String>,
}

struct FactoryCatalogState {
    base_registry: PluginRegistry,
    base_defaults: LoaderConfig,
    registry: PluginRegistry,
    defaults: LoaderConfig,
    sources: BTreeMap<String, DynamicPluginSource>,
}

#[derive(Debug)]
struct ProjectActivity {
    state: Mutex<ProjectActivityState>,
}

#[derive(Debug)]
struct ProjectActivityState {
    active: usize,
    last_touched: Instant,
}

impl ProjectActivity {
    fn new() -> Self {
        Self {
            state: Mutex::new(ProjectActivityState {
                active: 0,
                last_touched: Instant::now(),
            }),
        }
    }

    fn touch(&self) {
        self.state.lock().unwrap().last_touched = Instant::now();
    }

    fn lease(self: &Arc<Self>) -> ProjectActivityLease {
        let mut state = self.state.lock().unwrap();
        state.active = state.active.saturating_add(1);
        state.last_touched = Instant::now();
        drop(state);
        ProjectActivityLease {
            activity: self.clone(),
        }
    }

    fn is_idle_for(&self, now: Instant, ttl: Duration) -> bool {
        let state = self.state.lock().unwrap();
        state.active == 0 && now.saturating_duration_since(state.last_touched) >= ttl
    }
}

/// Keeps one project's child graph alive for a command or long-running resource.
#[derive(Debug)]
pub struct ProjectActivityLease {
    activity: Arc<ProjectActivity>,
}

impl Drop for ProjectActivityLease {
    fn drop(&mut self) {
        let mut state = self.activity.state.lock().unwrap();
        debug_assert!(state.active > 0, "project activity lease underflow");
        if state.active > 0 {
            state.active -= 1;
        }
        state.last_touched = Instant::now();
    }
}

#[derive(Debug, Clone)]
struct SettleExpectation {
    plugin: String,
    realm: CommandRealm,
    active: bool,
}

#[derive(Debug)]
struct PluginSettleSnapshot {
    previous_document: PluginConfigDocument,
    previous_global: LoaderConfig,
    previous_projects: BTreeMap<String, LoaderConfig>,
    applied_project_revisions: BTreeMap<String, u64>,
    ensure_projects: Vec<String>,
}

struct RollbackSettleReceipt {
    config_revision: u64,
    graph_revision: u64,
    project_revisions: BTreeMap<String, u64>,
    expectations: Vec<SettleExpectation>,
    apply_error: Option<String>,
}

struct VerifiedSettleRevisions {
    config_revision: u64,
    graph_revision: u64,
    project_revisions: BTreeMap<String, u64>,
}

#[cfg(debug_assertions)]
type BeforeRollbackTestHook = Box<dyn FnOnce() + Send + 'static>;

struct ProjectReaper {
    cancel: watch::Sender<bool>,
    task: JoinHandle<()>,
}

impl ProjectGraph {
    fn shutdown(&mut self) {
        for (_, blocker) in self.fallback_blockers.drain() {
            blocker.dispose();
        }
        self.loader.shutdown();
    }
}

impl Drop for ProjectGraph {
    fn drop(&mut self) {
        self.shutdown();
    }
}

/// The deep module at the plugin-management seam.
pub struct PluginManager {
    loader: Arc<Mutex<Loader>>,
    config: Arc<Mutex<PluginConfigStore>>,
    factory_catalog: Mutex<FactoryCatalogState>,
    context: WeakContext,
    plans: Mutex<HashMap<String, PendingPlan>>,
    projects: Mutex<HashMap<String, ProjectGraph>>,
    project_idle_ttl: Duration,
    reaper: Mutex<Option<ProjectReaper>>,
    #[cfg(debug_assertions)]
    before_rollback_test_hook: Mutex<Option<BeforeRollbackTestHook>>,
}

impl Service for PluginManager {
    const NAME: &'static str = "plugin-manager";
}

impl PluginManager {
    pub fn new(
        loader: Arc<Mutex<Loader>>,
        config: Arc<Mutex<PluginConfigStore>>,
        defaults: LoaderConfig,
        context: WeakContext,
    ) -> Self {
        Self::new_with_project_idle_ttl(loader, config, defaults, context, PROJECT_IDLE_TTL)
    }

    /// Construct a manager with a custom project idle timeout.
    ///
    /// This is primarily useful for deterministic host tests; production uses five minutes.
    pub fn new_with_project_idle_ttl(
        loader: Arc<Mutex<Loader>>,
        config: Arc<Mutex<PluginConfigStore>>,
        defaults: LoaderConfig,
        context: WeakContext,
        project_idle_ttl: Duration,
    ) -> Self {
        let base_registry = loader.lock().unwrap().registry().clone();
        Self {
            loader,
            config,
            factory_catalog: Mutex::new(FactoryCatalogState {
                registry: base_registry.clone(),
                defaults: defaults.clone(),
                base_registry,
                base_defaults: defaults,
                sources: BTreeMap::new(),
            }),
            context,
            plans: Mutex::new(HashMap::new()),
            projects: Mutex::new(HashMap::new()),
            project_idle_ttl,
            reaper: Mutex::new(None),
            #[cfg(debug_assertions)]
            before_rollback_test_hook: Mutex::new(None),
        }
    }

    /// Reconcile the complete set of installed process bundles into the same factory catalog used
    /// by built-in and host plugins.
    ///
    /// The bundle directory is an external inventory, not part of `plugin-config.json`. Replacing
    /// that inventory therefore changes graph revisions and live runtimes, but does not mark a
    /// policy snapshot as last-known-good.
    pub(crate) fn sync_installed_bundles(
        &self,
        plugins_dir: &std::path::Path,
    ) -> Result<(), PluginManagerError> {
        self.replace_installed_bundles(plugins_dir, BTreeSet::new())
    }

    /// Re-read the installed bundle inventory and force the named bundle runtimes through the
    /// loader even when their manifests are unchanged.
    pub fn reload_installed_bundles<I, S>(
        &self,
        plugins_dir: &std::path::Path,
        bundle_ids: I,
    ) -> Result<(), PluginManagerError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        let forced = bundle_ids
            .into_iter()
            .map(|id| format!("bundle:{}", id.as_ref()))
            .collect();
        self.replace_installed_bundles(plugins_dir, forced)
    }

    fn replace_installed_bundles(
        &self,
        plugins_dir: &std::path::Path,
        forced: BTreeSet<String>,
    ) -> Result<(), PluginManagerError> {
        let installed = plugin::load_dir(plugins_dir)
            .map_err(|error| PluginManagerError::Loader(error.to_string()))?;
        let mut source = DynamicPluginSource::default();
        for plugin in installed {
            let Some(descriptor) = bundle_runtime_descriptor(&plugin, plugins_dir) else {
                continue;
            };
            descriptor.register_into(&mut source.registry);
            source
                .defaults
                .plugins
                .insert(descriptor.name.clone(), descriptor.default_entry.clone());
            source
                .fingerprints
                .insert(descriptor.name.clone(), descriptor.fingerprint.clone());
        }
        self.replace_dynamic_factory_source("installed-bundles", source, forced)
    }

    pub(crate) fn forget_installed_bundle_policy(
        &self,
        bundle_id: &str,
    ) -> Result<(), PluginManagerError> {
        self.config
            .lock()
            .unwrap()
            .remove_plugin(&format!("bundle:{bundle_id}"))?;
        Ok(())
    }

    fn replace_dynamic_factory_source(
        &self,
        source_name: &str,
        source: DynamicPluginSource,
        forced: BTreeSet<String>,
    ) -> Result<(), PluginManagerError> {
        let mut loader = self.loader.lock().unwrap();
        let config = self.config.lock().unwrap();
        let mut projects = self.projects.lock().unwrap();
        let mut catalog = self.factory_catalog.lock().unwrap();

        let previous_source = catalog
            .sources
            .get(source_name)
            .cloned()
            .unwrap_or_default();
        let mut sources = catalog.sources.clone();
        if source.registry.names().is_empty() {
            sources.remove(source_name);
        } else {
            sources.insert(source_name.to_string(), source.clone());
        }

        let (combined_registry, combined_defaults) =
            combine_factory_catalog(&catalog.base_registry, &catalog.base_defaults, &sources)?;
        let mut changed = changed_dynamic_factories(&previous_source, &source);
        changed.extend(forced);
        let previous_dynamic_names = catalog
            .sources
            .values()
            .flat_map(|source| source.registry.names())
            .collect::<BTreeSet<_>>();
        let next_dynamic_names = sources
            .values()
            .flat_map(|source| source.registry.names())
            .collect::<BTreeSet<_>>();

        let mut next_global = loader.config().clone();
        for name in &previous_dynamic_names {
            next_global.plugins.remove(name);
        }
        for name in &next_dynamic_names {
            let default = combined_defaults
                .plugins
                .get(name)
                .cloned()
                .unwrap_or_else(PluginEntry::disabled);
            let policy = config.policy(&PluginScope::User, name);
            next_global.plugins.insert(
                name.clone(),
                PluginEntry {
                    enabled: policy.state.resolve(default.enabled),
                    config: policy.config.unwrap_or(default.config),
                },
            );
        }

        let project_registry = combined_registry.filtered(|factory| {
            factory
                .metadata
                .scope_support
                .contains(&PluginScopeSupport::Project)
        });
        let next_projects = projects
            .keys()
            .map(|path| {
                let scope = PluginScope::Project {
                    project_path: path.clone(),
                };
                (
                    path.clone(),
                    project_loader_config_from(
                        &config,
                        &scope,
                        None,
                        &project_registry,
                        &combined_defaults,
                    ),
                )
            })
            .collect::<BTreeMap<_, _>>();

        catalog.sources = sources;
        catalog.registry = combined_registry.clone();
        catalog.defaults = combined_defaults;
        drop(catalog);

        let mut outcome =
            loader.reconcile_registry(combined_registry, changed.iter().cloned(), next_global);
        for (path, graph) in projects.iter_mut() {
            let next = next_projects.get(path).cloned().unwrap_or_default();
            outcome.extend(graph.loader.reconcile_registry(
                project_registry.clone(),
                changed.iter().cloned(),
                next.clone(),
            ));
            self.reconcile_project_blockers(graph, &next);
            graph.activity.touch();
        }

        for warning in outcome.warnings() {
            tracing::warn!(%warning, "plugin registry reconciliation accepted with warning");
        }
        if outcome.is_accepted() {
            Ok(())
        } else {
            Err(PluginManagerError::Loader(join_errors(
                outcome.into_errors(),
            )))
        }
    }

    /// Install a one-shot deterministic concurrency hook for integration tests.
    #[doc(hidden)]
    #[cfg(debug_assertions)]
    pub fn install_before_rollback_test_hook(&self, hook: impl FnOnce() + Send + 'static) {
        *self.before_rollback_test_hook.lock().unwrap() = Some(Box::new(hook));
    }

    /// Start the cancellable background reaper. Calling this more than once is harmless.
    pub fn start_reaper(self: &Arc<Self>) {
        let mut reaper = self.reaper.lock().unwrap();
        if reaper.is_some() {
            return;
        }
        let (cancel, mut cancelled) = watch::channel(false);
        let weak = Arc::downgrade(self);
        let interval = project_reaper_interval(self.project_idle_ttl);
        let task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(interval) => {
                        let Some(manager) = weak.upgrade() else {
                            break;
                        };
                        manager.reap_idle_projects();
                    }
                    changed = cancelled.changed() => {
                        if changed.is_err() || *cancelled.borrow() {
                            break;
                        }
                    }
                }
            }
        });
        *reaper = Some(ProjectReaper { cancel, task });
    }

    pub fn catalog(&self, mut scope: PluginScope) -> Result<PluginCatalog, PluginManagerError> {
        self.reap_idle_projects();
        if let PluginScope::Project { project_path } = &mut scope {
            *project_path = normalize_project_path(&*project_path);
        }
        let loader = self.loader.lock().unwrap();
        let config = self.config.lock().unwrap();
        let context = self
            .context
            .upgrade()
            .ok_or(PluginManagerError::RuntimeGone)?;
        let scopes = context.runtime().scopes();
        let project = match &scope {
            PluginScope::User => None,
            PluginScope::Project { project_path } => Some(normalize_project_path(project_path)),
        };
        let project_loaded = project.as_ref().is_some_and(|path| {
            let mut projects = self.projects.lock().unwrap();
            if let Some(graph) = projects.get_mut(path) {
                graph.activity.touch();
                true
            } else {
                false
            }
        });

        let plugins = loader
            .entries()
            .into_iter()
            .map(|entry| {
                let supports_project = entry
                    .metadata
                    .scope_support
                    .contains(&PluginScopeSupport::Project);
                let runtime_project = project.as_ref().filter(|_| supports_project);
                let instance = scopes.iter().find(|instance| {
                    if runtime_project.is_some() && !project_loaded {
                        return false;
                    }
                    instance.plugin == entry.name
                        && match (runtime_project, &instance.command_realm) {
                            (None, codetwo_kernel::CommandRealm::Global) => true,
                            (Some(project), codetwo_kernel::CommandRealm::Project(realm)) => {
                                project == realm
                            }
                            _ => false,
                        }
                });
                let policy_scope = if project.is_some() && !supports_project {
                    PluginScope::User
                } else {
                    scope.clone()
                };
                let policy = config.policy(&policy_scope, &entry.name);
                let default = self.default_entry(&entry.name);
                let enabled = config.effective_enabled(&policy_scope, &entry.name, default.enabled);
                PluginCatalogEntry {
                    id: entry.name.clone(),
                    description: entry.description,
                    metadata: entry.metadata,
                    dependencies: entry.dependencies,
                    state: policy.state,
                    enabled,
                    running: instance.is_some_and(|scope| scope.status == Status::Active),
                    status: instance.map(|scope| scope.status),
                    missing: instance
                        .map(|scope| scope.missing.clone())
                        .unwrap_or_default(),
                    error: instance.and_then(|scope| scope.error.clone()),
                    config: effective_plugin_config(
                        &config,
                        &policy_scope,
                        &entry.name,
                        default.config,
                    ),
                    schema: entry.schema,
                    available: entry.available,
                    commands: instance
                        .map(|scope| scope.commands.clone())
                        .unwrap_or_default(),
                    services: instance
                        .map(|scope| scope.services.clone())
                        .unwrap_or_default(),
                    components: policy.components,
                }
            })
            .collect();

        Ok(PluginCatalog {
            graph_revision: loader.revision(),
            config_revision: config.snapshot().revision,
            recovery: config.recovery().clone(),
            plugins,
        })
    }

    pub fn plan(
        &self,
        mut request: PluginChangeRequest,
    ) -> Result<PluginChangePlan, PluginManagerError> {
        self.reap_idle_projects();
        if let PluginScope::Project { project_path } = &mut request.scope {
            *project_path = normalize_project_path(&*project_path);
        }

        let loader = self.loader.lock().unwrap();
        let entries = loader.entries();
        let entry = entries
            .iter()
            .find(|entry| entry.name == request.plugin)
            .ok_or_else(|| PluginManagerError::UnknownPlugin(request.plugin.clone()))?;
        if matches!(request.scope, PluginScope::Project { .. })
            && !entry
                .metadata
                .scope_support
                .contains(&PluginScopeSupport::Project)
        {
            return Err(PluginManagerError::UnsupportedProjectScope(
                request.plugin.clone(),
            ));
        }
        if entry.metadata.role == PluginRole::Core {
            return Err(PluginManagerError::CoreModule(request.plugin.clone()));
        }
        if entry.metadata.essential
            && request.component.is_none()
            && matches!(request.state, Some(PluginOverride::Disabled))
        {
            return Err(PluginManagerError::EssentialPlugin(request.plugin.clone()));
        }
        if let Some(value) = &request.config {
            validate_schema(entry.schema.as_ref(), value)?;
        }

        let config = self.config.lock().unwrap();
        let project_revisions = match &request.scope {
            PluginScope::Project { project_path } => {
                let mut projects = self.projects.lock().unwrap();
                let revision = projects.get_mut(project_path).map(|graph| {
                    graph.activity.touch();
                    graph.loader.revision()
                });
                ProjectRevisionSnapshot::One {
                    path: project_path.clone(),
                    revision,
                }
            }
            PluginScope::User => ProjectRevisionSnapshot::All(
                self.projects
                    .lock()
                    .unwrap()
                    .iter()
                    .map(|(path, graph)| (path.clone(), graph.loader.revision()))
                    .collect(),
            ),
        };
        let project_graph_revision = match &project_revisions {
            ProjectRevisionSnapshot::One { revision, .. } => *revision,
            ProjectRevisionSnapshot::All(_) => None,
        };
        let affected = if request.component.is_some() {
            vec![request.plugin.clone()]
        } else {
            affected_plugins(&request.plugin, &entries, &self.context, &request.scope)
        };
        let active_resources = if request.component.is_none()
            && matches!(request.state, Some(PluginOverride::Disabled))
        {
            let project_is_loaded = match &project_revisions {
                ProjectRevisionSnapshot::One { revision, .. } => revision.is_some(),
                ProjectRevisionSnapshot::All(_) => true,
            };
            self.context
                .upgrade()
                .into_iter()
                .flat_map(|context| context.runtime().scopes())
                .filter(|instance| {
                    affected.contains(&instance.plugin)
                        && matches!(instance.status, Status::Active | Status::Loading)
                        && match (&request.scope, &instance.command_realm) {
                            (PluginScope::User, CommandRealm::Global) => true,
                            (
                                PluginScope::Project { project_path },
                                CommandRealm::Project(realm),
                            ) => project_is_loaded && project_path == realm,
                            _ => false,
                        }
                })
                .flat_map(|instance| {
                    let mut resources = vec![PluginActiveResource {
                        plugin: instance.plugin.clone(),
                        kind: "plugin_scope".into(),
                        id: instance.id.to_string(),
                        label: format!("{} runtime", instance.plugin),
                    }];
                    resources.extend(instance.services.into_iter().map(|service| {
                        PluginActiveResource {
                            plugin: instance.plugin.clone(),
                            kind: "service".into(),
                            id: format!("{}:{service}", instance.id),
                            label: service,
                        }
                    }));
                    resources
                })
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        let plan = PluginChangePlan {
            id: Uuid::new_v4().to_string(),
            graph_revision: loader.revision(),
            project_graph_revision,
            config_revision: config.snapshot().revision,
            request,
            requires_confirmation: affected.len() > 1 || !active_resources.is_empty(),
            affected,
            active_resources,
        };
        self.plans.lock().unwrap().insert(
            plan.id.clone(),
            PendingPlan {
                plan: plan.clone(),
                project_revisions,
            },
        );
        Ok(plan)
    }

    pub fn apply(&self, id: &str) -> Result<PluginChangeResult, PluginManagerError> {
        let pending = self
            .plans
            .lock()
            .unwrap()
            .remove(id)
            .ok_or(PluginManagerError::UnknownPlan)?;

        let mut loader = self.loader.lock().unwrap();
        let mut config = self.config.lock().unwrap();
        let mut projects = self.projects.lock().unwrap();
        if loader.revision() != pending.plan.graph_revision
            || config.snapshot().revision != pending.plan.config_revision
            || !project_revisions_match(&pending.project_revisions, &projects)
        {
            return Err(PluginManagerError::StalePlan);
        }
        let plan = pending.plan;
        let component_policy_changed = plan.request.component.is_some();
        let previous_document = config.snapshot();
        let previous_global = loader.config().clone();
        let previous_projects = projects
            .iter()
            .map(|(path, graph)| (path.clone(), graph.loader.config().clone()))
            .collect::<BTreeMap<_, _>>();

        let entry = loader
            .entries()
            .into_iter()
            .find(|entry| entry.name == plan.request.plugin)
            .ok_or_else(|| PluginManagerError::UnknownPlugin(plan.request.plugin.clone()))?;
        let mut policy = config.policy(&plan.request.scope, &plan.request.plugin);
        if let Some(component) = &plan.request.component {
            let state = plan.request.state.ok_or_else(|| {
                PluginManagerError::InvalidConfig(
                    "component changes require an explicit state".into(),
                )
            })?;
            if state == PluginOverride::Inherit {
                policy.components.remove(component);
            } else {
                policy.components.insert(component.clone(), state);
            }
        } else {
            if let Some(state) = plan.request.state {
                policy.state = state;
            }
            if let Some(plugin_config) = plan.request.config.clone() {
                validate_schema(entry.schema.as_ref(), &plugin_config)?;
                policy.config = Some(plugin_config);
            }
        }

        self.apply_policy_locked(
            &mut loader,
            &mut config,
            &mut projects,
            &plan.request.scope,
            &plan.request.plugin,
            &entry.metadata,
            policy,
            plan.request.component.is_none(),
        )?;

        let ensure_projects = match (&plan.request.scope, &plan.request.component) {
            (PluginScope::Project { project_path }, None) => vec![project_path.clone()],
            _ => Vec::new(),
        };
        let applied_project_revisions = current_project_revisions(&projects);

        Ok(PluginChangeResult {
            graph_revision: loader.revision(),
            config_revision: config.snapshot().revision,
            affected: plan.affected,
            component_policy_changed,
            settle: Some(Arc::new(PluginSettleSnapshot {
                previous_document,
                previous_global,
                previous_projects,
                applied_project_revisions,
                ensure_projects,
            })),
        })
    }

    pub fn reset(
        &self,
        scope: PluginScope,
        plugin: &str,
    ) -> Result<PluginChangeResult, PluginManagerError> {
        let plan = self.plan(PluginChangeRequest {
            plugin: plugin.to_string(),
            scope,
            state: Some(PluginOverride::Inherit),
            config: None,
            component: None,
        })?;
        // Reset is stronger than setting state to inherit: clear config and all component policy.
        let pending = self
            .plans
            .lock()
            .unwrap()
            .remove(&plan.id)
            .ok_or(PluginManagerError::UnknownPlan)?;
        let mut loader = self.loader.lock().unwrap();
        let mut config = self.config.lock().unwrap();
        let mut projects = self.projects.lock().unwrap();
        if loader.revision() != pending.plan.graph_revision
            || config.snapshot().revision != pending.plan.config_revision
            || !project_revisions_match(&pending.project_revisions, &projects)
        {
            return Err(PluginManagerError::StalePlan);
        }
        let previous_document = config.snapshot();
        let previous_global = loader.config().clone();
        let previous_projects = projects
            .iter()
            .map(|(path, graph)| (path.clone(), graph.loader.config().clone()))
            .collect::<BTreeMap<_, _>>();

        let metadata = loader
            .registry()
            .get(plugin)
            .map(|factory| factory.metadata.clone())
            .ok_or_else(|| PluginManagerError::UnknownPlugin(plugin.to_string()))?;
        self.apply_policy_locked(
            &mut loader,
            &mut config,
            &mut projects,
            &plan.request.scope,
            plugin,
            &metadata,
            PluginPolicy::default(),
            true,
        )?;

        let ensure_projects = match &plan.request.scope {
            PluginScope::Project { project_path } => vec![project_path.clone()],
            PluginScope::User => Vec::new(),
        };
        let applied_project_revisions = current_project_revisions(&projects);

        Ok(PluginChangeResult {
            graph_revision: loader.revision(),
            config_revision: config.snapshot().revision,
            affected: plan.affected,
            component_policy_changed: true,
            settle: Some(Arc::new(PluginSettleSnapshot {
                previous_document,
                previous_global,
                previous_projects,
                applied_project_revisions,
                ensure_projects,
            })),
        })
    }

    /// Wait for a managed change to settle, roll it back if the requested runtime state was not
    /// reached, and only then advance the last-known-good snapshot.
    ///
    /// `Loader::apply` schedules async plugin application, so a syntactically valid config can be
    /// persisted before `apply()` later reports `Failed` or remains `Pending`. Keeping the rollback
    /// receipt in [`PluginChangeResult`] closes that gap without teaching the config store about
    /// runtime scopes.
    pub async fn settle_and_mark_last_good(
        &self,
        result: &PluginChangeResult,
    ) -> Result<(), PluginManagerError> {
        let context = self
            .context
            .upgrade()
            .ok_or(PluginManagerError::RuntimeGone)?;

        let Some(settle) = &result.settle else {
            {
                let loader = self.loader.lock().unwrap();
                let config = self.config.lock().unwrap();
                if loader.revision() != result.graph_revision
                    || config.snapshot().revision != result.config_revision
                {
                    return Err(PluginManagerError::StalePlan);
                }
                config.mark_last_good()?;
            }
            if result.component_policy_changed {
                context.emit(crate::app::events::PluginPolicyChanged).await;
            }
            return Ok(());
        };

        {
            let loader = self.loader.lock().unwrap();
            let config = self.config.lock().unwrap();
            let projects = self.projects.lock().unwrap();
            if !settle_revisions_match(
                result,
                &settle.applied_project_revisions,
                &loader,
                &config,
                &projects,
            ) {
                return Err(PluginManagerError::StalePlan);
            }
        }
        let (mut leased_paths, mut project_leases) = self.lease_all_loaded_projects();
        for path in &settle.ensure_projects {
            if leased_paths.contains(path) {
                continue;
            }
            let (_, lease) = self.lease_project_command(path)?;
            project_leases.push(lease);
            leased_paths.insert(path.clone());
        }
        let settle_project_revisions = {
            let loader = self.loader.lock().unwrap();
            let config = self.config.lock().unwrap();
            let projects = self.projects.lock().unwrap();
            if !settle_revisions_match(
                result,
                &settle.applied_project_revisions,
                &loader,
                &config,
                &projects,
            ) {
                return Err(PluginManagerError::StalePlan);
            }
            current_project_revisions(&projects)
        };
        context.flush().await;

        let (failure, verified_revisions) = {
            let loader = self.loader.lock().unwrap();
            let config = self.config.lock().unwrap();
            let projects = self.projects.lock().unwrap();
            if !settle_revisions_match(
                result,
                &settle_project_revisions,
                &loader,
                &config,
                &projects,
            ) {
                return Err(PluginManagerError::StalePlan);
            }
            let mut expectations = Vec::new();
            append_loader_expectations(&mut expectations, loader.config(), CommandRealm::Global);
            for (path, graph) in projects.iter() {
                append_loader_expectations(
                    &mut expectations,
                    graph.loader.config(),
                    CommandRealm::project(path.clone()),
                );
            }
            let failure = settle_failure(&context, &expectations);
            if failure.is_none() {
                config.mark_last_good()?;
            }
            let verified_revisions = VerifiedSettleRevisions {
                config_revision: config.snapshot().revision,
                graph_revision: loader.revision(),
                project_revisions: current_project_revisions(&projects),
            };
            (failure, verified_revisions)
        };
        if let Some(error) = failure {
            #[cfg(debug_assertions)]
            {
                let before_rollback = self.before_rollback_test_hook.lock().unwrap().take();
                if let Some(hook) = before_rollback {
                    hook();
                }
            }
            let rollback = self.rollback_settle(&verified_revisions, settle);
            context.flush().await;
            let rollback_failure = match rollback {
                Ok(receipt) => self.rollback_failure(&context, &receipt),
                Err(PluginManagerError::StalePlan) => {
                    return Err(PluginManagerError::StalePlan);
                }
                Err(rollback) => Some(rollback.to_string()),
            };
            return Err(PluginManagerError::Settle(match rollback_failure {
                Some(rollback) => format!("{error}; rollback failed: {rollback}"),
                None => error,
            }));
        }
        drop(project_leases);
        if result.component_policy_changed {
            context.emit(crate::app::events::PluginPolicyChanged).await;
        }
        Ok(())
    }

    /// Lazily create (or touch) the child graph used by one project command realm.
    ///
    /// The caller must flush the shared runtime before dispatching into the new realm.
    pub fn ensure_project(
        &self,
        project_path: impl AsRef<std::path::Path>,
    ) -> Result<String, PluginManagerError> {
        self.ensure_project_access(project_path, false)
            .map(|(path, _)| path)
    }

    /// Lazily create a child graph and hold it for the full duration of one project command.
    pub fn lease_project_command(
        &self,
        project_path: impl AsRef<std::path::Path>,
    ) -> Result<(String, ProjectActivityLease), PluginManagerError> {
        let (path, lease) = self.ensure_project_access(project_path, true)?;
        Ok((
            path,
            lease.expect("leased project access must return an activity lease"),
        ))
    }

    fn ensure_project_access(
        &self,
        project_path: impl AsRef<std::path::Path>,
        acquire_lease: bool,
    ) -> Result<(String, Option<ProjectActivityLease>), PluginManagerError> {
        let project_path = normalize_project_path(project_path);
        let context = self
            .context
            .upgrade()
            .ok_or(PluginManagerError::RuntimeGone)?;
        let config = self.config.lock().unwrap();
        let mut projects = self.projects.lock().unwrap();
        if let Some(graph) = projects.get_mut(&project_path) {
            let lease = if acquire_lease {
                Some(graph.activity.lease())
            } else {
                graph.activity.touch();
                None
            };
            return Ok((project_path, lease));
        }

        let scope = PluginScope::Project {
            project_path: project_path.clone(),
        };
        let project_context = context
            .with_command_realm(CommandRealm::project(project_path.clone()))
            .isolate(&["terminal"]);
        let (project_registry, defaults) = {
            let catalog = self.factory_catalog.lock().unwrap();
            (
                catalog.registry.filtered(|factory| {
                    factory
                        .metadata
                        .scope_support
                        .contains(&PluginScopeSupport::Project)
                }),
                catalog.defaults.clone(),
            )
        };
        let desired =
            project_loader_config_from(&config, &scope, None, &project_registry, &defaults);
        let mut loader = Loader::new(project_context.clone(), project_registry);
        let errors = loader.apply(desired.clone());
        if !errors.is_empty() {
            return Err(PluginManagerError::Loader(join_errors(errors)));
        }
        let mut graph = ProjectGraph {
            loader,
            context: project_context,
            fallback_blockers: HashMap::new(),
            activity: Arc::new(ProjectActivity::new()),
        };
        self.reconcile_project_blockers(&mut graph, &desired);
        let lease = acquire_lease.then(|| graph.activity.lease());
        projects.insert(project_path.clone(), graph);
        Ok((project_path, lease))
    }

    /// Acquire a long-lived resource lease from a plugin already running in a project graph.
    pub fn lease_loaded_project(
        &self,
        project_path: impl AsRef<std::path::Path>,
    ) -> Option<ProjectActivityLease> {
        let project_path = normalize_project_path(project_path);
        self.projects
            .lock()
            .unwrap()
            .get(&project_path)
            .map(|graph| graph.activity.lease())
    }

    fn lease_all_loaded_projects(&self) -> (BTreeSet<String>, Vec<ProjectActivityLease>) {
        let projects = self.projects.lock().unwrap();
        let paths = projects.keys().cloned().collect();
        let leases = projects
            .values()
            .map(|graph| graph.activity.lease())
            .collect();
        (paths, leases)
    }

    /// Touch a loaded project without creating it.
    pub fn touch_project(&self, project_path: impl AsRef<std::path::Path>) -> bool {
        let project_path = normalize_project_path(project_path);
        let mut projects = self.projects.lock().unwrap();
        if let Some(graph) = projects.get_mut(&project_path) {
            graph.activity.touch();
            true
        } else {
            false
        }
    }

    /// Dispose project graphs that have not been touched within the production timeout.
    pub fn reap_idle_projects(&self) -> usize {
        self.reap_idle_projects_with_ttl(self.project_idle_ttl)
    }

    /// Reap with an explicit timeout, allowing deterministic lifecycle tests without sleeping.
    pub fn reap_idle_projects_with_ttl(&self, ttl: Duration) -> usize {
        let now = Instant::now();
        let mut projects = self.projects.lock().unwrap();
        let before = projects.len();
        projects.retain(|_, graph| !graph.activity.is_idle_for(now, ttl));
        before - projects.len()
    }

    pub fn loaded_project_count(&self) -> usize {
        self.projects.lock().unwrap().len()
    }

    /// Dispose all child graphs before host shutdown.
    pub fn shutdown_projects(&self) {
        self.stop_reaper();
        self.projects.lock().unwrap().clear();
    }

    pub fn mark_last_good(&self) -> Result<(), PluginManagerError> {
        self.config.lock().unwrap().mark_last_good()?;
        Ok(())
    }

    pub fn replace_config(
        &self,
        document: PluginConfigDocument,
    ) -> Result<u64, PluginManagerError> {
        Ok(self.config.lock().unwrap().replace(document)?)
    }

    fn stop_reaper(&self) {
        if let Some(reaper) = self.reaper.lock().unwrap().take() {
            let _ = reaper.cancel.send(true);
            reaper.task.abort();
        }
    }

    fn rollback_settle(
        &self,
        verified: &VerifiedSettleRevisions,
        settle: &PluginSettleSnapshot,
    ) -> Result<RollbackSettleReceipt, PluginManagerError> {
        let mut loader = self.loader.lock().unwrap();
        let mut config = self.config.lock().unwrap();
        let mut projects = self.projects.lock().unwrap();
        if loader.revision() != verified.graph_revision
            || config.snapshot().revision != verified.config_revision
            || !project_revision_subset_matches(&verified.project_revisions, &projects)
        {
            return Err(PluginManagerError::StalePlan);
        }

        // Restore the durable primary first. Even if an unexpected loader error follows, the next
        // boot sees the previous policy instead of retrying the rejected one forever.
        let config_revision = config.replace(settle.previous_document.clone())?;

        let mut expectations = Vec::new();
        append_loader_expectations(
            &mut expectations,
            &settle.previous_global,
            CommandRealm::Global,
        );
        let mut errors = loader.apply(settle.previous_global.clone());
        for (path, graph) in projects.iter_mut() {
            let previous = settle
                .previous_projects
                .get(path)
                .cloned()
                .unwrap_or_else(|| {
                    self.project_loader_config(
                        &config,
                        &PluginScope::Project {
                            project_path: path.clone(),
                        },
                        None,
                    )
                });
            append_loader_expectations(
                &mut expectations,
                &previous,
                CommandRealm::project(path.clone()),
            );
            errors.extend(graph.loader.apply(previous));
        }
        self.reconcile_project_blockers_from_loaders(&mut projects);
        Ok(RollbackSettleReceipt {
            config_revision,
            graph_revision: loader.revision(),
            project_revisions: current_project_revisions(&projects),
            expectations,
            apply_error: (!errors.is_empty()).then(|| join_errors(errors)),
        })
    }

    fn rollback_failure(
        &self,
        context: &Context,
        receipt: &RollbackSettleReceipt,
    ) -> Option<String> {
        let mut failures = Vec::new();
        if let Some(error) = &receipt.apply_error {
            failures.push(format!("loader rejected restoration: {error}"));
        }

        let (revisions_match, runtime_failure) = {
            let loader = self.loader.lock().unwrap();
            let config = self.config.lock().unwrap();
            let projects = self.projects.lock().unwrap();
            (
                loader.revision() == receipt.graph_revision
                    && config.snapshot().revision == receipt.config_revision
                    && project_revision_subset_matches(&receipt.project_revisions, &projects),
                settle_failure(context, &receipt.expectations),
            )
        };
        if !revisions_match {
            failures.push("restored graph revision changed before verification".into());
        }
        if let Some(error) = runtime_failure {
            failures.push(format!("restored runtime did not settle: {error}"));
        }

        (!failures.is_empty()).then(|| failures.join("; "))
    }

    #[allow(clippy::too_many_arguments)]
    fn apply_policy_locked(
        &self,
        loader: &mut Loader,
        config: &mut PluginConfigStore,
        projects: &mut HashMap<String, ProjectGraph>,
        scope: &PluginScope,
        plugin: &str,
        metadata: &PluginMetadata,
        policy: PluginPolicy,
        reconcile_runtime: bool,
    ) -> Result<(), PluginManagerError> {
        let previous_global = loader.config().clone();
        let previous_projects: BTreeMap<String, LoaderConfig> = projects
            .iter()
            .map(|(path, graph)| (path.clone(), graph.loader.config().clone()))
            .collect();

        if reconcile_runtime {
            if matches!(scope, PluginScope::User) {
                let mut next = previous_global.clone();
                let default = self.default_entry(plugin);
                let target = next
                    .plugins
                    .entry(plugin.to_string())
                    .or_insert_with(|| default.clone());
                target.enabled = if metadata.essential || metadata.role == PluginRole::Core {
                    true
                } else {
                    policy.state.resolve(default.enabled)
                };
                target.config = if metadata.role == PluginRole::Core {
                    default.config
                } else {
                    policy.config.clone().unwrap_or(default.config)
                };
                let errors = loader.apply(next);
                if !errors.is_empty() {
                    let _ = loader.apply(previous_global);
                    return Err(PluginManagerError::Loader(join_errors(errors)));
                }
            }

            for (path, graph) in projects.iter_mut() {
                let applies = matches!(scope, PluginScope::User)
                    || matches!(scope, PluginScope::Project { project_path } if project_path == path);
                if !applies {
                    continue;
                }
                let project_scope = PluginScope::Project {
                    project_path: path.clone(),
                };
                let next = self.project_loader_config(
                    config,
                    &project_scope,
                    Some((scope, plugin, &policy)),
                );
                let errors = graph.loader.apply(next);
                if !errors.is_empty() {
                    rollback_runtime(loader, &previous_global, projects, &previous_projects);
                    self.reconcile_project_blockers_from_loaders(projects);
                    return Err(PluginManagerError::Loader(join_errors(errors)));
                }
                let applied = graph.loader.config().clone();
                self.reconcile_project_blockers(graph, &applied);
                graph.activity.touch();
            }
        }

        if let Err(error) = config.set_policy(scope.clone(), plugin.to_string(), policy) {
            if reconcile_runtime {
                rollback_runtime(loader, &previous_global, projects, &previous_projects);
                self.reconcile_project_blockers_from_loaders(projects);
            }
            return Err(error.into());
        }
        Ok(())
    }

    fn project_loader_config(
        &self,
        config: &PluginConfigStore,
        scope: &PluginScope,
        candidate: Option<(&PluginScope, &str, &PluginPolicy)>,
    ) -> LoaderConfig {
        let catalog = self.factory_catalog.lock().unwrap();
        let project_registry = catalog.registry.filtered(|factory| {
            factory
                .metadata
                .scope_support
                .contains(&PluginScopeSupport::Project)
        });
        project_loader_config_from(
            config,
            scope,
            candidate,
            &project_registry,
            &catalog.defaults,
        )
    }

    fn default_entry(&self, plugin: &str) -> PluginEntry {
        self.factory_catalog
            .lock()
            .unwrap()
            .defaults
            .plugins
            .get(plugin)
            .cloned()
            .unwrap_or_else(PluginEntry::disabled)
    }

    /// A project-capable plugin is owned by its project child graph, even while it is disabled,
    /// pending, or failed. Block its global handlers so a missing local contribution cannot hide a
    /// project failure or silently run with user-scoped state. Commands from genuinely global-only
    /// plugins continue to inherit normally.
    fn reconcile_project_blockers(&self, graph: &mut ProjectGraph, desired: &LoaderConfig) {
        let owned: BTreeSet<String> = desired.plugins.keys().cloned().collect();

        let obsolete: Vec<String> = graph
            .fallback_blockers
            .keys()
            .filter(|plugin| !owned.contains(*plugin))
            .cloned()
            .collect();
        for plugin in obsolete {
            if let Some(blocker) = graph.fallback_blockers.remove(&plugin) {
                blocker.dispose();
            }
        }

        // Rebuild ownership blockers on every reconciliation. The replacement scope also watches
        // target status changes, covering a global plugin that becomes active later because one
        // of its required services appeared.
        for plugin in owned {
            if let Some(blocker) = graph.fallback_blockers.remove(&plugin) {
                blocker.dispose();
            }
            let blocker = project_fallback_blocker(&graph.context, &plugin);
            graph.fallback_blockers.insert(plugin, blocker);
        }
    }

    fn reconcile_project_blockers_from_loaders(
        &self,
        projects: &mut HashMap<String, ProjectGraph>,
    ) {
        for graph in projects.values_mut() {
            let desired = graph.loader.config().clone();
            self.reconcile_project_blockers(graph, &desired);
        }
    }
}

fn combine_factory_catalog(
    base_registry: &PluginRegistry,
    base_defaults: &LoaderConfig,
    sources: &BTreeMap<String, DynamicPluginSource>,
) -> Result<(PluginRegistry, LoaderConfig), PluginManagerError> {
    let mut registry = base_registry.clone();
    let mut defaults = base_defaults.clone();
    let mut owners = base_registry
        .names()
        .into_iter()
        .map(|name| (name, "base".to_string()))
        .collect::<BTreeMap<_, _>>();

    for (source_name, source) in sources {
        for name in source.registry.names() {
            if owners.insert(name.clone(), source_name.clone()).is_some() {
                return Err(PluginManagerError::DynamicFactoryConflict(name));
            }
            if !source.defaults.plugins.contains_key(&name)
                || !source.fingerprints.contains_key(&name)
            {
                return Err(PluginManagerError::DynamicFactoryConflict(name));
            }
        }
        registry.extend(source.registry.clone());
        defaults
            .plugins
            .extend(source.defaults.plugins.clone().into_iter());
    }
    Ok((registry, defaults))
}

fn changed_dynamic_factories(
    previous: &DynamicPluginSource,
    next: &DynamicPluginSource,
) -> BTreeSet<String> {
    previous
        .registry
        .names()
        .into_iter()
        .chain(next.registry.names())
        .filter(|name| previous.fingerprints.get(name) != next.fingerprints.get(name))
        .collect()
}

fn project_loader_config_from(
    config: &PluginConfigStore,
    scope: &PluginScope,
    candidate: Option<(&PluginScope, &str, &PluginPolicy)>,
    registry: &PluginRegistry,
    defaults: &LoaderConfig,
) -> LoaderConfig {
    let mut output = LoaderConfig::default();
    for factory in registry.factories() {
        let default = defaults
            .plugins
            .get(&factory.name)
            .cloned()
            .unwrap_or_else(PluginEntry::disabled);
        if factory.metadata.role == PluginRole::Core {
            output.plugins.insert(factory.name.clone(), default);
            continue;
        }
        let user_scope = PluginScope::User;
        let user = candidate_policy(config, &user_scope, &factory.name, candidate);
        let project = candidate_policy(config, scope, &factory.name, candidate);
        let user_enabled = user.state.resolve(default.enabled);
        let enabled = project.state.resolve(user_enabled);
        let plugin_config = project.config.or(user.config).unwrap_or(default.config);
        output.plugins.insert(
            factory.name.clone(),
            PluginEntry {
                enabled,
                config: plugin_config,
            },
        );
    }
    output
}

impl Drop for PluginManager {
    fn drop(&mut self) {
        if let Some(reaper) = self.reaper.get_mut().unwrap().take() {
            let _ = reaper.cancel.send(true);
            reaper.task.abort();
        }
    }
}

fn project_reaper_interval(ttl: Duration) -> Duration {
    if ttl.is_zero() {
        return Duration::from_millis(1);
    }
    std::cmp::min(
        std::cmp::max(ttl / 4, Duration::from_millis(1)),
        Duration::from_secs(30),
    )
}

fn append_loader_expectations(
    output: &mut Vec<SettleExpectation>,
    config: &LoaderConfig,
    realm: CommandRealm,
) {
    output.extend(
        config
            .plugins
            .iter()
            .map(|(plugin, entry)| SettleExpectation {
                plugin: plugin.clone(),
                realm: realm.clone(),
                active: entry.enabled,
            }),
    );
}

fn settle_failure(context: &Context, expectations: &[SettleExpectation]) -> Option<String> {
    let scopes = context.runtime().scopes();
    for expected in expectations {
        let instances = scopes
            .iter()
            .filter(|scope| {
                scope.plugin == expected.plugin && scope.command_realm == expected.realm
            })
            .collect::<Vec<_>>();
        if expected.active {
            if instances.iter().any(|scope| scope.status == Status::Active) {
                continue;
            }
            let detail = instances
                .first()
                .map(|scope| {
                    scope.error.clone().unwrap_or_else(|| {
                        if scope.missing.is_empty() {
                            format!("status is {:?}", scope.status)
                        } else {
                            format!(
                                "status is {:?}; missing {}",
                                scope.status,
                                scope.missing.join(", ")
                            )
                        }
                    })
                })
                .unwrap_or_else(|| "no runtime instance was created".into());
            return Some(format!(
                "`{}` in {:?} was expected to be active, but {detail}",
                expected.plugin, expected.realm
            ));
        }
        if let Some(scope) = instances
            .iter()
            .find(|scope| matches!(scope.status, Status::Active | Status::Loading))
        {
            return Some(format!(
                "`{}` in {:?} was expected to be inactive, but status is {:?}",
                expected.plugin, expected.realm, scope.status
            ));
        }
    }
    None
}

fn project_fallback_blocker(context: &Context, plugin: &str) -> Fork {
    let plugin_name = plugin.to_string();
    let scope_name = format!("project-command-fallback:{plugin}");
    context.plugin(
        FnPlugin::new(scope_name, move |ctx: Context, _| {
            let target = plugin_name.clone();
            async move {
                for command in ctx.runtime().commands().into_iter().filter(|command| {
                    command.plugin == target && command.realm == CommandRealm::Global
                }) {
                    ctx.block_command_fallback(command.name)?;
                }

                let weak = ctx.weak();
                ctx.on::<StatusChanged, _>(move |event| {
                    if event.plugin == target {
                        if let Some(ctx) = weak.upgrade() {
                            ctx.reload();
                        }
                    }
                    None
                });
                Ok(())
            }
        }),
        Value::Null,
    )
}

fn effective_plugin_config(
    config: &PluginConfigStore,
    scope: &PluginScope,
    plugin: &str,
    default: Value,
) -> Value {
    let user = config.policy(&PluginScope::User, plugin);
    match scope {
        PluginScope::User => user.config.unwrap_or(default),
        PluginScope::Project { .. } => config
            .policy(scope, plugin)
            .config
            .or(user.config)
            .unwrap_or(default),
    }
}

fn candidate_policy(
    config: &PluginConfigStore,
    scope: &PluginScope,
    plugin: &str,
    candidate: Option<(&PluginScope, &str, &PluginPolicy)>,
) -> PluginPolicy {
    match candidate {
        Some((candidate_scope, candidate_plugin, policy))
            if candidate_scope == scope && candidate_plugin == plugin =>
        {
            policy.clone()
        }
        _ => config.policy(scope, plugin),
    }
}

fn project_revisions_match(
    expected: &ProjectRevisionSnapshot,
    projects: &HashMap<String, ProjectGraph>,
) -> bool {
    match expected {
        ProjectRevisionSnapshot::One { path, revision } => {
            projects.get(path).map(|graph| graph.loader.revision()) == *revision
        }
        ProjectRevisionSnapshot::All(expected) => {
            let current: BTreeMap<String, u64> = projects
                .iter()
                .map(|(path, graph)| (path.clone(), graph.loader.revision()))
                .collect();
            &current == expected
        }
    }
}

fn current_project_revisions(projects: &HashMap<String, ProjectGraph>) -> BTreeMap<String, u64> {
    projects
        .iter()
        .map(|(path, graph)| (path.clone(), graph.loader.revision()))
        .collect()
}

fn project_revision_subset_matches(
    expected: &BTreeMap<String, u64>,
    projects: &HashMap<String, ProjectGraph>,
) -> bool {
    expected.iter().all(|(path, revision)| {
        projects
            .get(path)
            .is_some_and(|graph| graph.loader.revision() == *revision)
    })
}

fn settle_revisions_match(
    result: &PluginChangeResult,
    expected_projects: &BTreeMap<String, u64>,
    loader: &Loader,
    config: &PluginConfigStore,
    projects: &HashMap<String, ProjectGraph>,
) -> bool {
    loader.revision() == result.graph_revision
        && config.snapshot().revision == result.config_revision
        && project_revision_subset_matches(expected_projects, projects)
}

fn rollback_runtime(
    loader: &mut Loader,
    previous_global: &LoaderConfig,
    projects: &mut HashMap<String, ProjectGraph>,
    previous_projects: &BTreeMap<String, LoaderConfig>,
) {
    let _ = loader.apply(previous_global.clone());
    for (path, previous) in previous_projects {
        if let Some(graph) = projects.get_mut(path) {
            let _ = graph.loader.apply(previous.clone());
        }
    }
}

fn affected_plugins(
    target: &str,
    entries: &[codetwo_kernel::LoaderEntryInfo],
    context: &WeakContext,
    scope: &PluginScope,
) -> Vec<String> {
    let mut affected = BTreeSet::from([target.to_string()]);
    let mut services = BTreeSet::from([target.to_string()]);
    if let Some(context) = context.upgrade() {
        for instance in context.runtime().scopes() {
            let in_realm = match (scope, &instance.command_realm) {
                (PluginScope::User, CommandRealm::Global) => true,
                (PluginScope::Project { project_path }, CommandRealm::Project(realm)) => {
                    project_path == realm
                }
                _ => false,
            };
            if in_realm && instance.plugin == target {
                services.extend(instance.services);
            }
        }
    }

    loop {
        let before = affected.len();
        for entry in entries {
            if affected.contains(&entry.name) {
                continue;
            }
            if entry
                .dependencies
                .watched()
                .any(|dependency| services.contains(dependency))
            {
                affected.insert(entry.name.clone());
                services.insert(entry.name.clone());
            }
        }
        if affected.len() == before {
            break;
        }
    }
    affected.into_iter().collect()
}

fn join_errors(errors: Vec<KernelError>) -> String {
    errors
        .into_iter()
        .map(|error| error.to_string())
        .collect::<Vec<_>>()
        .join("; ")
}

fn validate_schema(schema: Option<&Value>, value: &Value) -> Result<(), PluginManagerError> {
    let Some(schema) = schema else {
        return Ok(());
    };
    if schema.get("type").and_then(Value::as_str) == Some("object") && !value.is_object() {
        return Err(PluginManagerError::InvalidConfig(
            "expected an object".into(),
        ));
    }
    let Some(properties) = schema.get("properties").and_then(Value::as_object) else {
        return Ok(());
    };
    let Some(object) = value.as_object() else {
        return Ok(());
    };
    if let Some(required) = schema.get("required").and_then(Value::as_array) {
        for name in required.iter().filter_map(Value::as_str) {
            if !object.contains_key(name) {
                return Err(PluginManagerError::InvalidConfig(format!(
                    "`{name}` is required"
                )));
            }
        }
    }
    if schema.get("additionalProperties").and_then(Value::as_bool) == Some(false) {
        if let Some(name) = object.keys().find(|name| !properties.contains_key(*name)) {
            return Err(PluginManagerError::InvalidConfig(format!(
                "`{name}` is not an allowed property"
            )));
        }
    }
    for (name, field) in properties {
        let Some(actual) = object.get(name) else {
            continue;
        };
        if let Some(options) = field.get("enum").and_then(Value::as_array) {
            if !options.contains(actual) {
                return Err(PluginManagerError::InvalidConfig(format!(
                    "`{name}` is not one of the allowed values"
                )));
            }
        }
        let valid = match field.get("type").and_then(Value::as_str) {
            Some("string") => actual.is_string(),
            Some("boolean") => actual.is_boolean(),
            Some("number") => actual.is_number(),
            Some("integer") => actual.as_i64().is_some() || actual.as_u64().is_some(),
            Some("array") => actual.is_array(),
            Some("object") => actual.is_object(),
            _ => true,
        };
        if !valid {
            return Err(PluginManagerError::InvalidConfig(format!(
                "`{name}` has the wrong type"
            )));
        }
        if let Some(number) = actual.as_f64() {
            if let Some(minimum) = field.get("minimum").and_then(Value::as_f64) {
                if number < minimum {
                    return Err(PluginManagerError::InvalidConfig(format!(
                        "`{name}` must be at least {minimum}"
                    )));
                }
            }
            if let Some(maximum) = field.get("maximum").and_then(Value::as_f64) {
                if number > maximum {
                    return Err(PluginManagerError::InvalidConfig(format!(
                        "`{name}` must be at most {maximum}"
                    )));
                }
            }
            if let Some(minimum) = field.get("exclusiveMinimum").and_then(Value::as_f64) {
                if number <= minimum {
                    return Err(PluginManagerError::InvalidConfig(format!(
                        "`{name}` must be greater than {minimum}"
                    )));
                }
            }
            if let Some(maximum) = field.get("exclusiveMaximum").and_then(Value::as_f64) {
                if number >= maximum {
                    return Err(PluginManagerError::InvalidConfig(format!(
                        "`{name}` must be less than {maximum}"
                    )));
                }
            }
        }
    }
    Ok(())
}
