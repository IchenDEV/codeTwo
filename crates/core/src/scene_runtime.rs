//! Scene hook dispatch and exit-criteria evaluation (R8), fed off the engine's broadcast bus.
//!
//! The engine emits raw facts ([`Event::TestSignal`], [`Event::ArtifactProduced`],
//! [`Event::TurnEnded`]); this subscriber owns the policy — debounce, the action allowlist,
//! one-in-flight macro turns, and per-project scheduling — so any frontend (desktop, TUI) reuses
//! identical hook behavior by pumping its event stream through [`SceneRuntime::on_event`].
//!
//! Security posture (docs/scenes.md §Security): actions are an allowlist
//! (`suggest_scene`/`suggest_next`/`notify` render, `run_macro` submits ONE attributed prompt
//! within the session's current permission mode). There is deliberately no code path from a hook
//! to [`Op::SetExecutionPolicy`] — a scene can never loosen permissions through its hooks.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, RwLock};

use tokio::sync::broadcast;

use crate::event::{Event, Op};
use crate::scene::{ExitCriterionKind, HookActionKind, HookEvent, Scene, SceneHook, SceneLibrary};
use crate::scene_artifact::SceneArtifactStore;
use crate::skill::{DocBlock, SkillLibrary, SkillPayload};
use crate::store::Store;

/// How often the schedule tick scans enabled projects. Cron resolution is one minute; a 30 s
/// tick cannot skip a minute, and the per-minute debounce key keeps it from double-firing.
pub const SCHEDULE_TICK_SECS: u64 = 30;

/// Per-session hook state. Debounce and dismissals are in-memory only: they reset on restart,
/// which errs toward re-showing a banner rather than acting twice within one process lifetime.
#[derive(Default)]
struct SessionSceneState {
    /// Cache from [`SceneRuntime::scene_activated`]; the durable `sessions.active_scene` column
    /// remains authoritative when present.
    scene_ref: Option<String>,
    /// One fire per `"{hook_index}:{state_key}"` (and `"exit:{state_key}"` for the banner).
    fired: HashSet<String>,
    banner_dismissed: HashSet<String>,
    /// At most one hook-initiated prompt in flight per session; cleared on TurnEnded.
    macro_in_flight: Option<String>,
    last_test: Option<bool>,
    turn_counter: u64,
    /// Counts activations so `enter` hooks fire once per activation, not once ever.
    enter_counter: u64,
}

pub struct SceneRuntime {
    scenes: RwLock<Arc<SceneLibrary>>,
    skills: Arc<Mutex<SkillLibrary>>,
    store: Arc<Store>,
    artifacts: SceneArtifactStore,
    /// Engine submission entry. Ops flow one way; nothing is awaited here.
    submit: Box<dyn Fn(Op) + Send + Sync>,
    emit: broadcast::Sender<Event>,
    sessions: Mutex<HashMap<String, SessionSceneState>>,
}

impl SceneRuntime {
    pub fn new(
        scenes: Arc<SceneLibrary>,
        skills: Arc<Mutex<SkillLibrary>>,
        store: Arc<Store>,
        artifacts: SceneArtifactStore,
        submit: Box<dyn Fn(Op) + Send + Sync>,
        emit: broadcast::Sender<Event>,
    ) -> Self {
        Self {
            scenes: RwLock::new(scenes),
            skills,
            store,
            artifacts,
            submit,
            emit,
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// Swap the resolved library (desktop `reload_scenes` keeps engine + runtime in sync).
    pub fn set_scenes(&self, library: Arc<SceneLibrary>) {
        *self.scenes.write().unwrap() = library;
    }

    /// A scene became active for a session: update the cached reference and fire `enter` hooks.
    pub fn scene_activated(&self, session: &str, scene_ref: Option<&str>) {
        let enter_count = {
            let mut sessions = self.sessions.lock().unwrap();
            let state = sessions.entry(session.to_string()).or_default();
            state.scene_ref = scene_ref.map(str::to_string);
            if scene_ref.is_none() {
                return;
            }
            state.enter_counter += 1;
            state.enter_counter
        };
        if let Some((scene_ref, scene)) = self.active_scene(session) {
            self.run_hooks(
                session,
                &scene_ref,
                &scene,
                HookEvent::Enter,
                &format!("enter@{enter_count}"),
                None,
            );
        }
    }

    /// One event off the broadcast bus. Cheap for everything the runtime doesn't care about.
    pub fn on_event(&self, event: &Event) {
        match event {
            Event::TurnEnded { session, .. } => {
                let turn = {
                    let mut sessions = self.sessions.lock().unwrap();
                    let state = sessions.entry(session.clone()).or_default();
                    state.macro_in_flight = None;
                    state.turn_counter += 1;
                    state.turn_counter
                };
                if let Some((scene_ref, scene)) = self.active_scene(session) {
                    self.run_hooks(
                        session,
                        &scene_ref,
                        &scene,
                        HookEvent::TurnEnd,
                        &format!("turn@{turn}"),
                        None,
                    );
                    self.check_exit(session, &scene_ref, &scene);
                }
            }
            Event::TestSignal {
                session,
                tool_call_id,
                passed,
                ..
            } => {
                {
                    let mut sessions = self.sessions.lock().unwrap();
                    let state = sessions.entry(session.clone()).or_default();
                    state.last_test = Some(*passed);
                }
                if !*passed {
                    if let Some((scene_ref, scene)) = self.active_scene(session) {
                        self.run_hooks(
                            session,
                            &scene_ref,
                            &scene,
                            HookEvent::TestsFailed,
                            tool_call_id,
                            None,
                        );
                    }
                }
            }
            Event::ArtifactProduced {
                session,
                artifact_key,
                version,
                ..
            } => {
                if let Some((scene_ref, scene)) = self.active_scene(session) {
                    self.run_hooks(
                        session,
                        &scene_ref,
                        &scene,
                        HookEvent::ArtifactProduced,
                        &format!("{artifact_key}@{version}"),
                        Some(artifact_key),
                    );
                    self.check_exit(session, &scene_ref, &scene);
                }
            }
            _ => {}
        }
    }

    /// The completion banner's dismissal is remembered per session; it never re-fires for the
    /// same state key.
    pub fn dismiss_banner(&self, session: &str, state_key: &str) {
        let mut sessions = self.sessions.lock().unwrap();
        let state = sessions.entry(session.to_string()).or_default();
        state.banner_dismissed.insert(state_key.to_string());
    }

    /// Persist the per-project scheduling switch (off by default).
    pub fn set_scheduling(&self, project_path: &str, enabled: bool) {
        if let Err(error) = self.store.set_project_scheduling(project_path, enabled) {
            tracing::warn!("couldn't persist project scheduling: {error}");
        }
    }

    /// The 30 s schedule loop: for each scheduling-enabled project, run due `schedule` hooks of
    /// every session's active scene. Spawn this once from the host's async runtime.
    pub async fn schedule_loop(self: Arc<Self>) {
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(SCHEDULE_TICK_SECS));
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tick.tick().await;
            self.schedule_tick(now_civil_utc());
        }
    }

