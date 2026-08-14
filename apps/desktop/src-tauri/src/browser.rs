//! The built-in browser's pages, as real native webviews.
//!
//! An `<iframe>` cannot be a browser: `X-Frame-Options: DENY` and `frame-ancestors` are honoured by
//! the engine, so github.com, google.com and most of the web render as a blank sheet no matter what
//! the address bar says. That was the bug — not a loading failure, a refusal.
//!
//! So each browser tab is a child webview of the main window (Tauri's multiwebview, hence the
//! `unstable` feature), positioned over a placeholder the React panel measures for us. The native
//! view floats *above* the DOM — it is a sibling layer, not an element — which is why the frontend
//! hides it whenever something has to be drawn over the page area (menus, dialogs, tab switches).
//!
//! Labels are `browser-<tab id>` and are the only handle the frontend needs; the webview itself is
//! looked up from the app manager rather than stored in state.

use std::collections::BTreeSet;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use codetwo_core::browser::{Annotation, BrowserTab, StyleChange};
use codetwo_kernel::{
    async_trait, Context, Plugin, PluginError, PluginResult, Service, WeakContext,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::webview::{DownloadEvent, NewWindowResponse, WebviewBuilder};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Runtime, State, Url, WebviewUrl,
    Window,
};

const BLANK_URL: &str = "about:blank";

pub struct BrowserPlugin {
    app: AppHandle,
    socket_path: PathBuf,
    master_key: String,
}

impl BrowserPlugin {
    pub fn new(app: AppHandle, socket_path: PathBuf, master_key: String) -> Self {
        Self {
            app,
            socket_path,
            master_key,
        }
    }
}

/// Marker capability for plugins that require the authenticated native-browser broker.
pub struct BrowserHostService;

impl Service for BrowserHostService {
    const NAME: &'static str = "browser";
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredBrowserState {
    #[serde(default)]
    tabs: Vec<BrowserTab>,
    #[serde(default = "default_next_tab")]
    next_tab: u64,
}

fn default_next_tab() -> u64 {
    2
}

impl Default for StoredBrowserState {
    fn default() -> Self {
        Self {
            tabs: vec![BrowserTab {
                id: "browser-1".into(),
                url: BLANK_URL.into(),
                title: String::new(),
                active: true,
                lease_session: None,
                agent_active: false,
            }],
            next_tab: default_next_tab(),
        }
    }
}

/// Authoritative browser state. React and the agent both operate on this registry; native
/// WKWebViews are still looked up by the opaque tab label and never cross the boundary.
pub struct BrowserState {
    registry: Mutex<StoredBrowserState>,
    permanent_origins: Mutex<BTreeSet<String>>,
    download_once: Mutex<BTreeSet<String>>,
    registry_path: PathBuf,
    permissions_path: PathBuf,
}

impl BrowserState {
    pub fn load(data_dir: &std::path::Path) -> Self {
        let registry_path = data_dir.join("browser-tabs.json");
        let permissions_path = data_dir.join("browser-permissions.json");
        let mut registry = std::fs::read(&registry_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<StoredBrowserState>(&bytes).ok())
            .unwrap_or_default();
        sanitize_registry(&mut registry);
        let permanent_origins = std::fs::read(&permissions_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<BTreeSet<String>>(&bytes).ok())
            .unwrap_or_default()
            .into_iter()
            .filter(|origin| safe_origin(origin).as_deref() == Some(origin.as_str()))
            .collect();
        Self {
            registry: Mutex::new(registry),
            permanent_origins: Mutex::new(permanent_origins),
            download_once: Mutex::new(BTreeSet::new()),
            registry_path,
            permissions_path,
        }
    }

    pub fn snapshot(&self) -> Vec<BrowserTab> {
        self.registry.lock().unwrap().tabs.clone()
    }

    fn save_registry(&self) {
        let registry = self.registry.lock().unwrap().clone();
        if let Ok(bytes) = serde_json::to_vec_pretty(&registry) {
            let _ = write_private(&self.registry_path, &bytes);
        }
    }

    fn save_permissions(&self) {
        let permissions = self.permanent_origins.lock().unwrap().clone();
        if let Ok(bytes) = serde_json::to_vec_pretty(&permissions) {
            let _ = write_private(&self.permissions_path, &bytes);
        }
    }

    fn ensure(&self, label: &str, url: &str) {
        let mut registry = self.registry.lock().unwrap();
        if let Some(tab) = registry.tabs.iter_mut().find(|tab| tab.id == label) {
            if tab.url == BLANK_URL && url != BLANK_URL {
                tab.url = url.to_string();
            }
        } else if safe_label(label) {
            let active = registry.tabs.is_empty();
            registry.tabs.push(BrowserTab {
                id: label.to_string(),
                url: url.to_string(),
                title: String::new(),
                active,
                lease_session: None,
                agent_active: false,
            });
            if let Some(id) = label
                .strip_prefix("browser-")
                .and_then(|id| id.parse::<u64>().ok())
            {
                registry.next_tab = registry.next_tab.max(id + 1);
            }
        }
        drop(registry);
        self.save_registry();
    }

    pub fn create(&self, url: String, session: Option<&str>) -> BrowserTab {
        let mut registry = self.registry.lock().unwrap();
        for tab in &mut registry.tabs {
            tab.active = false;
        }
        let tab = BrowserTab {
            id: format!("browser-{}", registry.next_tab),
            url,
            title: String::new(),
            active: true,
            lease_session: session.map(str::to_string),
            agent_active: session.is_some(),
        };
        registry.next_tab += 1;
        registry.tabs.push(tab.clone());
        drop(registry);
        self.save_registry();
        tab
    }

    pub fn select(&self, label: &str, session: Option<&str>) -> Result<(), String> {
        let mut registry = self.registry.lock().unwrap();
        let index = registry
            .tabs
            .iter()
            .position(|tab| tab.id == label)
            .ok_or_else(|| "browser tab not found".to_string())?;
        if let Some(owner) = registry.tabs[index].lease_session.as_deref() {
            if session != Some(owner) {
                return Err("browser tab is leased to another session".into());
            }
        }
        for tab in &mut registry.tabs {
            tab.active = false;
        }
        let tab = &mut registry.tabs[index];
        tab.active = true;
        if let Some(session) = session {
            tab.lease_session = Some(session.to_string());
            tab.agent_active = true;
        }
        drop(registry);
        self.save_registry();
        Ok(())
    }

    pub fn close(&self, label: &str, session: Option<&str>) -> Result<(), String> {
        let mut registry = self.registry.lock().unwrap();
        let index = registry
            .tabs
            .iter()
            .position(|tab| tab.id == label)
            .ok_or_else(|| "browser tab not found".to_string())?;
        if let Some(owner) = registry.tabs[index].lease_session.as_deref() {
            if session != Some(owner) {
                return Err("browser tab is leased to another session".into());
            }
        }
        let was_active = registry.tabs[index].active;
        registry.tabs.remove(index);
        if registry.tabs.is_empty() {
            let next_tab = registry.next_tab;
            registry.tabs.push(BrowserTab {
                id: format!("browser-{next_tab}"),
                url: BLANK_URL.into(),
                title: String::new(),
                active: true,
                lease_session: None,
                agent_active: false,
            });
            registry.next_tab += 1;
        } else if was_active {
            if let Some(tab) = registry.tabs.last_mut() {
                tab.active = true;
            }
        }
        drop(registry);
        self.save_registry();
        Ok(())
    }

    pub fn update_url(&self, label: &str, url: &str) {
        let mut registry = self.registry.lock().unwrap();
        if let Some(tab) = registry.tabs.iter_mut().find(|tab| tab.id == label) {
            tab.url = url.to_string();
        }
        drop(registry);
        self.save_registry();
    }

