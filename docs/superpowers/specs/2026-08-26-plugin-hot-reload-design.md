# Plugin Hot Reload and Developer Tools

## Goal

Give plugin authors an opt-in desktop development mode that watches installed Bundle files,
reloads only affected plugin runtimes, refreshes data contributions, and exposes a small set of
diagnostics plus the existing WebView inspector.

## Scope

- Add one global, persisted developer-mode switch.
- Watch installed Bundle records and `bundle/` contents with `notify` while the switch is on.
- Debounce editor write bursts and reconcile only the affected `bundle:<id>` factories.
- Refresh skills, scenes, UI contributions, LSP descriptors, the managed catalog, and the desktop
  renderer through the existing `PluginsChanged` event.
- Add a Developer settings page with watcher status, the last reload result, a manual reload
  action, and an Open WebView DevTools action.
- Keep compiled Rust plugins on their existing rebuild-and-restart path.

## Architecture

`plugin-hub` owns the installed Bundle directory, so it also owns the development watcher. A
scope-owned background task holds `notify::RecommendedWatcher`; unloading `plugin-hub` aborts the
task and drops the watcher. A hidden marker under the plugins directory persists the global
developer-mode choice without adding another settings store.

Filesystem callbacks send events into a Tokio channel. The task filters hidden staging, backup,
and `.data` paths, groups changed paths by installed Bundle id, and waits for a short quiet period
before reconciling. The `PluginManager` receives those ids as forced factory changes. Its existing
loader disposal and rebuild path then restarts the matching global and live project instances,
while leaving unrelated plugins untouched.

The watcher holds the Plugin Hub inventory lock through reconcile and announcement. This keeps
filesystem refreshes serialized with install, trust, enable, and uninstall mutations and prevents
the `ExtensionsPlugin` listener from reconciling the same snapshot twice.

## Commands and Data

The hub contributes three commands:

- `plugins.developer_status`: returns `enabled`, `watching`, `plugins_dir`, and the last reload
  record.
- `plugins.set_developer_mode`: persists the switch and starts or drops the watcher immediately.
- `plugins.reload_development`: forces a manual reconciliation of installed Bundles.

The last reload record contains the timestamp, affected Bundle ids, success state, and an optional
error. Runtime apply failures remain visible in the existing managed catalog; watcher setup or
reconciliation failures also appear in the developer status and do not stop future events.

## Desktop Interface

Settings gains one Developer navigation item. Its page reuses the existing settings row, switch,
button, type, spacing, and status patterns:

- Developer mode switch with direct copy explaining automatic process restarts.
- Hot reload row showing off, watching, last success, or last error, plus a manual Reload plugins
  button while enabled.
- WebView inspection row using the existing `openDevtools()` bridge.

The page stays visually quiet: no dashboard cards, decorative badges, glow, or new icon language.
Controls remain visible and keyboard accessible, errors use `role="alert"`, and status changes use
`aria-live="polite"`. English and Simplified Chinese strings are added together.

The desktop host forwards typed `PluginsChanged` events as the renderer's existing
`plugins-changed` event. The App already listens to that event, so the Plugin Manager catalog and
Bundle descriptors refresh without new polling in React.

## Error Handling

- Failure to create or attach the native watcher leaves developer mode enabled, reports the
  watcher error, and keeps manual reload available.
- Bursty create, rename, write, and remove events are coalesced before reconciliation.
- Changes outside a concrete Bundle directory and changes under hidden operational directories
  are ignored.
- Removing a Bundle follows the existing unload path; adding one follows the existing dynamic
  registration path.
- A plugin that fails after restart stays failed in the normal catalog while the watcher remains
  active for the next edit.

## Verification

- Core integration tests prove manual reload restarts a runtime without restarting C2, automatic
  reload reacts while developer mode is enabled, disabling the mode stops automatic reload, and
  unrelated Bundle processes keep their pid.
- Desktop tests cover bridge command names, the Developer settings controls, localized labels,
  and forwarding of `plugins-changed`.
- Focused Rust and Bun test suites run before full workspace checks.
- Final UI verification covers the switch, manual reload, WebView DevTools action, live status,
  error state, keyboard use, narrow layout, and every applicable anti-slop rule.

## Boundaries

The watcher observes the installed copy under C2's plugins directory. Linking an arbitrary source
checkout, compiling TypeScript, tailing logs, or embedding a protocol console can be added later if
real plugin workflows require them; they are outside this change.
