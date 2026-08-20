//! Language-server processes for the file editor.
//!
//! The frontend speaks LSP; this module only owns the transport: spawn the right binary for a
//! language rooted at a project directory, frame stdio JSON-RPC (`Content-Length` headers), and
//! stream every server message to the webview as an `lsp-message` event. One server per
//! (binary, project) pair, keyed `"binary:cwd"` — two sessions in the same project share a
//! rust-analyzer; two projects never do.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use codetwo_core::app::events::PluginsChanged;
use codetwo_core::app::Paths;
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginError, PluginResult};
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

pub struct LspPlugin {
    app: AppHandle,
}

impl LspPlugin {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

pub struct LspState {
    servers: Mutex<HashMap<String, Server>>,
    accepting_starts: AtomicBool,
    closing: AtomicBool,
}

pub struct Server {
    child: Child,
    stdin: ChildStdin,
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Serialize, Clone)]
struct LspMessage {
    key: String,
    payload: String,
}

/// Candidate servers per language id, first installed wins. These are the stock binaries each
/// ecosystem installs (`rustup component add rust-analyzer`, `npm i -g pyright`, …); none ship
/// with the app. A language with no entry — or no binary on PATH — simply has no LSP, and the
/// editor falls back to Monaco's built-ins.
fn candidates(lang: &str) -> &'static [(&'static str, &'static [&'static str])] {
    match lang {
        "rust" => &[("rust-analyzer", &[])],
        "python" => &[("pyright-langserver", &["--stdio"]), ("pylsp", &[])],
        "go" => &[("gopls", &[])],
        "c" | "cpp" => &[("clangd", &["--background-index"])],
        "typescript" | "javascript" => &[("typescript-language-server", &["--stdio"])],
        "vue" => &[("vue-language-server", &["--stdio"])],
        "svelte" => &[("svelteserver", &["--stdio"])],
        "ruby" => &[("solargraph", &["stdio"])],
        "php" => &[("intelephense", &["--stdio"])],
        "yaml" => &[("yaml-language-server", &["--stdio"])],
        _ => &[],
    }
}

/// Spawn (or reuse) a server for `lang` rooted at `cwd`. `None` means "nothing installed for this
/// language" — an expected outcome, not an error.
fn lsp_start(
    app: &AppHandle,
    state: &LspState,
    paths: &Paths,
    cwd: String,
    lang: String,
) -> Result<Option<String>, String> {
    state.ensure_open()?;
    let plugins_dir = paths.plugins();
    if plugins_dir.is_dir() {
        let plugins = codetwo_core::plugin::load_dir(&plugins_dir).unwrap_or_default();
        for plugin in plugins
            .into_iter()
            .filter(|plugin| plugin.enabled && plugin.trusted)
        {
            for server in plugin.lsp_servers.into_iter().filter(|server| {
                server.transport == "stdio"
                    && server
                        .extension_to_language
                        .iter()
                        .any(|(_, language)| language == &lang)
            }) {
                let command = expand_project_dir(&server.command, &cwd);
                let args = server
                    .args
                    .iter()
                    .map(|arg| expand_project_dir(arg, &cwd))
                    .collect::<Vec<_>>();
                let mut env = server
                    .env
                    .into_iter()
                    .filter(|(name, _)| {
                        !matches!(
                            name.as_str(),
                            "CLAUDE_PROJECT_DIR" | "CODEX_PROJECT_DIR" | "PLUGIN_PROJECT_DIR"
                        )
                    })
                    .map(|(name, value)| (name, expand_project_dir(&value, &cwd)))
                    .collect::<Vec<_>>();
                env.push(("CLAUDE_PROJECT_DIR".into(), cwd.clone()));
                env.push(("CODEX_PROJECT_DIR".into(), cwd.clone()));
                env.push(("PLUGIN_PROJECT_DIR".into(), cwd.clone()));
                if let Some(key) = start_server(
                    app,
                    state,
                    &cwd,
                    &format!("plugin:{}:{}", plugin.id, server.name),
                    &command,
                    &args,
                    &env,
                )? {
                    return Ok(Some(key));
                }
            }
        }
    }
    for (bin, args) in candidates(&lang) {
        let args = args
            .iter()
            .map(|arg| (*arg).to_string())
            .collect::<Vec<_>>();
        if let Some(key) = start_server(app, state, &cwd, bin, bin, &args, &[])? {
            return Ok(Some(key));
        }
    }
    Ok(None)
}

