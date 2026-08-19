//! Voice input — transcribing recorded audio.
//!
//! C2 ships no speech model and calls no hosted API. It transcribes one of two ways, in this
//! order:
//!
//! 1. **A transcriber you named.** `CODETWO_TRANSCRIBE_CMD` is a shell command template containing
//!    `{file}`; an explicit choice always wins. We also auto-detect a few common whisper binaries.
//!
//!    ```text
//!    CODETWO_TRANSCRIBE_CMD='whisper-cli -f {file} -nt -np'
//!    ```
//!
//!    `{file}` is a 16 kHz mono WAV — what whisper.cpp and friends accept without conversion. The
//!    only contract is: **print the transcript to stdout**.
//!
//! 2. **macOS's own on-device recognizer** ([`apple`]), which needs nothing installed. This is what
//!    makes the mic button work out of the box; see that module for the privacy constraints.

use std::path::Path;

use tokio::process::Command;

#[cfg(target_os = "macos")]
pub mod apple;

/// Command templates we try when `CODETWO_TRANSCRIBE_CMD` isn't set. Each prints to stdout.
const AUTODETECT: [(&str, &str); 3] = [
    ("whisper-cli", "whisper-cli -f {file} -nt -np"),
    ("whisper-cpp", "whisper-cpp -f {file} -nt -np"),
    ("whisper", "whisper {file} --model base --output_format txt --output_dir /tmp --fp16 False"),
];

/// The configured (or auto-detected) transcription command template, if any.
pub fn transcriber_command() -> Option<String> {
    if let Ok(cmd) = std::env::var("CODETWO_TRANSCRIBE_CMD") {
        if !cmd.trim().is_empty() {
            return Some(cmd);
        }
    }
    AUTODETECT.iter().find_map(|(bin, tmpl)| {
        // Substitute the resolved absolute path: `sh -c` gets the same `PATH` we searched, but
        // being explicit keeps the command working if that ever stops being true.
        let path = crate::provider::which(bin)?;
        Some(tmpl.replacen(bin, &shell_quote(path.to_string_lossy().as_ref()), 1))
    })
}

/// Can C2 transcribe audio locally — by any route?
pub fn is_available() -> bool {
    // Short-circuits: probing the system recognizer builds objects and logs, so skip it when the
    // user's own command already answers the question.
    transcriber_command().is_some() || system_recognizer_available()
}

/// Is there a platform recognizer we can fall back to?
#[cfg(target_os = "macos")]
fn system_recognizer_available() -> bool {
    apple::is_available()
}

#[cfg(not(target_os = "macos"))]
fn system_recognizer_available() -> bool {
    false
}

/// Single-quote a path for `sh -c`.
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

/// Substitute the audio path into a command template.
pub fn build_command(template: &str, audio: &Path) -> String {
    template.replace("{file}", &shell_quote(audio.to_string_lossy().as_ref()))
}

/// Run an explicit template against an audio file. Separated from [`transcribe`] so it's testable
/// without touching process-wide environment.
pub async fn transcribe_with(template: &str, audio: &Path) -> std::io::Result<String> {
    let cmd = build_command(template, audio);
    // `/bin/sh` by absolute path: the shell itself shouldn't depend on how the app was launched.
    let out = Command::new("/bin/sh").arg("-c").arg(&cmd).output().await?;
    if !out.status.success() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Transcribe by whichever route is available, preferring a transcriber the user chose.
pub async fn transcribe(audio: &Path) -> std::io::Result<String> {
    if let Some(template) = transcriber_command() {
        return transcribe_with(&template, audio).await;
    }
    transcribe_with_system(audio).await
}

/// Fall back to the platform's own recognizer.
#[cfg(target_os = "macos")]
async fn transcribe_with_system(audio: &Path) -> std::io::Result<String> {
    apple::transcribe(audio).await
}

#[cfg(not(target_os = "macos"))]
async fn transcribe_with_system(_audio: &Path) -> std::io::Result<String> {
    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "no transcriber configured — set CODETWO_TRANSCRIBE_CMD (a command with {file} that prints text)",
    ))
}

/// Persist recorded audio bytes to a temp file, returning its path.
pub fn save_audio(bytes: &[u8], ext: &str) -> std::io::Result<std::path::PathBuf> {
    let safe_ext: String = ext.chars().filter(|c| c.is_ascii_alphanumeric()).take(8).collect();
    let name = format!(
        "codetwo-voice-{}.{}",
        uuid::Uuid::new_v4().simple(),
        if safe_ext.is_empty() { "webm".into() } else { safe_ext }
    );
    let path = std::env::temp_dir().join(name);
    std::fs::write(&path, bytes)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_and_quotes_the_command() {
        let cmd = build_command("whisper-cli -f {file} -nt", Path::new("/tmp/a b.wav"));
        assert_eq!(cmd, "whisper-cli -f '/tmp/a b.wav' -nt");
        // A quote in the path can't break out of the argument.
        let tricky = build_command("t {file}", Path::new("/tmp/it's.wav"));
        assert!(tricky.contains(r"'/tmp/it'\''s.wav'"), "got: {tricky}");
    }

    #[tokio::test]
    async fn transcribe_with_runs_the_template() {
        let dir = std::env::temp_dir().join(format!("codetwo-voice-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let audio = dir.join("clip.wav");
        std::fs::write(&audio, b"not really audio").unwrap();

        // A stub "transcriber" that just echoes — proves the plumbing without a speech model.
        let text = transcribe_with("echo hello from {file}", &audio).await.unwrap();
        assert!(text.starts_with("hello from"));
        assert!(text.contains("clip.wav"));

        // Failures surface as errors rather than empty transcripts.
        assert!(transcribe_with("exit 2", &audio).await.is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn saves_audio_with_sanitized_extension() {
        let path = save_audio(b"bytes", "webm").unwrap();
        assert!(path.exists());
        assert_eq!(path.extension().and_then(|s| s.to_str()), Some("webm"));
        assert_eq!(std::fs::read(&path).unwrap(), b"bytes");

        let weird = save_audio(b"x", "../../evil").unwrap();
        let ext = weird.extension().and_then(|s| s.to_str()).unwrap_or("");
        assert!(ext.chars().all(|c| c.is_ascii_alphanumeric()), "ext sanitized: {ext}");

        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(&weird);
    }
}
