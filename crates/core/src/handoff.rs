//! Durable task transfer between C2 runtimes.
//!
//! One portable payload carries the session, transcript, Git commit graph, staged/unstaged binary
//! patches, and non-ignored untracked files. A monotonic source/target fence ensures only one
//! device may continue the task even when activation or rollback crosses an unreliable network.

use std::ffi::OsStr;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::Duration;

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::sync::broadcast;

use crate::event::Event;
use crate::session::{Session, SessionActivity, TranscriptEntry};
use crate::{Engine, Store};

const HANDOFF_VERSION: u32 = 1;
const MAX_BUNDLE_BYTES: usize = 256 * 1024 * 1024;
const MAX_HANDOFF_BODY_BYTES: usize = 384 * 1024 * 1024;
const MARKER_FILE: &str = "codetwo-handoff.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UntrackedEntry {
    pub path: String,
    pub kind: UntrackedKind,
    pub mode: u32,
    pub data: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UntrackedKind {
    File,
    Symlink,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBundle {
    pub baseline: String,
    pub repository_bundle: String,
    pub staged_patch: String,
    pub worktree_patch: String,
    pub untracked: Vec<UntrackedEntry>,
    pub relative_cwd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UnsignedTaskHandoff {
    version: u32,
    id: String,
    epoch: u64,
    session_id: String,
    created_at: String,
    session: Session,
    parts: Vec<TranscriptEntry>,
    source_activity: SessionActivity,
    workspace: WorkspaceBundle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableTaskHandoff {
    pub version: u32,
    pub id: String,
    pub epoch: u64,
    pub session_id: String,
    pub created_at: String,
    pub session: Session,
    pub parts: Vec<TranscriptEntry>,
    pub source_activity: SessionActivity,
    pub workspace: WorkspaceBundle,
    pub checksum: String,
}

impl PortableTaskHandoff {
    fn unsigned(&self) -> UnsignedTaskHandoff {
        UnsignedTaskHandoff {
            version: self.version,
            id: self.id.clone(),
            epoch: self.epoch,
            session_id: self.session_id.clone(),
            created_at: self.created_at.clone(),
            session: self.session.clone(),
            parts: self.parts.clone(),
            source_activity: self.source_activity.clone(),
            workspace: self.workspace.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TaskHandoffResult {
    pub session: String,
    pub handoff: String,
    pub epoch: u64,
    pub destination: String,
    pub state: String,
}

#[derive(Clone)]
pub struct TaskHandoffManager {
    store: Arc<Store>,
    engine: Arc<Engine>,
    events: Option<broadcast::Sender<Event>>,
    client: reqwest::Client,
}

impl TaskHandoffManager {
    pub fn new(
        store: Arc<Store>,
        engine: Arc<Engine>,
        events: Option<broadcast::Sender<Event>>,
    ) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(120))
            .redirect(reqwest::redirect::Policy::limited(4))
            .build()
            .map_err(|error| format!("could not initialize task-transfer HTTP client: {error}"))?;
        Ok(Self {
            store,
            engine,
            events,
            client,
        })
    }

    pub async fn prepare(&self, session_id: &str) -> Result<PortableTaskHandoff, String> {
        let handoff_id = uuid::Uuid::new_v4().to_string();
        let prepared = self
            .engine
            .prepare_handoff(session_id, &handoff_id)
            .map_err(|error| error.to_string())?;
        let workspace = match capture_workspace(Path::new(&prepared.session.cwd)) {
            Ok(workspace) => workspace,
            Err(error) => {
                let rollback =
                    self.store
                        .rollback_source_handoff(session_id, &handoff_id, prepared.epoch);
                self.engine.release_handoff_fence(session_id);
                return match rollback {
                    Ok(()) => Err(error),
                    Err(rollback) => Err(format!(
                        "{error}; source handoff rollback failed: {rollback}"
                    )),
                };
            }
        };
        let unsigned = UnsignedTaskHandoff {
            version: HANDOFF_VERSION,
            id: handoff_id,
            epoch: prepared.epoch,
            session_id: session_id.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            session: prepared.session,
            parts: prepared.parts,
            source_activity: prepared.source_activity,
            workspace,
        };
        let checksum = checksum(&unsigned)?;
        Ok(PortableTaskHandoff {
            version: unsigned.version,
            id: unsigned.id,
            epoch: unsigned.epoch,
            session_id: unsigned.session_id,
            created_at: unsigned.created_at,
            session: unsigned.session,
            parts: unsigned.parts,
            source_activity: unsigned.source_activity,
            workspace: unsigned.workspace,
            checksum,
        })
    }

    pub fn accept(
        &self,
        handoff: &PortableTaskHandoff,
        destination: &str,
    ) -> Result<TaskHandoffResult, String> {
        verify_handoff(handoff)?;
        let destination_path = absolute_path(Path::new(destination))?;
        let destination_existed = destination_path.exists();
        let cwd = apply_workspace(handoff, Path::new(destination))?;
        let context = json!({
            "sourceActivity": &handoff.source_activity,
            "transcript": &handoff.parts,
            "transferredAt": &handoff.created_at,
        });
        if let Err(error) = self.store.accept_handoff(
            &handoff.id,
            handoff.epoch,
            &handoff.session,
            &handoff.parts,
            &cwd.to_string_lossy(),
            &context,
        ) {
            if !destination_existed && marker_matches(&destination_path, handoff) {
                let _ = std::fs::remove_dir_all(&destination_path);
            }
            return Err(error.to_string());
        }
        Ok(TaskHandoffResult {
            session: handoff.session_id.clone(),
            handoff: handoff.id.clone(),
            epoch: handoff.epoch,
            destination: destination.to_string(),
            state: "accepted".into(),
        })
    }

    pub fn activate(&self, session_id: &str, handoff_id: &str, epoch: u64) -> Result<(), String> {
        let session = self
            .store
            .activate_target_handoff(session_id, handoff_id, epoch)
            .map_err(|error| error.to_string())?;
        if let Some(events) = &self.events {
            let _ = events.send(Event::SessionCreated {
                session: session.id,
                cwd: session.cwd,
                project_path: session.project_path,
                worktree_path: None,
                worktree_baseline: None,
                request_id: Some(format!("handoff:{handoff_id}")),
            });
        }
        Ok(())
    }

    pub fn rollback_target(
        &self,
        session_id: &str,
        handoff_id: &str,
        epoch: u64,
        destination: &str,
    ) -> Result<(), String> {
        self.store
            .rollback_target_handoff(session_id, handoff_id, epoch)
            .map_err(|error| error.to_string())?;
        let target = absolute_path(Path::new(destination))?;
        if target.exists() {
            let marker = read_marker(&target)?;
            if marker.get("id").and_then(Value::as_str) != Some(handoff_id) {
                return Err("refusing to remove a workspace owned by another handoff".into());
            }
            std::fs::remove_dir_all(&target)
                .map_err(|error| format!("could not remove rolled-back workspace: {error}"))?;
        }
        Ok(())
    }

    pub async fn transfer(
        &self,
        session_id: &str,
        target_url: &str,
        bearer: &str,
        destination: &str,
    ) -> Result<TaskHandoffResult, String> {
        let handoff = self.prepare(session_id).await?;
        let base = target_url.trim_end_matches('/');
        let mut accepted = false;
        let outcome = async {
            let accepted_result: TaskHandoffResult = self
                .response_json(
                    self.client
                        .post(format!("{base}/api/codetwo/handoffs"))
                        .bearer_auth(bearer)
                        .json(&json!({ "handoff": &handoff, "destination": destination }))
                        .send()
                        .await
                        .map_err(|error| format!("remote handoff request failed: {error}"))?,
                )
                .await?;
            if accepted_result.session != handoff.session_id
                || accepted_result.handoff != handoff.id
                || accepted_result.epoch != handoff.epoch
            {
                return Err("remote handoff acceptance did not match the prepared task".into());
            }
            accepted = true;
            self.store
                .commit_source_handoff(&handoff.session_id, &handoff.id, handoff.epoch)
                .map_err(|error| error.to_string())?;
            let _: Value = self
                .response_json(
                    self.client
                        .post(format!(
                            "{base}/api/codetwo/handoffs/{}/activate",
                            url_component(&handoff.id)
                        ))
                        .bearer_auth(bearer)
                        .json(&json!({ "session": &handoff.session_id, "epoch": handoff.epoch }))
                        .send()
                        .await
                        .map_err(|error| format!("remote handoff activation failed: {error}"))?,
                )
                .await?;
            Ok(TaskHandoffResult {
                session: handoff.session_id.clone(),
                handoff: handoff.id.clone(),
                epoch: handoff.epoch,
                destination: destination.to_string(),
                state: "transferred".into(),
            })
        }
        .await;

        match outcome {
            Ok(result) => Ok(result),
            Err(error) => {
                if accepted {
                    let rollback = self
                        .client
                        .post(format!(
                            "{base}/api/codetwo/handoffs/{}/rollback",
                            url_component(&handoff.id)
                        ))
                        .bearer_auth(bearer)
                        .json(&json!({
                            "session": &handoff.session_id,
                            "epoch": handoff.epoch,
                            "destination": destination,
                        }))
                        .send()
                        .await;
                    let rollback = match rollback {
                        Ok(response) => self.response_json::<Value>(response).await.map(|_| ()),
                        Err(error) => Err(error.to_string()),
                    };
                    if let Err(rollback_error) = rollback {
                        return Err(format!(
                            "handoff outcome is indeterminate; source remains fenced to prevent two writers: {error}; target rollback failed: {rollback_error}"
                        ));
                    }
                }
                self.store
                    .rollback_source_handoff(&handoff.session_id, &handoff.id, handoff.epoch)
                    .map_err(|rollback| format!("{error}; source rollback failed: {rollback}"))?;
                self.engine.release_handoff_fence(&handoff.session_id);
                Err(error)
            }
        }
    }

    pub async fn transfer_pairing(
        &self,
        session_id: &str,
        pairing_url: &str,
        destination: &str,
    ) -> Result<TaskHandoffResult, String> {
        let pairing = url::Url::parse(pairing_url.trim())
            .map_err(|_| "pairing URL is invalid".to_string())?;
        if !matches!(pairing.scheme(), "http" | "https") {
            return Err("pairing URL must use HTTP or HTTPS".into());
        }
        let token = pairing
            .fragment()
            .and_then(|fragment| {
                url::form_urlencoded::parse(fragment.as_bytes())
                    .find_map(|(key, value)| (key == "token").then(|| value.into_owned()))
            })
            .or_else(|| {
                pairing
                    .query_pairs()
                    .find_map(|(key, value)| (key == "token").then(|| value.into_owned()))
            })
            .filter(|token| !token.is_empty())
            .ok_or_else(|| "pairing URL does not contain a token".to_string())?;
        let mut base = pairing.clone();
        if let Some(hosted) = pairing
            .query_pairs()
            .find_map(|(key, value)| (key == "host").then(|| value.into_owned()))
        {
            base = url::Url::parse(&hosted)
                .map_err(|_| "pairing URL contains an invalid hosted target".to_string())?;
            if !matches!(base.scheme(), "http" | "https") {
                return Err("pairing target must use HTTP or HTTPS".into());
            }
        }
        base.set_path("/");
        base.set_query(None);
        base.set_fragment(None);
        let base_url = base.as_str().trim_end_matches('/').to_string();

        let descriptor = self
            .client
            .get(format!("{base_url}/.well-known/t3/environment"))
            .send()
            .await
            .map_err(|error| format!("could not reach the target programming agent: {error}"))?;
        if !descriptor.status().is_success() {
            return Err(format!(
                "target is not a compatible C2/T3 programming agent ({})",
                descriptor.status()
            ));
        }
        let exchange: Value = self
            .response_json(
                self.client
                    .post(format!("{base_url}/oauth/token"))
                    .form(&[
                        (
                            "grant_type",
                            "urn:ietf:params:oauth:grant-type:token-exchange",
                        ),
                        (
                            "subject_token_type",
                            "urn:t3:params:oauth:token-type:environment-bootstrap",
                        ),
                        (
                            "requested_token_type",
                            "urn:ietf:params:oauth:token-type:access_token",
                        ),
                        ("subject_token", token.as_str()),
                        ("scope", "orchestration:operate"),
                        ("client_label", "C2 task transfer"),
                        ("client_device_type", "handoff"),
                        ("client_os", std::env::consts::OS),
                    ])
                    .send()
                    .await
                    .map_err(|error| format!("pairing token exchange failed: {error}"))?,
            )
            .await?;
        let bearer = exchange
            .get("access_token")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "target did not return a task-transfer credential".to_string())?;
        self.transfer(session_id, &base_url, bearer, destination)
            .await
    }

    async fn response_json<T: serde::de::DeserializeOwned>(
        &self,
        response: reqwest::Response,
    ) -> Result<T, String> {
        let status = response.status();
        let bytes = response
            .bytes()
            .await
            .map_err(|error| format!("could not read remote handoff response: {error}"))?;
        if bytes.len() > MAX_HANDOFF_BODY_BYTES {
            return Err("remote handoff response is too large".into());
        }
        if !status.is_success() {
            return Err(format!(
                "remote handoff failed ({status}): {}",
                String::from_utf8_lossy(&bytes)
            ));
        }
        serde_json::from_slice(&bytes)
            .map_err(|error| format!("remote handoff returned invalid JSON: {error}"))
    }
}

fn checksum(unsigned: &UnsignedTaskHandoff) -> Result<String, String> {
    let bytes = serde_json::to_vec(unsigned)
        .map_err(|error| format!("could not serialize task handoff: {error}"))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn verify_handoff(handoff: &PortableTaskHandoff) -> Result<(), String> {
    if handoff.version != HANDOFF_VERSION {
        return Err(format!("unsupported handoff version: {}", handoff.version));
    }
    let parsed =
        uuid::Uuid::parse_str(&handoff.id).map_err(|_| "task handoff id is invalid".to_string())?;
    if parsed.hyphenated().to_string() != handoff.id.to_ascii_lowercase() {
        return Err("task handoff id is invalid".into());
    }
    if handoff.session_id != handoff.session.id {
        return Err("task handoff session identity does not match".into());
    }
    if checksum(&handoff.unsigned())? != handoff.checksum {
        return Err("task handoff checksum does not match its payload".into());
    }
    Ok(())
}

fn run_command<I, S>(
    cwd: &Path,
    executable: &str,
    args: I,
    input: Option<&[u8]>,
) -> Result<Vec<u8>, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = Command::new(executable);
    command
        .args(args)
        .current_dir(cwd)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_LFS_SKIP_SMUDGE", "1")
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("could not run {executable}: {error}"))?;
    if let Some(input) = input {
        child
            .stdin
            .take()
            .ok_or_else(|| format!("could not open {executable} stdin"))?
            .write_all(input)
            .map_err(|error| format!("could not write {executable} stdin: {error}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|error| format!("could not wait for {executable}: {error}"))?;
    if output.stdout.len().saturating_add(output.stderr.len()) > MAX_BUNDLE_BYTES {
        return Err(format!("{executable} output is too large"));
    }
    if !output.status.success() {
        let detail = if output.stderr.is_empty() {
            &output.stdout
        } else {
            &output.stderr
        };
        return Err(format!(
            "{executable} failed: {}",
            String::from_utf8_lossy(detail).trim()
        ));
    }
    Ok(output.stdout)
}

fn git<I, S>(cwd: &Path, args: I, input: Option<&[u8]>) -> Result<Vec<u8>, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run_command(cwd, "git", args, input)
}

fn git_text<I, S>(cwd: &Path, args: I) -> Result<String, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    String::from_utf8(git(cwd, args, None)?)
        .map_err(|_| "git returned a non-UTF-8 path or patch".to_string())
}

fn portable_path(path: &Path) -> Result<String, String> {
    if path.as_os_str().is_empty() {
        return Ok(".".into());
    }
    let mut segments = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(segment) => segments.push(
                segment
                    .to_str()
                    .ok_or_else(|| "handoff path is not valid UTF-8".to_string())?,
            ),
            Component::CurDir if segments.is_empty() => {}
            _ => return Err(format!("unsafe handoff path: {}", path.display())),
        }
    }
    if segments.is_empty() {
        Ok(".".into())
    } else {
        Ok(segments.join("/"))
    }
}

fn portable_to_path(path: &str) -> Result<PathBuf, String> {
    portable_path(Path::new(path)).map(|portable| {
        if portable == "." {
            PathBuf::from(".")
        } else {
            portable.split('/').collect()
        }
    })
}

fn capture_workspace(cwd: &Path) -> Result<WorkspaceBundle, String> {
    let root_text = git_text(cwd, ["rev-parse", "--show-toplevel"])?;
    let root = PathBuf::from(root_text.trim())
        .canonicalize()
        .map_err(|error| format!("could not resolve Git root: {error}"))?;
    let cwd = cwd
        .canonicalize()
        .map_err(|error| format!("could not resolve session working directory: {error}"))?;
    if !cwd.starts_with(&root) {
        return Err("session working directory is outside its Git repository".into());
    }
    let baseline = git_text(&root, ["rev-parse", "HEAD"])?.trim().to_string();
    if !(40..=64).contains(&baseline.len())
        || !baseline.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("workspace has no transferable Git baseline".into());
    }
    let index = git_text(&root, ["ls-files", "-s"])?;
    let submodules = index
        .lines()
        .filter_map(|line| {
            let (prefix, path) = line.split_once('\t')?;
            prefix.starts_with("160000 ").then(|| path.to_string())
        })
        .collect::<Vec<_>>();
    let status = git_text(&root, ["status", "--porcelain=v1", "--untracked-files=all"])?;
    if let Some(path) = submodules.iter().find(|path| {
        status
            .lines()
            .any(|line| line.get(3..).is_some_and(|candidate| candidate == *path))
    }) {
        return Err(format!(
            "dirty submodule cannot be transferred losslessly: {path}"
        ));
    }

    let scratch = tempfile::tempdir()
        .map_err(|error| format!("could not create handoff capture directory: {error}"))?;
    let repository_path = scratch.path().join("repository.bundle");
    let repository_arg = repository_path.to_string_lossy().into_owned();
    git(
        &root,
        ["bundle", "create", repository_arg.as_str(), "HEAD"],
        None,
    )?;
    let repository = std::fs::read(&repository_path)
        .map_err(|error| format!("could not read repository bundle: {error}"))?;
    if repository.is_empty() || repository.len() > MAX_BUNDLE_BYTES {
        return Err("repository bundle is empty or too large".into());
    }

    let names = git(
        &root,
        ["ls-files", "--others", "--exclude-standard", "-z"],
        None,
    )?;
    let mut untracked = Vec::new();
    for bytes in names
        .split(|byte| *byte == 0)
        .filter(|name| !name.is_empty())
    {
        let name = std::str::from_utf8(bytes)
            .map_err(|_| "untracked path is not valid UTF-8".to_string())?;
        let relative = portable_to_path(name)?;
        let source = root.join(&relative);
        let metadata = std::fs::symlink_metadata(&source)
            .map_err(|error| format!("could not inspect untracked path {name}: {error}"))?;
        let mode = file_mode(&metadata);
        if metadata.file_type().is_symlink() {
            let target = std::fs::read_link(&source)
                .map_err(|error| format!("could not read untracked symlink {name}: {error}"))?;
            if target.is_absolute()
                || target.components().any(|part| {
                    matches!(
                        part,
                        Component::ParentDir | Component::RootDir | Component::Prefix(_)
                    )
                })
            {
                return Err(format!("untracked symlink escapes the workspace: {name}"));
            }
            untracked.push(UntrackedEntry {
                path: portable_path(&relative)?,
                kind: UntrackedKind::Symlink,
                mode,
                data: target
                    .to_str()
                    .ok_or_else(|| "symlink target is not valid UTF-8".to_string())?
                    .to_string(),
            });
        } else if metadata.is_file() {
            let data = std::fs::read(&source)
                .map_err(|error| format!("could not read untracked file {name}: {error}"))?;
            untracked.push(UntrackedEntry {
                path: portable_path(&relative)?,
                kind: UntrackedKind::File,
                mode,
                data: base64::engine::general_purpose::STANDARD.encode(data),
            });
        } else {
            return Err(format!("unsupported untracked workspace entry: {name}"));
        }
    }

    let relative_cwd = portable_path(
        cwd.strip_prefix(&root)
            .map_err(|_| "session directory is outside the repository".to_string())?,
    )?;
    Ok(WorkspaceBundle {
        baseline,
        repository_bundle: base64::engine::general_purpose::STANDARD.encode(repository),
        staged_patch: git_text(
            &root,
            ["diff", "--cached", "--binary", "--full-index", "HEAD"],
        )?,
        worktree_patch: git_text(&root, ["diff", "--binary", "--full-index"])?,
        untracked,
        relative_cwd,
    })
}