fn start_server(
    app: &AppHandle,
    state: &LspState,
    cwd: &str,
    key_name: &str,
    command: &str,
    args: &[String],
    env: &[(String, String)],
) -> Result<Option<String>, String> {
    let Some(path) = codetwo_core::provider::which(command) else {
        return Ok(None);
    };
    let key = format!("{key_name}:{cwd}");
    let mut servers = state.lock_for_start()?;
    if let Some(server) = servers.get_mut(&key) {
        match server.child.try_wait() {
            Ok(None) => return Ok(Some(key)),
            _ => {
                servers.remove(&key);
            }
        }
    }
    let mut child = Command::new(&path)
        .args(args)
        .envs(env.iter().cloned())
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("{command}: {error}"))?;
    let stdin = child.stdin.take().expect("piped stdin");
    let stdout = child.stdout.take().expect("piped stdout");
    {
        let app = app.clone();
        let key = key.clone();
        std::thread::spawn(move || read_loop(app, key, stdout));
    }
    servers.insert(key.clone(), Server { child, stdin });
    Ok(Some(key))
}

fn expand_project_dir(value: &str, cwd: &str) -> String {
    value
        .replace("${CLAUDE_PROJECT_DIR}", cwd)
        .replace("$CLAUDE_PROJECT_DIR", cwd)
        .replace("${CODEX_PROJECT_DIR}", cwd)
        .replace("$CODEX_PROJECT_DIR", cwd)
        .replace("${PLUGIN_PROJECT_DIR}", cwd)
}

/// Forward one already-serialized JSON-RPC message to the server, framed.
fn lsp_send(state: &LspState, key: String, payload: String) -> Result<(), String> {
    let mut servers = state.lock_for_start()?;
    let server = servers.get_mut(&key).ok_or("no such language server")?;
    let framed = format!("Content-Length: {}\r\n\r\n{}", payload.len(), payload);
    server
        .stdin
        .write_all(framed.as_bytes())
        .and_then(|()| server.stdin.flush())
        .map_err(|e| e.to_string())
}

/// Read framed messages off the server's stdout until it closes, emitting each to the webview.
fn read_loop(app: AppHandle, key: String, stdout: ChildStdout) {
    let mut reader = BufReader::new(stdout);
    loop {
        let mut content_length = 0usize;
        loop {
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => {
                    let _ = app.emit("lsp-exit", key.clone());
                    return;
                }
                Ok(_) => {}
            }
            let line = line.trim_end();
            if line.is_empty() {
                break;
            }
            if let Some(v) = line.strip_prefix("Content-Length:") {
                content_length = v.trim().parse().unwrap_or(0);
            }
        }
        if content_length == 0 {
            continue;
        }
        let mut buf = vec![0u8; content_length];
        if reader.read_exact(&mut buf).is_err() {
            let _ = app.emit("lsp-exit", key.clone());
            return;
        }
        if let Ok(payload) = String::from_utf8(buf) {
            let _ = app.emit(
                "lsp-message",
                LspMessage {
                    key: key.clone(),
                    payload,
                },
            );
        }
    }
}

impl LspState {
    fn new() -> Self {
        Self {
            servers: Mutex::new(HashMap::new()),
            accepting_starts: AtomicBool::new(true),
            closing: AtomicBool::new(false),
        }
    }

    fn ensure_open(&self) -> Result<(), String> {
        if self.closing.load(Ordering::Acquire) {
            Err("language-server plugin is unloading".into())
        } else {
            Ok(())
        }
    }

    /// Take the same lock used by shutdown and re-check the closing gate while holding it. This
    /// makes spawning and registering a child atomic with respect to plugin teardown.
    fn lock_for_start(&self) -> Result<MutexGuard<'_, HashMap<String, Server>>, String> {
        let servers = self.servers.lock().unwrap();
        self.ensure_open()?;
        if !self.accepting_starts.load(Ordering::Acquire) {
            return Err("language-server runtime is disabled".into());
        }
        Ok(servers)
    }

    /// Stop the current servers without closing the service. Plugin bundle changes use this to
    /// make the next editor request resolve the updated language-server definition.
    fn stop_all(&self) {
        self.servers.lock().unwrap().clear();
    }

    /// Component policy is reversible and independent of permanent plugin shutdown. Suspending
    /// closes the start gate before taking the server lock, so a start still scanning PATH either
    /// observes the gate at insertion or finishes first and is drained here.
    fn set_runtime_enabled(&self, enabled: bool) -> Result<(), String> {
        self.ensure_open()?;
        self.accepting_starts.store(enabled, Ordering::Release);
        if !enabled {
            self.stop_all();
        }
        Ok(())
    }

    /// Permanently close the service and kill every child. The gate is set before taking the
    /// server lock: an in-flight spawn either finishes first and is drained here, or observes the
    /// gate after acquiring the lock and refuses to spawn.
    fn shutdown(&self) {
        self.closing.store(true, Ordering::Release);
        self.stop_all();
    }
}

