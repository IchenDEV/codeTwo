//! Small, daemon-independent wire contract for the local MCP gateway.
//!
//! The bundled proxy is intentionally a separate binary and must not depend on
//! the daemon's engine/store implementation.  Keep its handshake and framing
//! types here so both ends can evolve behind this versioned boundary.

use std::fmt;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

pub const HANDSHAKE_VERSION: u16 = 1;
pub const MAX_HANDSHAKE_BYTES: usize = 4096;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum GatewayProtocolError {
    #[error("MCP gateway handshake is too large")]
    Oversized,
    #[error("MCP gateway handshake is malformed")]
    Malformed,
    #[error("MCP gateway handshake I/O failed")]
    Io,
}

/// Versioned, length-prefixed handshake sent by the bundled proxy over the
/// daemon's dedicated UDS.  The lease itself is opaque and never displayed.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GatewayHandshake {
    pub version: u16,
    pub lease_ref: String,
    pub run_id: String,
    pub server_id: String,
}

impl fmt::Debug for GatewayHandshake {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("GatewayHandshake")
            .field("version", &self.version)
            .field("lease_ref", &"<opaque>")
            .field("run_id", &self.run_id)
            .field("server_id", &self.server_id)
            .finish()
    }
}

pub async fn write_handshake<W: AsyncWrite + Unpin>(
    writer: &mut W,
    handshake: &GatewayHandshake,
) -> Result<(), GatewayProtocolError> {
    let payload = serde_json::to_vec(handshake).map_err(|_| GatewayProtocolError::Malformed)?;
    if payload.len() > MAX_HANDSHAKE_BYTES {
        return Err(GatewayProtocolError::Oversized);
    }
    let length = u32::try_from(payload.len()).map_err(|_| GatewayProtocolError::Oversized)?;
    writer
        .write_u32(length)
        .await
        .map_err(|_| GatewayProtocolError::Io)?;
    writer
        .write_all(&payload)
        .await
        .map_err(|_| GatewayProtocolError::Io)?;
    writer.flush().await.map_err(|_| GatewayProtocolError::Io)
}

pub async fn read_handshake<R: AsyncRead + Unpin>(
    reader: &mut R,
) -> Result<GatewayHandshake, GatewayProtocolError> {
    let length = reader
        .read_u32()
        .await
        .map_err(|_| GatewayProtocolError::Malformed)? as usize;
    if length > MAX_HANDSHAKE_BYTES {
        return Err(GatewayProtocolError::Oversized);
    }
    let mut payload = vec![0; length];
    reader
        .read_exact(&mut payload)
        .await
        .map_err(|_| GatewayProtocolError::Malformed)?;
    serde_json::from_slice(&payload).map_err(|_| GatewayProtocolError::Malformed)
}
