//! R11 voice → structured brief: distribute a dictated transcript across a scene brief's slots.
//!
//! Heuristic v1 — deliberately model-free so it is instant, offline, and deterministic. The
//! transcript is split into sentences; each sentence is scored against every slot by keyword
//! affinity (tokens drawn from the slot's id/label, plus a small bilingual cue vocabulary for
//! goal/acceptance/context/constraint-shaped slots). Unmatched sentences fall to the first slot
//! so no words are ever dropped; when nothing matches at all, the first slot receives the whole
//! transcript verbatim. The frontend treats an empty map as failure and inserts the raw text.

use std::collections::HashMap;

use crate::skill::SlotDef;

/// (slot-identity keywords, sentence cue words): a slot whose id/label contains an identity
/// keyword attracts sentences containing the matching cue words.
const CATEGORIES: &[(&[&str], &[&str])] = &[
    (
        &["goal", "objective", "target", "outcome", "目标", "目的"],
        &[
            "goal", "want", "need", "should build", "objective", "aim", "目标", "希望", "需要",
            "想要", "打算", "实现",
        ],
    ),
    (
        &["acceptance", "criteria", "done", "verify", "验收", "标准"],
        &[
            "acceptance", "must", "should", "verify", "criteria", "pass", "done when", "验收",
            "必须", "应该", "标准", "通过", "完成时",
        ],
    ),
    (
        &["context", "background", "背景", "上下文", "现状"],
        &[
            "context", "background", "currently", "today", "so far", "背景", "目前", "现在",
            "已有", "现状",
        ],
    ),
    (
        &["constraint", "limit", "scope", "约束", "限制", "范围"],
        &[
            "constraint", "avoid", "don't", "do not", "must not", "only", "limit", "约束",
            "限制", "不要", "避免", "禁止", "仅",
        ],
    ),
];

