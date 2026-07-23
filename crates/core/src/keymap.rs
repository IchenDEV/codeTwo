//! Keybindings as shared, serializable data.
//!
//! The actual key handling lives in each frontend, but the *mapping* (Action → key combo) is shared
//! so the desktop and TUI stay consistent and the user can customize it once. `"Mod"` in a combo
//! means Cmd on macOS / Ctrl elsewhere; the frontend resolves it.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Run,
    NewSession,
    Cancel,
    ToggleTerminal,
    ToggleBrowser,
    OpenSkillPicker,
    OpenSettings,
    OpenCommandPalette,
    OpenSourceControl,
    FocusEditor,
    CyclePermissionMode,
    RefreshGit,
}

impl Action {
    pub const ALL: [Action; 12] = [
        Action::Run,
        Action::NewSession,
        Action::Cancel,
        Action::ToggleTerminal,
        Action::ToggleBrowser,
        Action::OpenSkillPicker,
        Action::OpenSettings,
        Action::OpenCommandPalette,
        Action::OpenSourceControl,
        Action::FocusEditor,
        Action::CyclePermissionMode,
        Action::RefreshGit,
    ];

    pub fn as_str(&self) -> &'static str {
        match self {
            Action::Run => "run",
            Action::NewSession => "new_session",
            Action::Cancel => "cancel",
            Action::ToggleTerminal => "toggle_terminal",
            Action::ToggleBrowser => "toggle_browser",
            Action::OpenSkillPicker => "open_skill_picker",
            Action::OpenSettings => "open_settings",
            Action::OpenCommandPalette => "open_command_palette",
            Action::OpenSourceControl => "open_source_control",
            Action::FocusEditor => "focus_editor",
            Action::CyclePermissionMode => "cycle_permission_mode",
            Action::RefreshGit => "refresh_git",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Action::Run => "Run prompt",
            Action::NewSession => "New session",
            Action::Cancel => "Cancel turn",
            Action::ToggleTerminal => "Toggle terminal",
            Action::ToggleBrowser => "Toggle browser",
            Action::OpenSkillPicker => "Open skill picker",
            Action::OpenSettings => "Open settings",
            Action::OpenCommandPalette => "Command palette",
            Action::OpenSourceControl => "Source control",
            Action::FocusEditor => "Focus editor",
            Action::CyclePermissionMode => "Cycle permission mode",
            Action::RefreshGit => "Refresh git status",
        }
    }

    fn default_key(&self) -> &'static str {
        match self {
            Action::Run => "Mod+Enter",
            Action::NewSession => "Mod+N",
            Action::Cancel => "Mod+.",
            Action::ToggleTerminal => "Mod+J",
            Action::ToggleBrowser => "Mod+B",
            Action::OpenSkillPicker => "Mod+/",
            Action::OpenSettings => "Mod+,",
            Action::OpenCommandPalette => "Mod+K",
            Action::OpenSourceControl => "Mod+Shift+G",
            Action::FocusEditor => "Mod+E",
            Action::CyclePermissionMode => "Mod+Shift+P",
            Action::RefreshGit => "Mod+G",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Keymap {
    #[serde(flatten)]
    map: BTreeMap<Action, String>,
}

impl Default for Keymap {
    fn default() -> Self {
        let map = Action::ALL.iter().map(|a| (*a, a.default_key().to_string())).collect();
        Keymap { map }
    }
}

impl Keymap {
    pub fn key(&self, action: Action) -> String {
        self.map.get(&action).cloned().unwrap_or_else(|| action.default_key().to_string())
    }

    pub fn set(&mut self, action: Action, key: impl Into<String>) {
        self.map.insert(action, key.into());
    }

    /// (action-string, key, human label) for every action, in a stable order.
    pub fn entries(&self) -> Vec<(String, String, String)> {
        Action::ALL
            .iter()
            .map(|a| (a.as_str().to_string(), self.key(*a), a.label().to_string()))
            .collect()
    }

    /// Load user overrides from `path`, layered over the defaults. Missing file → defaults.
    pub fn load(path: &Path) -> Keymap {
        let mut km = Keymap::default();
        if let Ok(data) = std::fs::read_to_string(path) {
            if let Ok(overrides) = serde_json::from_str::<BTreeMap<Action, String>>(&data) {
                for (a, k) in overrides {
                    km.map.insert(a, k);
                }
            }
        }
        km
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(&self.map)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        std::fs::write(path, json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_cover_all_actions() {
        let km = Keymap::default();
        assert_eq!(km.entries().len(), Action::ALL.len());
        assert_eq!(km.key(Action::Run), "Mod+Enter");
    }

    #[test]
    fn set_overrides_key() {
        let mut km = Keymap::default();
        km.set(Action::Run, "Mod+Shift+Enter");
        assert_eq!(km.key(Action::Run), "Mod+Shift+Enter");
    }

    #[test]
    fn save_load_round_trip() {
        let dir = std::env::temp_dir().join(format!("codetwo-km-{}", uuid::Uuid::new_v4()));
        let path = dir.join("keymap.json");
        let mut km = Keymap::default();
        km.set(Action::ToggleBrowser, "Mod+Shift+B");
        km.save(&path).unwrap();

        let loaded = Keymap::load(&path);
        assert_eq!(loaded.key(Action::ToggleBrowser), "Mod+Shift+B");
        // Untouched actions keep their defaults.
        assert_eq!(loaded.key(Action::Run), "Mod+Enter");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
