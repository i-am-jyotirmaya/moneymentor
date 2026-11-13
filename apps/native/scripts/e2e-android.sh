#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
DEVICE=${ANDROID_SERIAL:-emulator-5554}
PINNED_MAESTRO_VERSION="2.12.1"
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

if command -v maestro >/dev/null 2>&1; then
  MAESTRO=$(command -v maestro)
elif [[ -x "$HOME/.local/maestro/bin/maestro" ]]; then
  MAESTRO="$HOME/.local/maestro/bin/maestro"
else
  echo "Maestro CLI not found. Install it with the free OSS installer (see README.md)." >&2
  exit 1
fi
MAESTRO_VERSION_OUTPUT=""
FOUND_MAESTRO_VERSION="unknown"
if MAESTRO_VERSION_OUTPUT=$("$MAESTRO" --version 2>/dev/null); then
  FOUND_MAESTRO_VERSION=$(printf '%s\n' "$MAESTRO_VERSION_OUTPUT" | awk 'NF { gsub(/\r/, ""); print $1; exit }')
  FOUND_MAESTRO_VERSION=${FOUND_MAESTRO_VERSION:-unknown}
fi
if [[ "$FOUND_MAESTRO_VERSION" != "$PINNED_MAESTRO_VERSION" ]]; then
  VERSION_MESSAGE="Maestro CLI version $FOUND_MAESTRO_VERSION found; expected $PINNED_MAESTRO_VERSION. Install with: export MAESTRO_VERSION=2.12.1; curl -Ls \"https://get.maestro.mobile.dev\" | bash"
  if [[ "${MAESTRO_ALLOW_VERSION_MISMATCH:-}" == 1 ]]; then
    echo "Warning: $VERSION_MESSAGE" >&2
  else
    echo "Error: $VERSION_MESSAGE" >&2
    exit 1
  fi
fi

# Fall back as a pair, without mixing credentials from different sources.
if [[ -z "${MAESTRO_TEST_EMAIL:-}" && -z "${MAESTRO_TEST_PASSWORD:-}" ]]; then
  export MAESTRO_TEST_EMAIL="${SPNDRR_E2E_EMAIL:-}"
  export MAESTRO_TEST_PASSWORD="${SPNDRR_E2E_PASSWORD:-}"
else
  export MAESTRO_TEST_EMAIL MAESTRO_TEST_PASSWORD
fi
HAS_CREDENTIALS=false
if [[ -n "${MAESTRO_TEST_EMAIL:-}" && -n "${MAESTRO_TEST_PASSWORD:-}" ]]; then
  HAS_CREDENTIALS=true
fi
credential_instructions() {
  echo "Export MAESTRO_TEST_EMAIL and MAESTRO_TEST_PASSWORD (or SPNDRR_E2E_EMAIL and SPNDRR_E2E_PASSWORD) for a throwaway local account." >&2
  echo "Do not use shared/vault accounts or put secrets in the repo or .env." >&2
  echo "To create an account with the local API running, see the README in /workspace/spndrr/tools/local-signup (helper outside this repo)." >&2
}
FLOWS=()
if [[ -z "${FLOW_DIR+x}" ]]; then
  FLOWS=(.maestro/smoke.yaml)
  if [[ "$HAS_CREDENTIALS" == true ]]; then
    FLOWS+=(.maestro/signin.yaml)
  else
    echo "Sign-in flow skipped: throwaway credentials were not supplied." >&2
    credential_instructions
  fi
else
  FLOWS=("$FLOW_DIR")
  if [[ "$HAS_CREDENTIALS" != true ]] && {
    [[ "${FLOW_DIR##*/}" == signin.yaml ]] ||
      { [[ -d "$FLOW_DIR" ]] && [[ -n "$(find "$FLOW_DIR" -type f -name signin.yaml -print -quit)" ]]; }
  }; then
    echo "The selected flow requires throwaway sign-in credentials." >&2
    credential_instructions
    exit 1
  fi
fi

for tool in adb curl node; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Required command not found: $tool" >&2
    exit 1
  fi
done
if [[ "$(adb -s "$DEVICE" get-state 2>/dev/null || true)" != device ]]; then
  echo "Android device $DEVICE is not attached/authorized. Start or attach it first." >&2
  exit 1
fi
if ! adb -s "$DEVICE" shell pm path com.spndrr.app.dev | tr -d '\r' | grep -q '^package:'; then
  echo "com.spndrr.app.dev is not installed on $DEVICE. Build/install the debug APK first; this script does not build it." >&2
  exit 1
fi

RUN_DIR="$PWD/e2e-artifacts/$(date -u +%Y%m%dT%H%M%S%NZ)"
mkdir -p "$RUN_DIR"
METRO_PID=""
cleanup() {
  if [[ -n "$METRO_PID" ]]; then
    # The new process group contains only the Metro instance started below.
    kill -- "-$METRO_PID" 2>/dev/null || true
    wait "$METRO_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

adb -s "$DEVICE" reverse tcp:8081 tcp:8081
# Probe TCP rather than HTTP: an occupied port must never start another Metro.
if ! node -e 'const s = require("net").connect(8081, "127.0.0.1"); s.on("connect", () => { s.destroy(); process.exit(0); }); s.on("error", () => process.exit(1)); s.setTimeout(2000, () => { s.destroy(); process.exit(1); });'; then
  if [[ -z "${EXPO_PUBLIC_API_BASE_URL+x}" && ! -e .env ]]; then
    set -a
    source .env.example
    set +a
    echo "Using non-secret defaults from .env.example; the API need not be running for the smoke flow."
  fi
  # Job control gives this background job its own process group for cleanup.
  set -m
  CI=1 npx expo start --dev-client --port 8081 >"$RUN_DIR/metro.log" 2>&1 &
  METRO_PID=$!
  set +m
fi

METRO_READY=false
for ((attempt = 0; attempt < 120; attempt++)); do
  if [[ "$(curl -fsS --max-time 2 http://localhost:8081/status 2>/dev/null || true)" == 'packager-status:running' ]]; then
    METRO_READY=true
    break
  fi
  if [[ -n "$METRO_PID" ]] && ! kill -0 "$METRO_PID" 2>/dev/null; then
    echo "Metro exited. See $RUN_DIR/metro.log" >&2
    exit 1
  fi
  sleep 1
done
if [[ "$METRO_READY" != true ]]; then
  echo "Metro did not become ready at http://localhost:8081/status. Artifacts: $RUN_DIR" >&2
  exit 1
fi

set +e
"$MAESTRO" --device "$DEVICE" test "${FLOWS[@]}" \
  --test-output-dir "$RUN_DIR" --debug-output "$RUN_DIR/debug" "$@" \
  2>&1 | tee "$RUN_DIR/maestro.log"
MAESTRO_EXIT=${PIPESTATUS[0]}
set -e
if ((MAESTRO_EXIT != 0)); then
  adb -s "$DEVICE" exec-out screencap -p >"$RUN_DIR/failure.png" || true
  adb -s "$DEVICE" logcat -d >"$RUN_DIR/logcat.txt" 2>&1 || true
fi
echo "E2E artifacts: $RUN_DIR"
exit "$MAESTRO_EXIT"
