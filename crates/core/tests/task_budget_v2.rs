use codetwo_core::{
    ProviderConfiguration, ProviderId, ResultContract, Store, Task, TaskBudget, TaskId, TaskStatus,
    TaskUsageObservation,
};

fn task(id: &str, budget: TaskBudget) -> Task {
    Task {
        id: TaskId::new(id),
        status: TaskStatus::Active,
        result_contract: ResultContract {
            goal: "Complete bounded work".into(),
            required_deliverables: vec!["Result".into()],
            completion_conditions: vec!["done".into()],
            boundaries: Vec::new(),
            known_risks: Vec::new(),
            unresolved_facts: Vec::new(),
        },
        provider_configuration: ProviderConfiguration {
            provider: ProviderId::Codex,
            model: Some("user-selected-model".into()),
            reasoning_effort: Some("high".into()),
        },
        budget,
    }
}

#[test]
fn reaching_an_observed_budget_pauses_without_switching_provider() {
    let store = Store::open_in_memory().unwrap();
    let task = task(
        "task-budget",
        TaskBudget {
            max_cost_microusd: Some(1_000),
            max_tokens: Some(100),
            max_duration_seconds: Some(60),
        },
    );
    store.create_task(&task, 100).unwrap();

    let first = store
        .record_task_usage(
            &task.id,
            &TaskUsageObservation {
                fresh_input_tokens: Some(40),
                provider_cached_input_tokens: Some(500),
                output_tokens: Some(10),
                cost_microusd: Some(400),
                elapsed_seconds: 20,
            },
            200,
        )
        .unwrap();
    assert_eq!(first.observed_tokens_excluding_cache(), Some(50));
    assert_eq!(first.provider_cached_input_tokens, Some(500));
    assert!(first.hard_limit_reason.is_none());

    let exhausted = store
        .record_task_usage(
            &task.id,
            &TaskUsageObservation {
                fresh_input_tokens: Some(45),
                provider_cached_input_tokens: Some(900),
                output_tokens: Some(5),
                cost_microusd: Some(600),
                elapsed_seconds: 40,
            },
            300,
        )
        .unwrap();
    let stored = store.get_task(&task.id).unwrap().unwrap().task;

    assert_eq!(exhausted.observed_tokens_excluding_cache(), Some(100));
    assert!(exhausted.hard_limit_reason.is_some());
    assert_eq!(stored.status, TaskStatus::Paused);
    assert_eq!(stored.provider_configuration, task.provider_configuration);
}

#[test]
fn unavailable_provider_cost_and_cache_metrics_remain_unknown() {
    let store = Store::open_in_memory().unwrap();
    let task = task(
        "task-unknown-usage",
        TaskBudget {
            max_cost_microusd: Some(1_000),
            max_tokens: Some(100),
            max_duration_seconds: None,
        },
    );
    store.create_task(&task, 100).unwrap();

    let state = store
        .record_task_usage(
            &task.id,
            &TaskUsageObservation {
                fresh_input_tokens: Some(10),
                provider_cached_input_tokens: None,
                output_tokens: Some(2),
                cost_microusd: None,
                elapsed_seconds: 1,
            },
            200,
        )
        .unwrap();

    assert_eq!(state.cost_microusd, None);
    assert_eq!(state.provider_cached_input_tokens, None);
    assert_eq!(state.observed_tokens_excluding_cache(), Some(12));
    assert_eq!(
        store.get_task(&task.id).unwrap().unwrap().task.status,
        TaskStatus::Active
    );
}

#[test]
fn user_can_extend_a_budget_and_resume_without_changing_provider() {
    let store = Store::open_in_memory().unwrap();
    let task = task(
        "task-extend-budget",
        TaskBudget {
            max_cost_microusd: None,
            max_tokens: Some(10),
            max_duration_seconds: None,
        },
    );
    store.create_task(&task, 100).unwrap();
    store
        .record_task_usage(
            &task.id,
            &TaskUsageObservation {
                fresh_input_tokens: Some(8),
                provider_cached_input_tokens: None,
                output_tokens: Some(2),
                cost_microusd: None,
                elapsed_seconds: 1,
            },
            200,
        )
        .unwrap();

    store
        .update_task_budget(
            &task.id,
            &TaskBudget {
                max_cost_microusd: None,
                max_tokens: Some(100),
                max_duration_seconds: None,
            },
            "User extended the token budget",
            300,
        )
        .unwrap();
    store
        .resume_task(&task.id, "User resumed after extending budget", 400)
        .unwrap();

    let resumed = store.get_task(&task.id).unwrap().unwrap().task;
    assert_eq!(resumed.status, TaskStatus::Active);
    assert_eq!(resumed.provider_configuration, task.provider_configuration);
    assert_eq!(resumed.budget.max_tokens, Some(100));
}
