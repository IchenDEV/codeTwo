export const LONG_PROMPT_MAX_LINES = 8;
export const LONG_PROMPT_MAX_CHARS = 600;

/** Match t3code's long-message boundary without coupling the transcript card to string policy. */
export function isLongPrompt(prompt: string): boolean {
  return (
    Array.from(prompt).length > LONG_PROMPT_MAX_CHARS ||
    prompt.split(/\r?\n/).length > LONG_PROMPT_MAX_LINES
  );
}

/** Keep the collapsed copy inside both limits and avoid splitting a Unicode surrogate pair. */
export function collapsedPrompt(prompt: string): string {
  const lines = prompt.split(/\r?\n/).slice(0, LONG_PROMPT_MAX_LINES).join("\n");
  return Array.from(lines).slice(0, LONG_PROMPT_MAX_CHARS).join("").trimEnd();
}