    pub fn update_title(&self, label: &str, title: &str) {
        let mut registry = self.registry.lock().unwrap();
        if let Some(tab) = registry.tabs.iter_mut().find(|tab| tab.id == label) {
            tab.title = title.chars().take(512).collect();
        }
        drop(registry);
        self.save_registry();
    }

    pub fn take_control(&self, label: &str) -> Result<(), String> {
        let mut registry = self.registry.lock().unwrap();
        let tab = registry
            .tabs
            .iter_mut()
            .find(|tab| tab.id == label)
            .ok_or_else(|| "browser tab not found".to_string())?;
        tab.lease_session = None;
        tab.agent_active = false;
        drop(registry);
        self.save_registry();
        Ok(())
    }

    pub fn ensure_lease(&self, label: &str, session: &str) -> Result<(), String> {
        let mut registry = self.registry.lock().unwrap();
        let tab = registry
            .tabs
            .iter_mut()
            .find(|tab| tab.id == label)
            .ok_or_else(|| "browser tab not found".to_string())?;
        if tab
            .lease_session
            .as_deref()
            .is_some_and(|owner| owner != session)
        {
            return Err("browser tab is leased to another session".into());
        }
        tab.lease_session = Some(session.to_string());
        tab.agent_active = true;
        drop(registry);
        self.save_registry();
        Ok(())
    }

    pub fn tab(&self, label: &str) -> Option<BrowserTab> {
        self.registry
            .lock()
            .unwrap()
            .tabs
            .iter()
            .find(|tab| tab.id == label)
            .cloned()
    }

    pub fn origin_allowed(&self, origin: &str) -> bool {
        self.permanent_origins.lock().unwrap().contains(origin)
    }

    pub fn allow_origin_permanently(&self, origin: &str) {
        if let Some(origin) = safe_origin(origin) {
            self.permanent_origins.lock().unwrap().insert(origin);
            self.save_permissions();
        }
    }

    pub fn permissions(&self) -> Vec<String> {
        self.permanent_origins
            .lock()
            .unwrap()
            .iter()
            .cloned()
            .collect()
    }

    pub fn revoke_origin(&self, origin: &str) {
        self.permanent_origins.lock().unwrap().remove(origin);
        self.save_permissions();
    }

    pub fn permit_download_once(&self, label: &str) {
        self.download_once.lock().unwrap().insert(label.into());
    }

    fn consume_download(&self, label: &str) -> bool {
        self.download_once.lock().unwrap().remove(label)
    }
}

fn write_private(path: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut options = std::fs::OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

fn safe_label(label: &str) -> bool {
    label
        .strip_prefix("browser-")
        .is_some_and(|id| !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()))
}

fn safe_origin(value: &str) -> Option<String> {
    let url = Url::parse(value).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    Some(url.origin().ascii_serialization())
}

fn sanitize_registry(registry: &mut StoredBrowserState) {
    registry.tabs.retain(|tab| {
        safe_label(&tab.id)
            && (tab.url == BLANK_URL
                || Url::parse(&tab.url)
                    .ok()
                    .is_some_and(|url| matches!(url.scheme(), "http" | "https")))
    });
    let mut ids = BTreeSet::new();
    registry.tabs.retain(|tab| ids.insert(tab.id.clone()));
    if registry.tabs.is_empty() {
        *registry = StoredBrowserState::default();
        return;
    }
    let first_active = registry.tabs.iter().position(|tab| tab.active).unwrap_or(0);
    for (index, tab) in registry.tabs.iter_mut().enumerate() {
        tab.active = index == first_active;
        tab.lease_session = None;
        tab.agent_active = false;
    }
    let next = registry
        .tabs
        .iter()
        .filter_map(|tab| tab.id.strip_prefix("browser-")?.parse::<u64>().ok())
        .max()
        .unwrap_or(0)
        + 1;
    registry.next_tab = registry.next_tab.max(next);
}

/// The in-page annotator, injected into every page before its own scripts run. It is dormant until
/// `browser_annotate` switches it on. Note what is *not* here: any way for the page to call the
/// app. Data only ever leaves the page when we ask for it, which is what keeps a remote page from
/// reaching into Code2.
const ANNOTATE_JS: &str = include_str!("annotate.js");

/// A navigation the page made on its own (a link, a redirect, a form post). The address bar follows
/// these — the frontend can no longer assume the page is showing what it last asked for.
#[derive(Clone, serde::Serialize)]
struct NavPayload {
    label: String,
    url: String,
}

#[derive(Clone, serde::Serialize)]
struct TitlePayload {
    label: String,
    title: String,
}

fn parse(url: &str) -> Result<Url, String> {
    Url::parse(url).map_err(|e| format!("bad url {url}: {e}"))
}

fn window<R: Runtime>(app: &AppHandle<R>) -> Result<Window<R>, String> {
    app.get_window("main")
        .ok_or_else(|| "no main window".to_string())
}

fn emit_registry<R: Runtime>(app: &AppHandle<R>) {
    if let Some(state) = app.try_state::<BrowserState>() {
        let _ = app.emit("browser-registry", state.snapshot());
    }
}

/// Create the tab's webview if it doesn't exist yet, then place it and show it.
///
/// Idempotent by design: the panel calls this on mount, on tab switch and after any layout change,
/// and only the first call builds anything. An existing view is placed and shown but never
/// re-navigated — where the page *is* is the page's business (a link, a redirect, the back button),
/// and re-asserting the URL we last saw here would undo it.
pub fn browser_open<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, BrowserState>,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let target = parse(&url)?;
    state.ensure(&label, &url);

    if let Some(view) = app.get_webview(&label) {
        view.set_position(LogicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        view.set_size(LogicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
        return view.show().map_err(|e| e.to_string());
    }

    let win = window(&app)?;
    let nav_app = app.clone();
    let nav_label = label.clone();
    let title_app = app.clone();
    let title_label = label.clone();
    let popup_app = app.clone();
    let popup_label = label.clone();

    let load_app = app.clone();
    let load_label = label.clone();
    let download_app = app.clone();
    let download_label = label.clone();

    let builder = WebviewBuilder::new(&label, WebviewUrl::External(target))
        .devtools(true)
        .initialization_script(ANNOTATE_JS)
        // A fresh document means a fresh annotator, switched off. The panel re-arms it here rather
        // than on `on_navigation`, which fires before the new document exists.
        .on_page_load(move |_, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                if let Some(state) = load_app.try_state::<BrowserState>() {
                    state.update_url(&load_label, payload.url().as_str());
                }
                emit_registry(&load_app);
                let _ = load_app.emit(
                    "browser-load",
                    NavPayload {
                        label: load_label.clone(),
                        url: payload.url().to_string(),
                    },
                );
            }
        })
        .on_navigation(move |url| {
            if let Some(state) = nav_app.try_state::<BrowserState>() {
                state.update_url(&nav_label, url.as_str());
            }
            emit_registry(&nav_app);
            let _ = nav_app.emit(
                "browser-nav",
                NavPayload {
                    label: nav_label.clone(),
                    url: url.to_string(),
                },
            );
            true
        })
        .on_document_title_changed(move |_, title| {
            if let Some(state) = title_app.try_state::<BrowserState>() {
                state.update_title(&title_label, &title);
            }
            emit_registry(&title_app);
            let _ = title_app.emit(
                "browser-title",
                TitlePayload {
                    label: title_label.clone(),
                    title,
                },
            );
        })
        // `target="_blank"` and `window.open` would otherwise spawn a bare OS window with no
        // address bar and no way back. A browser opens those in a tab, so we hand the URL to the
        // panel and let it do exactly that.
        .on_new_window(move |url, _| {
            let _ = popup_app.emit(
                "browser-popup",
                NavPayload {
                    label: popup_label.clone(),
                    url: url.to_string(),
                },
            );
            NewWindowResponse::Deny
        })
        // No navigation may silently become a download. Agent actions grant exactly one token
        // after approval; every other request is cancelled and surfaced to the UI.
        .on_download(move |_, event| match event {
            DownloadEvent::Requested { .. } => {
                let allowed = download_app
                    .try_state::<BrowserState>()
                    .is_some_and(|state| state.consume_download(&download_label));
                if !allowed {
                    let _ = download_app.emit(
                        "browser-download-blocked",
                        serde_json::json!({ "label": download_label }),
                    );
                }
                allowed
            }
            _ => true,
        });

