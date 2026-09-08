#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
if [[ "${CODETWO_DEV_PROFILE+x}" == x ]]; then
  PROFILE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  if [[ -d /opt/homebrew/opt/zig@0.15/bin ]]; then
    export PATH="/opt/homebrew/opt/zig@0.15/bin:$PATH"
  fi
  exec bun "$PROFILE_ROOT/apps/desktop/scripts/run-profile.ts" "$MODE"
fi
BUNDLE_ID="dev.codetwo.app.dev"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
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

# Inspect only this launcher's tracked owner. This is not a cross-process data-directory lock.
find_existing() {
  EXISTING_PID=""
  if [[ -f "$PID_FILE" ]]; then
    local previous_pid previous_command
    previous_pid="$(<"$PID_FILE")"
    if [[ "$previous_pid" =~ ^[1-9][0-9]*$ ]] && [[ "$previous_pid" -gt 1 ]] && kill -0 "$previous_pid" >/dev/null 2>&1; then
      previous_command="$(ps -p "$previous_pid" -o command= 2>/dev/null || true)"
      if [[ "$previous_command" == "$APP_EXECUTABLE" || "$previous_command" == "$APP_EXECUTABLE "* ]]; then
        EXISTING_PID="$previous_pid"
      fi
    fi
  fi
}

require_stopped() {
  find_existing
  if [[ -n "$EXISTING_PID" ]]; then
    echo "C2 already running (pid: $EXISTING_PID). Use --logs to inspect it or --restart to replace it explicitly." >&2
    exit 1
  fi
}

restart_existing() {
  find_existing
  if [[ -z "$EXISTING_PID" ]]; then return; fi
  kill "$EXISTING_PID"
  for _ in {1..20}; do
    if ! kill -0 "$EXISTING_PID" >/dev/null 2>&1; then return; fi
    sleep 0.1
  done
  echo "C2 process $EXISTING_PID did not exit; refusing to rebuild or start another instance." >&2
  exit 1
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
  require_command bun
  require_command cargo
  require_command zig
  if [[ "$(zig version)" != "0.15.2" ]]; then
    echo "C2 requires Zig 0.15.2; found $(zig version)." >&2
    exit 1
  fi
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

  actual_bundle_id="$(/usr/bin/plutil -extract CFBundleIdentifier raw -- "$APP_BUNDLE/Contents/Info.plist")"
  if [[ "$actual_bundle_id" != "$BUNDLE_ID" ]]; then
    echo "C2-dev.app has bundle identifier $actual_bundle_id; expected $BUNDLE_ID." >&2
    exit 1
  fi

  for privacy_key in NSMicrophoneUsageDescription NSSpeechRecognitionUsageDescription; do
    privacy_value="$(/usr/bin/plutil -extract "$privacy_key" raw -- "$APP_BUNDLE/Contents/Info.plist")"
    if [[ -z "$privacy_value" ]]; then
      echo "C2-dev.app has an empty $privacy_key value." >&2
      exit 1
    fi
  done
}

start_app() {
  mkdir -p "$STATE_DIR"
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
  run|--verify|verify|--debug|debug|--restart|restart)
    if [[ "$MODE" == --restart || "$MODE" == restart ]]; then
      restart_existing
    else
      require_stopped
    fi
    if [[ "$MODE" == --debug || "$MODE" == debug ]]; then
      export RUST_BACKTRACE=1
      export RUST_LOG="${RUST_LOG:-debug}"
    fi
    trap cleanup EXIT INT TERM
    build_app
    start_app
    if [[ "$MODE" == --verify || "$MODE" == verify ]]; then wait_for_app; fi
    wait "$APP_RUNNER_PID"
    ;;
  --logs|logs|--telemetry|telemetry)
    find_existing
    if [[ -z "$EXISTING_PID" ]]; then
      echo "No tracked C2 instance is running. Start it with $0 run first." >&2
      exit 1
    fi
    predicate="processID == $EXISTING_PID"
    if [[ "$MODE" == --telemetry || "$MODE" == telemetry ]]; then
      predicate="$predicate AND subsystem == \"$BUNDLE_ID\""
    fi
    exec /usr/bin/log stream --info --style compact --predicate "$predicate"
    ;;
  *)
    echo "usage: $0 [run|--verify|--debug|--restart|--logs|--telemetry]" >&2
    exit 2
    ;;
esac
