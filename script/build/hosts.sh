#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_DIR="${CARGO_TARGET_DIR:-$ROOT_DIR/target}"
PROFILE="${1:-release}"

if [[ "$TARGET_DIR" != /* ]]; then
  TARGET_DIR="$ROOT_DIR/$TARGET_DIR"
fi

if [[ "$PROFILE" != "release" && "$PROFILE" != "debug" ]]; then
  echo "usage: $0 [release|debug]" >&2
  exit 2
fi

command -v bun >/dev/null 2>&1 || { echo "missing required command: bun" >&2; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "missing required command: cargo" >&2; exit 1; }

mkdir -p "$TARGET_DIR/$PROFILE"
broker_name="codetwo-tool-broker"
if [[ "${OS:-}" == "Windows_NT" ]]; then
  broker_name="$broker_name.exe"
fi

bun build --compile "$ROOT_DIR/apps/desktop/src/electrobun/toolBrokerRpc.ts" \
  --outfile "$TARGET_DIR/$PROFILE/$broker_name"

cargo_args=(build -p codetwo-tui -p codetwo-server)
if [[ "$PROFILE" == "release" ]]; then
  cargo_args+=(--release)
fi
(
  cd "$ROOT_DIR"
  cargo "${cargo_args[@]}"
)

echo "Rust hosts and $broker_name are ready in $TARGET_DIR/$PROFILE"
