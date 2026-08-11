//! Narrow Work foundation: domain contracts, base projections, and the append-only ledger.
//!
//! Installation is explicit through [`install_schema`]; this first slice deliberately does not
//! alter [`crate::Store::open`] or [`crate::Store::open_in_memory`].

mod domain;
mod ledger;
mod schema;
pub(crate) mod store;

pub use domain::{
    BriefRevision, BriefSaveResult, Run, Task, TaskExperience, TaskStatus, WorkPage, WorkVersioned,
    Workspace, WorkspaceKind, MAX_WORK_PAGE_SIZE,
};
pub use ledger::{
    entity_head, high_water, install_schema, mutation_history, with_transaction, WorkAuditContext,
    WorkEntityHead, WorkEntityKind, WorkMutation, WorkMutationGuard, WorkTransaction,
};
pub use store::WorkRunBinding;
