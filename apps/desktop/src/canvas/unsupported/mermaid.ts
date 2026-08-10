/** CodeTwo intentionally disables Mermaid; this module keeps the renderer's optional import inert. */
export async function parseMermaidToExcalidraw(): Promise<never> {
  throw new Error("Mermaid is disabled in the CodeTwo canvas");
}