fn apply_workspace(
    handoff: &PortableTaskHandoff,
    requested_destination: &Path,
) -> Result<PathBuf, String> {
    let destination = absolute_path(requested_destination)?;
    if destination.exists() {
        if !marker_matches(&destination, handoff) {
            return Err(format!(
                "handoff destination already exists: {}",
                destination.display()
            ));
        }
        return resumed_cwd(&destination, &handoff.workspace.relative_cwd);
    }
    let parent = destination
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or_else(|| "handoff destination has no parent directory".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("could not create handoff destination parent: {error}"))?;
    let name = destination
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| "handoff destination name is invalid".to_string())?;
    let staging = parent.join(format!(".{name}.codetwo-{}", handoff.id));
    if std::fs::symlink_metadata(&staging).is_ok() {
        return Err(format!(
            "handoff staging path already exists: {}",
            staging.display()
        ));
    }
    let result = (|| {
        let repository = base64::engine::general_purpose::STANDARD
            .decode(&handoff.workspace.repository_bundle)
            .map_err(|_| "repository bundle is not valid base64".to_string())?;
        if repository.is_empty() || repository.len() > MAX_BUNDLE_BYTES {
            return Err("repository bundle is empty or too large".into());
        }
        let scratch = tempfile::tempdir()
            .map_err(|error| format!("could not create handoff restore directory: {error}"))?;
        let repository_path = scratch.path().join("repository.bundle");
        std::fs::write(&repository_path, repository)
            .map_err(|error| format!("could not write repository bundle: {error}"))?;
        let repository_arg = repository_path.to_string_lossy().into_owned();
        let staging_arg = staging.to_string_lossy().into_owned();
        git(
            parent,
            [
                "clone",
                "--no-local",
                repository_arg.as_str(),
                staging_arg.as_str(),
            ],
            None,
        )?;
        git(
            &staging,
            ["checkout", "--detach", handoff.workspace.baseline.as_str()],
            None,
        )?;
        if !handoff.workspace.staged_patch.is_empty() {
            git(
                &staging,
                ["apply", "--binary", "--index", "-"],
                Some(handoff.workspace.staged_patch.as_bytes()),
            )?;
        }
        if !handoff.workspace.worktree_patch.is_empty() {
            git(
                &staging,
                ["apply", "--binary", "-"],
                Some(handoff.workspace.worktree_patch.as_bytes()),
            )?;
        }
        for entry in &handoff.workspace.untracked {
            let relative = portable_to_path(&entry.path)?;
            let target = staging.join(&relative);
            if std::fs::symlink_metadata(&target).is_ok() {
                return Err(format!(
                    "unsafe or conflicting untracked path: {}",
                    entry.path
                ));
            }
            let parent = target
                .parent()
                .ok_or_else(|| format!("untracked path has no parent: {}", entry.path))?;
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("could not create untracked parent: {error}"))?;
            match entry.kind {
                UntrackedKind::File => {
                    let bytes = base64::engine::general_purpose::STANDARD
                        .decode(&entry.data)
                        .map_err(|_| {
                            format!("untracked file is not valid base64: {}", entry.path)
                        })?;
                    std::fs::write(&target, bytes)
                        .map_err(|error| format!("could not restore {}: {error}", entry.path))?;
                    set_file_mode(&target, entry.mode)?;
                }
                UntrackedKind::Symlink => create_symlink(&entry.data, &target)?,
            }
        }
        let cwd = resumed_cwd(&staging, &handoff.workspace.relative_cwd)?;
        let marker = serde_json::to_vec(&json!({
            "id": &handoff.id,
            "checksum": &handoff.checksum,
        }))
        .map_err(|error| format!("could not serialize handoff marker: {error}"))?;
        let marker_path = marker_path(&staging);
        std::fs::write(&marker_path, marker)
            .map_err(|error| format!("could not write handoff marker: {error}"))?;
        set_file_mode(&marker_path, 0o600)?;
        std::fs::rename(&staging, &destination)
            .map_err(|error| format!("could not install transferred workspace: {error}"))?;
        let relative = cwd
            .strip_prefix(&staging)
            .map_err(|_| "restored working directory escaped staging".to_string())?;
        Ok(destination.join(relative))
    })();
    if result.is_err() && std::fs::symlink_metadata(&staging).is_ok() {
        let _ = std::fs::remove_dir_all(&staging);
    }
    result
}

