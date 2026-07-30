//! Auto-detection of a local transcriber, end to end. Its own integration test because it rewrites
//! `PATH` — that's process-wide, and the unit tests run threaded alongside code that resolves
//! binaries.

use codetwo_core::voice;

/// A GUI-launched app finds whisper only because we put Homebrew-ish directories back on `PATH`;
/// once found, the command has to carry the absolute path so `sh -c` can run it.
#[tokio::test]
async fn autodetects_whisper_and_transcribes_with_it() {
    let dir = std::env::temp_dir().join(format!("codetwo-voice-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&dir).unwrap();

    // A stand-in for whisper-cli: same name and flags, prints a transcript.
    let bin = dir.join("whisper-cli");
    std::fs::write(&bin, "#!/bin/sh\necho \"the transcript\"\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
    }

    std::env::remove_var("CODETWO_TRANSCRIBE_CMD");
    std::env::set_var("PATH", &dir);

    assert!(voice::is_available(), "a whisper-cli on PATH counts as available");
    let template = voice::transcriber_command().unwrap();
    assert!(template.contains(bin.to_str().unwrap()), "absolute path in template: {template}");

    let audio = dir.join("clip.wav");
    std::fs::write(&audio, b"pretend audio").unwrap();
    assert_eq!(voice::transcribe(&audio).await.unwrap(), "the transcript");

    // With no whisper on PATH there's no command route left. (Whether dictation as a whole is
    // available then depends on the platform recognizer, which we can't exercise here: asking it
    // for authorization outside an app bundle aborts the process.)
    std::env::set_var("PATH", "/usr/bin:/bin");
    assert!(voice::transcriber_command().is_none());

    let _ = std::fs::remove_dir_all(&dir);
}
