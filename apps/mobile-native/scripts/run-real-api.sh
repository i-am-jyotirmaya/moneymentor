#!/usr/bin/env bash
set -euo pipefail
native_root="$(git rev-parse --show-toplevel)"
native_evidence="$native_root/apps/mobile-native/runtime-evidence/api"
mkdir -p "$native_evidence"
export Kestrel__Certificates__Default__Path="$native_evidence/localhost.pem"
export Kestrel__Certificates__Default__KeyPath="$native_evidence/localhost.key"
export NODE_EXTRA_CA_CERTS="$native_evidence/localhost.pem"
export NATIVE_TEST_API_URL=https://localhost:7443
export ASPNETCORE_URLS=https://localhost:7443
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
  -addext subjectAltName=DNS:localhost \
  -keyout "$Kestrel__Certificates__Default__KeyPath" -out "$Kestrel__Certificates__Default__Path" 2>/dev/null

dotnet build "$native_root/apps/api/MoneyMentor.Api/MoneyMentor.Api.csproj" -c Release --verbosity quiet
dotnet run --project "$native_root/apps/api/MoneyMentor.Operations" -c Release -- migrate
dotnet run --project "$native_root/apps/api/MoneyMentor.Api" -c Release --no-build --no-launch-profile > "$native_evidence/server.log" 2>&1 &
native_server_pid=$!
cleanup() { kill "$native_server_pid" 2>/dev/null || true; }
trap cleanup EXIT
curl --silent --show-error --fail --retry 30 --retry-all-errors --retry-delay 1 \
  --cacert "$NODE_EXTRA_CA_CERTS" "$NATIVE_TEST_API_URL/health/ready" > /dev/null
node "$native_root/apps/mobile-native/scripts/real-api-acceptance.mjs"
