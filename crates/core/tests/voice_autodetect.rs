//! Transcriber discovery, end to end. Its own integration test because it rewrites `PATH` and
//! `CODETWO_TRANSCRIBE_CMD` — both are process-wide.

use codetwo_core::voice;

/// A GUI-launched app must not treat whisper.cpp as configured merely because its executable is on
/// `PATH`: without `-m`, it looks for a cwd-relative model and fails to initialize its context.
#[tokio::test]
async fn ignores_model_less_whisper_cpp_until_the_user_configures_it() {
    let dir = std::env::temp_dir().join(format!("codetwo-voice-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&dir).unwrap();

    // Homebrew's whisper.cpp binary has no usable default model. This is the exact failure C2 used
    // to route recordings into instead of falling back to the system recognizer.
    let whisper_cpp = dir.join("whisper-cli");
    std::fs::write(
        &whisper_cpp,
        "#!/bin/sh\necho 'error: failed to initialize whisper context' >&2\nexit 3\n",
    )
    .unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&whisper_cpp, std::fs::Permissions::from_mode(0o755)).unwrap();
    }

    std::env::remove_var("CODETWO_TRANSCRIBE_CMD");
    std::env::set_var("PATH", &dir);

    assert!(
        voice::transcriber_command().is_none(),
        "a model-less whisper.cpp executable is not a working transcriber"
    );

    let configured = format!(
        "{} -m /models/ggml-base.bin -f {{file}} -nt -np",
        whisper_cpp.display()
    );
    std::env::set_var("CODETWO_TRANSCRIBE_CMD", &configured);
    assert_eq!(
        voice::transcriber_command().as_deref(),
        Some(configured.as_str())
    );

    let _ = std::fs::remove_dir_all(&dir);
}
