/**
 * WebKit can expose `webkitSpeechRecognition` inside an Electrobun webview, but starting it delegates
 * privacy authorization to the native host. A development binary launched outside a real `.app`
 * bundle is then terminated by macOS TCC before JavaScript can catch an error. Desktop dictation
 * therefore never falls back to Web Speech in desktop mode. The Rust desktop host uses the native
 * voice plugin and keeps permission handling inside the signed application boundary.
 */
export function shouldUseWebSpeech(isDesktop: boolean, hasSpeechRecognition: boolean): boolean {
  return !isDesktop && hasSpeechRecognition;
}
