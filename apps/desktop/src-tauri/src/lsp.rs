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
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

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
#[tauri::command]
pub fn lsp_start(
    app: AppHandle,
    state: State<LspState>,
    cwd: String,
    lang: String,
) -> Result<Option<String>, String> {
    for (bin, args) in candidates(&lang) {
        let Some(path) = codetwo_core::provider::which(bin) else {
            continue;
        };
        let key = format!("{bin}:{cwd}");
        let mut servers = state.0.lock().unwrap();
        if let Some(server) = servers.get_mut(&key) {
            // A dead entry (crashed server) must not shadow a fresh spawn.
            match server.child.try_wait() {
                Ok(None) => return Ok(Some(key)),
                _ => {
                    servers.remove(&key);
                }
            }
        }
        let mut child = Command::new(&path)
            .args(args.iter())
            .current_dir(&cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("{bin}: {e}"))?;
        let stdin = child.stdin.take().expect("piped stdin");
        let stdout = child.stdout.take().expect("piped stdout");
        {
            let app = app.clone();
            let key = key.clone();
            std::thread::spawn(move || read_loop(app, key, stdout));
        }
        servers.insert(key.clone(), Server { child, stdin });
        return Ok(Some(key));
    }
    Ok(None)
}

/// Forward one already-serialized JSON-RPC message to the server, framed.
#[tauri::command]
pub fn lsp_send(state: State<LspState>, key: String, payload: String) -> Result<(), String> {
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
            let _ = app.emit("lsp-message", LspMessage { key: key.clone(), payload });
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
