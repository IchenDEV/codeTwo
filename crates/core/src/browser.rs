//! Built-in browser context for the agent — the Cursor/Codex-style "annotate a page → add it to the
//! prompt" flow. An [`Annotation`] captures what the user is looking at (URL, optional selected
//! element/text, a note); [`Annotation::to_context`] renders it as a markdown block the GUI inserts
//! into the prompt document, so the composed prompt carries the browser context to the agent.
//!
//! An annotation can also carry [`StyleChange`]s: the in-page annotator lets you drag colour, size
//! and weight until the element looks right, and "make it look like this" is far less useful to an
//! agent than the property, the value it had, and the value you settled on.

use serde::{Deserialize, Serialize};

/// Stable opaque tab identifier shared by the human browser panel and the agent controller.
pub type TabId = String;

/// The browser state visible across the controller boundary. A tab never exposes a native
/// WKWebView pointer or any browser-process credential.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BrowserTab {
    pub id: TabId,
    pub url: String,
    #[serde(default)]
    pub title: String,
    pub active: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lease_session: Option<String>,
    #[serde(default)]
    pub agent_active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "command", rename_all = "snake_case")]
pub enum TabCommand {
    List,
    Create {
        url: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        session_id: Option<String>,
    },
    Select {
        tab_id: TabId,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        session_id: Option<String>,
    },
    Close {
        tab_id: TabId,
    },
    TakeControl {
        tab_id: TabId,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum InspectRequest {
    DomSnapshot,
    Screenshot,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum BrowserAction {
    Navigate {
        url: String,
    },
    ClickNode {
        node_id: String,
    },
    ClickPoint {
        x: f64,
        y: f64,
    },
    Input {
        node_id: String,
        text: String,
    },
    Key {
        key: String,
    },
    Scroll {
        delta_x: f64,
        delta_y: f64,
    },
    Drag {
        from_x: f64,
        from_y: f64,
        to_x: f64,
        to_y: f64,
    },
    History {
        delta: i32,
    },
    Reload,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BrowserRisk {
    None,
    NewOrigin,
    SensitiveAction,
    Download,
    FileUpload,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BrowserActionResult {
    pub message: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BrowserSnapshot {
    pub url: String,
    pub title: String,
    pub content: String,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BrowserScreenshot {
    pub mime_type: String,
    pub data_base64: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum BrowserInspection {
    Snapshot(BrowserSnapshot),
    Screenshot(BrowserScreenshot),
}

/// The native browser is intentionally a deep module: callers can manage tabs, inspect a bounded
/// projection, or execute a fixed action. There is no arbitrary script execution surface.
#[async_trait::async_trait]
pub trait BrowserController: Send + Sync {
    async fn tabs(&self, command: TabCommand) -> Result<Vec<BrowserTab>, String>;
    async fn inspect(
        &self,
        tab_id: &str,
        request: InspectRequest,
    ) -> Result<BrowserInspection, String>;
    async fn act(&self, tab_id: &str, action: BrowserAction)
        -> Result<BrowserActionResult, String>;
}

/// One property the user adjusted on the page, and what they adjusted it from and to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StyleChange {
    pub property: String,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Annotation {
    pub url: String,
    #[serde(default)]
    pub note: String,
    /// CSS-ish selector or description of the annotated element, if any.
    #[serde(default)]
    pub selector: Option<String>,
    /// Text the user selected on the page, if any.
    #[serde(default)]
    pub selected_text: Option<String>,
    /// Live style edits made on the annotated element, if any.
    #[serde(default)]
    pub styles: Vec<StyleChange>,
}

impl Annotation {
    /// Render as a markdown context block for inclusion in the prompt document.
    pub fn to_context(&self) -> String {
        let mut s = format!("**Browser context** — {}", self.url);
        if let Some(sel) = &self.selector {
            if !sel.trim().is_empty() {
                s.push_str(&format!("\n- element: `{}`", sel.trim()));
            }
        }
        if let Some(t) = &self.selected_text {
            if !t.trim().is_empty() {
                s.push_str(&format!("\n- selected: “{}”", t.trim()));
            }
        }
        if !self.note.trim().is_empty() {
            s.push_str(&format!("\n- note: {}", self.note.trim()));
        }
        if !self.styles.is_empty() {
            s.push_str("\n- requested styles:");
            for c in &self.styles {
                s.push_str(&format!(
                    "\n  - `{}`: `{}` → `{}`",
                    c.property, c.from, c.to
                ));
            }
        }
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn context_includes_url_selection_and_note() {
        let a = Annotation {
            url: "https://example.com/pricing".into(),
            note: "this button is misaligned".into(),
            selector: Some(".cta-primary".into()),
            selected_text: Some("Start free trial".into()),
            styles: Vec::new(),
        };
        let ctx = a.to_context();
        assert!(ctx.contains("https://example.com/pricing"));
        assert!(ctx.contains(".cta-primary"));
        assert!(ctx.contains("Start free trial"));
        assert!(ctx.contains("misaligned"));
    }

    #[test]
    fn style_changes_render_as_property_from_to() {
        let a = Annotation {
            url: "https://x.test".into(),
            note: String::new(),
            selector: Some("button".into()),
            selected_text: None,
            styles: vec![StyleChange {
                property: "font-size".into(),
                from: "16px".into(),
                to: "18px".into(),
            }],
        };
        let ctx = a.to_context();
        assert!(ctx.contains("font-size"));
        assert!(ctx.contains("16px"));
        assert!(ctx.contains("18px"));
    }

    #[test]
    fn minimal_annotation_is_just_url() {
        let a = Annotation {
            url: "https://x.test".into(),
            note: String::new(),
            selector: None,
            selected_text: None,
            styles: Vec::new(),
        };
        assert_eq!(a.to_context(), "**Browser context** — https://x.test");
    }
}
