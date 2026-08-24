//! Desktop GitHub integration backed by the authenticated `gh` CLI.
//!
//! The renderer supplies repository coordinates and reviewed enum values; command construction,
//! branch/PR binding checks and non-interactive process policy stay inside this host plugin.

use codetwo_kernel::{async_trait, Context, Plugin, PluginError, PluginResult};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;
use tokio::process::Command;

const CURRENT_FIELDS: &str = "number,title,url,state,isDraft,headRefName,baseRefName,additions,deletions,changedFiles,body,reviewDecision,mergeable,mergeStateStatus,statusCheckRollup,author,comments,reviews,createdAt,updatedAt";
const SEARCH_FIELDS: &str =
    "number,title,url,repository,author,isDraft,updatedAt,createdAt,labels,commentsCount";
const DETAIL_FIELDS: &str = "additions,author,baseRefName,body,changedFiles,comments,deletions,files,headRefName,isDraft,latestReviews,mergeStateStatus,mergeable,number,reviewDecision,reviewRequests,state,statusCheckRollup,title,updatedAt,url";
const MAX_DIFF_PREVIEW_CHARS: usize = 1_500_000;

pub struct GitHubPlugin;

#[async_trait]
impl Plugin for GitHubPlugin {
    fn name(&self) -> &str {
        "github"
    }

    fn description(&self) -> Option<&str> {
        Some("Authenticated pull-request inspection and review through GitHub CLI.")
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        #[derive(Deserialize)]
        struct CwdArgs {
            cwd: String,
        }
        ctx.command("github.current_pr", |args| async move {
            let args: CwdArgs = decode(args)?;
            current_pull_request(&args.cwd).await
        })?;

        #[derive(Deserialize)]
        struct NumberArgs {
            cwd: String,
            number: i64,
        }
        ctx.command("github.pr_diff", |args| async move {
            let args: NumberArgs = decode(args)?;
            let number = pull_request_number(args.number)?;
            require_current_pull_request(&args.cwd, number).await?;
            let command = vec![
                "pr".into(),
                "diff".into(),
                number.to_string(),
                "--patch".into(),
            ];
            let output = run_gh_owned(&command, Some(Path::new(&args.cwd)), 60).await?;
            let text = output
                .chars()
                .take(MAX_DIFF_PREVIEW_CHARS)
                .collect::<String>();
            Ok(json!({
                "text": text,
                "truncated": output.chars().count() > MAX_DIFF_PREVIEW_CHARS
            }))
        })?;

        #[derive(Deserialize)]
        struct ReviewArgs {
            cwd: String,
            number: i64,
            action: String,
            #[serde(default)]
            body: String,
        }
        ctx.command("github.review_pr", |args| async move {
            let args: ReviewArgs = decode(args)?;
            let number = pull_request_number(args.number)?;
            let current = require_current_pull_request(&args.cwd, number).await?;
            if text(current.get("state")) != "OPEN" {
                return Err(PluginError::new(format!("PR #{number} is not open")));
            }
            let flag = match args.action.as_str() {
                "approve" => "--approve",
                "comment" => "--comment",
                "request_changes" => "--request-changes",
                _ => return Err(PluginError::new("unsupported pull request review action")),
            };
            let body = args.body.trim();
            if matches!(args.action.as_str(), "comment" | "request_changes") && body.is_empty() {
                return Err(PluginError::new(
                    "a review comment is required for this action",
                ));
            }
            let mut command = vec![
                "pr".to_string(),
                "review".into(),
                number.to_string(),
                flag.into(),
            ];
            if !body.is_empty() {
                command.extend(["--body".into(), body.into()]);
            }
            run_gh_owned(&command, Some(Path::new(&args.cwd)), 60).await?;
            Ok(Value::Bool(true))
        })?;

        #[derive(Deserialize)]
        struct MergeArgs {
            cwd: String,
            number: i64,
            strategy: String,
        }
        ctx.command("github.merge_pr", |args| async move {
            let args: MergeArgs = decode(args)?;
            let number = pull_request_number(args.number)?;
            let current = require_current_pull_request(&args.cwd, number).await?;
            if text(current.get("state")) != "OPEN" {
                return Err(PluginError::new(format!("PR #{number} is not open")));
            }
            if boolean(current.get("is_draft")) {
                return Err(PluginError::new(format!("PR #{number} is still a draft")));
            }
            if text(current.get("mergeable")) == "CONFLICTING" {
                return Err(PluginError::new(format!(
                    "PR #{number} has merge conflicts"
                )));
            }
            let flag = match args.strategy.as_str() {
                "merge" => "--merge",
                "squash" => "--squash",
                "rebase" => "--rebase",
                _ => return Err(PluginError::new("unsupported pull request merge strategy")),
            };
            let command = vec!["pr".into(), "merge".into(), number.to_string(), flag.into()];
            run_gh_owned(&command, Some(Path::new(&args.cwd)), 120).await?;
            Ok(Value::Bool(true))
        })?;

        ctx.command("github.pull_requests", |_| async move {
            ensure_gh()?;
            let (authored, requested, reviewed) = tokio::join!(
                search_pull_requests("authored", "--author=@me"),
                search_pull_requests("reviewRequested", "--review-requested=@me"),
                search_pull_requests("reviewed", "--reviewed-by=@me"),
            );
            let mut merged: HashMap<String, Value> = HashMap::new();
            for item in authored?.into_iter().chain(requested?).chain(reviewed?) {
                let id = text(item.get("id")).to_string();
                if let Some(previous) = merged.get_mut(&id) {
                    for key in ["authored", "reviewRequested", "reviewed"] {
                        if boolean(item.get(key)) {
                            previous[key] = Value::Bool(true);
                        }
                    }
                } else {
                    merged.insert(id, item);
                }
            }
            let mut values = merged.into_values().collect::<Vec<_>>();
            values.sort_by(|left, right| {
                text(right.get("updatedAt"))
                    .cmp(text(left.get("updatedAt")))
                    .then_with(|| {
                        text(left.pointer("/repository/nameWithOwner"))
                            .cmp(text(right.pointer("/repository/nameWithOwner")))
                    })
                    .then_with(|| integer(left.get("number")).cmp(&integer(right.get("number"))))
            });
            Ok(Value::Array(values))
        })?;

        #[derive(Deserialize)]
        struct DetailArgs {
            url: String,
            summary: Value,
        }
        ctx.command("github.pull_request", |args| async move {
            let args: DetailArgs = decode(args)?;
            let (owner, repo, number) = pull_request_coordinates(&args.url)?;
            let summary = parse_summary(&args.summary)?;
            let expected = format!("{owner}/{repo}");
            if text(summary.get("url")) != args.url
                || !text(summary.pointer("/repository/nameWithOwner"))
                    .eq_ignore_ascii_case(&expected)
                || integer(summary.get("number")) != number
            {
                return Err(PluginError::new(
                    "Pull request selection does not match its repository",
                ));
            }
            let field = format!("--json={DETAIL_FIELDS}");
            let raw = run_gh_json(&["pr", "view", &args.url, &field], None, 60).await?;
            detail_from_json(&raw, &summary)
        })?;
        Ok(())
    }
}

