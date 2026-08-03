//! `codetwo-usage` — print AI usage windows from local provider transcripts (CodexBar-style, in the
//! terminal).
//!
//! ```sh
//! cargo run -p codetwo-core --example usage
//! CODETWO_LIMIT_5H=5000000 cargo run -p codetwo-core --example usage
//! ```

use codetwo_core::usage::{by_source, scan_all, windows, Limits};

fn fmt(n: u64) -> String {
    if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{:.1}k", n as f64 / 1_000.0)
    } else {
        n.to_string()
    }
}

fn fmt_reset(secs: i64) -> String {
    if secs <= 0 {
        return "—".into();
    }
    let (h, m) = (secs / 3600, (secs % 3600) / 60);
    if h >= 24 {
        format!("{}d {}h", h / 24, h % 24)
    } else if h > 0 {
        format!("{h}h {m}m")
    } else {
        format!("{m}m")
    }
}

fn bar(fraction: Option<f32>, filled_when_unknown: bool) -> String {
    let width = 24usize;
    let filled = match fraction {
        Some(f) => ((f * width as f32).round() as usize).min(width),
        None if filled_when_unknown => width,
        None => 0,
    };
    format!("{}{}", "█".repeat(filled), "░".repeat(width - filled))
}

fn main() {
    let records = scan_all();
    let now = codetwo_core::session::now_millis();
    let limits = Limits::from_env();

    println!("\n  Code2 usage — {} transcripts scanned\n", records.len());
    for w in windows(&records, now, &limits) {
        let pct = match w.fraction {
            Some(f) => format!("{:>4.0}%", f * 100.0),
            None => "   —".to_string(),
        };
        println!(
            "  {:<11} {} {}  {:>8}{}   frees up in {}",
            w.label,
            bar(w.fraction, w.total_tokens > 0),
            pct,
            fmt(w.total_tokens),
            match w.limit {
                Some(l) => format!("/{}", fmt(l)),
                None => String::new(),
            },
            fmt_reset(w.resets_in_secs),
        );
        println!(
            "              in {} · out {} · cache-read {} (not counted)",
            fmt(w.input_tokens),
            fmt(w.output_tokens),
            fmt(w.cached_tokens),
        );
    }

    let sources = by_source(&records);
    if !sources.is_empty() {
        println!();
        for (src, total) in sources {
            println!("  {src:<10} {}", fmt(total));
        }
    }
    if limits == Limits::default() {
        println!("\n  (set CODETWO_LIMIT_5H / _WEEK / _MONTH to show percentages)");
    }
    println!();
}
