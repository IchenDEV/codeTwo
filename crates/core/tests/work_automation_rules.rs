use chrono::{DateTime, Utc};
use codetwo_core::{
    AutomationPathPolicy, AutomationRunStatus, AutomationSpec, AutomationTrigger, CronTrigger,
    DocBlock, FilesystemTrigger, ProviderId, RecurringTrigger, ScheduleTrigger, Store, Task,
    TaskExperience, WorkAuditContext, WorkMutationGuard, Workspace, WorkspaceKind,
};

fn ms(value: &str) -> i64 {
    DateTime::parse_from_rfc3339(value)
        .unwrap()
        .with_timezone(&Utc)
        .timestamp_millis()
}

#[test]
fn one_shot_and_recurring_occurrences_are_deterministic() {
    let once = AutomationTrigger::Schedule(ScheduleTrigger { at_ms: 10_000 });
    assert_eq!(once.due_occurrences(0, 10_000).unwrap().len(), 1);
    assert!(once.due_occurrences(10_000, 20_000).unwrap().is_empty());

    let recurring = AutomationTrigger::Recurring(RecurringTrigger {
        every_ms: 1_000,
        anchor_ms: 1_000,
    });
    let summary = recurring.due_summary(0, 20_000_000).unwrap().unwrap();
    assert_eq!(summary.count, 20_000);
    assert_eq!(summary.first_ms, 1_000);
    assert_eq!(summary.last_ms, 20_000_000);
}

#[test]
fn cron_timezone_and_dst_are_explicit() {
    let weekdays = AutomationTrigger::Cron(CronTrigger {
        expression: "30 9 * * MON-FRI".into(),
        timezone: "UTC".into(),
    });
    let values = weekdays
        .due_occurrences(ms("2024-01-01T00:00:00Z"), ms("2024-01-08T00:00:00Z"))
        .unwrap();
    assert_eq!(values.len(), 5);
    assert_eq!(values[0].scheduled_at_ms, ms("2024-01-01T09:30:00Z"));

    let gap = AutomationTrigger::Cron(CronTrigger {
        expression: "30 2 * * *".into(),
        timezone: "America/New_York".into(),
    });
    let values = gap
        .due_occurrences(ms("2024-03-10T00:00:00Z"), ms("2024-03-11T00:00:00Z"))
        .unwrap();
    assert_eq!(values.len(), 1);
    assert_eq!(values[0].scheduled_at_ms, ms("2024-03-10T07:00:00Z"));
}

#[test]
fn invalid_schedule_and_file_trigger_inputs_fail_closed() {
    assert!(AutomationTrigger::Recurring(RecurringTrigger {
        every_ms: 0,
        anchor_ms: 0,
    })
    .validate()
    .is_err());
    assert!(AutomationTrigger::Cron(CronTrigger {
        expression: "*/1 * * * * *".into(),
        timezone: "UTC".into(),
    })
    .validate()
    .is_err());
    assert!(AutomationTrigger::Cron(CronTrigger {
        expression: "* * * * *".into(),
        timezone: "Mars/Olympus".into(),
    })
    .validate()
    .is_err());
    assert!(AutomationTrigger::Filesystem(FilesystemTrigger {
        patterns: vec!["../secret".into()],
        debounce_ms: 0,
        settle_ms: 0,
    })
    .validate()
    .is_err());
}

#[test]
fn file_trigger_paths_exclude_outputs_caches_and_symlink_escape() {
    for path in [
        "reports/output-summary.md",
        "common/notes.md",
        "src/main.rs",
    ] {
        assert!(
            AutomationPathPolicy::validate_relative(path).is_ok(),
            "{path}"
        );
    }
    for path in [
        "Deliverables/report.md",
        ".git/config",
        "node_modules/pkg/index.js",
        "target/debug/app",
        "output/report.md",
        "cache/index",
        "snapshots/run.json",
        "src/../secret",
        "src\\secret",
        "/tmp/out",
    ] {
        assert!(
            AutomationPathPolicy::validate_relative(path).is_err(),
            "{path}"
        );
    }

    #[cfg(unix)]
    {
        let workspace = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret.txt"), "secret").unwrap();
        std::os::unix::fs::symlink(outside.path(), workspace.path().join("src")).unwrap();
        let policy = AutomationPathPolicy::new(workspace.path());
        assert!(policy.validate("src/secret.txt").is_err());
    }
}

fn guard(expected: Option<u64>, request: &str) -> WorkMutationGuard {
    WorkMutationGuard::new(expected, "automation-test", "local-test", request)
}

#[test]
fn automation_definition_is_versioned_and_task_binding_is_immutable() {
    let store = Store::open_in_memory().unwrap();
    let workspace = store
        .work_save_workspace(
            &Workspace::new("Managed", None, WorkspaceKind::Managed),
            &guard(None, "workspace"),
        )
        .unwrap();
    let task = store
        .work_save_task(
            &Task::named(workspace.entity.id, "Report", TaskExperience::Work),
            &guard(None, "task"),
        )
        .unwrap();
    let automation = AutomationSpec::new(
        "automation-1",
        task.entity.id.clone(),
        ProviderId::Codex,
        AutomationTrigger::Schedule(ScheduleTrigger { at_ms: 10_000 }),
        vec![DocBlock::Text {
            text: "make report".into(),
        }],
    );
    let created = store
        .work_save_automation(automation, &guard(None, "create"))
        .unwrap();
    assert_eq!(created.revision, 1);
    assert_eq!(created.entity.revision, 1);

    let mut changed = created.entity.clone();
    changed.enabled = false;
    let updated = store
        .work_save_automation(changed, &guard(Some(1), "update"))
        .unwrap();
    assert_eq!(updated.revision, 2);
    assert!(!updated.entity.enabled);
    assert_eq!(
        store
            .work_list_automations(Some(&task.entity.id), None, 10)
            .unwrap()
            .items,
        vec![updated.clone()]
    );

    let stale = store.work_save_automation(updated.entity.clone(), &guard(Some(1), "stale"));
    assert!(stale.is_err());
    let mut rebound = updated.entity;
    rebound.task_id = "another-task".into();
    assert!(store
        .work_save_automation(rebound, &guard(Some(2), "rebind"))
        .is_err());
}

