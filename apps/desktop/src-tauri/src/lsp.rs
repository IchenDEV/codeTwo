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
use std::sync::{Arc, Mutex};

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

pub struct LspState(pub Mutex<HashMap<String, Server>>);

pub struct Server {
    child: Child,
    stdin: ChildStdin,
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
    let mut servers = state.0.lock().unwrap();
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
    let mut servers = state.0.lock().unwrap();
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
    /// Kill every child. Called on app exit — an orphaned rust-analyzer indexes forever.
    pub fn kill_all(&self) {
        let mut servers = self.0.lock().unwrap();
        for (_, mut server) in servers.drain() {
            let _ = server.child.kill();
            let _ = server.child.wait();
        }
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
        let state = Arc::new(LspState(Mutex::new(HashMap::new())));
        let cleanup = state.clone();
        ctx.effect(move || cleanup.kill_all());
        let changed = state.clone();
        ctx.on::<PluginsChanged, _>(move |_| {
            changed.kill_all();
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