    /// One scan, testable without time or tokio. `now` is (minute, hour, dom, month, dow-0=Sun)
    /// plus a minute-resolution stamp used as the debounce key.
    fn schedule_tick(&self, now: CivilMinute) {
        let projects = match self.store.scheduled_projects() {
            Ok(projects) => projects,
            Err(error) => {
                tracing::warn!("schedule scan couldn't list projects: {error}");
                return;
            }
        };
        if projects.is_empty() {
            return;
        }
        let sessions = match self.store.list_sessions() {
            Ok(sessions) => sessions,
            Err(error) => {
                tracing::warn!("schedule scan couldn't list sessions: {error}");
                return;
            }
        };
        for session in sessions {
            let Some(project) = &session.project_path else {
                continue;
            };
            if !projects.iter().any(|path| path == project) {
                continue;
            }
            let Some((scene_ref, scene)) = self.active_scene(&session.id) else {
                continue;
            };
            for (index, hook) in scene.hooks.iter().enumerate() {
                if hook.on != HookEvent::Schedule {
                    continue;
                }
                let Some(expr) = hook.schedule.as_deref() else {
                    continue;
                };
                if !cron::matches(expr, now.minute, now.hour, now.dom, now.month, now.dow) {
                    continue;
                }
                let state_key = format!("sched@{}", now.stamp);
                if !self.claim(&session.id, index, &state_key) {
                    continue;
                }
                self.run_action(
                    &session.id,
                    &scene_ref,
                    &scene,
                    hook,
                    "schedule",
                    &state_key,
                );
            }
        }
    }

    /// The session's active scene: the durable `sessions.active_scene` column when present,
    /// else the cached reference from [`scene_activated`]. Unresolvable references degrade to
    /// "no scene" — never an error.
    fn active_scene(&self, session: &str) -> Option<(String, Scene)> {
        let stored = self
            .store
            .session_scene(session)
            .ok()
            .flatten()
            .map(|(reference, _)| reference);
        let reference = stored.or_else(|| {
            self.sessions
                .lock()
                .unwrap()
                .get(session)
                .and_then(|state| state.scene_ref.clone())
        })?;
        let scenes = self.scenes.read().unwrap().clone();
        let entry = scenes.resolve(&reference)?;
        Some((reference, entry.scene.clone()))
    }

    /// Reserve one fire for `"{hook_index}:{state_key}"`. False when already fired.
    fn claim(&self, session: &str, hook_index: usize, state_key: &str) -> bool {
        let mut sessions = self.sessions.lock().unwrap();
        let state = sessions.entry(session.to_string()).or_default();
        state.fired.insert(format!("{hook_index}:{state_key}"))
    }

    fn run_hooks(
        &self,
        session: &str,
        scene_ref: &str,
        scene: &Scene,
        on: HookEvent,
        state_key: &str,
        artifact: Option<&str>,
    ) {
        for (index, hook) in scene.hooks.iter().enumerate() {
            if hook.on != on {
                continue;
            }
            if let (Some(filter), Some(produced)) = (hook.artifact.as_deref(), artifact) {
                if filter != produced {
                    continue;
                }
            }
            if !self.claim(session, index, state_key) {
                continue;
            }
            self.run_action(
                session,
                scene_ref,
                scene,
                hook,
                hook_event_name(on),
                state_key,
            );
        }
    }

