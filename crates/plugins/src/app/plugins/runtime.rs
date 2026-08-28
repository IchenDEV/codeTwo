//! Two consumers of the agent-loop event stream: the scene hook runtime and the cost tracker.
//!
//! Both used to live in the desktop's `setup()`, sharing one hand-written subscription task with
//! a comment explaining why they were coupled. They are not related, so they are two plugins now,
//! each subscribing to the bus itself. A broadcast channel is built for that; the coupling was
//! saving a receiver and costing a boundary.

use crate::app::events::ScenesChanged;
use crate::app::service::{
    CostService, EngineService, EventBus, SceneRuntimeService, SceneService, StoreService,
};
use crate::app::{json, take_args};
use codetwo_core::cost::SessionCostTracker;
use codetwo_core::event::Event;
use codetwo_core::scene_runtime::SceneRuntime;
use codetwo_core::store::Store;
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginError, PluginResult};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::broadcast;

#[derive(Deserialize)]
struct SessionArgs {
    session: String,
}

// ---- scene hooks ------------------------------------------------------------------------------

/// Runs Agent Scenes hooks against the live event stream, and keeps them on the same resolved
/// library everything else uses.
pub struct SceneRuntimePlugin;

#[async_trait]
impl Plugin for SceneRuntimePlugin {
    fn name(&self) -> &str {
        "scene-runtime"
    }

    fn description(&self) -> Option<&str> {
        Some("Dispatches Agent Scenes hooks and scheduled stage transitions.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["engine", "store", "scenes", "bus"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let engine = ctx.expect::<EngineService>()?;
        let store = ctx.expect::<StoreService>()?;
        let scenes = ctx.expect::<SceneService>()?;
        let bus = ctx.expect::<EventBus>()?;
        let artifacts = scenes.artifacts.clone().ok_or_else(|| {
            PluginError::new("scene hooks need artifact capture, which this store cannot provide")
        })?;

        let submit = engine.0.clone();
        let submit_scope = ctx.weak();
        let runtime = Arc::new(SceneRuntime::new(
            scenes.library(),
            engine.skills(),
            store.0.clone(),
            artifacts,
            Box::new(move |op| {
                let engine = submit.clone();
                if let Some(ctx) = submit_scope.upgrade() {
                    ctx.spawn(async move {
                        if let Err(error) = engine.submit(op).await {
                            tracing::warn!("hook prompt submission failed: {error}");
                        }
                    });
                }
            }),
            bus.0.clone(),
        ));
        ctx.provide(Arc::new(SceneRuntimeService(runtime.clone())))?;

        let hooks = runtime.clone();
        let mut events = bus.subscribe();
        ctx.spawn(async move {
            loop {
                match events.recv().await {
                    Ok(event) => hooks.on_event(&event),
                    // A lag burst must not kill the pump: skip what was dropped and keep going.
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!("scene hook pump lagged; dropped {n} events")
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        });

        let scheduled = runtime.clone();
        ctx.spawn(async move { scheduled.schedule_loop().await });

        // The library is re-resolved on workspace and plugin changes; follow it rather than
        // holding the snapshot we were built with.
        let following = runtime.clone();
        let library = scenes.clone();
        ctx.on::<ScenesChanged, _>(move |_| {
            following.set_scenes(library.library());
            None
        });
        Ok(())
    }
}

// ---- cost -------------------------------------------------------------------------------------

/// Per-session token and cost accounting, fed from the same bus. In-memory: totals reset on
/// restart, as before.
pub struct CostPlugin;

#[async_trait]
impl Plugin for CostPlugin {
    fn name(&self) -> &str {
        "cost"
    }

    fn description(&self) -> Option<&str> {
        Some("Per-session token usage and cost estimates.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["store", "bus"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let store = ctx.expect::<StoreService>()?;
        let bus = ctx.expect::<EventBus>()?;
        let cost = Arc::new(SessionCostTracker::new());
        ctx.provide(Arc::new(CostService(cost.clone())))?;

        let tracker = cost.clone();
        let feed_store = store.0.clone();
        let emit = bus.0.clone();
        let mut events = bus.subscribe();
        ctx.spawn(async move {
            // Per-session throttle for `Event::SessionCost` emission (≥1 s apart).
            let mut last_emit: HashMap<String, Instant> = HashMap::new();
            loop {
                match events.recv().await {
                    Ok(event) => {
                        feed(&tracker, &feed_store, &emit, &mut last_emit, &event);
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!("cost pump lagged; dropped {n} events")
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        });

        let snapshot = cost.clone();
        ctx.command("cost.session", move |args| {
            let cost = snapshot.clone();
            async move {
                let args: SessionArgs = take_args(args)?;
                json(cost.snapshot(&args.session))
            }
        })?;
        Ok(())
    }
}

/// Attribute one event to a session's cost, and emit a throttled snapshot when it changed.
///
/// A model is needed before usage can be priced, and providers do not always announce one — so a
/// usage event for a session we have no model for goes back to the store for it rather than
/// silently accumulating unpriced tokens.
fn feed(
    cost: &SessionCostTracker,
    store: &Store,
    events: &broadcast::Sender<Event>,
    last_emit: &mut HashMap<String, Instant>,
    event: &Event,
) {
    match event {
        Event::Models {
            session, current, ..
        } if !current.is_empty() => {
            if let Ok(Some(record)) = store.get_session(session) {
                cost.set_session_model(session, record.provider.as_str(), current);
            }
        }
        Event::Usage { session, .. } | Event::ContextWindow { session, .. }
            if !cost.has_model(session) =>
        {
            if let Ok(Some(record)) = store.get_session(session) {
                if let Some(model) = record.model.as_deref() {
                    cost.set_session_model(session, record.provider.as_str(), model);
                }
            }
        }
        _ => {}
    }
    cost.observe(event);

    let session = match event {
        Event::Usage { session, .. } | Event::ContextWindow { session, .. } => session,
        _ => return,
    };
    let due = last_emit
        .get(session)
        .is_none_or(|at| at.elapsed() >= Duration::from_secs(1));
    if !due {
        return;
    }
    if let Some(snapshot) = cost.snapshot(session) {
        last_emit.insert(session.clone(), Instant::now());
        let _ = events.send(Event::SessionCost {
            session: session.clone(),
            input_tokens: snapshot.input_tokens,
            output_tokens: snapshot.output_tokens,
            cost_usd: snapshot.cost_usd,
            burn_rate_usd_per_hour: snapshot.burn_rate_usd_per_hour,
            priced: snapshot.priced,
        });
    }
}
