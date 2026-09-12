# Spndrr deployment runbook

New accounts default to request-only access. Follow [MVP access deployment and approvals](../docs/MVP_ACCESS.md) to migrate, configure the operations email environment, and approve your test users before signup.

This runbook deploys the current Spndrr beta to Railway for a two-user test. It is intentionally conservative: one API replica, one web service, one private managed PostgreSQL service, automatic migrations before API rollout, and optional providers disabled until the core flow is verified.

Use these committed templates while configuring the Railway dashboard:

- [API variables](railway/api.env.example)
- [Web variables](railway/web.env.example)

Do not paste the example values unchanged. Do not commit real secrets.

## Target infrastructure

```text
Internet
  |                         Railway private network
  |-- HTTPS --> web --------------------.
  |             Next.js, 1 instance     |
  |                                     v
  `-- HTTPS --> api ---------------> Postgres
                ASP.NET Core,            one database
                exactly 1 replica        two EF contexts
```

The API image also contains the Operations executable used by its pre-deploy migration. No separate always-running worker or migration service is needed for the initial beta.

### Why one API replica

- Expense, income, and goal clarification drafts are in-memory singleton stores.
- Rate limits are process-local.
- Purge, commitment, judgement, and optional invitation jobs share the API process.

Committed financial records remain in PostgreSQL, but an unfinished clarification is lost on restart. Do not scale the API horizontally until those mechanisms are distributed and worker concurrency has been reviewed.

## Before you start

You need:

- A Railway account and a new or existing project.
- This repository pushed to GitHub with the `ci` workflow passing.
- Permission for Railway's GitHub app to read the repository.
- A monitored support email address.
- Two test email addresses.
- A randomly generated JWT signing key of at least 32 bytes.
- Optional: a verified Resend sender domain and API key.
- Optional: an OpenAI project key plus a separate safety-identifier key.

Generate independent random keys locally and paste them directly into Railway's variable editor:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

The first value can be `Jwt__SigningKey`. Keep the second unused until OpenAI is enabled, then use it for `OPENAI_SAFETY_IDENTIFIER_KEY`. Never reuse either value as a database password.

## Railway setup

Railway's interface changes over time; the durable settings and values below are what matter. Relevant official references are [monorepo deployment](https://docs.railway.com/deployments/monorepo), [Dockerfiles](https://docs.railway.com/builds/dockerfiles), [pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command), and [PostgreSQL](https://docs.railway.com/databases/postgresql).

### 1. Create the project and PostgreSQL

1. Create an empty Railway project for Spndrr.
2. Add Railway's managed PostgreSQL service and name it `Postgres`.
3. Leave PostgreSQL private. Do not add a public TCP domain for normal application access.
4. Confirm the service exposes `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` variables.

If you choose a name other than `Postgres`, update every `${{Postgres.*}}` reference in the API template to match it.

### 2. Create the API and web services

1. Add two empty services named `api` and `web`.
2. Connect both services to this GitHub repository and the `main` branch.
3. Leave each service Root Directory empty/repository-root. The Dockerfiles need files outside their own folders.
4. Configure the Dockerfile paths:

   - API: `/apps/api/MoneyMentor.Api/Dockerfile`
   - Web: `/apps/web/Dockerfile`

   You can set these through Build settings or the `RAILWAY_DOCKERFILE_PATH` variable included in each template.
5. Generate a Railway public domain for each service and record:

   - the full HTTPS web origin, such as `https://<generated-web-host>`;
   - the web hostname only, such as `<generated-web-host>`;
   - the full HTTPS API origin, such as `https://<generated-api-host>`;
   - the API hostname only, such as `<generated-api-host>`.

These are placeholders, not proposed final Spndrr domains. Replace them if/when you attach your chosen custom domains.

### 3. Configure the API

Copy the keys from [railway/api.env.example](railway/api.env.example) into the API service Variables page, then replace every placeholder.

Core runtime values:

```dotenv
RAILWAY_DOCKERFILE_PATH=/apps/api/MoneyMentor.Api/Dockerfile
ASPNETCORE_ENVIRONMENT=Production
PORT=8080
ASPNETCORE_FORWARDEDHEADERS_ENABLED=true
```

Use Railway reference variables to build the Npgsql connection string:

