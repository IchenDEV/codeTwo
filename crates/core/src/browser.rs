//! Built-in browser context for the agent — the Cursor/Codex-style "annotate a page → add it to the
//! prompt" flow. An [`Annotation`] captures what the user is looking at (URL, optional selected
//! element/text, a note); [`Annotation::to_context`] renders it as a markdown block the GUI inserts
//! into the prompt document, so the composed prompt carries the browser context to the agent.

use serde::{Deserialize, Serialize};

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
        };
        let ctx = a.to_context();
        assert!(ctx.contains("https://example.com/pricing"));
        assert!(ctx.contains(".cta-primary"));
        assert!(ctx.contains("Start free trial"));
        assert!(ctx.contains("misaligned"));
    }

    #[test]
    fn minimal_annotation_is_just_url() {
        let a = Annotation { url: "https://x.test".into(), note: String::new(), selector: None, selected_text: None };
        assert_eq!(a.to_context(), "**Browser context** — https://x.test");
    }
}
