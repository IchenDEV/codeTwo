//! Remote terminal access — the browser talks to a real shell on this machine.
//!
//! Mirrors T3 Code's `terminal:operate` capability: a paired device opens a dedicated WebSocket
//! (`/ws/terminal?ticket=…`), names a terminal id, and gets the same emulator the desktop uses —
//! [`codetwo_core::term`] pairs a PTY with Ghostty's VT engine, so scrollback/reflow live on the
//! server and the terminal outlives whichever browser tab is drawing it.
//!
//! Wire protocol (JSON text frames):
//! - client → server, first frame: `{"op":"attach","id":"…","cwd":"…","rows":24,"cols":80}`.
//!   Attaching creates the terminal if needed; reattaching returns a VT `restore` dump to replay.
//! - client → server, after attach: `{"op":"input","data":"…"}`, `{"op":"resize","rows":…,"cols":…}`,
//!   `{"op":"kill"}`.
//! - server → client: `{"kind":"attached","id":…,"created":…,"restore":…,"title":…}`, then
//!   `{"kind":"data","data":…}` / `{"kind":"title","title":…}` frames, and `{"kind":"exit"}` when
//!   the child ends. Errors are `{"kind":"error","message":…}`.

use std::collections::HashMap;
use std::io;
use std::sync::{Arc, Mutex};

use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

use codetwo_core::term::{TerminalConfig, TerminalHandle, TerminalOutput};

/// Terminal ids come from clients; keep them short and predictable so they stay usable as map
/// keys, log fields, and DOM ids.
fn valid_terminal_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// A frame fanned out to every attached viewer of one terminal.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum TermFrame {
    Data { data: String },
    Title { title: String },
    Exit,
}

struct TermEntry {
    /// `None` after an explicit kill; dropping the handle ends the child.
    handle: Mutex<Option<TerminalHandle>>,
    output: broadcast::Sender<TermFrame>,
    title: Mutex<String>,
}

impl TermEntry {
    fn with_handle<T>(
        &self,
        f: impl FnOnce(&TerminalHandle) -> io::Result<T>,
    ) -> Result<T, String> {
        let guard = self.handle.lock().unwrap();
        let handle = guard.as_ref().ok_or("terminal was closed")?;
        f(handle).map_err(|e| e.to_string())
    }
}

/// Server-side registry of live terminals, shared by every remote viewer. Keyed by a client-chosen
/// id so a phone and a laptop can attach to the same shell, and reconnecting resumes rather than
/// respawns.
#[derive(Default)]
pub struct TerminalRegistry {
    entries: Mutex<HashMap<String, Arc<TermEntry>>>,
}

/// One row of the `/api/terminals` listing.
#[derive(Debug, Serialize)]
pub struct TerminalInfo {
    pub id: String,
    pub title: String,
}

impl TerminalRegistry {
    pub fn list(&self) -> Vec<TerminalInfo> {
        let mut rows: Vec<TerminalInfo> = self
            .entries
            .lock()
            .unwrap()
            .iter()
            .map(|(id, entry)| TerminalInfo {
                id: id.clone(),
                title: entry.title.lock().unwrap().clone(),
            })
            .collect();
        rows.sort_by(|a, b| a.id.cmp(&b.id));
        rows
    }

    /// Close a terminal for good: unlike detaching, this kills the child process. Viewers still
    /// holding the entry see an exit frame and subsequent writes fail.
    pub fn kill(&self, id: &str) -> bool {
        let Some(entry) = self.entries.lock().unwrap().remove(id) else {
            return false;
        };
        entry.handle.lock().unwrap().take();
        let _ = entry.output.send(TermFrame::Exit);
        true
    }

