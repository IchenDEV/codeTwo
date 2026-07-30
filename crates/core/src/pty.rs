//! Pseudo-terminal manager for the embedded terminal.
//!
//! Built on wezterm's `portable-pty` (the de-facto cross-platform choice, incl. Windows ConPTY).
//! This layer is deliberately dumb: it owns the child process and the master fd, and hands the
//! output reader to the caller. Interpreting those bytes is [`crate::term`]'s job.

use std::io::{self, Read, Write};

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};

/// A live PTY: write input, resize, and (via the paired receiver) read output.
pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

impl PtySession {
    /// Spawn `program args...` in a new PTY of the given size. Returns the session plus the raw
    /// output reader; read it on a dedicated thread (it blocks until the child writes or exits).
    pub fn spawn(
        program: &str,
        args: &[&str],
        cwd: Option<&str>,
        rows: u16,
        cols: u16,
    ) -> io::Result<(PtySession, Box<dyn Read + Send>)> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(to_io)?;

        let mut cmd = CommandBuilder::new(program);
        for a in args {
            cmd.arg(a);
        }
        if let Some(dir) = cwd {
            cmd.cwd(dir);
        }
        let child = pair.slave.spawn_command(cmd).map_err(to_io)?;
        // Close the slave in the parent so EOF propagates when the child exits.
        drop(pair.slave);

        let reader = pair.master.try_clone_reader().map_err(to_io)?;
        let writer = pair.master.take_writer().map_err(to_io)?;

        Ok((PtySession { master: pair.master, writer, child }, reader))
    }

    /// Spawn inside a tmux session (attach-or-create with `-A`), so the terminal persists across
    /// restarts and can be attached from a real terminal (`tmux attach -t <session>`).
    pub fn spawn_tmux(
        session: &str,
        cwd: Option<&str>,
        rows: u16,
        cols: u16,
    ) -> io::Result<(PtySession, Box<dyn Read + Send>)> {
        let mut args: Vec<&str> = vec!["new-session", "-A", "-s", session];
        if let Some(c) = cwd {
            args.push("-c");
            args.push(c);
        }
        PtySession::spawn("tmux", &args, cwd, rows, cols)
    }

    /// Feed bytes (keystrokes) to the terminal.
    pub fn write(&mut self, data: &[u8]) -> io::Result<()> {
        self.writer.write_all(data)?;
        self.writer.flush()
    }

    /// Resize the PTY (call on xterm.js fit/resize).
    pub fn resize(&self, rows: u16, cols: u16) -> io::Result<()> {
        self.master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(to_io)
    }

    /// Terminate the child process.
    pub fn kill(&mut self) -> io::Result<()> {
        self.child.kill().map_err(to_io)
    }
}

impl Drop for PtySession {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

fn to_io(e: impl std::fmt::Display) -> io::Error {
    io::Error::new(io::ErrorKind::Other, e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pty_runs_a_command_and_streams_output() {
        let (session, mut reader) =
            PtySession::spawn("sh", &["-c", "echo codetwo-pty"], None, 24, 80).unwrap();

        let mut acc = Vec::new();
        let mut buf = [0u8; 1024];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
            acc.extend_from_slice(&buf[..n]);
            if String::from_utf8_lossy(&acc).contains("codetwo-pty") {
                break;
            }
        }

        let out = String::from_utf8_lossy(&acc).into_owned();
        assert!(out.contains("codetwo-pty"), "expected echoed output, got: {out:?}");
        drop(session);
    }
}
