#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

usage() {
  cat <<EOF
Usage: DEVELOPMENT_TEAM=<team-id> $0 <iPhone-UDID>

Build, install, and launch Spndrr's standalone Release app with Personal Team signing.
Find the iPhone UDID with xcrun devicectl list devices, or set SPNDRR_IOS_DEVICE.
Personal Team builds omit Associated Domains, which passkeys and universal links require.
EOF
}

fail() { echo "$*" >&2; exit 1; }
require() { command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"; }

if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
  usage
  exit 0
fi
[[ $# -le 1 ]] || { usage >&2; exit 2; }
[[ "$(uname -s)" == Darwin ]] || fail "Building for iPhone requires macOS and Xcode."
device_id=${1:-${SPNDRR_IOS_DEVICE:-}}
[[ -n "$device_id" ]] || fail "Connect your iPhone and pass its UDID from xcrun devicectl list devices."
[[ -n "${DEVELOPMENT_TEAM:-}" ]] || fail "Set DEVELOPMENT_TEAM to your Xcode Personal Team ID."
require xcodebuild
require xcrun

workspace=ios/SpndrrDev.xcworkspace
if [[ ! -d "$workspace" || ! -f ios/Podfile ]]; then
  require pnpm
  require pod
  pnpm exec expo prebuild --platform ios --no-install
fi
if ! cmp -s ios/Podfile.lock ios/Pods/Manifest.lock; then
  require pod
  (cd ios && pod install)
fi

artifact_dir="$PWD/dist/local/ios/device-release"
derived_data="$artifact_dir/derived-data"
entitlements="$artifact_dir/PersonalTeam.entitlements"
mkdir -p "$artifact_dir"
plutil -create xml1 "$entitlements"

xcodebuild -workspace "$workspace" -scheme SpndrrDev \
  -configuration Release -sdk iphoneos -destination "id=$device_id" \
  -derivedDataPath "$derived_data" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  "DEVELOPMENT_TEAM=$DEVELOPMENT_TEAM" CODE_SIGN_STYLE=Automatic \
  'CODE_SIGN_IDENTITY=Apple Development' "CODE_SIGN_ENTITLEMENTS=$entitlements" \
  build

app="$derived_data/Build/Products/Release-iphoneos/SpndrrDev.app"
[[ -s "$app/main.jsbundle" ]] || fail "The Release app is missing its embedded JavaScript bundle: $app"
codesign --verify --deep --strict "$app"
bundle_id=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist")
xcrun devicectl device install app --device "$device_id" "$app"
if ! xcrun devicectl device process launch --device "$device_id" --terminate-existing "$bundle_id"; then
  fail "Installed Spndrr. Unlock the iPhone and open Spndrr Dev. If iOS shows Untrusted Developer, trust your signing identity in Settings > General > VPN & Device Management."
fi
echo "Installed and launched Spndrr Release with its embedded JavaScript bundle."
