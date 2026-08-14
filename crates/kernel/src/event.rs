//! The event bus.
//!
//! Two dialects, on purpose:
//!
//! - **Typed events** ([`Event`]) for Rust plugins — no stringly-typed payloads, no serialization,
//!   and a listener that returns a value so `bail` can express "whoever handles this first wins".
//! - **JSON events** ([`Context::emit_json`](crate::Context::emit_json)) for everything that is not
//!   a Rust plugin: the frontend, the remote-control server, external processes. Same bus, same
//!   scope ownership, payloads as `serde_json::Value`.
//!
//! Listeners belong to the scope that registered them. There is no `off` to forget to call.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

pub(crate) type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// A typed message on the bus.
///
/// `Output` is what a listener may return; `()` for plain notifications. Events that ask a
/// question — "does anyone want to veto this?", "can anyone render this artifact?" — set `Output`
/// to the answer and are dispatched with [`Context::bail`](crate::Context::bail).
///
/// ```
/// # use codetwo_kernel::Event;
/// /// Fired before a turn is sent. Any listener may refuse it with a reason.
/// pub struct BeforeTurn { pub session: String }
/// impl Event for BeforeTurn {
///     type Output = String;
///     const NAME: &'static str = "turn/before";
/// }
/// ```
pub trait Event: Send + Sync + 'static {
    type Output: Send + 'static;
    /// Stable name, used in logs and in the JSON bridge.
    const NAME: &'static str;
}

/// Marker for the untyped side of the bus. Not implemented by hand — see
/// [`Context::on_json`](crate::Context::on_json).
#[derive(Debug, Clone)]
pub struct JsonEvent {
    pub name: String,
    pub payload: serde_json::Value,
}

/// A typed listener, erased into `Box<dyn Any>` for storage and downcast back on dispatch.
pub(crate) struct Handler<E: Event>(
    #[allow(clippy::type_complexity)]
    pub  Arc<dyn Fn(Arc<E>) -> BoxFuture<'static, Option<E::Output>> + Send + Sync>,
);

impl<E: Event> Clone for Handler<E> {
    fn clone(&self) -> Self {
        Handler(self.0.clone())
    }
}

#[allow(clippy::type_complexity)]
pub(crate) type JsonHandler = Arc<
    dyn Fn(Arc<serde_json::Value>) -> BoxFuture<'static, Option<serde_json::Value>> + Send + Sync,
>;

/// One registered listener plus the scope that owns it.
pub(crate) struct ListenerEntry {
    pub scope: crate::runtime::ScopeId,
    pub seq: u64,
    /// `Box<Handler<E>>` for the event type this entry is filed under.
    pub handler: Box<dyn std::any::Any + Send + Sync>,
}

pub(crate) struct JsonListenerEntry {
    pub scope: crate::runtime::ScopeId,
    pub seq: u64,
    pub handler: JsonHandler,
}
