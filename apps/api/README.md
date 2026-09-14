# Spndrr backend

The Spndrr backend is a .NET 10 modular monolith. The solution and internal projects retain the `MoneyMentor.*` name; Spndrr is the public product name.

For end-to-end setup start with the [root README](../../README.md). For production, use the [AWS / EC2 deployment runbook](../../deploy/aws/README.md).

## Projects and dependency direction

| Project | Responsibility |
| --- | --- |
| `MoneyMentor.Api` | Minimal API endpoints, authentication, validation, CORS, rate limits, health, dependency wiring |
| `MoneyMentor.Application` | Use cases, orchestration, DTOs, interfaces, parsing, deterministic calculations |
| `MoneyMentor.Domain` | Persistence-friendly entities, enums, and domain rules; no infrastructure dependency |
| `MoneyMentor.Infrastructure` | EF Core/Npgsql, Identity, repositories, provider clients, background workers |
| `MoneyMentor.Operations` | One-shot migrations, audited entitlement changes, judgement-report backfills |
| `MoneyMentor.Application.Tests` | Unit tests for parsing, calculations, policies, and workflows |
| `MoneyMentor.Api.IntegrationTests` | Real API + Testcontainers PostgreSQL integration tests |

Allowed dependencies:

```text
Api ---------> Application ---------> Domain
  `----------> Infrastructure ------> Domain
                         `----------> Application

Operations --> Infrastructure + Application + Domain
```

Do not add EF Core types to Application or Domain. Keep endpoint handlers thin and provider-specific behavior in Infrastructure.

## Data boundaries

Both contexts use the `ConnectionStrings:MoneyMentorDb` connection string and share the initial PostgreSQL database, but they remain separate boundaries:

- `MoneyMentorAuthDbContext`: ASP.NET Identity users/roles, refresh tokens, and auth sessions. Its migrations are in `MoneyMentor.Infrastructure/Migrations`.
- `MoneyMentorDbContext`: app profiles, households, categories, transactions/audits, assistant data, insights, goals/plans, commitments, judgements, privacy consents, and entitlement changes. It uses the `app` schema and migrations in `MoneyMentor.Infrastructure/Migrations/MoneyMentorDb`.

`ApplicationUser` is authentication identity only. Finance entities reference `UserProfile.Id`; a profile links to auth through `AuthProvider` and `AuthSubject` without an Identity navigation property.

## Request flow

```text
Endpoint
  -> validate request and authenticated subject
  -> resolve/provision UserProfile + personal household
  -> Application use case/parser
  -> Infrastructure interface implementation
  -> PostgreSQL transaction
  -> response DTO
```

Signup/login returns a short-lived JWT access token and places rotating refresh/session identifiers in Secure, HttpOnly cookies. The frontend keeps the access token only in memory and refreshes through `/api/auth/refresh`.

Most authenticated `/api` routes are blocked with HTTP 428 until the user accepts the current privacy policy. Authorization and financial calculations are deterministic backend responsibilities.

## Main API surface

All finance routes require bearer authentication unless stated otherwise.

| Area | Routes |
| --- | --- |
| Health/public | `GET /health/live`, `GET /health/ready`, `GET /api/public/privacy` |
| Auth | `POST /api/auth/users`, `/login`, `/refresh`, `/logout`, `/refresh-tokens/revoke`; `GET /api/auth/me` |
| Assistant | `POST /api/assistant/messages`; compatibility route `POST /api/expenses/input` |
| Dashboard | `GET /api/dashboard/monthly?month=YYYY-MM&householdId=...` |
| Transactions | `GET /api/transactions`, `GET/PATCH/DELETE /api/transactions/{id}`, `POST /{id}/restore`, `GET /trash` |
| Categories | `GET/POST /api/categories`, `PATCH/DELETE /api/categories/{id}` |
| Settings | `GET/PATCH /api/settings/me` |
| Households | `GET/POST /api/households`, `PATCH /{id}/settings`, invitation list/create/accept/decline routes |
| Goals | goal list/detail/create/update, contributions, planning runs, version customization/review/activation, participant consent |
| Commitments | `GET/POST /api/commitments`, `PATCH /api/commitments/{id}` |
| Judgements | `GET /api/judgements`, `GET /active`, `POST /{id}/dismiss` |
| Reports | `GET /api/judgement-reports`, `GET /api/judgement-reports/history` |
| Privacy | `POST /api/privacy/consents`, `GET /export`, `DELETE /account` |

The development environment exposes `/openapi/v1.json`. Production deliberately does not expose the OpenAPI document or a Swagger UI.

## Assistant behavior

`POST /api/assistant/messages` currently uses heuristic, rule-based routing for:

- `CreateExpense`
- `CreateIncome`
- `AskFinanceQuestion`
- `AskGoalAdvice`
- `ClarificationResponse`
- `Unknown`

Examples include `swiggy dinner 540`, `salary received 75000`, `where did I spend most last month?`, and `I want to save 3 lakh in 8 months`.

Expense and income records are validated before persistence, and the original source text is retained. Missing required values start a clarification draft. These drafts are in memory, so an API restart loses unfinished drafts and the beta deployment must use one replica.

Finance-question coverage is intentionally narrow: top spending category and category spend total for current/last month. Broader query planning belongs on the roadmap.

## Local development

Prerequisites are .NET SDK 10 and PostgreSQL. Docker is also needed for integration tests.

The development settings expect:

```text
Host=localhost;Port=5432;Database=moneymentor;Username=moneymentoruser;Password=moneymentor
```