fn absolute_path(path: &Path) -> Result<PathBuf, String> {
    if path.as_os_str().is_empty() {
        return Err("destination folder is empty".into());
    }
    if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(path))
            .map_err(|error| format!("could not resolve destination folder: {error}"))
    }
}

fn resumed_cwd(root: &Path, relative_cwd: &str) -> Result<PathBuf, String> {
    let cwd = root.join(portable_to_path(relative_cwd)?);
    let metadata = std::fs::metadata(&cwd)
        .map_err(|_| "transferred session working directory does not exist".to_string())?;
    if !metadata.is_dir() {
        return Err("transferred session working directory is not a directory".into());
    }
    Ok(cwd)
}

fn marker_path(destination: &Path) -> PathBuf {
    destination.join(".git").join(MARKER_FILE)
}

fn read_marker(destination: &Path) -> Result<Value, String> {
    let bytes = std::fs::read(marker_path(destination))
        .map_err(|error| format!("could not read handoff marker: {error}"))?;
    serde_json::from_slice(&bytes).map_err(|error| format!("handoff marker is invalid: {error}"))
}

fn marker_matches(destination: &Path, handoff: &PortableTaskHandoff) -> bool {
    read_marker(destination).is_ok_and(|marker| {
        marker.get("id").and_then(Value::as_str) == Some(&handoff.id)
            && marker.get("checksum").and_then(Value::as_str) == Some(&handoff.checksum)
    })
}