#[test]
fn scheduler_coalesces_sleep_and_prevents_same_automation_reentry() {
    let store = Store::open_in_memory().unwrap();
    let workspace = store
        .work_save_workspace(
            &Workspace::new("Managed", None, WorkspaceKind::Managed),
            &guard(None, "claim-workspace"),
        )
        .unwrap();
    let task = store
        .work_save_task(
            &Task::named(workspace.entity.id, "Schedule", TaskExperience::Work),
            &guard(None, "claim-task"),
        )
        .unwrap();
    let base = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    let automation = AutomationSpec::new(
        "automation-claim",
        task.entity.id,
        ProviderId::Codex,
        AutomationTrigger::Recurring(RecurringTrigger {
            every_ms: 1_000,
            anchor_ms: base + 1_000,
        }),
        vec![DocBlock::Text {
            text: "scheduled work".into(),
        }],
    );
    store
        .work_save_automation(automation, &guard(None, "claim-definition"))
        .unwrap();
    let audit = WorkAuditContext::new("scheduler", "local-daemon", "scheduler-1");

    let first = store
        .work_claim_due_automations(base + 5_000, &audit)
        .unwrap();
    assert_eq!(first.len(), 1);
    assert_eq!(first[0].entity.scheduled_at, base + 5_000);
    assert_eq!(first[0].entity.coalesced_missed, 4);
    assert_eq!(first[0].entity.missed_start, Some(base + 1_000));
    let run_id = first[0].entity.id.clone();

    let coalesced = store
        .work_claim_due_automations(base + 6_000, &audit)
        .unwrap();
    assert_eq!(coalesced.len(), 1);
    assert_eq!(coalesced[0].entity.id, run_id);
    assert_eq!(coalesced[0].entity.coalesced_missed, 5);
    store
        .work_transition_automation_run(
            &run_id,
            AutomationRunStatus::Running,
            None,
            None,
            base + 6_100,
            &audit,
        )
        .unwrap();
    store
        .work_transition_automation_run(
            &run_id,
            AutomationRunStatus::Completed,
            None,
            None,
            base + 6_500,
            &audit,
        )
        .unwrap();

    let next = store
        .work_claim_due_automations(base + 7_000, &audit)
        .unwrap();
    assert_eq!(next.len(), 1);
    assert_ne!(next[0].entity.id, run_id);
    assert_eq!(next[0].entity.coalesced_missed, 0);
}

#[test]
fn filesystem_occurrences_are_guarded_and_never_reenter() {
    let store = Store::open_in_memory().unwrap();
    let workspace = store
        .work_save_workspace(
            &Workspace::new("Files", None, WorkspaceKind::Managed),
            &guard(None, "files-workspace"),
        )
        .unwrap();
    let task = store
        .work_save_task(
            &Task::named(workspace.entity.id, "Watch", TaskExperience::Work),
            &guard(None, "files-task"),
        )
        .unwrap();
    let task_id = task.entity.id.clone();
    let automation = AutomationSpec::new(
        "files-trigger",
        task_id.clone(),
        ProviderId::Codex,
        AutomationTrigger::Filesystem(FilesystemTrigger {
            patterns: vec!["reports/**/*.md".into()],
            debounce_ms: 100,
            settle_ms: 100,
        }),
        vec![DocBlock::Text {
            text: "refresh index".into(),
        }],
    );
    let saved = store
        .work_save_automation(automation, &guard(None, "files-definition"))
        .unwrap();
    let base = saved.entity.created_at.unwrap() + 1_000;
    let audit = WorkAuditContext::new("watcher", "local-daemon", "files-1");

    let first = store
        .work_claim_filesystem_automation("files-trigger", base, &audit)
        .unwrap();
    assert_eq!(first.entity.status, AutomationRunStatus::Queued);
    assert!(first.entity.occurrence_key.starts_with("fs:"));
    let coalesced = store
        .work_claim_filesystem_automation("files-trigger", base + 100, &audit)
        .unwrap();
    assert_eq!(coalesced.entity.id, first.entity.id);
    assert_eq!(coalesced.entity.coalesced_missed, 1);

    store
        .work_transition_automation_run(
            &first.entity.id,
            AutomationRunStatus::Running,
            None,
            None,
            base + 200,
            &audit,
        )
        .unwrap();
    store
        .work_transition_automation_run(
            &first.entity.id,
            AutomationRunStatus::Completed,
            None,
            None,
            base + 300,
            &audit,
        )
        .unwrap();
    let next = store
        .work_claim_filesystem_automation("files-trigger", base + 400, &audit)
        .unwrap();
    assert_ne!(next.entity.id, first.entity.id);

    let scheduled = AutomationSpec::new(
        "not-files",
        task_id,
        ProviderId::Codex,
        AutomationTrigger::Schedule(ScheduleTrigger { at_ms: 20_000 }),
        vec![],
    );
    store
        .work_save_automation(scheduled, &guard(None, "not-files-definition"))
        .unwrap();
    assert!(store
        .work_claim_filesystem_automation("not-files", base + 500, &audit)
        .is_err());
}
