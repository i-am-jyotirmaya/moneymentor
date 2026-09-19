# Web workspace architecture

The web app uses a persistent `(workspace)` layout and one mounted feature screen. Desktop home prioritizes the dashboard; mobile home prioritizes natural-language tracking. Both layouts expose every feature. Explicit routes always open the requested screen, regardless of viewport size.

## Files and responsibilities

- `apps/web/app/(workspace)`: route entry points, page metadata, shared workspace layout and loading boundary.
- `app/_components/money-mentor-home.tsx`: responsive shell and composition.
- `app/_components/common-ui.tsx`: reusable fields, month navigation, transaction rows, metrics and empty states.
- `app/_components/*-section.tsx`: feature screens. Planning additionally separates the goal creation form and plan panel.
- `app/_hooks/use-workspace-controller.ts`: existing session, workspace data and mutation orchestration, independent of layout markup.
- `app/_hooks/use-planning-controller.ts`: goal planning requests and state.
- `app/_hooks/use-workspace-url.ts`: validated filter readers, History API updates, fragment and viewport subscriptions.
- `app/_components/navigation-progress.tsx`: transition-aware links and programmatic routing.
- `app/_components/loading-ui.tsx`: reusable, accessible loading skeletons and progress bar.

Planning, reports, households and settings are loaded on demand with skeleton fallbacks. The shared layout preserves unsent assistant text and conversation state while moving between workspace routes. A hard refresh restores the authenticated session and URL-selected view; unsent drafts and chat history remain in memory only.

## URL contract

| State | URL example |
| --- | --- |
| Dashboard | `/dashboard?month=2026-09` |
| Tracking | `/assistant` |
| Transaction month and pagination | `/transactions?month=2026-08&page=2` |
| Transaction editor within its month/page | `/transactions?month=2026-08&page=2&edit=TRANSACTION_ID` |
| Household scope | `/household?household=HOUSEHOLD_ID` |
| Report selection | `/reports?cadence=Monthly&scope=Personal&period=2026-08` |
| Goal selection | `/planning?goal=GOAL_ID#goal-plan` |
| Desktop assistant drawer | `/dashboard#assistant` |
| Settings | `/settings` |

Navigation uses Next links. Client-fetched filters use Next's supported History API integration, preserving browser Back/Forward without requesting redundant server payloads. Invalid month/page values fall back to the current month/page one. The editor is scoped to the loaded transaction page; a deleted or unavailable transaction does not open an editor. Household IDs are checked against returned memberships, with the API remaining the authorization boundary.

Do not put expense text, chat messages, passwords, or invitation tokens into query strings. Saving, deleting, exporting and other mutations remain explicit actions, never side effects of visiting a URL. Signup invitation tokens retain their existing hash-only flow.

## Server rendering

Public authentication branding is rendered as a Server Component. `/login` streams registration availability from the API using `cache: no-store` and a bounded timeout. Set optional server-only `API_BASE_URL` when the Next server should reach an internal API address; otherwise it uses `NEXT_PUBLIC_API_BASE_URL` (or the existing local API default). If the server cannot reach the API, the link defaults to request-access and the browser retries the public registration lookup. Native static export uses the client registration lookup directly.

Finance data continues to load through the existing authenticated client API. Access tokens exist only in browser memory and the API owns refresh cookies; this change does not copy tokens into new cookies or expose personal data through a shared server cache. Authenticated data SSR would require a separately designed server session/BFF boundary.

The workspace shell/loading boundary, public form markup, privacy page and route metadata can render before hydration. Server registration lookup is tested separately from browser-only session restoration.

## Validation

```sh
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web exec playwright install chromium
pnpm --filter web test:e2e
pnpm --filter mobile test
NEXT_PUBLIC_API_BASE_URL=https://api.spndrr.com pnpm --filter mobile build
pnpm --filter mobile test:e2e
```

Browser coverage includes desktop/mobile defaults, one mounted tracking input, draft preservation, deep links, refresh, Back/Forward, invalid filters, delayed-request skeletons/progress, report filters, goal selection, and public sign-in markup with JavaScript disabled. Existing authentication, privacy, transaction and household flows remain covered.