```dotenv
ConnectionStrings__MoneyMentorDb=Host=${{Postgres.PGHOST}};Port=${{Postgres.PGPORT}};Database=${{Postgres.PGDATABASE}};Username=${{Postgres.PGUSER}};Password=${{Postgres.PGPASSWORD}};SSL Mode=Prefer
```

Do not substitute `${{Postgres.DATABASE_URL}}`: it is a `postgresql://` URL, while the current Npgsql configuration expects keyword/value format.

Set auth and origin values:

```dotenv
Jwt__Issuer=Spndrr
Jwt__Audience=Spndrr.Api
Jwt__SigningKey=<generated-secret>
AuthCookie__Secure=true
AuthCookie__SameSite=None
AllowedHosts=<api-hostname>;healthcheck.railway.app
Cors__AllowedOrigins__0=https://<web-hostname>
Product__PublicWebUrl=https://<web-hostname>
Product__SupportEmail=<monitored-support-email>
```

To connect a local frontend directly to the production API, add these API variables:

```dotenv
CORS_ALLOWED_ORIGINS=http://localhost:3000
CORS_ALLOW_LOCALHOST=true
```

`CORS_ALLOWED_ORIGINS` accepts multiple comma-separated origins and is merged with
the indexed `Cors__AllowedOrigins__0`, `Cors__AllowedOrigins__1`, ... values. Keep
the localhost override disabled when it is not actively needed.

Rules that commonly prevent startup:

- `AllowedHosts` contains hostnames only, not `https://` or paths.
- Public CORS origins and `Product__PublicWebUrl` use explicit, non-local HTTPS URLs. Loopback CORS origins are allowed only when `CORS_ALLOW_LOCALHOST=true`.
- Do not add a trailing path to an origin.
- The JWT signing key is at least 32 bytes and not a placeholder.
- Keep `AuthCookie__Secure=true`.
- Generated Railway service domains are treated as cross-site for this deployment, so use `SameSite=None`. Test again before changing it.

Initial optional-capability values:

```dotenv
Resend__DispatcherEnabled=false
Resend__ApiKey=
OPENAI_API_KEY=
OPENAI_SAFETY_IDENTIFIER_KEY=
JudgementReports__SchedulerEnabled=false
JudgementReports__CalculationWorkerEnabled=false
JudgementReports__NarrationWorkerEnabled=false
JudgementReports__MaxNarrationConcurrency=2
```

Deterministic capture, dashboard totals, transaction management, and focused finance questions work with these integrations off.

Configure the API deployment settings:

| Setting | Value |
| --- | --- |
| Pre-deploy command | `dotnet /app/operations/MoneyMentor.Operations.dll migrate` |
| Health-check path | `/health/ready` |
| Health-check timeout | `300` seconds |
| Restart policy | `ON_FAILURE` |
| Maximum restart retries | `10` |
| Replicas | `1` |

The pre-deploy command runs inside the newly built image, on Railway's private network, with the API service variables. A non-zero exit blocks that deployment.

### 4. Configure the web service

Copy [railway/web.env.example](railway/web.env.example) into the web service and replace its placeholders:

```dotenv
RAILWAY_DOCKERFILE_PATH=/apps/web/Dockerfile
PORT=3000
NEXT_PUBLIC_API_BASE_URL=https://<api-hostname>
NEXT_PUBLIC_SUPPORT_EMAIL=<monitored-support-email>
```

`NEXT_PUBLIC_*` values are compiled into browser JavaScript during `docker build`. Set them before the first real build. Any later change requires a web rebuild/redeploy.

Configure web deployment settings:

| Setting | Value |
| --- | --- |
| Health-check path | `/health` |
| Health-check timeout | `300` seconds |
| Restart policy | `ON_FAILURE` |
| Maximum restart retries | `10` |

### 5. Configure watch paths

Watch paths prevent a frontend-only change from rebuilding the API and vice versa.

API watch paths:

```text
/apps/api/**
/MoneyMentor.slnx
/.dockerignore
```

Web watch paths:

```text
/apps/web/**
/.dockerignore
```

The repository intentionally uses dashboard service settings and committed environment examples instead of a `railway.toml`. This avoids depending on Railway's retiring legacy config-as-code path while keeping reviewable configuration guidance in version control.

### 6. Perform the first deployment

1. Recheck both domain cross-references before deploying:

   - API CORS/public URL point to the web HTTPS origin.
   - Web public API URL points to the API HTTPS origin.
   - API `AllowedHosts` contains the API hostname.
