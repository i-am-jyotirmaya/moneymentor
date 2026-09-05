# Spndrr

Spndrr is an assistant-first personal finance guide. Users can record expenses and income in natural language, ask focused questions about their spending, review deterministic financial summaries, and coordinate household finances without learning an accounting workflow.

This repository still uses the legacy internal names `MoneyMentor.*` for .NET projects, namespaces, database contexts, and some operational identifiers. The user-facing product is **Spndrr**. Renaming the internals is deliberately deferred because it would add migration and deployment risk without changing the product.

> Beta status: the repository is prepared for a small, two-user Railway test. Read the [deployment runbook](deploy/README.md) and complete every item in the [owner checklist](#owner-todos-before-inviting-a-tester) before sharing it.

## What works today

- Email/password signup and login, short-lived JWT access tokens, rotating refresh cookies, session revocation, and login lockout.
- Required privacy consent, JSON data export, soft-deletion and restoration of transactions, and account deletion.
- Natural-language expense and income capture, including follow-up clarification when an amount or configured merchant is missing.
- Browser speech-to-text input where the Web Speech API is available. Audio stays in the browser; the resulting text is submitted to the API.
- A monthly dashboard with income, spending, savings, category totals, recent transactions, and backend-calculated insights.
- Focused finance questions such as the top spending category and category totals for the current or previous month.
- Transaction editing, month filters, pagination, Private/Household visibility, trash, undo, restore, and a 30-day purge process.
- Personal and Premium family households with Owner, Admin, Member, and Viewer roles.
- Goals, contributions, commitments, category catalogs, weekly/monthly judgement reports, and privacy-aware household planning foundations.

Financial amounts and classifications are calculated by trusted backend code using `decimal`. AI is optional and is never the source of truth for totals, authorization, or database writes.

## Beta limitations

- Run exactly **one API replica**. Clarification drafts and rate limits are currently in memory, while background workers share the API process. A restart loses only unfinished clarification conversations, not committed transactions.
- Asynchronous AI goal-plan processing is not enabled yet. Goal CRUD and deterministic contribution calculations work, but AI planning/review runs can remain pending.
- Invitation email delivery is disabled by default. Invitations are stored and can be accepted in-app by a user who signs up with the invited email. Enable Resend only after verifying a sender domain and completing an email smoke test.
- Railway starts judgement report scheduling, calculation, and narration disabled for the first smoke test. Dashboard calculations continue to work. Enable the workers deliberately after the core two-user flow is stable.
- The public privacy policy is a beta draft and requires legal review before a broader launch.
- Category and recurring-commitment APIs exist, while the current web UI primarily lists those records rather than offering the full management experience.
- The workspace mentions a future mobile app, but no `apps/mobile` implementation exists today.

## Architecture

```text
Browser
  |
  v
Next.js web service
  |
  | HTTPS + bearer access token + HttpOnly refresh cookie
  v
ASP.NET Core modular-monolith API
  |-- Api             HTTP, auth boundary, middleware, health
  |-- Application     use cases, parsing, deterministic workflows
  |-- Domain          entities, enums, domain rules
  `-- Infrastructure  EF Core, Identity, PostgreSQL, providers, workers
          |
          v
       PostgreSQL
       |-- auth boundary: MoneyMentorAuthDbContext
       `-- app boundary:  MoneyMentorDbContext (schema `app`)

Operations executable --> migrations, entitlements, report backfills
Optional providers     --> OpenAI, Resend, OTLP collector
```

The initial deployment uses one PostgreSQL database, but authentication and application data have separate EF Core contexts and migration histories. Domain entities reference `UserProfile`, never ASP.NET Identity's `ApplicationUser`.

## Technology

| Area | Current choice |
| --- | --- |
| Web | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| API | ASP.NET Core on .NET 10 |
| Persistence | PostgreSQL, EF Core 10, Npgsql |
| Authentication | ASP.NET Identity, JWT access tokens, rotating refresh cookies |
| Tests | xUnit v3, Testcontainers PostgreSQL, Playwright |
| Build | pnpm 10, Turborepo, Docker multi-stage images, GitHub Actions |
| Beta hosting | Railway: web + API + managed PostgreSQL |
| Optional integrations | OpenAI Responses API, Resend, OpenTelemetry/OTLP |

## Repository handbook

```text
apps/
  api/
    MoneyMentor.Api/              HTTP entry point and API Docker image
    MoneyMentor.Application/      use cases, parsers, DTOs, interfaces
    MoneyMentor.Domain/           entities, enums, rules
    MoneyMentor.Infrastructure/   EF Core, Identity, PostgreSQL, providers
    MoneyMentor.Operations/       migrations and audited operator commands
    MoneyMentor.Application.Tests/
    MoneyMentor.Api.IntegrationTests/
  web/                            Next.js application and Playwright tests
deploy/
  railway/                        copyable Railway variable templates
  compose.production.example.yml generic self-hosted production example
docs/                              calculations and beta operations notes
ops/backups/                       encrypted backup and restore-check scripts
scripts/                           local demo/test-data helpers
```

- [Backend handbook](apps/api/README.md)
- [Frontend handbook](apps/web/README.md)
- [Railway deployment runbook](deploy/README.md)
- [Financial judgement calculations](docs/JUDGEMENT_CALCULATIONS.md)
- [Goal-planning privacy boundary](GOAL_PLANNING.md)
- [External beta operations](docs/EXTERNAL_BETA_OPERATIONS.md)

## Local setup

### Prerequisites

- .NET SDK 10.x
- Node.js 24.x
- pnpm 10.33.0 through Corepack or a direct install
- PostgreSQL; 17.5 is used by the deployment example and integration tests
- Docker for integration tests and production image builds

Check the main tools:

```bash
dotnet --version
node --version
pnpm --version
docker version
```

### 1. Start PostgreSQL

The checked-in development configuration expects database `moneymentor`, user `moneymentoruser`, password `moneymentor`, on port `5432`. One convenient local container is:

```bash
docker run --name spndrr-postgres -e POSTGRES_DB=moneymentor -e POSTGRES_USER=moneymentoruser -e POSTGRES_PASSWORD=moneymentor -p 5432:5432 -v spndrr-postgres-data:/var/lib/postgresql/data -d postgres:17.5-alpine
```

Use an existing PostgreSQL instance instead by setting `ConnectionStrings__MoneyMentorDb` to an Npgsql keyword/value connection string. For example:

```text
Host=localhost;Port=5432;Database=moneymentor;Username=moneymentoruser;Password=change-me
```

### 2. Install dependencies and migrate

From the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
dotnet restore MoneyMentor.slnx
dotnet run --project apps/api/MoneyMentor.Operations/MoneyMentor.Operations.csproj -- migrate
```

The migration command applies both the auth and application migration histories. The API never migrates automatically on startup.

### 3. Run the API and web app

In two terminals from the repository root:

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

Open:

- Web: `http://localhost:3000`
- API: `http://localhost:5267`
- Development OpenAPI document: `http://localhost:5267/openapi/v1.json`
- API readiness: `http://localhost:5267/health/ready`

Use `localhost` consistently in the browser and configuration; mixing it with `127.0.0.1` can change cookie behavior.

The root `.env.example` is a deployment reference and is **not** loaded automatically by .NET or Next.js. Put local public web overrides in the ignored `apps/web/.env.local`; supply API overrides through your shell environment, .NET user-secrets, or an ignored local appsettings file. Never commit a populated environment file.

## Everyday commands

```bash
# Run both workspace development tasks
pnpm dev

# Build everything
pnpm build

# Backend only
dotnet build MoneyMentor.slnx
dotnet test apps/api/MoneyMentor.Application.Tests/MoneyMentor.Application.Tests.csproj
dotnet test apps/api/MoneyMentor.Api.IntegrationTests/MoneyMentor.Api.IntegrationTests.csproj

# Frontend only
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web exec playwright install chromium
pnpm --filter web test:e2e
```

The API integration tests use Testcontainers and therefore need a running Docker daemon. Playwright mocks API routes; it tests the browser application but does not replace a real deployed-stack smoke test.

## Configuration and secrets

ASP.NET Core maps a double underscore to a nested configuration key, so `Jwt__SigningKey` configures `Jwt:SigningKey`. The authoritative Railway templates are:

- [API variables](deploy/railway/api.env.example)
- [Web variables](deploy/railway/web.env.example)

Never expose a server secret through a `NEXT_PUBLIC_*` variable; those values are compiled into browser JavaScript.

### Required API production values

| Variable | Secret? | Purpose |
| --- | --- | --- |
| `ConnectionStrings__MoneyMentorDb` | Yes | Npgsql keyword/value connection string assembled from Railway PostgreSQL references |
| `Jwt__SigningKey` | Yes | Independent random signing key of at least 32 UTF-8 bytes |
| `Jwt__Issuer`, `Jwt__Audience` | No | Token issuer/audience; Railway template uses Spndrr names |
| `AllowedHosts` | No | Actual API hostname plus `healthcheck.railway.app`, separated by `;` |
| `Cors__AllowedOrigins__0` | No | Exact HTTPS web origin, including scheme and no trailing path |
| `CORS_ALLOWED_ORIGINS` | No | Additional exact CORS origins, separated by commas or semicolons |
| `CORS_ALLOW_LOCALHOST` | No | Set to `true` only when a local loopback frontend must call the production API |
| `Product__PublicWebUrl` | No | Exact HTTPS web URL used in links |
| `Product__SupportEmail` | No | User-facing support address |
| `AuthCookie__Secure` | No | Must be `true` in production |
| `AuthCookie__SameSite` | No | `None` for generated cross-site Railway domains; reassess with custom sibling domains |
| `ASPNETCORE_FORWARDEDHEADERS_ENABLED` | No | Must be `true` behind Railway's TLS-terminating proxy |

Production startup intentionally fails for wildcard CORS, localhost CORS without `CORS_ALLOW_LOCALHOST=true`, wildcard hosts, a short JWT key, insecure cookies, or a missing HTTPS public URL/support address.

Generate separate high-entropy values for the JWT key and, if AI is enabled, the OpenAI safety-identifier key:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

PowerShell alternative:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Do not reuse the PostgreSQL password or either generated key for another purpose.

### Optional integrations

- **Resend:** leave `Resend__DispatcherEnabled=false` for the first smoke test. To enable invitations, set it to `true` and provide `Resend__ApiKey`, `Resend__FromAddress`, and `Resend__ReplyTo`. Verify the sender domain first.
- **OpenAI:** deterministic capture, totals, dashboards, and reports work without an API key. `OPENAI_API_KEY`, `OPENAI_SAFETY_IDENTIFIER_KEY`, and `OpenAI__Model` are server-only. Async goal-planning execution is still disabled in code.
- **OpenTelemetry:** set `OTEL_EXPORTER_OTLP_ENDPOINT` only when a protected collector is available. Never attach finance text, tokens, email addresses, or request bodies to telemetry.

## Docker

Both Dockerfiles require the repository root as build context:

```bash
docker build -f apps/api/MoneyMentor.Api/Dockerfile -t spndrr-api:local .
docker build -f apps/web/Dockerfile -t spndrr-web:local --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:5267 --build-arg NEXT_PUBLIC_SUPPORT_EMAIL=support@example.com .
```

The API image includes the Operations executable at `/app/operations`, allowing Railway to run migrations from the exact release image before it starts the API. Both runtime images use non-root users.

## Railway deployment summary

The beta topology is:

```text
Railway project
  |-- Postgres  managed, private networking only
  |-- api       repo root + apps/api/MoneyMentor.Api/Dockerfile, 1 replica
  `-- web       repo root + apps/web/Dockerfile
```

Railway settings are configured in the dashboard rather than a committed `railway.toml`. Follow the complete [Railway runbook](deploy/README.md), including the pre-deploy migration command, health checks, cookie/CORS setup, deployment order, and two-user smoke test.

## GitHub Actions and deployment gating

The committed [CI workflow](.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and manual dispatch. It performs secret scanning, a .NET Release build, unit and PostgreSQL integration tests, frontend lint/build/Playwright tests, and production Docker builds for both services.

Recommended setup:

1. Push the repository to GitHub and run the `ci` workflow once from the Actions tab.
2. In GitHub Settings, create a branch rule/ruleset for `main`, require pull requests if desired, and require the `verify`, `container (api)`, and `container (web)` checks.
3. Connect the same GitHub repository and `main` branch to the Railway `api` and `web` services.
4. Enable Railway's **Wait for CI** option for both services so a failed workflow does not deploy.
5. Keep Railway autodeploy enabled for `main`. The Railway integration performs the deployment after CI passes.

This path needs no Railway token and no GitHub deployment secret. Do not add a second token-based deploy workflow unless you intentionally replace Railway's GitHub integration. If that becomes necessary, prefer an environment-scoped Railway project token stored as a GitHub Environment secret and protect that environment with reviewers.

## First two-user demo

After the first user signs up and accepts the privacy policy, grant that profile Premium access with the audited Operations command. From a Railway API shell:

```bash
dotnet /app/operations/MoneyMentor.Operations.dll entitlement grant --email owner@example.com --operator your-name --reason "Two-user beta demo"
```

Then:

1. The owner creates a family household.
2. The owner invites the second user's exact email as Member or Viewer.
3. With email dispatch disabled, the second user signs up with that email, opens Household, and accepts the pending invitation.
4. Capture one Private transaction and one Household transaction; verify the visibility boundary from both accounts.
5. Edit, delete, undo, and restore a transaction.
6. Ask a supported current/last-month spending question and compare the answer with the dashboard.
7. Verify refresh, logout, login, privacy export, `/health`, and `/health/ready`.

## Owner TODOs before inviting a tester

- [ ] Choose the final Spndrr web and API hostnames; do not leave any `replace-with-*` values.
- [ ] Create the Railway project, managed PostgreSQL, API service, and web service using [deploy/README.md](deploy/README.md).
- [ ] Generate and store a unique JWT signing key. Never commit it.
- [ ] Keep PostgreSQL private and reference its Railway variables from the API service.
- [ ] Configure the API pre-deploy migration command and both health checks exactly as documented.
- [ ] Confirm the web build contains the real API URL and support email.
- [ ] Verify signup, consent, refresh, logout, and a page reload in a clean browser session; these catch cookie/CORS mistakes.
- [ ] Grant Premium only to the intended demo owner through the audited operator command.
- [ ] Decide whether manual in-app invitation acceptance is sufficient. If not, verify a Resend sender domain, add its secrets, enable the dispatcher, and test delivery.
- [ ] Keep OpenAI and judgement narration disabled until core data capture is stable; then add separate keys and evaluate privacy/retention settings before enabling them.
- [ ] Replace the draft privacy policy only after legal review and set a monitored support address.
- [ ] Configure Railway backup/export coverage and perform a restore drill before storing irreplaceable data. The repository scripts require `pg_dump`, `age`, `rclone`, and external object storage.
- [ ] Turn on GitHub branch protection and Railway **Wait for CI**.
- [ ] Monitor Railway logs and spending during the beta; keep the API at one replica.

## Roadmap

The following items are product direction, not promises of shipped behavior:

- Enable and harden durable AI goal-planning runs after representative evaluation and privacy review.
- Complete production invitation-email delivery and operator visibility.
- Expand deterministic finance questions beyond the current category/month patterns.
- Add complete category and recurring-commitment management to the web UI.
- Add richer non-shaming spending-pattern, budget-judge, monthly-review, goal-advisor, and household-finance agent workflows.
- Replace in-memory clarification state and rate limits with distributed mechanisms before scaling API replicas.
- Add richer household privacy controls and, later, optional third-party authentication providers.
- Establish automated encrypted backups, restore verification, alerting, and protected OTLP observability.
- Consider a mobile client after the assistant and data-capture workflows are reliable.

Investment recommendations remain out of scope without explicit product requirements and safety review.

## Troubleshooting

- **API will not start in production:** inspect the first exception. Production validation rejects placeholder/wildcard host settings, non-HTTPS public URLs, non-HTTPS CORS origins except explicitly enabled loopback origins, an insecure cookie, or a short JWT key.
- **`/health/ready` fails:** confirm PostgreSQL references and the pre-deploy migration succeeded. `/health/live` proves only that the process is running.
- **Login works but reload logs the user out:** verify exact CORS origin, `credentials: include`, HTTPS, and `AuthCookie__SameSite=None` for generated Railway domains.
- **Browser calls localhost after deployment:** `NEXT_PUBLIC_API_BASE_URL` was missing during the web build. Set it and redeploy/rebuild the web service.
- **Invitation remains queued:** expected while `Resend__DispatcherEnabled=false`; have the invited address sign up and accept in-app or configure Resend.
- **AI plan stays pending:** the goal-planning worker is not enabled yet. Use deterministic goal data for the demo.
- **Integration tests cannot start PostgreSQL:** start Docker and confirm `docker version` can reach the daemon.
- **Windows build reports locked API DLLs:** stop the running API process before rebuilding.
- **A local API request behaves differently by host:** use `localhost` consistently rather than mixing `localhost` and `127.0.0.1`.

## Financial and privacy posture

Spndrr is a guidance product, not a certified financial adviser. User-facing conclusions should be framed as observations based on tracked data. AI receives minimized aggregates for supported workflows and must not receive authentication secrets, raw transaction text, or identity data. See [GOAL_PLANNING.md](GOAL_PLANNING.md) and [docs/JUDGEMENT_CALCULATIONS.md](docs/JUDGEMENT_CALCULATIONS.md) for the current boundaries.
