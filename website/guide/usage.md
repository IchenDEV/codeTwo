# Usage tracking

How much have you burned, and when does it free up? codeTwo scans the transcripts your provider CLIs
already write locally and reports **rolling windows** — 5-hour session, week, and month.

Open it from the command palette (**“Usage”**) or by clicking the context meter in the toolbar. There's
a terminal version too:

```sh
cargo run -p codetwo-core --example usage
```

```
  codeTwo usage — 373 transcripts scanned

  5h session  ████████████████████████    —     73.8M   frees up in 42m
              in 59.7M · out 14.1M · cache-read 2502.2M (not counted)
  week        ████████████████████████    —    227.9M   frees up in 5h 6m
  month       ████████████████████████    —    307.9M   frees up in 21d 8h

  claude     307.4M
  codex        5.0M
```

## Where the numbers come from

- Codex — `~/.codex/sessions/**/rollout-*.jsonl`
- Claude Code — `~/.claude/projects/**/*.jsonl`

Entirely local: no API calls and no credentials. A transcript is timestamped by its file
modification time, which is plenty precise for 5h/7d/30d buckets.

## Showing percentages

Windows show raw totals until you tell codeTwo your plan's budget:

```sh
export CODETWO_LIMIT_5H=5000000
export CODETWO_LIMIT_WEEK=30000000
export CODETWO_LIMIT_MONTH=100000000
```

With a limit set, each window shows a percentage and turns amber past 80%.

## How tokens are counted

Two details matter, and getting them wrong produces wildly misleading numbers:

- **Cache reads are excluded from the headline total.** `cache_read_input_tokens` re-counts context
  the model already holds; summing it across a session yields totals in the billions. It's reported
  separately as “cache-read (not counted)”. Cache *writes* do count — they're fresh work.
- **Codex totals are cumulative.** Codex restates a running `total_token_usage` on every line, so
  codeTwo takes the maximum per transcript rather than summing (summing over-counts ~100×). Codex
  also reports cached tokens as a *subset* of input, whereas Claude reports them alongside — both are
  handled.

::: info
Not every transcript records usage. Short or aborted sessions often contain no token fields at all,
so they simply don't contribute. The “transcripts scanned” count tells you how many did.
:::
