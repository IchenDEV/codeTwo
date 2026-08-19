# Voice input

Dictate into the prompt document with the **🎤** button in the composer's control row. It works
three ways and picks automatically — in this order.

## 1. Live dictation, if the webview has it

If the webview provides speech recognition (`SpeechRecognition` / `webkitSpeechRecognition`), C2
uses it directly. Click the mic, talk, and each finished phrase lands in your document. The button
pulses while listening; click again to stop.

**macOS has no speech API in WKWebView**, so the desktop app never takes this route there.

## 2. A transcriber you named

Otherwise C2 records audio and hands it to a command of your choosing — an explicit choice
always wins over the built-in route below:

```sh
export CODETWO_TRANSCRIBE_CMD='whisper-cli -f {file} -nt -np'
```

- `{file}` is replaced with the recorded audio path (properly shell-quoted). It is always a
  **16 kHz mono WAV** — the app resamples whatever the webview recorded, so whisper.cpp reads it
  straight off.
- The only contract is: **print the transcript to stdout**. Any wrapper script works.

If the variable isn't set, C2 also looks for `whisper-cli`, `whisper-cpp`, or `whisper` on your
`PATH` and builds a sensible command.

## 3. macOS's own recognizer — nothing to install

With no command configured, the Mac app hands the recording to the system speech recognizer. This
needs no install, no model download, and no configuration.

It runs **on-device only**. If macOS can't recognise your language locally, C2 says dictation is
unavailable rather than quietly uploading your audio to Apple. Note that on-device models ship per
language *and region*: `en_SG` and `en_GB` often have none while `en_US` does, so C2 falls back
to another region of the same language before giving up.

The first dictation raises two macOS prompts — microphone and speech recognition. Both are remembered.

## If the mic button says nothing is available

- **Speech recognition declined?** Re-enable C2 under System Settings → Privacy & Security →
  Speech Recognition (and Microphone).
- **No on-device model for your language?** Install one via System Settings → Keyboard → Dictation
  (add the language, which downloads the offline asset), or configure route 2 instead.
- **Launched from Finder and using route 2?** macOS gives a double-clicked app a bare `PATH`, so a
  Homebrew whisper would be invisible. C2 adds `/opt/homebrew/bin`, `/usr/local/bin`,
  `/opt/local/bin`, `~/.local/bin`, and `~/.cargo/bin` back on startup — anywhere else, set
  `CODETWO_TRANSCRIBE_CMD` with an absolute path.
- **`CODETWO_TRANSCRIBE_CMD` set in your shell profile?** A GUI app doesn't read that. Launch
  C2 from a terminal, or rely on route 3.
- **Running `tauri dev`?** The dev binary isn't bundled, so the OS prompts are attributed to your
  terminal rather than to C2. Route 3 needs the bundled app.

## Privacy

C2 ships **no speech model and calls no hosted API**. Route 2 sends audio only to the local
command you configured; route 3 is pinned to on-device recognition, so nothing is uploaded. If no
route is available the button says so rather than silently doing nothing.
