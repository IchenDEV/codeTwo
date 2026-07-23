import type { KeymapEntry } from "../bridge";

// Settings (F2): view + rebind keyboard shortcuts. Click a key to capture the next chord; the App's
// global key handler records it and persists via the core keymap.
export function SettingsModal({
  bindings,
  capturing,
  onCapture,
  onClose,
}: {
  bindings: KeymapEntry[];
  capturing: string | null;
  onCapture: (action: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <h3>Keybindings</h3>
        <p className="settings-hint">“Mod” is ⌘ on macOS, Ctrl elsewhere. Click a shortcut to change it.</p>
        <div className="keymap-list">
          {bindings.map(([action, key, label]) => (
            <div key={action} className="keymap-row">
              <span className="keymap-label">{label}</span>
              <button
                className={`keymap-key ${capturing === action ? "capturing" : ""}`}
                onClick={() => onCapture(action)}
              >
                {capturing === action ? "press keys…" : key}
              </button>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="modal-opt" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
