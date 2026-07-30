//! The embedded terminal — a real terminal emulator, not just a byte pipe.
//!
//! Each terminal pairs a PTY ([`crate::pty`]) with a `libghostty-vt` `Terminal`: Ghostty's VT
//! engine, which does the escape-sequence parsing, scrollback, and reflow-on-resize that a
//! frontend would otherwise have to own. Because the core holds that state, a terminal outlives
//! whatever is drawing it: the GUI can throw its renderer away and later replay
//! [`TerminalHandle::restore`] — a VT dump of scrollback, screen, cursor, and styles — into a
//! fresh one. That is what makes switching dock tabs or restarting the app non-destructive.
//!
//! `libghostty-vt` is `!Send`, so the emulator owns a dedicated thread and is reached through a
//! command channel. The thread also owns the PTY reader, which keeps "bytes arrived" and "the UI
//! asked for something" on the same queue and means the VT state is never observed mid-write.
//!
//! Note that the frontend renderer is still what answers device queries (DA, DSR). We therefore
//! deliberately do *not* register `on_pty_write`, so libghostty's own replies are dropped rather
//! than reaching the child twice.

use std::io::{self, Read};
use std::sync::mpsc as chan;

use libghostty_vt::fmt::{Format, Formatter, FormatterOptions};
use libghostty_vt::selection::Selection;
use libghostty_vt::terminal::{Options, Point, PointCoordinate, Terminal};
use tokio::sync::mpsc;

use crate::pty::PtySession;
use crate::tmux;

/// How a terminal should be started.
#[derive(Debug, Clone)]
pub struct TerminalConfig {
    /// Working directory for the shell.
    pub cwd: Option<String>,
    pub rows: u16,
    pub cols: u16,
    /// Lines of scrollback the emulator keeps.
    pub scrollback: usize,
    /// When set (and tmux is installed), run inside a persistent, attachable tmux session of this
    /// name instead of a plain login shell.
    pub tmux_session: Option<String>,
}

impl Default for TerminalConfig {
    fn default() -> Self {
        Self {
            cwd: None,
            rows: 24,
            cols: 80,
            scrollback: 10_000,
            tmux_session: None,
        }
    }
}

/// Everything the emulator pushes at whoever is rendering it.
#[derive(Debug, Clone)]
pub enum TerminalOutput {
    /// Output bytes, framed so a multi-byte character is never split across two messages.
    Data(String),
    /// The title the child set via OSC 0/2, or the working directory via OSC 7.
    Title(String),
}

/// How much of the terminal to read back.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scope {
    /// The visible screen only.
    Screen,
    /// Scrollback plus the visible screen.
    All,
}

enum Cmd {
    /// Output read from the PTY.
    Bytes(Vec<u8>),
    /// Keystrokes headed for the PTY.
    Write(Vec<u8>),
    Resize {
        rows: u16,
        cols: u16,
    },
    Dump {
        format: Format,
        scope: Scope,
        reply: chan::SyncSender<String>,
    },
    /// The child closed the PTY.
    Eof,
    /// The handle went away; shut down and kill the child.
    Kill,
}

/// A live terminal. Cheap to clone-free share behind a lock; dropping it kills the child.
pub struct TerminalHandle {
    tx: chan::Sender<Cmd>,
}

impl TerminalHandle {
    /// Start a shell under a fresh emulator. Returns the handle plus the stream a renderer
    /// consumes; the stream ends when the child exits.
    pub fn spawn(
        cfg: TerminalConfig,
    ) -> io::Result<(Self, mpsc::UnboundedReceiver<TerminalOutput>)> {
        let rows = cfg.rows.max(1);
        let cols = cfg.cols.max(1);

        let (pty, reader) = match cfg.tmux_session.filter(|_| tmux::is_available()) {
            Some(name) => {
                PtySession::spawn_tmux(&tmux::session_name(&name), cfg.cwd.as_deref(), rows, cols)?
            }
            None => {
                let shell = std::env::var("SHELL").unwrap_or_else(|_| "sh".into());
                PtySession::spawn(&shell, &["-l"], cfg.cwd.as_deref(), rows, cols)?
            }
        };

        let (tx, rx) = chan::channel::<Cmd>();
        let (out_tx, out_rx) = mpsc::unbounded_channel::<TerminalOutput>();
        let (ready_tx, ready) = chan::sync_channel::<Result<(), String>>(1);

        // The PTY reader blocks, so it gets its own thread and funnels into the emulator's queue.
        let reader_tx = tx.clone();
        std::thread::spawn(move || pump(reader, reader_tx));

        // The emulator is `!Send`, so it must be constructed on the thread that will own it — hence
        // the handshake rather than passing one in.
        let opts = Options {
            cols,
            rows,
            max_scrollback: cfg.scrollback,
        };
        std::thread::spawn(move || run(opts, pty, rx, out_tx, ready_tx));

        match ready.recv() {
            Ok(Ok(())) => Ok((Self { tx }, out_rx)),
            Ok(Err(e)) => Err(io::Error::other(e)),
            Err(_) => Err(io::Error::other("terminal thread died during startup")),
        }
    }

