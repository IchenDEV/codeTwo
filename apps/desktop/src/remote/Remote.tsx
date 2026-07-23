import { useState } from "react";
import { startRemote, type RemoteInfo } from "../bridge";

// Remote control (F10): start a local server and show the pairing URL/token to open on another
// device. The remote drives the same live engine/sessions as this app.
export function RemoteModal({
  info,
  onStarted,
  onClose,
}: {
  info: RemoteInfo | null;
  onStarted: (i: RemoteInfo) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      const i = await startRemote();
      if (i) onStarted(i);
      else setErr("Remote is only available in the desktop app.");
    } catch (e) {
      setErr(String(e));
    }
    setBusy(false);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Remote control</h3>
        {info ? (
          <>
            <p className="settings-hint">Open this on another device on the same network:</p>
            <div className="remote-url">
              <a href={info.url} target="_blank" rel="noreferrer">
                {info.url}
              </a>
            </div>
            <div className="remote-token">
              token: <code>{info.token}</code>
            </div>
            <p className="settings-hint">The remote drives the same sessions as this app.</p>
          </>
        ) : (
          <>
            <p className="settings-hint">
              Start a local server so you can drive codeTwo from your phone, tablet, or another
              machine on the same network.
            </p>
            <button className="modal-opt" disabled={busy} onClick={() => void start()}>
              {busy ? "Starting…" : "Start remote server"}
            </button>
            {err && <p className="settings-hint" style={{ color: "#b91c1c" }}>{err}</p>}
          </>
        )}
        <div className="modal-actions">
          <button className="modal-opt cancel" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