    /// The action allowlist. Anything unknown is impossible by construction (closed enum), and
    /// nothing here can reach `Op::SetExecutionPolicy`.
    fn run_action(
        &self,
        session: &str,
        scene_ref: &str,
        scene: &Scene,
        hook: &SceneHook,
        on: &str,
        state_key: &str,
    ) {
        let action = &hook.action;
        match action.kind {
            HookActionKind::SuggestScene => {
                let _ = self.emit.send(Event::HookSuggestion {
                    session: session.to_string(),
                    scene_ref: scene_ref.to_string(),
                    on: on.to_string(),
                    kind: "suggest_scene".into(),
                    target_scene: action.scene.clone(),
                    carry: Vec::new(),
                    message: action.message.clone(),
                    pipeline_instance: None,
                    to_stage: None,
                    state_key: state_key.to_string(),
                });
            }
            HookActionKind::SuggestNext => {
                // The first `exit.next` entry with its carry set; absent any, degrade silently.
                let Some(next) = scene.exit.as_ref().and_then(|exit| exit.next.first()) else {
                    return;
                };
                let _ = self.emit.send(Event::HookSuggestion {
                    session: session.to_string(),
                    scene_ref: scene_ref.to_string(),
                    on: on.to_string(),
                    kind: "suggest_next".into(),
                    target_scene: Some(next.scene.clone()),
                    carry: next.carry.clone(),
                    message: action.message.clone().or_else(|| next.label.clone()),
                    pipeline_instance: None,
                    to_stage: None,
                    state_key: state_key.to_string(),
                });
            }
            HookActionKind::Notify => {
                let _ = self.emit.send(Event::HookSuggestion {
                    session: session.to_string(),
                    scene_ref: scene_ref.to_string(),
                    on: on.to_string(),
                    kind: "notify".into(),
                    target_scene: None,
                    carry: Vec::new(),
                    message: action.message.clone(),
                    pipeline_instance: None,
                    to_stage: None,
                    state_key: state_key.to_string(),
                });
            }
            HookActionKind::RunMacro => {
                let Some(macro_ref) = action.macro_ref.as_deref() else {
                    return;
                };
                // Bounded loops: at most one hook-initiated prompt in flight per session.
                {
                    let mut sessions = self.sessions.lock().unwrap();
                    let state = sessions.entry(session.to_string()).or_default();
                    if state.macro_in_flight.is_some() {
                        tracing::warn!(
                            "hook run_macro `{macro_ref}` dropped: a hook turn is already in flight for {session}"
                        );
                        return;
                    }
                    state.macro_in_flight = Some(macro_ref.to_string());
                }
                let is_macro = {
                    let skills = self.skills.lock().unwrap();
                    matches!(
                        skills.get(macro_ref).map(|skill| &skill.payload),
                        Some(SkillPayload::Macro { .. })
                    )
                };
                if !is_macro {
                    tracing::warn!(
                        "hook run_macro `{macro_ref}` dropped: not a Macro skill in the library"
                    );
                    let mut sessions = self.sessions.lock().unwrap();
                    if let Some(state) = sessions.get_mut(session) {
                        state.macro_in_flight = None;
                    }
                    return;
                }
                let params: HashMap<String, String> = action
                    .args
                    .iter()
                    .map(|(slot, value)| (slot.clone(), self.interpolate_artifacts(session, value)))
                    .collect();
                (self.submit)(Op::Prompt {
                    session: session.to_string(),
                    doc: vec![DocBlock::Skill {
                        skill_id: macro_ref.to_string(),
                        params,
                    }],
                    request_id: None,
                });
                let _ = self.emit.send(Event::HookTurnStarted {
                    session: session.to_string(),
                    scene_ref: scene_ref.to_string(),
                    macro_id: macro_ref.to_string(),
                });
            }
        }
    }

    /// Replace `{{artifact:<id>}}` with the newest (or pinned) captured content for this session.
    /// An id with no capture keeps its placeholder — degrade, never error.
    fn interpolate_artifacts(&self, session: &str, value: &str) -> String {
        let mut out = String::new();
        let mut rest = value;
        while let Some(start) = rest.find("{{artifact:") {
            out.push_str(&rest[..start]);
            let after = &rest[start + "{{artifact:".len()..];
            let Some(end) = after.find("}}") else {
                out.push_str(&rest[start..]);
                return out;
            };
            let id = &after[..end];
            let content = self
                .artifacts
                .latest(session, id)
                .ok()
                .flatten()
                .and_then(|record| self.artifacts.content(record.id).ok());
            match content {
                Some(content) => out.push_str(&content),
                None => out.push_str(&rest[start..start + "{{artifact:".len() + end + 2]),
            }
            rest = &after[end + 2..];
        }
        out.push_str(rest);
        out
    }

    /// Evaluate the active scene's exit criteria; when everything machine-checkable holds and the
    /// state was neither announced nor dismissed, emit [`Event::ExitCriteriaMet`] and run the
    /// scene's `exit_criteria_met` hooks.
    fn check_exit(&self, session: &str, scene_ref: &str, scene: &Scene) {
        let last_test = self
            .sessions
            .lock()
            .unwrap()
            .get(session)
            .and_then(|state| state.last_test);
        let evaluation = evaluate_exit(scene, &self.artifacts, session, last_test);
        if !evaluation.met {
            return;
        }
        {
            let mut sessions = self.sessions.lock().unwrap();
            let state = sessions.entry(session.to_string()).or_default();
            if state.banner_dismissed.contains(&evaluation.state_key) {
                return;
            }
            if !state.fired.insert(format!("exit:{}", evaluation.state_key)) {
                return;
            }
        }
        let _ = self.emit.send(Event::ExitCriteriaMet {
            session: session.to_string(),
            scene_ref: scene_ref.to_string(),
            satisfied: evaluation.satisfied.clone(),
            unverified: evaluation.unverified.clone(),
            state_key: evaluation.state_key.clone(),
        });
        self.run_hooks(
            session,
            scene_ref,
            scene,
            HookEvent::ExitCriteriaMet,
            &evaluation.state_key,
            None,
        );
    }
}

fn hook_event_name(on: HookEvent) -> &'static str {
    match on {
        HookEvent::Enter => "enter",
        HookEvent::TurnEnd => "turn_end",
        HookEvent::ArtifactProduced => "artifact_produced",
        HookEvent::ExitCriteriaMet => "exit_criteria_met",
        HookEvent::TestsFailed => "tests_failed",
        HookEvent::Schedule => "schedule",
    }
}

// ---------------------------------------------------------------------------
// Exit evaluation
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExitEvaluation {
    /// All machine-checkable criteria hold. `user_confirm` is excluded (it IS the banner) and
    /// `custom` never blocks — it surfaces as unverified.
    pub met: bool,
    pub satisfied: Vec<String>,
    pub missing: Vec<String>,
    pub unverified: Vec<String>,
    /// Sorted `kind[:artifact@version]` joined with `,` — the banner/debounce identity.
    pub state_key: String,
}

