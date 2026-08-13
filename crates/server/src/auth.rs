//! Pairing and session auth for the remote-control server.
//!
//! Three credential tiers, so no long-lived secret ever travels in a URL:
//!
//! 1. **Pairing token** — one-time, short-TTL. Minted by the desktop app (or the headless binary at
//!    startup), carried in the pairing URL *fragment* (`/pair#token=…`, never sent over the wire in a
//!    request line), and exchanged once at `POST /api/pair`.
//! 2. **Device bearer** — long-lived, per-device, returned by pairing. Presented in the
//!    `Authorization` header only. Persisted (hashed) so pairing survives restarts; revocable.
//! 3. **WebSocket ticket** — 5-minute, single-use, minted at `POST /api/ws-ticket` with a valid
//!    bearer. The only credential that ever appears in a query string, and it dies on first use.
//!
//! Only SHA-256 hashes of pairing tokens and bearers are kept (in memory and on disk); the raw
//! value is shown once and never stored.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::sync::broadcast;

/// Default lifetime of a pairing token: long enough to walk to another room and type a URL.
pub const DEFAULT_PAIRING_TTL: Duration = Duration::from_secs(15 * 60);
/// Lifetime of a WebSocket ticket: just long enough to open the socket.
pub const WS_TICKET_TTL: Duration = Duration::from_secs(5 * 60);

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
fn hash(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

fn new_secret() -> String {
    // Two UUIDv4s back to back: 244 bits of randomness, plain hex, easy to copy.
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

/// One paired device, as persisted. Only the bearer's hash is kept.
#[derive(Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: String,
    pub name: String,
    token_hash: String,
    pub created_at: u64,
    pub last_seen: u64,
    #[serde(default)]
    expires_at: Option<u64>,
    #[serde(default)]
    scopes: Vec<String>,
    // `None` is retained only for migration from auth files written before the two remote
    // protocols were isolated. Old bounded/scoped credentials are unambiguously T3 credentials;
    // old unbounded credentials belong to the original Code2 browser protocol.
    #[serde(default)]
    protocol: Option<CredentialProtocol>,
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum CredentialProtocol {
    Legacy,
    T3,
}

impl Device {
    fn effective_protocol(&self) -> CredentialProtocol {
        self.protocol.unwrap_or_else(|| {
            if self.expires_at.is_some() || !self.scopes.is_empty() {
                CredentialProtocol::T3
            } else {
                CredentialProtocol::Legacy
            }
        })
    }
}

/// The device list as shown to the UI — no hashes.
#[derive(Clone, Serialize)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub last_seen: u64,
}

/// Result of a successful pairing: the raw bearer is returned exactly once.
#[derive(Serialize)]
pub struct Paired {
    pub device_id: String,
    pub bearer: String,
}

struct PairingToken {
    token_hash: String,
    expires_at: u64,
    protocol: CredentialProtocol,
}

struct WsTicket {
    ticket: String,
    device_id: String,
    expires_at: u64,
    scopes: Vec<String>,
    protocol: CredentialProtocol,
}

#[derive(Clone)]
pub(crate) struct BearerAuthorization {
    pub device_id: String,
    pub expires_at: Option<u64>,
    pub scopes: Vec<String>,
}

pub(crate) struct TicketAuthorization {
    pub device_id: String,
    pub scopes: Vec<String>,
}

#[derive(Default, Serialize, Deserialize)]
struct PersistedAuth {
    devices: Vec<Device>,
}

/// All auth state for one server instance. Pairing tokens and tickets are memory-only; paired
/// devices persist to `persist_path` (when set) so a phone stays paired across restarts.
pub struct AuthState {
    pairing: Mutex<Vec<PairingToken>>,
    tickets: Mutex<Vec<WsTicket>>,
    devices: Mutex<Vec<Device>>,
    persist_path: Option<PathBuf>,
    revocations: broadcast::Sender<String>,
}

impl AuthState {
    /// Create the auth state, loading previously paired devices from `persist_path` if present.
    pub fn load(persist_path: Option<PathBuf>) -> Self {
        let devices = persist_path
            .as_ref()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|s| serde_json::from_str::<PersistedAuth>(&s).ok())
            .map(|p| p.devices)
            .unwrap_or_default();
        let (revocations, _) = broadcast::channel(64);
        Self {
            pairing: Mutex::new(Vec::new()),
            tickets: Mutex::new(Vec::new()),
            devices: Mutex::new(devices),
            persist_path,
            revocations,
        }
    }

    /// A protocol adapter may keep non-secret compatibility metadata beside the shared device
    /// registry. Tests and ephemeral listeners that pass no auth path remain fully in-memory.
    pub(crate) fn sibling_persist_path(&self, file_name: &str) -> Option<PathBuf> {
        self.persist_path
            .as_ref()
            .and_then(|path| path.parent())
            .map(|directory| directory.join(file_name))
    }

    fn persist(&self, devices: &[Device]) -> Result<(), String> {
        let Some(path) = &self.persist_path else {
            return Ok(());
        };
        let directory = path
            .parent()
            .filter(|directory| !directory.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        std::fs::create_dir_all(directory)
            .map_err(|error| format!("could not create remote auth directory: {error}"))?;
        let blob = PersistedAuth {
            devices: devices.to_vec(),
        };
        let json = serde_json::to_vec_pretty(&blob)
            .map_err(|error| format!("could not serialize remote auth state: {error}"))?;
        let mut temporary = tempfile::NamedTempFile::new_in(directory)
            .map_err(|error| format!("could not create remote auth temporary file: {error}"))?;
        temporary
            .write_all(&json)
            .and_then(|_| temporary.as_file().sync_all())
            .map_err(|error| format!("could not write remote auth state: {error}"))?;
        temporary
            .persist(path)
            .map_err(|error| format!("could not install remote auth state: {}", error.error))?;
        #[cfg(unix)]
        std::fs::File::open(directory)
            .and_then(|directory| directory.sync_all())
            .map_err(|error| format!("could not sync remote auth directory: {error}"))?;
        Ok(())
    }

    /// Mint a one-time pairing token. The raw token is returned (put it in a URL fragment / QR);
    /// only its hash is kept.
    pub fn issue_pairing_token(&self, ttl: Duration) -> String {
        self.issue_pairing_token_for_protocol(ttl, CredentialProtocol::Legacy)
    }

    /// Mint a one-time bootstrap code that may only be redeemed through the T3 OAuth exchange.
    pub fn issue_t3_pairing_token(&self, ttl: Duration) -> String {
        self.issue_pairing_token_for_protocol(ttl, CredentialProtocol::T3)
    }

    fn issue_pairing_token_for_protocol(
        &self,
        ttl: Duration,
        protocol: CredentialProtocol,
    ) -> String {
        let token = new_secret();
        let now = now_secs();
        let mut pairing = self.pairing.lock().unwrap();
        pairing.retain(|p| p.expires_at > now);
        pairing.push(PairingToken {
            token_hash: hash(&token),
            expires_at: now + ttl.as_secs(),
            protocol,
        });
        token
    }

    /// Exchange a pairing token for a device bearer. Consumes the token (single use).
    pub fn pair(&self, token: &str, device_name: &str) -> Option<Paired> {
        self.try_pair(token, device_name).ok().flatten()
    }

    /// Fallible pairing used by user-facing routes so a durable-write failure is never reported
    /// as a successful long-lived registration.
    pub fn try_pair(&self, token: &str, device_name: &str) -> Result<Option<Paired>, String> {
        self.pair_with_protocol(
            token,
            device_name,
            None,
            Vec::new(),
            CredentialProtocol::Legacy,
        )
    }

    /// Exchange a pairing token for a bounded bearer used by protocol adapters.
    #[cfg(test)]
    pub(crate) fn pair_with_profile(
        &self,
        token: &str,
        device_name: &str,
        ttl: Option<Duration>,
        scopes: Vec<String>,
    ) -> Option<Paired> {
        self.try_pair_with_profile(token, device_name, ttl, scopes)
            .ok()
            .flatten()
    }

    pub(crate) fn try_pair_with_profile(
        &self,
        token: &str,
        device_name: &str,
        ttl: Option<Duration>,
        scopes: Vec<String>,
    ) -> Result<Option<Paired>, String> {
        self.pair_with_protocol(token, device_name, ttl, scopes, CredentialProtocol::T3)
    }

    fn pair_with_protocol(
        &self,
        token: &str,
        device_name: &str,
        ttl: Option<Duration>,
        scopes: Vec<String>,
        protocol: CredentialProtocol,
    ) -> Result<Option<Paired>, String> {
        let now = now_secs();
        let token_hash = hash(token);
        let mut pairing = self.pairing.lock().unwrap();
        pairing.retain(|p| p.expires_at > now);
        let Some(pairing_index) = pairing
            .iter()
            .position(|p| p.token_hash == token_hash && p.protocol == protocol)
        else {
            return Ok(None);
        };
        let bearer = new_secret();
        let device = Device {
            id: uuid::Uuid::new_v4().to_string(),
            name: if device_name.trim().is_empty() {
                "Device".into()
            } else {
                device_name.trim().to_string()
            },
            token_hash: hash(&bearer),
            created_at: now,
            last_seen: now,
            expires_at: ttl.map(|ttl| now.saturating_add(ttl.as_secs())),
            scopes,
            protocol: Some(protocol),
        };
        let device_id = device.id.clone();
        let mut devices = self.devices.lock().unwrap();
        let mut updated = devices.clone();
        updated.push(device);
        self.persist(&updated)?;
        *devices = updated;
        pairing.remove(pairing_index);
        Ok(Some(Paired { device_id, bearer }))
    }

    /// Validate a bearer, returning the device id and refreshing `last_seen`.
    pub fn authorize_bearer(&self, bearer: &str) -> Option<String> {
        self.authorize_bearer_for_protocol(bearer, CredentialProtocol::Legacy)
            .map(|authorization| authorization.device_id)
    }

    pub(crate) fn authorize_bearer_profile(&self, bearer: &str) -> Option<BearerAuthorization> {
        self.authorize_bearer_for_protocol(bearer, CredentialProtocol::T3)
    }

    fn authorize_bearer_for_protocol(
        &self,
        bearer: &str,
        protocol: CredentialProtocol,
    ) -> Option<BearerAuthorization> {
        let token_hash = hash(bearer);
        let now = now_secs();
        let mut devices = self.devices.lock().unwrap();
        let index = devices.iter().position(|device| {
            device.token_hash == token_hash && device.effective_protocol() == protocol
        })?;
        if devices[index]
            .expires_at
            .is_some_and(|expires_at| expires_at <= now)
        {
            devices.remove(index);
            if let Err(error) = self.persist(&devices) {
                tracing::warn!("persist expired remote device cleanup failed: {error}");
            }
            return None;
        }
        let dev = &mut devices[index];
        dev.last_seen = now;
        let authorization = BearerAuthorization {
            device_id: dev.id.clone(),
            expires_at: dev.expires_at,
            scopes: dev.scopes.clone(),
        };
        if let Err(error) = self.persist(&devices) {
            tracing::warn!("persist remote device last-seen failed: {error}");
        }
        Some(authorization)
    }

    /// Mint a short-lived single-use WebSocket ticket for an already-authorized device.
    pub fn issue_ws_ticket(&self, device_id: &str) -> String {
        self.issue_ws_ticket_for_protocol(device_id, Vec::new(), CredentialProtocol::Legacy)
    }

    pub(crate) fn issue_ws_ticket_with_scopes(
        &self,
        device_id: &str,
        scopes: Vec<String>,
    ) -> String {
        self.issue_ws_ticket_for_protocol(device_id, scopes, CredentialProtocol::T3)
    }

    fn issue_ws_ticket_for_protocol(
        &self,
        device_id: &str,
        scopes: Vec<String>,
        protocol: CredentialProtocol,
    ) -> String {
        let ticket = new_secret();
        let now = now_secs();
        let mut tickets = self.tickets.lock().unwrap();
        tickets.retain(|t| t.expires_at > now);
        tickets.push(WsTicket {
            ticket: ticket.clone(),
            device_id: device_id.to_string(),
            expires_at: now + WS_TICKET_TTL.as_secs(),
            scopes,
            protocol,
        });
        ticket
    }

    /// Redeem a WebSocket ticket (single use). Returns the device id it was minted for, and only if
    /// that device is still paired — revoking a device kills its unredeemed tickets too.
    pub fn take_ws_ticket(&self, ticket: &str) -> Option<String> {
        self.take_ws_ticket_for_protocol(ticket, CredentialProtocol::Legacy)
            .map(|authorization| authorization.device_id)
    }

    pub(crate) fn take_ws_ticket_profile(&self, ticket: &str) -> Option<TicketAuthorization> {
        self.take_ws_ticket_for_protocol(ticket, CredentialProtocol::T3)
    }

    fn take_ws_ticket_for_protocol(
        &self,
        ticket: &str,
        protocol: CredentialProtocol,
    ) -> Option<TicketAuthorization> {
        let now = now_secs();
        let issued = {
            let mut tickets = self.tickets.lock().unwrap();
            tickets.retain(|t| t.expires_at > now);
            let idx = tickets
                .iter()
                .position(|t| t.ticket == ticket && t.protocol == protocol)?;
            tickets.remove(idx)
        };
        let mut devices = self.devices.lock().unwrap();
        let index = devices
            .iter()
            .position(|device| device.id == issued.device_id)?;
        if devices[index]
            .expires_at
            .is_some_and(|expires_at| expires_at <= now)
        {
            devices.remove(index);
            if let Err(error) = self.persist(&devices) {
                tracing::warn!("persist expired remote device cleanup failed: {error}");
            }
            return None;
        }
        Some(TicketAuthorization {
            device_id: issued.device_id,
            scopes: issued.scopes,
        })
    }

    pub fn list_devices(&self) -> Vec<DeviceInfo> {
        let now = now_secs();
        let mut devices = self.devices.lock().unwrap();
        let before = devices.len();
        devices.retain(|device| device.expires_at.is_none_or(|expires_at| expires_at > now));
        if devices.len() != before {
            if let Err(error) = self.persist(&devices) {
                tracing::warn!("persist expired remote device cleanup failed: {error}");
            }
        }
        devices
            .iter()
            .map(|d| DeviceInfo {
                id: d.id.clone(),
                name: d.name.clone(),
                created_at: d.created_at,
                last_seen: d.last_seen,
            })
            .collect()
    }

    /// Revoke a paired device. Its bearer stops working immediately.
    pub fn revoke_device(&self, id: &str) -> bool {
        self.try_revoke_device(id).unwrap_or(false)
    }

    /// Fallible revocation for UI/API surfaces that must distinguish "not found" from a write
    /// failure. The in-memory device and live sockets change only after durable persistence.
    pub fn try_revoke_device(&self, id: &str) -> Result<bool, String> {
        let mut devices = self.devices.lock().unwrap();
        let mut updated = devices.clone();
        let before = updated.len();
        updated.retain(|d| d.id != id);
        if updated.len() == before {
            return Ok(false);
        }
        self.persist(&updated)?;
        *devices = updated;
        let _ = self.revocations.send(id.to_string());
        Ok(true)
    }

    pub(crate) fn subscribe_revocations(&self) -> broadcast::Receiver<String> {
        self.revocations.subscribe()
    }

    pub(crate) fn t3_device_is_authorized(&self, id: &str) -> bool {
        let now = now_secs();
        self.devices.lock().unwrap().iter().any(|device| {
            device.id == id
                && device.effective_protocol() == CredentialProtocol::T3
                && device.expires_at.is_none_or(|expires_at| expires_at > now)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairing_is_single_use() {
        let auth = AuthState::load(None);
        let token = auth.issue_pairing_token(DEFAULT_PAIRING_TTL);
        assert!(auth.pair(&token, "Phone").is_some());
        assert!(
            auth.pair(&token, "Phone").is_none(),
            "second exchange must fail"
        );
    }

    #[test]
    fn pairing_tokens_cannot_be_redeemed_by_the_other_protocol() {
        let auth = AuthState::load(None);
        let t3_token = auth.issue_t3_pairing_token(DEFAULT_PAIRING_TTL);
        assert!(auth.pair(&t3_token, "Downgrade attempt").is_none());
        assert!(
            auth.pair_with_profile(
                &t3_token,
                "T3 Phone",
                Some(Duration::from_secs(60)),
                vec!["orchestration:read".into()],
            )
            .is_some(),
            "a rejected cross-protocol exchange must not consume the token"
        );

        let legacy_token = auth.issue_pairing_token(DEFAULT_PAIRING_TTL);
        assert!(auth
            .pair_with_profile(
                &legacy_token,
                "T3 downgrade attempt",
                Some(Duration::from_secs(60)),
                vec!["orchestration:read".into()],
            )
            .is_none());
        assert!(auth.pair(&legacy_token, "Browser").is_some());
    }

    #[test]
    fn bearer_authorizes_and_revocation_kills_it() {
        let auth = AuthState::load(None);
        let token = auth.issue_pairing_token(DEFAULT_PAIRING_TTL);
        let paired = auth.pair(&token, "Phone").unwrap();
        assert_eq!(
            auth.authorize_bearer(&paired.bearer),
            Some(paired.device_id.clone())
        );
        assert!(auth.revoke_device(&paired.device_id));
        assert!(auth.authorize_bearer(&paired.bearer).is_none());
    }

    #[test]
    fn t3_revocation_notifies_live_sockets_and_removes_liveness() {
        let auth = AuthState::load(None);
        let token = auth.issue_t3_pairing_token(DEFAULT_PAIRING_TTL);
        let paired = auth
            .pair_with_profile(
                &token,
                "T3 Phone",
                Some(Duration::from_secs(60)),
                vec!["orchestration:operate".into()],
            )
            .unwrap();
        let mut revocations = auth.subscribe_revocations();
        assert!(auth.t3_device_is_authorized(&paired.device_id));
        assert!(auth.revoke_device(&paired.device_id));
        assert!(!auth.t3_device_is_authorized(&paired.device_id));
        assert_eq!(revocations.try_recv().unwrap(), paired.device_id);
    }

    #[test]
    fn bounded_bearer_enforces_expiry_and_carries_scopes_into_ticket() {
        let auth = AuthState::load(None);
        let token = auth.issue_t3_pairing_token(DEFAULT_PAIRING_TTL);
        let scopes = vec!["orchestration:read".to_string()];
        let paired = auth
            .pair_with_profile(
                &token,
                "T3 Phone",
                Some(Duration::from_secs(60)),
                scopes.clone(),
            )
            .unwrap();
        let authorization = auth.authorize_bearer_profile(&paired.bearer).unwrap();
        assert_eq!(authorization.scopes, scopes);
        assert!(authorization.expires_at.is_some());
        assert!(
            auth.authorize_bearer(&paired.bearer).is_none(),
            "a T3 bearer must not authorize the legacy protocol"
        );
        let ticket = auth.issue_ws_ticket_with_scopes(&authorization.device_id, scopes.clone());
        assert!(
            auth.take_ws_ticket(&ticket).is_none(),
            "a T3 ticket must not authorize the legacy protocol"
        );
        assert_eq!(auth.take_ws_ticket_profile(&ticket).unwrap().scopes, scopes);

        let expired_token = auth.issue_t3_pairing_token(DEFAULT_PAIRING_TTL);
        let expired = auth
            .pair_with_profile(
                &expired_token,
                "Expired T3 Phone",
                Some(Duration::ZERO),
                vec!["orchestration:read".into()],
            )
            .unwrap();
        assert!(auth.authorize_bearer_profile(&expired.bearer).is_none());
    }

    #[test]
    fn ws_ticket_is_single_use_and_dies_with_device() {
        let auth = AuthState::load(None);
        let token = auth.issue_pairing_token(DEFAULT_PAIRING_TTL);
        let paired = auth.pair(&token, "Phone").unwrap();
        assert!(
            auth.authorize_bearer_profile(&paired.bearer).is_none(),
            "a legacy bearer must not authorize the T3 protocol"
        );
        let ticket = auth.issue_ws_ticket(&paired.device_id);
        assert!(
            auth.take_ws_ticket_profile(&ticket).is_none(),
            "a legacy ticket must not authorize the T3 protocol"
        );
        assert_eq!(auth.take_ws_ticket(&ticket), Some(paired.device_id.clone()));
        assert!(
            auth.take_ws_ticket(&ticket).is_none(),
            "ticket must be single use"
        );

        let t2 = auth.issue_ws_ticket(&paired.device_id);
        auth.revoke_device(&paired.device_id);
        assert!(
            auth.take_ws_ticket(&t2).is_none(),
            "revocation must void pending tickets"
        );
    }

    #[test]
    fn devices_persist_across_reload() {
        let dir = std::env::temp_dir().join(format!("codetwo-auth-{}", uuid::Uuid::new_v4()));
        let path = dir.join("remote-devices.json");
        let auth = AuthState::load(Some(path.clone()));
        let token = auth.issue_pairing_token(DEFAULT_PAIRING_TTL);
        let paired = auth.pair(&token, "Tablet").unwrap();

        let reloaded = AuthState::load(Some(path));
        assert_eq!(
            reloaded.authorize_bearer(&paired.bearer),
            Some(paired.device_id)
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn pairing_and_revocation_report_persistence_failures_without_mutating_state() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("remote-devices.json");
        std::fs::create_dir(&path).unwrap();
        let auth = AuthState::load(Some(path.clone()));
        let token = auth.issue_t3_pairing_token(DEFAULT_PAIRING_TTL);
        assert!(auth
            .try_pair_with_profile(
                &token,
                "T3 Phone",
                Some(Duration::from_secs(60)),
                vec!["orchestration:read".into()],
            )
            .is_err());
        assert!(auth.list_devices().is_empty());

        std::fs::remove_dir(&path).unwrap();
        let paired = auth
            .try_pair_with_profile(
                &token,
                "T3 Phone",
                Some(Duration::from_secs(60)),
                vec!["orchestration:read".into()],
            )
            .unwrap()
            .expect("failed persistence must not consume the one-time token");
        assert_eq!(auth.list_devices().len(), 1);

        std::fs::remove_file(&path).unwrap();
        std::fs::create_dir(&path).unwrap();
        assert!(auth.try_revoke_device(&paired.device_id).is_err());
        assert!(auth.t3_device_is_authorized(&paired.device_id));
        std::fs::remove_dir(&path).unwrap();
        assert!(auth.try_revoke_device(&paired.device_id).unwrap());
        assert!(!auth.t3_device_is_authorized(&paired.device_id));
    }
}