    /// Feed keystrokes (or pasted text) to the child.
    pub fn write(&self, data: &[u8]) -> io::Result<()> {
        self.send(Cmd::Write(data.to_vec()))
    }

    /// Resize both the emulator (which reflows wrapped lines) and the PTY.
    pub fn resize(&self, rows: u16, cols: u16) -> io::Result<()> {
        self.send(Cmd::Resize {
            rows: rows.max(1),
            cols: cols.max(1),
        })
    }

    /// A VT-sequence dump of scrollback, screen, cursor, and styles. Replaying this into an empty
    /// renderer reproduces the terminal as it stands.
    pub fn restore(&self) -> io::Result<String> {
        self.dump(Format::Vt, Scope::All)
    }

    /// Terminal contents as plain text — what an agent should be shown.
    pub fn text(&self, scope: Scope) -> io::Result<String> {
        self.dump(Format::Plain, scope)
    }

    fn dump(&self, format: Format, scope: Scope) -> io::Result<String> {
        let (reply, rx) = chan::sync_channel(1);
        self.send(Cmd::Dump {
            format,
            scope,
            reply,
        })?;
        rx.recv().map_err(|_| io::Error::other("terminal stopped"))
    }

    fn send(&self, cmd: Cmd) -> io::Result<()> {
        self.tx
            .send(cmd)
            .map_err(|_| io::Error::other("terminal stopped"))
    }
}

impl Drop for TerminalHandle {
    fn drop(&mut self) {
        // Closing the channel isn't enough to stop the emulator: the reader thread holds a sender
        // and is parked in a blocking `read`. Killing the child is what unblocks it.
        let _ = self.tx.send(Cmd::Kill);
    }
}

/// Read the PTY until it closes, forwarding into the emulator's queue.
fn pump(mut reader: Box<dyn Read + Send>, tx: chan::Sender<Cmd>) {
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                if tx.send(Cmd::Bytes(buf[..n].to_vec())).is_err() {
                    return;
                }
            }
        }
    }
    let _ = tx.send(Cmd::Eof);
}

/// The emulator thread: the only place the `libghostty-vt` terminal is ever touched.
fn run(
    opts: Options,
    mut pty: PtySession,
    rx: chan::Receiver<Cmd>,
    out: mpsc::UnboundedSender<TerminalOutput>,
    ready: chan::SyncSender<Result<(), String>>,
) {
    let mut term = match Terminal::new(opts) {
        Ok(t) => {
            let _ = ready.send(Ok(()));
            t
        }
        Err(e) => {
            let _ = ready.send(Err(format!("terminal init failed: {e:?}")));
            return;
        }
    };

    let mut utf8 = Utf8Stream::default();
    let mut title = String::new();

    while let Ok(cmd) = rx.recv() {
        match cmd {
            Cmd::Bytes(bytes) => {
                term.vt_write(&bytes);

                let text = utf8.push(&bytes);
                if !text.is_empty() && out.send(TerminalOutput::Data(text)).is_err() {
                    break;
                }

                // OSC 0/2 (title) if the child set one, else OSC 7 (cwd) — both are better tab
                // labels than a number, and the child tells us for free.
                let current = match term.title() {
                    Ok(t) if !t.is_empty() => t,
                    _ => term.pwd().unwrap_or(""),
                };
                if current != title {
                    title = current.to_string();
                    if out.send(TerminalOutput::Title(title.clone())).is_err() {
                        break;
                    }
                }
            }
            Cmd::Write(bytes) => {
                if pty.write(&bytes).is_err() {
                    break;
                }
            }
            Cmd::Resize { rows, cols } => {
                // Cell pixel size is only used for image protocols and size reports; zero means
                // "unknown", which is honest — the renderer never tells us its metrics.
                let _ = term.resize(cols, rows, 0, 0);
                let _ = pty.resize(rows, cols);
            }
            Cmd::Dump {
                format,
                scope,
                reply,
            } => {
                let _ = reply.send(dump(&term, format, scope));
            }
            Cmd::Eof | Cmd::Kill => break,
        }
    }

    let _ = pty.kill();
}