2. Deploy the API. Its image builds, the pre-deploy command applies auth and app migrations, and Railway waits for `/health/ready`.
3. Verify:

   ```text
   https://<api-hostname>/health/live
   https://<api-hostname>/health/ready
   ```

4. Deploy the web service and verify:

   ```text
   https://<web-hostname>/health
   https://<web-hostname>/privacy
   ```

5. Open the web app in a private/incognito browser window. Use browser developer tools to confirm API calls go to the deployed API, not localhost.

If the API enters a redirect loop, first verify `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true`. If the web app calls localhost, rebuild the web service after setting `NEXT_PUBLIC_API_BASE_URL`.

## GitHub Actions and Railway autodeploy

The repository's [CI workflow](../.github/workflows/ci.yml) already includes:

- gitleaks secret scanning;
- .NET 10 restore and Release build;
- Application unit tests;
- API integration tests against Testcontainers PostgreSQL;
- web lint, production build, and desktop/mobile Playwright tests;
- API and web production Docker builds;
- concurrency cancellation for obsolete runs and read-only repository permissions.

Set it up as the deployment gate:

1. In GitHub, open Actions and manually run `ci` once.
2. In GitHub Settings, create a `main` branch ruleset and require the `verify`, `container (api)`, and `container (web)` status checks.
3. Keep Railway's GitHub autodeploy enabled for `main` on both services.
4. Enable **Wait for CI** in both Railway service settings.
5. Merge to `main` only when CI is green. Railway then builds and deploys the changed service using its watch paths.

No `RAILWAY_TOKEN`, `RAILWAY_API_TOKEN`, or GitHub deployment secret is needed for this recommended setup. It also avoids two independent systems racing to deploy the same commit.

