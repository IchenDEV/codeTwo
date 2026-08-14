//! Remote-control server as a desktop-host plugin.
//!
//! The listener, authentication state and command surface share one plugin scope. Disabling or
//! reloading the plugin therefore aborts the listener and unregisters every `remote.*` command.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use codetwo_core::app::{CanvasService, EngineService, EventBus, StoreService};
use codetwo_core::{Engine, Event, Store};
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginError, PluginResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::broadcast;

pub struct RemotePlugin {
    auth_path: PathBuf,
}

impl RemotePlugin {
    pub fn new(auth_path: PathBuf) -> Self {
        Self { auth_path }
    }
}

#[derive(Serialize, Clone)]
struct RemoteStatus {
    port: u16,
    endpoints: Vec<codetwo_server::PairingEndpoint>,
}

#[derive(Serialize)]
struct RemotePairingLink {
    endpoint_id: String,
    url: String,
    token: String,
    expires_in: u64,
    qr_svg: String,
}

struct RemoteHandle {
    port: u16,
    auth: Arc<codetwo_server::AuthState>,
    task: tokio::task::JoinHandle<()>,
}

struct RemoteRuntime {
    engine: Arc<Engine>,
    store: Arc<Store>,
    events: broadcast::Sender<Event>,
    canvas_gate: codetwo_core::CanvasFeatureGate,
    auth_path: PathBuf,
    running: Mutex<Option<RemoteHandle>>,
}

impl RemoteRuntime {
    fn endpoints(port: u16) -> Vec<codetwo_server::PairingEndpoint> {
        codetwo_server::pairing_endpoints(port)
    }

    fn auth(&self) -> Arc<codetwo_server::AuthState> {
        if let Some(handle) = &*self.running.lock().unwrap() {
            return handle.auth.clone();
        }
        Arc::new(codetwo_server::AuthState::load(Some(
            self.auth_path.clone(),
        )))
    }

    fn stop(&self) {
        if let Some(handle) = self.running.lock().unwrap().take() {
            handle.task.abort();
        }
    }
}

fn take_args<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, PluginError> {
    let value = if value.is_null() {
        Value::Object(Default::default())
    } else {
        value
    };
    serde_json::from_value(value)
        .map_err(|error| PluginError::new(format!("bad arguments: {error}")))
}

fn json<T: Serialize>(value: T) -> Result<Value, PluginError> {
    serde_json::to_value(value).map_err(PluginError::new)
}

#[async_trait]
impl Plugin for RemotePlugin {
    fn name(&self) -> &str {
        "remote"
    }

    fn inject(&self) -> Injection {
        Injection::required(["engine", "store", "bus", "canvas"])
    }

