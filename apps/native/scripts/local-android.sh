#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

usage() {
  echo "Usage: $0 {build|install|run} [emulator|device] [adb-serial]" >&2
  echo "Defaults: emulator (x86_64); device (arm64-v8a)." >&2
  echo "Set SPNDRR_EMULATOR_ARCH=arm64-v8a for an ARM64 emulator." >&2
  echo "Install/run: ANDROID_SERIAL selects a target; SPNDRR_AVD selects an AVD to boot." >&2
  exit 2
}

fail() { echo "$*" >&2; exit 1; }
require() { command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"; }

ACTION=${1:-}
TARGET=${2:-emulator}
SERIAL=${3:-${ANDROID_SERIAL:-}}
[[ $# -le 3 && ( "$ACTION" == build || "$ACTION" == install || "$ACTION" == run ) ]] || usage
case "$TARGET" in
  emulator)
    ARCH=${SPNDRR_EMULATOR_ARCH:-x86_64}
    [[ "$ARCH" == x86_64 || "$ARCH" == arm64-v8a ]] || fail "Unsupported SPNDRR_EMULATOR_ARCH: $ARCH"
    ;;
  device) ARCH=arm64-v8a ;;
  *) usage ;;
esac
[[ "$ACTION" != build || $# -lt 3 ]] || usage

PACKAGE=com.spndrr.app.dev
ARTIFACT_DIR="$PWD/dist/local/android/$TARGET/$ARCH"
APK="$ARTIFACT_DIR/spndrr-debug.apk"

build() {
  require pnpm
  require java
  if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" && ! -f android/local.properties ]]; then
    fail "Set ANDROID_HOME (or ANDROID_SDK_ROOT) to your Android SDK before building."
  fi
  pnpm exec expo prebuild --platform android --no-install
  (
    cd android
    ./gradlew assembleDebug --max-workers=2 "-PreactNativeArchitectures=$ARCH"
  )
  local generated=android/app/build/outputs/apk/debug/app-debug.apk
  [[ -f "$generated" ]] || fail "Gradle did not produce $generated"
  mkdir -p "$ARTIFACT_DIR"
  cp "$generated" "$APK"
  echo "Built $ARCH APK: $APK"
}

get_devices() {
  adb devices | awk -v target="$TARGET" 'NR > 1 && NF >= 2 {
    if (target == "emulator" && $1 ~ /^emulator-/) print $1
    if (target == "device" && $1 !~ /^emulator-/ && $2 == "device") print $1
  }'
}

choose_device() {
  local devices count
  devices=$(get_devices)
  count=$(awk 'NF { n++ } END { print n+0 }' <<< "$devices")
  if [[ -n "$SERIAL" ]]; then
    case "$TARGET:$SERIAL" in
      emulator:emulator-*|device:*) ;;
      *) fail "An emulator target requires an emulator-* serial." ;;
    esac
    if [[ "$TARGET" == device && "$SERIAL" == emulator-* ]]; then
      fail "Use the emulator target for $SERIAL."
    fi
    if ! grep -Fxq -- "$SERIAL" <<< "$devices"; then
      if [[ "$TARGET" == emulator ]] && (( count == 0 )); then
        boot_emulator "${SERIAL#emulator-}"
      else
        fail "Target $SERIAL is not attached/authorized; check adb devices. For Wi-Fi, pair/connect with adb first."
      fi
    fi
    return
  fi
  if (( count > 1 )); then
    fail "Multiple $TARGET targets are attached. Choose an adb serial explicitly: $devices"
  elif (( count == 1 )); then
    SERIAL=$devices
  elif [[ "$TARGET" == emulator ]]; then
    boot_emulator
  else
    fail "No authorized physical Android device. Enable USB debugging or connect a paired Wi-Fi device with adb first."
  fi
}

EMULATOR_PID=
EMULATOR_LOG=
boot_emulator() {
  local avds avd count port sdk_root emulator_bin
  sdk_root=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
  if command -v emulator >/dev/null 2>&1; then
    emulator_bin=$(command -v emulator)
  elif [[ -n "$sdk_root" && -x "$sdk_root/emulator/emulator" ]]; then
    emulator_bin="$sdk_root/emulator/emulator"
  else
    fail "Android emulator command not found. Install the emulator in Android SDK Manager."
  fi
  avds=$("$emulator_bin" -list-avds)
  avd=${SPNDRR_AVD:-}
  if [[ -z "$avd" ]]; then
    count=$(awk 'NF { n++ } END { print n+0 }' <<< "$avds")
    (( count == 1 )) || fail "Choose SPNDRR_AVD from the available AVDs (create a $ARCH AVD if needed): $avds"
    avd=$avds
  fi
  grep -Fxq -- "$avd" <<< "$avds" || fail "AVD not found: $avd"
  port=${1:-${SPNDRR_EMULATOR_PORT:-5554}}
  [[ "$port" =~ ^[0-9]{4}$ ]] || fail "SPNDRR_EMULATOR_PORT must be an even emulator console port (5554–5682)."
  (( 10#$port >= 5554 && 10#$port <= 5682 && 10#$port % 2 == 0 )) || fail "SPNDRR_EMULATOR_PORT must be an even emulator console port (5554–5682)."
  SERIAL="emulator-$port"
  mkdir -p "$ARTIFACT_DIR"
  EMULATOR_LOG="$ARTIFACT_DIR/emulator-$(date -u +%Y%m%dT%H%M%SZ).log"
  echo "Booting $avd as $SERIAL. Log: $EMULATOR_LOG"
  nohup "$emulator_bin" -avd "$avd" -port "$port" >"$EMULATOR_LOG" 2>&1 </dev/null &
  EMULATOR_PID=$!
}

wait_for_boot() {
  local attempt
  for ((attempt=0; attempt<180; attempt++)); do
    if [[ "$(adb -s "$SERIAL" get-state 2>/dev/null || true)" == device ]] &&
      [[ "$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)" == 1 ]]; then
      return
    fi
    if [[ -n "$EMULATOR_PID" ]] && ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
      fail "Emulator exited before boot. See $EMULATOR_LOG"
    fi
    sleep 2
  done
  fail "Timed out waiting for $SERIAL to boot. Check Android Studio and the emulator log, if one was created."
}

install() {
  require adb
  [[ -f "$APK" ]] || fail "No $TARGET APK found at $APK. Run the build command first, or use run."
  choose_device
  wait_for_boot
  local abis
  abis=$(adb -s "$SERIAL" shell getprop ro.product.cpu.abilist | tr -d '\r')
  case ",$abis," in
    *",$ARCH,"*) ;;
    *) fail "Target $SERIAL does not support $ARCH (ABIs: $abis). Choose a compatible target." ;;
  esac
  adb -s "$SERIAL" install -r "$APK"
  # The dev client can reach a separately running Metro through port forwarding.
  if ! adb -s "$SERIAL" reverse tcp:8081 tcp:8081; then
    echo "Could not forward Metro port 8081; use a device-reachable Metro URL." >&2
  fi
  adb -s "$SERIAL" shell am start -n "$PACKAGE/.MainActivity"
  echo "Installed and launched $PACKAGE on $SERIAL. Start Metro separately with pnpm --filter native start."
}

case "$ACTION" in
  build) build ;;
  install) install ;;
  run) build; install ;;
esac
