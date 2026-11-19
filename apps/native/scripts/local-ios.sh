#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

usage() {
  echo "Usage: $0 {build|install|run} [simulator|device] [device-id]" >&2
  echo "Defaults: simulator; select a simulator with SPNDRR_IOS_SIMULATOR or a physical device with SPNDRR_IOS_DEVICE." >&2
  exit 2
}

fail() { echo "$*" >&2; exit 1; }
require() { command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"; }

ACTION=${1:-}
TARGET=${2:-simulator}
[[ $# -le 3 && ( "$ACTION" == build || "$ACTION" == install || "$ACTION" == run ) ]] || usage
case "$TARGET" in
  simulator) SDK=iphonesimulator; DESTINATION='generic/platform=iOS Simulator'; DEVICE_ID=${3:-${SPNDRR_IOS_SIMULATOR:-}} ;;
  device) SDK=iphoneos; DESTINATION='generic/platform=iOS'; DEVICE_ID=${3:-${SPNDRR_IOS_DEVICE:-}} ;;
  *) usage ;;
esac
[[ "$ACTION" != build || $# -lt 3 ]] || usage
[[ "$(uname -s)" == Darwin ]] || fail "Local iOS build/install is supported only on macOS with Xcode."
if [[ "$ACTION" != build && "$TARGET" == device && -z "$DEVICE_ID" ]]; then
  fail "Choose a connected iOS device via SPNDRR_IOS_DEVICE (xcrun devicectl list devices)."
fi

PACKAGE=com.spndrr.app.dev
ARTIFACT_DIR="$PWD/dist/local/ios/$TARGET"
DERIVED_DATA="$ARTIFACT_DIR/derived-data"
PRODUCTS="$DERIVED_DATA/Build/Products/Debug-$SDK"

find_app() {
  local app identifier match=
  for app in "$PRODUCTS"/*.app; do
    [[ -d "$app" ]] || continue
    identifier=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist" 2>/dev/null || true)
    [[ "$identifier" == "$PACKAGE" ]] || continue
    [[ -z "$match" ]] || fail "Multiple matching .app products in $PRODUCTS. Remove stale build products and rebuild."
    match=$app
  done
  [[ -n "$match" ]] || fail "No $PACKAGE .app found in $PRODUCTS. Build first, or use run."
  printf '%s\n' "$match"
}

build() {
  require pnpm
  require xcodebuild
  require pod
  local workspace scheme app
  local -a signing_options=()
  if [[ "$TARGET" == simulator ]]; then
    signing_options=(CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO)
  else
    [[ -n "${DEVELOPMENT_TEAM:-}" ]] || fail "Set DEVELOPMENT_TEAM to your Apple development team ID. Install your signing certificate/profile in Xcode first."
    signing_options=("DEVELOPMENT_TEAM=$DEVELOPMENT_TEAM")
    if [[ -n "${PROVISIONING_PROFILE_SPECIFIER:-}" ]]; then
      signing_options+=(CODE_SIGN_STYLE=Manual "PROVISIONING_PROFILE_SPECIFIER=$PROVISIONING_PROFILE_SPECIFIER")
    else
      signing_options+=(CODE_SIGN_STYLE=Automatic)
    fi
    if [[ -n "${CODE_SIGN_IDENTITY:-}" ]]; then
      signing_options+=("CODE_SIGN_IDENTITY=$CODE_SIGN_IDENTITY")
    fi
    if [[ "${SPNDRR_IOS_ALLOW_PROVISIONING_UPDATES:-}" == 1 ]]; then
      signing_options+=(-allowProvisioningUpdates)
    fi
  fi
  pnpm exec expo prebuild --platform ios --no-install
  (cd ios && pod install)
  workspace=${SPNDRR_IOS_WORKSPACE:-}
  if [[ -z "$workspace" ]]; then
    local -a workspaces=(ios/*.xcworkspace)
    [[ ${#workspaces[@]} -eq 1 && -d "${workspaces[0]}" ]] || fail "Choose the generated iOS workspace with SPNDRR_IOS_WORKSPACE."
    workspace=${workspaces[0]}
  fi
  [[ -d "$workspace" ]] || fail "Workspace not found: $workspace"
  scheme=${SPNDRR_IOS_SCHEME:-$(basename "$workspace" .xcworkspace)}
  mkdir -p "$ARTIFACT_DIR"
  xcodebuild -workspace "$workspace" -scheme "$scheme" \
    -configuration Debug -sdk "$SDK" -destination "$DESTINATION" \
    -derivedDataPath "$DERIVED_DATA" "${signing_options[@]}" build
  app=$(find_app)
  echo "Built iOS $TARGET: $app"
}

simulator_ids() {
  xcrun simctl list devices "$1" -j | node -e '
    const fs = require("fs");
    const { devices } = JSON.parse(fs.readFileSync(0, "utf8"));
    for (const [runtime, group] of Object.entries(devices)) {
      if (!runtime.startsWith("com.apple.CoreSimulator.SimRuntime.iOS-")) continue;
      for (const device of group) {
        if (device.isAvailable) console.log(device.udid);
      }
    }'
}

select_simulator() {
  require node
  local available booted count
  available=$(simulator_ids available)
  booted=$(simulator_ids booted)
  if [[ -z "$DEVICE_ID" ]]; then
    count=$(awk 'NF { n++ } END { print n+0 }' <<< "$booted")
    if (( count == 1 )); then
      DEVICE_ID=$booted
    elif (( count > 1 )); then
      fail "Multiple simulators are booted. Choose a UDID via SPNDRR_IOS_SIMULATOR (xcrun simctl list devices)."
    elif [[ $(awk 'NF { n++ } END { print n+0 }' <<< "$available") == 1 ]]; then
      DEVICE_ID=$available
    else
      fail "Choose an available iOS simulator UDID via SPNDRR_IOS_SIMULATOR (xcrun simctl list devices available)."
    fi
  fi
  grep -Fxq -- "$DEVICE_ID" <<< "$available" || fail "Simulator $DEVICE_ID is not available. Check xcrun simctl list devices available."
  if ! grep -Fxq -- "$DEVICE_ID" <<< "$booted"; then
    xcrun simctl boot "$DEVICE_ID"
  fi
  xcrun simctl bootstatus "$DEVICE_ID" -b
}

install() {
  require xcrun
  local app
  app=$(find_app)
  if [[ "$TARGET" == simulator ]]; then
    select_simulator
    xcrun simctl install "$DEVICE_ID" "$app"
    xcrun simctl launch "$DEVICE_ID" "$PACKAGE"
  else
    xcrun devicectl device install app --device "$DEVICE_ID" "$app"
    xcrun devicectl device process launch --device "$DEVICE_ID" "$PACKAGE"
  fi
  echo "Installed and launched $PACKAGE on $DEVICE_ID. Start Metro separately with pnpm --filter native start."
}

case "$ACTION" in
  build) build ;;
  install) install ;;
  run) build; install ;;
esac
