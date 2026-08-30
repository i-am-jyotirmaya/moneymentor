# Spndrr external beta operations

Spndrr runs as one modular-monolith API, one Next.js web process, and PostgreSQL. Authentication and application data remain in separate EF Core DbContexts and migration histories, even though the initial beta uses one PostgreSQL database. Internal projects retain their `MoneyMentor.*` names.

For the Railway-specific three-service setup, pre-deploy migration, health checks, and variables, use `deploy/README.md`. This document also covers the generic self-hosted image/Compose path.

## Required production configuration

Copy `.env.example` into the deployment secret store; do not commit a populated `.env`. Production startup rejects:

- missing or non-HTTPS CORS/public web origins;
- wildcard or localhost CORS origins;
- wildcard `AllowedHosts`;
- JWT keys shorter than 32 bytes;
- insecure refresh cookies;
- missing support email;
- missing Resend API key/from/reply-to settings when `Resend:DispatcherEnabled` is true.

Only configure reverse-proxy IPs actually controlled by the deployment. The API trusts forwarded client addresses only from those entries. The initial beta is limited to one API instance; multiple instances require distributed or edge rate limiting and coordinated background-worker leases.

## Build immutable images

Build all images from the repository root and tag them with the commit SHA:

```bash
docker build -f apps/api/MoneyMentor.Api/Dockerfile -t registry.example/spndrr-api:$GIT_SHA .
docker build -f apps/api/MoneyMentor.Operations/Dockerfile -t registry.example/spndrr-operations:$GIT_SHA .
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.spndrr.example \
  --build-arg NEXT_PUBLIC_SUPPORT_EMAIL=support@spndrr.example \
  -t registry.example/spndrr-web:$GIT_SHA .
```

Runtime images run as non-root users. The API never applies migrations on startup.

## Migration and deployment sequence

1. Record the current API/web/operations image tags.
2. Run `sh ops/backups/backup.sh` and verify the encrypted object exists remotely.
3. Run the new operations image exactly once with the `migrate` command.
4. Deploy the new API image.
5. Wait for `/health/ready` to pass; `/health/live` only proves the process is running.
6. Deploy the web image.
7. Smoke-test signup/login, privacy consent, refresh/logout, personal household reads, family invitation acceptance, Viewer denial, capture/delete/undo, export, and support links.
8. Keep the previous images available until the beta observation window ends.

The two generated migrations are:

```powershell
dotnet ef migrations add HardenAuthSessions --context MoneyMentorAuthDbContext --project apps/api/MoneyMentor.Infrastructure --startup-project apps/api/MoneyMentor.Api --output-dir Migrations
dotnet ef migrations add ExternalBetaReadiness --context MoneyMentorDbContext --project apps/api/MoneyMentor.Infrastructure --startup-project apps/api/MoneyMentor.Api --output-dir Migrations/MoneyMentorDb
```

Apply both through the operations image or locally with:

```powershell
dotnet run --project apps/api/MoneyMentor.Operations -- migrate
```

In a local source checkout, the Operations command falls back to the connection
string in `apps/api/MoneyMentor.Api/appsettings.Development.json`. Deployment and
standalone migration jobs must provide `ConnectionStrings__MoneyMentorDb`; an
environment-provided value always takes precedence over the local fallback.

The auth migration intentionally invalidates legacy refresh tokens, so existing users sign in again. Existing invitation rows become historical `Unknown` delivery records. Existing Premium values are preserved.

## Rollback

Do not automatically roll back database migrations after writes have reached the new schema. Stop the rollout, retain the new database, and redeploy the prior API/web images only when they remain schema-compatible. Otherwise restore the pre-deploy backup into a new database, point the prior images at it, validate readiness and auth, then switch traffic. Record the incident timeline and affected commit/image/database identifiers.

## Premium operations

The web and public settings API cannot mutate plans. Use the one-shot audited command:

```powershell
dotnet run --project apps/api/MoneyMentor.Operations -- entitlement grant --email person@example.com --operator operator@example.com --reason "External beta access"
dotnet run --project apps/api/MoneyMentor.Operations -- entitlement revoke --email person@example.com --operator operator@example.com --reason "Beta access ended"
```

Every actual change writes an `entitlement_changes` row in the same application transaction.

## Invitation delivery

Invitation email is optional for the initial two-user smoke test. With `Resend:DispatcherEnabled` false, invitations are persisted but no email worker runs; the invited user can sign up with the exact invited address and accept in-app.

To enable delivery, verify a sender domain in Resend, configure its API key, from address, reply-to address, and public web URL as deployment secrets, then set `Resend:DispatcherEnabled` to true. The dispatcher uses a delivery GUID as its idempotency key, sends outside the claim transaction, and retries failures with bounded backoff. Owners/Admins can inspect queued, sent, and failed history.

## Backups and restore drills

Run `sh ops/backups/backup.sh` daily in a restricted job image containing PostgreSQL client tools, `age`, and `rclone`. It creates a custom-format `pg_dump`, encrypts it before upload, and deletes remote objects older than 14 days. Keep the age private identity outside the database host and backup bucket.

Run `sh ops/backups/restore-verify.sh` weekly with `DATABASE_SERVER_URL` set to a PostgreSQL server URL without a database path. It downloads the latest encrypted backup, restores it into a uniquely named disposable database, verifies migration history, and drops the database. Alert on any non-zero exit.

Example UTC schedules for a dedicated backup runner:

```cron
15 02 * * * cd /srv/moneymentor && sh ops/backups/backup.sh
30 03 * * 0 cd /srv/moneymentor && sh ops/backups/restore-verify.sh
```

## Telemetry and privacy

Send OTLP over a protected endpoint. API, runtime, outbound HTTP, authentication/session, invitation, rate-limit, provisioning, and transaction lifecycle signals must contain identifiers/statuses only—never tokens, email addresses, assistant/finance text, request bodies, passwords, or exported data. Health routes are excluded from request tracing noise.

The repo-hosted `/privacy` page is deliberately marked for legal review. Replace draft language only after product/legal approval, and keep `Product:SupportEmail` plus `NEXT_PUBLIC_SUPPORT_EMAIL` current.
