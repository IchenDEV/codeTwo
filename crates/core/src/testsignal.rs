//! Conservative test-run recognition for [`crate::event::Event::TestSignal`].
//!
//! Two pure functions: [`classify_test_command`] decides at tool-call time whether a command is a
//! test run (a fixed runner table, token-boundary matched — never substring guessing), and
//! [`test_outcome`] decides at terminal status whether it passed. The bias is silence: an
//! unclassified command or an ambiguous outcome yields `None`, and failure is NEVER inferred from
//! stderr presence, warnings, or non-terminal statuses. Hooks must tolerate the signal never
//! firing (docs/reference/scenes.md §hooks).

use serde_json::Value;

use crate::artifact::ToolOutput;

/// The wire event bounds `command` to 256 chars; classification enforces it at the source.
const MAX_COMMAND_CHARS: usize = 256;

/// Outcome of a recognized test run at terminal tool status.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TestOutcome {
    pub passed: bool,
    pub exit_code: Option<i32>,
}

/// Leading-token patterns that identify a test runner. A segment matches when its tokens start
/// with one pattern exactly (token boundaries, no prefixing except the documented `npm run test*`
/// case handled separately).
const RUNNERS: &[&[&str]] = &[
    &["cargo", "test"],
    &["cargo", "nextest", "run"],
    &["pytest"],
    &["python", "-m", "pytest"],
    &["python", "-m", "unittest"],
    &["tox"],
    &["npm", "test"],
    &["pnpm", "test"],
    &["yarn", "test"],
    &["bun", "test"],
    &["jest"],
    &["npx", "jest"],
    &["vitest"],
    &["npx", "vitest", "run"],
    &["mocha"],
    &["npx", "mocha"],
    &["npx", "playwright", "test"],
    &["npx", "cypress", "run"],
    &["go", "test"],
    &["mvn", "test"],
    &["mvn", "verify"],
    &["gradle", "test"],
    &["./gradlew", "test"],
    &["rspec"],
    &["bundle", "exec", "rspec"],
    &["rake", "test"],
    &["phpunit"],
    &["dotnet", "test"],
    &["swift", "test"],
    &["ctest"],
    &["make", "test"],
    &["make", "check"],
];

/// Flags that disqualify an otherwise matching segment: these invocations enumerate or explain
/// rather than run tests.
const EXCLUDED_FLAGS: &[&str] = &[
    "--help",
    "--version",
    "--list",
    "--collect-only",
    "--dry-run",
];

/// Classify a tool call as a test run. Returns the (bounded) command string when recognized.
///
/// - Gate on the ACP tool kind: only `Some("execute")` or `None` may classify — a read, fetch,
///   edit, or think tool that merely *mentions* a test command never signals.
/// - The candidate command is `raw_input.command` (string, or array joined with spaces), else the
///   title stripped of a leading `Run ` and backticks.
/// - The candidate is split on `&&`, `||`, and `;`; `env`/`VAR=` prefixes are stripped and
///   `cd <dir>` segments skipped; any remaining segment whose leading tokens exactly match the
///   runner table classifies the whole command.
pub fn classify_test_command(
    kind: Option<&str>,
    title: &str,
    raw_input: Option<&Value>,
) -> Option<String> {
    match kind {
        None | Some("execute") => {}
        Some(_) => return None,
    }
    let candidate = command_candidate(title, raw_input)?;
    let classified = split_segments(&candidate)
        .into_iter()
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .any(segment_is_test_run);
    classified.then(|| candidate.chars().take(MAX_COMMAND_CHARS).collect())
}

/// Split on the shell sequencing operators `&&`, `||`, and `;` — and ONLY those. A single `|`
/// (pipe) keeps its segment whole, so `echo x | pytest` never classifies via its pipe target.
fn split_segments(command: &str) -> Vec<&str> {
    let bytes = command.as_bytes();
    let mut segments = Vec::new();
    let mut start = 0;
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b';' => {
                segments.push(&command[start..i]);
                start = i + 1;
                i += 1;
            }
            b'&' | b'|' if bytes.get(i + 1) == Some(&bytes[i]) => {
                segments.push(&command[start..i]);
                start = i + 2;
                i += 2;
            }
            _ => i += 1,
        }
    }
    segments.push(&command[start..]);
    segments
}

