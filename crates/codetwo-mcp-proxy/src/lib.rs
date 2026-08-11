//! Local MCP proxy helpers. The binary receives only an opaque daemon lease;
//! all original targets and secret values stay inside the daemon gateway.

use std::collections::HashMap;
use std::fmt;

use codetwo_protocol::mcp_gateway::{
    write_handshake, GatewayHandshake, GatewayProtocolError, HANDSHAKE_VERSION, MAX_HANDSHAKE_BYTES,
};
use tokio::io::AsyncWriteExt;

pub const LEASE_HEADER: &str = "x-codetwo-lease-ref";
pub const MAX_HTTP_METADATA_BYTES: usize = 64 * 1024;

#[derive(Debug, thiserror::Error, Clone, PartialEq, Eq)]
pub enum ProxyError {
    #[error("proxy argument is missing")]
    MissingArgument,
    #[error("proxy argument is invalid")]
    InvalidArgument,
    #[error("proxy endpoint must be loopback HTTP(S)")]
    NonLoopbackEndpoint,
    #[error("proxy request metadata is too large")]
    OversizedMetadata,
    #[error("proxy daemon handshake failed")]
    Handshake,
    #[error("proxy I/O failed")]
    Io,
}

#[derive(Clone, PartialEq, Eq)]
pub struct ProxyArgs {
    pub socket: String,
    pub lease_ref: String,
    pub run_id: String,
    pub server_id: String,
}

impl fmt::Debug for ProxyArgs {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ProxyArgs")
            .field("socket", &self.socket)
            .field("lease_ref", &"<opaque>")
            .field("run_id", &self.run_id)
            .field("server_id", &self.server_id)
            .finish()
    }
}

impl ProxyArgs {
    pub fn parse<I, S>(args: I) -> Result<Self, ProxyError>
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        let mut values = args.into_iter().map(Into::into);
        let mut fields = HashMap::new();
        while let Some(flag) = values.next() {
            let Some(value) = values.next() else {
                return Err(ProxyError::MissingArgument);
            };
            let key = flag.strip_prefix("--").ok_or(ProxyError::InvalidArgument)?;
            if !matches!(key, "socket" | "lease-ref" | "run-id" | "server")
                || fields.insert(key.to_string(), value).is_some()
            {
                return Err(ProxyError::InvalidArgument);
            }
        }
        Ok(Self {
            socket: fields.remove("socket").ok_or(ProxyError::MissingArgument)?,
            lease_ref: fields
                .remove("lease-ref")
                .ok_or(ProxyError::MissingArgument)?,
            run_id: fields.remove("run-id").ok_or(ProxyError::MissingArgument)?,
            server_id: fields.remove("server").ok_or(ProxyError::MissingArgument)?,
        })
    }

    pub fn handshake(&self) -> GatewayHandshake {
        GatewayHandshake {
            version: HANDSHAKE_VERSION,
            lease_ref: self.lease_ref.clone(),
            run_id: self.run_id.clone(),
            server_id: self.server_id.clone(),
        }
    }
}

impl fmt::Display for ProxyArgs {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "proxy socket={} server={} run={}",
            self.socket, self.server_id, self.run_id
        )
    }
}

/// Remove the daemon-only lease header before forwarding to an upstream MCP
/// server. Header names are case-insensitive; values are never logged.
pub fn strip_lease_header(headers: &[(String, String)]) -> Vec<(String, String)> {
    headers
        .iter()
        .filter(|(name, _)| !name.eq_ignore_ascii_case(LEASE_HEADER))
        .cloned()
        .collect()
}

/// Inject resolved secret headers only on the outbound daemon-to-upstream
/// request. The provider-facing request never calls this helper.
pub fn inject_secret_headers(
    mut headers: Vec<(String, String)>,
    secrets: &[(String, String)],
) -> Vec<(String, String)> {
    headers.extend(secrets.iter().cloned());
    headers
}

pub fn validate_loopback_endpoint(endpoint: &str) -> Result<(), ProxyError> {
    let url = url::Url::parse(endpoint).map_err(|_| ProxyError::NonLoopbackEndpoint)?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(ProxyError::NonLoopbackEndpoint);
    }
    let loopback = match url.host() {
        Some(url::Host::Domain(host)) => host.eq_ignore_ascii_case("localhost"),
        Some(url::Host::Ipv4(address)) => address.is_loopback(),
        Some(url::Host::Ipv6(address)) => address.is_loopback(),
        None => false,
    };
    if loopback {
        Ok(())
    } else {
        Err(ProxyError::NonLoopbackEndpoint)
    }
}

