//! Context-window accounting — the "how full is the prompt" meter.
//!
//! Providers don't consistently report token usage over ACP, so C2 estimates locally with the
//! usual ~4-chars-per-token heuristic. It's approximate by design: enough to warn you before you
//! blow the window, never presented as exact.

use serde::{Deserialize, Serialize};

/// Default assumed window when a model's real one isn't known.
pub const DEFAULT_CONTEXT_WINDOW: u64 = 200_000;

/// Rough token count for a chunk of text (~4 characters per token).
pub fn estimate_tokens(text: &str) -> u64 {
    let chars = text.chars().count() as u64;
    chars.div_ceil(4)
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ContextUsage {
    pub input_tokens: u64,
    pub context_window: u64,
    /// 0.0–1.0 fraction of the window used.
    pub fraction: f32,
}

impl ContextUsage {
    /// True once the prompt is using most of the window — the UI warns here.
    pub fn is_tight(&self) -> bool {
        self.fraction >= 0.8
    }
}

/// Estimate usage for a compiled prompt against a context window.
pub fn usage(prompt: &str, context_window: u64) -> ContextUsage {
    let window = context_window.max(1);
    let input_tokens = estimate_tokens(prompt);
    ContextUsage {
        input_tokens,
        context_window: window,
        fraction: (input_tokens as f32 / window as f32).min(1.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estimates_tokens_by_chars() {
        assert_eq!(estimate_tokens(""), 0);
        assert_eq!(estimate_tokens("abcd"), 1);
        assert_eq!(estimate_tokens("abcde"), 2); // rounds up
    }

    #[test]
    fn usage_fraction_and_tightness() {
        let u = usage(&"x".repeat(400), 1000); // 100 tokens / 1000
        assert_eq!(u.input_tokens, 100);
        assert_eq!(u.context_window, 1000);
        assert!((u.fraction - 0.1).abs() < 0.001);
        assert!(!u.is_tight());

        let tight = usage(&"x".repeat(4000), 1000); // 1000 tokens / 1000
        assert!(tight.is_tight());
        assert!(tight.fraction <= 1.0, "fraction is clamped");
    }
}
