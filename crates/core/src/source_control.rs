//! Provider-aware source-control operations.
//!
//! Git owns the local repository and index. This module owns the smaller hosted-source-control
//! seam: inspect the selected push remote, describe its capabilities without leaking credentials,
//! and dispatch change-request operations to the right provider implementation.

use std::path::Path;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tokio::process::Command;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum SourceControlProviderKind {
    #[serde(rename = "github")]
    GitHub,
    #[serde(rename = "gitlab")]
    GitLab,
    #[serde(rename = "azure-devops")]
    AzureDevOps,
    #[serde(rename = "bitbucket")]
    Bitbucket,
    #[serde(rename = "unknown")]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SourceControlInfo {
    /// The local git remote selected for hosted operations. `origin` wins; otherwise a sole remote
    /// is accepted. Multiple non-origin remotes are deliberately ambiguous.
    pub remote_name: String,
    pub provider: SourceControlProviderKind,
    pub provider_name: String,
    /// Host only (plus an explicit port), never remote credentials or query parameters.
    pub host: String,
    /// A credential-free repository URL suitable for presenting or opening in a browser.
    pub web_url: Option<String>,
    /// Provider-native terminology (`PR`, `MR`, or `change request`).
    pub change_request_label: String,
    /// Whether this build has an adapter capable of creating a change request for the provider.
    pub create_change_request_supported: bool,
    /// External CLI required by that adapter, when one exists.
    pub required_cli: Option<String>,
    /// Local executable availability only; authentication is checked by the provider CLI itself.
    pub required_cli_available: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ParsedRemote {
    host: String,
    hostname: String,
    path: String,
}

/// Inspect the push remote used for hosted source-control operations.
///
/// This is local-only: it reads git config and never contacts the remote or provider CLI. `None`
/// means the repository has no configured remotes.
pub async fn inspect(cwd: &Path) -> std::io::Result<Option<SourceControlInfo>> {
    let names = git_lines(cwd, &["remote"]).await?;
    let remote_name = match names.as_slice() {
        [] => return Ok(None),
        names if names.iter().any(|name| name == "origin") => "origin".to_string(),
        [only] => only.clone(),
        _ => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "multiple git remotes are configured but none is named origin",
            ));
        }
    };

    let push_urls = git_lines(cwd, &["remote", "get-url", "--push", "--all", &remote_name]).await?;
    let remote_url = match push_urls.as_slice() {
        [] => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("git remote {remote_name} has no push URL"),
            ));
        }
        [remote_url] => remote_url,
        _ => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!(
                    "git remote {remote_name} has multiple push URLs; choose one before creating a change request"
                ),
            ));
        }
    };
    let parsed = parse_remote_url(remote_url).ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("git remote {remote_name} is local or has an unsupported URL shape"),
        )
    })?;
    let mut info = info_from_parsed(remote_name, parsed);
    info.required_cli_available = info
        .required_cli
        .as_deref()
        .is_some_and(|command| crate::provider::which(command).is_some());
    Ok(Some(info))
}

/// Create a hosted change request through the provider adapter selected by [`inspect`].
///
/// Unsupported providers fail before pushing. That keeps a "Create" action from silently turning
/// into a plain push and, crucially, prevents every remote from being misreported to `gh`.
pub async fn create_change_request(cwd: &Path, title: &str, body: &str) -> std::io::Result<String> {
    create_change_request_with_runner(cwd, title, body, &SystemCommandRunner).await
}

async fn create_change_request_with_runner(
    cwd: &Path,
    title: &str,
    body: &str,
    runner: &dyn SourceControlCommandRunner,
) -> std::io::Result<String> {
    let info = inspect(cwd).await?.ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "no git remote is configured for change-request creation",
        )
    })?;
    if !info.create_change_request_supported {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            format!(
                "{} remote detected at {}; creating a {} is not enabled in this CodeTwo build",
                info.provider_name, info.host, info.change_request_label
            ),
        ));
    }
    if let Some(command) = info
        .required_cli
        .as_deref()
        .filter(|command| !runner.command_available(command))
    {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!(
                "{} requires the {command} command, but it is not available on PATH",
                info.provider_name
            ),
        ));
    }

    runner
        .git(cwd, &["push", "-u", &info.remote_name, "HEAD"])
        .await?;
    let url = runner
        .gh(cwd, &["pr", "create", "--title", title, "--body", body])
        .await?;
    if url.is_empty() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "gh created a pull request but returned no URL",
        ));
    }
    Ok(url)
}

