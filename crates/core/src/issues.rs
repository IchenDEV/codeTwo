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

// ---- Write path (R12): delegation comments --------------------------------------------------

/// True when `id` is a plain GitHub issue number: non-empty, ASCII digits only. The number is
/// passed as a `gh` argument, so anything else is rejected before a process is spawned.
pub fn valid_github_issue_id(id: &str) -> bool {
    !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit())
}

/// Post a comment via `gh issue comment <id> --body-file -`. The body travels over stdin — no
/// arg-length or quoting hazards. Returns the comment URL `gh` prints on stdout.
pub async fn comment_github(cwd: &Path, id: &str, body: &str) -> std::io::Result<String> {
    if !valid_github_issue_id(id) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("invalid GitHub issue id: {id}"),
        ));
    }
    let mut child = Command::new("gh")
        .args(["issue", "comment", id, "--body-file", "-"])
        .current_dir(cwd)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin.write_all(body.as_bytes()).await?;
        // Dropping stdin closes the pipe so `gh` sees EOF.
    }
    let out = child.wait_with_output().await?;
    if !out.status.success() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// POST a GraphQL request to Linear. Unlike the read-path list query, the request body is built
/// with `serde_json::json!` (never `format!` into JSON) and sent with `--data-binary @-` over
/// stdin, so user-supplied identifiers and comment bodies can never break out of the payload.
async fn linear_graphql(
    token: &str,
    request: &serde_json::Value,
) -> std::io::Result<serde_json::Value> {
    let payload = serde_json::to_vec(request)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let mut child = Command::new("curl")
        .args([
            "-s",
            "-X",
            "POST",
            "https://api.linear.app/graphql",
            "-H",
            &format!("Authorization: {token}"),
            "-H",
            "Content-Type: application/json",
            "--data-binary",
            "@-",
        ])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin.write_all(&payload).await?;
    }
    let out = child.wait_with_output().await?;
    if !out.status.success() {
        return Err(std::io::Error::new(std::io::ErrorKind::Other, "curl failed"));
    }
    serde_json::from_slice(&out.stdout)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
}

/// Resolve a Linear identifier to the internal issue id `commentCreate` needs. Linear's
/// `issue(id:)` accepts human identifiers like `ENG-123` as well as UUIDs, so one query suffices.
pub async fn resolve_linear_issue_id(token: &str, identifier: &str) -> std::io::Result<String> {
    let request = serde_json::json!({
        "query": "query Resolve($id: String!) { issue(id: $id) { id } }",
        "variables": { "id": identifier },
    });
    let value = linear_graphql(token, &request).await?;
    parse_linear_issue_id(&value).ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Linear issue not found: {identifier}"),
        )
    })
}

/// Extract `data.issue.id` from a Linear GraphQL response. Public for testing.
pub fn parse_linear_issue_id(value: &serde_json::Value) -> Option<String> {
    value
        .get("data")?
        .get("issue")?
        .get("id")?
        .as_str()
        .map(str::to_string)
}

/// Post a comment on a Linear issue (internal id, from [`resolve_linear_issue_id`]). Returns the
/// comment URL.
pub async fn comment_linear(token: &str, issue_id: &str, body: &str) -> std::io::Result<String> {
    let request = serde_json::json!({
        "query": "mutation Comment($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success comment { url } } }",
        "variables": { "issueId": issue_id, "body": body },
    });
    let value = linear_graphql(token, &request).await?;
    parse_linear_comment(&value)
}