fn take_args<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, PluginError> {
    serde_json::from_value(value)
        .map_err(|error| PluginError::new(format!("bad arguments: {error}")))
}

#[async_trait]
impl Plugin for LspPlugin {
    fn name(&self) -> &str {
        "lsp"
    }

    fn inject(&self) -> Injection {
        Injection::required(["paths"]).with_optional(["plugin-hub"])
    }

    fn description(&self) -> Option<&str> {
        Some("Desktop language-server process transport.")
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let paths = ctx
            .get::<Paths>()
            .ok_or_else(|| PluginError::new("paths service is unavailable"))?;
        let state = Arc::new(LspState::new());
        let cleanup = state.clone();
        ctx.effect(move || cleanup.shutdown());
        let changed = state.clone();
        ctx.on::<PluginsChanged, _>(move |_| {
            changed.stop_all();
            None
        });

        #[derive(Deserialize)]
        struct StartArgs {
            cwd: String,
            lang: String,
        }
        let app = self.app.clone();
        let service = state.clone();
        let plugin_paths = paths.clone();
        ctx.command("lsp.start", move |args| {
            let app = app.clone();
            let service = service.clone();
            let plugin_paths = plugin_paths.clone();
            async move {
                let args: StartArgs = take_args(args)?;
                serde_json::to_value(
                    lsp_start(&app, &service, &plugin_paths, args.cwd, args.lang)
                        .map_err(PluginError::new)?,
                )
                .map_err(PluginError::new)
            }
        })?;

        #[derive(Deserialize)]
        struct RuntimeEnabledArgs {
            enabled: bool,
        }
        let runtime_service = state.clone();
        ctx.command("lsp.set_runtime_enabled", move |args| {
            let service = runtime_service.clone();
            async move {
                let args: RuntimeEnabledArgs = take_args(args)?;
                service
                    .set_runtime_enabled(args.enabled)
                    .map_err(PluginError::new)?;
                Ok(Value::Null)
            }
        })?;

        #[derive(Deserialize)]
        struct SendArgs {
            key: String,
            payload: String,
        }
        ctx.command("lsp.send", move |args| {
            let service = state.clone();
            async move {
                let args: SendArgs = take_args(args)?;
                lsp_send(&service, args.key, args.payload).map_err(PluginError::new)?;
                Ok(Value::Null)
            }
        })?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::LspState;

    #[test]
    fn shutdown_closes_the_lsp_start_gate() {
        let state = LspState::new();

        assert!(state.lock_for_start().is_ok());
        state.shutdown();

        assert_eq!(
            state.lock_for_start().err().as_deref(),
            Some("language-server plugin is unloading")
        );
    }

    #[test]
    fn stop_all_preserves_the_lsp_start_gate() {
        let state = LspState::new();

        state.stop_all();
        assert!(state.lock_for_start().is_ok());

        state.set_runtime_enabled(false).unwrap();
        state.stop_all();
        assert_eq!(
            state.lock_for_start().err().as_deref(),
            Some("language-server runtime is disabled")
        );
    }

    #[test]
    fn suspend_rejects_a_start_that_reaches_the_lock_after_scanning() {
        let state = LspState::new();

        // `lsp_start` has passed its early check and is scanning plugin/PATH candidates here.
        assert!(state.ensure_open().is_ok());
        state.set_runtime_enabled(false).unwrap();

        assert_eq!(
            state.lock_for_start().err().as_deref(),
            Some("language-server runtime is disabled")
        );
    }

    #[test]
    fn resume_reopens_component_gate_but_not_permanent_shutdown() {
        let state = LspState::new();

        state.set_runtime_enabled(false).unwrap();
        state.set_runtime_enabled(true).unwrap();
        assert!(state.lock_for_start().is_ok());

        state.shutdown();
        assert_eq!(
            state.set_runtime_enabled(true).err().as_deref(),
            Some("language-server plugin is unloading")
        );
    }
}
