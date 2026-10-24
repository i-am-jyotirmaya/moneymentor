#!/usr/bin/env bash
set -euo pipefail
mkdir -p build
# Xcode must embed simulated entitlements while linking. Re-signing an already
# unsigned executable is insufficient for the simulator's Keychain/launch checks.
if [[ "${1:-}" == prepare ]]; then
  python3 - <<'PY'
import os, pathlib, plistlib
assert os.environ.get('APP_VARIANT') == 'e2e', 'QA simulator preparation only'
paths = list(pathlib.Path('ios').glob('*/*.entitlements'))
assert len(paths) == 1, 'Expected one generated application entitlement file'
path = paths[0]
with path.open('rb') as source:
    entitlements = plistlib.load(source)
identifier = 'NATIVETEST.com.spndrr.app.rn.e2e'
entitlements.update({'application-identifier': identifier, 'keychain-access-groups': [identifier]})
with path.open('wb') as target:
    plistlib.dump(entitlements, target)
PY
  exit 0
fi
native_app="${1:?Pass prepare or the compiled QA simulator app}"
python3 - "$native_app/Info.plist" <<'PY'
import plistlib, sys
with open(sys.argv[1], 'rb') as source:
    info = plistlib.load(source)
assert info['DTPlatformName'] == 'iphonesimulator', 'Simulator builds only'
assert info['CFBundleIdentifier'] == 'com.spndrr.app.rn.e2e', 'QA application only'
PY
codesign --verify "$native_app"
codesign --display --entitlements - "$native_app" > build/simulator-signed-entitlements.plist