#[async_trait]
trait SourceControlCommandRunner: Send + Sync {
    fn command_available(&self, command: &str) -> bool;
    async fn git(&self, cwd: &Path, args: &[&str]) -> std::io::Result<String>;
    async fn gh(&self, cwd: &Path, args: &[&str]) -> std::io::Result<String>;
}

struct SystemCommandRunner;

#[async_trait]
impl SourceControlCommandRunner for SystemCommandRunner {
    fn command_available(&self, command: &str) -> bool {
        crate::provider::which(command).is_some()
    }

    async fn git(&self, cwd: &Path, args: &[&str]) -> std::io::Result<String> {
        run_git(cwd, args).await
    }

    async fn gh(&self, cwd: &Path, args: &[&str]) -> std::io::Result<String> {
        let executable = crate::provider::which("gh").ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::NotFound, "gh is not available on PATH")
        })?;
        let output = Command::new(executable)
            .args(args)
            .current_dir(cwd)
            .output()
            .await?;
        if !output.status.success() {
            return Err(command_error(&output.stderr));
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
}

fn info_from_parsed(remote_name: String, parsed: ParsedRemote) -> SourceControlInfo {
    let provider = provider_from_hostname(&parsed.hostname);
    let provider_name = match provider {
        SourceControlProviderKind::GitHub => "GitHub".to_string(),
        SourceControlProviderKind::GitLab => "GitLab".to_string(),
        SourceControlProviderKind::AzureDevOps => "Azure DevOps".to_string(),
        SourceControlProviderKind::Bitbucket => "Bitbucket".to_string(),
        SourceControlProviderKind::Unknown => parsed.host.clone(),
    };
    let change_request_label = match provider {
        SourceControlProviderKind::GitLab => "MR",
        SourceControlProviderKind::Unknown => "change request",
        _ => "PR",
    }
    .to_string();
    SourceControlInfo {
        remote_name,
        provider,
        provider_name,
        host: parsed.host.clone(),
        web_url: web_url(&parsed),
        change_request_label,
        create_change_request_supported: provider == SourceControlProviderKind::GitHub,
        required_cli: (provider == SourceControlProviderKind::GitHub).then(|| "gh".to_string()),
        required_cli_available: false,
    }
}

fn provider_from_hostname(hostname: &str) -> SourceControlProviderKind {
    // A brand-shaped substring is not proof of a provider. Self-hosted installations can use any
    // domain, so they stay Unknown until CodeTwo has an explicit host configuration surface.
    if hostname == "github.com" {
        SourceControlProviderKind::GitHub
    } else if hostname == "gitlab.com" {
        SourceControlProviderKind::GitLab
    } else if hostname == "dev.azure.com"
        || hostname == "ssh.dev.azure.com"
        || hostname.ends_with(".visualstudio.com")
    {
        SourceControlProviderKind::AzureDevOps
    } else if hostname == "bitbucket.org" {
        SourceControlProviderKind::Bitbucket
    } else {
        SourceControlProviderKind::Unknown
    }
}

fn parse_remote_url(value: &str) -> Option<ParsedRemote> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }

    if let Some(scheme_end) = value.find("://") {
        let scheme = value[..scheme_end].to_ascii_lowercase();
        if !matches!(
            scheme.as_str(),
            "http" | "https" | "ssh" | "git" | "git+ssh"
        ) {
            return None;
        }
        let remainder = &value[scheme_end + 3..];
        let authority_end = remainder.find(['/', '?', '#']).unwrap_or(remainder.len());
        let authority = &remainder[..authority_end];
        let host = authority
            .rsplit_once('@')
            .map_or(authority, |(_, host)| host);
        let hostname = hostname_without_port(host)?;
        let path = remainder
            .get(authority_end..)
            .unwrap_or_default()
            .trim_start_matches('/');
        return Some(ParsedRemote {
            host: host.to_ascii_lowercase(),
            hostname,
            path: clean_remote_path(path),
        });
    }

    // SCP-like SSH remotes: `git@host:owner/repository.git`. Local paths (including Windows
    // drive paths) deliberately do not pass this branch.
    let has_user = value.contains('@');
    let after_user = value.rsplit_once('@').map_or(value, |(_, rest)| rest);
    let separator = if has_user {
        after_user.find(':').or_else(|| after_user.find('/'))?
    } else {
        // Without a scheme or SSH user, only the unambiguous `host:path` form is remote. Treat
        // `directory/repository` as a local path.
        after_user.find(':')?
    };
    let host = &after_user[..separator];
    if host.len() == 1 || host.contains(std::path::MAIN_SEPARATOR) {
        return None;
    }
    let hostname = hostname_without_port(host)?;
    Some(ParsedRemote {
        host: host.to_ascii_lowercase(),
        hostname,
        path: clean_remote_path(&after_user[separator + 1..]),
    })
}

