import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { onPtyOutput, ptyResize, ptySpawn, ptyWrite } from "../bridge";

let nextId = 1;

// Embedded terminal: xterm.js on the front, a core PTY on the back, streamed over `pty-output`.
export function TerminalPanel({ cwd }: { cwd: string | null }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const id = nextId++;
    const term = new Terminal({ fontSize: 13, cursorBlink: true, theme: { background: "#1e1e1e" } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    let unlisten: (() => void) | null = null;
    void (async () => {
      unlisten = await onPtyOutput((p) => {
        if (p.id === id) term.write(p.data);
      });
      await ptySpawn(id, cwd, term.rows, term.cols);
    })();

    const dataSub = term.onData((d) => {
      void ptyWrite(id, d);
    });
    const onResize = () => {
      fit.fit();
      void ptyResize(id, term.rows, term.cols);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      dataSub.dispose();
      if (unlisten) unlisten();
      term.dispose();
    };
  }, [cwd]);

  return <div className="terminal" ref={ref} />;
}