pub fn bound_metadata_size(headers: &[(String, String)], body: &[u8]) -> Result<(), ProxyError> {
    let headers_size = headers
        .iter()
        .map(|(name, value)| name.len() + value.len())
        .sum::<usize>();
    if headers_size.saturating_add(body.len()) > MAX_HTTP_METADATA_BYTES {
        return Err(ProxyError::OversizedMetadata);
    }
    Ok(())
}

pub async fn connect_and_handshake(args: &ProxyArgs) -> Result<(), ProxyError> {
    #[cfg(unix)]
    {
        let mut stream = tokio::net::UnixStream::connect(&args.socket)
            .await
            .map_err(|_| ProxyError::Io)?;
        write_handshake(&mut stream, &args.handshake())
            .await
            .map_err(map_handshake_error)
    }
    #[cfg(not(unix))]
    {
        let _ = args;
        Err(ProxyError::Io)
    }
}

/// Connect to the daemon and bridge the provider's stdio in both directions.
/// The provider sees only this process and its local socket/lease arguments;
/// the daemon owns the original MCP process and resolves credentials after
/// validating the handshake.
pub async fn run_stdio_proxy(args: &ProxyArgs) -> Result<(), ProxyError> {
    #[cfg(unix)]
    {
        let mut stream = tokio::net::UnixStream::connect(&args.socket)
            .await
            .map_err(|_| ProxyError::Io)?;
        write_handshake(&mut stream, &args.handshake())
            .await
            .map_err(map_handshake_error)?;
        let mut stdin = tokio::io::stdin();
        let mut stdout = tokio::io::stdout();
        bridge_provider_io(stream, &mut stdin, &mut stdout).await
    }
    #[cfg(not(unix))]
    {
        let _ = args;
        Err(ProxyError::Io)
    }
}

/// Bridge provider stdio over an already-handshaken daemon stream.  A local
/// stdin EOF half-closes the daemon writer, then the final daemon response is
/// drained to local stdout instead of being truncated by a `select!` return.
#[cfg(unix)]
pub async fn bridge_provider_io<R, W>(
    stream: tokio::net::UnixStream,
    mut provider_in: R,
    mut provider_out: W,
) -> Result<(), ProxyError>
where
    R: tokio::io::AsyncRead + Unpin,
    W: tokio::io::AsyncWrite + Unpin,
{
    let (mut reader, mut writer) = stream.into_split();
    let inbound = async {
        let result = tokio::io::copy(&mut provider_in, &mut writer).await;
        let _ = writer.shutdown().await;
        result
    };
    let outbound = tokio::io::copy(&mut reader, &mut provider_out);
    tokio::pin!(inbound);
    tokio::pin!(outbound);
    tokio::select! {
        result = &mut inbound => {
            result.map_err(|_| ProxyError::Io)?;
            (&mut outbound).await.map_err(|_| ProxyError::Io).map(|_| ())
        }
        result = &mut outbound => result.map_err(|_| ProxyError::Io).map(|_| ()),
    }
}

fn map_handshake_error(error: GatewayProtocolError) -> ProxyError {
    match error {
        GatewayProtocolError::Oversized => ProxyError::Handshake,
        GatewayProtocolError::Malformed | GatewayProtocolError::Io => ProxyError::Handshake,
    }
}

pub fn handshake_size_limit() -> usize {
    MAX_HANDSHAKE_BYTES
}

#[cfg(test)]
mod tests {
    use super::*;
    use codetwo_core::skill::{
        McpCredentialState, McpGatewayBinding, McpGatewayTransport, McpSecretBinding, McpServer,
        McpTransport,
    };
    use codetwo_core::SecretRef;
    #[cfg(unix)]
    use codetwo_protocol::mcp_gateway::read_handshake;
    #[cfg(unix)]
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn parses_args_and_redacts_lease_display() {
        let args = ProxyArgs::parse([
            "--socket",
            "/tmp/gateway.sock",
            "--lease-ref",
            "proxy-sentinel",
            "--run-id",
            "run",
            "--server",
            "server",
        ])
        .unwrap();
        assert_eq!(args.server_id, "server");
        assert!(!args.to_string().contains("proxy-sentinel"));
        assert_eq!(args.handshake().version, HANDSHAKE_VERSION);
    }