    win.add_child(
        builder,
        LogicalPosition::new(x, y),
        LogicalSize::new(width, height),
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// Follow the placeholder as the dock is resized or the window changes shape.
pub fn browser_bounds<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let Some(view) = app.get_webview(&label) else {
        return Ok(());
    };
    view.set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    view.set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())
}

pub fn browser_navigate<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, BrowserState>,
    label: String,
    url: String,
) -> Result<(), String> {
    let target = parse(&url)?;
    state.update_url(&label, &url);
    emit_registry(&app);
    let Some(view) = app.get_webview(&label) else {
        return Ok(());
    };
    view.navigate(target).map_err(|e| e.to_string())
}

/// Back, forward and hard reload. There is no native history API on `Webview`, but `eval` runs in
/// the page's main frame whatever its origin, and `history` is the same object the page's own
/// back button would use.
pub fn browser_history<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    delta: i32,
) -> Result<(), String> {
    let Some(view) = app.get_webview(&label) else {
        return Ok(());
    };
    view.eval(format!("history.go({delta})"))
        .map_err(|e| e.to_string())
}

pub fn browser_reload<R: Runtime>(app: AppHandle<R>, label: String) -> Result<(), String> {
    let Some(view) = app.get_webview(&label) else {
        return Ok(());
    };
    view.reload().map_err(|e| e.to_string())
}

/// Hide rather than close: the panel does this whenever the DOM needs the space (a menu is open,
/// another dock surface is showing), and the page has to survive it with its scroll position and
/// its state intact.
pub fn browser_visible<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    visible: bool,
) -> Result<(), String> {
    let Some(view) = app.get_webview(&label) else {
        return Ok(());
    };
    if visible {
        view.show().map_err(|e| e.to_string())
    } else {
        view.hide().map_err(|e| e.to_string())
    }
}

/// Page zoom, the real thing — a scale factor on the webview rather than a CSS transform on a box
/// we don't own.
pub fn browser_zoom<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    factor: f64,
) -> Result<(), String> {
    let Some(view) = app.get_webview(&label) else {
        return Ok(());
    };
    view.set_zoom(factor).map_err(|e| e.to_string())
}

/// Inspect the page in the browser panel — not the app's own UI, which is what the shared-webview
/// inspector used to give you.
pub fn browser_devtools<R: Runtime>(app: AppHandle<R>, label: String) {
    if let Some(view) = app.get_webview(&label) {
        view.open_devtools();
    }
}

pub fn browser_close<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, BrowserState>,
    label: String,
) -> Result<(), String> {
    // Closing from the visible UI is trusted human input and revokes any agent lease first.
    state.take_control(&label)?;
    state.close(&label, None)?;
    emit_registry(&app);
    let Some(view) = app.get_webview(&label) else {
        return Ok(());
    };
    view.close().map_err(|e| e.to_string())
}

pub fn browser_registry_snapshot(state: State<'_, BrowserState>) -> Vec<BrowserTab> {
    state.snapshot()
}

pub fn browser_registry_create<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, BrowserState>,
    url: String,
) -> BrowserTab {
    let tab = state.create(url, None);
    emit_registry(&app);
    tab
}

pub fn browser_take_control<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, BrowserState>,
    label: String,
) -> Result<(), String> {
    state.take_control(&label)?;
    state.select(&label, None)?;
    emit_registry(&app);
    Ok(())
}

pub fn browser_permissions(state: State<'_, BrowserState>) -> Vec<String> {
    state.permissions()
}

pub fn browser_revoke_permission(
    state: State<'_, BrowserState>,
    origin: String,
) -> Result<(), String> {
    if safe_origin(&origin).as_deref() != Some(origin.as_str()) {
        return Err("invalid browser origin".into());
    }
    state.revoke_origin(&origin);
    Ok(())
}

// ---- annotations -------------------------------------------------------------------------------

/// What `annotate.js` hands back for each committed note. Deliberately not `Annotation`: the page
/// doesn't know its own URL as far as we're concerned, and the app is the one that decides.
#[derive(Deserialize)]
struct PageNote {
    selector: String,
    #[serde(default)]
    text: String,
    #[serde(default)]
    note: String,
    #[serde(default)]
    styles: Vec<StyleChange>,
}

/// Arm or disarm the in-page annotator: element picking, the note card, and the live style edits.
pub fn browser_annotate<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    on: bool,
) -> Result<(), String> {
    let Some(view) = app.get_webview(&label) else {
        return Ok(());
    };
    view.eval(format!(
        "window.__codetwoAnnotate && window.__codetwoAnnotate.setMode({on})"
    ))
    .map_err(|e| e.to_string())
}

/// Ask the page for a value and wait for it. The only direction data crosses this boundary.
async fn ask<R: Runtime>(app: &AppHandle<R>, label: &str, js: &str) -> Result<String, String> {
    let Some(view) = app.get_webview(label) else {
        return Ok("null".into());
    };
    let (tx, rx) = tokio::sync::oneshot::channel();
    let tx = Mutex::new(Some(tx));
    view.eval_with_callback(js, move |res| {
        if let Ok(mut slot) = tx.lock() {
            if let Some(tx) = slot.take() {
                let _ = tx.send(res);
            }
        }
    })
    .map_err(|e| e.to_string())?;
    // A page that never answers must not hang the caller — the annotate bar polls this.
    match tokio::time::timeout(Duration::from_secs(3), rx).await {
        Ok(Ok(v)) => Ok(v),
        _ => Ok("null".into()),
    }
}

/// Everything annotated on the current page, as prompt-ready [`Annotation`]s.
pub async fn browser_annotations<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    url: String,
) -> Result<Vec<Annotation>, String> {
    let raw = ask(
        &app,
        &label,
        "(window.__codetwoAnnotate ? window.__codetwoAnnotate.list() : [])",
    )
    .await?;
    let page: Vec<PageNote> = serde_json::from_str(&raw).unwrap_or_default();
    Ok(page
        .into_iter()
        .map(|n| Annotation {
            url: url.clone(),
            note: n.note,
            selector: Some(n.selector),
            selected_text: (!n.text.is_empty()).then_some(n.text),
            styles: n.styles,
        })
        .collect())
}

/// How many notes are pending, for the badge. Cheaper than pulling them all on a poll.
pub async fn browser_annotation_count<R: Runtime>(
    app: AppHandle<R>,
    label: String,
) -> Result<usize, String> {
    let raw = ask(
        &app,
        &label,
        "(window.__codetwoAnnotate ? window.__codetwoAnnotate.count() : 0)",
    )
    .await?;
    Ok(raw.parse().unwrap_or(0))
}

/// Drop the notes and put the page's styles back the way they were.
pub fn browser_annotations_clear<R: Runtime>(
    app: AppHandle<R>,
    label: String,
) -> Result<(), String> {
    let Some(view) = app.get_webview(&label) else {
        return Ok(());
    };
    view.eval("window.__codetwoAnnotate && window.__codetwoAnnotate.clear()")
        .map_err(|e| e.to_string())
}

/// Close every browser webview at once — the panel's unmount path, where the tab list is already
/// gone and labels can no longer be enumerated from the frontend.
pub fn browser_close_all<R: Runtime>(app: AppHandle<R>) {
    for (label, view) in app.webviews() {
        if label.starts_with("browser-") {
            let _ = view.close();
        }
    }
}

fn take_args<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, PluginError> {
    let value = if value.is_null() {
        Value::Object(Default::default())
    } else {
        value
    };
    serde_json::from_value(value)
        .map_err(|error| PluginError::new(format!("bad arguments: {error}")))
}

