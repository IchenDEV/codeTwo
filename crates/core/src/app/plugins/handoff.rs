//! Portable task transfer as a first-class plugin capability.

use std::sync::Arc;

use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginError, PluginResult};
use serde::Deserialize;
use serde_json::Value;

use crate::app::service::{EngineService, EventBus, HandoffService, StoreService};
use crate::app::{json, take_args};
use crate::handoff::{PortableTaskHandoff, TaskHandoffManager};

pub struct HandoffPlugin;

#[async_trait]
impl Plugin for HandoffPlugin {
    fn name(&self) -> &str {
        "handoff"
    }

    fn description(&self) -> Option<&str> {
        Some("Moves a fenced session and its exact Git workspace between C2 devices.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["engine", "store", "bus"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let engine = ctx.expect::<EngineService>()?;
        let store = ctx.expect::<StoreService>()?;
        let bus = ctx.expect::<EventBus>()?;
        let manager = Arc::new(
            TaskHandoffManager::new(store.0.clone(), engine.0.clone(), Some(bus.0.clone()))
                .map_err(PluginError::new)?,
        );
        ctx.provide(Arc::new(HandoffService(manager.clone())))?;

        #[derive(Deserialize)]
        struct SessionArgs {
            session: String,
        }
        let preparing = manager.clone();
        ctx.command("handoff.prepare", move |args| {
            let manager = preparing.clone();
            async move {
                let args: SessionArgs = take_args(args)?;
                json(
                    manager
                        .prepare(&args.session)
                        .await
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        #[derive(Deserialize)]
        struct TransferArgs {
            session: String,
            target_url: String,
            bearer: String,
            destination: String,
        }
        let transferring = manager.clone();
        ctx.command("handoff.transfer", move |args| {
            let manager = transferring.clone();
            async move {
                let args: TransferArgs = take_args(args)?;
                json(
                    manager
                        .transfer(
                            &args.session,
                            &args.target_url,
                            &args.bearer,
                            &args.destination,
                        )
                        .await
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        #[derive(Deserialize)]
        struct PairingTransferArgs {
            session: String,
            pairing_url: String,
            destination: String,
        }
        let pairing = manager.clone();
        ctx.command("handoff.transfer_pairing", move |args| {
            let manager = pairing.clone();
            async move {
                let args: PairingTransferArgs = take_args(args)?;
                json(
                    manager
                        .transfer_pairing(&args.session, &args.pairing_url, &args.destination)
                        .await
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        #[derive(Deserialize)]
        struct AcceptArgs {
            handoff: PortableTaskHandoff,
            destination: String,
        }
        let accepting = manager.clone();
        ctx.command("handoff.accept", move |args| {
            let manager = accepting.clone();
            async move {
                let args: AcceptArgs = take_args(args)?;
                json(
                    manager
                        .accept(&args.handoff, &args.destination)
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        #[derive(Deserialize)]
        struct FenceArgs {
            session: String,
            handoff: String,
            epoch: u64,
        }
        let activating = manager.clone();
        ctx.command("handoff.activate", move |args| {
            let manager = activating.clone();
            async move {
                let args: FenceArgs = take_args(args)?;
                manager
                    .activate(&args.session, &args.handoff, args.epoch)
                    .map_err(PluginError::new)?;
                Ok(Value::Null)
            }
        })?;

        #[derive(Deserialize)]
        struct RollbackArgs {
            session: String,
            handoff: String,
            epoch: u64,
            destination: String,
        }
        ctx.command("handoff.rollback_target", move |args| {
            let manager = manager.clone();
            async move {
                let args: RollbackArgs = take_args(args)?;
                manager
                    .rollback_target(&args.session, &args.handoff, args.epoch, &args.destination)
                    .map_err(PluginError::new)?;
                Ok(Value::Null)
            }
        })?;

        Ok(())
    }
}