If you later replace the GitHub integration with a custom workflow, use an environment-scoped Railway project token, store it in a protected GitHub Environment, and invoke Railway's CLI with explicit project/environment/service targets. Do not add that second path while autodeploy remains active. See Railway's [CLI deployment guide](https://docs.railway.com/cli/deploying).

## Two-user smoke test

Do this before giving the second person the URL.

### Owner account

1. Open the web app in a clean browser profile.
2. Sign up with the intended owner email and accept the current privacy policy.
3. Reload the page; confirm the refresh cookie restores the session.
4. Capture `swiggy dinner 540`.
5. Capture `ice cream from zepto`, then answer `180` when asked.
6. Ask `where did I spend most this month?` and compare the answer with Dashboard.
7. Edit the first transaction, move it to trash, undo/restore it, and confirm totals update.

### Grant Premium

Family household creation is Premium-gated. Open an API shell using Railway's shell/SSH command and run:

```bash
dotnet /app/operations/MoneyMentor.Operations.dll entitlement grant --email owner@example.com --operator your-name --reason "Two-user beta demo"
```

Log out and back in if the UI still shows the old entitlement. The operation records the previous/new plan, operator, reason, and timestamp.

### Second user and household

1. Owner creates a family household and invites the exact second-user email as Member or Viewer.
2. When `Resend__DispatcherEnabled=false`, coordinate the invitation outside Spndrr.
3. The second user signs up with that exact email, accepts privacy consent, opens Household, and accepts the pending invitation.
4. Owner records a Household-visible transaction. Verify the second user sees it.
5. Owner records a Private transaction. Verify the second user does not see it.
6. If testing Viewer, verify all mutation controls are disabled and direct writes receive a forbidden response.
7. Test logout/login and page reload for both accounts.
8. Export privacy data from one account and confirm the download works.

### Health and logs

Confirm after the test:

- API `/health/ready` is healthy.
- Web `/health` is healthy.
- API logs contain no repeated HTTPS redirects, database errors, migration warnings, or unhandled exceptions.
- Browser requests contain no secrets in URLs and no CORS/cookie errors.
- Railway still shows exactly one API replica.

## Enabling invitation email

Do this only after the manual flow works:

1. Create/verify a sending domain in Resend.
2. Set `Resend__ApiKey`, `Resend__FromAddress`, and `Resend__ReplyTo` on the API service.
3. Set `Resend__DispatcherEnabled=true`.
4. Redeploy the API. Production startup will reject an enabled dispatcher with missing values.
5. Send a new invitation to a test address and verify delivery, link destination, duplicate protection, and queued/sent/failed status.

Do not put the Resend API key in the web service or any `NEXT_PUBLIC_*` variable.

## OpenAI and judgement reports

OpenAI is optional for this beta. The application deliberately calculates financial values locally. If enabling model-backed narration later:

1. Review [GOAL_PLANNING.md](../GOAL_PLANNING.md), retention settings, account eligibility, and the minimized data contract.
2. Add `OPENAI_API_KEY` and a separately generated `OPENAI_SAFETY_IDENTIFIER_KEY` only to the API.
3. Evaluate the configured model against representative Spndrr inputs.
4. Enable judgement calculation first, verify stored deterministic reports, then enable narration with low concurrency.

The AI goal-planning worker remains disabled in code; adding keys alone will not complete pending goal-planning runs.

## Custom Spndrr domains

Once the final domain is chosen, attach the web and API hostnames in Railway Networking. Do not assume names until DNS is owned and configured. Then update:

- API `AllowedHosts`
- API `Cors__AllowedOrigins__0`
- API `Product__PublicWebUrl`
- web `NEXT_PUBLIC_API_BASE_URL`
- any Resend link/sender-domain setup

Redeploy both services, because the web API URL is a build-time value. If web and API become sibling HTTPS subdomains under the same registrable domain, test `AuthCookie__SameSite=Strict` in a clean browser before tightening it. Keep `Secure=true`.

## Backups and rollback

Railway PostgreSQL is the stateful component. Before a schema-changing production rollout:

1. Confirm the provider's current backup/restore feature for your plan.
2. Record the deployed commit and API/web image/deployment identifiers.
3. Create and verify a database backup.
4. Let the API pre-deploy migration run once.
5. Keep the prior application deployments available during observation.

Do not automatically reverse EF migrations after users have written against a new schema. If the prior application is schema-compatible, redeploy it while retaining the database. Otherwise restore the pre-deploy backup into a new database, validate it, then switch services deliberately.

The generic scripts under `ops/backups` create encrypted `pg_dump` backups with `age` and `rclone` and perform disposable restore verification. They require a separately secured runner, object-store configuration, and database network access; they are not scheduled automatically by Railway in this setup.

## Deployment troubleshooting

| Symptom | Check |
| --- | --- |
| API exits immediately | Look for production validation errors: CORS, public URL, hosts, JWT length, cookie security |
| Migration/pre-deploy fails | PostgreSQL service name/references, Npgsql format, migration logs, DB availability |
| Readiness fails after migration | Database reachability and pending migrations in either EF context |
| HTTPS redirect loop | `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` and Railway proxy path |
| Web calls `localhost:5267` | Set build-time `NEXT_PUBLIC_API_BASE_URL`, then rebuild web |
| CORS error | Use an exact public HTTPS origin in `Cors__AllowedOrigins__0` or `CORS_ALLOWED_ORIGINS`; local HTTP also requires `CORS_ALLOW_LOCALHOST=true` |
| Login succeeds but reload fails | Secure cookie, `SameSite=None`, exact origin, browser third-party-cookie policy |
| Health check returns invalid host | Include `healthcheck.railway.app` in `AllowedHosts` |
| Invitation remains queued | Expected while dispatcher is disabled; use in-app acceptance or configure Resend |
| AI goal plan remains pending | Expected while `GoalPlanningWorker` is disabled |
| Reports page is empty | Initial Railway worker flags are off; dashboard calculations still work |

## Deployment owner checklist

- [ ] CI passes, including both container builds.
- [ ] PostgreSQL has no public endpoint unless temporarily required for an audited operation.
- [ ] API and web source roots remain the repository root.
- [ ] Both Dockerfile paths are correct.
- [ ] All `replace-with-*` placeholders are gone.
- [ ] JWT signing key is unique, random, long enough, and server-only.
- [ ] API connection string uses Railway references and Npgsql format.
- [ ] Pre-deploy migrations and health checks use the exact documented values.
- [ ] API has one replica.
- [ ] Generated domains use `Secure=true` and `SameSite=None` cookies.
- [ ] Web public variables were present during its build.
- [ ] Resend/OpenAI/report workers are disabled unless intentionally configured and tested.
- [ ] Owner Premium grant is audited and limited to the intended test account.
- [ ] Both-user privacy, household visibility, and Viewer tests pass.
- [ ] GitHub branch checks and Railway Wait for CI are enabled.
- [ ] Backup and restore ownership is assigned before irreplaceable data is stored.
