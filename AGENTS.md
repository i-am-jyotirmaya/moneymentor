# AGENTS.md

This file provides instructions for AI coding agents working in the MoneyMentor repository.

## Project Overview

MoneyMentor is an assistant-first personal finance application.

The core product flow is:

1. Users enter expenses or finance questions in natural language.
2. The app parses the input into structured financial data.
3. The backend validates and stores transactions.
4. Reports, insights, and agentic workflows analyze spending behavior.
5. The app guides users toward better financial decisions.

The product should feel like a personal finance guide, not a traditional accounting app.

## Repository Structure

Current high-level structure:

```txt
MONEY-MENTOR/
  apps/
    api/
      MoneyMentor.Api/
      MoneyMentor.Application/
      MoneyMentor.Domain/
      MoneyMentor.Infrastructure/
    web/
  AGENTS.md
  CODING_GUIDE.md
  MoneyMentor.slnx
  package.json
  pnpm-lock.yaml
```

The `web` app is currently a scaffolded blank Next.js project.

## Architecture Principles

Use a modular monolith architecture.

Do not introduce microservices unless explicitly requested.

The backend should follow this dependency direction:

```txt
MoneyMentor.Api
  -> MoneyMentor.Application
  -> MoneyMentor.Domain

MoneyMentor.Infrastructure
  -> MoneyMentor.Application
  -> MoneyMentor.Domain
```

The Domain project must not depend on Infrastructure or Api.

The Application project should contain use cases, interfaces, DTOs, orchestration, and business workflows.

The Infrastructure project should contain database access, EF Core DbContexts, repositories, identity implementation, external AI clients, and provider-specific integrations.

The Api project should expose HTTP endpoints and wire dependencies.

## Existing Backend Projects

### MoneyMentor.Api

Responsibilities:

- HTTP endpoints
- Auth endpoints/controllers
- Request/response models if API-specific
- Dependency registration
- Middleware configuration
- Swagger/OpenAPI setup

Current auth-related files are under:

```txt
MoneyMentor.Api/Auth/
```

Do not move these files unless explicitly asked.

### MoneyMentor.Application

Responsibilities:

- Use cases
- Application services
- Commands and queries
- Assistant orchestration
- Interfaces for infrastructure dependencies
- Validation logic that is not purely domain-level

Avoid putting EF Core-specific code here.

### MoneyMentor.Domain

Responsibilities:

- Domain entities
- Enums
- Value objects
- Domain constants
- Domain rules

Current folders:

```txt
MoneyMentor.Domain/Entities/
MoneyMentor.Domain/Enums/
```

Domain classes should be persistence-friendly but should not depend on EF Core packages unless explicitly approved.

### MoneyMentor.Infrastructure

Responsibilities:

- Identity implementation
- EF Core DbContexts
- EF Core entity configurations
- Repository implementations
- External provider clients
- Auth persistence
- MoneyMentor application persistence

Current folders include:

```txt
MoneyMentor.Infrastructure/Auth/
MoneyMentor.Infrastructure/Identity/
MoneyMentor.Infrastructure/Migrations/
MoneyMentor.Infrastructure/Persistence/
```

## Auth Boundary

Authentication is separate from MoneyMentor application data.

The existing auth user is:

```csharp
ApplicationUser : IdentityUser<Guid>
```

located under:

```txt
MoneyMentor.Infrastructure/Identity/ApplicationUser.cs
```

The auth system currently has its own auth DbContext and auth-related models.

Do not mix auth tables with finance/application tables.

Do not create navigation properties from application entities to `ApplicationUser`.

Do not directly reference `ApplicationUser` from MoneyMentor domain entities.

Auth may later be delegated to third-party providers such as Auth0, Okta, Google, or Microsoft. Keep the app data model independent from ASP.NET Identity.

## Application User Profile Model

MoneyMentor application data should use an app-level profile entity named:

```txt
UserProfile
```

Do not name it `User`.

`UserProfile` represents a user inside the MoneyMentor application domain.