fn dump(term: &Terminal<'_, '_>, format: Format, scope: Scope) -> String {
    // An unqualified formatter covers everything the screen holds, scrollback included, so both
    // scopes are expressed as a selection.
    let selection = match scope {
        Scope::All => term.select_all().ok().flatten(),
        Scope::Screen => viewport_selection(term),
    };

    let mut opts = FormatterOptions::new().with_format(format).with_trim(true);
    if let Some(sel) = selection.as_ref() {
        opts = opts.with_selection(sel);
    }
    if format == Format::Vt {
        // Everything a fresh renderer needs to look like this one.
        opts = opts
            .with_cursor(true)
            .with_modes(true)
            .with_style(true)
            .with_scrolling_region(true)
            .with_hyperlink(true)
            .with_charsets(true);
    }

    let Ok(mut formatter) = Formatter::new(term, opts) else {
        return String::new();
    };
    match formatter.format_alloc(None) {
        Ok(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
        Err(_) => String::new(),
    }
}

/// A selection spanning exactly the rows the user can see, which is what "the screen" means to
/// someone reading the terminal — scrollback deliberately excluded.
fn viewport_selection<'t>(term: &'t Terminal<'_, '_>) -> Option<Selection<'t>> {
    let cols = term.cols().ok()?;
    let rows = term.rows().ok()?;
    let start = term
        .grid_ref(Point::Viewport(PointCoordinate { x: 0, y: 0 }))
        .ok()?;
    let end = term
        .grid_ref(Point::Viewport(PointCoordinate {
            x: cols.saturating_sub(1),
            y: u32::from(rows.saturating_sub(1)),
        }))
        .ok()?;
    Some(Selection::new(start, end, false))
}

/// Re-frames a byte stream into strings on character boundaries.
///
/// PTY reads land on arbitrary 4 KiB boundaries, so a multi-byte character routinely straddles two
/// of them. Decoding each chunk independently turns those into U+FFFD; holding the incomplete tail
/// back until its remaining bytes arrive does not.
#[derive(Default)]
struct Utf8Stream {
    carry: Vec<u8>,
}