/// Extract the comment URL from a `commentCreate` response; `success: false` (or a malformed
/// response) is an error. Public for testing.
pub fn parse_linear_comment(value: &serde_json::Value) -> std::io::Result<String> {
    let payload = value.get("data").and_then(|d| d.get("commentCreate"));
    let success = payload
        .and_then(|p| p.get("success"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !success {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "Linear commentCreate did not succeed",
        ));
    }
    Ok(payload
        .and_then(|p| p.get("comment"))
        .and_then(|c| c.get("url"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string())
}

/// Delegation activity-trail body: attribution line, session title, then the produced artifacts
/// as a bullet list of `(title, url-or-summary)` pairs. The list is skipped when empty.
pub fn delegation_comment(
    scene_ref: &str,
    session_title: &str,
    artifacts: &[(String, String)],
) -> String {
    let mut s = format!("Delegated to Code2 scene `{scene_ref}`\n\nSession: {session_title}");
    if !artifacts.is_empty() {
        s.push_str("\n\nArtifacts:");
        for (title, link) in artifacts {
            s.push_str(&format!("\n- {title} — {link}"));
        }
    }
    s
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

    #[test]
    fn github_issue_id_validation() {
        assert!(valid_github_issue_id("42"));
        assert!(valid_github_issue_id("0071"));
        assert!(!valid_github_issue_id(""));
        assert!(!valid_github_issue_id("ENG-123"));
        assert!(!valid_github_issue_id("12x"));
        assert!(!valid_github_issue_id("-1"));
        assert!(!valid_github_issue_id("4 2"));
        // Non-ASCII digits must be rejected too — the id becomes a `gh` argument.
        assert!(!valid_github_issue_id("١٢"));
    }

    #[test]
    fn parse_linear_issue_id_found() {
        let v: serde_json::Value =
            serde_json::from_str(r#"{"data":{"issue":{"id":"uuid-123"}}}"#).unwrap();
        assert_eq!(parse_linear_issue_id(&v), Some("uuid-123".to_string()));
    }

    #[test]
    fn parse_linear_issue_id_missing() {
        let v: serde_json::Value = serde_json::from_str(r#"{"data":{"issue":null}}"#).unwrap();
        assert_eq!(parse_linear_issue_id(&v), None);
    }

    #[test]
    fn parse_linear_issue_id_malformed() {
        let v: serde_json::Value =
            serde_json::from_str(r#"{"errors":[{"message":"nope"}]}"#).unwrap();
        assert_eq!(parse_linear_issue_id(&v), None);
        let v: serde_json::Value = serde_json::from_str(r#"{"data":{"issue":{"id":7}}}"#).unwrap();
        assert_eq!(parse_linear_issue_id(&v), None);
    }

    #[test]
    fn parse_linear_comment_success() {
        let v: serde_json::Value = serde_json::from_str(
            r#"{"data":{"commentCreate":{"success":true,"comment":{"url":"https://linear.app/c/1"}}}}"#,
        )
        .unwrap();
        assert_eq!(parse_linear_comment(&v).unwrap(), "https://linear.app/c/1");
    }

    #[test]
    fn parse_linear_comment_failure() {
        let v: serde_json::Value =
            serde_json::from_str(r#"{"data":{"commentCreate":{"success":false}}}"#).unwrap();
        assert!(parse_linear_comment(&v).is_err());
    }

    #[test]
    fn parse_linear_comment_malformed() {
        let v: serde_json::Value =
            serde_json::from_str(r#"{"errors":[{"message":"unauthorized"}]}"#).unwrap();
        assert!(parse_linear_comment(&v).is_err());
    }

    #[test]
    fn delegation_comment_with_artifacts() {
        let artifacts = vec![
            ("Plan v2".to_string(), "https://x/plan".to_string()),
            ("Diff summary".to_string(), "3 files changed".to_string()),
        ];
        let c = delegation_comment("review-loop", "Fix login flakiness", &artifacts);
        assert!(c.starts_with("Delegated to Code2 scene `review-loop`"));
        assert!(c.contains("Session: Fix login flakiness"));
        assert!(c.contains("\n- Plan v2 — https://x/plan"));
        assert!(c.contains("\n- Diff summary — 3 files changed"));
    }

    #[test]
    fn delegation_comment_without_artifacts_skips_list() {
        let c = delegation_comment("review-loop", "Fix login flakiness", &[]);
        assert!(c.contains("Delegated to Code2 scene `review-loop`"));
        assert!(c.contains("Session: Fix login flakiness"));
        assert!(!c.contains("Artifacts"));
        assert!(!c.contains("\n- "));
    }
}
