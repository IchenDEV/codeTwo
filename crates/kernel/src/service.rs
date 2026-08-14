//! Services — the capabilities plugins publish to each other.
//!
//! A service is any value with a name. Cordis reaches them as properties (`ctx.database`); Rust
//! reaches them by type ([`Context::get::<Db>()`](crate::Context::get)), with the name carried on
//! the type as [`Service::NAME`] so that *declarations* (`inject: ["db"]`), *config files*, and
//! *cross-language plugins* can all talk about the same thing with a plain string.
//!
//! The interesting property is not lookup, it is **reactivity**: providing or dropping a service
//! reloads exactly the plugins that injected it, and nothing else.

use std::any::Any;
use std::sync::Arc;

/// A named capability shared through a [`Context`](crate::Context).
///
/// ```
/// # use codetwo_kernel::Service;
/// struct Store;
/// impl Service for Store { const NAME: &'static str = "store"; }
/// ```
///
/// Implementations are ordinary types; the kernel stores them behind `Arc<dyn Any>` and hands
/// back `Arc<Self>`. Interior mutability is the implementor's business — the kernel never gives
/// out `&mut`.
pub trait Service: Any + Send + Sync + 'static {
    /// The name this service is injected and configured by. Use a short lowercase path
    /// (`store`, `git`, `scene.runtime`).
    const NAME: &'static str;
}

/// What a service registration looks like from outside — for plugin managers and status UIs.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ServiceInfo {
    pub name: String,
    /// Isolation realm. `0` is the global realm; anything else came from
    /// [`Context::isolate`](crate::Context::isolate).
    pub realm: u64,
    /// The scope that provided it — i.e. what unloading would take away with it.
    pub provider: crate::runtime::ScopeId,
    /// Name of the plugin owning that scope.
    pub plugin: String,
}

pub(crate) type AnyService = Arc<dyn Any + Send + Sync>;
