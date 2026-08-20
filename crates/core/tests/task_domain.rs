use codetwo_core::{RunSnapshot, TaskStatus, WorkItem};

#[test]
fn task_snapshot_round_trips_through_the_public_domain_model() {
    let authored = serde_json::json!({
        "task_id": "task-1",
        "revision": 3,
        "result_contract_revision": 1,
        "status": "active",
        "result_contract": {
            "goal": "Ship Scenes 2.0",
            "required_deliverables": ["Core task model"],
            "completion_conditions": ["Public snapshot round-trips"],
            "boundaries": ["Do not migrate Scenes 1.0"],
            "known_risks": [],
            "unresolved_facts": []
        },
        "provider_configuration": {
            "provider": "codex",
            "model": "gpt-5.6-sol",
            "reasoning_effort": "high"
        },
        "task_graph": {
            "revision": 3,
            "work_items": [],
            "edges": []
        },
        "agents": [],
        "session_leases": [],
        "artifacts": [],
        "cache_receipts": [],
        "risk_gates": [],
        "blockers": [],
        "budget": {
            "max_cost_microusd": null,
            "max_tokens": 120000,
            "max_duration_seconds": null
        },
        "budget_state": {
            "observations": 0,
            "fresh_input_tokens": null,
            "provider_cached_input_tokens": null,
            "output_tokens": null,
            "cost_microusd": null,
            "elapsed_seconds": 0,
            "hard_limit_reason": null
        },
        "loop_guard": {
            "total_attempts": 0,
            "consecutive_failures": 0,
            "repeated_work_item_attempts": 0,
            "repeated_agent_skill_set_attempts": 0,
            "replans_without_progress": 0,
            "last_work_item_id": null,
            "last_agent_skill_set_identity": null,
            "last_progress_identity": null,
            "pause_reason": null
        }
    });

    let snapshot: RunSnapshot = serde_json::from_value(authored.clone()).unwrap();

    assert_eq!(snapshot.status, TaskStatus::Active);
    assert_eq!(serde_json::to_value(snapshot).unwrap(), authored);
}

#[test]
fn work_item_rejects_a_legacy_pipeline_field() {
    let result = serde_json::from_value::<WorkItem>(serde_json::json!({
        "id": "work-1",
        "objective": "Implement task types",
        "result_contract_conditions": [],
        "scenes": [],
        "agent_skills": [],
        "input_artifacts": [],
        "expected_outputs": [],
        "completion_evidence": [],
        "status": "proposed",
        "blocker": null,
        "assigned_session_id": null,
        "reason": "Required by the accepted specification",
        "pipeline": "rnd-lifecycle"
    }));

    assert!(result.is_err());
}
