import type { CompiledPreview } from "../bridge";

// Compiled-prompt preview (F13): shows exactly what will be sent — skills expanded, macros
// substituted — plus any attached MCP servers / agent skills and unresolved skill ids.
export function PreviewModal({ preview, onClose }: { preview: CompiledPreview; onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <h3>Compiled prompt preview</h3>
        {preview.unresolved.length > 0 && (
          <p className="settings-hint" style={{ color: "#b45309" }}>
            Unknown skills: {preview.unresolved.join(", ")}
          </p>
        )}
        {(preview.mcp_servers.length > 0 || preview.agent_skills.length > 0) && (
          <p className="settings-hint">
            {preview.mcp_servers.length > 0 && <>MCP: {preview.mcp_servers.join(", ")} · </>}
            {preview.agent_skills.length > 0 && <>Agent skills: {preview.agent_skills.join(", ")}</>}
          </p>
        )}
        <pre className="preview-prompt">{preview.prompt || "(empty)"}</pre>
        <div className="modal-actions">
          <button className="modal-opt cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
