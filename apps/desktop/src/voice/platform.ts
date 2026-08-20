/**
 * WebKit can expose `webkitSpeechRecognition` inside an Electrobun webview, but starting it delegates
 * privacy authorization to the native host. A development binary launched outside a real `.app`
 * bundle is then terminated by macOS TCC before JavaScript can catch an error. Desktop dictation
 * therefore never falls back to Web Speech in desktop mode. The pure Bun trial currently reports
 * native recording/transcription as unsupported instead of bypassing macOS privacy controls.
 */
export function shouldUseWebSpeech(isDesktop: boolean, hasSpeechRecognition: boolean): boolean {
  return !isDesktop && hasSpeechRecognition;
}