    /// Attach to terminal `id`, spawning it if it does not exist yet. Returns the entry, whether it
    /// was created, and a VT dump that replays the terminal as it stands (empty when created).
    fn attach(
        self: &Arc<Self>,
        id: &str,
        cfg: TerminalConfig,
    ) -> Result<(Arc<TermEntry>, bool, String), String> {
        if let Some(existing) = self.entries.lock().unwrap().get(id).cloned() {
            // The renderer may have been resized while detached; restore reflects the new size.
            existing.with_handle(|t| t.resize(cfg.rows, cfg.cols))?;
            let restore = existing.with_handle(|t| t.restore())?;
            return Ok((existing, false, restore));
        }

        let (handle, mut rx) = TerminalHandle::spawn(cfg).map_err(|e| e.to_string())?;
        let (out_tx, _) = broadcast::channel::<TermFrame>(1024);
        let entry = Arc::new(TermEntry {
            handle: Mutex::new(Some(handle)),
            output: out_tx.clone(),
            title: Mutex::new(String::new()),
        });

        // Insert under the lock, re-checking for a concurrent spawn of the same id: exactly one
        // child may own the id, so a racing duplicate is dropped (which kills its shell).
        {
            let mut entries = self.entries.lock().unwrap();
            if let Some(existing) = entries.get(id).cloned() {
                let restore = existing.with_handle(|t| t.restore())?;
                return Ok((existing, false, restore));
            }
            entries.insert(id.to_string(), entry.clone());
        }

        // Pump emulator output into the per-terminal broadcast so every viewer sees it. When the
        // stream ends the child is gone: announce it and drop the registry entry.
        let registry = self.clone();
        let pump_id = id.to_string();
        let pump_entry = entry.clone();
        tokio::spawn(async move {
            while let Some(out) = rx.recv().await {
                let frame = match out {
                    TerminalOutput::Data(data) => TermFrame::Data { data },
                    TerminalOutput::Title(title) => {
                        *pump_entry.title.lock().unwrap() = title.clone();
                        TermFrame::Title { title }
                    }
                };
                let _ = pump_entry.output.send(frame);
            }
            let _ = pump_entry.output.send(TermFrame::Exit);
            let mut entries = registry.entries.lock().unwrap();
            if entries
                .get(&pump_id)
                .is_some_and(|current| Arc::ptr_eq(current, &pump_entry))
            {
                entries.remove(&pump_id);
            }
        });

        Ok((entry, true, String::new()))
    }
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
enum TermInbound {
    /// Must be the first frame on the socket; rejected afterwards.
    Attach {
        id: String,
        #[serde(default)]
        cwd: Option<String>,
        rows: u16,
        cols: u16,
        #[serde(default)]
        tmux_session: Option<String>,
    },
    Input {
        data: String,
    },
    Resize {
        rows: u16,
        cols: u16,
    },
    Kill,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum TermOutbound<'a> {
    Attached {
        id: &'a str,
        created: bool,
        restore: &'a str,
        title: &'a str,
    },
    Error {
        message: &'a str,
    },
}

async fn send_json(sender: &mut (impl SinkExt<Message> + Unpin), value: impl Serialize) -> bool {
    let text = serde_json::to_string(&value).unwrap_or_default();
    sender.send(Message::Text(text)).await.is_ok()
}

/// Drive one authenticated terminal socket. `device_id` is the paired device the redeemed ticket
/// belonged to; it exists for tracing so shell access stays attributable.
pub async fn handle_socket(socket: WebSocket, registry: Arc<TerminalRegistry>, device_id: String) {
    let (mut sender, mut receiver) = socket.split();

    // First frame must be an attach naming the terminal.
    let attach = loop {
        match receiver.next().await {
            Some(Ok(Message::Text(text))) => match serde_json::from_str::<TermInbound>(&text) {
                Ok(TermInbound::Attach {
                    id,
                    cwd,
                    rows,
                    cols,
                    tmux_session,
                }) => break (id, cwd, rows, cols, tmux_session),
                Ok(_) => {
                    let _ = send_json(
                        &mut sender,
                        TermOutbound::Error {
                            message: "expected an attach frame first",
                        },
                    )
                    .await;
                    return;
                }
                Err(_) => {
                    let _ = send_json(
                        &mut sender,
                        TermOutbound::Error {
                            message: "malformed terminal frame",
                        },
                    )
                    .await;
                    return;
                }
            },
            Some(Ok(Message::Close(_))) | None => return,
            Some(Ok(_)) => continue,
            Some(Err(_)) => return,
        }
    };
    let (id, cwd, rows, cols, tmux_session) = attach;
    if !valid_terminal_id(&id) {
        let _ = send_json(
            &mut sender,
            TermOutbound::Error {
                message: "invalid terminal id",
            },
        )
        .await;
        return;
    }

    let cfg = TerminalConfig {
        cwd,
        rows: rows.max(1),
        cols: cols.max(1),
        scrollback: 10_000,
        tmux_session,
    };
    // Spawning blocks on a thread handshake; keep it off the async worker.
    let spawn_registry = registry.clone();
    let spawn_id = id.clone();
    let attached =
        tokio::task::spawn_blocking(move || spawn_registry.attach(&spawn_id, cfg)).await;
    let (entry, created, restore) = match attached {
        Ok(Ok(result)) => result,
        Ok(Err(message)) => {
            let _ = send_json(&mut sender, TermOutbound::Error { message: &message }).await;
            return;
        }
        Err(_) => {
            let _ = send_json(
                &mut sender,
                TermOutbound::Error {
                    message: "terminal spawn task failed",
                },
            )
            .await;
            return;
        }
    };
    tracing::info!("remote terminal: device {device_id} attached to {id} (created: {created})");

    // Subscribe before sending the restore dump. Output emitted between the dump and this
    // subscription can appear twice in the renderer — the same benign race the desktop attach
    // path accepts; the alternative (sequencing every frame against the dump) is not worth it.
    let mut frames = entry.output.subscribe();
    let title = entry.title.lock().unwrap().clone();
    if !send_json(
        &mut sender,
        TermOutbound::Attached {
            id: &id,
            created,
            restore: &restore,
            title: &title,
        },
    )
    .await
    {
        return;
    }

    // Outbound: broadcast frames → socket. A viewer that lags far enough to drop frames is
    // reattached by the client (the exit-less close below triggers its reconnect).
    let mut send_task = tokio::spawn(async move {
        loop {
            match frames.recv().await {
                Ok(frame) => {
                    let exit = matches!(frame, TermFrame::Exit);
                    if !send_json(&mut sender, &frame).await || exit {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => break,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    // Inbound: keystrokes and resizes → the shared terminal.
    let recv_registry = registry.clone();
    let recv_entry = entry.clone();
    let recv_id = id.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            let Message::Text(text) = msg else { continue };
            match serde_json::from_str::<TermInbound>(&text) {
                Ok(TermInbound::Input { data }) => {
                    if recv_entry.with_handle(|t| t.write(data.as_bytes())).is_err() {
                        break;
                    }
                }
                Ok(TermInbound::Resize { rows, cols }) => {
                    let _ = recv_entry.with_handle(|t| t.resize(rows, cols));
                }
                Ok(TermInbound::Kill) => {
                    recv_registry.kill(&recv_id);
                    break;
                }
                Ok(TermInbound::Attach { .. }) | Err(_) => {
                    tracing::debug!("remote terminal: ignoring bad frame");
                }
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn terminal_ids_are_validated() {
        assert!(super::valid_terminal_id("web-1"));
        assert!(super::valid_terminal_id("session_2.main"));
        assert!(!super::valid_terminal_id(""));
        assert!(!super::valid_terminal_id("../etc"));
        assert!(!super::valid_terminal_id("has space"));
        assert!(!super::valid_terminal_id(&"x".repeat(65)));
    }
}