    #[test]
    fn rejects_duplicate_and_unknown_proxy_flags() {
        assert!(matches!(
            ProxyArgs::parse([
                "--socket",
                "/tmp/one",
                "--socket",
                "/tmp/two",
                "--lease-ref",
                "lease",
                "--run-id",
                "run",
                "--server",
                "server",
            ]),
            Err(ProxyError::InvalidArgument)
        ));
        assert!(matches!(
            ProxyArgs::parse([
                "--socket",
                "/tmp/one",
                "--lease-ref",
                "lease",
                "--run-id",
                "run",
                "--server",
                "server",
                "--extra",
                "value",
            ]),
            Err(ProxyError::InvalidArgument)
        ));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn bridge_drains_final_response_after_provider_eof() {
        let dir = tempfile::tempdir().unwrap();
        let socket = dir.path().join("gateway.sock");
        let listener = tokio::net::UnixListener::bind(&socket).unwrap();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let handshake = read_handshake(&mut stream).await.unwrap();
            assert_eq!(handshake.server_id, "server");
            let mut request = Vec::new();
            stream.read_to_end(&mut request).await.unwrap();
            assert_eq!(request, b"request");
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
            stream.write_all(b"final-response").await.unwrap();
            stream.shutdown().await.unwrap();
        });
        let args = ProxyArgs {
            socket: socket.display().to_string(),
            lease_ref: "opaque-lease".into(),
            run_id: "run".into(),
            server_id: "server".into(),
        };
        let stream = tokio::net::UnixStream::connect(&args.socket).await.unwrap();
        let mut stream = stream;
        write_handshake(&mut stream, &args.handshake())
            .await
            .unwrap();
        let (mut input_peer, input) = tokio::io::duplex(1024);
        let (output, mut output_peer) = tokio::io::duplex(1024);
        input_peer.write_all(b"request").await.unwrap();
        input_peer.shutdown().await.unwrap();
        bridge_provider_io(stream, input, output).await.unwrap();
        let mut response = Vec::new();
        output_peer.read_to_end(&mut response).await.unwrap();
        assert_eq!(response, b"final-response");
        server.abort();
        let _ = server.await;
    }

    #[test]
    fn strips_lease_and_injects_only_outbound_secret() {
        let provider = vec![
            (LEASE_HEADER.to_string(), "opaque-lease".into()),
            ("Accept".into(), "application/json".into()),
        ];
        let stripped = strip_lease_header(&provider);
        assert_eq!(stripped, vec![("Accept".into(), "application/json".into())]);
        let outbound = inject_secret_headers(
            stripped,
            &[("Authorization".into(), "proxy-sentinel".into())],
        );
        assert!(outbound.iter().any(|(_, value)| value == "proxy-sentinel"));
        assert!(!strip_lease_header(&provider)
            .iter()
            .any(|(_, value)| value == "proxy-sentinel"));
    }

    #[test]
    fn validates_loopback_and_bounds_metadata() {
        assert!(validate_loopback_endpoint("http://127.0.0.1:4317/mcp").is_ok());
        assert!(validate_loopback_endpoint("http://[::1]:4317/mcp").is_ok());
        assert!(validate_loopback_endpoint("http://evil.invalid/mcp").is_err());
        assert!(bound_metadata_size(&[("x".into(), "y".into())], b"body").is_ok());
        assert!(
            bound_metadata_size(&[("x".into(), "y".repeat(MAX_HTTP_METADATA_BYTES))], b"").is_err()
        );
    }

    #[test]
    fn parses_stdio_args_emitted_by_core_gateway_encoding() {
        let server = McpServer {
            name: "stdio".into(),
            cwd: None,
            credential_state: McpCredentialState::Ready,
            transport: McpTransport::Stdio {
                command: "upstream".into(),
                args: vec![],
                env: vec![McpSecretBinding::new("TOKEN", SecretRef::new())],
                launch_env: vec![],
            },
        };
        let value = server
            .to_gateway_acp_json(Some(&McpGatewayBinding {
                server_id: "stdio".into(),
                run_id: "run-1".into(),
                transport: McpGatewayTransport::Stdio,
                endpoint_or_command: "codetwo-mcp-proxy".into(),
                lease_ref: SecretRef::from("opaque-lease"),
                proxy_socket: Some("/tmp/mcp-gateway.sock".into()),
            }))
            .unwrap();
        let args = value["args"]
            .as_array()
            .unwrap()
            .iter()
            .map(|value| value.as_str().unwrap())
            .collect::<Vec<_>>();
        let parsed = ProxyArgs::parse(args).unwrap();
        assert_eq!(parsed.run_id, "run-1");
        assert_eq!(parsed.server_id, "stdio");
        assert_eq!(parsed.socket, "/tmp/mcp-gateway.sock");
    }
}
