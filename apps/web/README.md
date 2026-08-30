# Spndrr web application

This folder contains the responsive Next.js client for Spndrr. It is an assistant-first interface over the backend's deterministic finance workflows.

Start with the [root README](../../README.md) for the full stack and [deployment runbook](../../deploy/README.md) for Railway.

## Stack

- Next.js 16.2.7 App Router
- React 19.2.4 and TypeScript with strict checking
- Tailwind CSS 4 through PostCSS
- Lucide React icons
- Playwright for desktop and mobile browser tests
- Standalone Next.js production output for the Docker runtime

The custom build directory is `.next-moneymentor`. It is a legacy internal name and does not affect the Spndrr product branding.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Signed-out entry or authenticated application shell; desktop starts on Dashboard, mobile starts on Assistant |
| `/login` | Email/password login |
| `/signup` | Account creation plus required privacy-policy acceptance |
| `/transactions` | Application shell opened to Transactions |
| `/planning` | Application shell opened to Goals and planning |
| `/household` | Application shell opened to household management |
| `/settings` | Application shell opened to user and privacy settings |
| `/privacy` | Public beta privacy policy |
| `/health` | Lightweight JSON health endpoint for Railway |

Dashboard, Assistant, and Reports are sections inside the client shell rather than dedicated URL routes.

## Key files

```text
app/
  _components/
    auth-form.tsx                 login/signup experience
    money-mentor-home.tsx        main responsive application shell
    judgement-reports-panel.tsx  weekly/monthly reports
  health/route.ts                production web health endpoint
  privacy/page.tsx               public beta privacy policy
  */page.tsx                     route entry points
  globals.css                    product styling and responsive states
lib/
  api.ts                         typed API models and HTTP client
  auth-session.ts                in-memory access-token state
tests/
  money-mentor.spec.ts           mocked-API product journeys
  test-data-generator.spec.ts    local demo-data helper behavior
Dockerfile                       standalone non-root production image
```

`money-mentor-home.tsx` currently coordinates much of the UI state. When extending it, prefer extracting a focused component or hook rather than growing the shell further.

## Current user experience

- Account creation, login, silent refresh, logout, and privacy consent.
- Assistant text input and browser speech-to-text input (`en-IN`) where supported.
- Natural-language expense/income capture, clarification, focused finance questions, and goal messages.
- Monthly dashboard totals, category summaries, insights, recent transactions, and month navigation.
- Transaction paging, editing, visibility, trash, undo, and restoration.
- Weekly/monthly judgement report history with personal/household scopes.
- Goal creation, progress, contributions, plan-version UI, commitment/category summaries, and participant consent controls.
- Personal/family household selection, invitations, roles, currency, and time-zone settings.
- Data export, account deletion, support contact, and server-controlled entitlement display.

Workspace loads are guarded against stale responses, including the household acceptance/selection path. Preserve that cancellation/current-request check when changing the initial data-loading flow; otherwise an older request can overwrite the newly selected household.

Known UI/product limits are tracked in the [root README](../../README.md). In particular, AI goal-plan background execution is not enabled, invitation email is optional/off by default, and commitment/category management screens are not complete.

## Local development

From the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev:web
```

Or from this folder:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. The API defaults to `http://localhost:5267`, so start it separately with `pnpm dev:api` from the repository root.

### Environment variables

Create an ignored `apps/web/.env.local` only when the defaults are not suitable:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:5267
NEXT_PUBLIC_SUPPORT_EMAIL=support@example.com
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:5267` | Absolute browser-visible API origin; a trailing slash is removed |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | legacy placeholder | Public support address shown in Settings and Privacy |

Both variables are public and are compiled into the client bundle. Never put API keys, passwords, tokens, or other secrets in them.

## Auth and API behavior

`lib/api.ts` sends cross-origin requests with `credentials: "include"`. Auth works as follows:

1. Signup/login returns an access token in the response and refresh/session identifiers in Secure, HttpOnly cookies.
2. `lib/auth-session.ts` holds the access token only in JavaScript memory, not local storage.
3. A reload restores the session through `POST /api/auth/refresh`.
4. A non-auth API request that returns 401 triggers one coordinated refresh and retry.
5. A failed refresh clears the local session and returns the user to authentication.

Production therefore requires exact API CORS configuration, HTTPS, and compatible cookie `SameSite` settings. For generated Railway web/API domains use the checked-in backend template's `SameSite=None`; custom sibling Spndrr domains can be tightened after testing.

The browser voice feature uses the browser's Web Speech API. It submits the recognized transcript with `inputMode: Voice`; Spndrr does not upload the audio stream.

## Quality checks

From the repository root:

```bash
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web exec playwright install chromium
pnpm --filter web test:e2e
```

`next build` performs type checking. Playwright runs Chromium projects for desktop and Pixel 5 viewports and starts its own local Next.js development server.

Generated `playwright-report` and `test-results` folders are intentionally excluded from linting and version control.

The browser suite mocks `http://localhost:5267/api/**`. It covers UI behavior and request contracts, but it does not verify a live API or PostgreSQL. Run the deployed-stack smoke test in [deploy/README.md](../../deploy/README.md) before inviting a user.

There are currently two pnpm lockfile scopes: the root workspace lock and `apps/web/pnpm-lock.yaml`. The Docker image and CI intentionally install from the nested web lock. Keep both synchronized when dependency versions change; consolidating to one lockfile should be a separate cleanup.

## Production build and Docker

Build directly:

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-api-host pnpm build
pnpm start
```

Build the production image from the **repository root** because the Dockerfile copies `apps/web/...` paths:

```bash
docker build -f apps/web/Dockerfile -t spndrr-web:local --build-arg NEXT_PUBLIC_API_BASE_URL=https://your-api-host --build-arg NEXT_PUBLIC_SUPPORT_EMAIL=support@example.com .
```

The image uses Node 24 Alpine, installs with the nested frozen lockfile, produces standalone output, binds to `0.0.0.0`, honors Railway's `PORT`, and runs as a non-root user.

On Railway:

- Leave the source root at the repository root.
- Set Dockerfile path `/apps/web/Dockerfile`.
- Set both `NEXT_PUBLIC_*` values **before** the build.
- Redeploy whenever either value changes; runtime-only changes cannot rewrite an existing browser bundle.
- Use `/health` with a 300-second health-check timeout.

See [deploy/railway/web.env.example](../../deploy/railway/web.env.example) for the exact template.

## Safe extension checklist

- Keep amounts and financial decisions sourced from backend responses.
- Preserve authenticated household scope, Viewer read-only behavior, and Private/Household visibility in every mutation UI.
- Keep `credentials: include` for auth-cookie flows and use the shared API client.
- Provide useful loading, empty, validation, 401/428, 429, and provider-failure states.
- Maintain desktop and mobile layouts, keyboard focus, semantic labels, and the voice-input fallback.
- Add or update Playwright coverage for meaningful user journeys.
- Do not expose secrets through client code or `NEXT_PUBLIC_*` variables.
- Treat investment recommendations and claims of financial safety as out of scope.
