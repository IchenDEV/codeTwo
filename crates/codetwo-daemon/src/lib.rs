//! Single-owner local transport daemon.

#[cfg(unix)]
mod ownership;

#[cfg(unix)]
mod runtime;

#[cfg(unix)]
pub use ownership::{OwnershipError, RuntimeOwnership, SocketIdentity};
#[cfg(unix)]
pub use runtime::{Daemon, DaemonError};
