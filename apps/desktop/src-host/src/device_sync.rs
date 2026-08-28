//! Core-backed synchronization between paired C2 desktop instances.
//!
//! This host plugin owns transport credentials and scheduling. SQLite snapshots, validation, and
//! deterministic merge policy remain in `codetwo-core`; the Remote plugin only exposes this
//! service over authenticated HTTP.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use codetwo_core::device_sync::{
    device_sync_snapshot_version, merge_device_sync_documents, DeviceSyncCounts, DeviceSyncDocument,
};
use codetwo_core::session::now_millis;
use codetwo_core::Store;
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginError, PluginResult, Service};
use codetwo_plugins::StoreService;
use futures_util::future::join_all;
use reqwest::{Client, Response, Url};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::EventSink;

const TRANSPORT_ID: &str = "paired-devices";
const API_ROOT: &str = "/api/device-sync/v1";
const MAX_SYNC_DOCUMENT_BYTES: usize = 64 * 1024 * 1024;
const PEER_REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const STARTUP_DELAY: Duration = Duration::from_millis(1_500);
const SYNC_INTERVAL: Duration = Duration::from_secs(5 * 60);
const NO_PEERS_MESSAGE: &str = "Pair another C2 device in Device connections first.";

pub struct DeviceSyncPlugin {
    data_dir: PathBuf,
    events: EventSink,
}

