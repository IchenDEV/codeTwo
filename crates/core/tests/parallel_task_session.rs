use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use codetwo_core::event::Event;
use codetwo_core::provider::{LaunchSpec, Provider, ProviderId};
use codetwo_core::skill::SkillLibrary;
use codetwo_core::worktree::WorktreeBaseline;
use codetwo_core::{
    AgentRole, AgentStatus, Engine, ParallelTaskCreation, Store, TaskId, WorkItemStatus,
};

const MOCK_AGENT: &str = r#"
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    message = json.loads(line)
    if message.get("method") == "initialize":
        print(json.dumps({"jsonrpc":"2.0","id":message["id"],"result":{"protocolVersion":1}}), flush=True)
"#;

fn git(repo: &Path, args: &[&str]) -> String {
    let output = std::process::Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

#[tokio::test]
async fn native_parallel_task_creation_owns_a_real_agent_lease_and_worktree() {
    if codetwo_core::provider::which("git").is_none()
        || codetwo_core::provider::which("python3").is_none()
    {
        eprintln!("git or python3 not found; skipping native parallel-task test");
        return;
    }

    let root = tempfile::tempdir().unwrap();
    let repo = root.path().join("repo");
    std::fs::create_dir_all(&repo).unwrap();
    git(&repo, &["init", "-q"]);
    git(&repo, &["config", "user.email", "test@codetwo.dev"]);
    git(&repo, &["config", "user.name", "C2 Test"]);
    git(&repo, &["commit", "--allow-empty", "-qm", "initial"]);
    let repo = std::fs::canonicalize(repo).unwrap();
    let baseline_sha = git(&repo, &["rev-parse", "HEAD"]);

    let store = Arc::new(Store::open_in_memory().unwrap());
    let provider = Provider {
        id: ProviderId::Grok,
        display_name: "Parallel-task mock".into(),
        launch: LaunchSpec::new("python3", ["-c", MOCK_AGENT]),
        needs_node: false,
    };
    let (engine, mut events) =
        Engine::with_store(vec![provider], SkillLibrary::new(vec![]), store.clone());
    engine.set_worktree_root(Some(root.path().join("worktrees")));

    engine
        .create_parallel_task_session(ParallelTaskCreation {
            provider: ProviderId::Grok,
            cwd: repo.to_string_lossy().into_owned(),
            worktree_base: WorktreeBaseline::Current,
            worktree_base_sha: Some(baseline_sha.clone()),
            request_id: "parallel-create".into(),
            model: Some("grok-code-fast-1".into()),
            initial_policy: None,
            reasoning_effort: Some("high".into()),
            task_id: TaskId::new("task-parallel"),
            goal: "Implement the native parallel task".into(),
        })
        .await
        .unwrap();

    let created = loop {
        match tokio::time::timeout(Duration::from_secs(10), events.recv())
            .await
            .expect("event before timeout")
            .expect("event stream remains open")
        {
            event @ Event::SessionCreated { .. } => break event,
            Event::Error { message, .. } => panic!("unexpected error: {message}"),
            _ => {}
        }
    };
    let Event::SessionCreated {
        session,
        project_path,
        worktree_path,
        request_id,
        ..
    } = created
    else {
        unreachable!()
    };

    assert_eq!(request_id.as_deref(), Some("parallel-create"));
    assert_eq!(project_path.as_deref(), Some(repo.to_string_lossy().as_ref()));
    let worktree_path = worktree_path.expect("parallel task gets an isolated checkout");
    assert_ne!(worktree_path, repo.to_string_lossy());
    assert!(Path::new(&worktree_path).is_dir());
    assert_eq!(git(Path::new(&worktree_path), &["rev-parse", "HEAD"]), baseline_sha);

    let snapshot = store.task_snapshot(&TaskId::new("task-parallel")).unwrap();
    assert_eq!(snapshot.result_contract.goal, "Implement the native parallel task");
    assert_eq!(snapshot.task_graph.work_items.len(), 1);
    assert_eq!(snapshot.task_graph.work_items[0].status, WorkItemStatus::Running);
    assert_eq!(
        snapshot.task_graph.work_items[0].assigned_session_id.as_deref(),
        Some(session.as_str())
    );
    assert_eq!(snapshot.agents.len(), 1);
    assert_eq!(snapshot.agents[0].role, AgentRole::Executor);
    assert_eq!(snapshot.agents[0].status, AgentStatus::Running);
    assert_eq!(snapshot.agents[0].session_id, session);
    assert_eq!(snapshot.session_leases.len(), 1);
    assert_eq!(snapshot.session_leases[0].role, AgentRole::Executor);
    assert_eq!(snapshot.session_leases[0].session_id, session);

    engine.shutdown();
}
