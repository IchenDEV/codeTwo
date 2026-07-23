//! Issue-tracker integration.
//!
//! List issues from **GitHub** (via the authenticated `gh` CLI) or **Linear** (GraphQL, via a token
//! + `curl`), and render one as prompt context so you can reference a ticket inside a prompt
//! document. Parsing is factored out and unit-tested; the network calls degrade to errors when the
//! tool/token is missing.

use std::path::Path;

use serde::{Deserialize, Serialize};
use tokio::process::Command;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Issue {
    /// Issue number (GitHub) or identifier like `ENG-123` (Linear).
    pub id: String,
    pub title: String,
    pub state: String,
    pub url: String,
    #[serde(default)]
    pub body: String,
    /// `github` | `linear`.
    pub source: String,
}

impl Issue {
    /// Render as a markdown context block for a prompt document.
    pub fn to_context(&self) -> String {
        let mut s = format!(
            "**{} #{}** — {} ({})\n{}",
            self.source, self.id, self.title, self.state, self.url
        );
        let body = self.body.trim();
        if !body.is_empty() {
            let truncated: String = body.chars().take(1500).collect();
            s.push_str(&format!("\n\n{truncated}"));
        }
        s
    }
}

// ---- GitHub (via `gh`) -----------------------------------------------------------------------

pub fn gh_available() -> bool {
    crate::provider::which("gh").is_some()
}

/// List open issues for the repo containing `cwd`, via `gh issue list --json …`.
pub async fn list_github(cwd: &Path, limit: u32) -> std::io::Result<Vec<Issue>> {
    let out = Command::new("gh")
        .args([
            "issue",
            "list",
            "--state",
            "open",
            "--limit",
            &limit.to_string(),
            "--json",
            "number,title,state,url,body",
        ])
        .current_dir(cwd)
        .output()
        .await?;
    if !out.status.success() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    parse_github(&out.stdout).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
}

/// Parse `gh issue list --json number,title,state,url,body` output. Public for testing.
pub fn parse_github(bytes: &[u8]) -> serde_json::Result<Vec<Issue>> {
    #[derive(Deserialize)]
    struct Gh {
        number: u64,
        title: String,
        state: String,
        url: String,
        #[serde(default)]
        body: String,
    }
    let raw: Vec<Gh> = serde_json::from_slice(bytes)?;
    Ok(raw
        .into_iter()
        .map(|g| Issue {
            id: g.number.to_string(),
            title: g.title,
            state: g.state.to_lowercase(),
            url: g.url,
            body: g.body,
            source: "github".into(),
        })
        .collect())
}

// ---- Linear (GraphQL via curl) ---------------------------------------------------------------

/// List Linear issues using an API token. Uses `curl` to avoid an HTTP dependency in the core.
pub async fn list_linear(token: &str, limit: u32) -> std::io::Result<Vec<Issue>> {
    let query = format!(
        r#"{{"query":"{{ issues(first: {limit}) {{ nodes {{ identifier title url description state {{ name }} }} }} }}"}}"#
    );
    let out = Command::new("curl")
        .args([
            "-s",
            "-X",
            "POST",
            "https://api.linear.app/graphql",
            "-H",
            &format!("Authorization: {token}"),
            "-H",
            "Content-Type: application/json",
            "-d",
            &query,
        ])
        .output()
        .await?;
    if !out.status.success() {
        return Err(std::io::Error::new(std::io::ErrorKind::Other, "curl failed"));
    }
    let value: serde_json::Value =
        serde_json::from_slice(&out.stdout).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    Ok(parse_linear(&value))
}

/// Parse a Linear GraphQL response into issues. Public for testing.
pub fn parse_linear(value: &serde_json::Value) -> Vec<Issue> {
    let nodes = value
        .get("data")
        .and_then(|d| d.get("issues"))
        .and_then(|i| i.get("nodes"))
        .and_then(|n| n.as_array());
    let Some(nodes) = nodes else { return Vec::new() };
    nodes
        .iter()
        .filter_map(|n| {
            let id = n.get("identifier")?.as_str()?.to_string();
            let title = n.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let url = n.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let body = n.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let state = n
                .get("state")
                .and_then(|s| s.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Some(Issue { id, title, state, url, body, source: "linear".into() })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn to_context_includes_id_title_url() {
        let i = Issue {
            id: "42".into(),
            title: "Fix login".into(),
            state: "open".into(),
            url: "https://github.com/o/r/issues/42".into(),
            body: "Steps to reproduce…".into(),
            source: "github".into(),
        };
        let c = i.to_context();
        assert!(c.contains("github #42"));
        assert!(c.contains("Fix login"));
        assert!(c.contains("issues/42"));
        assert!(c.contains("reproduce"));
    }

    #[test]
    fn parse_github_maps_fields() {
        let json = br#"[
            {"number":7,"title":"Bug","state":"OPEN","url":"https://x/7","body":"b"},
            {"number":8,"title":"Feat","state":"OPEN","url":"https://x/8","body":""}
        ]"#;
        let issues = parse_github(json).unwrap();
        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].id, "7");
        assert_eq!(issues[0].state, "open");
        assert_eq!(issues[0].source, "github");
    }

    #[test]
    fn parse_linear_reads_nodes() {
        let v: serde_json::Value = serde_json::from_str(
            r#"{"data":{"issues":{"nodes":[
                {"identifier":"ENG-1","title":"Speed up","url":"https://linear/ENG-1","description":"d","state":{"name":"In Progress"}}
            ]}}}"#,
        )
        .unwrap();
        let issues = parse_linear(&v);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].id, "ENG-1");
        assert_eq!(issues[0].state, "In Progress");
        assert_eq!(issues[0].source, "linear");
    }
}
