use std::collections::HashMap;
use std::fs;
use std::io;
use std::os::unix::fs::{FileTypeExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use codetwo_core::acp::wire::AgentCaps;
use codetwo_core::{
    McpCredentialState, McpGatewayBinding, McpGatewayBroker, McpGatewayTransport, McpServer,
    McpTransport, SecretRef, SecretStore, SecretStoreError,
};
use codetwo_protocol::mcp_gateway::{read_handshake, HANDSHAKE_VERSION};
use thiserror::Error;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{UnixListener, UnixStream};
use tokio::process::Command;
use tokio::sync::watch;
use tokio::task::JoinSet;

pub const DEFAULT_LEASE_TTL: Duration = Duration::from_secs(300);
const PROXY_COMMAND: &str = "codetwo-mcp-proxy";
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Error)]
pub enum GatewayError {
    #[error("MCP server requires reauthentication")]
    ReauthRequired,
    #[error("MCP credential storage is unavailable")]
    CredentialUnavailable,
    #[error("MCP transport is not yet supported by the local gateway")]
    UnsupportedTransport,
    #[error("MCP gateway socket is unsafe")]
    UnsafeSocket,
    #[error("MCP gateway I/O failed")]
    Io(#[from] io::Error),
}

#[derive(Clone)]
struct Lease {
    run_id: String,
    server: McpServer,
    expires_at: Instant,
}

#[derive(Clone)]
pub struct ToolGateway {
    store: Arc<dyn SecretStore>,
    socket_path: PathBuf,
    ttl: Duration,
    leases: Arc<Mutex<HashMap<SecretRef, Lease>>>,
    ready: watch::Sender<bool>,
}

impl std::fmt::Debug for ToolGateway {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ToolGateway")
            .field("socket_path", &self.socket_path)
            .field("ttl", &self.ttl)
            .field(
                "lease_count",
                &self.leases.lock().map(|leases| leases.len()).unwrap_or(0),
            )
            .finish()
    }
}

impl ToolGateway {
    pub fn new(runtime_dir: impl AsRef<Path>, store: Arc<dyn SecretStore>, ttl: Duration) -> Self {
        let (ready, _) = watch::channel(false);
        Self {
            store,
            socket_path: runtime_dir.as_ref().join("mcp-gateway.sock"),
            ttl,
            leases: Arc::new(Mutex::new(HashMap::new())),
            ready,
        }
    }

    pub fn socket_path(&self) -> &Path {
        &self.socket_path
    }

    pub async fn wait_until_ready(&self) -> Result<(), GatewayError> {
        let mut ready = self.ready.subscribe();
        while !*ready.borrow() {
            ready
                .changed()
                .await
                .map_err(|_| io::Error::other("gateway stopped before becoming ready"))?;
        }
        Ok(())
    }

    fn issue_one(
        &self,
        run_id: &str,
        server: &McpServer,
        _caps: AgentCaps,
    ) -> Result<McpGatewayBinding, GatewayError> {
        if !matches!(server.transport, McpTransport::Stdio { .. }) {
            return Err(GatewayError::UnsupportedTransport);
        }
        match server.credential_state {
            McpCredentialState::Ready => {}
            McpCredentialState::ReauthRequired { .. } => return Err(GatewayError::ReauthRequired),
            McpCredentialState::Unavailable => return Err(GatewayError::CredentialUnavailable),
        }
        for binding in server.secret_bindings() {
            match self.store.get(&binding.secret_ref) {
                Ok(_) => {}
                Err(SecretStoreError::NotFound) => return Err(GatewayError::ReauthRequired),
                Err(_) => return Err(GatewayError::CredentialUnavailable),
            }
        }
        let lease_ref = SecretRef::new();
        let mut leases = self
            .leases
            .lock()
            .map_err(|_| GatewayError::CredentialUnavailable)?;
        leases.retain(|_, lease| lease.expires_at > Instant::now());
        leases.insert(
            lease_ref.clone(),
            Lease {
                run_id: run_id.to_owned(),
                server: server.clone(),
                expires_at: Instant::now() + self.ttl,
            },
        );
        Ok(McpGatewayBinding {
            server_id: server.name.clone(),
            run_id: run_id.to_owned(),
            transport: McpGatewayTransport::Stdio,
            endpoint_or_command: PROXY_COMMAND.to_owned(),
            lease_ref,
            proxy_socket: Some(self.socket_path.display().to_string()),
        })
    }