/// Pure evaluation of a scene's effective exit criteria against the artifact store.
pub fn evaluate_exit(
    scene: &Scene,
    artifacts: &SceneArtifactStore,
    session: &str,
    last_test: Option<bool>,
) -> ExitEvaluation {
    let mut satisfied = Vec::new();
    let mut missing = Vec::new();
    let mut unverified = Vec::new();
    let mut key_parts = Vec::new();
    for criterion in scene.effective_criteria() {
        match criterion.kind {
            ExitCriterionKind::RequiredArtifacts => {
                let complete = scene
                    .artifacts
                    .iter()
                    .filter(|spec| spec.required)
                    .all(|spec| artifacts.latest(session, &spec.id).ok().flatten().is_some());
                let versions: Vec<String> = scene
                    .artifacts
                    .iter()
                    .filter(|spec| spec.required)
                    .filter_map(|spec| {
                        artifacts
                            .latest(session, &spec.id)
                            .ok()
                            .flatten()
                            .map(|record| format!("{}@{}", spec.id, record.version))
                    })
                    .collect();
                if versions.is_empty() {
                    key_parts.push("required_artifacts".to_string());
                } else {
                    key_parts.push(format!("required_artifacts:{}", versions.join("+")));
                }
                if complete {
                    satisfied.push("required_artifacts".to_string());
                } else {
                    missing.push("required_artifacts".to_string());
                }
            }
            ExitCriterionKind::ChecklistComplete => {
                let record = criterion
                    .artifact
                    .as_deref()
                    .and_then(|key| artifacts.latest(session, key).ok().flatten());
                let key = criterion.artifact.as_deref().unwrap_or("");
                match &record {
                    Some(record) => {
                        key_parts.push(format!("checklist_complete:{key}@{}", record.version))
                    }
                    None => key_parts.push(format!("checklist_complete:{key}")),
                }
                let complete = record
                    .and_then(|record| artifacts.content(record.id).ok())
                    .is_some_and(|content| !content.contains("- [ ]") && content.contains("- [x]"));
                if complete {
                    satisfied.push("checklist_complete".to_string());
                } else {
                    missing.push("checklist_complete".to_string());
                }
            }
            ExitCriterionKind::TestsPass => {
                key_parts.push("tests_pass".to_string());
                if last_test == Some(true) {
                    satisfied.push("tests_pass".to_string());
                } else {
                    missing.push("tests_pass".to_string());
                }
            }
            // The user acting on the banner IS this criterion; it never contributes to `met`.
            ExitCriterionKind::UserConfirm => key_parts.push("user_confirm".to_string()),
            ExitCriterionKind::Custom => {
                key_parts.push("custom".to_string());
                if let Some(description) = &criterion.description {
                    unverified.push(description.clone());
                }
            }
        }
    }
    key_parts.sort();
    ExitEvaluation {
        met: missing.is_empty() && !satisfied.is_empty(),
        satisfied,
        missing,
        unverified,
        state_key: key_parts.join(","),
    }
}

// ---------------------------------------------------------------------------
// Civil time + cron
// ---------------------------------------------------------------------------

/// One minute of civil (UTC) time, precomputed for the cron matcher and stamped for debounce.
#[derive(Debug, Clone, Copy)]
struct CivilMinute {
    minute: u32,
    hour: u32,
    dom: u32,
    month: u32,
    /// 0 = Sunday.
    dow: u32,
    /// Minute-resolution stamp, e.g. `202608121430`.
    stamp: u64,
}

/// UTC civil time from the system clock (no timezone dependency in the core; schedules are
/// documented as UTC).
fn now_civil_utc() -> CivilMinute {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let days = secs.div_euclid(86_400);
    let secs_of_day = secs.rem_euclid(86_400) as u32;
    let (year, month, dom) = civil_from_days(days);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    // 1970-01-01 was a Thursday (dow 4 with 0 = Sunday).
    let dow = (days + 4).rem_euclid(7) as u32;
    let stamp = (year as u64) * 100_000_000
        + (month as u64) * 1_000_000
        + (dom as u64) * 10_000
        + (hour as u64) * 100
        + minute as u64;
    CivilMinute {
        minute,
        hour,
        dom,
        month,
        dow,
        stamp,
    }
}

/// Howard Hinnant's `civil_from_days`: days since 1970-01-01 → (year, month 1–12, day 1–31).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Hand-rolled five-field cron matcher supporting `*`, lists (`,`), ranges (`-`), and steps
/// (`/`). No names, no macros — the scene schema promises exactly this much.
pub mod cron {
    /// `expr` is `minute hour dom month dow` (dow 0–7, both 0 and 7 mean Sunday). A malformed
    /// expression never matches — schedules degrade to inert, they don't error.
    pub fn matches(expr: &str, minute: u32, hour: u32, dom: u32, month: u32, dow: u32) -> bool {
        let fields: Vec<&str> = expr.split_whitespace().collect();
        if fields.len() != 5 {
            return false;
        }
        field_matches(fields[0], minute, 0, 59)
            && field_matches(fields[1], hour, 0, 23)
            && field_matches(fields[2], dom, 1, 31)
            && field_matches(fields[3], month, 1, 12)
            && field_matches(fields[4], dow % 7, 0, 7)
    }

    fn field_matches(field: &str, value: u32, min: u32, max: u32) -> bool {
        field
            .split(',')
            .any(|part| part_matches(part, value, min, max))
    }

