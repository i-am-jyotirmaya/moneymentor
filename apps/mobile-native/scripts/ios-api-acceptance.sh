#!/usr/bin/env bash
set -euo pipefail
[[ "$GITHUB_ACTIONS" == true && "$RUNNER_OS" == macOS && "$APP_VARIANT" == e2e && "$EXPO_PUBLIC_E2E" == 1 ]]
: "${NATIVE_TEST_DEVICE:?A dedicated CI simulator is required}"
native_root="$(git rev-parse --show-toplevel)"
native_work="$(mktemp -d "$RUNNER_TEMP/spndrr-api.XXXXXX")"
native_pg="$(brew --prefix postgresql@17)/bin"
native_evidence="$native_root/apps/mobile-native/runtime-evidence/native-api"
mkdir -p "$native_evidence"
"$native_pg/initdb" -D "$native_work/database" --username=native_acceptance --auth=trust > "$native_evidence/database-setup.log"
"$native_pg/pg_ctl" -D "$native_work/database" -l "$native_work/postgres.log" -o "-h 127.0.0.1 -p 55432 -k '$native_work'" -w start
native_server_pid=''
cleanup() {
  if [[ -n "$native_server_pid" ]]; then kill "$native_server_pid" 2>/dev/null || true; fi
  "$native_pg/pg_ctl" -D "$native_work/database" -m fast -w stop || true
}
trap cleanup EXIT
"$native_pg/createdb" -h 127.0.0.1 -p 55432 -U native_acceptance native_acceptance
export ASPNETCORE_ENVIRONMENT=Testing
export ConnectionStrings__MoneyMentorDb='Host=127.0.0.1;Port=55432;Database=native_acceptance;Username=native_acceptance'
export Registration__Mode=Open
export Jwt__SigningKey=native-acceptance-only-local-signing-key-32-bytes
export AuthCookie__Secure=true
export Product__SupportEmail=support@example.test
export NATIVE_TEST_API_URL=https://localhost:7443
export ASPNETCORE_URLS=https://localhost:7443
export Kestrel__Certificates__Default__Path="$native_work/localhost.pem"
export Kestrel__Certificates__Default__KeyPath="$native_work/localhost.key"
export NODE_EXTRA_CA_CERTS="$native_work/localhost.pem"
"$(brew --prefix openssl@3)/bin/openssl" req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
  -addext subjectAltName=DNS:localhost -addext basicConstraints=critical,CA:TRUE \
  -addext keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign -addext extendedKeyUsage=serverAuth \
  -keyout "$Kestrel__Certificates__Default__KeyPath" -out "$Kestrel__Certificates__Default__Path" 2>/dev/null
# Trust is confined to this disposable simulator. Production binaries retain
# normal platform TLS validation, with no ATS or certificate-verification bypass.
xcrun simctl keychain "$NATIVE_TEST_DEVICE" add-root-cert "$NODE_EXTRA_CA_CERTS"
dotnet build "$native_root/apps/api/MoneyMentor.Api/MoneyMentor.Api.csproj" -c Release --verbosity quiet > "$native_evidence/backend-build.log" 2>&1
dotnet run --project "$native_root/apps/api/MoneyMentor.Operations" -c Release -- migrate > "$native_evidence/migrations.log" 2>&1
dotnet run --project "$native_root/apps/api/MoneyMentor.Api" -c Release --no-build --no-launch-profile > "$native_evidence/server.log" 2>&1 &
native_server_pid=$!
curl --silent --show-error --fail --retry 30 --retry-all-errors --retry-delay 1 --cacert "$NODE_EXTRA_CA_CERTS" "$NATIVE_TEST_API_URL/health/ready" > /dev/null
node "$native_root/apps/mobile-native/scripts/prepare-native-api.mjs"
xcrun simctl terminate "$NATIVE_TEST_DEVICE" com.spndrr.app.rn.e2e 2>/dev/null || true
xcrun simctl openurl "$NATIVE_TEST_DEVICE" 'spndrr-native://qa?api=https%3A%2F%2Flocalhost%3A7443'
"$HOME/.maestro/bin/maestro" --device "$NATIVE_TEST_DEVICE" test .maestro/native-backend.yml
NATIVE_API_ACTION=verify node "$native_root/apps/mobile-native/scripts/prepare-native-api.mjs"