Override it without editing committed settings:

```powershell
$env:ConnectionStrings__MoneyMentorDb = "Host=localhost;Port=5432;Database=moneymentor;Username=moneymentoruser;Password=your-password"
```

From the repository root:

```bash
dotnet restore MoneyMentor.slnx
dotnet run --project apps/api/MoneyMentor.Operations/MoneyMentor.Operations.csproj -- migrate
dotnet run --project apps/api/MoneyMentor.Api/MoneyMentor.Api.csproj
```

The default development URL is `http://localhost:5267`.

## Migrations and operations

The API does not apply migrations at startup. Apply both contexts through the Operations app:

```bash
dotnet run --project apps/api/MoneyMentor.Operations/MoneyMentor.Operations.csproj -- migrate
```

Create migrations with an explicit context and startup project:

```bash
dotnet ef migrations add MigrationName --context MoneyMentorDbContext --project apps/api/MoneyMentor.Infrastructure --startup-project apps/api/MoneyMentor.Api --output-dir Migrations/MoneyMentorDb
```

Use `MoneyMentorAuthDbContext` and the auth migration directory only for auth/session schema changes.

Audited plan changes:

```bash
dotnet run --project apps/api/MoneyMentor.Operations -- entitlement grant --email person@example.com --operator operator-name --reason "Beta access"
dotnet run --project apps/api/MoneyMentor.Operations -- entitlement revoke --email person@example.com --operator operator-name --reason "Beta access ended"
```

Report backfill defaults to a dry run:

```bash
dotnet run --project apps/api/MoneyMentor.Operations -- judgement-reports backfill --dry-run true
dotnet run --project apps/api/MoneyMentor.Operations -- judgement-reports backfill --dry-run false
```

The same executable is embedded in the API image at `/app/operations`. The EC2 Compose migration service uses that exact release image; see [deploy/README.md](../../deploy/README.md).

## Production configuration

Use [deploy/aws/.env.example](../../deploy/aws/.env.example) and its Compose mapping as the checklist. Important rules:

- `ConnectionStrings__MoneyMentorDb` must use Npgsql's `Host=...;Port=...` format. Do not pass a raw `postgresql://` `DATABASE_URL` to this setting.
- Production CORS must contain an exact HTTPS web origin and no wildcard.
- `AllowedHosts` must contain the deployed API hostname (the health probe sends the same Host header), with no scheme.
- `Jwt__SigningKey` must contain at least 32 random bytes and remain server-only.
- The EC2 template uses sibling HTTPS domains, `AuthCookie__SameSite=Strict`, and secure cookies. Trust only the explicit Nginx address using `ReverseProxy__KnownProxies__0`; do not enable blanket forwarded-header trust.
- The API image listens on internal port 8080; only Nginx publishes host ports.
- AWS options are disabled by default. Set `AWS__Enabled=true` and `AWS__Region` to enable shared configuration; credentials are resolved only when a service client needs them. See [local SSO and EC2 roles](../../deploy/aws/README.md#aws-configuration-and-credentials).
- Production validation fails fast when required security/origin settings are unsafe.

### Optional workers and providers

| Capability | Initial EC2 setting | Notes |
| --- | --- | --- |
| Deleted transaction purge | Enabled | Runs in the API process; deleted records are retained for 30 days |
| Commitment due processing | Enabled | Runs in the API process |
| Judgement scheduler/calculation/narration | Disabled by EC2 template | Enable deliberately after core smoke testing |
| Invitation email dispatcher | `SES__DispatcherEnabled=false` | Requires AWS enabled, region, verified SES sender, and IAM permission; approval emails send directly |
| AI goal planning worker | Disabled in code | Planning rows can remain pending; treat as upcoming |
| OTLP export | Off unless endpoint supplied | Do not emit finance text or identity/secrets |

Keep one API replica until clarification state, rate limits, and worker coordination are distributed.

## Docker

Build from the repository root:

```bash
docker build -f apps/api/MoneyMentor.Api/Dockerfile -t spndrr-api:local .
```

The final non-root image listens on 8080 by default, includes `curl`, and contains:

- `/app/MoneyMentor.Api.dll`
- `/app/operations/MoneyMentor.Operations.dll`

Readiness checks PostgreSQL and pending migrations; liveness checks only the process pipeline.

## Tests

```bash
dotnet build MoneyMentor.slnx --configuration Release
dotnet test apps/api/MoneyMentor.Application.Tests/MoneyMentor.Application.Tests.csproj --no-build --configuration Release
dotnet test apps/api/MoneyMentor.Api.IntegrationTests/MoneyMentor.Api.IntegrationTests.csproj --no-build --configuration Release
```

The integration suite starts PostgreSQL with Testcontainers, so the Docker daemon must be available. Run tests whenever parsing, money calculations, authorization, persistence, migrations, or configuration validation changes.

## Adding a backend feature

1. Put domain state/rules in Domain only when they are genuinely domain concerns.
2. Define use-case models and infrastructure interfaces in Application.
3. Implement persistence/provider behavior in Infrastructure with async APIs and cancellation tokens.
4. Add a thin endpoint under `MoneyMentor.Api/Endpoints` and map it through the endpoint registration.
5. Use `decimal` for money, `DateOnly` for transaction dates where practical, and `DateTimeOffset` for instants.
6. Enforce household scope, role, visibility, and privacy consent on the server.
7. Add calculation/parser unit tests and integration tests for HTTP/persistence boundaries.
8. Add migrations only when the storage model changes; never mix finance entities into the auth context.