/// Sentence terminators for both scripts; newlines also break sentences (dictated pauses).
fn split_sentences(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        match ch {
            '。' | '！' | '？' | '；' | '.' | '!' | '?' | ';' | '\n' => {
                if ch != '\n' {
                    current.push(ch);
                }
                let trimmed = current.trim();
                if !trimmed.is_empty() {
                    out.push(trimmed.to_string());
                }
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    let trimmed = current.trim();
    if !trimmed.is_empty() {
        out.push(trimmed.to_string());
    }
    out
}

/// Lowercased tokens from a slot's id and label — the slot's own words are its strongest cue.
/// ASCII runs split on non-alphanumerics; CJK labels contribute the whole run (e.g. "目标").
fn slot_tokens(slot: &SlotDef) -> Vec<String> {
    let mut tokens = Vec::new();
    for source in [&slot.id, &slot.label] {
        for raw in source
            .to_lowercase()
            .split(|c: char| !c.is_alphanumeric())
            .filter(|s| !s.is_empty())
        {
            // Single ASCII letters ("a", "x") match everything; keep them out.
            if raw.chars().count() >= 2 || raw.chars().any(|c| !c.is_ascii()) {
                tokens.push(raw.to_string());
            }
        }
    }
    tokens.dedup();
    tokens
}

/// Cue words a slot attracts beyond its own tokens, from the category table.
fn slot_cues(slot: &SlotDef) -> Vec<&'static str> {
    let identity = format!("{} {}", slot.id, slot.label).to_lowercase();
    let mut cues = Vec::new();
    for (idents, category_cues) in CATEGORIES {
        if idents.iter().any(|k| identity.contains(k)) {
            cues.extend_from_slice(category_cues);
        }
    }
    cues
}

/// Distribute `transcript` across `slots`. Keys are slot ids; only slots that received text are
/// present. Empty transcript or no slots → empty map (the caller degrades to a raw-text insert).
pub fn structure_brief_heuristic(transcript: &str, slots: &[SlotDef]) -> HashMap<String, String> {
    let mut out: HashMap<String, String> = HashMap::new();
    let text = transcript.trim();
    let Some(first) = slots.first() else {
        return out;
    };
    if text.is_empty() {
        return out;
    }

    let tokens: Vec<Vec<String>> = slots.iter().map(slot_tokens).collect();
    let cues: Vec<Vec<&str>> = slots.iter().map(slot_cues).collect();

    let mut assigned: Vec<(usize, String)> = Vec::new();
    let mut any_hit = false;
    for sentence in split_sentences(text) {
        let lower = sentence.to_lowercase();
        // Own tokens outweigh category cues so "acceptance: ..." beats a stray "must".
        let (best, score) = slots
            .iter()
            .enumerate()
            .map(|(i, _)| {
                let direct = tokens[i].iter().filter(|t| lower.contains(t.as_str())).count();
                let cued = cues[i].iter().filter(|c| lower.contains(**c)).count();
                (i, 2 * direct + cued)
            })
            .max_by(|a, b| a.1.cmp(&b.1).then(b.0.cmp(&a.0))) // ties → earliest slot
            .unwrap_or((0, 0));
        if score > 0 {
            any_hit = true;
            assigned.push((best, sentence));
        } else {
            // Catch-all: words that match nothing still land somewhere visible.
            assigned.push((0, sentence));
        }
    }

    if !any_hit {
        // No keyword matched anywhere — hand the untouched transcript to the first slot.
        out.insert(first.id.clone(), text.to_string());
        return out;
    }

    for (index, sentence) in assigned {
        let entry = out.entry(slots[index].id.clone()).or_default();
        if !entry.is_empty() {
            entry.push(' ');
        }
        entry.push_str(&sentence);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn slot(id: &str, label: &str) -> SlotDef {
        SlotDef {
            id: id.into(),
            label: label.into(),
            ..SlotDef::text(id)
        }
    }

    #[test]
    fn keyword_hits_route_sentences_to_matching_slots() {
        let slots = vec![slot("goal", "Goal"), slot("acceptance", "Acceptance criteria")];
        let out = structure_brief_heuristic(
            "I want a login page with phone sign-in. It must pass the mobile safari tests.",
            &slots,
        );
        assert_eq!(out["goal"], "I want a login page with phone sign-in.");
        assert_eq!(out["acceptance"], "It must pass the mobile safari tests.");
    }

    #[test]
    fn chinese_cues_route_to_labelled_slots() {
        let slots = vec![slot("goal", "目标"), slot("acceptance", "验收标准")];
        let out = structure_brief_heuristic("我需要一个登录页面。验收标准是必须支持手机号。", &slots);
        assert_eq!(out["goal"], "我需要一个登录页面。");
        assert_eq!(out["acceptance"], "验收标准是必须支持手机号。");
    }

    #[test]
    fn no_hit_falls_back_to_full_transcript_in_first_slot() {
        let slots = vec![slot("alpha", "Alpha"), slot("beta", "Beta")];
        let out = structure_brief_heuristic("just some words with no cues at all", &slots);
        assert_eq!(out.len(), 1);
        assert_eq!(out["alpha"], "just some words with no cues at all");
    }

    #[test]
    fn unmatched_sentences_land_in_first_slot_alongside_matches() {
        let slots = vec![slot("summary", "Summary"), slot("acceptance", "Acceptance")];
        let out = structure_brief_heuristic(
            "Rework the dictation button. Acceptance is a green pipeline.",
            &slots,
        );
        assert_eq!(out["summary"], "Rework the dictation button.");
        assert_eq!(out["acceptance"], "Acceptance is a green pipeline.");
    }

    #[test]
    fn empty_transcript_and_empty_slots_yield_empty_maps() {
        let slots = vec![slot("goal", "Goal")];
        assert!(structure_brief_heuristic("   ", &slots).is_empty());
        assert!(structure_brief_heuristic("anything", &[]).is_empty());
    }
}
