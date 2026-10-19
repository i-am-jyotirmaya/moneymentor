#!/usr/bin/env bash
set -euo pipefail
native_app="${1:?Pass the compiled QA simulator app}"
mkdir -p build
# An unsigned executable has no Keychain access group on current simulators.
# Ad-hoc signing requires no Apple account. Never apply this to a device build.
python3 - "$native_app/Info.plist" build/simulator-entitlements.plist <<'PY'
import plistlib, sys
with open(sys.argv[1], 'rb') as source:
    info = plistlib.load(source)
assert info['DTPlatformName'] == 'iphonesimulator', 'Simulator builds only'
assert info['CFBundleIdentifier'] == 'com.spndrr.app.rn.e2e', 'QA application only'
identifier = 'NATIVETEST.' + info['CFBundleIdentifier']
with open(sys.argv[2], 'wb') as target:
    plistlib.dump({'application-identifier': identifier,
                  'keychain-access-groups': [identifier]}, target)
PY
codesign --force --sign - --entitlements build/simulator-entitlements.plist --generate-entitlement-der "$native_app"
codesign --verify "$native_app"
codesign --display --entitlements - "$native_app" > build/simulator-signed-entitlements.plist
