/**
 * WebKit can expose `webkitSpeechRecognition` inside an Electrobun webview, but starting it delegates
 * privacy authorization to the native host. A development binary launched outside a real `.app`
 * bundle is then terminated by macOS TCC before JavaScript can catch an error. Desktop dictation
 * therefore always goes through C2's native, bundle-aware recording/transcription path.
 */
export function shouldUseWebSpeech(isDesktop: boolean, hasSpeechRecognition: boolean): boolean {
  return !isDesktop && hasSpeechRecognition;
}