    fn part_matches(part: &str, value: u32, min: u32, max: u32) -> bool {
        let (range, step) = match part.split_once('/') {
            Some((range, step)) => match step.parse::<u32>() {
                Ok(step) if step > 0 => (range, step),
                _ => return false,
            },
            None => (part, 1),
        };
        let (lo, hi) = if range == "*" {
            (min, max)
        } else if let Some((lo, hi)) = range.split_once('-') {
            match (lo.parse::<u32>(), hi.parse::<u32>()) {
                (Ok(lo), Ok(hi)) if lo <= hi => (lo, hi),
                _ => return false,
            }
        } else {
            match range.parse::<u32>() {
                // A bare value with a step (`5/15`) means "from 5 to max" per classic cron.
                Ok(lo) if part.contains('/') => (lo, max),
                Ok(exact) => return normalize(exact, max) == value,
                Err(_) => return false,
            }
        };
        // Range bounds stay raw: normalizing `hi` would fold a day-of-week `*` (0–7) or `5-7`
        // upper bound of 7 down to 0 and empty the range. Sunday-as-7 is instead honored by
        // also accepting a normalized value of 0 wherever raw 7 would fall inside the range.
        let value = normalize(value, max);
        let in_range = |v: u32| v >= lo && v <= hi && (v - lo) % step == 0;
        in_range(value) || (max == 7 && value == 0 && in_range(7))
    }

