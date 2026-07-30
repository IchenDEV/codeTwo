//! Dictation through Apple's Speech framework — the route that needs nothing installed.
//!
//! WKWebView exposes no `SpeechRecognition`, so on macOS the app records audio itself. Rather than
//! demand a whisper build before the mic button does anything, we hand the recording to
//! `SFSpeechRecognizer`, which every Mac already has.
//!
//! Two rules keep the privacy promise the rest of this module makes:
//!
//! * **On-device only.** `requiresOnDeviceRecognition` is set, so audio is never uploaded. If the
//!   system can't recognise this locale locally we report unavailable instead of quietly falling
//!   back to Apple's servers.
//! * **Second in line.** An explicitly configured `CODETWO_TRANSCRIBE_CMD` always wins; this is the
//!   default for people who configured nothing.
//!
//! Requires `NSSpeechRecognitionUsageDescription` in the bundle's Info.plist — the framework
//! *crashes* the process when authorization is requested without it.

use std::io;
use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;

use block2::RcBlock;
use objc2::AnyThread;
use objc2_foundation::{NSError, NSLocale, NSString, NSURL};
use objc2_speech::{
    SFSpeechRecognitionResult, SFSpeechRecognizer, SFSpeechRecognizerAuthorizationStatus,
    SFSpeechURLRecognitionRequest,
};

/// How long we'll wait for the framework: authorization is a user prompt, recognition is bounded by
/// the clip. Generous, but never indefinite — a wedged XPC service must not hang the command.
const AUTH_TIMEOUT: Duration = Duration::from_secs(120);
const RECOGNIZE_TIMEOUT: Duration = Duration::from_secs(120);

/// A recognizer that can work offline, if this Mac has one.
///
/// The user's own locale first. Failing that, another region of the same language: on-device assets
/// ship per language-region, and plenty of common locales (`en_SG`, `en_GB`) have none while
/// `en_US` does. Recognising English with a US model beats refusing to dictate.
fn recognizer() -> Option<objc2::rc::Retained<SFSpeechRecognizer>> {
    // SAFETY: plain construction and property reads throughout; no aliasing or lifetime
    // obligations, and none of these calls prompt the user.
    unsafe {
        if let Some(rec) = SFSpeechRecognizer::init(SFSpeechRecognizer::alloc()) {
            if rec.isAvailable() && rec.supportsOnDeviceRecognition() {
                return Some(rec);
            }
        }

        let current = NSLocale::currentLocale().localeIdentifier().to_string();
        let language = locale_language(&current);
        let mut siblings: Vec<String> = SFSpeechRecognizer::supportedLocales()
            .allObjects()
            .iter()
            .map(|l| l.localeIdentifier().to_string())
            .filter(|id| locale_language(id) == language)
            .collect();
        siblings.sort(); // deterministic pick when several are installed

        siblings.into_iter().find_map(|id| {
            let locale =
                NSLocale::initWithLocaleIdentifier(NSLocale::alloc(), &NSString::from_str(&id));
            let rec = SFSpeechRecognizer::initWithLocale(SFSpeechRecognizer::alloc(), &locale)?;
            (rec.isAvailable() && rec.supportsOnDeviceRecognition()).then_some(rec)
        })
    }
}

/// `en` from `en_SG` / `en-GB`. Apple writes identifiers both ways depending on the API.
fn locale_language(identifier: &str) -> &str {
    identifier.split(['_', '-']).next().unwrap_or(identifier)
}

/// Can we dictate without installing anything? True only when on-device recognition exists *and*
/// the user hasn't refused it — a denial should surface the configure-a-transcriber message rather
/// than an authorization error on every click.
pub fn is_available() -> bool {
    if recognizer().is_none() {
        return false;
    }
    // SAFETY: a class method returning a plain enum.
    let status = unsafe { SFSpeechRecognizer::authorizationStatus() };
    !matches!(
        status,
        SFSpeechRecognizerAuthorizationStatus::Denied
            | SFSpeechRecognizerAuthorizationStatus::Restricted
    )
}