impl DeviceSyncPlugin {
    pub fn new(data_dir: PathBuf, events: EventSink) -> Self {
        Self { data_dir, events }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DeviceSyncSettings {
    enabled: bool,
    device_id: String,
    last_success_at: Option<i64>,
    last_error: Option<String>,
    imported: Option<DeviceSyncCounts>,
}

impl Default for DeviceSyncSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            device_id: uuid::Uuid::new_v4().to_string(),
            last_success_at: None,
            last_error: None,
            imported: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OutboundPeer {
    id: String,
    name: String,
    base_url: String,
    bearer: String,
    created_at: u64,
    last_seen: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PairedState {
    server_id: String,
    server_name: String,
    outbound_peers: Vec<OutboundPeer>,
}

impl Default for PairedState {
    fn default() -> Self {
        Self {
            server_id: uuid::Uuid::new_v4().to_string(),
            server_name: local_device_name(),
            outbound_peers: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
#[allow(dead_code)] // The wire contract also covers future iCloud transport probe states.
enum DeviceSyncState {
    Disabled,
    Ready,
    Syncing,
    Unsupported,
    SignedOut,
    Restricted,
    Unavailable,
    Error,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct DeviceSyncStatus {
    transport: &'static str,
    state: DeviceSyncState,
    enabled: bool,
    available: bool,
    last_success_at: Option<i64>,
    message: Option<String>,
    imported: DeviceSyncCounts,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct PairedSyncDevice {
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub last_seen: u64,
    pub direction: &'static str,
    pub protocol: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct PairDeviceResult {
    pub device: PairedSyncDevice,
}

#[derive(Debug, Clone, Deserialize)]
struct PairDeviceReply {
    server_id: String,
    server_name: String,
    #[allow(dead_code)]
    device_id: String,
    bearer: String,
}

#[derive(Debug, Clone, Deserialize)]
struct SnapshotReply {
    replica: codetwo_server::DeviceSyncReplica,
}

#[derive(Debug, Clone, Deserialize)]
struct WireWriteResult {
    state: WireWriteState,
    #[allow(dead_code)]
    version: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
enum WireWriteState {
    Written,
    Conflict,
}

pub(crate) struct DeviceSyncRuntime {
    store: Arc<Store>,
    events: EventSink,
    client: Client,
    settings_path: PathBuf,
    paired_state_path: PathBuf,
    settings: Mutex<DeviceSyncSettings>,
    paired: Mutex<PairedState>,
    sync_gate: tokio::sync::Mutex<()>,
}

impl Service for DeviceSyncRuntime {
    const NAME: &'static str = "device-sync";
}

impl DeviceSyncRuntime {
    fn load(store: Arc<Store>, data_dir: &Path, events: EventSink) -> Result<Arc<Self>, String> {
        let settings_path = data_dir.join("device-sync.json");
        let paired_state_path = data_dir.join("paired-device-sync.json");
        let settings = load_json::<DeviceSyncSettings>(&settings_path).unwrap_or_default();
        let mut paired = load_json::<PairedState>(&paired_state_path).unwrap_or_default();
        paired.outbound_peers.retain(valid_peer);
        let client = Client::builder()
            .timeout(PEER_REQUEST_TIMEOUT)
            .build()
            .map_err(|error| format!("could not create device-sync HTTP client: {error}"))?;
        let runtime = Arc::new(Self {
            store,
            events,
            client,
            settings_path,
            paired_state_path,
            settings: Mutex::new(settings),
            paired: Mutex::new(paired),
            sync_gate: tokio::sync::Mutex::new(()),
        });
        runtime.persist_paired()?;
        Ok(runtime)
    }

    pub(crate) fn devices(&self) -> Vec<PairedSyncDevice> {
        let mut devices: Vec<_> = self
            .paired
            .lock()
            .unwrap()
            .outbound_peers
            .iter()
            .map(|peer| PairedSyncDevice {
                id: format!("out:{}", peer.id),
                name: peer.name.clone(),
                created_at: peer.created_at,
                last_seen: peer.last_seen,
                direction: "outgoing",
                protocol: "c2",
            })
            .collect();
        devices.sort_by(|left, right| {
            left.created_at
                .cmp(&right.created_at)
                .then(left.id.cmp(&right.id))
        });
        devices
    }

    pub(crate) fn revoke_device(&self, id: &str) -> Result<bool, String> {
        let raw_id = id.strip_prefix("out:").unwrap_or(id);
        let mut paired = self.paired.lock().unwrap();
        let mut updated = paired.clone();
        let before = updated.outbound_peers.len();
        updated.outbound_peers.retain(|peer| peer.id != raw_id);
        if updated.outbound_peers.len() == before {
            return Ok(false);
        }
        atomic_private_json(&self.paired_state_path, &updated)?;
        *paired = updated;
        Ok(true)
    }

    pub(crate) async fn pair_device(
        &self,
        pairing_url: &str,
        device_name: Option<&str>,
    ) -> Result<PairDeviceResult, String> {
        let url = Url::parse(pairing_url.trim()).map_err(|_| "enter a valid C2 pairing link")?;
        if !matches!(url.scheme(), "http" | "https") {
            return Err("C2 pairing links must use HTTP or HTTPS".into());
        }
        let token = url
            .fragment()
            .and_then(|fragment| {
                url::form_urlencoded::parse(fragment.as_bytes())
                    .find(|(key, _)| key == "token")
                    .map(|(_, value)| value.into_owned())
            })
            .filter(|token| !token.is_empty())
            .ok_or_else(|| "the pairing link does not contain a token".to_string())?;
        let base_url = url.origin().ascii_serialization();
        if base_url == "null" {
            return Err("enter a valid C2 pairing link".into());
        }
        let identity = self.identity_value();
        let response = self
            .client
            .post(format!("{base_url}{API_ROOT}/pair"))
            .json(&serde_json::json!({
                "token": token,
                "device_name": device_name
                    .map(str::trim)
                    .filter(|name| !name.is_empty())
                    .unwrap_or(&identity.name),
                "device_id": identity.id,
            }))
            .send()
            .await
            .map_err(|error| format!("could not pair the C2 device: {error}"))?;
        let response = require_success(response, "could not pair the C2 device").await?;
        let reply: PairDeviceReply = limited_json(response).await?;
        if reply.server_id.trim().is_empty()
            || reply.server_name.trim().is_empty()
            || reply.device_id.trim().is_empty()
            || reply.bearer.trim().is_empty()
        {
            return Err("the paired C2 device returned an invalid response".into());
        }
        let now = now_secs();
        let mut paired = self.paired.lock().unwrap();
        let mut updated = paired.clone();
        let created_at = updated
            .outbound_peers
            .iter()
            .find(|peer| peer.id == reply.server_id)
            .map(|peer| peer.created_at)
            .unwrap_or(now);
        let peer = OutboundPeer {
            id: reply.server_id,
            name: reply.server_name,
            base_url,
            bearer: reply.bearer,
            created_at,
            last_seen: now,
        };
        updated.outbound_peers.retain(|item| item.id != peer.id);
        updated.outbound_peers.push(peer.clone());
        atomic_private_json(&self.paired_state_path, &updated)?;
        *paired = updated;
        Ok(PairDeviceResult {
            device: PairedSyncDevice {
                id: format!("out:{}", peer.id),
                name: peer.name,
                created_at: peer.created_at,
                last_seen: peer.last_seen,
                direction: "outgoing",
                protocol: "c2",
            },
        })
    }

    pub(crate) async fn status(&self) -> DeviceSyncStatus {
        if self.sync_gate.try_lock().is_err() {
            return self.base_status(DeviceSyncState::Syncing, true, None);
        }
        self.status_without_running()
    }

    pub(crate) async fn set_enabled(&self, enabled: bool) -> DeviceSyncStatus {
        if !enabled {
            let result = self.update_settings(|settings| {
                settings.enabled = false;
                settings.last_error = None;
            });
            return match result {
                Ok(()) => self.status_without_running(),
                Err(error) => self.base_status(DeviceSyncState::Error, true, Some(error)),
            };
        }
        if self.peers().is_empty() {
            return self.base_status(
                DeviceSyncState::Unavailable,
                false,
                Some(NO_PEERS_MESSAGE.into()),
            );
        }
        if let Err(error) = self.update_settings(|settings| {
            settings.enabled = true;
            settings.last_error = None;
        }) {
            return self.base_status(DeviceSyncState::Error, true, Some(error));
        }
        self.sync_now().await
    }

    pub(crate) async fn sync_now(&self) -> DeviceSyncStatus {
        if !self.settings.lock().unwrap().enabled {
            return self.status_without_running();
        }
        let guard = match self.sync_gate.try_lock() {
            Ok(guard) => guard,
            Err(_) => {
                let guard = self.sync_gate.lock().await;
                drop(guard);
                return self.status_without_running();
            }
        };
        let result = self.perform_sync().await;
        drop(guard);
        result
    }

    async fn perform_sync(&self) -> DeviceSyncStatus {
        let syncing = self.base_status(DeviceSyncState::Syncing, true, None);
        let _ = self.events.emit("device-sync-status", &syncing);
        let peers = self.peers();
        if peers.is_empty() {
            let status = self.base_status(
                DeviceSyncState::Unavailable,
                false,
                Some(NO_PEERS_MESSAGE.into()),
            );
            let _ = self.events.emit("device-sync-status", &status);
            return status;
        }

        let result = self.perform_sync_attempts().await;
        match result {
            Ok(imported) => {
                if let Err(error) = self.update_settings(|settings| {
                    settings.last_success_at = Some(now_millis());
                    settings.last_error = None;
                    settings.imported = Some(imported);
                }) {
                    return self.fail_sync(error);
                }
                let status = self.base_status(DeviceSyncState::Ready, true, None);
                let _ = self.events.emit("device-sync-changed", imported);
                let _ = self.events.emit("device-sync-status", &status);
                status
            }
            Err(error) => self.fail_sync(error),
        }
    }

    async fn perform_sync_attempts(&self) -> Result<DeviceSyncCounts, String> {
        for _ in 0..3 {
            let replicas = self.read_replicas().await?;
            let settings = self.settings.lock().unwrap().clone();
            let local = self
                .store
                .device_sync_snapshot(&settings.device_id)
                .map_err(|error| error.to_string())?;
            let mut documents = Vec::with_capacity(replicas.len() + 1);
            documents.push(local);
            documents.extend(replicas.iter().map(|(_, replica)| replica.document.clone()));
            let merged =
                merge_device_sync_documents(&documents, &settings.device_id, now_millis())?;
            let imported = self
                .store
                .import_device_sync_document(&merged)
                .map_err(|error| error.to_string())?;
            if self.write_replicas(&merged, &replicas).await? {
                return Ok(imported);
            }
        }
        Err("Another device changed the sync data while C2 was syncing. Try again.".into())
    }

    async fn read_replicas(
        &self,
    ) -> Result<Vec<(OutboundPeer, codetwo_server::DeviceSyncReplica)>, String> {
        let futures = self.peers().into_iter().map(|peer| {
            let client = self.client.clone();
            async move {
                let response = client
                    .get(format!("{}{API_ROOT}/snapshot", peer.base_url))
                    .bearer_auth(&peer.bearer)
                    .send()
                    .await
                    .map_err(|error| format!("could not read {}: {error}", peer.name))?;
                let response =
                    require_success(response, &format!("could not read {}", peer.name)).await?;
                let reply: SnapshotReply = limited_json(response).await?;
                if reply.replica.id != format!("paired:{}", peer.id) {
                    return Err(format!(
                        "{} returned an invalid replica identity",
                        peer.name
                    ));
                }
                reply.replica.document.validate().map_err(|error| {
                    format!("{} returned an invalid sync snapshot: {error}", peer.name)
                })?;
                Ok((peer, reply.replica))
            }
        });
        let results = join_all(futures).await;
        let mut replicas = Vec::new();
        let mut errors = Vec::new();
        for result in results {
            match result {
                Ok((peer, replica)) => {
                    let _ = self.mark_peer_seen(&peer.id);
                    replicas.push((peer, replica));
                }
                Err(error) => errors.push(error),
            }
        }
        if replicas.is_empty() {
            return Err(if errors.is_empty() {
                "No paired C2 device is reachable.".into()
            } else {
                errors.join("; ")
            });
        }
        Ok(replicas)
    }

    /// Returns true when every peer accepted the write and false when any peer raced us.
    async fn write_replicas(
        &self,
        document: &DeviceSyncDocument,
        replicas: &[(OutboundPeer, codetwo_server::DeviceSyncReplica)],
    ) -> Result<bool, String> {
        let payload = serde_json::to_vec(&serde_json::json!({
            "document": document,
            "expected_version": "",
        }))
        .map_err(|error| error.to_string())?;
        if payload.len() > MAX_SYNC_DOCUMENT_BYTES {
            return Err("the C2 sync document is too large".into());
        }
        let futures = replicas.iter().cloned().map(|(peer, replica)| {
            let client = self.client.clone();
            let document = document.clone();
            async move {
                let body = serde_json::to_vec(&serde_json::json!({
                    "document": document,
                    "expected_version": replica.version,
                }))
                .map_err(|error| error.to_string())?;
                if body.len() > MAX_SYNC_DOCUMENT_BYTES {
                    return Err("the C2 sync document is too large".to_string());
                }
                let response = client
                    .put(format!("{}{API_ROOT}/snapshot", peer.base_url))
                    .bearer_auth(&peer.bearer)
                    .header(reqwest::header::CONTENT_TYPE, "application/json")
                    .body(body)
                    .send()
                    .await
                    .map_err(|error| format!("could not write {}: {error}", peer.name))?;
                if response.status() == reqwest::StatusCode::CONFLICT {
                    return Ok((peer, WireWriteState::Conflict));
                }
                let response =
                    require_success(response, &format!("could not write {}", peer.name)).await?;
                let result: WireWriteResult = limited_json(response).await?;
                Ok((peer, result.state))
            }
        });
        let mut conflict = false;
        for result in join_all(futures).await {
            let (peer, state) = result?;
            if state == WireWriteState::Conflict {
                conflict = true;
            } else {
                self.mark_peer_seen(&peer.id)?;
            }
        }
        Ok(!conflict)
    }

    fn fail_sync(&self, error: String) -> DeviceSyncStatus {
        let persistence_error = self
            .update_settings(|settings| settings.last_error = Some(error.clone()))
            .err();
        let message = persistence_error
            .map(|persist| format!("{error}; {persist}"))
            .unwrap_or(error);
        let status = self.base_status(DeviceSyncState::Error, true, Some(message));
        let _ = self.events.emit("device-sync-status", &status);
        status
    }

    fn status_without_running(&self) -> DeviceSyncStatus {
        let settings = self.settings.lock().unwrap().clone();
        if self.peers().is_empty() {
            return self.base_status_from(
                &settings,
                DeviceSyncState::Unavailable,
                false,
                Some(NO_PEERS_MESSAGE.into()),
            );
        }
        if !settings.enabled {
            return self.base_status_from(&settings, DeviceSyncState::Disabled, true, None);
        }
        if let Some(error) = settings.last_error.clone() {
            return self.base_status_from(&settings, DeviceSyncState::Error, true, Some(error));
        }
        self.base_status_from(&settings, DeviceSyncState::Ready, true, None)
    }

    fn base_status(
        &self,
        state: DeviceSyncState,
        available: bool,
        message: Option<String>,
    ) -> DeviceSyncStatus {
        let settings = self.settings.lock().unwrap().clone();
        self.base_status_from(&settings, state, available, message)
    }

    fn base_status_from(
        &self,
        settings: &DeviceSyncSettings,
        state: DeviceSyncState,
        available: bool,
        message: Option<String>,
    ) -> DeviceSyncStatus {
        DeviceSyncStatus {
            transport: TRANSPORT_ID,
            state,
            enabled: settings.enabled,
            available,
            last_success_at: settings.last_success_at,
            message,
            imported: settings.imported.unwrap_or_default(),
        }
    }

    fn update_settings(&self, update: impl FnOnce(&mut DeviceSyncSettings)) -> Result<(), String> {
        let mut settings = self.settings.lock().unwrap();
        let mut updated = settings.clone();
        update(&mut updated);
        atomic_private_json(&self.settings_path, &updated)?;
        *settings = updated;
        Ok(())
    }

    fn peers(&self) -> Vec<OutboundPeer> {
        self.paired.lock().unwrap().outbound_peers.clone()
    }

    fn mark_peer_seen(&self, id: &str) -> Result<(), String> {
        let mut paired = self.paired.lock().unwrap();
        let Some(index) = paired.outbound_peers.iter().position(|peer| peer.id == id) else {
            return Ok(());
        };
        let now = now_secs();
        if paired.outbound_peers[index].last_seen == now {
            return Ok(());
        }
        let mut updated = paired.clone();
        updated.outbound_peers[index].last_seen = now;
        atomic_private_json(&self.paired_state_path, &updated)?;
        *paired = updated;
        Ok(())
    }

    fn persist_paired(&self) -> Result<(), String> {
        atomic_private_json(&self.paired_state_path, &*self.paired.lock().unwrap())
    }

    fn identity_value(&self) -> codetwo_server::DeviceSyncIdentity {
        let paired = self.paired.lock().unwrap();
        codetwo_server::DeviceSyncIdentity {
            id: paired.server_id.clone(),
            name: paired.server_name.clone(),
        }
    }
}

impl codetwo_server::DeviceSyncHttp for DeviceSyncRuntime {
    fn identity(&self) -> codetwo_server::DeviceSyncIdentity {
        self.identity_value()
    }

    fn snapshot(&self) -> Result<codetwo_server::DeviceSyncReplica, String> {
        let identity = self.identity_value();
        let document = self
            .store
            .device_sync_snapshot(&identity.id)
            .map_err(|error| error.to_string())?;
        let version = device_sync_snapshot_version(&document);
        Ok(codetwo_server::DeviceSyncReplica {
            id: format!("paired:{}", identity.id),
            document,
            version,
        })
    }

    fn write_snapshot(
        &self,
        document: &DeviceSyncDocument,
        expected_version: &str,
    ) -> Result<codetwo_server::DeviceSyncWriteResult, String> {
        document.validate()?;
        let identity = self.identity_value();
        let current = self
            .store
            .device_sync_snapshot(&identity.id)
            .map_err(|error| error.to_string())?;
        let current_version = device_sync_snapshot_version(&current);
        if expected_version != current_version {
            return Ok(codetwo_server::DeviceSyncWriteResult {
                state: codetwo_server::DeviceSyncWriteState::Conflict,
                version: current_version,
            });
        }
        let imported = self
            .store
            .import_device_sync_document(document)
            .map_err(|error| error.to_string())?;
        let _ = self.events.emit("device-sync-changed", imported);
        let written = self
            .store
            .device_sync_snapshot(&identity.id)
            .map_err(|error| error.to_string())?;
        Ok(codetwo_server::DeviceSyncWriteResult {
            state: codetwo_server::DeviceSyncWriteState::Written,
            version: device_sync_snapshot_version(&written),
        })
    }
}

#[async_trait]
impl Plugin for DeviceSyncPlugin {
    fn name(&self) -> &str {
        "device-sync"
    }

    fn inject(&self) -> Injection {
        Injection::required(["store"])
    }

    fn description(&self) -> Option<&str> {
        Some("Synchronize projects, sessions, transcripts, and memory with paired C2 devices.")
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let store = ctx
            .get::<StoreService>()
            .ok_or_else(|| PluginError::new("store service is unavailable"))?
            .0
            .clone();
        let runtime = DeviceSyncRuntime::load(store, &self.data_dir, self.events.clone())
            .map_err(PluginError::new)?;
        ctx.provide(runtime.clone())?;

        let service = runtime.clone();
        ctx.command("device_sync.status", move |_| {
            let service = service.clone();
            async move { json(service.status().await) }
        })?;

        #[derive(Deserialize)]
        struct SetEnabledArgs {
            enabled: bool,
        }
        let service = runtime.clone();
        ctx.command("device_sync.set_enabled", move |args| {
            let service = service.clone();
            async move {
                let args: SetEnabledArgs = take_args(args)?;
                json(service.set_enabled(args.enabled).await)
            }
        })?;

        let service = runtime.clone();
        ctx.command("device_sync.sync_now", move |_| {
            let service = service.clone();
            async move { json(service.sync_now().await) }
        })?;

        ctx.spawn(async move {
            tokio::time::sleep(STARTUP_DELAY).await;
            loop {
                if runtime.settings.lock().unwrap().enabled {
                    let _ = runtime.sync_now().await;
                }
                tokio::time::sleep(SYNC_INTERVAL).await;
            }
        });
        Ok(())
    }
}

fn take_args<T: DeserializeOwned>(value: Value) -> Result<T, PluginError> {
    serde_json::from_value(if value.is_null() {
        Value::Object(Default::default())
    } else {
        value
    })
    .map_err(|error| PluginError::new(format!("bad arguments: {error}")))
}

fn json(value: impl Serialize) -> Result<Value, PluginError> {
    serde_json::to_value(value).map_err(PluginError::new)
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn local_device_name() -> String {
    std::env::var("HOSTNAME")
        .ok()
        .filter(|name| !name.trim().is_empty())
        .or_else(|| {
            std::process::Command::new("hostname")
                .output()
                .ok()
                .filter(|output| output.status.success())
                .and_then(|output| String::from_utf8(output.stdout).ok())
                .map(|name| name.trim().to_string())
                .filter(|name| !name.is_empty())
        })
        .unwrap_or_else(|| "C2 device".into())
}

fn valid_peer(peer: &OutboundPeer) -> bool {
    !peer.id.trim().is_empty()
        && !peer.name.trim().is_empty()
        && !peer.bearer.trim().is_empty()
        && Url::parse(&peer.base_url).is_ok_and(|url| {
            matches!(url.scheme(), "http" | "https")
                && url.origin().ascii_serialization() == peer.base_url
        })
}

fn load_json<T: DeserializeOwned>(path: &Path) -> Option<T> {
    let value = std::fs::read(path).ok()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    serde_json::from_slice(&value).ok()
}

fn atomic_private_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let directory = path.parent().unwrap_or_else(|| Path::new("."));
    std::fs::create_dir_all(directory)
        .map_err(|error| format!("could not create device-sync state directory: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(directory, std::fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("could not protect device-sync state directory: {error}"))?;
    }
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("could not serialize device-sync state: {error}"))?;
    let mut temporary = tempfile::NamedTempFile::new_in(directory)
        .map_err(|error| format!("could not create device-sync temporary file: {error}"))?;
    temporary
        .write_all(&bytes)
        .and_then(|_| temporary.write_all(b"\n"))
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| format!("could not write device-sync state: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        temporary
            .as_file()
            .set_permissions(std::fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("could not protect device-sync state: {error}"))?;
    }
    temporary
        .persist(path)
        .map_err(|error| format!("could not install device-sync state: {}", error.error))?;
    #[cfg(unix)]
    std::fs::File::open(directory)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| format!("could not sync device-sync state directory: {error}"))?;
    Ok(())
}

async fn limited_json<T: DeserializeOwned>(mut response: Response) -> Result<T, String> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_SYNC_DOCUMENT_BYTES as u64)
    {
        return Err("the paired device returned a sync document that is too large".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("could not read the paired device response: {error}"))?
    {
        if body.len().saturating_add(chunk.len()) > MAX_SYNC_DOCUMENT_BYTES {
            return Err("the paired device returned a sync document that is too large".into());
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body)
        .map_err(|_| "the paired device returned an invalid JSON response".into())
}

async fn require_success(response: Response, fallback: &str) -> Result<Response, String> {
    if response.status().is_success() {
        return Ok(response);
    }
    let status = response.status();
    let detail = limited_text(response).await.unwrap_or_default();
    Err(if detail.trim().is_empty() {
        format!("{fallback} ({status})")
    } else {
        detail.trim().to_string()
    })
}

async fn limited_text(mut response: Response) -> Result<String, String> {
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("could not read the paired device response: {error}"))?
    {
        if body.len().saturating_add(chunk.len()) > 64 * 1024 {
            return Err("the paired device returned an oversized error".into());
        }
        body.extend_from_slice(&chunk);
    }
    String::from_utf8(body).map_err(|_| "the paired device returned an invalid error".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use codetwo_core::provider::ProviderId;
    use codetwo_core::skill::SkillLibrary;
    use codetwo_core::{Engine, Part, Role, Session};

    #[test]
    fn private_state_round_trips_and_filters_invalid_peers() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("paired-device-sync.json");
        let state = PairedState {
            server_id: "server".into(),
            server_name: "Desktop".into(),
            outbound_peers: vec![OutboundPeer {
                id: "peer".into(),
                name: "Peer".into(),
                base_url: "http://127.0.0.1:4599".into(),
                bearer: "secret".into(),
                created_at: 1,
                last_seen: 2,
            }],
        };
        atomic_private_json(&path, &state).unwrap();
        let loaded: PairedState = load_json(&path).unwrap();
        assert!(valid_peer(&loaded.outbound_peers[0]));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }

    #[test]
    fn snapshot_version_ignores_replica_metadata() {
        let store = Store::open_in_memory().unwrap();
        let mut first = store.device_sync_snapshot("first").unwrap();
        let mut second = first.clone();
        second.writer_device_id = "second".into();
        second.generated_at += 100;
        second.revision += 1;
        assert_eq!(
            device_sync_snapshot_version(&first),
            device_sync_snapshot_version(&second)
        );
        first.projects.reverse();
        assert_eq!(
            device_sync_snapshot_version(&first),
            device_sync_snapshot_version(&second)
        );
    }

    #[tokio::test]
    async fn paired_instances_converge_over_the_production_http_transport() {
        let root = tempfile::tempdir().unwrap();
        let server_dir = root.path().join("server");
        let client_dir = root.path().join("client");
        std::fs::create_dir_all(&server_dir).unwrap();
        std::fs::create_dir_all(&client_dir).unwrap();
        let server_store =
            Arc::new(Store::open(server_dir.join("codetwo.db").to_str().unwrap()).unwrap());
        let client_store =
            Arc::new(Store::open(client_dir.join("codetwo.db").to_str().unwrap()).unwrap());
        server_store
            .add_project("/shared", Some("Shared"), now_millis())
            .unwrap();
        let session = Session::new(ProviderId::Codex, "/shared");
        server_store.upsert_session(&session).unwrap();
        server_store
            .append_part(
                &session.id,
                Role::User,
                &Part::Prompt {
                    text: "server seed".into(),
                    display: "server seed".into(),
                },
            )
            .unwrap();

        let (server_output, _server_events) = tokio::sync::mpsc::unbounded_channel();
        let (client_output, _client_events) = tokio::sync::mpsc::unbounded_channel();
        let server_runtime = DeviceSyncRuntime::load(
            server_store.clone(),
            &server_dir,
            EventSink::new(server_output),
        )
        .unwrap();
        let client_runtime = DeviceSyncRuntime::load(
            client_store.clone(),
            &client_dir,
            EventSink::new(client_output),
        )
        .unwrap();
        let (engine, events) = Engine::with_store(
            Vec::new(),
            SkillLibrary::new(Vec::new()),
            server_store.clone(),
        );
        let events = codetwo_server::fanout(events);
        let auth_path = server_dir.join("remote-devices.json");
        let auth = Arc::new(codetwo_server::AuthState::load(Some(auth_path.clone())));
        let token = auth.issue_c2_pairing_token(Duration::from_secs(60));
        let service: Arc<dyn codetwo_server::DeviceSyncHttp> = server_runtime.clone();
        let (address, server) = codetwo_server::bind_and_serve_with_services(
            Arc::new(engine),
            events,
            "127.0.0.1:0".parse().unwrap(),
            auth.clone(),
            server_store.clone(),
            codetwo_core::CanvasFeatureGate::default(),
            Some(service),
        )
        .await
        .unwrap();

        let paired = client_runtime
            .pair_device(
                &format!("http://{address}/pair#token={token}"),
                Some("Client C2"),
            )
            .await
            .unwrap();
        assert_eq!(paired.device.direction, "outgoing");
        let status = client_runtime.set_enabled(true).await;
        assert!(matches!(status.state, DeviceSyncState::Ready));
        let snapshot = client_store.device_sync_snapshot("client-check").unwrap();
        assert_eq!(snapshot.projects.len(), 1);
        assert_eq!(snapshot.sessions.len(), 1);
        assert_eq!(snapshot.parts.len(), 1);

        let private_state = std::fs::read_to_string(&client_runtime.paired_state_path).unwrap();
        let bearer = client_runtime.peers()[0].bearer.clone();
        assert!(private_state.contains(&bearer));
        assert!(!std::fs::read_to_string(auth_path)
            .unwrap()
            .contains(&bearer));
        let incoming = auth
            .list_devices()
            .into_iter()
            .find(|device| device.protocol == "c2")
            .unwrap();
        assert!(auth.revoke_device(&incoming.id));
        let revoked = client_runtime.sync_now().await;
        assert!(matches!(revoked.state, DeviceSyncState::Error));
        assert!(revoked.message.unwrap().contains("invalid or revoked"));
        server.abort();
    }
}
