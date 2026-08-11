//! Single-owner local transport daemon.

#[cfg(unix)]
mod ownership;

#[cfg(unix)]
mod layout;

#[cfg(unix)]
mod gateway;

#[cfg(unix)]
mod runtime;

#[cfg(unix)]
pub use gateway::{GatewayError, ToolGateway, DEFAULT_LEASE_TTL};
#[cfg(unix)]
pub use layout::{
    canonical_data_dir, copy_legacy_data, inspect_legacy_data, DataLayout, LegacyDataDecision,
};
#[cfg(unix)]
pub use ownership::{OwnershipError, RuntimeOwnership, SocketIdentity};
#[cfg(unix)]
pub use runtime::{Daemon, DaemonError};