fn hostname_without_port(host: &str) -> Option<String> {
    let host = host.trim();
    if host.is_empty() {
        return None;
    }
    if let Some(bracketed) = host.strip_prefix('[') {
        return bracketed
            .split_once(']')
            .map(|(hostname, _)| hostname.to_ascii_lowercase())
            .filter(|hostname| !hostname.is_empty());
    }
    let hostname = host
        .rsplit_once(':')
        .filter(|(_, port)| {
            !port.is_empty() && port.chars().all(|character| character.is_ascii_digit())
        })
        .map_or(host, |(hostname, _)| hostname);
    (!hostname.is_empty()).then(|| hostname.to_ascii_lowercase())
}

fn clean_remote_path(path: &str) -> String {
    let end = path.find(['?', '#']).unwrap_or(path.len());
    path[..end]
        .trim_matches('/')
        .strip_suffix(".git")
        .unwrap_or(path[..end].trim_matches('/'))
        .to_string()
}

fn web_url(remote: &ParsedRemote) -> Option<String> {
    if remote.path.is_empty() {
        return Some(format!("https://{}", remote.host));
    }
    if remote.hostname == "ssh.dev.azure.com" {
        let segments: Vec<&str> = remote.path.split('/').collect();
        if let ["v3", organization, project, repository] = segments.as_slice() {
            return Some(format!(
                "https://dev.azure.com/{organization}/{project}/_git/{repository}"
            ));
        }
    }
    Some(format!("https://{}/{}", remote.host, remote.path))
}

