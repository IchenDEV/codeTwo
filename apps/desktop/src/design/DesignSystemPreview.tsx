import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleHelp,
  LoaderCircle,
  Monitor,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import "./tokens.css";
import "./preview.css";

type ThemeMode = "system" | "light" | "dark";

const colorTokens = [
  ["Canvas", "--ds-color-canvas"],
  ["Sidebar", "--ds-color-sidebar"],
  ["Surface", "--ds-color-surface"],
  ["Raised", "--ds-color-raised"],
  ["Modal", "--ds-color-modal"],
  ["Primary", "--ds-color-primary"],
  ["Success", "--ds-color-success"],
  ["Warning", "--ds-color-warning"],
  ["Destructive", "--ds-color-destructive"],
] as const;

const typeRoles = [
  ["Large title", "26 / 32", "ds-type-large-title"],
  ["Page title", "22 / 26", "ds-type-page-title"],
  ["Section", "17 / 22", "ds-type-section"],
  ["Dialog", "15 / 20", "ds-type-dialog"],
  ["Body / control", "13 / 16", "ds-type-body"],
  ["Callout", "12 / 15", "ds-type-callout"],
  ["Metadata", "11 / 14", "ds-type-metadata"],
  ["Caption / keycap", "10 / 13", "ds-type-caption"],
] as const;

const spacingRoles = [
  ["Optical", "2"],
  ["Inline", "4"],
  ["Control group", "6"],
  ["Module inset", "8"],
  ["Surface inset", "12"],
  ["Section", "16"],
  ["Page", "24"],
  ["Page section", "32"],
] as const;

const motionRoles = [
  ["Feedback", "120 ms", "color · opacity · press"],
  ["Layer", "160 ms", "menu · popover · tooltip"],
  ["Dialog", "220 ms", "dialog · dock · tree"],
  ["Page", "280 ms", "full-page transition"],
] as const;

function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return dark;
}

function ThemeChoice({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className="ds-theme-choice"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="ds-section-heading">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
    </header>
  );
}

