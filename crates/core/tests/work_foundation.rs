use codetwo_core::work::{
    entity_head, high_water, install_schema, mutation_history, with_transaction, BriefRevision,
    Task, TaskExperience, TaskStatus, WorkAuditContext, WorkEntityKind, WorkMutationGuard,
    Workspace, WorkspaceKind,
};
use codetwo_core::StoreError;
use rusqlite::Connection;

fn installed_connection() -> Connection {
    let mut connection = Connection::open_in_memory().unwrap();
    install_schema(&mut connection).unwrap();
    connection
}

fn audit(label: &str) -> WorkAuditContext {
    WorkAuditContext::new("operator", "test-auth", format!("request-{label}"))
}

fn workspace() -> Workspace {
    Workspace::new(
        "Foundation",
        Some("/tmp/foundation".to_owned()),
        WorkspaceKind::Managed,
    )
}

fn task(workspace: &Workspace) -> Task {
    Task::new(&workspace.id, TaskExperience::Work)
}

fn task_brief_pointer(connection: &Connection, task_id: &str) -> Option<i64> {
    connection
        .query_row(
            "SELECT current_brief_revision FROM tasks WHERE id=?1",
            [task_id],
            |row| row.get(0),
        )
        .unwrap()
}

fn brief_rows(connection: &Connection, task_id: &str) -> Vec<(String, i64, String, i64)> {
    let mut statement = connection
        .prepare(
            "SELECT id,revision,source,created_at FROM brief_revisions
             WHERE task_id=?1 ORDER BY revision",
        )
        .unwrap();
    statement
        .query_map([task_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .unwrap()
        .collect::<rusqlite::Result<Vec<_>>>()
        .unwrap()
}

#[test]
fn domain_contracts_have_stable_serde_and_constructors() {
    let workspace = workspace();
    assert!(workspace.validate().is_ok());
    assert_eq!(serde_json::to_value(&workspace).unwrap()["kind"], "managed");

    let task = Task::named(&workspace.id, "Task", TaskExperience::Work);
    assert_eq!(task.status, TaskStatus::Draft);
    assert!(task.validate().is_ok());
    assert_eq!(serde_json::to_value(&task).unwrap()["experience"], "work");

    let brief = BriefRevision::new(&task.id, 1, Vec::new(), "user");
    assert!(brief.validate().is_ok());
    assert_eq!(serde_json::to_value(&brief).unwrap()["revision"], 1);
}

#[test]
fn schema_install_is_idempotent_and_explicit() {
    let mut connection = Connection::open_in_memory().unwrap();
    install_schema(&mut connection).unwrap();
    install_schema(&mut connection).unwrap();

    for table in [
        "workspaces",
        "tasks",
        "brief_revisions",
        "work_revision_clock",
        "work_entity_heads",
        "work_mutations",
        "work_schema_migrations",
    ] {
        let present: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
                [table],
                |row| row.get(0),
            )
            .unwrap();
        assert!(present, "missing {table}");
    }
    let marker_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM work_schema_migrations WHERE id='work_foundation_v1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(marker_count, 1);
    let trigger_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'work_mutations_immutable_%'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(trigger_count, 2);
    assert!(connection
        .execute(
            "INSERT INTO work_entity_heads(entity_kind,entity_id,revision,deleted,mutation_id,updated_at)
             VALUES('not-a-work-kind','id',1,0,1,0)",
            [],
        )
        .is_err());
}

#[test]
fn first_and_next_cas_mutations_allocate_clock_heads_and_redacted_audit() {
    let mut connection = installed_connection();
    let workspace = workspace();
    let first_audit = audit("first");
    let first = with_transaction(&mut connection, |tx| {
        tx.save_workspace(
            &workspace,
            &WorkMutationGuard::from_audit(None, &first_audit),
        )
    })
    .unwrap();
    assert_eq!((first.mutation_id, first.revision), (1, 1));
    assert_eq!(high_water(&connection).unwrap(), 1);
    assert_eq!(
        entity_head(&connection, WorkEntityKind::Workspace, &workspace.id)
            .unwrap()
            .unwrap()
            .revision,
        1
    );

    let history = mutation_history(&connection, WorkEntityKind::Workspace, &workspace.id).unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].actor, "operator");
    assert_eq!(history[0].auth_subject, "test-auth");
    assert_eq!(history[0].request_id, "request-first");

    let mut updated = workspace.clone();
    updated.name = "Updated".to_owned();
    let second = with_transaction(&mut connection, |tx| {
        tx.save_workspace(
            &updated,
            &WorkMutationGuard::from_audit(Some(1), &audit("second")),
        )
    })
    .unwrap();
    assert_eq!((second.mutation_id, second.revision), (2, 2));
    assert_eq!(high_water(&connection).unwrap(), 2);
    assert_eq!(
        mutation_history(&connection, WorkEntityKind::Workspace, &workspace.id)
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn brief_saves_are_authoritative_atomic_and_pointer_guarded() {
    let mut connection = installed_connection();
    let workspace = workspace();
    with_transaction(&mut connection, |tx| {
        tx.save_workspace(
            &workspace,
            &WorkMutationGuard::from_audit(None, &audit("workspace")),
        )
    })
    .unwrap();
    let task = task(&workspace);
    with_transaction(&mut connection, |tx| {
        tx.save_task(&task, &WorkMutationGuard::from_audit(None, &audit("task")))
    })
    .unwrap();

    let mut first = BriefRevision::new(&task.id, 999, Vec::new(), "user");
    first.created_at = -7;
    let saved_first = with_transaction(&mut connection, |tx| {
        tx.save_brief(
            first,
            &WorkMutationGuard::from_audit(None, &audit("brief-first")),
        )
    })
    .unwrap();
    assert_eq!(saved_first.revision, 1);
    assert!(saved_first.created_at >= 0);
    assert_eq!(task_brief_pointer(&connection, &task.id), Some(1));
    assert_eq!(high_water(&connection).unwrap(), 4);
    assert_eq!(
        entity_head(&connection, WorkEntityKind::Brief, &task.id)
            .unwrap()
            .unwrap()
            .revision,
        1
    );
    assert_eq!(
        entity_head(&connection, WorkEntityKind::Task, &task.id)
            .unwrap()
            .unwrap()
            .revision,
        2
    );
    let brief_history = mutation_history(&connection, WorkEntityKind::Brief, &task.id).unwrap();
    assert_eq!(brief_history.len(), 1);
    assert_eq!(brief_history[0].operation, "save");
    let task_history = mutation_history(&connection, WorkEntityKind::Task, &task.id).unwrap();
    assert_eq!(task_history.len(), 2);
    assert_eq!(task_history[1].operation, "brief_pointer");

    let mut second = BriefRevision::new(&task.id, 777, Vec::new(), "user-edit");
    second.created_at = -11;
    let saved_second = with_transaction(&mut connection, |tx| {
        tx.save_brief(
            second,
            &WorkMutationGuard::from_audit(Some(1), &audit("brief-second")),
        )
    })
    .unwrap();
    assert_eq!(saved_second.revision, 2);
    assert!(saved_second.created_at >= 0);
    assert_eq!(task_brief_pointer(&connection, &task.id), Some(2));
    assert_eq!(high_water(&connection).unwrap(), 6);
    assert_eq!(
        entity_head(&connection, WorkEntityKind::Brief, &task.id)
            .unwrap()
            .unwrap()
            .revision,
        2
    );
    assert_eq!(
        entity_head(&connection, WorkEntityKind::Task, &task.id)
            .unwrap()
            .unwrap()
            .revision,
        3
    );
    assert_eq!(
        mutation_history(&connection, WorkEntityKind::Brief, &task.id)
            .unwrap()
            .len(),
        2
    );
    assert_eq!(
        mutation_history(&connection, WorkEntityKind::Task, &task.id)
            .unwrap()
            .len(),
        3
    );

    let before_pointer = task_brief_pointer(&connection, &task.id);
    let before_brief_head = entity_head(&connection, WorkEntityKind::Brief, &task.id).unwrap();
    let before_task_head = entity_head(&connection, WorkEntityKind::Task, &task.id).unwrap();
    let before_briefs = brief_rows(&connection, &task.id);
    let before_brief_history =
        mutation_history(&connection, WorkEntityKind::Brief, &task.id).unwrap();
    let before_task_history =
        mutation_history(&connection, WorkEntityKind::Task, &task.id).unwrap();
    let before_high_water = high_water(&connection).unwrap();
    let mut stale = BriefRevision::new(&task.id, 1, Vec::new(), "stale");
    stale.created_at = -13;
    let stale_error = with_transaction(&mut connection, |tx| {
        tx.save_brief(
            stale,
            &WorkMutationGuard::from_audit(Some(1), &audit("brief-stale")),
        )
    })
    .unwrap_err();
    assert!(matches!(
        stale_error,
        StoreError::WorkConflict {
            entity_kind,
            current_revision: Some(2),
            ..
        } if entity_kind == "brief"
    ));
    assert_eq!(task_brief_pointer(&connection, &task.id), before_pointer);
    assert_eq!(brief_rows(&connection, &task.id), before_briefs);
    assert_eq!(
        entity_head(&connection, WorkEntityKind::Brief, &task.id).unwrap(),
        before_brief_head
    );
    assert_eq!(
        entity_head(&connection, WorkEntityKind::Task, &task.id).unwrap(),
        before_task_head
    );
    assert_eq!(
        mutation_history(&connection, WorkEntityKind::Brief, &task.id).unwrap(),
        before_brief_history
    );
    assert_eq!(
        mutation_history(&connection, WorkEntityKind::Task, &task.id).unwrap(),
        before_task_history
    );
    assert_eq!(high_water(&connection).unwrap(), before_high_water);

    let before_task_title: String = connection
        .query_row("SELECT title FROM tasks WHERE id=?1", [&task.id], |row| {
            row.get(0)
        })
        .unwrap();
    let mut pointer_change = task.clone();
    pointer_change.title = "must-not-write".to_owned();
    pointer_change.current_brief_revision = Some(999);
    let pointer_error = with_transaction(&mut connection, |tx| {
        tx.save_task(
            &pointer_change,
            &WorkMutationGuard::from_audit(Some(3), &audit("task-pointer-bypass")),
        )
    })
    .unwrap_err();
    assert!(matches!(pointer_error, StoreError::Domain(_)));
    let after_task_title: String = connection
        .query_row("SELECT title FROM tasks WHERE id=?1", [&task.id], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(after_task_title, before_task_title);
    assert_eq!(task_brief_pointer(&connection, &task.id), before_pointer);
    assert_eq!(high_water(&connection).unwrap(), before_high_water);
    assert_eq!(
        entity_head(&connection, WorkEntityKind::Task, &task.id).unwrap(),
        before_task_head
    );
    assert_eq!(
        mutation_history(&connection, WorkEntityKind::Task, &task.id).unwrap(),
        before_task_history
    );
}

#[test]
fn stale_cas_rolls_back_projection_head_and_history() {
    let mut connection = installed_connection();
    let workspace = workspace();
    with_transaction(&mut connection, |tx| {
        tx.save_workspace(
            &workspace,
            &WorkMutationGuard::from_audit(None, &audit("create")),
        )
    })
    .unwrap();
    let mut updated = workspace.clone();
    updated.name = "Current".to_owned();
    with_transaction(&mut connection, |tx| {
        tx.save_workspace(
            &updated,
            &WorkMutationGuard::from_audit(Some(1), &audit("current")),
        )
    })
    .unwrap();

    let before_head = entity_head(&connection, WorkEntityKind::Workspace, &workspace.id).unwrap();
    let before_history =
        mutation_history(&connection, WorkEntityKind::Workspace, &workspace.id).unwrap();
    let before_name: String = connection
        .query_row(
            "SELECT name FROM workspaces WHERE id=?1",
            [&workspace.id],
            |row| row.get(0),
        )
        .unwrap();

    updated.name = "Stale overwrite".to_owned();
    let error = with_transaction(&mut connection, |tx| {
        tx.save_workspace(
            &updated,
            &WorkMutationGuard::from_audit(Some(1), &audit("stale")),
        )
    })
    .unwrap_err();
    assert!(matches!(
        error,
        StoreError::WorkConflict {
            entity_kind,
            current_revision: Some(2),
            ..
        } if entity_kind == "workspace"
    ));
    assert_eq!(
        entity_head(&connection, WorkEntityKind::Workspace, &workspace.id).unwrap(),
        before_head
    );
    assert_eq!(
        mutation_history(&connection, WorkEntityKind::Workspace, &workspace.id).unwrap(),
        before_history
    );
    let after_name: String = connection
        .query_row(
            "SELECT name FROM workspaces WHERE id=?1",
            [&workspace.id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(after_name, before_name);
    assert_eq!(high_water(&connection).unwrap(), 2);
}

#[test]
fn ledger_history_is_immutable_and_contains_no_payload_columns() {
    let mut connection = installed_connection();
    let workspace = workspace();
    with_transaction(&mut connection, |tx| {
        tx.save_workspace(
            &workspace,
            &WorkMutationGuard::from_audit(None, &audit("immutable")),
        )
    })
    .unwrap();
    assert!(connection
        .execute(
            "UPDATE work_mutations SET operation='tampered' WHERE mutation_id=1",
            [],
        )
        .is_err());
    assert!(connection
        .execute("DELETE FROM work_mutations WHERE mutation_id=1", [])
        .is_err());

    for table in ["work_revision_clock", "work_entity_heads", "work_mutations"] {
        let mut statement = connection
            .prepare(&format!("PRAGMA table_info({table})"))
            .unwrap();
        let columns = statement
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        for forbidden in [
            "workspace_root",
            "brief_body",
            "prompt",
            "secret",
            "payload",
            "generic",
        ] {
            assert!(
                !columns.iter().any(|column| column.contains(forbidden)),
                "{table} contains forbidden column {forbidden}"
            );
        }
    }
}
