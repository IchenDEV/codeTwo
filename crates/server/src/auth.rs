//! Pairing and session auth for the remote-control server, t3code-style.
//!
//! Three credential tiers, so no long-lived secret ever travels in a URL:
//!
//! 1. **Pairing token** — one-time, short-TTL. Minted by the desktop app (or the headless binary at
//!    startup), carried in the pairing URL *fragment* (`/#token=…`, never sent over the wire in a
//!    request line), and exchanged once at `POST /api/pair`.
//! 2. **Device bearer** — long-lived, per-device, returned by pairing. Presented in the
//!    `Authorization` header only. Persisted (hashed) so pairing survives restarts; revocable.
//! 3. **WebSocket ticket** — 5-minute, single-use, minted at `POST /api/ws-ticket` with a valid
//!    bearer. The only credential that ever appears in a query string, and it dies on first use.
//!
//! Only SHA-256 hashes of pairing tokens and bearers are kept (in memory and on disk); the raw
//! value is shown once and never stored.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Default lifetime of a pairing token: long enough to walk to another room and type a URL.
pub const DEFAULT_PAIRING_TTL: Duration = Duration::from_secs(15 * 60);
/// Lifetime of a WebSocket ticket: just long enough to open the socket.
pub const WS_TICKET_TTL: Duration = Duration::from_secs(5 * 60);

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn hash(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

fn new_secret() -> String {
    // Two UUIDv4s back to back: 244 bits of randomness, plain hex, easy to copy.
    format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple())
}

/// One paired device, as persisted. Only the bearer's hash is kept.
#[derive(Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: String,
    pub name: String,
    token_hash: String,
    pub created_at: u64,
    pub last_seen: u64,
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
}

struct WsTicket {
    ticket: String,
    device_id: String,
    expires_at: u64,
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
        Self {
            pairing: Mutex::new(Vec::new()),
            tickets: Mutex::new(Vec::new()),
            devices: Mutex::new(devices),
            persist_path,
        }
    }

    fn persist(&self, devices: &[Device]) {
        let Some(path) = &self.persist_path else { return };
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let blob = PersistedAuth { devices: devices.to_vec() };
        if let Ok(json) = serde_json::to_string_pretty(&blob) {
            let _ = std::fs::write(path, json);
        }
    }

    /// Mint a one-time pairing token. The raw token is returned (put it in a URL fragment / QR);
    /// only its hash is kept.
    pub fn issue_pairing_token(&self, ttl: Duration) -> String {
        let token = new_secret();
        let now = now_secs();
        let mut pairing = self.pairing.lock().unwrap();
        pairing.retain(|p| p.expires_at > now);
        pairing.push(PairingToken { token_hash: hash(&token), expires_at: now + ttl.as_secs() });
        token
    }

    /// Exchange a pairing token for a device bearer. Consumes the token (single use).
    pub fn pair(&self, token: &str, device_name: &str) -> Option<Paired> {
        let now = now_secs();
        let token_hash = hash(token);
        {
            let mut pairing = self.pairing.lock().unwrap();
            pairing.retain(|p| p.expires_at > now);
            let idx = pairing.iter().position(|p| p.token_hash == token_hash)?;
            pairing.remove(idx);
        }
        let bearer = new_secret();
        let device = Device {
            id: uuid::Uuid::new_v4().to_string(),
            name: if device_name.trim().is_empty() { "Device".into() } else { device_name.trim().to_string() },
            token_hash: hash(&bearer),
            created_at: now,
            last_seen: now,
        };
        let device_id = device.id.clone();
        let mut devices = self.devices.lock().unwrap();
        devices.push(device);
        self.persist(&devices);
        Some(Paired { device_id, bearer })
    }

    /// Validate a bearer, returning the device id and refreshing `last_seen`.
    pub fn authorize_bearer(&self, bearer: &str) -> Option<String> {
        let token_hash = hash(bearer);
        let mut devices = self.devices.lock().unwrap();
        let dev = devices.iter_mut().find(|d| d.token_hash == token_hash)?;
        dev.last_seen = now_secs();
        let id = dev.id.clone();
        self.persist(&devices);
        Some(id)
    }

    /// Mint a short-lived single-use WebSocket ticket for an already-authorized device.
    pub fn issue_ws_ticket(&self, device_id: &str) -> String {
        let ticket = new_secret();
        let now = now_secs();
        let mut tickets = self.tickets.lock().unwrap();
        tickets.retain(|t| t.expires_at > now);
        tickets.push(WsTicket {
            ticket: ticket.clone(),
            device_id: device_id.to_string(),
            expires_at: now + WS_TICKET_TTL.as_secs(),
        });
        ticket
    }

    /// Redeem a WebSocket ticket (single use). Returns the device id it was minted for, and only if
    /// that device is still paired — revoking a device kills its unredeemed tickets too.
    pub fn take_ws_ticket(&self, ticket: &str) -> Option<String> {
        let now = now_secs();
        let device_id = {
            let mut tickets = self.tickets.lock().unwrap();
            tickets.retain(|t| t.expires_at > now);
            let idx = tickets.iter().position(|t| t.ticket == ticket)?;
            tickets.remove(idx).device_id
        };
        let devices = self.devices.lock().unwrap();
        devices.iter().any(|d| d.id == device_id).then_some(device_id)
    }

    pub fn list_devices(&self) -> Vec<DeviceInfo> {
        self.devices
            .lock()
            .unwrap()
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
        let mut devices = self.devices.lock().unwrap();
        let before = devices.len();
        devices.retain(|d| d.id != id);
        let removed = devices.len() != before;
        if removed {
            self.persist(&devices);
        }
        removed
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
        assert!(auth.pair(&token, "Phone").is_none(), "second exchange must fail");
    }

    #[test]
    fn bearer_authorizes_and_revocation_kills_it() {
        let auth = AuthState::load(None);
        let token = auth.issue_pairing_token(DEFAULT_PAIRING_TTL);
        let paired = auth.pair(&token, "Phone").unwrap();
        assert_eq!(auth.authorize_bearer(&paired.bearer), Some(paired.device_id.clone()));
        assert!(auth.revoke_device(&paired.device_id));
        assert!(auth.authorize_bearer(&paired.bearer).is_none());
    }

    #[test]
    fn ws_ticket_is_single_use_and_dies_with_device() {
        let auth = AuthState::load(None);
        let token = auth.issue_pairing_token(DEFAULT_PAIRING_TTL);
        let paired = auth.pair(&token, "Phone").unwrap();
        let ticket = auth.issue_ws_ticket(&paired.device_id);
        assert_eq!(auth.take_ws_ticket(&ticket), Some(paired.device_id.clone()));
        assert!(auth.take_ws_ticket(&ticket).is_none(), "ticket must be single use");

        let t2 = auth.issue_ws_ticket(&paired.device_id);
        auth.revoke_device(&paired.device_id);
        assert!(auth.take_ws_ticket(&t2).is_none(), "revocation must void pending tickets");
    }

    #[test]
    fn devices_persist_across_reload() {
        let dir = std::env::temp_dir().join(format!("codetwo-auth-{}", uuid::Uuid::new_v4()));
        let path = dir.join("remote-devices.json");
        let auth = AuthState::load(Some(path.clone()));
        let token = auth.issue_pairing_token(DEFAULT_PAIRING_TTL);
        let paired = auth.pair(&token, "Tablet").unwrap();

        let reloaded = AuthState::load(Some(path));
        assert_eq!(reloaded.authorize_bearer(&paired.bearer), Some(paired.device_id));
        let _ = std::fs::remove_dir_all(dir);
    }
}
