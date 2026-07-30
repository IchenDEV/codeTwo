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

use std::sync::Mutex;
use std::time::Duration;

use codetwo_core::browser::{Annotation, StyleChange};
use serde::Deserialize;
use tauri::webview::{NewWindowResponse, WebviewBuilder};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Runtime, Url, WebviewUrl, Window,
};

/// The in-page annotator, injected into every page before its own scripts run. It is dormant until
/// `browser_annotate` switches it on. Note what is *not* here: any way for the page to call the
/// app. Data only ever leaves the page when we ask for it, which is what keeps a remote page from
/// reaching into codeTwo.
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

/// Create the tab's webview if it doesn't exist yet, then place it and show it.
///
/// Idempotent by design: the panel calls this on mount, on tab switch and after any layout change,
/// and only the first call builds anything. An existing view is placed and shown but never
/// re-navigated — where the page *is* is the page's business (a link, a redirect, the back button),
/// and re-asserting the URL we last saw here would undo it.
#[tauri::command]
pub fn browser_open<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let target = parse(&url)?;

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

    let builder = WebviewBuilder::new(&label, WebviewUrl::External(target))
        .devtools(true)
        .initialization_script(ANNOTATE_JS)
        // A fresh document means a fresh annotator, switched off. The panel re-arms it here rather
        // than on `on_navigation`, which fires before the new document exists.
        .on_page_load(move |_, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
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
#[tauri::command]
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

#[tauri::command]
pub fn browser_navigate<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    url: String,
) -> Result<(), String> {
    let target = parse(&url)?;
    let Some(view) = app.get_webview(&label) else {
        return Ok(());
    };
    view.navigate(target).map_err(|e| e.to_string())
}

/// Back, forward and hard reload. There is no native history API on `Webview`, but `eval` runs in
/// the page's main frame whatever its origin, and `history` is the same object the page's own
/// back button would use.
#[tauri::command]
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

#[tauri::command]
pub fn browser_reload<R: Runtime>(app: AppHandle<R>, label: String) -> Result<(), String> {
    let Some(view) = app.get_webview(&label) else {
        return Ok(());
    };
    view.reload().map_err(|e| e.to_string())
}

/// Hide rather than close: the panel does this whenever the DOM needs the space (a menu is open,
/// another dock surface is showing), and the page has to survive it with its scroll position and
/// its state intact.
#[tauri::command]
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
#[tauri::command]
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
#[tauri::command]
pub fn browser_devtools<R: Runtime>(app: AppHandle<R>, label: String) {
    if let Some(view) = app.get_webview(&label) {
        view.open_devtools();
    }
}

#[tauri::command]
pub fn browser_close<R: Runtime>(app: AppHandle<R>, label: String) -> Result<(), String> {
    let Some(view) = app.get_webview(&label) else {
        return Ok(());
    };
    view.close().map_err(|e| e.to_string())
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
#[tauri::command]
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
#[tauri::command]
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
#[tauri::command]
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
#[tauri::command]
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
#[tauri::command]
pub fn browser_close_all<R: Runtime>(app: AppHandle<R>) {
    for (label, view) in app.webviews() {
        if label.starts_with("browser-") {
            let _ = view.close();
        }
    }
}
