export function shouldUseWebSpeech(
  isDesktop: boolean,
  hasSpeechRecognition: boolean
): boolean {
  return !isDesktop && hasSpeechRecognition;
}