    pub async fn serve(
        self: Arc<Self>,
        mut shutdown: watch::Receiver<bool>,
    ) -> Result<(), GatewayError> {
        prepare_socket_path(&self.socket_path)?;
        let listener = UnixListener::bind(&self.socket_path)?;
        fs::set_permissions(&self.socket_path, fs::Permissions::from_mode(0o600))?;
        self.ready.send_replace(true);
        let mut connections = JoinSet::new();
        loop {
            tokio::select! {
                accepted = listener.accept() => {
                    let (stream, _) = accepted?;
                    let gateway = Arc::clone(&self);
                    connections.spawn(async move {
                        let _ = gateway.handle_connection(stream).await;
                    });
                }
                changed = shutdown.changed() => {
                    if changed.is_err() || *shutdown.borrow() {
                        break;
                    }
                }
                Some(_) = connections.join_next(), if !connections.is_empty() => {}
            }
        }
        connections.abort_all();
        while connections.join_next().await.is_some() {}
        self.ready.send_replace(false);
        remove_socket_if_owned(&self.socket_path)?;
        Ok(())
    }

    async fn handle_connection(&self, mut stream: UnixStream) -> Result<(), GatewayError> {
        let handshake = tokio::time::timeout(HANDSHAKE_TIMEOUT, read_handshake(&mut stream))
            .await
            .map_err(|_| GatewayError::UnsafeSocket)?
            .map_err(|_| GatewayError::UnsafeSocket)?;
        if handshake.version != HANDSHAKE_VERSION {
            return Err(GatewayError::UnsafeSocket);
        }
        let reference = SecretRef::from_opaque(handshake.lease_ref);
        let lease = {
            let mut leases = self
                .leases
                .lock()
                .map_err(|_| GatewayError::CredentialUnavailable)?;
            leases.retain(|_, lease| lease.expires_at > Instant::now());
            let valid = leases.get(&reference).is_some_and(|lease| {
                lease.expires_at > Instant::now()
                    && lease.run_id == handshake.run_id
                    && lease.server.name == handshake.server_id
            });
            if !valid {
                return Err(GatewayError::UnsafeSocket);
            }
            leases.remove(&reference).expect("validated lease exists")
        };
        self.bridge_stdio(stream, lease.server).await
    }

    async fn bridge_stdio(
        &self,
        stream: UnixStream,
        server: McpServer,
    ) -> Result<(), GatewayError> {
        let McpTransport::Stdio {
            command,
            args,
            env,
            launch_env,
        } = server.transport
        else {
            return Err(GatewayError::UnsupportedTransport);
        };
        let mut resolved = Vec::with_capacity(env.len());
        for binding in env {
            let value = self
                .store
                .get(&binding.secret_ref)
                .map_err(|error| match error {
                    SecretStoreError::NotFound => GatewayError::ReauthRequired,
                    _ => GatewayError::CredentialUnavailable,
                })?;
            resolved.push((binding.name, value));
        }

        let mut process = Command::new(command);
        process
            .args(args)
            .env_clear()
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        for name in ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"] {
            if let Some(value) = std::env::var_os(name) {
                process.env(name, value);
            }
        }
        for (name, value) in &resolved {
            process.env(name, value);
        }
        for (name, value) in launch_env {
            process.env(name, value);
        }
        if let Some(cwd) = server.cwd {
            process.current_dir(cwd);
        }
        let mut child = process.spawn()?;
        let mut child_in = child
            .stdin
            .take()
            .ok_or_else(|| io::Error::other("no stdin"))?;
        let mut child_out = child
            .stdout
            .take()
            .ok_or_else(|| io::Error::other("no stdout"))?;
        let (mut provider_in, mut provider_out) = stream.into_split();
        let inbound = async move {
            let copied = tokio::io::copy(&mut provider_in, &mut child_in).await;
            let _ = child_in.shutdown().await;
            drop(child_in);
            copied
        };
        let secrets = resolved
            .iter()
            .map(|(_, value)| value.as_bytes().to_vec())
            .collect();
        let outbound = async move { redact_copy(&mut child_out, &mut provider_out, secrets).await };
        let (incoming, outgoing) = tokio::join!(inbound, outbound);
        incoming?;
        outgoing?;
        let _ = child.wait().await;
        Ok(())
    }
}