fn json<T: Serialize>(value: T) -> Result<Value, PluginError> {
    serde_json::to_value(value).map_err(PluginError::new)
}

fn result<T: Serialize>(value: Result<T, String>) -> Result<Value, PluginError> {
    json(value.map_err(PluginError::new)?)
}

#[async_trait]
impl Plugin for BrowserPlugin {
    fn name(&self) -> &str {
        "browser"
    }

    fn description(&self) -> Option<&str> {
        Some("Native browser webviews, tab state, permissions and annotations.")
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        ctx.provide(Arc::new(BrowserHostService))?;
        let cleanup_app = self.app.clone();
        let cleanup_socket = self.socket_path.clone();
        ctx.effect(move || {
            browser_close_all(cleanup_app);
            let _ = std::fs::remove_file(cleanup_socket);
        });
        let broker_app = self.app.clone();
        let broker_socket = self.socket_path.clone();
        let broker_key = self.master_key.clone();
        let broker_scope = ctx.weak();
        ctx.spawn(async move {
            if let Err(error) =
                start_broker(broker_app, broker_socket, broker_key, broker_scope).await
            {
                eprintln!("CodeTwo Browser broker stopped: {error}");
            }
        });

        #[derive(Deserialize)]
        struct OpenArgs {
            label: String,
            url: String,
            x: f64,
            y: f64,
            width: f64,
            height: f64,
        }
        let app = self.app.clone();
        ctx.command("browser.open", move |args| {
            let app = app.clone();
            async move {
                let args: OpenArgs = take_args(args)?;
                let state = app.state::<BrowserState>();
                result(browser_open(
                    app.clone(),
                    state,
                    args.label,
                    args.url,
                    args.x,
                    args.y,
                    args.width,
                    args.height,
                ))
            }
        })?;

        #[derive(Deserialize)]
        struct BoundsArgs {
            label: String,
            x: f64,
            y: f64,
            width: f64,
            height: f64,
        }
        let app = self.app.clone();
        ctx.command("browser.bounds", move |args| {
            let app = app.clone();
            async move {
                let args: BoundsArgs = take_args(args)?;
                result(browser_bounds(
                    app,
                    args.label,
                    args.x,
                    args.y,
                    args.width,
                    args.height,
                ))
            }
        })?;

        #[derive(Deserialize)]
        struct NavigateArgs {
            label: String,
            url: String,
        }
        let app = self.app.clone();
        ctx.command("browser.navigate", move |args| {
            let app = app.clone();
            async move {
                let args: NavigateArgs = take_args(args)?;
                let state = app.state::<BrowserState>();
                result(browser_navigate(app.clone(), state, args.label, args.url))
            }
        })?;

        #[derive(Deserialize)]
        struct HistoryArgs {
            label: String,
            delta: i32,
        }
        let app = self.app.clone();
        ctx.command("browser.history", move |args| {
            let app = app.clone();
            async move {
                let args: HistoryArgs = take_args(args)?;
                result(browser_history(app, args.label, args.delta))
            }
        })?;

        #[derive(Deserialize)]
        struct LabelArgs {
            label: String,
        }
        let app = self.app.clone();
        ctx.command("browser.reload", move |args| {
            let app = app.clone();
            async move {
                let args: LabelArgs = take_args(args)?;
                result(browser_reload(app, args.label))
            }
        })?;

        #[derive(Deserialize)]
        struct VisibleArgs {
            label: String,
            visible: bool,
        }
        let app = self.app.clone();
        ctx.command("browser.visible", move |args| {
            let app = app.clone();
            async move {
                let args: VisibleArgs = take_args(args)?;
                result(browser_visible(app, args.label, args.visible))
            }
        })?;

        #[derive(Deserialize)]
        struct ZoomArgs {
            label: String,
            factor: f64,
        }
        let app = self.app.clone();
        ctx.command("browser.zoom", move |args| {
            let app = app.clone();
            async move {
                let args: ZoomArgs = take_args(args)?;
                result(browser_zoom(app, args.label, args.factor))
            }
        })?;

        let app = self.app.clone();
        ctx.command("browser.devtools", move |args| {
            let app = app.clone();
            async move {
                let args: LabelArgs = take_args(args)?;
                browser_devtools(app, args.label);
                Ok(Value::Null)
            }
        })?;

        let app = self.app.clone();
        ctx.command("browser.close", move |args| {
            let app = app.clone();
            async move {
                let args: LabelArgs = take_args(args)?;
                let state = app.state::<BrowserState>();
                result(browser_close(app.clone(), state, args.label))
            }
        })?;

        let app = self.app.clone();
        ctx.command("browser.close_all", move |_| {
            let app = app.clone();
            async move {
                browser_close_all(app);
                Ok(Value::Null)
            }
        })?;

        let app = self.app.clone();
        ctx.command("browser.tabs", move |_| {
            let app = app.clone();
            async move { json(browser_registry_snapshot(app.state::<BrowserState>())) }
        })?;

        #[derive(Deserialize)]
        struct CreateArgs {
            url: String,
        }
        let app = self.app.clone();
        ctx.command("browser.create_tab", move |args| {
            let app = app.clone();
            async move {
                let args: CreateArgs = take_args(args)?;
                let state = app.state::<BrowserState>();
                json(browser_registry_create(app.clone(), state, args.url))
            }
        })?;

        let app = self.app.clone();
        ctx.command("browser.take_control", move |args| {
            let app = app.clone();
            async move {
                let args: LabelArgs = take_args(args)?;
                let state = app.state::<BrowserState>();
                result(browser_take_control(app.clone(), state, args.label))
            }
        })?;

        let app = self.app.clone();
        ctx.command("browser.permissions", move |_| {
            let app = app.clone();
            async move { json(browser_permissions(app.state::<BrowserState>())) }
        })?;

        #[derive(Deserialize)]
        struct OriginArgs {
            origin: String,
        }
        let app = self.app.clone();
        ctx.command("browser.revoke_permission", move |args| {
            let app = app.clone();
            async move {
                let args: OriginArgs = take_args(args)?;
                result(browser_revoke_permission(
                    app.state::<BrowserState>(),
                    args.origin,
                ))
            }
        })?;

        #[derive(Deserialize)]
        struct AnnotateArgs {
            label: String,
            on: bool,
        }
        let app = self.app.clone();
        ctx.command("browser.annotate", move |args| {
            let app = app.clone();
            async move {
                let args: AnnotateArgs = take_args(args)?;
                result(browser_annotate(app, args.label, args.on))
            }
        })?;

        #[derive(Deserialize)]
        struct AnnotationsArgs {
            label: String,
            url: String,
        }
        let app = self.app.clone();
        ctx.command("browser.annotations", move |args| {
            let app = app.clone();
            async move {
                let args: AnnotationsArgs = take_args(args)?;
                json(
                    browser_annotations(app, args.label, args.url)
                        .await
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        let app = self.app.clone();
        ctx.command("browser.annotation_count", move |args| {
            let app = app.clone();
            async move {
                let args: LabelArgs = take_args(args)?;
                json(
                    browser_annotation_count(app, args.label)
                        .await
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        let app = self.app.clone();
        ctx.command("browser.clear_annotations", move |args| {
            let app = app.clone();
            async move {
                let args: LabelArgs = take_args(args)?;
                result(browser_annotations_clear(app, args.label))
            }
        })?;

        #[derive(Deserialize)]
        struct ContextArgs {
            annotation: Annotation,
        }
        ctx.command("browser.context", move |args| async move {
            let args: ContextArgs = take_args(args)?;
            json(args.annotation.to_context())
        })?;

        let app = self.app.clone();
        ctx.command("desktop.open_devtools", move |_| {
            let app = app.clone();
            async move {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
                Ok(Value::Null)
            }
        })?;

        Ok(())
    }
}

// ---- agent controller ------------------------------------------------------------------------

const DOM_SNAPSHOT_JS: &str = r#"JSON.stringify((() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const selector = 'a,button,input,textarea,select,[role],[tabindex],summary,[contenteditable="true"]';
  const interactive = Array.from(document.querySelectorAll(selector)).filter(visible);
  const nodes = interactive.slice(0, 2000).map((el, index) => ({
    id: `n${index}`,
    role: (el.getAttribute('role') || el.tagName || '').toLowerCase(),
    name: (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || '').trim().slice(0, 512),
    type: (el.getAttribute('type') || '').toLowerCase(),
    disabled: !!el.disabled,
  }));
  const text = (document.body?.innerText || '').slice(0, 131072);
  return { title: document.title.slice(0, 512), text, nodes };
})())"#;

const NODE_LIST_JS: &str = r#"Array.from(document.querySelectorAll('a,button,input,textarea,select,[role],[tabindex],summary,[contenteditable="true"]')).filter((el) => { const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; })"#;

fn node_index(node_id: &str) -> Result<usize, String> {
    let id = node_id
        .strip_prefix('n')
        .ok_or_else(|| "invalid browser node id".to_string())?;
    let index = id
        .parse::<usize>()
        .map_err(|_| "invalid browser node id".to_string())?;
    (index < 2_000)
        .then_some(index)
        .ok_or_else(|| "browser node id is out of range".to_string())
}

fn bounded_snapshot(mut value: String) -> (String, bool) {
    const LIMIT: usize = 256 * 1024;
    if value.len() <= LIMIT {
        return (value, false);
    }
    let mut end = LIMIT;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    value.truncate(end);
    (value, true)
}

#[derive(Clone)]
pub struct AppBrowserController {
    app: AppHandle,
}

impl AppBrowserController {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    fn state(&self) -> Result<State<'_, BrowserState>, String> {
        self.app
            .try_state::<BrowserState>()
            .ok_or_else(|| "browser registry unavailable".to_string())
    }

    /// Agent-created tabs are rendered by the React browser panel after it receives the registry
    /// event.  That handoff is asynchronous, so an immediate navigate/inspect must tolerate the
    /// short interval before the matching WKWebView exists.
    async fn wait_until_rendered(&self, label: &str) -> Result<(), String> {
        for _ in 0..40 {
            if self.app.get_webview(label).is_some() {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        Err("browser tab did not render within 2 seconds".into())
    }

    async fn describe_node(&self, label: &str, node_id: &str) -> Result<serde_json::Value, String> {
        self.wait_until_rendered(label).await?;
        let index = node_index(node_id)?;
        let js = format!(
            "JSON.stringify((() => {{ const el=({NODE_LIST_JS})[{index}]; if(!el) return null; return {{ tag:(el.tagName||'').toLowerCase(), role:(el.getAttribute('role')||'').toLowerCase(), type:(el.getAttribute('type')||'').toLowerCase(), name:(el.getAttribute('name')||'').toLowerCase(), autocomplete:(el.getAttribute('autocomplete')||'').toLowerCase(), text:(el.getAttribute('aria-label')||el.innerText||el.value||'').trim().slice(0,512), download:el.hasAttribute('download') }}; }})())"
        );
        let raw = ask(&self.app, label, &js).await?;
        serde_json::from_str(&raw).map_err(|_| "browser node is no longer available".into())
    }

    async fn describe_point(
        &self,
        label: &str,
        x: f64,
        y: f64,
    ) -> Result<serde_json::Value, String> {
        self.wait_until_rendered(label).await?;
        if !x.is_finite() || !y.is_finite() {
            return Err("invalid click coordinates".into());
        }
        let js = format!(
            "JSON.stringify((() => {{ const el=document.elementFromPoint({x},{y}); if(!el) return null; return {{ tag:(el.tagName||'').toLowerCase(), role:(el.getAttribute('role')||'').toLowerCase(), type:(el.getAttribute('type')||'').toLowerCase(), name:(el.getAttribute('name')||'').toLowerCase(), autocomplete:(el.getAttribute('autocomplete')||'').toLowerCase(), text:(el.getAttribute('aria-label')||el.innerText||el.value||'').trim().slice(0,512), download:el.hasAttribute('download') }}; }})())"
        );
        let raw = ask(&self.app, label, &js).await?;
        serde_json::from_str(&raw).map_err(|_| "no browser element at that point".into())
    }

    async fn screenshot(&self, label: &str) -> Result<Vec<u8>, String> {
        #[cfg(target_os = "macos")]
        {
            use block2::RcBlock;
            use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
            use objc2_foundation::NSError;
            use objc2_web_kit::WKWebView;

            let Some(view) = self.app.get_webview(label) else {
                return Err("browser tab is not rendered yet".into());
            };
            let (tx, rx) = tokio::sync::oneshot::channel::<Result<Vec<u8>, String>>();
            let tx = Mutex::new(Some(tx));
            view.with_webview(move |platform| unsafe {
                let webview: &WKWebView = &*platform.inner().cast();
                let handler = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
                    let result = if !error.is_null() {
                        Err((*error).localizedDescription().to_string())
                    } else if image.is_null() {
                        Err("WKWebView returned no snapshot".into())
                    } else {
                        (*image)
                            .TIFFRepresentation()
                            .and_then(|data| NSBitmapImageRep::imageRepWithData(&data))
                            .and_then(|rep| {
                                let properties = objc2_foundation::NSDictionary::new();
                                rep.representationUsingType_properties(
                                    NSBitmapImageFileType::PNG,
                                    &properties,
                                )
                            })
                            .map(|data| data.to_vec())
                            .ok_or_else(|| "could not encode browser snapshot as PNG".into())
                    };
                    if let Ok(mut sender) = tx.lock() {
                        if let Some(sender) = sender.take() {
                            let _ = sender.send(result);
                        }
                    }
                });
                webview.takeSnapshotWithConfiguration_completionHandler(None, &handler);
            })
            .map_err(|error| error.to_string())?;
            return match tokio::time::timeout(Duration::from_secs(10), rx).await {
                Ok(Ok(result)) => result,
                _ => Err("browser screenshot timed out".into()),
            };
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = label;
            Err("browser screenshots are only available on macOS".into())
        }
    }
}

#[async_trait::async_trait]
impl codetwo_core::browser::BrowserController for AppBrowserController {
    async fn tabs(
        &self,
        command: codetwo_core::browser::TabCommand,
    ) -> Result<Vec<BrowserTab>, String> {
        use codetwo_core::browser::TabCommand;
        let state = self.state()?;
        match command {
            TabCommand::List => {}
            TabCommand::Create { url, session_id } => {
                let tab = state.create(url, session_id.as_deref());
                let _ = self.app.emit(
                    "browser-agent-activity",
                    serde_json::json!({ "tabId": tab.id }),
                );
            }
            TabCommand::Select { tab_id, session_id } => {
                state.select(&tab_id, session_id.as_deref())?;
                let _ = self.app.emit(
                    "browser-agent-activity",
                    serde_json::json!({ "tabId": tab_id }),
                );
            }
            TabCommand::Close { tab_id } => {
                state.close(&tab_id, None)?;
                if let Some(view) = self.app.get_webview(&tab_id) {
                    let _ = view.close();
                }
            }
            TabCommand::TakeControl { tab_id } => state.take_control(&tab_id)?,
        }
        emit_registry(&self.app);
        Ok(state.snapshot())
    }

    async fn inspect(
        &self,
        tab_id: &str,
        request: codetwo_core::browser::InspectRequest,
    ) -> Result<codetwo_core::browser::BrowserInspection, String> {
        use codetwo_core::browser::{
            BrowserInspection, BrowserScreenshot, BrowserSnapshot, InspectRequest,
        };
        let state = self.state()?;
        let tab = state
            .tab(tab_id)
            .ok_or_else(|| "browser tab not found".to_string())?;
        self.wait_until_rendered(tab_id).await?;
        match request {
            InspectRequest::DomSnapshot => {
                let raw = ask(&self.app, tab_id, DOM_SNAPSHOT_JS).await?;
                let (content, truncated) = bounded_snapshot(raw);
                Ok(BrowserInspection::Snapshot(BrowserSnapshot {
                    url: tab.url,
                    title: tab.title,
                    content,
                    truncated,
                }))
            }
            InspectRequest::Screenshot => {
                use base64::Engine as _;
                let png = self.screenshot(tab_id).await?;
                Ok(BrowserInspection::Screenshot(BrowserScreenshot {
                    mime_type: "image/png".into(),
                    data_base64: base64::engine::general_purpose::STANDARD.encode(png),
                }))
            }
        }
    }

    async fn act(
        &self,
        tab_id: &str,
        action: codetwo_core::browser::BrowserAction,
    ) -> Result<codetwo_core::browser::BrowserActionResult, String> {
        use codetwo_core::browser::{BrowserAction, BrowserActionResult};
        let state = self.state()?;
        let tab = state
            .tab(tab_id)
            .ok_or_else(|| "browser tab not found".to_string())?;
        if !matches!(&action, BrowserAction::Navigate { .. }) {
            self.wait_until_rendered(tab_id).await?;
        }
        match action {
            BrowserAction::Navigate { url } => {
                let target = parse(&url)?;
                // A blank tab deliberately has no native view. Publish the destination first so
                // the Browser panel creates one, then wait for that asynchronous render handoff.
                state.update_url(tab_id, &url);
                emit_registry(&self.app);
                self.wait_until_rendered(tab_id).await?;
                let view = self
                    .app
                    .get_webview(tab_id)
                    .ok_or_else(|| "browser tab disappeared before navigation".to_string())?;
                view.navigate(target).map_err(|error| error.to_string())?;
            }
            BrowserAction::ClickNode { node_id } => {
                let index = node_index(&node_id)?;
                let js = format!(
                    "(() => {{ const el=({NODE_LIST_JS})[{index}]; if(!el) return false; el.click(); return true; }})()"
                );
                let result = ask(&self.app, tab_id, &js).await?;
                if result != "true" {
                    return Err("browser node is no longer available".into());
                }
            }
            BrowserAction::ClickPoint { x, y } => {
                if !x.is_finite() || !y.is_finite() {
                    return Err("invalid click coordinates".into());
                }
                let js = format!(
                    "(() => {{ const el=document.elementFromPoint({x},{y}); if(!el) return false; el.click(); return true; }})()"
                );
                if ask(&self.app, tab_id, &js).await? != "true" {
                    return Err("no browser element at that point".into());
                }
            }
            BrowserAction::Input { node_id, text } => {
                let index = node_index(&node_id)?;
                let value = serde_json::to_string(&text).map_err(|error| error.to_string())?;
                let js = format!(
                    "(() => {{ const el=({NODE_LIST_JS})[{index}]; if(!el || !('value' in el)) return false; el.focus(); el.value={value}; el.dispatchEvent(new Event('input',{{bubbles:true}})); el.dispatchEvent(new Event('change',{{bubbles:true}})); return true; }})()"
                );
                if ask(&self.app, tab_id, &js).await? != "true" {
                    return Err("browser input is no longer available".into());
                }
            }
            BrowserAction::Key { key } => {
                const KEYS: [&str; 10] = [
                    "Enter",
                    "Escape",
                    "Tab",
                    "Backspace",
                    "ArrowUp",
                    "ArrowDown",
                    "ArrowLeft",
                    "ArrowRight",
                    "PageUp",
                    "PageDown",
                ];
                if !KEYS.contains(&key.as_str()) {
                    return Err("browser key is not allowed".into());
                }
                let key = serde_json::to_string(&key).map_err(|error| error.to_string())?;
                let js = format!(
                    "(() => {{ const el=document.activeElement||document.body; for(const type of ['keydown','keyup']) el.dispatchEvent(new KeyboardEvent(type,{{key:{key},bubbles:true}})); return true; }})()"
                );
                let _ = ask(&self.app, tab_id, &js).await?;
            }
            BrowserAction::Scroll { delta_x, delta_y } => {
                if !delta_x.is_finite() || !delta_y.is_finite() {
                    return Err("invalid scroll distance".into());
                }
                let js = format!(
                    "window.scrollBy({{left:{delta_x},top:{delta_y},behavior:'instant'}}); true"
                );
                let _ = ask(&self.app, tab_id, &js).await?;
            }
            BrowserAction::Drag {
                from_x,
                from_y,
                to_x,
                to_y,
            } => {
                if ![from_x, from_y, to_x, to_y].iter().all(|v| v.is_finite()) {
                    return Err("invalid drag coordinates".into());
                }
                let js = format!(
                    "(() => {{ const el=document.elementFromPoint({from_x},{from_y}); if(!el) return false; for(const [type,x,y] of [['mousedown',{from_x},{from_y}],['mousemove',{to_x},{to_y}],['mouseup',{to_x},{to_y}]]) el.dispatchEvent(new MouseEvent(type,{{clientX:x,clientY:y,bubbles:true,buttons:type==='mouseup'?0:1}})); return true; }})()"
                );
                if ask(&self.app, tab_id, &js).await? != "true" {
                    return Err("no browser element at drag start".into());
                }
            }
            BrowserAction::History { delta } => {
                if !(-1..=1).contains(&delta) || delta == 0 {
                    return Err("browser history delta must be -1 or 1".into());
                }
                let view = self
                    .app
                    .get_webview(tab_id)
                    .ok_or_else(|| "browser tab is not rendered yet".to_string())?;
                view.eval(format!("history.go({delta})"))
                    .map_err(|error| error.to_string())?;
            }
            BrowserAction::Reload => {
                let view = self
                    .app
                    .get_webview(tab_id)
                    .ok_or_else(|| "browser tab is not rendered yet".to_string())?;
                view.reload().map_err(|error| error.to_string())?;
            }
        }
        emit_registry(&self.app);
        let url = state.tab(tab_id).map(|tab| tab.url).unwrap_or(tab.url);
        Ok(BrowserActionResult {
            message: "browser action completed".into(),
            url,
        })
    }
}

fn node_risk(value: &serde_json::Value, input: bool) -> codetwo_core::browser::BrowserRisk {
    use codetwo_core::browser::BrowserRisk;
    let get = |key: &str| {
        value
            .get(key)
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
    };
    if get("type") == "file" {
        return BrowserRisk::FileUpload;
    }
    let joined = format!(
        "{} {} {} {} {}",
        get("tag"),
        get("role"),
        get("type"),
        get("name"),
        get("autocomplete")
    )
    .to_ascii_lowercase();
    if input
        && (joined.contains("password")
            || joined.contains("one-time-code")
            || joined.contains("otp")
            || joined.contains("cc-number")
            || joined.contains("credit-card")
            || joined.contains("payment"))
    {
        return BrowserRisk::SensitiveAction;
    }
    if value
        .get("download")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
    {
        return BrowserRisk::Download;
    }
    let text = format!("{} {}", get("text"), joined).to_ascii_lowercase();
    const SENSITIVE: [&str; 18] = [
        "submit",
        "buy",
        "purchase",
        "checkout",
        "pay",
        "send",
        "publish",
        "delete",
        "remove",
        "sign in",
        "log in",
        "create account",
        "permission",
        "grant",
        "authorize",
        "download",
        "transfer",
        "confirm",
    ];
    if get("type") == "submit" || SENSITIVE.iter().any(|word| text.contains(word)) {
        BrowserRisk::SensitiveAction
    } else {
        BrowserRisk::None
    }
}

#[derive(Debug, Deserialize)]
struct BrokerRequest {
    session: String,
    key: String,
    method: String,
    #[serde(default)]
    params: serde_json::Value,
    #[serde(default)]
    approved: bool,
    #[serde(default)]
    approval_scope: Option<String>,
}

#[derive(Debug, Serialize)]
struct BrokerApproval {
    kind: String,
    title: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    origin: Option<String>,
}

#[derive(Debug, Serialize)]
struct BrokerResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    approval: Option<BrokerApproval>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AutoSceneChanged {
    session: String,
    reference: String,
    title: String,
    reason: String,
    pending: Vec<String>,
    plan_first: Option<bool>,
    memory_read: codetwo_core::MemoryAccess,
    memory_write: codetwo_core::MemoryAccess,
}

#[derive(Deserialize)]
struct AutoSceneEscalation {
    from: String,
    to: String,
}

#[derive(Deserialize)]
struct AutoSceneApplyOutcome {
    pending: Vec<String>,
    escalation: Option<AutoSceneEscalation>,
    plan_first: Option<bool>,
}

impl BrokerResponse {
    fn result(value: impl Serialize) -> Self {
        Self {
            ok: true,
            result: serde_json::to_value(value).ok(),
            error: None,
            approval: None,
        }
    }

    fn error(error: impl Into<String>) -> Self {
        Self {
            ok: false,
            result: None,
            error: Some(error.into()),
            approval: None,
        }
    }

    fn approval(kind: &str, title: &str, message: &str, origin: Option<String>) -> Self {
        Self {
            ok: false,
            result: None,
            error: None,
            approval: Some(BrokerApproval {
                kind: kind.into(),
                title: title.into(),
                message: message.into(),
                origin,
            }),
        }
    }
}

fn expected_session_key(master_key: &str, session: &str) -> String {
    blake3::hash(format!("codetwo-browser\0{master_key}\0{session}").as_bytes())
        .to_hex()
        .to_string()
}

fn secure_eq(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.as_bytes()
        .iter()
        .zip(right.as_bytes())
        .fold(0u8, |difference, (left, right)| difference | (left ^ right))
        == 0
}

async fn dispatch_broker(
    controller: &AppBrowserController,
    master_key: &str,
    request: BrokerRequest,
) -> BrokerResponse {
    use codetwo_core::browser::{BrowserAction, BrowserController, InspectRequest, TabCommand};
    if request.session.is_empty()
        || !secure_eq(
            &request.key,
            &expected_session_key(master_key, &request.session),
        )
    {
        return BrokerResponse::error("browser broker authentication failed");
    }
    let state = match controller.state() {
        Ok(state) => state,
        Err(error) => return BrokerResponse::error(error),
    };
    let params = &request.params;
    let response: Result<serde_json::Value, String> = async {
        match request.method.as_str() {
            "scene_select" => {
                let reference = required_string(params, "reference")?;
                let reason = required_string(params, "reason")?
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ");
                if reason.is_empty() {
                    return Err("reason is required".into());
                }
                let reason: String = reason.chars().take(240).collect();
                let app_state = controller.app.state::<crate::AppState>();
                let store = app_state
                    .core
                    .service::<codetwo_core::app::StoreService>()
                    .ok_or_else(|| "store plugin is unavailable".to_string())?;
                if !store
                    .session_auto_scene(&request.session)
                    .map_err(|error| error.to_string())?
                {
                    return Err("Auto Scene is not enabled for this session".into());
                }
                let (canonical, title, instructions) = {
                    let scenes = app_state
                        .core
                        .service::<codetwo_core::app::SceneService>()
                        .ok_or_else(|| "scenes plugin is unavailable".to_string())?
                        .library();
                    let entry = scenes
                        .resolve(&reference)
                        .ok_or_else(|| format!("unknown scene `{reference}`"))?;
                    (
                        codetwo_core::SceneLibrary::reference_for(entry),
                        entry.scene.title.clone(),
                        codetwo_core::scene::prompt_preamble(&entry.scene, &[]),
                    )
                };
                let current = store
                    .session_scene(&request.session)
                    .map_err(|error| error.to_string())?
                    .and_then(|(reference, _)| {
                        let scenes = app_state
                            .core
                            .service::<codetwo_core::app::SceneService>()?
                            .library();
                        scenes
                            .resolve(&reference)
                            .map(codetwo_core::SceneLibrary::reference_for)
                    });
                let (changed, pending, plan_first) = if current.as_deref() == Some(&canonical) {
                    (false, Vec::new(), None)
                } else {
                    let outcome: AutoSceneApplyOutcome = serde_json::from_value(
                        app_state
                            .core
                            .call(
                                "scenes.apply",
                                serde_json::json!({
                                    "session": request.session.clone(),
                                    "reference": canonical.clone(),
                                    "confirm_escalation": request.approved,
                                }),
                            )
                            .await
                            .map_err(|error| error.to_string())?,
                    )
                    .map_err(|error| error.to_string())?;
                    if let Some(escalation) = outcome.escalation {
                        return Err(format!(
                            "approval:scene:{}:{}:{}",
                            escalation.from, escalation.to, title
                        ));
                    }
                    (true, outcome.pending, outcome.plan_first)
                };
                let (memory_read, memory_write) = store
                    .session_memory_policy(&request.session)
                    .map_err(|error| error.to_string())?;
                if changed {
                    let _ = controller.app.emit(
                        "auto-scene-changed",
                        AutoSceneChanged {
                            session: request.session.clone(),
                            reference: canonical.clone(),
                            title: title.clone(),
                            reason: reason.clone(),
                            pending: pending.clone(),
                            plan_first,
                            memory_read,
                            memory_write,
                        },
                    );
                }
                Ok(serde_json::json!({
                    "selected": canonical,
                    "title": title,
                    "reason": reason,
                    "changed": changed,
                    "pending": pending,
                    "instructions": instructions,
                    "message": if changed {
                        "Scene applied. Follow `instructions` for the current turn."
                    } else {
                        "Scene already active. Continue following `instructions`."
                    }
                }))
            }
            "browser_tabs" => {
                let command = params
                    .get("command")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("list");
                let command = match command {
                    "list" => TabCommand::List,
                    "create" => {
                        let url = params
                            .get("url")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or(BLANK_URL)
                            .to_string();
                        if url != BLANK_URL {
                            let origin = safe_origin(&url).ok_or_else(|| {
                                "only HTTP(S) browser URLs are allowed".to_string()
                            })?;
                            if !request.approved && !state.origin_allowed(&origin) {
                                return Err(format!("approval:origin:{origin}"));
                            }
                            if request.approval_scope.as_deref() == Some("permanent") {
                                state.allow_origin_permanently(&origin);
                            }
                        }
                        TabCommand::Create {
                            url,
                            session_id: Some(request.session.clone()),
                        }
                    }
                    "select" => TabCommand::Select {
                        tab_id: required_string(params, "tabId")?,
                        session_id: Some(request.session.clone()),
                    },
                    "close" => {
                        let tab_id = required_string(params, "tabId")?;
                        state.ensure_lease(&tab_id, &request.session)?;
                        state.close(&tab_id, Some(&request.session))?;
                        if let Some(view) = controller.app.get_webview(&tab_id) {
                            let _ = view.close();
                        }
                        emit_registry(&controller.app);
                        return serde_json::to_value(state.snapshot()).map_err(|e| e.to_string());
                    }
                    _ => return Err("unknown browser tab command".into()),
                };
                serde_json::to_value(controller.tabs(command).await?).map_err(|e| e.to_string())
            }
            "browser_navigate" => {
                let tab_id = required_string(params, "tabId")?;
                let url = required_string(params, "url")?;
                state.ensure_lease(&tab_id, &request.session)?;
                let origin = safe_origin(&url)
                    .ok_or_else(|| "only HTTP(S) browser URLs are allowed".to_string())?;
                if !request.approved && !state.origin_allowed(&origin) {
                    return Err(format!("approval:origin:{origin}"));
                }
                if request.approval_scope.as_deref() == Some("permanent") {
                    state.allow_origin_permanently(&origin);
                }
                serde_json::to_value(
                    controller
                        .act(&tab_id, BrowserAction::Navigate { url })
                        .await?,
                )
                .map_err(|e| e.to_string())
            }
            "browser_snapshot" => {
                let tab_id = required_string(params, "tabId")?;
                state.ensure_lease(&tab_id, &request.session)?;
                let request_kind = match params
                    .get("kind")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("dom")
                {
                    "dom" => InspectRequest::DomSnapshot,
                    "screenshot" => InspectRequest::Screenshot,
                    _ => return Err("unknown browser snapshot kind".into()),
                };
                serde_json::to_value(controller.inspect(&tab_id, request_kind).await?)
                    .map_err(|e| e.to_string())
            }
            "browser_act" => {
                let tab_id = required_string(params, "tabId")?;
                state.ensure_lease(&tab_id, &request.session)?;
                let action: BrowserAction = serde_json::from_value(
                    params
                        .get("action")
                        .cloned()
                        .ok_or_else(|| "browser action is required".to_string())?,
                )
                .map_err(|e| format!("invalid browser action: {e}"))?;
                let risk = match &action {
                    BrowserAction::ClickNode { node_id } => {
                        node_risk(&controller.describe_node(&tab_id, node_id).await?, false)
                    }
                    BrowserAction::Input { node_id, .. } => {
                        node_risk(&controller.describe_node(&tab_id, node_id).await?, true)
                    }
                    BrowserAction::ClickPoint { x, y } => {
                        node_risk(&controller.describe_point(&tab_id, *x, *y).await?, false)
                    }
                    BrowserAction::Key { key } if key == "Enter" => {
                        codetwo_core::browser::BrowserRisk::SensitiveAction
                    }
                    _ => codetwo_core::browser::BrowserRisk::None,
                };
                match risk {
                    codetwo_core::browser::BrowserRisk::FileUpload => {
                        return Err("file upload requires user takeover".into())
                    }
                    codetwo_core::browser::BrowserRisk::Download if !request.approved => {
                        return Err("approval:download".into())
                    }
                    codetwo_core::browser::BrowserRisk::SensitiveAction if !request.approved => {
                        return Err("approval:sensitive".into())
                    }
                    codetwo_core::browser::BrowserRisk::Download => {
                        state.permit_download_once(&tab_id)
                    }
                    _ => {}
                }
                serde_json::to_value(controller.act(&tab_id, action).await?)
                    .map_err(|e| e.to_string())
            }
            "browser_finalize" => {
                let tab_id = required_string(params, "tabId")?;
                state.ensure_lease(&tab_id, &request.session)?;
                state.take_control(&tab_id)?;
                emit_registry(&controller.app);
                Ok(serde_json::json!({ "finalized": true, "tabId": tab_id }))
            }
            _ => Err("unknown browser broker method".into()),
        }
    }
    .await;
    match response {
        Ok(value) => BrokerResponse::result(value),
        Err(error) if error.starts_with("approval:origin:") => {
            let origin = error.trim_start_matches("approval:origin:").to_string();
            BrokerResponse::approval(
                "website_access",
                "Website access",
                "Allow the agent to access this website origin?",
                Some(origin),
            )
        }
        Err(error) if error == "approval:download" => BrokerResponse::approval(
            "download",
            "Confirm browser download",
            "Allow this download once?",
            None,
        ),
        Err(error) if error == "approval:sensitive" => BrokerResponse::approval(
            "sensitive_web_action",
            "Confirm browser action",
            "Allow this sensitive web action once?",
            None,
        ),
        Err(error) if error.starts_with("approval:scene:") => {
            let mut parts = error.splitn(5, ':');
            let _approval = parts.next();
            let _scene = parts.next();
            let from = parts.next().unwrap_or("current mode");
            let to = parts.next().unwrap_or("a looser mode");
            let title = parts.next().unwrap_or("the selected scene");
            BrokerResponse::approval(
                "scene_escalation",
                "Allow looser scene permissions?",
                &format!(
                    "The agent wants to switch to “{title}”, which raises this session from {from} to {to}. Allow this switch once?"
                ),
                None,
            )
        }
        Err(error) => BrokerResponse::error(error),
    }
}

fn required_string(value: &serde_json::Value, key: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty() && value.len() <= 8_192)
        .map(str::to_string)
        .ok_or_else(|| format!("{key} is required"))
}

/// Start the per-launch authenticated Unix-socket broker. The socket is owner-only and accepts
/// only per-session keys derived by the desktop process.
#[cfg(unix)]
pub async fn start_broker(
    app: AppHandle,
    socket_path: PathBuf,
    master_key: String,
    scope: WeakContext,
) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::UnixListener;

    if socket_path.exists() {
        std::fs::remove_file(&socket_path).map_err(|error| error.to_string())?;
    }
    let listener = UnixListener::bind(&socket_path).map_err(|error| error.to_string())?;
    std::fs::set_permissions(&socket_path, std::fs::Permissions::from_mode(0o600))
        .map_err(|error| error.to_string())?;
    let controller = AppBrowserController::new(app);
    loop {
        let (stream, _) = listener.accept().await.map_err(|error| error.to_string())?;
        let controller = controller.clone();
        let master_key = master_key.clone();
        let client = async move {
            let (reader, mut writer) = stream.into_split();
            let mut lines = BufReader::new(reader).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let response = match serde_json::from_str::<BrokerRequest>(&line) {
                    Ok(request) => dispatch_broker(&controller, &master_key, request).await,
                    Err(_) => BrokerResponse::error("invalid browser broker request"),
                };
                let Ok(mut bytes) = serde_json::to_vec(&response) else {
                    break;
                };
                bytes.push(b'\n');
                if writer.write_all(&bytes).await.is_err() {
                    break;
                }
            }
        };
        scope
            .upgrade()
            .ok_or_else(|| "browser plugin is unloading".to_string())?
            .spawn(client);
    }
}

#[cfg(not(unix))]
pub async fn start_broker(
    _app: AppHandle,
    _socket_path: PathBuf,
    _master_key: String,
    _scope: WeakContext,
) -> Result<(), String> {
    Err("CodeTwo Browser is not implemented on this platform".into())
}

#[cfg(test)]
mod agent_tests {
    use super::{bounded_snapshot, node_index, node_risk, secure_eq, BrowserState};
    use codetwo_core::browser::BrowserRisk;

