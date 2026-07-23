# Voice input

Dictate into the prompt document with the **🎤** button in the toolbar. It works two ways and picks
automatically.

## 1. Live dictation (no setup)

If the webview provides speech recognition (`SpeechRecognition` / `webkitSpeechRecognition`), codeTwo
uses it directly. Click the mic, talk, and each finished phrase lands in your document. The button
pulses while listening; click again to stop.

Nothing is installed and nothing is configured — but availability depends on the platform webview.

## 2. Record → local transcription

If the webview has no speech API, codeTwo records audio and hands it to **a transcriber you already
have**. Point it at one with an environment variable:

```sh
export CODETWO_TRANSCRIBE_CMD='whisper-cli -f {file} -nt -np'
```

- `{file}` is replaced with the recorded audio path (properly shell-quoted).
- The only contract is: **print the transcript to stdout**. Any wrapper script works.

If the variable isn't set, codeTwo looks for `whisper-cli`, `whisper-cpp`, or `whisper` on your
`PATH` and builds a sensible command.

## Privacy

codeTwo ships **no speech model and calls no hosted API**. Live dictation is handled by your
webview; the fallback sends audio only to the local command you configured. If neither is available
the button says so rather than silently doing nothing.