`ApplicationUser` represents authentication/security identity only.

Recommended linking fields for `UserProfile`:

```txt
AuthProvider
AuthSubject
```

For local ASP.NET Identity users:

```txt
AuthProvider = "local"
AuthSubject = ApplicationUser.Id.ToString()
```

For future third-party auth:

```txt
AuthProvider = "auth0" / "okta" / "google" / etc.
AuthSubject = provider subject/id
```

All application entities should reference `UserProfile.Id`, not `ApplicationUser.Id`.

## DbContext Separation

Keep two persistence boundaries:

```txt
Auth DbContext
- ApplicationUser
- ApplicationRole
- RefreshToken
- Identity tables

MoneyMentorDbContext
- UserProfile
- Household
- HouseholdMember
- Category
- Transaction
- AssistantSession
- AssistantMessage
- PendingAction
- Insight
- AgentRun
- FinancialGoal
```

Do not modify the auth DbContext unless the user explicitly asks.

Create and maintain a separate application DbContext named:

```txt
MoneyMentorDbContext
```

`MoneyMentorDbContext` must only contain MoneyMentor application/finance data.

## Core Application Entities

Expected application entities:

```txt
UserProfile
Household
HouseholdMember
Category
Transaction
AssistantSession
AssistantMessage
PendingAction
Insight
AgentRun
FinancialGoal
```

Use `Guid` identifiers unless an existing convention says otherwise.

Use `decimal` for money.

Use `DateTimeOffset` for timestamps.

Use `DateOnly` for transaction dates when practical.

## EF Core Guidelines

Use Fluent API configuration.

Prefer separate configuration classes:

```csharp
public sealed class TransactionConfiguration : IEntityTypeConfiguration<Transaction>
```

Keep DbContext classes clean.

Use:

```csharp
modelBuilder.ApplyConfigurationsFromAssembly(typeof(MoneyMentorDbContext).Assembly);
```

Use decimal precision for money:

```txt
decimal(18,2)
```

Do not expose EF Core types from the Application project.

Do not configure relationships from application entities to Identity/auth entities.

Recommended migration commands for app data:

```bash
dotnet ef migrations add InitialMoneyMentorAppSchema --context MoneyMentorDbContext
dotnet ef database update --context MoneyMentorDbContext
```

If migration projects or startup projects require explicit parameters, inspect the existing solution structure before adding commands.

## Natural Language Assistant Direction

The app is assistant-first.

Primary user interactions include:

```txt
groceries for 110 from local market
ice cream from zepto
paid rent 18000
where did I spend most last month?
how much did I spend on groceries this month?
I want to save 3 lakh in 8 months
```

The backend should support a single assistant-style entry point eventually, such as:

```http
POST /api/assistant/messages
```

The assistant should route input to:

```txt
CreateExpense
CreateIncome
AskFinanceQuestion
AskGoalAdvice
ClarificationResponse
Unknown
```

For the MVP, prefer implementing:

```txt
CreateExpense
AskFinanceQuestion
ClarificationResponse
```

## AI Usage Rules

AI may be used for:

- Intent detection
- Expense parsing
- Category prediction
- Clarifying missing fields
- Report narration
- Insight wording
- Goal advice explanation

AI must not be the source of truth for:

- Financial calculations
- Transaction totals
- Budget math
- Authorization decisions
- Database writes without validation
- Final savings projections without deterministic backend calculation

The backend must calculate money using trusted stored data.

Good pattern:

```txt
AI understands the question.
Backend creates a deterministic query plan.
Backend calculates totals.
AI explains the result in friendly language.
```

Bad pattern:

```txt
AI invents monthly spending totals from raw text.
```

## Expense Parsing Guidelines

Start rule-based before using AI.

Examples to support:

```txt
groceries for 110 from local market
petrol 250
zepto ice cream 180
paid rent 18000
protein powder 2400 from amazon
sabzi 80
doodh 60
swiggy dinner 540
```

Parsed expense drafts should include:

```txt
Amount
Category guess
Merchant name
Description
SourceText
Confidence
Missing fields
```

Store the original `SourceText` for transactions created from natural language.

If required fields are missing, create a pending action instead of saving incomplete data.

Example:

```txt
User: ice cream from zepto
Assistant: How much did you spend?
User: 180
Assistant: Tracked ₹180 under Snacks from Zepto.
```

## Agentic Workflow Direction

MoneyMentor should eventually include background agents.

Potential agents:

```txt
ExpenseCaptureAgent
FinanceQueryAgent
SpendingPatternAgent
BudgetJudgeAgent
MonthlyReviewAgent
GoalAdvisorAgent
HouseholdFinanceAgent
```

Agents should not directly mutate financial data casually.

Preferred flow:

```txt
Build financial snapshot
Run agent
Create insights/recommendations
Store agent run
Show insight to user
User accepts/rejects actions when needed
```

Store agent execution traces in `AgentRun` where appropriate.

## Insights Direction

Insights should be helpful, specific, and non-shaming.

Good:

```txt
Food delivery is quietly increasing. You spent 42% more than your usual weekly average.
```

Bad:

```txt
You are wasting money.
```

Judgments may include:

```txt
Healthy
Watch
NeedsAttention
Risky
Critical
```

The app should highlight good behavior as well as risky behavior.

## Household Direction

MoneyMentor should support households.

A household may have multiple members.

Basic roles:

```txt
Owner
Admin
Member
Viewer
```

Transactions should belong to a household and a user profile.

Some insights can be household-level, while others can be user-specific.

Privacy matters. Do not assume all personal expenses are visible to all household members.

Transaction visibility should support at least:

```txt
Private
Household
```

## Frontend Guidelines

The `apps/web` project is currently a scaffolded blank Next.js app.

Build the frontend around a simple home input experience.

Primary screen direction:

```txt
What did you spend on?
[ Type or speak... ]
```

The same input should eventually support both:

```txt
spent 500 on groceries
where did I spend most this month?
```

Do not overbuild dashboards before the input and assistant flow work.

Prioritize:

1. Single input box
2. Recent transactions
3. Assistant response area
4. Insight cards
5. Reports later
6. Household screens later

## Coding Style

- Make small, focused changes.
- Do not rewrite unrelated files.
- Follow the existing project structure.
- Prefer clear names over clever abstractions.
- Use async APIs for database and external calls.
- Use cancellation tokens where appropriate.
- Add tests for parsing, financial calculations, and query/report logic.
- Avoid introducing new dependencies unless clearly justified.
- Keep controllers/endpoints thin.
- Keep business logic out of Program.cs.
- Keep money values as `decimal`, never `double` or `float`.

## Before Changing Code

When asked to implement a feature:

1. Inspect the existing project structure.
2. Identify the correct project/folder.
3. Avoid touching auth unless the request explicitly involves auth.
4. Avoid broad refactors unless requested.
5. Preserve existing behavior.
6. Make the smallest useful change.

## After Changing Code

Always summarize:

- Files created
- Files modified
- Important design choices
- How to run/test the change
- Any assumptions made
- Any follow-up work needed

## Safety and Financial Guidance

MoneyMentor can provide guidance, but it should not pretend to be a certified financial advisor.

Use language like:

```txt
Based on your tracked data...
This appears to...
You may consider...
```

Avoid language like:

```txt
This guarantees...
You must invest in...
You are financially safe...
```

Do not implement investment recommendations without explicit product requirements and safety review.

## Current Build Priority

The immediate priority is to establish the app data foundation:

1. Separate MoneyMentor application data from auth data.
2. Add `UserProfile` as the app-level user model.
3. Add `MoneyMentorDbContext` for application/finance data.
4. Add core finance entities.
5. Build natural-language expense capture.
6. Build finance question/report support.
7. Add insights and agents after reliable data capture exists.

Remember: MoneyMentor is not a generic CRUD finance tracker. It is a natural-language personal finance guide.