fn command_candidate(title: &str, raw_input: Option<&Value>) -> Option<String> {
    if let Some(command) = raw_input.and_then(|input| input.get("command")) {
        match command {
            Value::String(command) => return Some(command.clone()),
            Value::Array(parts) => {
                let joined = parts
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join(" ");
                if !joined.trim().is_empty() {
                    return Some(joined);
                }
            }
            _ => {}
        }
    }
    let title = title.trim();
    let title = title.strip_prefix("Run ").unwrap_or(title);
    let title = title.replace('`', "");
    let title = title.trim().to_string();
    (!title.is_empty()).then_some(title)
}

fn segment_is_test_run(segment: &str) -> bool {
    let mut tokens: Vec<&str> = segment.split_whitespace().collect();
    // Strip environment prefixes: a leading `env` and any VAR=value assignments.
    while let Some(first) = tokens.first() {
        if *first == "env" || is_env_assignment(first) {
            tokens.remove(0);
        } else {
            break;
        }
    }
    let Some(first) = tokens.first() else {
        return false;
    };
    // A `cd <dir>` segment changes directory; the runner lives in a sibling segment.
    if *first == "cd" {
        return false;
    }
    let matched = RUNNERS
        .iter()
        .any(|pattern| tokens.len() >= pattern.len() && tokens[..pattern.len()] == **pattern)
        || (tokens.len() >= 3
            && tokens[0] == "npm"
            && tokens[1] == "run"
            && tokens[2].starts_with("test"));
    matched && !tokens.iter().any(|token| EXCLUDED_FLAGS.contains(token))
}

fn is_env_assignment(token: &str) -> bool {
    match token.split_once('=') {
        Some((name, _)) => {
            !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
        }
        None => false,
    }
}