    /// Day-of-week 7 is Sunday (0); everything else passes through.
    fn normalize(value: u32, max: u32) -> u32 {
        if max == 7 && value == 7 {
            0
        } else {
            value
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::artifact::ArtifactStore;
    use crate::permission::{PermissionMode, SandboxPolicy};
    use crate::scene::{ExitCriterion, SceneArtifactKind, SceneArtifactSpec, SceneExit};
    use crate::skill::{Skill, SlotDef};
    use std::sync::mpsc;
    use tempfile::tempdir;

    fn artifact_store(dir: &std::path::Path) -> (Arc<Store>, SceneArtifactStore) {
        let store = Arc::new(Store::open(dir.join("codetwo.db").to_str().unwrap()).unwrap());
        let blobs = ArtifactStore::from_store(store.clone()).unwrap();
        (store.clone(), SceneArtifactStore::new(store, blobs))
    }

    fn scene_with(extra: serde_json::Value) -> Scene {
        let mut base = serde_json::json!({
            "$schema": crate::scene::SCENE_SCHEMA_ID,
            "name": "unit",
            "title": "Unit",
        });
        base.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        serde_json::from_value(base).unwrap()
    }

    fn library_with(scene: &Scene) -> Arc<SceneLibrary> {
        // Round-trip through a directory so the library owns a resolvable entry.
        let dir = tempdir().unwrap();
        std::fs::create_dir_all(dir.path()).unwrap();
        std::fs::write(
            dir.path().join(format!("{}.scene.json", scene.name)),
            serde_json::to_string(scene).unwrap(),
        )
        .unwrap();
        Arc::new(SceneLibrary::load(Some(dir.path()), None, &[]))
    }

    struct Harness {
        runtime: SceneRuntime,
        events: broadcast::Receiver<Event>,
        ops: mpsc::Receiver<Op>,
        artifacts: SceneArtifactStore,
    }

    fn harness(dir: &std::path::Path, scene: &Scene, skills: SkillLibrary) -> Harness {
        let (store, artifacts) = artifact_store(dir);
        let (emit, events) = broadcast::channel(64);
        let (op_tx, ops) = mpsc::channel();
        let runtime = SceneRuntime::new(
            library_with(scene),
            Arc::new(Mutex::new(skills)),
            store,
            artifacts.clone(),
            Box::new(move |op| {
                let _ = op_tx.send(op);
            }),
            emit,
        );
        Harness {
            runtime,
            events,
            ops,
            artifacts,
        }
    }

    fn drain(events: &mut broadcast::Receiver<Event>) -> Vec<Event> {
        let mut out = Vec::new();
        while let Ok(event) = events.try_recv() {
            out.push(event);
        }
        out
    }

    #[test]
    fn tests_failed_hook_fires_once_per_tool_call() {
        let dir = tempdir().unwrap();
        let scene = scene_with(serde_json::json!({
            "hooks": [
                { "on": "tests_failed", "action": { "kind": "suggest_scene", "scene": "fix" } }
            ]
        }));
        let mut h = harness(dir.path(), &scene, SkillLibrary::default());
        h.runtime.scene_activated("s1", Some("unit"));

        let signal = Event::TestSignal {
            session: "s1".into(),
            tool_call_id: "tool-1".into(),
            command: "cargo test".into(),
            passed: false,
            exit_code: Some(101),
        };
        h.runtime.on_event(&signal);
        // Same state (same tool call) never fires twice.
        h.runtime.on_event(&signal);

        let suggestions: Vec<Event> = drain(&mut h.events)
            .into_iter()
            .filter(|event| matches!(event, Event::HookSuggestion { .. }))
            .collect();
        assert_eq!(suggestions.len(), 1);
        match &suggestions[0] {
            Event::HookSuggestion {
                on,
                kind,
                target_scene,
                state_key,
                ..
            } => {
                assert_eq!(on, "tests_failed");
                assert_eq!(kind, "suggest_scene");
                assert_eq!(target_scene.as_deref(), Some("fix"));
                assert_eq!(state_key, "tool-1");
            }
            _ => unreachable!(),
        }

        // A new tool call is a new state.
        h.runtime.on_event(&Event::TestSignal {
            session: "s1".into(),
            tool_call_id: "tool-2".into(),
            command: "cargo test".into(),
            passed: false,
            exit_code: Some(101),
        });
        assert_eq!(drain(&mut h.events).len(), 1);

        // A passing signal fires nothing.
        h.runtime.on_event(&Event::TestSignal {
            session: "s1".into(),
            tool_call_id: "tool-3".into(),
            command: "cargo test".into(),
            passed: true,
            exit_code: Some(0),
        });
        assert!(drain(&mut h.events).is_empty());
    }

    #[test]
    fn artifact_filter_gates_the_hook() {
        let dir = tempdir().unwrap();
        let scene = scene_with(serde_json::json!({
            "hooks": [
                {
                    "on": "artifact_produced",
                    "artifact": "report",
                    "action": { "kind": "notify", "message": "report captured" }
                }
            ]
        }));
        let mut h = harness(dir.path(), &scene, SkillLibrary::default());
        h.runtime.scene_activated("s1", Some("unit"));

        h.runtime.on_event(&Event::ArtifactProduced {
            session: "s1".into(),
            scene_ref: "unit".into(),
            artifact_key: "other".into(),
            kind: "report".into(),
            version: 1,
            record_id: 1,
        });
        assert!(
            drain(&mut h.events)
                .iter()
                .all(|event| !matches!(event, Event::HookSuggestion { .. })),
            "filtered key must not fire the hook"
        );

        h.runtime.on_event(&Event::ArtifactProduced {
            session: "s1".into(),
            scene_ref: "unit".into(),
            artifact_key: "report".into(),
            kind: "report".into(),
            version: 1,
            record_id: 2,
        });
        let fired = drain(&mut h.events);
        assert!(fired
            .iter()
            .any(|event| matches!(event, Event::HookSuggestion { kind, .. } if kind == "notify")));
    }

    #[test]
    fn enter_hook_fires_on_each_activation() {
        let dir = tempdir().unwrap();
        let scene = scene_with(serde_json::json!({
            "hooks": [
                { "on": "enter", "action": { "kind": "notify", "message": "welcome" } }
            ]
        }));
        let mut h = harness(dir.path(), &scene, SkillLibrary::default());
        h.runtime.scene_activated("s1", Some("unit"));
        h.runtime.scene_activated("s1", Some("unit"));
        let fired = drain(&mut h.events);
        assert_eq!(fired.len(), 2, "each activation is a new state");
    }

    #[test]
    fn run_macro_submits_one_prompt_and_respects_in_flight() {
        let dir = tempdir().unwrap();
        let scene = scene_with(serde_json::json!({
            "artifacts": [
                { "id": "report", "title": "Report", "kind": "report" }
            ],
            "hooks": [
                {
                    "on": "tests_failed",
                    "action": {
                        "kind": "run_macro",
                        "macro": "summarize",
                        "args": { "body": "{{artifact:report}}" }
                    }
                }
            ]
        }));
        let skills = SkillLibrary::new([Skill {
            id: "summarize".into(),
            name: "Summarize".into(),
            description: String::new(),
            icon: None,
            source: None,
            payload: SkillPayload::Macro {
                template: "Summarize: {{body}}".into(),
                slots: vec![SlotDef {
                    id: "body".into(),
                    label: String::new(),
                    kind: Default::default(),
                    options: Vec::new(),
                    required: false,
                    default: None,
                }],
            },
        }]);
        let mut h = harness(dir.path(), &scene, skills);
        h.runtime.scene_activated("s1", Some("unit"));
        let spec = SceneArtifactSpec {
            id: "report".into(),
            title: "Report".into(),
            kind: SceneArtifactKind::Report,
            required: false,
            template: None,
            description: None,
        };
        h.artifacts
            .record("unit", &spec, "s1", None, "the findings")
            .unwrap();

        h.runtime.on_event(&Event::TestSignal {
            session: "s1".into(),
            tool_call_id: "tool-1".into(),
            command: "cargo test".into(),
            passed: false,
            exit_code: None,
        });
        // In flight: a second failure in the same turn is dropped entirely.
        h.runtime.on_event(&Event::TestSignal {
            session: "s1".into(),
            tool_call_id: "tool-2".into(),
            command: "cargo test".into(),
            passed: false,
            exit_code: None,
        });

        let ops: Vec<Op> = h.ops.try_iter().collect();
        assert_eq!(ops.len(), 1, "one-in-flight must drop the second macro");
        match &ops[0] {
            Op::Prompt { session, doc, .. } => {
                assert_eq!(session, "s1");
                match &doc[0] {
                    DocBlock::Skill { skill_id, params } => {
                        assert_eq!(skill_id, "summarize");
                        assert_eq!(params.get("body").map(String::as_str), Some("the findings"));
                    }
                    other => panic!("unexpected block {other:?}"),
                }
            }
            other => panic!("unexpected op {other:?}"),
        }
        assert!(drain(&mut h.events)
            .iter()
            .any(|event| matches!(event, Event::HookTurnStarted { macro_id, .. } if macro_id == "summarize")));

        // TurnEnded clears the slot; the next failure may fire again.
        h.runtime.on_event(&Event::TurnEnded {
            session: "s1".into(),
            stop_reason: "EndTurn".into(),
        });
        h.runtime.on_event(&Event::TestSignal {
            session: "s1".into(),
            tool_call_id: "tool-3".into(),
            command: "cargo test".into(),
            passed: false,
            exit_code: None,
        });
        assert_eq!(h.ops.try_iter().count(), 1);
    }

    #[test]
    fn hooks_never_submit_an_execution_policy_op() {
        let dir = tempdir().unwrap();
        // Every allowlisted action kind, wired to every hook event that can fire here.
        let scene = scene_with(serde_json::json!({
            "artifacts": [
                { "id": "report", "title": "Report", "kind": "report", "required": true }
            ],
            "exit": { "criteria": [ { "kind": "required_artifacts" } ], "next": [ { "scene": "next" } ] },
            "hooks": [
                { "on": "enter", "action": { "kind": "notify", "message": "hi" } },
                { "on": "turn_end", "action": { "kind": "suggest_next" } },
                { "on": "tests_failed", "action": { "kind": "suggest_scene", "scene": "fix" } },
                { "on": "artifact_produced", "action": { "kind": "run_macro", "macro": "m" } },
                { "on": "exit_criteria_met", "action": { "kind": "suggest_next" } }
            ]
        }));
        let skills = SkillLibrary::new([Skill {
            id: "m".into(),
            name: "M".into(),
            description: String::new(),
            icon: None,
            source: None,
            payload: SkillPayload::Macro {
                template: "run".into(),
                slots: Vec::new(),
            },
        }]);
        let mut h = harness(dir.path(), &scene, skills);
        h.runtime.scene_activated("s1", Some("unit"));
        let spec = SceneArtifactSpec {
            id: "report".into(),
            title: "Report".into(),
            kind: SceneArtifactKind::Report,
            required: true,
            template: None,
            description: None,
        };
        let record = h
            .artifacts
            .record("unit", &spec, "s1", None, "findings")
            .unwrap();

        h.runtime.on_event(&Event::TestSignal {
            session: "s1".into(),
            tool_call_id: "t1".into(),
            command: "cargo test".into(),
            passed: false,
            exit_code: None,
        });
        h.runtime.on_event(&Event::ArtifactProduced {
            session: "s1".into(),
            scene_ref: "unit".into(),
            artifact_key: "report".into(),
            kind: "report".into(),
            version: record.version,
            record_id: record.id,
        });
        h.runtime.on_event(&Event::TurnEnded {
            session: "s1".into(),
            stop_reason: "EndTurn".into(),
        });

        let ops: Vec<Op> = h.ops.try_iter().collect();
        assert!(!ops.is_empty(), "the macro hook must have submitted");
        for op in &ops {
            assert!(
                matches!(op, Op::Prompt { .. }),
                "hooks may only submit prompts, saw {op:?}"
            );
            assert!(!matches!(
                op,
                Op::SetExecutionPolicy { .. }
                    | Op::SetPermissionMode {
                        mode: PermissionMode::Yolo,
                        ..
                    }
                    | Op::SetSandbox {
                        sandbox: SandboxPolicy::DangerFullAccess,
                        ..
                    }
            ));
        }
        let _ = drain(&mut h.events);
    }

    #[test]
    fn exit_banner_fires_once_and_respects_dismissal() {
        let dir = tempdir().unwrap();
        let scene = scene_with(serde_json::json!({
            "artifacts": [
                { "id": "report", "title": "Report", "kind": "report", "required": true }
            ]
        }));
        let mut h = harness(dir.path(), &scene, SkillLibrary::default());
        h.runtime.scene_activated("s1", Some("unit"));
        let spec = SceneArtifactSpec {
            id: "report".into(),
            title: "Report".into(),
            kind: SceneArtifactKind::Report,
            required: true,
            template: None,
            description: None,
        };
        h.artifacts
            .record("unit", &spec, "s1", None, "findings")
            .unwrap();

        let turn_ended = Event::TurnEnded {
            session: "s1".into(),
            stop_reason: "EndTurn".into(),
        };
        h.runtime.on_event(&turn_ended);
        let first = drain(&mut h.events);
        let state_key = match first
            .iter()
            .find(|event| matches!(event, Event::ExitCriteriaMet { .. }))
        {
            Some(Event::ExitCriteriaMet {
                state_key,
                satisfied,
                ..
            }) => {
                assert_eq!(satisfied, &["required_artifacts".to_string()]);
                state_key.clone()
            }
            _ => panic!("expected ExitCriteriaMet"),
        };

        // Same state on the next turn: silent.
        h.runtime.on_event(&turn_ended);
        assert!(drain(&mut h.events).is_empty());

        // A new version is a new state…
        h.artifacts
            .record("unit", &spec, "s1", None, "updated findings")
            .unwrap();
        // …but a prior dismissal of that state suppresses it.
        let next_key = state_key.replace("report@1", "report@2");
        h.runtime.dismiss_banner("s1", &next_key);
        h.runtime.on_event(&turn_ended);
        assert!(
            drain(&mut h.events)
                .iter()
                .all(|event| !matches!(event, Event::ExitCriteriaMet { .. })),
            "dismissed state must not re-fire"
        );
    }

    #[test]
    fn evaluate_exit_per_criterion_kind() {
        let dir = tempdir().unwrap();
        let (_store, artifacts) = artifact_store(dir.path());
        let spec = SceneArtifactSpec {
            id: "list".into(),
            title: "Checklist".into(),
            kind: SceneArtifactKind::Checklist,
            required: true,
            template: None,
            description: None,
        };

        let mut scene = scene_with(serde_json::json!({
            "artifacts": [
                { "id": "list", "title": "Checklist", "kind": "checklist", "required": true }
            ]
        }));
        scene.exit = Some(SceneExit {
            criteria: vec![
                ExitCriterion {
                    kind: ExitCriterionKind::RequiredArtifacts,
                    artifact: None,
                    description: None,
                },
                ExitCriterion {
                    kind: ExitCriterionKind::ChecklistComplete,
                    artifact: Some("list".into()),
                    description: None,
                },
                ExitCriterion {
                    kind: ExitCriterionKind::TestsPass,
                    artifact: None,
                    description: None,
                },
                ExitCriterion {
                    kind: ExitCriterionKind::UserConfirm,
                    artifact: None,
                    description: None,
                },
                ExitCriterion {
                    kind: ExitCriterionKind::Custom,
                    artifact: None,
                    description: Some("docs updated".into()),
                },
            ],
            next: Vec::new(),
        });

        // Nothing recorded: everything machine-checkable is missing.
        let eval = evaluate_exit(&scene, &artifacts, "s1", None);
        assert!(!eval.met);
        assert_eq!(
            eval.missing,
            vec!["required_artifacts", "checklist_complete", "tests_pass"]
        );
        assert_eq!(eval.unverified, vec!["docs updated"]);

        // Unchecked items keep the checklist unsatisfied.
        artifacts
            .record("unit", &spec, "s1", None, "- [x] a\n- [ ] b\n")
            .unwrap();
        let eval = evaluate_exit(&scene, &artifacts, "s1", Some(true));
        assert!(!eval.met);
        assert!(eval.missing.contains(&"checklist_complete".to_string()));

        // All checked + tests green: met, user_confirm excluded, custom unverified.
        artifacts
            .record("unit", &spec, "s1", None, "- [x] a\n- [x] b\n")
            .unwrap();
        let eval = evaluate_exit(&scene, &artifacts, "s1", Some(true));
        assert!(eval.met);
        assert_eq!(
            eval.satisfied,
            vec!["required_artifacts", "checklist_complete", "tests_pass"]
        );
        assert_eq!(eval.unverified, vec!["docs updated"]);
        assert!(eval.state_key.contains("checklist_complete:list@2"));
        assert!(eval.state_key.contains("user_confirm"));

        // tests_pass resets on restart (None) and on a red signal.
        assert!(!evaluate_exit(&scene, &artifacts, "s1", None).met);
        assert!(!evaluate_exit(&scene, &artifacts, "s1", Some(false)).met);

        // An empty checklist (no `- [x]`) is not "complete".
        artifacts
            .record("unit", &spec, "s1", None, "notes only")
            .unwrap();
        let eval = evaluate_exit(&scene, &artifacts, "s1", Some(true));
        assert!(!eval.met);
    }

    #[test]
    fn schedule_tick_respects_enablement_cron_and_debounce() {
        let dir = tempdir().unwrap();
        let scene = scene_with(serde_json::json!({
            "hooks": [
                {
                    "on": "schedule",
                    "schedule": "*/15 * * * *",
                    "action": { "kind": "notify", "message": "tick" }
                }
            ]
        }));
        let mut h = harness(dir.path(), &scene, SkillLibrary::default());
        let store = h.runtime.store.clone();
        store.add_project("/work", None, 1).unwrap();
        let mut session =
            crate::session::Session::new(crate::provider::ProviderId::ClaudeCode, "/work");
        session.id = "s1".to_string();
        store.upsert_session(&session).unwrap();
        store.set_session_scene("s1", Some("unit"), false).unwrap();

        let due = CivilMinute {
            minute: 30,
            hour: 9,
            dom: 12,
            month: 8,
            dow: 3,
            stamp: 202_608_120_930,
        };

        // Scheduling is off by default: nothing fires.
        h.runtime.schedule_tick(due);
        assert!(drain(&mut h.events).is_empty());

        h.runtime.set_scheduling("/work", true);
        assert!(store.project_scheduling("/work").unwrap());

        // Two ticks land in the same minute; the stamp debounces the second.
        h.runtime.schedule_tick(due);
        h.runtime.schedule_tick(due);
        assert_eq!(drain(&mut h.events).len(), 1);

        // A non-matching minute stays silent; the next matching minute fires again.
        h.runtime.schedule_tick(CivilMinute {
            minute: 31,
            stamp: 202_608_120_931,
            ..due
        });
        assert!(drain(&mut h.events).is_empty());
        h.runtime.schedule_tick(CivilMinute {
            minute: 45,
            stamp: 202_608_120_945,
            ..due
        });
        assert_eq!(drain(&mut h.events).len(), 1);
    }

    #[test]
    fn cron_table() {
        use super::cron::matches;
        // (expr, minute, hour, dom, month, dow, expected)
        let cases: &[(&str, u32, u32, u32, u32, u32, bool)] = &[
            ("* * * * *", 0, 0, 1, 1, 0, true),
            ("30 9 * * *", 30, 9, 12, 8, 3, true),
            ("30 9 * * *", 31, 9, 12, 8, 3, false),
            ("*/15 * * * *", 45, 3, 1, 1, 0, true),
            ("*/15 * * * *", 40, 3, 1, 1, 0, false),
            ("0 9-17 * * *", 0, 12, 1, 1, 0, true),
            ("0 9-17 * * *", 0, 18, 1, 1, 0, false),
            ("0 0 1,15 * *", 0, 0, 15, 6, 2, true),
            ("0 0 1,15 * *", 0, 0, 16, 6, 2, false),
            ("0 0 * * 1-5", 0, 0, 4, 6, 3, true),
            ("0 0 * * 1-5", 0, 0, 4, 6, 0, false),
            // 7 and 0 both mean Sunday.
            ("0 0 * * 7", 0, 0, 4, 6, 0, true),
            ("0 0 * * 0", 0, 0, 4, 6, 7, true),
            ("10-20/5 * * * *", 15, 0, 1, 1, 0, true),
            ("10-20/5 * * * *", 16, 0, 1, 1, 0, false),
            ("0 0 * 12 *", 0, 0, 25, 12, 1, true),
            ("0 0 * 12 *", 0, 0, 25, 11, 1, false),
            // Malformed expressions never match.
            ("* * * *", 0, 0, 1, 1, 0, false),
            ("a b c d e", 0, 0, 1, 1, 0, false),
            ("*/0 * * * *", 0, 0, 1, 1, 0, false),
            ("9-3 * * * *", 5, 0, 1, 1, 0, false),
        ];
        for (expr, minute, hour, dom, month, dow, expected) in cases {
            assert_eq!(
                matches(expr, *minute, *hour, *dom, *month, *dow),
                *expected,
                "{expr} @ {minute} {hour} {dom} {month} {dow}"
            );
        }
    }

    #[test]
    fn civil_from_days_known_dates() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_723), (2024, 1, 1)); // 2024-01-01
        assert_eq!(civil_from_days(20_312), (2025, 8, 12)); // leap-year traversal
    }
}
