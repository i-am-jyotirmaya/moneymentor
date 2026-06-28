# MoneyMentor Runbook

This runbook covers local setup, backend/frontend verification, API surfaces, and the premium test-account workflow for MoneyMentor.

## Local Services

Prerequisites:

- .NET SDK compatible with the current `net10.0` projects.
- Node.js and `pnpm`.
- PostgreSQL available at the connection string in `apps/api/MoneyMentor.Api/appsettings.Development.json`, or override `ConnectionStrings:MoneyMentorDb`.

Install frontend dependencies:

```bash
pnpm install
```

Run the API:

```bash
pnpm dev:api
```

Run the web app:

```bash
pnpm dev:web
```

Default local URLs:

- API: `http://localhost:5267`
- Web: `http://localhost:3000`

If the API is already running while compiling, Windows may lock API output DLLs. Stop the running `MoneyMentor.Api` process, then rerun the build.

## Database And Migrations

Auth and application data use separate DbContexts.

Auth context:

- `MoneyMentorAuthDbContext`
- ASP.NET Identity users/roles/refresh tokens
- Auth schema/tables only

Application context:

- `MoneyMentorDbContext`
- User profiles, households, transactions, assistant data, insights, agents, goals
- App schema/tables only

Create or update app-schema migrations with the app context:

```bash
dotnet ef migrations add InitialMoneyMentorAppSchema --context MoneyMentorDbContext
dotnet ef database update --context MoneyMentorDbContext
```

Use explicit startup/project arguments if your shell cannot infer them:

```bash
dotnet ef database update --context MoneyMentorDbContext --project apps/api/MoneyMentor.Infrastructure --startup-project apps/api/MoneyMentor.Api
```

Do not add finance/application entities to `MoneyMentorAuthDbContext`.

## API Surface

Auth:

- `POST /api/auth/users`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/refresh-tokens/revoke`
- `GET /api/auth/me`

Assistant:

- `POST /api/assistant/messages`
- Handles expense capture, clarification replies, and deterministic finance questions.
- Finance-question MVP supports:
  - `where did I spend most this month?`
  - `where did I spend most last month?`
  - `how much did I spend on groceries this month?`

Expenses:

- `POST /api/expenses/input`
- Compatibility endpoint for natural-language expense capture.

Dashboard:

- `GET /api/dashboard/monthly?month=YYYY-MM`
- Optional `householdId`.
- Returns backend-calculated income, spending, savings, category summaries, judgement cards, insight cards, and recent transactions.

Transactions:

- `GET /api/transactions?limit=50`
- `GET /api/transactions/{transactionId}`
- `PATCH /api/transactions/{transactionId}`

Settings:

- `GET /api/settings/me`
- `PATCH /api/settings/me`

Households:

- `GET /api/households`
- `POST /api/households`
- `POST /api/households/{householdId}/members`

## Premium Test Account

Test account email:

```txt
jyotirmayasahu38+1@gmail.com
```

The password is an operator-supplied secret and must not be committed to the repository.

Premium setup:

1. Start the API and web app.
2. Sign in with the test account.
3. Open Settings.
4. Set `Plan` to `Premium`.
5. Save settings.
6. Open Household and verify household creation/member controls are enabled.

This updates the app-level `UserProfile.Plan`; it does not change auth tables or `ApplicationUser`.

## Verification Commands

Backend:

```bash
dotnet build apps/api/MoneyMentor.Application.Tests/MoneyMentor.Application.Tests.csproj --no-restore --verbosity minimal
dotnet test apps/api/MoneyMentor.Application.Tests/MoneyMentor.Application.Tests.csproj --no-build --verbosity minimal
dotnet build MoneyMentor.slnx --no-restore --verbosity minimal -m:1
```

Frontend:

```bash
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web test:e2e
```

End-to-end manual smoke:

1. Login with the premium test account.
2. Submit `swiggy dinner 540`.
3. Submit `ice cream from zepto`, then answer `180`.
4. Ask `where did I spend most this month?`.
5. Open Transactions and edit the saved expense.
6. Open Dashboard and verify totals and recent transactions update.
7. Open Household and create a family household.

## Troubleshooting

- API build fails with DLL copy/lock errors: stop the running `MoneyMentor.Api` process and rebuild.
- Web cannot reach API: verify `NEXT_PUBLIC_API_BASE_URL` or use the default `http://localhost:5267`.
- Household actions return forbidden: confirm the app-level profile plan is `Premium`.
- Clarification loops: confirm `IExpenseInputDraftStore` is registered as a singleton and `ExpenseInputProcessor` is used for assistant expense capture.