    #[test]
    fn snapshot_is_utf8_safe_and_bounded() {
        let (value, truncated) = bounded_snapshot("界".repeat(100_000));
        assert!(truncated);
        assert!(value.len() <= 256 * 1024);
        assert!(value.is_char_boundary(value.len()));
    }

    #[test]
    fn node_ids_and_risk_are_fail_closed() {
        assert_eq!(node_index("n12").unwrap(), 12);
        assert!(node_index("12").is_err());
        assert_eq!(
            node_risk(&serde_json::json!({"type":"password","text":""}), true),
            BrowserRisk::SensitiveAction
        );
        assert_eq!(
            node_risk(&serde_json::json!({"type":"file"}), false),
            BrowserRisk::FileUpload
        );
    }

    #[test]
    fn key_comparison_and_registry_sanitization() {
        assert!(secure_eq("same", "same"));
        assert!(!secure_eq("same", "diff"));
        let temp = std::env::temp_dir().join(format!("codetwo-browser-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp).unwrap();
        let state = BrowserState::load(&temp);
        let tab = state.create("https://example.com".into(), Some("session-a"));
        assert!(state.ensure_lease(&tab.id, "session-b").is_err());
        state.take_control(&tab.id).unwrap();
        assert!(state.ensure_lease(&tab.id, "session-b").is_ok());
        let _ = std::fs::remove_dir_all(temp);
    }
}
