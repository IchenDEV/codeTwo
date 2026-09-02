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
    ToggleDocMode,
    CyclePermissionMode,
    RefreshGit,
    ToggleGit,
    OpenMarket,
    OpenUsage,
    OpenFiles,
    OpenFinder,
    SearchWorkspace,
    OpenIssues,
    ClosePanel,
    SplitPaneRight,
    SplitPaneDown,
    ToggleSidePanel,
    PrevSession,
    NextSession,
    CycleScene,
    OpenMissionControl,
}

impl Action {
    pub const ALL: [Action; 28] = [
        Action::Run,
        Action::NewSession,
        Action::Cancel,
        Action::ToggleTerminal,
        Action::ToggleBrowser,
        Action::ToggleGit,
        Action::ClosePanel,
        Action::SplitPaneRight,
        Action::SplitPaneDown,
        Action::ToggleSidePanel,
        Action::OpenSkillPicker,
        Action::FocusEditor,
        Action::ToggleDocMode,
        Action::OpenCommandPalette,
        Action::OpenSourceControl,
        Action::OpenMarket,
        Action::OpenFiles,
        Action::OpenFinder,
        Action::SearchWorkspace,
        Action::OpenIssues,
        Action::OpenUsage,
        Action::OpenSettings,
        Action::CyclePermissionMode,
        Action::RefreshGit,
        Action::PrevSession,
        Action::NextSession,
        Action::CycleScene,
        Action::OpenMissionControl,
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
            Action::ToggleDocMode => "toggle_doc_mode",
            Action::CyclePermissionMode => "cycle_permission_mode",
            Action::RefreshGit => "refresh_git",
            Action::ToggleGit => "toggle_git",
            Action::OpenMarket => "open_market",
            Action::OpenUsage => "open_usage",
            Action::OpenFiles => "open_files",
            Action::OpenFinder => "open_finder",
            Action::SearchWorkspace => "search_workspace",
            Action::OpenIssues => "open_issues",
            Action::ClosePanel => "close_panel",
            Action::SplitPaneRight => "split_pane_right",
            Action::SplitPaneDown => "split_pane_down",
            Action::ToggleSidePanel => "toggle_side_panel",
            Action::PrevSession => "prev_session",
            Action::NextSession => "next_session",
            Action::CycleScene => "cycle_scene",
            Action::OpenMissionControl => "open_mission_control",
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
            Action::ToggleDocMode => "Expand document to full height",
            Action::CyclePermissionMode => "Cycle permission mode",
            Action::RefreshGit => "Refresh git status",
            Action::ToggleGit => "Toggle git panel",
            Action::OpenMarket => "Open Plugin Hub",
            Action::OpenUsage => "Open usage",
            Action::OpenFiles => "Browse workspace files",
            Action::OpenFinder => "Open in Finder",
            Action::SearchWorkspace => "Search workspace contents",
            Action::OpenIssues => "Open issues",
            Action::ClosePanel => "Close side panel",
            Action::SplitPaneRight => "Split pane right",
            Action::SplitPaneDown => "Split pane down",
            Action::ToggleSidePanel => "Toggle side panel",
            Action::PrevSession => "Previous session",
            Action::NextSession => "Next session",
            Action::CycleScene => "Cycle scene",
            Action::OpenMissionControl => "Open mission control",
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
            Action::ToggleDocMode => "Mod+Shift+E",
            Action::CyclePermissionMode => "Mod+Shift+P",
            Action::RefreshGit => "Mod+G",
            Action::ToggleGit => "Mod+Shift+B",
            Action::OpenMarket => "Mod+Shift+M",
            Action::OpenUsage => "Mod+Shift+U",
            Action::OpenFiles => "Mod+P",
            Action::OpenFinder => "Mod+O",
            Action::SearchWorkspace => "Mod+Shift+F",
            Action::OpenIssues => "Mod+Shift+I",
            Action::ClosePanel => "Escape",
            Action::SplitPaneRight => "Mod+Alt+R",
            Action::SplitPaneDown => "Mod+Alt+D",
            Action::ToggleSidePanel => "Mod+Alt+P",
            Action::PrevSession => "Mod+Alt+ArrowUp",
            Action::NextSession => "Mod+Alt+ArrowDown",
            Action::CycleScene => "Shift+Tab",
            Action::OpenMissionControl => "Mod+Shift+O",
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
        let map = Action::ALL
            .iter()
            .map(|a| (*a, a.default_key().to_string()))
            .collect();
        Keymap { map }
    }
}

impl Keymap {
    pub fn key(&self, action: Action) -> String {
        self.map
            .get(&action)
            .cloned()
            .unwrap_or_else(|| action.default_key().to_string())
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
        assert_eq!(km.key(Action::OpenFinder), "Mod+O");
        assert_eq!(km.key(Action::SplitPaneRight), "Mod+Alt+R");
        assert_eq!(km.key(Action::SplitPaneDown), "Mod+Alt+D");
        assert_eq!(km.key(Action::ToggleSidePanel), "Mod+Alt+P");
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
