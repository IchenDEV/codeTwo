# Plugin Hot Reload and Developer Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in native file watcher that hot-reloads affected installed plugins and a desktop Developer settings page for control and diagnostics.

**Architecture:** `plugin-hub` owns a scope-bound `notify::RecommendedWatcher` and forwards debounced Bundle ids to `PluginManager`, which forces only those dynamic factories through its existing unload/rebuild lifecycle. Three plugin commands expose persisted mode, status, and manual reload; the desktop reuses its generic call bridge and existing WebView inspector.

**Tech Stack:** Rust 2021, Tokio, notify 8.2, codetwo-kernel plugin scopes, React 18, TypeScript, Base UI/shadcn primitives, Bun tests.

---

### Task 1: Targeted dynamic Bundle reload

**Files:**
- Modify: `crates/plugins/src/app/plugin_manager.rs`
- Test: `crates/plugins/tests/project_bundle_runtime.rs`

- [ ] **Step 1: Add a failing integration test**

Add a named runtime fixture helper whose handshake command is `bundle.<id>`, then install Bundles
`changed` and `stable`. Force a reload for one id and assert the changed Bundle receives a new pid
while the unrelated Bundle keeps its pid.

```rust
let before_changed = app.call("bundle.changed", Value::Null).await.unwrap();
let before_stable = app.call("bundle.stable", Value::Null).await.unwrap();
app.plugin_manager()
    .reload_installed_bundles(&data.path().join("plugins"), ["changed"])
    .unwrap();
app.flush().await;
let after_changed = app.call("bundle.changed", Value::Null).await.unwrap();
let after_stable = app.call("bundle.stable", Value::Null).await.unwrap();
assert_ne!(before_changed["pid"], after_changed["pid"]);
assert_eq!(before_stable["pid"], after_stable["pid"]);
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `cargo test -p codetwo-plugins --test project_bundle_runtime targeted_bundle_reload`

Expected: compilation fails because `reload_installed_bundles` does not exist.

- [ ] **Step 3: Add the minimal manager seam**

Add a public manager method and thread forced names into dynamic source reconciliation:

```rust
pub fn reload_installed_bundles<I, S>(
    &self,
    plugins_dir: &Path,
    bundle_ids: I,
) -> Result<(), PluginManagerError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    self.sync_installed_bundles_with_changes(
        plugins_dir,
        bundle_ids.into_iter().map(|id| format!("bundle:{}", id.as_ref())),
    )
}
```

`sync_installed_bundles` passes an empty forced set. `replace_dynamic_factory_source` unions the
forced set with fingerprint-derived changes before calling each loader's `reconcile_registry`.

- [ ] **Step 4: Run the focused test**

Run: `cargo test -p codetwo-plugins --test project_bundle_runtime targeted_bundle_reload`

Expected: PASS; only the requested Bundle pid changes.

### Task 2: Development watcher and commands

**Files:**
- Modify: `crates/core/Cargo.toml`
- Modify: `Cargo.lock`
- Create: `crates/plugins/src/app/plugin_development.rs`
- Modify: `crates/plugins/src/app/mod.rs`
- Modify: `crates/plugins/src/app/plugins/hub.rs`
- Test: `crates/plugins/tests/project_bundle_runtime.rs`

- [ ] **Step 1: Add failing command and watcher tests**

Cover persisted mode, deterministic manual reload, automatic reload after editing a Bundle file,
and no automatic reload after disabling the mode. Poll with a bounded timeout rather than sleeping
for an assumed event delivery time.

```rust
app.call("plugins.set_developer_mode", json!({ "enabled": true })).await.unwrap();
std::fs::write(server_path, changed_server).unwrap();
let changed = tokio::time::timeout(Duration::from_secs(5), async {
    loop {
        let next = app.call("bundle.where", Value::Null).await.unwrap();
        if next["pid"] != before["pid"] { break next; }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
}).await.unwrap();
assert_ne!(before["pid"], changed["pid"]);
```

- [ ] **Step 2: Run the tests and confirm failure**

Run: `cargo test -p codetwo-plugins --test project_bundle_runtime developer_`

Expected: command-not-found failures for the three development commands.

- [ ] **Step 3: Add notify and the scope-owned service**

Add `notify = "8.2"`. Implement these wire types and service methods in the new focused module:

```rust
#[derive(Clone, Serialize)]
pub struct PluginDeveloperStatus {
    pub enabled: bool,
    pub watching: bool,
    pub plugins_dir: String,
    pub last_reload: Option<PluginReloadRecord>,
}

#[derive(Clone, Serialize)]
pub struct PluginReloadRecord {
    pub at: i64,
    pub plugins: Vec<String>,
    pub success: bool,
    pub error: Option<String>,
}
```

The task owns `RecommendedWatcher`, filters `.data` and hidden operational paths, accumulates
Bundle ids, and uses a 250 ms Tokio quiet period. A hidden `.developer-mode` marker persists the
switch. Watcher creation errors update status while leaving manual reload usable.

- [ ] **Step 4: Register the three hub commands**

```rust
let status = development.clone();
ctx.command("plugins.developer_status", move |_| {
    let status = status.clone();
    async move { json(status.status()) }
})?;

let settings = development.clone();
ctx.command("plugins.set_developer_mode", move |args| {
    let settings = settings.clone();
    async move {
        let args: DeveloperModeArgs = take_args(args)?;
        json(settings.set_enabled(args.enabled).await.map_err(PluginError::new)?)
    }
})?;

let reload = development.clone();
ctx.command("plugins.reload_development", move |_| {
    let reload = reload.clone();
    async move { json(reload.reload_all().await.map_err(PluginError::new)?) }
})?;
```

Successful automatic and manual reconciliations emit `PluginsChanged` while the inventory lock is
held, then flush the context. The existing extensions listener therefore skips the duplicate
reconcile through `try_lock`.

- [ ] **Step 5: Run core verification**

Run: `cargo test -p codetwo-plugins --test project_bundle_runtime developer_`

Expected: PASS for persistence, manual reload, automatic reload, disabled mode, and isolation.

### Task 3: Desktop event and bridge

**Files:**
- Modify: `apps/desktop/src-host/src/host_events.rs`
- Modify: `apps/desktop/src/bridge.ts`
- Test: `apps/desktop/tests/pluginBridgeContract.test.ts`

- [ ] **Step 1: Add failing bridge assertions**

Assert the renderer calls the exact command names and the host forwards the typed event:

```ts
expect(bridge).toContain('call<PluginDeveloperStatus>("plugins.developer_status"');
expect(bridge).toContain('call("plugins.set_developer_mode"');
expect(bridge).toContain('call<PluginDeveloperStatus>("plugins.reload_development"');
expect(hostEvents).toContain('host.emit("plugins-changed", ())');
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd apps/desktop && bun test tests/pluginBridgeContract.test.ts`

Expected: FAIL on the missing development bridge and event forwarder.

- [ ] **Step 3: Implement the typed bridge and event forwarding**

```ts
export interface PluginDeveloperStatus {
  enabled: boolean;
  watching: boolean;
  plugins_dir: string;
  last_reload: PluginReloadRecord | null;
}

export const getPluginDeveloperStatus = () =>
  call<PluginDeveloperStatus>("plugins.developer_status", undefined, null);
export const setPluginDeveloperMode = (enabled: boolean) =>
  call<PluginDeveloperStatus>("plugins.set_developer_mode", { enabled }, null);
export const reloadDevelopmentPlugins = () =>
  call<PluginDeveloperStatus>("plugins.reload_development", undefined, null);
```

Add a `PluginsChanged` listener to `HostEventsPlugin` that emits `plugins-changed` through the
existing `EventSink`.

- [ ] **Step 4: Run the bridge test**

Run: `cd apps/desktop && bun test tests/pluginBridgeContract.test.ts`

Expected: PASS.

### Task 4: Developer settings interface

**Files:**
- Modify: `apps/desktop/src/settings/SettingsPage.tsx`
- Modify: `apps/desktop/src/i18n/strings.ts`
- Create: `apps/desktop/tests/developerSettings.test.tsx`

- [ ] **Step 1: Add a failing rendered interaction test**

Render `SettingsPage` on `initialTab="developer"` with injected status loader, mode saver, manual
reloader, and inspector opener. Click the switch, Reload plugins, and Open WebView DevTools; assert
the callbacks run and the last reload state is announced.

```tsx
<SettingsPage
  initialTab="developer"
  bindings={[]}
  capturing={null}
  onCapture={() => {}}
  providers={[]}
  provider=""
  projectPath="/workspace"
  project={null}
  onProjectWorktreeMode={async () => {}}
  memoryEnabled={false}
  onClose={() => {}}
  pluginDeveloperStatusLoader={async () => status}
  pluginDeveloperModeSaver={async (enabled) => ({ ...status, enabled, watching: enabled })}
  pluginDeveloperReloader={async () => reloadedStatus}
  devtoolsOpener={async () => { opened += 1; }}
/>
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd apps/desktop && bun test tests/developerSettings.test.tsx`

Expected: TypeScript/render failure because the Developer tab and injected handlers do not exist.

- [ ] **Step 3: Add localized Developer navigation and rows**

Add the `developer` tab with an unboxed wrench icon already available from the current icon set.
Reuse `Page`, `Row`, `Switch`, and `Button`. Load status only while the tab is active. Show:

```tsx
<Row label={t("settings.developerMode")} hint={t("settings.developerModeHint")}>
  <Switch checked={status?.enabled ?? false} onCheckedChange={saveDeveloperMode} />
</Row>
<Row label={t("settings.pluginHotReload")} hint={hotReloadHint}>
  <Button disabled={!status?.enabled || reloading} onClick={reloadPlugins}>
    {reloading ? t("settings.pluginReloading") : t("settings.reloadPlugins")}
  </Button>
</Row>
<Row label={t("settings.webviewDevtools")} hint={t("settings.webviewDevtoolsHint")}>
  <Button onClick={devtoolsOpener}>{t("settings.openWebviewDevtools")}</Button>
</Row>
```

Errors render with `role="alert"`; reload results use `aria-live="polite"`. Add matching English
and Simplified Chinese keys.

- [ ] **Step 4: Run the rendered test and design-system check**

Run: `cd apps/desktop && bun test tests/developerSettings.test.tsx`

Expected: PASS.

Run: `cd apps/desktop && bun run check:design`

Expected: PASS.

### Task 5: Documentation, regression checks, and UI audit

**Files:**
- Modify: `docs/plugins.md`
- Verify all files above.

- [ ] **Step 1: Document the opt-in workflow and boundary**

Add commands, watched installed path, trusted-process behavior, native Rust limitation, and the
Developer settings path to `docs/plugins.md`.

- [ ] **Step 2: Format and run focused suites**

Run: `cargo fmt --all -- --check`

Run: `cargo test -p codetwo-plugins --test project_bundle_runtime`

Run: `cargo test -p codetwo-desktop-host`

Run: `cd apps/desktop && bun test tests/developerSettings.test.tsx tests/pluginBridgeContract.test.ts`

Expected: all PASS.

- [ ] **Step 3: Run broader compile and renderer checks**

Run: `cargo check --workspace`

Run: `cd apps/desktop && bun run build:renderer`

Expected: all PASS.

- [ ] **Step 4: Reread the anti-slop law and perform real UI QA**

Reread `/Users/chenli/.codex/ANTI_SLOP.md` completely. Start the desktop development build, open
Settings > Developer, and verify pointer and keyboard interaction for the mode switch, manual
reload, and inspector action. Inspect normal, loading, success, failure, disabled, narrow, light,
and dark states. Fix every applicable visual, accessibility, clipping, alignment, contrast, dead
control, and motion issue found.

- [ ] **Step 5: Inspect the final diff without touching unrelated work**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors; only the feature files plus the user's pre-existing dirty files
are present.
