#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_PROCESS="codetwo-desktop"
BUNDLE_ID="dev.codetwo.app"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/apps/desktop"
APP_BUNDLE="$ROOT_DIR/target/debug/bundle/macos/C2.app"
STATE_DIR="$ROOT_DIR/.codex/run"
PID_FILE="$STATE_DIR/codetwo-dev.pid"
APP_RUNNER_PID=""

mkdir -p "$STATE_DIR"

# Homebrew keeps versioned Zig formulae keg-only. Keep the project requirement
# local to this launcher rather than modifying the user's global shell setup.
if [[ -d /opt/homebrew/opt/zig@0.15/bin ]]; then
  export PATH="/opt/homebrew/opt/zig@0.15/bin:$PATH"
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

require_command bun
require_command cargo
require_command zig

if [[ "$(zig version)" != "0.15.2" ]]; then
  echo "C2 requires Zig 0.15.2; found $(zig version)." >&2
  exit 1
fi

stop_existing() {
  if [[ -f "$PID_FILE" ]]; then
    previous_pid="$(<"$PID_FILE")"
    if [[ "$previous_pid" =~ ^[0-9]+$ ]] && kill -0 "$previous_pid" >/dev/null 2>&1; then
      kill "$previous_pid" >/dev/null 2>&1 || true
      for _ in {1..20}; do
        kill -0 "$previous_pid" >/dev/null 2>&1 || break
        sleep 0.1
      done
    fi
    rm -f "$PID_FILE"
  fi

  pkill -x "$APP_PROCESS" >/dev/null 2>&1 || true
}

cleanup() {
  if [[ -n "$APP_RUNNER_PID" ]]; then
    kill "$APP_RUNNER_PID" >/dev/null 2>&1 || true
    wait "$APP_RUNNER_PID" >/dev/null 2>&1 || true
  fi
  pkill -x "$APP_PROCESS" >/dev/null 2>&1 || true

  if [[ -f "$PID_FILE" ]] && [[ "$(<"$PID_FILE")" == "$$" ]]; then
    rm -f "$PID_FILE"
  fi
}

build_app() {
  cd "$DESKTOP_DIR"
  if [[ ! -d node_modules ]]; then
    bun install --frozen-lockfile
  fi

  # A raw `tauri dev` executable has an unbound Info.plist. macOS TCC therefore aborts when
  # speech recognition asks for permission. Building the debug .app binds the privacy strings to
  # the process while preserving debug symbols and fast incremental Rust builds.
  bun run tauri build --debug --bundles app

  for privacy_key in NSMicrophoneUsageDescription NSSpeechRecognitionUsageDescription; do
    privacy_value="$(/usr/bin/plutil -extract "$privacy_key" raw -- "$APP_BUNDLE/Contents/Info.plist")"
    if [[ -z "$privacy_value" ]]; then
      echo "C2.app has an empty $privacy_key value." >&2
      exit 1
    fi
  done

  # Tauri's debug bundler leaves an ad-hoc linker signature whose Info.plist is not bound and does
  # not carry the audio-input entitlement. Re-sign the finished bundle so TCC evaluates exactly the
  # privacy metadata above instead of terminating the process.
  /usr/bin/codesign \
    --force \
    --deep \
    --sign - \
    --entitlements "$DESKTOP_DIR/src-tauri/Entitlements.plist" \
    "$APP_BUNDLE"
  /usr/bin/codesign --verify --deep --strict "$APP_BUNDLE"
}

start_app() {
  echo "$$" > "$PID_FILE"
  /usr/bin/open -W -n "$APP_BUNDLE" &
  APP_RUNNER_PID=$!
}

wait_for_app() {
  for _ in {1..240}; do
    if pgrep -x "$APP_PROCESS" >/dev/null 2>&1; then
      echo "C2 launched successfully (process: $APP_PROCESS)."
      return 0
    fi

    if ! kill -0 "$APP_RUNNER_PID" >/dev/null 2>&1; then
      wait "$APP_RUNNER_PID"
      return $?
    fi

    sleep 0.5
  done

  echo "C2 did not launch within 120 seconds." >&2
  return 1
}

case "$MODE" in
  run)
    stop_existing
    trap cleanup EXIT INT TERM
    build_app
    start_app
    wait "$APP_RUNNER_PID"
    ;;
  --verify|verify)
    stop_existing
    trap cleanup EXIT INT TERM
    build_app
    start_app
    wait_for_app
    wait "$APP_RUNNER_PID"
    ;;
  --debug|debug)
    stop_existing
    export RUST_BACKTRACE=1
    export RUST_LOG="${RUST_LOG:-debug}"
    trap cleanup EXIT INT TERM
    build_app
    start_app
    wait "$APP_RUNNER_PID"
    ;;
  --logs|logs)
    stop_existing
    trap cleanup EXIT INT TERM
    build_app
    start_app
    wait_for_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_PROCESS\""
    ;;
  --telemetry|telemetry)
    stop_existing
    trap cleanup EXIT INT TERM
    build_app
    start_app
    wait_for_app
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\""
    ;;
  *)
    echo "usage: $0 [run|--verify|--debug|--logs|--telemetry]" >&2
    exit 2
    ;;
esac