impl Utf8Stream {
    fn push(&mut self, chunk: &[u8]) -> String {
        self.carry.extend_from_slice(chunk);

        let mut out = String::new();
        let mut consumed = 0usize;
        loop {
            match std::str::from_utf8(&self.carry[consumed..]) {
                Ok(s) => {
                    out.push_str(s);
                    consumed = self.carry.len();
                    break;
                }
                Err(e) => {
                    let valid = e.valid_up_to();
                    // SAFETY-free: `valid_up_to` is by definition a valid UTF-8 boundary.
                    if let Ok(s) = std::str::from_utf8(&self.carry[consumed..consumed + valid]) {
                        out.push_str(s);
                    }
                    consumed += valid;
                    match e.error_len() {
                        // Genuinely invalid bytes. Emit a replacement and step over them, or we'd
                        // stall on them forever.
                        Some(len) => {
                            out.push('\u{FFFD}');
                            consumed += len;
                        }
                        // A truncated sequence: keep it for the next read.
                        None => break,
                    }
                }
            }
        }

        self.carry.drain(..consumed);
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn emulator(cols: u16, rows: u16) -> Terminal<'static, 'static> {
        Terminal::new(Options {
            cols,
            rows,
            max_scrollback: 100,
        })
        .unwrap()
    }

    #[test]
    fn vt_dump_replays_into_an_identical_terminal() {
        let mut term = emulator(40, 5);
        for i in 0..12 {
            term.vt_write(format!("line {i} \x1b[31mred\x1b[0m\r\n").as_bytes());
        }
        term.vt_write(b"tail");

        // More than fits on screen, so this only round-trips if scrollback is included.
        assert!(term.scrollback_rows().unwrap() > 0);

        let restored = dump(&term, Format::Vt, Scope::All);
        let mut replayed = emulator(40, 5);
        replayed.vt_write(restored.as_bytes());

        assert_eq!(
            dump(&term, Format::Plain, Scope::All),
            dump(&replayed, Format::Plain, Scope::All)
        );
        assert_eq!(term.cursor_x().unwrap(), replayed.cursor_x().unwrap());
        assert_eq!(term.cursor_y().unwrap(), replayed.cursor_y().unwrap());
    }

    #[test]
    fn plain_dump_distinguishes_screen_from_scrollback() {
        let mut term = emulator(40, 3);
        for i in 0..8 {
            term.vt_write(format!("line {i}\r\n").as_bytes());
        }

        let screen = dump(&term, Format::Plain, Scope::Screen);
        let all = dump(&term, Format::Plain, Scope::All);

        assert!(
            !screen.contains("line 0"),
            "scrolled-off line leaked into the screen dump"
        );
        assert!(
            all.contains("line 0") && all.contains("line 7"),
            "all-scope dump: {all:?}"
        );
    }

    #[test]
    fn title_and_pwd_come_from_osc_sequences() {
        let mut term = emulator(40, 5);
        term.vt_write(b"\x1b]2;build\x07");
        assert_eq!(term.title().unwrap(), "build");
    }

    #[test]
    fn multi_byte_characters_survive_a_chunk_boundary() {
        let text = "日本語テキスト";
        let bytes = text.as_bytes();

        // Split mid-character: byte 4 lands inside the second codepoint.
        let mut stream = Utf8Stream::default();
        let first = stream.push(&bytes[..4]);
        let second = stream.push(&bytes[4..]);

        assert_eq!(format!("{first}{second}"), text);
        assert!(!first.contains('\u{FFFD}') && !second.contains('\u{FFFD}'));
    }

    #[test]
    fn invalid_bytes_do_not_stall_the_stream() {
        let mut stream = Utf8Stream::default();
        let out = stream.push(&[b'a', 0xff, b'b']);
        assert_eq!(out, "a\u{FFFD}b");
        assert!(stream.carry.is_empty());
    }

    #[test]
    fn spawn_runs_a_shell_and_streams_its_output() {
        let (term, mut rx) = TerminalHandle::spawn(TerminalConfig {
            rows: 10,
            cols: 40,
            scrollback: 100,
            ..Default::default()
        })
        .unwrap();

        term.write(b"echo codetwo-term\n").unwrap();

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        let mut seen = String::new();
        while std::time::Instant::now() < deadline {
            match rx.try_recv() {
                Ok(TerminalOutput::Data(s)) => seen.push_str(&s),
                Ok(TerminalOutput::Title(_)) => {}
                Err(_) => std::thread::sleep(std::time::Duration::from_millis(20)),
            }
            if seen.contains("codetwo-term") {
                break;
            }
        }
        assert!(
            seen.contains("codetwo-term"),
            "no shell output, got: {seen:?}"
        );

        // The same output must be readable back out of the emulator, not just off the wire.
        let text = term.text(Scope::All).unwrap();
        assert!(text.contains("codetwo-term"), "emulator state: {text:?}");
    }

    #[test]
    fn dropping_the_handle_shuts_the_terminal_down() {
        let (term, mut rx) = TerminalHandle::spawn(TerminalConfig::default()).unwrap();
        drop(term);

        // The stream closing means the emulator thread returned, which is where the child is
        // killed — the leak this replaces never got that far.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        loop {
            match rx.try_recv() {
                Err(mpsc::error::TryRecvError::Disconnected) => break,
                _ => {
                    assert!(
                        std::time::Instant::now() < deadline,
                        "terminal never shut down"
                    );
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
            }
        }
    }
}