fn url_component(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

#[cfg(unix)]
fn file_mode(metadata: &std::fs::Metadata) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode() & 0o777
}

#[cfg(not(unix))]
fn file_mode(_metadata: &std::fs::Metadata) -> u32 {
    0o600
}

#[cfg(unix)]
fn set_file_mode(path: &Path, mode: u32) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode & 0o777))
        .map_err(|error| format!("could not set {} permissions: {error}", path.display()))
}

#[cfg(not(unix))]
fn set_file_mode(_path: &Path, _mode: u32) -> Result<(), String> {
    Ok(())
}

#[cfg(unix)]
fn create_symlink(target: &str, path: &Path) -> Result<(), String> {
    std::os::unix::fs::symlink(target, path)
        .map_err(|error| format!("could not restore symlink {}: {error}", path.display()))
}

#[cfg(windows)]
fn create_symlink(target: &str, path: &Path) -> Result<(), String> {
    std::os::windows::fs::symlink_file(target, path)
        .map_err(|error| format!("could not restore symlink {}: {error}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::ProviderId;
    use crate::session::{Part, Role};
    use crate::skill::SkillLibrary;

    fn git_ok(cwd: &Path, args: &[&str]) {
        git(cwd, args.iter().copied(), None).unwrap();
    }

    #[tokio::test]
    async fn moves_the_durable_session_and_exact_dirty_workspace() {
        let source_root = tempfile::tempdir().unwrap();
        git_ok(source_root.path(), &["init", "-q"]);
        git_ok(
            source_root.path(),
            &["config", "user.email", "test@codetwo.local"],
        );
        git_ok(source_root.path(), &["config", "user.name", "C2 Test"]);
        std::fs::write(source_root.path().join("tracked.txt"), "base\n").unwrap();
        git_ok(source_root.path(), &["add", "tracked.txt"]);
        git_ok(source_root.path(), &["commit", "-qm", "baseline"]);
        std::fs::write(source_root.path().join("tracked.txt"), "staged\n").unwrap();
        git_ok(source_root.path(), &["add", "tracked.txt"]);
        std::fs::write(source_root.path().join("tracked.txt"), "staged\nunstaged\n").unwrap();
        std::fs::write(source_root.path().join("untracked.bin"), [0, 1, 2, 255]).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink("tracked.txt", source_root.path().join("untracked-link"))
            .unwrap();
        let source_status = git_text(
            source_root.path(),
            ["status", "--porcelain=v1", "--untracked-files=all"],
        )
        .unwrap();

        let source_data = tempfile::tempdir().unwrap();
        let target_data = tempfile::tempdir().unwrap();
        let source_store =
            Arc::new(Store::open(source_data.path().join("codetwo.db").to_str().unwrap()).unwrap());
        let target_store =
            Arc::new(Store::open(target_data.path().join("codetwo.db").to_str().unwrap()).unwrap());
        let mut session = Session::new(
            ProviderId::Codex,
            source_root.path().to_string_lossy().into_owned(),
        );
        session.model = Some("gpt-5.6".into());
        source_store.upsert_session(&session).unwrap();
        source_store
            .append_part(
                &session.id,
                Role::User,
                &Part::Prompt {
                    text: "Continue this task".into(),
                    display: "Continue this task".into(),
                },
            )
            .unwrap();
        source_store
            .append_part(
                &session.id,
                Role::Agent,
                &Part::Text {
                    text: "Work in progress".into(),
                },
            )
            .unwrap();
        let (source_engine, _) = Engine::with_store(
            Vec::new(),
            SkillLibrary::new(Vec::new()),
            source_store.clone(),
        );
        let (target_engine, _) = Engine::with_store(
            Vec::new(),
            SkillLibrary::new(Vec::new()),
            target_store.clone(),
        );
        let source =
            TaskHandoffManager::new(source_store.clone(), Arc::new(source_engine), None).unwrap();
        let target =
            TaskHandoffManager::new(target_store.clone(), Arc::new(target_engine), None).unwrap();
        let handoff = source.prepare(&session.id).await.unwrap();
        let target_parent = tempfile::tempdir().unwrap();
        let destination = target_parent.path().join("restored-project");
        target
            .accept(&handoff, destination.to_str().unwrap())
            .unwrap();
        target
            .activate(&session.id, &handoff.id, handoff.epoch)
            .unwrap();
        source_store
            .commit_source_handoff(&session.id, &handoff.id, handoff.epoch)
            .unwrap();

        assert!(source_store.assert_session_active(&session.id).is_err());
        assert!(target_store.assert_session_active(&session.id).is_ok());
        assert_eq!(target_store.transcript(&session.id).unwrap().len(), 2);
        assert_eq!(
            git_text(
                &destination,
                ["status", "--porcelain=v1", "--untracked-files=all"],
            )
            .unwrap(),
            source_status
        );
        assert_eq!(
            std::fs::read_to_string(destination.join("tracked.txt")).unwrap(),
            "staged\nunstaged\n"
        );
        assert_eq!(
            std::fs::read(destination.join("untracked.bin")).unwrap(),
            [0, 1, 2, 255]
        );
    }

    #[test]
    fn rejects_tampering_and_unsafe_paths() {
        assert!(portable_to_path("../escape").is_err());
        assert!(portable_to_path("/absolute").is_err());
    }
}