    fn description(&self) -> Option<&str> {
        Some("Authenticated remote access to the live desktop engine.")
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let runtime = Arc::new(RemoteRuntime {
            engine: ctx
                .get::<EngineService>()
                .ok_or_else(|| PluginError::new("engine service is unavailable"))?
                .0
                .clone(),
            store: ctx
                .get::<StoreService>()
                .ok_or_else(|| PluginError::new("store service is unavailable"))?
                .0
                .clone(),
            events: ctx
                .get::<EventBus>()
                .ok_or_else(|| PluginError::new("event bus is unavailable"))?
                .0
                .clone(),
            canvas_gate: ctx
                .get::<CanvasService>()
                .ok_or_else(|| PluginError::new("canvas service is unavailable"))?
                .gate
                .clone(),
            auth_path: self.auth_path.clone(),
            running: Mutex::new(None),
        });
        let cleanup = runtime.clone();
        ctx.effect(move || cleanup.stop());

        #[derive(Deserialize)]
        struct StartArgs {
            #[serde(default)]
            port: Option<u16>,
        }
        let service = runtime.clone();
        ctx.command("remote.start", move |args| {
            let service = service.clone();
            async move {
                let args: StartArgs = take_args(args)?;
                if let Some(handle) = &*service.running.lock().unwrap() {
                    return json(RemoteStatus {
                        port: handle.port,
                        endpoints: RemoteRuntime::endpoints(handle.port),
                    });
                }
                let port = args.port.unwrap_or(4599);
                let addr: std::net::SocketAddr = format!("0.0.0.0:{port}")
                    .parse()
                    .map_err(PluginError::new)?;
                let auth = Arc::new(codetwo_server::AuthState::load(Some(
                    service.auth_path.clone(),
                )));
                let (local, task) = codetwo_server::bind_and_serve_with_canvas(
                    service.engine.clone(),
                    service.events.clone(),
                    addr,
                    auth.clone(),
                    service.store.clone(),
                    service.canvas_gate.clone(),
                )
                .await
                .map_err(PluginError::new)?;
                let status = RemoteStatus {
                    port: local.port(),
                    endpoints: RemoteRuntime::endpoints(local.port()),
                };
                *service.running.lock().unwrap() = Some(RemoteHandle {
                    port: local.port(),
                    auth,
                    task,
                });
                json(status)
            }
        })?;

        let service = runtime.clone();
        ctx.command("remote.stop", move |_| {
            let service = service.clone();
            async move {
                service.stop();
                Ok(Value::Null)
            }
        })?;

        let service = runtime.clone();
        ctx.command("remote.status", move |_| {
            let service = service.clone();
            async move {
                let status = service
                    .running
                    .lock()
                    .unwrap()
                    .as_ref()
                    .map(|handle| RemoteStatus {
                        port: handle.port,
                        endpoints: RemoteRuntime::endpoints(handle.port),
                    });
                json(status)
            }
        })?;

        #[derive(Deserialize)]
        struct PairingArgs {
            #[serde(default)]
            ttl_secs: Option<u64>,
            #[serde(default)]
            endpoint_id: Option<String>,
            #[serde(default)]
            client_protocol: Option<String>,
        }
        let service = runtime.clone();
        ctx.command("remote.pairing_link", move |args| {
            let service = service.clone();
            async move {
                let args: PairingArgs = take_args(args)?;
                let guard = service.running.lock().unwrap();
                let handle = guard
                    .as_ref()
                    .ok_or_else(|| PluginError::new("turn on network access first"))?;
                let endpoints = RemoteRuntime::endpoints(handle.port);
                let endpoint = codetwo_server::select_pairing_endpoint(
                    &endpoints,
                    args.endpoint_id.as_deref(),
                )
                .map_err(PluginError::new)?;
                let ttl = std::time::Duration::from_secs(
                    args.ttl_secs
                        .unwrap_or(codetwo_server::DEFAULT_PAIRING_TTL.as_secs()),
                );
                let token = match args.client_protocol.as_deref().unwrap_or("t3") {
                    "t3" => handle.auth.issue_t3_pairing_token(ttl),
                    "legacy" => handle.auth.issue_pairing_token(ttl),
                    protocol => {
                        return Err(PluginError::new(format!(
                            "unsupported remote client protocol: {protocol}"
                        )))
                    }
                };
                let url = codetwo_server::pairing_url_for_endpoint(&endpoint.url, &token);
                let qr_svg = if endpoint.qr_shareable {
                    codetwo_server::pairing_qr_svg(&url).unwrap_or_default()
                } else {
                    String::new()
                };
                json(RemotePairingLink {
                    endpoint_id: endpoint.id.clone(),
                    url,
                    token,
                    expires_in: ttl.as_secs(),
                    qr_svg,
                })
            }
        })?;

        let service = runtime.clone();
        ctx.command("remote.devices", move |_| {
            let service = service.clone();
            async move { json(service.auth().list_devices()) }
        })?;

        #[derive(Deserialize)]
        struct IdArgs {
            id: String,
        }
        ctx.command("remote.revoke_device", move |args| {
            let service = runtime.clone();
            async move {
                let args: IdArgs = take_args(args)?;
                json(
                    service
                        .auth()
                        .try_revoke_device(&args.id)
                        .map_err(PluginError::new)?,
                )
            }
        })?;
        Ok(())
    }
}