async fn git_lines(cwd: &Path, args: &[&str]) -> std::io::Result<Vec<String>> {
    let output = Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .output()
        .await?;
    if !output.status.success() {
        return Err(command_error(&output.stderr));
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

async fn run_git(cwd: &Path, args: &[&str]) -> std::io::Result<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .output()
        .await?;
    if !output.status.success() {
        return Err(command_error(&output.stderr));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn command_error(stderr: &[u8]) -> std::io::Error {
    let message = String::from_utf8_lossy(stderr).trim().to_string();
    std::io::Error::other(if message.is_empty() {
        "source-control command failed".to_string()
    } else {
        message
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn parses_https_without_exposing_credentials_or_query() {
        let parsed = parse_remote_url(
            "https://user:secret@github.com/owner/repository.git?token=hidden#fragment",
        )
        .unwrap();
        assert_eq!(parsed.host, "github.com");
        assert_eq!(parsed.hostname, "github.com");
        assert_eq!(parsed.path, "owner/repository");
        let info = info_from_parsed("origin".into(), parsed);
        assert_eq!(info.provider, SourceControlProviderKind::GitHub);
        assert_eq!(
            info.web_url.as_deref(),
            Some("https://github.com/owner/repository")
        );
        assert!(!format!("{info:?}").contains("secret"));
    }

    #[test]
    fn parses_scp_and_provider_terminology() {
        let parsed = parse_remote_url("git@gitlab.com:group/repository.git").unwrap();
        let info = info_from_parsed("upstream".into(), parsed);
        assert_eq!(info.provider, SourceControlProviderKind::GitLab);
        assert_eq!(info.change_request_label, "MR");
        assert!(!info.create_change_request_supported);
        assert_eq!(
            info.web_url.as_deref(),
            Some("https://gitlab.com/group/repository")
        );
    }

    #[test]
    fn parses_azure_ssh_repository_url() {
        let parsed =
            parse_remote_url("ssh://git@ssh.dev.azure.com/v3/example/project/repository.git")
                .unwrap();
        let info = info_from_parsed("origin".into(), parsed);
        assert_eq!(info.provider, SourceControlProviderKind::AzureDevOps);
        assert_eq!(
            info.web_url.as_deref(),
            Some("https://dev.azure.com/example/project/_git/repository")
        );
    }

    #[test]
    fn classifies_only_authoritative_provider_hosts() {
        assert_eq!(
            provider_from_hostname("bitbucket.org"),
            SourceControlProviderKind::Bitbucket
        );
        for adversarial in [
            "notgithub.example",
            "github.example",
            "gitlab.attacker.test",
            "bitbucket.internal.example",
            "code.example.test",
        ] {
            assert_eq!(
                provider_from_hostname(adversarial),
                SourceControlProviderKind::Unknown,
                "{adversarial} must not inherit a provider adapter"
            );
        }
    }

    #[test]
    fn provider_kind_wire_values_match_frontend_contract() {
        assert_eq!(
            serde_json::to_string(&SourceControlProviderKind::GitHub).unwrap(),
            "\"github\""
        );
        assert_eq!(
            serde_json::to_string(&SourceControlProviderKind::GitLab).unwrap(),
            "\"gitlab\""
        );
        assert_eq!(
            serde_json::to_string(&SourceControlProviderKind::AzureDevOps).unwrap(),
            "\"azure-devops\""
        );
    }

    #[test]
    fn rejects_local_paths() {
        assert!(parse_remote_url("../other-repository").is_none());
        assert!(parse_remote_url("/tmp/repository.git").is_none());
        assert!(parse_remote_url("C:\\work\\repository").is_none());
        assert!(parse_remote_url("file://github.com/owner/repository.git").is_none());
        assert!(parse_remote_url("ftp://github.com/owner/repository.git").is_none());
    }

    #[tokio::test]
    async fn inspect_prefers_origin_and_never_returns_remote_secrets() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("inspect-origin");
        repo.git(&[
            "remote",
            "add",
            "backup",
            "git@bitbucket.org:team/backup.git",
        ]);
        repo.git(&[
            "remote",
            "add",
            "origin",
            "https://user:secret@github.com/owner/repository.git?token=hidden",
        ]);
        let info = inspect(&repo.path).await.unwrap().unwrap();
        assert_eq!(info.remote_name, "origin");
        assert_eq!(info.provider, SourceControlProviderKind::GitHub);
        assert_eq!(info.host, "github.com");
        assert!(!format!("{info:?}").contains("secret"));
        assert!(!format!("{info:?}").contains("hidden"));
    }

    #[tokio::test]
    async fn multiple_non_origin_remotes_are_ambiguous() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("ambiguous");
        repo.git(&["remote", "add", "one", "git@github.com:owner/one.git"]);
        repo.git(&["remote", "add", "two", "git@gitlab.com:owner/two.git"]);
        let error = inspect(&repo.path).await.unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
        assert!(error.to_string().contains("multiple git remotes"));
    }

    #[tokio::test]
    async fn multiple_push_urls_are_ambiguous() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("ambiguous-push-urls");
        repo.git(&[
            "remote",
            "add",
            "origin",
            "git@github.com:owner/repository.git",
        ]);
        repo.git(&[
            "remote",
            "set-url",
            "--add",
            "--push",
            "origin",
            "git@github.com:owner/repository.git",
        ]);
        repo.git(&[
            "remote",
            "set-url",
            "--add",
            "--push",
            "origin",
            "git@gitlab.com:owner/repository.git",
        ]);
        let error = inspect(&repo.path).await.unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
        assert!(error.to_string().contains("multiple push URLs"));
    }

    #[tokio::test]
    async fn unsupported_provider_fails_before_any_push() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("unsupported-provider");
        repo.git(&[
            "remote",
            "add",
            "origin",
            "https://gitlab.com/example/repository.git",
        ]);
        let error = create_change_request(&repo.path, "title", "body")
            .await
            .unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::Unsupported);
        assert!(error.to_string().contains("GitLab"));
        let upstream = repo.git_output(&[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ]);
        assert!(
            !upstream.status.success(),
            "unsupported action unexpectedly pushed"
        );
    }

    #[tokio::test]
    async fn adversarial_brand_host_never_reaches_github_adapter() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("adversarial-host");
        repo.git(&[
            "remote",
            "add",
            "origin",
            "https://notgithub.example/owner/repository.git",
        ]);
        let runner =
            RecordingRunner::new(Ok("must not push".into()), Ok("must not invoke gh".into()));
        let error = create_change_request_with_runner(&repo.path, "Title", "Body", &runner)
            .await
            .unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::Unsupported);
        assert!(runner.commands().is_empty());
    }

    #[tokio::test]
    async fn github_adapter_pushes_selected_remote_before_invoking_gh() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("github-adapter");
        repo.git(&[
            "remote",
            "add",
            "upstream",
            "git@github.com:owner/repository.git",
        ]);
        let runner = RecordingRunner::new(
            Ok("pushed".into()),
            Ok("https://github.com/owner/repository/pull/42".into()),
        );
        let url = create_change_request_with_runner(&repo.path, "Title", "Body", &runner)
            .await
            .unwrap();
        assert_eq!(url, "https://github.com/owner/repository/pull/42");
        assert_eq!(
            runner.commands(),
            vec![
                vec!["git", "push", "-u", "upstream", "HEAD"],
                vec!["gh", "pr", "create", "--title", "Title", "--body", "Body"],
            ]
        );
    }

    #[tokio::test]
    async fn github_adapter_does_not_invoke_gh_after_push_failure() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("github-push-failure");
        repo.git(&[
            "remote",
            "add",
            "origin",
            "git@github.com:owner/repository.git",
        ]);
        let runner = RecordingRunner::new(
            Err(std::io::Error::other("push failed")),
            Ok("must not be returned".into()),
        );
        let error = create_change_request_with_runner(&repo.path, "Title", "Body", &runner)
            .await
            .unwrap_err();
        assert_eq!(error.to_string(), "push failed");
        assert_eq!(
            runner.commands(),
            vec![vec!["git", "push", "-u", "origin", "HEAD"]]
        );
    }

    #[tokio::test]
    async fn missing_provider_cli_fails_before_push() {
        if crate::provider::which("git").is_none() {
            return;
        }
        let repo = TestRepo::new("missing-provider-cli");
        repo.git(&[
            "remote",
            "add",
            "origin",
            "git@github.com:owner/repository.git",
        ]);
        let runner = RecordingRunner::unavailable();
        let error = create_change_request_with_runner(&repo.path, "Title", "Body", &runner)
            .await
            .unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::NotFound);
        assert!(error.to_string().contains("gh"));
        assert!(runner.commands().is_empty());
    }

    struct RecordingRunner {
        commands: Mutex<Vec<Vec<String>>>,
        git_result: Mutex<Option<std::io::Result<String>>>,
        gh_result: Mutex<Option<std::io::Result<String>>>,
        available: bool,
    }

    impl RecordingRunner {
        fn new(git_result: std::io::Result<String>, gh_result: std::io::Result<String>) -> Self {
            Self {
                commands: Mutex::new(Vec::new()),
                git_result: Mutex::new(Some(git_result)),
                gh_result: Mutex::new(Some(gh_result)),
                available: true,
            }
        }

        fn unavailable() -> Self {
            Self {
                commands: Mutex::new(Vec::new()),
                git_result: Mutex::new(Some(Ok(String::new()))),
                gh_result: Mutex::new(Some(Ok(String::new()))),
                available: false,
            }
        }

        fn commands(&self) -> Vec<Vec<String>> {
            self.commands.lock().unwrap().clone()
        }
    }

    #[async_trait]
    impl SourceControlCommandRunner for RecordingRunner {
        fn command_available(&self, _command: &str) -> bool {
            self.available
        }

        async fn git(&self, _cwd: &Path, args: &[&str]) -> std::io::Result<String> {
            self.commands.lock().unwrap().push(
                std::iter::once("git".to_string())
                    .chain(args.iter().map(|arg| (*arg).to_string()))
                    .collect(),
            );
            self.git_result.lock().unwrap().take().unwrap()
        }

        async fn gh(&self, _cwd: &Path, args: &[&str]) -> std::io::Result<String> {
            self.commands.lock().unwrap().push(
                std::iter::once("gh".to_string())
                    .chain(args.iter().map(|arg| (*arg).to_string()))
                    .collect(),
            );
            self.gh_result.lock().unwrap().take().unwrap()
        }
    }

    struct TestRepo {
        path: std::path::PathBuf,
    }

    impl TestRepo {
        fn new(label: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "codetwo-source-control-{label}-{}-{nonce}",
                std::process::id()
            ));
            std::fs::create_dir_all(&path).unwrap();
            let repo = Self { path };
            repo.git(&["init", "-q"]);
            repo
        }

        fn git(&self, args: &[&str]) {
            let output = self.git_output(args);
            assert!(
                output.status.success(),
                "git {:?} failed: {}",
                args,
                String::from_utf8_lossy(&output.stderr)
            );
        }

        fn git_output(&self, args: &[&str]) -> std::process::Output {
            std::process::Command::new("git")
                .arg("-C")
                .arg(&self.path)
                .args(args)
                .output()
                .unwrap()
        }
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }
}
