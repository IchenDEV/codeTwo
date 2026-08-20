#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
BUNDLE_ID="dev.codetwo.app"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/apps/desktop"
case "$(uname -m)" in
  arm64|aarch64) ELECTROBUN_ARCH="arm64" ;;
  x86_64) ELECTROBUN_ARCH="x64" ;;
  *)
    echo "unsupported macOS architecture: $(uname -m)" >&2
    exit 1
    ;;
esac
APP_BUNDLE="$DESKTOP_DIR/build/dev-macos-$ELECTROBUN_ARCH/C2-dev.app"
APP_EXECUTABLE="$APP_BUNDLE/Contents/MacOS/launcher"
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
      previous_command="$(ps -p "$previous_pid" -o command= 2>/dev/null || true)"
      if [[ "$previous_command" == *"$DESKTOP_DIR/build/"*"/Contents/MacOS/launcher"* ]]; then
        kill "$previous_pid" >/dev/null 2>&1 || true
        for _ in {1..20}; do
          kill -0 "$previous_pid" >/dev/null 2>&1 || break
          sleep 0.1
        done
      fi
    fi
    rm -f "$PID_FILE"
  fi
}

cleanup() {
  if [[ -n "$APP_RUNNER_PID" ]]; then
    kill "$APP_RUNNER_PID" >/dev/null 2>&1 || true
    wait "$APP_RUNNER_PID" >/dev/null 2>&1 || true
  fi

  if [[ -f "$PID_FILE" ]] && [[ "$(<"$PID_FILE")" == "$APP_RUNNER_PID" ]]; then
    rm -f "$PID_FILE"
  fi
}

build_app() {
  cd "$DESKTOP_DIR"
  if [[ ! -d node_modules ]]; then
    bun install --frozen-lockfile
  fi

  # Always run from the generated bundle so macOS can attribute microphone and speech-recognition
  # permission prompts to C2 instead of to a loose helper executable.
  bun run build

  if [[ ! -x "$APP_EXECUTABLE" ]]; then
    echo "Electrobun did not create $APP_EXECUTABLE" >&2
    exit 1
  fi

  for privacy_key in NSMicrophoneUsageDescription NSSpeechRecognitionUsageDescription; do
    privacy_value="$(/usr/bin/plutil -extract "$privacy_key" raw -- "$APP_BUNDLE/Contents/Info.plist")"
    if [[ -z "$privacy_value" ]]; then
      echo "C2.app has an empty $privacy_key value." >&2
      exit 1
    fi
  done
}

start_app() {
  "$APP_EXECUTABLE" &
  APP_RUNNER_PID=$!
  echo "$APP_RUNNER_PID" > "$PID_FILE"
}

wait_for_app() {
  for _ in {1..20}; do
    if ! kill -0 "$APP_RUNNER_PID" >/dev/null 2>&1; then
      wait "$APP_RUNNER_PID"
      return $?
    fi
    sleep 0.25
  done

  echo "C2 launched successfully (pid: $APP_RUNNER_PID)."
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
    /usr/bin/log stream --info --style compact --predicate "processID == $APP_RUNNER_PID"
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