/// Decide the outcome of a recognized test run at terminal status. `None` means "don't signal".
///
/// Precedence: a `failed` status is a failure outright; a `completed` status first honors an
/// explicit exit-code phrase in the text outputs (last occurrence wins), then falls back to the
/// unambiguous runner summaries (cargo, pytest, jest/vitest). Anything else stays silent.
pub fn test_outcome(status: &str, outputs: &[ToolOutput]) -> Option<TestOutcome> {
    match status {
        "failed" => {
            return Some(TestOutcome {
                passed: false,
                exit_code: None,
            })
        }
        "completed" => {}
        _ => return None,
    }
    let text = outputs
        .iter()
        .filter_map(|output| match output {
            ToolOutput::Text { text } => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n");
    if let Some(code) = last_exit_code(&text) {
        return Some(TestOutcome {
            passed: code == 0,
            exit_code: Some(code),
        });
    }
    summary_outcome(&text).map(|passed| TestOutcome {
        passed,
        exit_code: None,
    })
}

/// Scan for exit-code phrases; the LAST occurrence across all phrasings wins (a wrapper often
/// echoes the inner command's code again at the end).
fn last_exit_code(text: &str) -> Option<i32> {
    let lower = text.to_ascii_lowercase();
    let mut best: Option<(usize, i32)> = None;
    for prefix in [
        "exit code: ",
        "exit status: ",
        "exited with code ",
        "(exit ",
    ] {
        let mut from = 0;
        while let Some(at) = lower[from..].find(prefix) {
            let at = from + at;
            let digits_at = at + prefix.len();
            if let Some(code) = leading_int(&lower[digits_at..]) {
                if best.is_none_or(|(pos, _)| at >= pos) {
                    best = Some((at, code));
                }
            }
            from = digits_at;
        }
    }
    best.map(|(_, code)| code)
}

fn leading_int(text: &str) -> Option<i32> {
    let text = text.trim_start();
    let end = text
        .char_indices()
        .take_while(|(i, c)| c.is_ascii_digit() || (*i == 0 && *c == '-'))
        .map(|(i, c)| i + c.len_utf8())
        .last()?;
    text[..end].parse().ok()
}

/// Unambiguous runner summaries only. Returns `Some(passed)` or `None` (ambiguous → silence).
fn summary_outcome(text: &str) -> Option<bool> {
    // cargo: one `test result: FAILED.`/`test result: ok.` line per test binary; any FAILED fails.
    if text.contains("test result: FAILED") {
        return Some(false);
    }
    // pytest: the `== ... ==` summary line, e.g. `===== 2 failed, 3 passed in 0.12s =====`.
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("==") && trimmed.ends_with("==") {
            if trimmed.contains(" failed") || trimmed.contains(" error") {
                return Some(false);
            }
            if trimmed.contains(" passed") {
                return Some(true);
            }
        }
    }
    // jest / vitest: `Tests: 1 failed, 2 passed` / all-passed `Tests: 3 passed`.
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed
            .strip_prefix("Tests:")
            .or_else(|| trimmed.strip_prefix("Tests "))
        {
            if rest.contains(" failed") {
                return Some(false);
            }
            if rest.contains(" passed") {
                return Some(true);
            }
        }
    }
    if text.contains("test result: ok") {
        return Some(true);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn text(t: &str) -> Vec<ToolOutput> {
        vec![ToolOutput::Text { text: t.into() }]
    }

    #[test]
    fn classification_table() {
        // (kind, title, raw_input command, expected classified)
        let cases: &[(Option<&str>, &str, Option<Value>, bool)] = &[
            // Positives — runner table, token boundaries.
            (
                Some("execute"),
                "",
                Some(json!({"command": "cargo test"})),
                true,
            ),
            (
                None,
                "",
                Some(json!({"command": "cargo nextest run"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "pytest -x tests/"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "python -m pytest"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "python -m unittest"})),
                true,
            ),
            (Some("execute"), "", Some(json!({"command": "tox"})), true),
            (
                Some("execute"),
                "",
                Some(json!({"command": "npm test"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "npm run test:unit"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "pnpm test"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "yarn test"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "bun test"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "jest src/"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "npx jest"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "vitest"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "npx vitest run"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "mocha test/"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "npx mocha"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "npx playwright test"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "npx cypress run"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "go test ./..."})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "mvn test"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "mvn verify"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "gradle test"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "./gradlew test"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "rspec spec/"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "bundle exec rspec"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "rake test"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "phpunit"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "dotnet test"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "swift test"})),
                true,
            ),
            (Some("execute"), "", Some(json!({"command": "ctest"})), true),
            (
                Some("execute"),
                "",
                Some(json!({"command": "make test"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "make check"})),
                true,
            ),
            // Compound commands, env prefixes, cd segments.
            (
                Some("execute"),
                "",
                Some(json!({"command": "cd crates/core && cargo test"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "RUST_LOG=debug cargo test"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "env CI=1 pytest"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "cargo build; cargo test"})),
                true,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "cargo build || cargo test"})),
                true,
            ),
            // Array command form.
            (
                Some("execute"),
                "",
                Some(json!({"command": ["cargo", "test", "--workspace"]})),
                true,
            ),
            // De-prefixed title fallback.
            (Some("execute"), "Run `cargo test`", None, true),
            (None, "pytest tests/", None, true),
            // Negatives — not test runs.
            (
                Some("execute"),
                "",
                Some(json!({"command": "cargo build"})),
                false,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "cargo testx"})),
                false,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "npm run build"})),
                false,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "go build ./..."})),
                false,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "make install"})),
                false,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "cd tests"})),
                false,
            ),
            // Exclusion flags.
            (
                Some("execute"),
                "",
                Some(json!({"command": "pytest --help"})),
                false,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "cargo test --list"})),
                false,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "pytest --collect-only"})),
                false,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "jest --version"})),
                false,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "npx vitest run --dry-run"})),
                false,
            ),
            // Kind gate: never classify non-execute tools.
            (
                Some("read"),
                "",
                Some(json!({"command": "cargo test"})),
                false,
            ),
            (Some("fetch"), "Run `pytest`", None, false),
            (
                Some("edit"),
                "",
                Some(json!({"command": "npm test"})),
                false,
            ),
            (Some("think"), "cargo test", None, false),
            // A title that merely mentions tests (grep-for-test) never matches the table.
            (Some("execute"), "grep -r test src/", None, false),
            (Some("execute"), "Search for test helpers", None, false),
            // A single pipe is NOT a sequencing operator: the pipe target never classifies.
            (
                Some("execute"),
                "",
                Some(json!({"command": "echo hi | pytest"})),
                false,
            ),
            (
                Some("execute"),
                "",
                Some(json!({"command": "cargo test | tee out.log"})),
                true,
            ),
        ];
        for (kind, title, raw, expected) in cases {
            let got = classify_test_command(*kind, title, raw.as_ref());
            assert_eq!(
                got.is_some(),
                *expected,
                "kind={kind:?} title={title:?} raw={raw:?} → {got:?}"
            );
        }
    }

    #[test]
    fn classified_command_is_bounded_to_256_chars() {
        let long = format!("cargo test {}", "x".repeat(400));
        let got =
            classify_test_command(Some("execute"), "", Some(&json!({ "command": long }))).unwrap();
        assert_eq!(got.chars().count(), 256);
    }

    #[test]
    fn failed_status_is_a_failure_without_exit_code() {
        assert_eq!(
            test_outcome("failed", &[]),
            Some(TestOutcome {
                passed: false,
                exit_code: None
            })
        );
    }

    #[test]
    fn non_terminal_statuses_stay_silent() {
        for status in ["pending", "in_progress", "cancelled"] {
            assert_eq!(
                test_outcome(status, &text("exit code: 1")),
                None,
                "{status}"
            );
        }
    }

    #[test]
    fn exit_code_phrases_last_occurrence_wins() {
        let cases: &[(&str, bool, i32)] = &[
            ("exit code: 0", true, 0),
            ("exit code: 1", false, 1),
            ("exit status: 2", false, 2),
            ("exited with code 101", false, 101),
            ("done (exit 0)", true, 0),
            // Last wins across phrasings.
            ("exit code: 1\nretried…\nexit code: 0", true, 0),
            ("exit status: 0\nwrapper: exited with code 3", false, 3),
        ];
        for (body, passed, code) in cases {
            assert_eq!(
                test_outcome("completed", &text(body)),
                Some(TestOutcome {
                    passed: *passed,
                    exit_code: Some(*code)
                }),
                "{body:?}"
            );
        }
    }

    #[test]
    fn explicit_exit_code_beats_runner_summaries() {
        let body = "test result: FAILED. 1 failed\nexit code: 0";
        assert_eq!(
            test_outcome("completed", &text(body)),
            Some(TestOutcome {
                passed: true,
                exit_code: Some(0)
            })
        );
    }

    #[test]
    fn runner_summaries_without_exit_code() {
        let cases: &[(&str, Option<bool>)] = &[
            ("test result: ok. 12 passed; 0 failed", Some(true)),
            ("test result: FAILED. 1 failed", Some(false)),
            ("===== 3 passed in 0.21s =====", Some(true)),
            ("===== 1 failed, 2 passed in 0.12s =====", Some(false)),
            ("Tests: 5 passed, 5 total", Some(true)),
            ("Tests: 1 failed, 4 passed, 5 total", Some(false)),
            // Ambiguous output stays silent.
            ("all done", None),
            ("", None),
            // Stderr noise / warnings must never imply failure.
            (
                "warning: unused variable\nerror log line without summary",
                None,
            ),
        ];
        for (body, expected) in cases {
            let got = test_outcome("completed", &text(body));
            assert_eq!(got.map(|o| o.passed), *expected, "{body:?}");
            if let Some(outcome) = got {
                assert_eq!(outcome.exit_code, None);
            }
        }
    }

    #[test]
    fn non_text_outputs_are_ignored() {
        let outputs = vec![ToolOutput::ResourceLink {
            name: "report".into(),
            uri: "file:///tmp/report".into(),
            mime_type: None,
        }];
        assert_eq!(test_outcome("completed", &outputs), None);
    }
}