/// Ask once for permission, blocking until the user answers. Already-decided cases return without
/// touching the framework, so the common path costs nothing.
fn authorize() -> io::Result<()> {
    // SAFETY: class method returning a plain enum.
    match unsafe { SFSpeechRecognizer::authorizationStatus() } {
        SFSpeechRecognizerAuthorizationStatus::Authorized => return Ok(()),
        SFSpeechRecognizerAuthorizationStatus::NotDetermined => {}
        _ => {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "speech recognition is off for codeTwo — turn it back on in System Settings → \
                 Privacy & Security → Speech Recognition",
            ))
        }
    }

    let (tx, rx) = mpsc::channel();
    let handler = RcBlock::new(move |status: SFSpeechRecognizerAuthorizationStatus| {
        let _ = tx.send(status);
    });
    // SAFETY: the block is retained by the framework for the duration of the call, and our
    // Info.plist carries NSSpeechRecognitionUsageDescription (without it this call aborts).
    unsafe { SFSpeechRecognizer::requestAuthorization(&handler) };

    match rx.recv_timeout(AUTH_TIMEOUT) {
        Ok(SFSpeechRecognizerAuthorizationStatus::Authorized) => Ok(()),
        Ok(_) => {
            Err(io::Error::new(io::ErrorKind::PermissionDenied, "speech recognition wasn't allowed"))
        }
        Err(_) => Err(io::Error::new(
            io::ErrorKind::TimedOut,
            "timed out waiting for the speech recognition permission prompt",
        )),
    }
}

/// Transcribe an audio file on this machine. Blocking; callers run it off the async runtime.
fn transcribe_blocking(audio: &Path) -> io::Result<String> {
    let rec = recognizer().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::Unsupported,
            "on-device speech recognition isn't available for your language",
        )
    })?;
    authorize()?;

    let path = NSString::from_str(&audio.to_string_lossy());
    let (tx, rx) = mpsc::channel();
    // SAFETY: the framework hands the handler a borrowed result and error for the duration of the
    // call; we copy the text out and never retain either pointer.
    let handler = RcBlock::new(move |result: *mut SFSpeechRecognitionResult, error: *mut NSError| unsafe {
        if !error.is_null() {
            let _ = tx.send(Err((*error).localizedDescription().to_string()));
        } else if !result.is_null() && (*result).isFinal() {
            let text = (*result).bestTranscription().formattedString().to_string();
            let _ = tx.send(Ok(text));
        }
    });
    // SAFETY: plain construction and property writes. `handler` stays alive on our stack until
    // recognition has finished, so we don't depend on the framework copying it.
    let task = unsafe {
        let url = NSURL::fileURLWithPath(&path);
        let request =
            SFSpeechURLRecognitionRequest::initWithURL(SFSpeechURLRecognitionRequest::alloc(), &url);
        // Whole-clip transcription: no partials to stream, and punctuation makes it prompt-ready.
        request.setShouldReportPartialResults(false);
        request.setRequiresOnDeviceRecognition(true);
        request.setAddsPunctuation(true);
        rec.recognitionTaskWithRequest_resultHandler(&request, &handler)
    };

    let outcome = rx.recv_timeout(RECOGNIZE_TIMEOUT);
    // SAFETY: cancelling a finished task is a no-op; this only matters on the timeout path.
    unsafe { task.cancel() };
    drop(handler);

    match outcome {
        Ok(Ok(text)) => Ok(text),
        Ok(Err(message)) => Err(io::Error::other(message)),
        Err(_) => Err(io::Error::new(io::ErrorKind::TimedOut, "speech recognition timed out")),
    }
}

/// Transcribe without blocking the async runtime's worker.
pub async fn transcribe(audio: &Path) -> io::Result<String> {
    let audio = audio.to_path_buf();
    tokio::task::spawn_blocking(move || transcribe_blocking(&audio))
        .await
        .map_err(|e| io::Error::other(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_is_the_part_before_the_region() {
        assert_eq!(locale_language("en_SG"), "en");
        assert_eq!(locale_language("en-GB"), "en");
        assert_eq!(locale_language("zh_Hans_CN"), "zh");
        assert_eq!(locale_language("en"), "en");
    }

    /// The probe has to be answerable without a bundle, a prompt, or a network round-trip — it runs
    /// on every click of the mic button.
    #[test]
    fn availability_is_a_safe_question_to_ask() {
        let available = is_available();
        // SAFETY: a class method returning a plain enum; asking never prompts.
        let status = unsafe { SFSpeechRecognizer::authorizationStatus() };
        println!("on-device recognizer: {available}, authorization: {status:?}");
        if matches!(
            status,
            SFSpeechRecognizerAuthorizationStatus::Denied
                | SFSpeechRecognizerAuthorizationStatus::Restricted
        ) {
            assert!(
                !available,
                "a refusal must read as unavailable, not as a per-click error"
            );
        }
    }
}