fn decode<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, PluginError> {
    serde_json::from_value(value)
        .map_err(|error| PluginError::new(format!("bad arguments: {error}")))
}

fn ensure_gh() -> Result<(), PluginError> {
    codetwo_core::provider::which("gh")
        .map(|_| ())
        .ok_or_else(|| PluginError::new("GitHub CLI is not installed"))
}

async fn run_gh(
    args: &[&str],
    cwd: Option<&Path>,
    timeout_seconds: u64,
) -> Result<String, PluginError> {
    let owned = args
        .iter()
        .map(|value| (*value).to_string())
        .collect::<Vec<_>>();
    run_gh_owned(&owned, cwd, timeout_seconds).await
}

async fn run_gh_owned(
    args: &[String],
    cwd: Option<&Path>,
    timeout_seconds: u64,
) -> Result<String, PluginError> {
    ensure_gh()?;
    let mut command = Command::new("gh");
    command
        .args(args)
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_PAGER", "cat");
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    let output = tokio::time::timeout(Duration::from_secs(timeout_seconds), command.output())
        .await
        .map_err(|_| PluginError::new(format!("GitHub CLI timed out after {timeout_seconds}s")))?
        .map_err(PluginError::new)?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    if !output.status.success() {
        return Err(PluginError::new(if stderr.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            stderr.trim().to_string()
        }));
    }
    Ok(stdout)
}

async fn run_gh_json(
    args: &[&str],
    cwd: Option<&Path>,
    timeout_seconds: u64,
) -> Result<Value, PluginError> {
    let output = run_gh(args, cwd, timeout_seconds).await?;
    serde_json::from_str(&output).map_err(|_| PluginError::new("GitHub CLI returned invalid JSON"))
}

fn text(value: Option<&Value>) -> &str {
    value.and_then(Value::as_str).unwrap_or("")
}

fn boolean(value: Option<&Value>) -> bool {
    value.and_then(Value::as_bool).unwrap_or(false)
}

fn integer(value: Option<&Value>) -> i64 {
    value.and_then(Value::as_i64).unwrap_or(0)
}

