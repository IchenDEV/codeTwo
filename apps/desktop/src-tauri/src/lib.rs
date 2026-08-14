//! Code2 desktop bridge: a thin Tauri layer over `codetwo-core`.
//!
//! The desktop no longer *builds* a Code2 — it boots one. `setup` starts the core plugin graph
//! ([`codetwo_core::app`]) plus its native host plugins, then subscribes to the graph's event and
//! terminal services solely to forward their streams to the webview. Its authenticated browser
//! MCP is contributed as a replacement `engine` builder, not a fork of the boot sequence.
//!
//! Frontends push `Op`s through commands and receive `Event`s streamed over the `engine-event`
//! channel. Terminals live in the core as real emulators (`codetwo_core::term`) keyed by a stable
//! id; the frontend attaches to one and streams it over `pty-output`.
//!
//! New surface should be added as a **plugin command** and reached through the generic
//! [`call`] bridge, not as another `#[tauri::command]` — see `docs/plugins.md`. `call` is the sole
//! Tauri command; desktop-native browser, LSP, automation and remote commands are host plugins in
//! the same graph.

mod automation;
mod browser;
mod browser_mcp;
mod host_events;
mod lsp;
mod mcp_executable;
mod remote;

use std::sync::Arc;

use codetwo_core::app::plugins::{EngineInputs, EnginePlugin};
use codetwo_core::app::{AppConfig, CoreApp};
use codetwo_core::{CanvasFeatureGate, DesktopMcpConfig, Engine};
use codetwo_kernel::PluginEntry;
use tauri::{Manager, State};

struct AppState {
    core: CoreApp,
}

// ---- commands --------------------------------------------------------------------------------

/// The generic bridge into the plugin graph: `call("git.status", { cwd })`.
///
/// Every command a loaded plugin registers is reachable through this one entry point, so a new
/// feature does not need a new `#[tauri::command]`, a new line in `generate_handler!`, and a new
/// import in the frontend — it needs a plugin.
#[tauri::command]
async fn call(
    state: State<'_, AppState>,
    name: String,
    args: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    state
        .core
        .call(&name, args.unwrap_or(serde_json::Value::Null))
        .await
        .map_err(|error| error.to_string())
}

fn now_millis() -> i64 {
    codetwo_core::session::now_millis()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Launched from Finder we inherit a bare PATH, and every CLI we shell out to — the provider
    // adapters, the voice transcriber — looks missing. Do this before anything reads the
    // environment or spawns a child.
    codetwo_core::provider::augment_search_path();
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // "Add a project" opens a real folder chooser. Typing an absolute path into a text field
        // is the kind of thing that makes a desktop app feel like a web form.
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir).ok();

            let browser_socket_path = data_dir.join("codetwo-browser.sock");
            let browser_master_key = uuid::Uuid::new_v4().to_string();
            app.manage(browser::BrowserState::load(&data_dir));

            let canvas_gate = CanvasFeatureGate::disabled();
            let mcp_command = mcp_executable::stage(&std::env::current_exe()?, &data_dir)?;
            let desktop_mcp = DesktopMcpConfig {
                command: mcp_command.to_string_lossy().into_owned(),
                socket_path: browser_socket_path.to_string_lossy().into_owned(),
                master_key: browser_master_key.clone(),
            };

            // The one place the desktop differs from every other host: its Codex sessions get the
            // authenticated browser MCP. That is a replacement `engine` plugin, not a second boot
            // sequence — everything else about the engine (its injections, its event pump, its
            // session commands) stays shared.
            let mut registry = codetwo_core::app::plugins::builtin_registry();
            registry.register_arc(Box::new(move || {
                let desktop_mcp = desktop_mcp.clone();
                Arc::new(EnginePlugin::with_builder_and_required(
                    Arc::new(move |inputs: EngineInputs| {
                        Engine::with_store_canvas_and_desktop_mcp(
                            inputs.providers,
                            inputs.skills,
                            inputs.store,
                            canvas_gate,
                            desktop_mcp.clone(),
                        )
                    }),
                    ["browser"],
                ))
            }));

            let handle = app.handle().clone();
            registry.register(move || automation::AutomationPlugin::new(handle.clone()));
            let handle = app.handle().clone();
            let socket_path = browser_socket_path.clone();
            let master_key = browser_master_key.clone();
            registry.register(move || {
                browser::BrowserPlugin::new(handle.clone(), socket_path.clone(), master_key.clone())
            });
            let handle = app.handle().clone();
            registry.register(move || lsp::LspPlugin::new(handle.clone()));
            let handle = app.handle().clone();
            registry.register(move || host_events::HostEventsPlugin::new(handle.clone()));
            let remote_auth_path = data_dir.join("remote-devices.json");
            registry.register(move || remote::RemotePlugin::new(remote_auth_path.clone()));

            let config = AppConfig::new(&data_dir)
                .with("automation", PluginEntry::default())
                .with("browser", PluginEntry::default())
                .with("desktop-events", PluginEntry::default())
                .with("lsp", PluginEntry::default())
                .with("remote", PluginEntry::default());

            let core = tauri::async_runtime::block_on(CoreApp::boot_with(config, registry))
                .map_err(|error| error.to_string())?;

            app.manage(AppState { core });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![call])
        .build(tauri::generate_context!())
        .expect("error while running Code2")
        .run(|_, _| {});
}

/// Entrypoint used by the exact internal MCP launch flag. This path does not initialize Tauri or
/// any user-facing window.
pub fn run_browser_mcp() -> Result<(), String> {
    browser_mcp::run()
}
