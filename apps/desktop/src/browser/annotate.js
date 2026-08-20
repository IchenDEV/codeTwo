/**
 * C2's in-page annotator: point at something on the page, say what should change, and nudge
 * the live styles until it looks right. What you end up with is a list of notes the agent can act
 * on — "this element, these properties, from this to that" — instead of a paragraph describing a
 * screenshot.
 *
 * This runs as a webview initialization script, so it is injected into every page the built-in
 * browser loads, before the page's own scripts, and is not subject to the page's CSP. It stays
 * completely dormant until the app calls `setMode(true)`; the app pulls results back out with
 * `list()` (see `browser.rs` — there is no IPC into this webview by design, a remote page must
 * never be able to call into the app).
 *
 * Everything it draws lives in one shadow root so the page's CSS cannot reach it and its own CSS
 * cannot leak into the page. The one thing it deliberately does touch is the selected element's
 * inline style — that *is* the feature.
 */
(() => {
  if (window.__codetwoAnnotate) return;

  /** Properties the panel edits, in the order they appear. Reading is computed, writing is inline. */
  const FIELDS = [
    { prop: "color", label: "Text color", kind: "color" },
    { prop: "background-color", label: "Background", kind: "color" },
    { prop: "opacity", label: "Opacity", kind: "number", step: "0.05", min: "0", max: "1" },
    { prop: "font-family", label: "Font", kind: "text" },
    { prop: "font-size", label: "Font size", kind: "px" },
    { prop: "font-weight", label: "Font weight", kind: "weight" },
  ];

  const WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];

  let on = false;
  /** Committed annotations, in the order they were made — the numbering the markers show. */
  const notes = [];
  let host = null;
  let root = null;
  let hover = null; // the outline that follows the pointer
  let tag = null; // the little element-name label on that outline
  let layer = null; // marker bubbles for committed notes
  let panel = null; // the editor card, present only while something is selected
  let target = null; // element being annotated
  let before = null; // its inline style before we touched it, for Cancel
  let draft = null; // { note, styles: Map<prop, {from, to}> }

  // ---- selectors ------------------------------------------------------------------------------

  /** A short selector that identifies the element well enough for a human and an agent to find it. */
  function selectorFor(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 4) {
      let part = node.tagName.toLowerCase();
      const cls = (node.getAttribute("class") || "")
        .trim()
        .split(/\s+/)
        .filter((c) => c && !c.startsWith("__codetwo"))
        .slice(0, 2)
        .map((c) => `.${CSS.escape(c)}`)
        .join("");
      part += cls;
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      if (node.id) {
        parts[0] = `#${CSS.escape(node.id)}`;
        break;
      }
      node = parent;
    }
    return parts.join(" > ");
  }

  /** The visible text of an element, trimmed to something quotable. */
  function textOf(el) {
    const t = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ");
    return t.length > 160 ? `${t.slice(0, 160)}…` : t;
  }

  // ---- overlay --------------------------------------------------------------------------------

  const CSS_TEXT = `
    :host { all: initial; }
    .box { position: fixed; pointer-events: none; z-index: 2147483646;
           border: 2px solid #3b82f6; background: rgba(59,130,246,0.14); border-radius: 2px; }
    .tag { position: fixed; z-index: 2147483646; pointer-events: none;
           font: 500 11px ui-sans-serif, system-ui, sans-serif; color: #fff; background: #3b82f6;
           padding: 1px 6px; border-radius: 4px; white-space: nowrap; }
    .pin { position: fixed; z-index: 2147483646; width: 20px; height: 20px; border-radius: 999px;
           background: #3b82f6; color: #fff; border: 2px solid #fff; cursor: pointer;
           font: 600 11px ui-sans-serif, system-ui, sans-serif; display: flex;
           align-items: center; justify-content: center; box-shadow: 0 1px 4px rgba(0,0,0,.3); }
    .card { position: fixed; z-index: 2147483647; width: 300px; max-height: 78vh; overflow: auto;
            background: #fff; color: #1c1c1f; border-radius: 14px;
            box-shadow: 0 12px 40px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.06);
            font: 13px ui-sans-serif, system-ui, sans-serif; }
    .card textarea { width: 100%; box-sizing: border-box; border: 0; outline: none; resize: none;
                     padding: 14px 14px 10px; font: inherit; background: transparent; color: inherit; }
    .card textarea::placeholder { color: #9a9aa2; }
    .who { display: flex; align-items: center; gap: 6px; padding: 8px 14px;
           border-top: 1px solid #ececf0; border-bottom: 1px solid #ececf0;
           font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; color: #6b6b74; }
    .row { display: flex; align-items: center; gap: 10px; padding: 7px 14px; }
    .row > span { flex: 1; color: #6b6b74; }
    .row input, .row select { border: 1px solid #e3e3e8; border-radius: 8px; background: #fff;
                              color: inherit; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
                              padding: 5px 8px; width: 150px; box-sizing: border-box; outline: none; }
    .row input:focus, .row select:focus { border-color: #3b82f6; }
    .swatch { display: flex; align-items: center; gap: 8px; width: 150px;
              border: 1px solid #e3e3e8; border-radius: 8px; padding: 3px 8px; box-sizing: border-box; }
    .swatch input[type=color] { width: 18px; height: 18px; padding: 0; border: 0; border-radius: 999px;
                                background: none; flex: none; }
    .swatch input[type=text] { border: 0; padding: 0; width: 100%; }
    .acts { display: flex; align-items: center; gap: 8px; padding: 10px 14px 14px; }
    .acts button { border: 0; border-radius: 999px; padding: 7px 14px; font: 500 13px ui-sans-serif,
                   system-ui, sans-serif; cursor: pointer; }
    .cancel { background: #f1f1f4; color: #1c1c1f; }
    .ok { margin-left: auto; background: #3b82f6; color: #fff; }
    @media (prefers-color-scheme: dark) {
      .card { background: #26272c; color: #f2f2f5; box-shadow: 0 12px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.08); }
      .who { border-color: #35363c; color: #a3a3ad; }
      .row input, .row select, .swatch { background: #1f2025; border-color: #3a3b42; }
      .cancel { background: #35363c; color: #f2f2f5; }
    }
  `;

  function ensureUI() {
    if (host) return;
    host = document.createElement("div");
    host.className = "__codetwo-annotator";
    host.style.cssText = "all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647";
    root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS_TEXT;
    hover = document.createElement("div");
    hover.className = "box";
    hover.style.display = "none";
    tag = document.createElement("div");
    tag.className = "tag";
    tag.style.display = "none";
    layer = document.createElement("div");
    root.append(style, hover, tag, layer);
    document.documentElement.appendChild(host);
  }

  function place(el, box, label) {
    const r = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = `${r.left}px`;
    box.style.top = `${r.top}px`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;
    if (label) {
      label.style.display = "block";
      label.style.left = `${r.left}px`;
      label.style.top = `${Math.max(0, r.top - 18)}px`;
    }
  }

  /** Marker bubbles are anchored to live elements, so they follow scrolling and reflow. */
  function drawPins() {
    layer.textContent = "";
    notes.forEach((n, i) => {
      if (!n.el || !n.el.isConnected) return;
      const r = n.el.getBoundingClientRect();
      const pin = document.createElement("div");
      pin.className = "pin";
      pin.textContent = String(i + 1);
      pin.style.left = `${r.right - 10}px`;
      pin.style.top = `${r.top - 10}px`;
      pin.title = n.note || "(no note)";
      layer.appendChild(pin);
    });
  }

  // ---- the editor -----------------------------------------------------------------------------

  /** rgb()/rgba() as computed → the `#rrggbb` an `<input type=color>` will accept. */
  function toHex(value) {
    const m = String(value).match(/rgba?\(([^)]+)\)/);
    if (!m) return "#000000";
    const [r, g, b] = m[1].split(",").map((v) => parseFloat(v));
    const hex = (n) => Math.max(0, Math.min(255, Math.round(n || 0))).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }

  function record(prop, from, to) {
    const seen = draft.styles.get(prop);
    draft.styles.set(prop, { from: seen ? seen.from : from, to });
    target.style.setProperty(prop, to);
  }

  function field(f, computed) {
    const row = document.createElement("div");
    row.className = "row";
    const name = document.createElement("span");
    name.textContent = f.label;
    row.appendChild(name);
    const from = computed.getPropertyValue(f.prop).trim();

    if (f.kind === "color") {
      const wrap = document.createElement("div");
      wrap.className = "swatch";
      const dot = document.createElement("input");
      dot.type = "color";
      dot.value = toHex(from);
      const text = document.createElement("input");
      text.type = "text";
      text.value = from;
      dot.oninput = () => {
        text.value = dot.value;
        record(f.prop, from, dot.value);
      };
      text.onchange = () => record(f.prop, from, text.value.trim());
      wrap.append(dot, text);
      row.appendChild(wrap);
    } else if (f.kind === "weight") {
      const sel = document.createElement("select");
      for (const w of WEIGHTS) {
        const o = document.createElement("option");
        o.value = w;
        o.textContent = w;
        sel.appendChild(o);
      }
      sel.value = WEIGHTS.includes(from) ? from : "400";
      sel.onchange = () => record(f.prop, from, sel.value);
      row.appendChild(sel);
    } else if (f.kind === "px" || f.kind === "number") {
      const input = document.createElement("input");
      input.type = "number";
      if (f.step) input.step = f.step;
      if (f.min !== undefined) input.min = f.min;
      if (f.max !== undefined) input.max = f.max;
      input.value = parseFloat(from) || 0;
      input.oninput = () => record(f.prop, from, f.kind === "px" ? `${input.value}px` : input.value);
      row.appendChild(input);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.value = from;
      input.onchange = () => record(f.prop, from, input.value.trim());
      row.appendChild(input);
    }
    return row;
  }

  function closePanel() {
    if (panel) panel.remove();
    panel = null;
    target = null;
    draft = null;
    before = null;
  }

  function select(el) {
    closePanel();
    target = el;
    before = el.getAttribute("style");
    draft = { note: "", styles: new Map() };
    const computed = getComputedStyle(el);

    panel = document.createElement("div");
    panel.className = "card";

    const note = document.createElement("textarea");
    note.rows = 2;
    note.placeholder = "Describe these changes…";
    note.oninput = () => (draft.note = note.value);

    const who = document.createElement("div");
    who.className = "who";
    who.textContent = el.tagName.toLowerCase();

    panel.append(note, who);
    for (const f of FIELDS) panel.appendChild(field(f, computed));

    const acts = document.createElement("div");
    acts.className = "acts";
    const cancel = document.createElement("button");
    cancel.className = "cancel";
    cancel.textContent = "Cancel";
    cancel.onclick = () => {
      if (before === null) target.removeAttribute("style");
      else target.setAttribute("style", before);
      closePanel();
    };
    const ok = document.createElement("button");
    ok.className = "ok";
    ok.textContent = "Add note";
    ok.onclick = commit;
    acts.append(cancel, ok);
    panel.appendChild(acts);

    root.appendChild(panel);

    // Anchored below the element, pulled back inside the viewport — the dock is narrow and the
    // panel must never hang off the edge where it can't be reached.
    const r = el.getBoundingClientRect();
    const w = 300;
    panel.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left))}px`;
    panel.style.top = `${Math.max(8, Math.min(window.innerHeight - 120, r.bottom + 8))}px`;
    note.focus();
  }

  function commit() {
    if (!target) return;
    const styles = [...draft.styles.entries()]
      .filter(([, v]) => v.from !== v.to)
      .map(([property, v]) => ({ property, from: v.from, to: v.to }));
    if (draft.note.trim() || styles.length) {
      notes.push({
        el: target,
        // Kept so `clear()` can put the page back the way it found it: the style edits are a live
        // preview, and dropping the notes that describe them should drop them too.
        before,
        selector: selectorFor(target),
        tag: target.tagName.toLowerCase(),
        text: textOf(target),
        note: draft.note.trim(),
        styles,
      });
    }
    closePanel();
    drawPins();
  }

  // ---- mode -----------------------------------------------------------------------------------

  function inUI(node) {
    return !!(node && (node === host || node.closest?.(".__codetwo-annotator")));
  }

  function onMove(e) {
    if (!on || panel) return;
    const el = e.target;
    if (!el || el.nodeType !== 1 || inUI(el)) return;
    place(el, hover, tag);
    tag.textContent = el.tagName.toLowerCase();
  }

  function onClick(e) {
    if (!on || inUI(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    hover.style.display = "none";
    tag.style.display = "none";
    select(e.target);
  }

  function onKey(e) {
    if (on && e.key === "Escape" && panel) {
      e.preventDefault();
      closePanel();
    }
  }

  function reflow() {
    if (on) drawPins();
  }

  function setMode(next) {
    on = !!next;
    ensureUI();
    if (on) {
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("click", onClick, true);
      document.addEventListener("keydown", onKey, true);
      window.addEventListener("scroll", reflow, true);
      window.addEventListener("resize", reflow, true);
      drawPins();
    } else {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", reflow, true);
      window.removeEventListener("resize", reflow, true);
      closePanel();
      hover.style.display = "none";
      tag.style.display = "none";
      layer.textContent = "";
    }
    return on;
  }

  window.__codetwoAnnotate = {
    setMode,
    /** What the app pulls out: plain data, no element references. */
    list: () =>
      notes.map((n) => ({
        selector: n.selector,
        tag: n.tag,
        text: n.text,
        note: n.note,
        styles: n.styles,
      })),
    count: () => notes.length,
    clear: () => {
      for (const n of notes) {
        if (!n.el) continue;
        if (n.before === null) n.el.removeAttribute("style");
        else n.el.setAttribute("style", n.before);
      }
      notes.length = 0;
      closePanel();
      if (layer) layer.textContent = "";
      return 0;
    },
  };
})();