#[async_trait]
impl McpGatewayBroker for ToolGateway {
    async fn issue_bindings(
        &self,
        run_id: &str,
        servers: &[McpServer],
        caps: AgentCaps,
    ) -> Result<Vec<McpGatewayBinding>, String> {
        let mut issued = Vec::with_capacity(servers.len());
        for server in servers {
            match self.issue_one(run_id, server, caps) {
                Ok(binding) => issued.push(binding),
                Err(error) => {
                    if let Ok(mut leases) = self.leases.lock() {
                        for binding in &issued {
                            leases.remove(&binding.lease_ref);
                        }
                    }
                    return Err(error.to_string());
                }
            }
        }
        Ok(issued)
    }
}

fn prepare_socket_path(path: &Path) -> Result<(), GatewayError> {
    let Some(parent) = path.parent() else {
        return Err(GatewayError::UnsafeSocket);
    };
    fs::create_dir_all(parent)?;
    fs::set_permissions(parent, fs::Permissions::from_mode(0o700))?;
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_socket() => fs::remove_file(path)?,
        Ok(_) => return Err(GatewayError::UnsafeSocket),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    Ok(())
}

fn remove_socket_if_owned(path: &Path) -> Result<(), GatewayError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_socket() => fs::remove_file(path)?,
        Ok(_) => return Err(GatewayError::UnsafeSocket),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    Ok(())
}

async fn redact_copy<R, W>(reader: &mut R, writer: &mut W, secrets: Vec<Vec<u8>>) -> io::Result<()>
where
    R: tokio::io::AsyncRead + Unpin,
    W: tokio::io::AsyncWrite + Unpin,
{
    let mut redactor = SecretRedactor::new(secrets);
    let mut chunk = [0u8; 8192];
    loop {
        let read = reader.read(&mut chunk).await?;
        if read == 0 {
            let tail = redactor.push(&[], true);
            writer.write_all(&tail).await?;
            writer.shutdown().await?;
            return Ok(());
        }
        let safe = redactor.push(&chunk[..read], false);
        writer.write_all(&safe).await?;
    }
}

struct SecretRedactor {
    secrets: Vec<Vec<u8>>,
    buffer: Vec<u8>,
    carry: usize,
}

impl SecretRedactor {
    fn new(secrets: Vec<Vec<u8>>) -> Self {
        let secrets = secrets
            .into_iter()
            .filter(|secret| !secret.is_empty())
            .collect::<Vec<_>>();
        let carry = secrets
            .iter()
            .map(Vec::len)
            .max()
            .unwrap_or(1)
            .saturating_sub(1);
        Self {
            secrets,
            buffer: Vec::new(),
            carry,
        }
    }

    fn push(&mut self, bytes: &[u8], final_chunk: bool) -> Vec<u8> {
        self.buffer.extend_from_slice(bytes);
        let mut output = Vec::new();
        loop {
            if let Some((index, length)) = find_secret(&self.buffer, &self.secrets) {
                let safe_end = if final_chunk {
                    self.buffer.len()
                } else {
                    self.buffer.len().saturating_sub(self.carry)
                };
                if index < safe_end {
                    output.extend_from_slice(&self.buffer[..index]);
                    output.extend_from_slice(b"[REDACTED]");
                    self.buffer.drain(..index + length);
                    continue;
                }
            }
            if final_chunk {
                output.extend_from_slice(&self.buffer);
                self.buffer.clear();
            } else {
                let flush = self.buffer.len().saturating_sub(self.carry);
                output.extend_from_slice(&self.buffer[..flush]);
                self.buffer.drain(..flush);
            }
            return output;
        }
    }
}

fn find_secret(bytes: &[u8], secrets: &[Vec<u8>]) -> Option<(usize, usize)> {
    secrets
        .iter()
        .filter_map(|secret| {
            bytes
                .windows(secret.len())
                .position(|window| window == secret)
                .map(|index| (index, secret.len()))
        })
        .min_by(|left, right| left.0.cmp(&right.0).then_with(|| right.1.cmp(&left.1)))
}