fn values(value: Option<&Value>) -> &[Value] {
    value
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

fn pull_request_number(number: i64) -> Result<i64, PluginError> {
    (number > 0)
        .then_some(number)
        .ok_or_else(|| PluginError::new("pull request number must be a positive integer"))
}

fn no_pull_request_found(message: &str) -> bool {
    let message = message.to_ascii_lowercase();
    message.contains("no pull requests found for branch")
        || message.contains("could not find pull request for branch")
}

async fn current_pull_request(cwd: &str) -> Result<Value, PluginError> {
    ensure_gh()?;
    let field = format!("--json={CURRENT_FIELDS}");
    let output = run_gh(&["pr", "view", &field], Some(Path::new(cwd)), 30).await;
    match output {
        Ok(output) => {
            let raw: Value = serde_json::from_str(&output).map_err(|error| {
                PluginError::new(format!(
                    "GitHub returned an invalid pull request response: {error}"
                ))
            })?;
            normalize_current_pull_request(&raw)
        }
        Err(error) if no_pull_request_found(&error.to_string()) => Ok(Value::Null),
        Err(error) => Err(error),
    }
}

fn normalize_current_pull_request(value: &Value) -> Result<Value, PluginError> {
    let number = pull_request_number(integer(value.get("number")))?;
    let checks = values(value.get("statusCheckRollup"))
        .iter()
        .map(|check| {
            let name = text(check.get("name"));
            let name = if name.is_empty() {
                let context = text(check.get("context"));
                if context.is_empty() { "Check" } else { context }
            } else {
                name
            };
            json!({
                "name": name,
                "status": nullable_text(check.get("status")),
                "conclusion": nullable_text(check.get("conclusion")).or_else(|| nullable_text(check.get("state"))),
                "details_url": nullable_text(check.get("detailsUrl")).or_else(|| nullable_text(check.get("targetUrl"))),
                "workflow_name": nullable_text(check.get("workflowName")),
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "number": number,
        "title": text(value.get("title")),
        "url": text(value.get("url")),
        "state": text(value.get("state")),
        "is_draft": boolean(value.get("isDraft")),
        "head_ref": text(value.get("headRefName")),
        "base_ref": text(value.get("baseRefName")),
        "additions": integer(value.get("additions")),
        "deletions": integer(value.get("deletions")),
        "changed_files": integer(value.get("changedFiles")),
        "body": text(value.get("body")),
        "review_decision": nullable_text(value.get("reviewDecision")),
        "mergeable": text(value.get("mergeable")),
        "merge_state_status": text(value.get("mergeStateStatus")),
        "author": text(value.pointer("/author/login")),
        "comments_count": values(value.get("comments")).len(),
        "reviews_count": values(value.get("reviews")).len(),
        "checks": checks,
        "created_at": text(value.get("createdAt")),
        "updated_at": text(value.get("updatedAt")),
    }))
}

fn nullable_text(value: Option<&Value>) -> Option<String> {
    let value = text(value);
    (!value.is_empty()).then(|| value.to_string())
}

async fn require_current_pull_request(cwd: &str, number: i64) -> Result<Value, PluginError> {
    let current = current_pull_request(cwd).await?;
    if current.is_null() || integer(current.get("number")) != number {
        return Err(PluginError::new(format!(
            "PR #{number} is no longer linked to the current branch"
        )));
    }
    Ok(current)
}

async fn search_pull_requests(relation: &str, qualifier: &str) -> Result<Vec<Value>, PluginError> {
    let field = format!("--json={SEARCH_FIELDS}");
    let raw = run_gh_json(
        &[
            "search",
            "prs",
            "--state=open",
            qualifier,
            "--limit=50",
            "--sort=updated",
            "--order=desc",
            &field,
        ],
        None,
        60,
    )
    .await?;
    Ok(values(Some(&raw))
        .iter()
        .filter_map(|value| search_summary(value, relation))
        .collect())
}

fn search_summary(value: &Value, relation: &str) -> Option<Value> {
    let url = text(value.get("url"));
    let number = integer(value.get("number"));
    let owner = text(value.pointer("/repository/nameWithOwner"));
    if url.is_empty() || number <= 0 || owner.is_empty() {
        return None;
    }
    let name = {
        let value = text(value.pointer("/repository/name"));
        if value.is_empty() {
            owner.rsplit('/').next().unwrap_or(owner)
        } else {
            value
        }
    };
    let labels = values(value.get("labels"))
        .iter()
        .filter_map(|label| {
            let name = text(label.get("name"));
            (!name.is_empty()).then(|| json!({ "name": name, "color": text(label.get("color")) }))
        })
        .collect::<Vec<_>>();
    let author_login = text(value.pointer("/author/login"));
    let author_login = if author_login.is_empty() {
        "unknown"
    } else {
        author_login
    };
    Some(json!({
        "id": url,
        "number": number,
        "title": text(value.get("title")),
        "url": url,
        "repository": { "name": name, "nameWithOwner": owner },
        "author": { "login": author_login },
        "isDraft": boolean(value.get("isDraft")),
        "updatedAt": text(value.get("updatedAt")),
        "createdAt": text(value.get("createdAt")),
        "labels": labels,
        "commentsCount": integer(value.get("commentsCount")),
        "authored": relation == "authored",
        "reviewRequested": relation == "reviewRequested",
        "reviewed": relation == "reviewed",
    }))
}

fn parse_summary(value: &Value) -> Result<Value, PluginError> {
    let relation = if boolean(value.get("reviewRequested")) {
        "reviewRequested"
    } else if boolean(value.get("reviewed")) {
        "reviewed"
    } else {
        "authored"
    };
    let mut summary = search_summary(value, relation)
        .ok_or_else(|| PluginError::new("Pull request selection is invalid"))?;
    summary["authored"] = Value::Bool(boolean(value.get("authored")));
    summary["reviewRequested"] = Value::Bool(boolean(value.get("reviewRequested")));
    summary["reviewed"] = Value::Bool(boolean(value.get("reviewed")));
    Ok(summary)
}

fn pull_request_coordinates(url: &str) -> Result<(&str, &str, i64), PluginError> {
    let Some(path) = url.strip_prefix("https://github.com/") else {
        return Err(PluginError::new(
            "Only canonical github.com pull request URLs are supported",
        ));
    };
    let parts = path.split('/').collect::<Vec<_>>();
    if parts.len() != 4 || parts[2] != "pull" {
        return Err(PluginError::new(
            "Only canonical github.com pull request URLs are supported",
        ));
    }
    let number = parts[3]
        .parse::<i64>()
        .ok()
        .and_then(|number| (number > 0).then_some(number))
        .ok_or_else(|| {
            PluginError::new("Only canonical github.com pull request URLs are supported")
        })?;
    Ok((parts[0], parts[1], number))
}

fn detail_from_json(value: &Value, summary: &Value) -> Result<Value, PluginError> {
    let mut reviewers = HashMap::<String, String>::new();
    for request in values(value.get("reviewRequests")) {
        let login = {
            let direct = text(request.get("login"));
            if direct.is_empty() {
                text(request.pointer("/author/login"))
            } else {
                direct
            }
        };
        if !login.is_empty() {
            reviewers.insert(login.to_string(), "REQUESTED".into());
        }
    }
    for review in values(value.get("latestReviews")) {
        let login = text(review.pointer("/author/login"));
        if !login.is_empty() {
            let state = text(review.get("state"));
            reviewers.insert(
                login.to_string(),
                if state.is_empty() {
                    "REVIEWED".into()
                } else {
                    state.into()
                },
            );
        }
    }
    let mut reviewers = reviewers
        .into_iter()
        .map(|(login, state)| json!({"login": login, "state": state}))
        .collect::<Vec<_>>();
    reviewers.sort_by(|left, right| text(left.get("login")).cmp(text(right.get("login"))));
    let checks = values(value.get("statusCheckRollup"))
        .iter()
        .map(|check| {
            let name = text(check.get("name"));
            let name = if name.is_empty() {
                let context = text(check.get("context"));
                if context.is_empty() { "Check" } else { context }
            } else {
                name
            };
            let status = text(check.get("status"));
            let status = if status.is_empty() {
                text(check.get("state"))
            } else {
                status
            };
            json!({
                "name": name,
                "status": status,
                "conclusion": text(check.get("conclusion")),
                "detailsUrl": nullable_text(check.get("detailsUrl")).or_else(|| nullable_text(check.get("targetUrl"))),
            })
        })
        .collect::<Vec<_>>();
    let files = values(value.get("files"))
        .iter()
        .filter_map(|file| {
            let path = text(file.get("path"));
            (!path.is_empty()).then(|| {
                json!({
                    "path": path,
                    "additions": integer(file.get("additions")),
                    "deletions": integer(file.get("deletions")),
                    "changeType": text(file.get("changeType")),
                })
            })
        })
        .collect::<Vec<_>>();
    let base = summary.as_object().cloned().unwrap_or_default();
    let mut detail = Map::from_iter(base);
    let fallback_comments = integer(summary.get("commentsCount"));
    let number = {
        let number = integer(value.get("number"));
        if number > 0 {
            number
        } else {
            integer(summary.get("number"))
        }
    };
    let comments_count = {
        let count = values(value.get("comments")).len() as i64;
        if count > 0 {
            count
        } else {
            fallback_comments
        }
    };
    let author = nonempty(
        text(value.pointer("/author/login")),
        text(summary.pointer("/author/login")),
    );
    let is_draft = value
        .get("isDraft")
        .and_then(Value::as_bool)
        .unwrap_or_else(|| boolean(summary.get("isDraft")));
    detail.extend(Map::from_iter([
        (
            "title".into(),
            json!(nonempty(
                text(value.get("title")),
                text(summary.get("title"))
            )),
        ),
        (
            "url".into(),
            json!(nonempty(text(value.get("url")), text(summary.get("url")))),
        ),
        ("number".into(), json!(number)),
        ("author".into(), json!({ "login": author })),
        ("isDraft".into(), json!(is_draft)),
        (
            "updatedAt".into(),
            json!(nonempty(
                text(value.get("updatedAt")),
                text(summary.get("updatedAt"))
            )),
        ),
        ("body".into(), json!(text(value.get("body")))),
        ("additions".into(), json!(integer(value.get("additions")))),
        ("deletions".into(), json!(integer(value.get("deletions")))),
        (
            "changedFiles".into(),
            json!(integer(value.get("changedFiles"))),
        ),
        ("baseRefName".into(), json!(text(value.get("baseRefName")))),
        ("headRefName".into(), json!(text(value.get("headRefName")))),
        ("state".into(), json!(text(value.get("state")))),
        (
            "mergeStateStatus".into(),
            json!(text(value.get("mergeStateStatus"))),
        ),
        ("mergeable".into(), json!(text(value.get("mergeable")))),
        (
            "reviewDecision".into(),
            json!(text(value.get("reviewDecision"))),
        ),
        ("commentsCount".into(), json!(comments_count)),
        ("reviewers".into(), json!(reviewers)),
        ("checks".into(), json!(checks)),
        ("files".into(), json!(files)),
    ]));
    Ok(Value::Object(detail))
}

fn nonempty<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    if value.is_empty() {
        fallback
    } else {
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_canonical_github_pull_request_urls() {
        assert_eq!(
            pull_request_coordinates("https://github.com/openai/codex/pull/42").unwrap(),
            ("openai", "codex", 42)
        );
        assert!(pull_request_coordinates("https://example.com/openai/codex/pull/42").is_err());
        assert!(pull_request_coordinates("https://github.com/openai/codex/issues/42").is_err());
        assert!(pull_request_coordinates("https://github.com/openai/codex/pull/42/files").is_err());
    }

    #[test]
    fn normalizes_check_union_without_leaking_gh_shapes() {
        let normalized = normalize_current_pull_request(&json!({
            "number": 7,
            "statusCheckRollup": [{"context": "lint", "state": "SUCCESS", "targetUrl": "https://example.test"}]
        }))
        .unwrap();
        assert_eq!(normalized.pointer("/checks/0/name"), Some(&json!("lint")));
        assert_eq!(
            normalized.pointer("/checks/0/conclusion"),
            Some(&json!("SUCCESS"))
        );
    }

    #[test]
    fn detail_refreshes_mutable_summary_fields_and_sorts_reviewers() {
        let summary = search_summary(
            &json!({
                "number": 7,
                "title": "Before",
                "url": "https://github.com/openai/codex/pull/7",
                "repository": {"name": "codex", "nameWithOwner": "openai/codex"},
                "author": {"login": "old-author"},
                "isDraft": true,
                "updatedAt": "2026-01-01T00:00:00Z"
            }),
            "authored",
        )
        .unwrap();
        let detail = detail_from_json(
            &json!({
                "number": 7,
                "author": {"login": "new-author"},
                "isDraft": false,
                "updatedAt": "2026-02-01T00:00:00Z",
                "reviewRequests": [{"login": "zoe"}, {"login": "amy"}],
                "latestReviews": [{"author": {"login": "zoe"}, "state": "APPROVED"}]
            }),
            &summary,
        )
        .unwrap();

        assert_eq!(detail.pointer("/author/login"), Some(&json!("new-author")));
        assert_eq!(detail.get("isDraft"), Some(&json!(false)));
        assert_eq!(
            detail.get("updatedAt"),
            Some(&json!("2026-02-01T00:00:00Z"))
        );
        assert_eq!(detail.pointer("/reviewers/0/login"), Some(&json!("amy")));
        assert_eq!(
            detail.pointer("/reviewers/1/state"),
            Some(&json!("APPROVED"))
        );
    }
}
