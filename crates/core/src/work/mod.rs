//! Narrow Work foundation: domain contracts, base projections, and the append-only ledger.
//!
//! Installation is explicit through [`install_schema`]; this first slice deliberately does not
//! alter [`crate::Store::open`] or [`crate::Store::open_in_memory`].

mod domain;
mod ledger;
mod schema;

pub use domain::{BriefRevision, Task, TaskExperience, TaskStatus, Workspace, WorkspaceKind};
pub use ledger::{
    entity_head, high_water, install_schema, mutation_history, with_transaction, WorkAuditContext,
    WorkEntityHead, WorkEntityKind, WorkMutation, WorkMutationGuard, WorkTransaction,
};
