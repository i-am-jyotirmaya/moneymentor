#!/usr/bin/env bash
set -euo pipefail

# This is the isolated QA application and an ephemeral CI emulator.
native_package=com.spndrr.app.rn.e2e
native_evidence=runtime-evidence/android
mkdir -p "$native_evidence"

# AOSP's keyboard asks for contacts on its first email field. Deny this unrelated
# permission deterministically; the application itself never requests contacts.
adb shell pm revoke com.android.inputmethod.latin android.permission.READ_CONTACTS
adb shell pm set-permission-flags com.android.inputmethod.latin android.permission.READ_CONTACTS user-set user-fixed
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell pm clear "$native_package"

adb shell getprop ro.build.fingerprint > "$native_evidence/device.txt"
adb shell wm size >> "$native_evidence/device.txt"
adb shell wm density >> "$native_evidence/device.txt"
adb shell dumpsys display > "$native_evidence/display.txt"
native_activity="$(adb shell cmd package resolve-activity --brief "$native_package" | tr -d '\r' | tail -1)"
# Activity launch timing is recorded separately from usable-first-interaction.
adb shell am start -W -S -n "$native_activity" > "$native_evidence/activity-start.txt"
adb shell dumpsys gfxinfo "$native_package" reset > /dev/null

native_scenario=transaction
collect_evidence() {
  adb shell dumpsys gfxinfo "$native_package" framestats > "$native_evidence/$native_scenario-frames.txt"
  adb shell dumpsys meminfo "$native_package" > "$native_evidence/$native_scenario-memory.txt"
  node scripts/summarize-frame-stats.mjs "$native_evidence" > "$native_evidence/summary.json"
}
trap collect_evidence EXIT
"$HOME/.maestro/bin/maestro" test .maestro/transaction.yml
collect_evidence
native_scenario=appearance
adb shell dumpsys gfxinfo "$native_package" reset > /dev/null
"$HOME/.maestro/bin/maestro" test .maestro/appearance.yml
collect_evidence
native_scenario=workspace
adb shell dumpsys gfxinfo "$native_package" reset > /dev/null
"$HOME/.maestro/bin/maestro" test .maestro/workspace.yml
collect_evidence
native_scenario=performance
adb shell dumpsys gfxinfo "$native_package" reset > /dev/null
"$HOME/.maestro/bin/maestro" test .maestro/performance.yml