export function DesignSystemPreview() {
  const systemDark = useSystemDark();
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [boldText, setBoldText] = useState(false);
  const [invalidValue, setInvalidValue] = useState("Missing token");
  const resolvedTheme = themeMode === "system" ? (systemDark ? "dark" : "light") : themeMode;
  const swatches = useMemo(
    () =>
      colorTokens.map(([label, token]) => ({
        label,
        token,
        style: { "--ds-preview-swatch": `var(${token})` } as CSSProperties,
      })),
    [],
  );

  return (
    <div
      className="ds-preview"
      data-ds-bold-text={boldText ? "true" : "false"}
      data-ds-theme={resolvedTheme}
    >
      <aside className="ds-preview-sidebar">
        <div className="ds-brand-lockup">
          <span className="ds-brand-mark">C2</span>
          <div>
            <strong>Code2</strong>
            <span>Design system</span>
          </div>
        </div>
        <nav aria-label="Design system sections" className="ds-preview-nav">
          <a href="#foundation">Foundation</a>
          <a href="#surfaces">Surfaces</a>
          <a href="#components">Components</a>
          <a href="#accessibility">Accessibility</a>
        </nav>
        <div className="ds-version-card">
          <span className="ds-status-dot" />
          <div>
            <strong>0.9.0 candidate</strong>
            <span>Windows validation pending</span>
          </div>
        </div>
      </aside>

      <main className="ds-preview-main">
        <header className="ds-preview-toolbar">
          <div>
            <span className="ds-toolbar-label">Compact desktop · 4px grid</span>
            <strong>Foundation preview</strong>
          </div>
          <div className="ds-toolbar-actions">
            <div aria-label="Preview theme" className="ds-theme-switcher" role="group">
              <ThemeChoice
                active={themeMode === "system"}
                label="Use system theme"
                onClick={() => setThemeMode("system")}
              >
                <Monitor className="ds-icon-list" />
              </ThemeChoice>
              <ThemeChoice
                active={themeMode === "light"}
                label="Use light theme"
                onClick={() => setThemeMode("light")}
              >
                <Sun className="ds-icon-list" />
              </ThemeChoice>
              <ThemeChoice
                active={themeMode === "dark"}
                label="Use dark theme"
                onClick={() => setThemeMode("dark")}
              >
                <Moon className="ds-icon-list" />
              </ThemeChoice>
            </div>
          </div>
        </header>

        <div className="ds-preview-scroll">
          <section className="ds-intro" id="foundation">
            <div>
              <span className="ds-eyebrow">CODE2 DESIGN SYSTEM 0.9</span>
              <h1>Quiet structure.<br />Precise density.</h1>
              <p>
                A compact desktop system that strengthens Code2 without changing its character.
                Solid neutral planes, fixed blue action, borderless elevation, and platform-native
                typography.
              </p>
            </div>
            <div className="ds-principle-stack" aria-label="Core principles">
              <div><span>01</span><strong>One density</strong><small>Compact desktop only</small></div>
              <div><span>02</span><strong>One grid</strong><small>4px with a 2px optical step</small></div>
              <div><span>03</span><strong>One language</strong><small>Semantic tokens, no visual overrides</small></div>
            </div>
          </section>

          <section className="ds-preview-section">
            <SectionHeading eyebrow="01 · Color" title="Five neutral planes, one Code2 blue" />
            <div className="ds-color-grid">
              {swatches.map(({ label, token, style }) => (
                <div className="ds-swatch-card" key={token}>
                  <div className="ds-swatch" style={style} />
                  <strong>{label}</strong>
                  <code>{token.replace("--ds-color-", "")}</code>
                </div>
              ))}
            </div>
            <div className="ds-contrast-note">
              <Check className="ds-icon-list" />
              <span>Text pairs are machine-checked in light and dark at AA or better.</span>
            </div>
          </section>

          <section className="ds-preview-section">
            <SectionHeading eyebrow="02 · Typography" title="Platform system faces, Mac rhythm" />
            <div className="ds-specimen-card ds-type-specimen">
              {typeRoles.map(([role, metric, className]) => (
                <div className="ds-type-row" key={role}>
                  <span className="ds-type-meta"><strong>{role}</strong><code>{metric}</code></span>
                  <span className={className}>Code2 stays compact and legible.</span>
                </div>
              ))}
            </div>
            <div className="ds-inline-facts">
              <span><strong>macOS</strong> SF Pro · SF Mono</span>
              <span><strong>Windows</strong> Segoe UI · Cascadia / Consolas</span>
              <span><strong>Content</strong> 13 / 20 · code 12 / 18</span>
            </div>
          </section>

          <section className="ds-preview-section ds-two-column">
            <div>
              <SectionHeading eyebrow="03 · Spacing" title="A finite 2–32 scale" />
              <div className="ds-specimen-card ds-spacing-list">
                {spacingRoles.map(([role, value]) => (
                  <div className="ds-spacing-row" key={role}>
                    <span>{role}</span>
                    <div className={`ds-space-sample ds-space-${value}`} />
                    <code>{value}px</code>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <SectionHeading eyebrow="04 · Geometry" title="Four radii, three icon sizes" />
              <div className="ds-specimen-card ds-geometry-grid">
                <div className="ds-radius-sample ds-radius-micro"><span>4</span><small>micro</small></div>
                <div className="ds-radius-sample ds-radius-control"><span>8</span><small>control</small></div>
                <div className="ds-radius-sample ds-radius-module"><span>12</span><small>module</small></div>
                <div className="ds-radius-sample ds-radius-modal"><span>16</span><small>modal</small></div>
                <div className="ds-icon-scale">
                  <Search className="ds-icon-inline" />
                  <Search className="ds-icon-list" />
                  <Search className="ds-icon-control" />
                  <span>12 · 14 · 16</span>
                </div>
              </div>
            </div>
          </section>

          <section className="ds-preview-section" id="surfaces">
            <SectionHeading eyebrow="05 · Elevation" title="Shadow communicates real layers" />
            <div className="ds-elevation-grid">
              <div className="ds-elevation-sample ds-elevation-surface"><strong>Surface</strong><span>cards · inputs · persistent panels</span></div>
              <div className="ds-elevation-sample ds-elevation-raised"><strong>Raised</strong><span>menus · popovers · tooltips</span></div>
              <div className="ds-elevation-sample ds-elevation-modal"><strong>Modal</strong><span>dialogs · blocking overlays</span></div>
            </div>
            <p className="ds-rule-note">No hover lift, scale, shadow bloom, white hairline, or decorative border.</p>
          </section>

          <section className="ds-preview-section" id="components">
            <SectionHeading eyebrow="06 · Components" title="Shared controls carry every state" />
            <div className="ds-component-grid">
              <div className="ds-specimen-card ds-control-specimen">
                <span className="ds-specimen-label">Buttons</span>
                <div className="ds-control-row">
                  <button className="ds-button ds-button-primary" type="button">Continue</button>
                  <button className="ds-button ds-button-secondary" type="button">Save draft</button>
                  <button className="ds-button ds-button-ghost" type="button">Cancel</button>
                  <button className="ds-button ds-button-destructive" type="button">Delete</button>
                  <button className="ds-button ds-button-secondary" disabled type="button">Disabled</button>
                </div>
                <p>One primary action per area. Outline is not a variant.</p>
              </div>

              <div className="ds-specimen-card ds-control-specimen">
                <span className="ds-specimen-label">Inputs</span>
                <label className="ds-field-label" htmlFor="preview-search">Project</label>
                <div className="ds-input-shell">
                  <Search className="ds-icon-list" />
                  <input id="preview-search" defaultValue="codeTwo" />
                  <kbd>⌘K</kbd>
                </div>
                <div className="ds-input-shell ds-static-focus">
                  <input aria-label="Keyboard focus example" readOnly value="Keyboard focus" />
                </div>
                <div className="ds-input-shell ds-input-invalid">
                  <input
                    aria-describedby="preview-error"
                    aria-invalid="true"
                    aria-label="Invalid token example"
                    onChange={(event) => setInvalidValue(event.target.value)}
                    value={invalidValue}
                  />
                </div>
                <span className="ds-error-text" id="preview-error">Use a semantic token.</span>
              </div>

              <div className="ds-specimen-card ds-control-specimen">
                <span className="ds-specimen-label">Rows & status</span>
                <button className="ds-select-row" type="button">
                  <span><span className="ds-provider-icon">C</span> Current provider</span>
                  <span>Codex <ChevronDown className="ds-icon-inline" /></span>
                </button>
                <label className="ds-check-row">
                  <input defaultChecked type="checkbox" />
                  <span><Check className="ds-icon-inline" /></span>
                  Keep the panel visible
                </label>
                <div className="ds-status-row"><LoaderCircle className="ds-icon-list ds-spinner" /> Refreshing provider quota</div>
                <div className="ds-status-row ds-status-warning"><AlertTriangle className="ds-icon-list" /> Quota unavailable</div>
              </div>

              <div className="ds-layer-stage">
                <div className="ds-dialog-demo">
                  <div className="ds-dialog-title-row">
                    <div><strong>Provider quota</strong><span>Current provider: Codex</span></div>
                    <button aria-label="Help" className="ds-icon-button" type="button"><CircleHelp className="ds-icon-control" /></button>
                  </div>
                  <div className="ds-progress"><span /></div>
                  <div className="ds-dialog-copy"><strong>5-hour limit</strong><span>72% remaining · resets in 1h 42m</span></div>
                  <div className="ds-dialog-actions">
                    <button className="ds-button ds-button-ghost" type="button">Refresh</button>
                    <button className="ds-button ds-button-secondary" type="button">Done</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="ds-preview-section ds-two-column">
            <div>
              <SectionHeading eyebrow="07 · Motion" title="Four durations, no theatre" />
              <div className="ds-specimen-card ds-motion-list">
                {motionRoles.map(([role, duration, use]) => (
                  <div className="ds-motion-row" key={role}>
                    <span className={`ds-motion-dot ds-motion-${role.toLowerCase()}`} />
                    <strong>{role}</strong><code>{duration}</code><span>{use}</span>
                  </div>
                ))}
              </div>
            </div>
            <div id="accessibility">
              <SectionHeading eyebrow="08 · Accessibility" title="OS preferences stay in control" />
              <div className="ds-specimen-card ds-access-list">
                <div><Check className="ds-icon-list" /><span><strong>Reduced motion</strong><small>All four semantic durations collapse.</small></span></div>
                <div><Check className="ds-icon-list" /><span><strong>Increased contrast</strong><small>Muted text and control fills strengthen.</small></span></div>
                <div><Check className="ds-icon-list" /><span><strong>Reduced transparency</strong><small>Sidebar falls back to a solid plane.</small></span></div>
                <label className="ds-bold-toggle">
                  <input checked={boldText} onChange={(event) => setBoldText(event.target.checked)} type="checkbox" />
                  <span><Check className="ds-icon-inline" /></span>
                  Simulate bold text
                </label>
              </div>
            </div>
          </section>

          <footer className="ds-preview-footer">
            <span>800–999 compact · 1000–1399 standard · 1400+ wide</span>
            <span>Local container queries · no mobile layout</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
