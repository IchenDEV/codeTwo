//! Concrete effect classification and user risk receipts for Scenes 2.0.
//!
//! This is deliberately not a permission mode. A gate is bound to one actual action, target,
//! scope, and Core-classified effect. Unknown effects fail closed.

use serde::{Deserialize, Serialize};

use crate::capability_v2::ConcreteEffect;
use crate::task::{TaskId, WorkItemId};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UserRiskDecision {
    Approve,
    Refuse,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum RiskGateDecision {
    Pending,
    Approved { reason: String },
    Refused { reason: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RiskGateReceipt {
    pub request_id: String,
    pub task_id: TaskId,
    pub work_item_id: WorkItemId,
    pub action: String,
    pub target: String,
    pub scope: String,
    pub effect: ConcreteEffect,
    pub decision: RiskGateDecision,
    pub created_at_ms: i64,
    pub decided_at_ms: Option<i64>,
}

impl RiskGateReceipt {
    pub fn allows_effect(&self) -> bool {
        matches!(self.decision, RiskGateDecision::Approved { .. })
    }
}

pub fn effect_requires_risk_gate(effect: ConcreteEffect) -> bool {
    matches!(
        effect,
        ConcreteEffect::ExternalModify
            | ConcreteEffect::Send
            | ConcreteEffect::PublishDeploy
            | ConcreteEffect::Delete
            | ConcreteEffect::Payment
            | ConcreteEffect::AccessAdministration
            | ConcreteEffect::Unknown
    )
}
