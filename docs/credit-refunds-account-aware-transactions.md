# Spndrr credit, refunds and account-aware transactions

Implemented from `Support_Credit.md`, on a branch based on main after Phase 2 tracking enrichment. This change is independent of local transcription. The existing Judgment Engine and goal calculations consume the new financial facts; no new judgment phase or scheduling change is included.

## Financial rules

Amounts remain positive magnitudes. `TransactionFinancialImpactCalculator` assigns deterministic effects using the event kind. Payment channel and AI enrichment never set totals.

| Kind | Spending | Earned income | Other effect |
| --- | ---: | ---: | --- |
| Purchase, Fee, Interest | +amount | 0 | New consumption/cost |
| Refund | −amount | 0 | Linked or explicitly unlinked spending adjustment |
| Income | 0 | +amount | Earned income |
| Transfer, CreditCardPayment, CashWithdrawal | 0 | 0 | Internal movement/settlement |
| Cashback | 0 | 0 | Separate rewards amount |
| Investment | 0 | 0 | Investment amount |
| Reversal | Inverse of original kind | Inverse of original kind | Inverse investment/rewards where applicable |

Cashback initially uses the separate-rewards policy. A configurable reporting policy is a future extension. Refunds/reversals are recognized on their own transaction dates; prior months are not silently restated. Negative net spending is valid when a refund arrives in a later month.

The dashboard, category and finance answers, daily facts and rolling judgment evidence, merchant trend amounts, goal affordability, and commitment matching use these rules. Neutral movements are excluded from consumption and earned-income totals. Positive purchase/cost counts remain separate from refunds and settlements.

## Completed scope

| Requirements phase | Delivered |
| --- | --- |
| 1. Semantics | Kinds, payment channels, shared calculator, legacy fallback and backfill |
| 2. Accounts | Bank, credit card, cash, wallet; private/shared accounts; aliases; active/archive state; resolver; settings and transaction-editor controls |
| 3. Credit purchases/costs | Purchases count immediately; fees/interest remain real costs |
| 4. Settlements/transfers | Bank/card payments, internal transfers and cash withdrawals have neutral spending/income effects |
| 5. Refunds/reversals | Amount-bearing many-to-one relations; metadata/classification inheritance; partial and multiple refunds; inverse original semantics |
| 6. Matching | Conservative merchant, amount, account and description matching; user selection for ambiguous purchases; reference/account-pair matching for transfer observations |
| 7. Import readiness | Normalized transaction API, reference-based replay protection and observation-account identity; no bank synchronization/import provider added |

`CorrectionOf` and `TransferPair` are available relation kinds. Refund/reversal creation is exposed; arbitrary correction workflows and a full ledger remain future work.

## Assistant behavior

The assistant processes normalized text, including voice transcripts, before the ordinary expense/income classifier when an explicit financial event is present. The existing input providers and audio capture/transcription code are unchanged.

Examples:

- `450 lunch` continues through ordinary expense tracking, with no required account/channel.
- `2800 dinner at Antera using Millennia` can resolve a known account alias.
- `Paid Millennia bill 32,400 from HDFC` recognizes a known credit-card alias and saves a settlement.
- `Amazon refunded 2300 for the headphones` attempts a purchase match.
- `Moved 20k from HDFC to ICICI` saves a transfer.
- `Amazon sent me 5000` asks whether this was a refund, cashback or earned income before saving.

Amount and event-kind clarifications are retained for 20 minutes per authenticated identity and household, in bounded process-local storage. For purchase matches, reply with the displayed number, `unlinked` to save an unmatched refund, or `cancel`. A reversal requires an original transaction. Account aliases that are unknown are left unspecified; ambiguous known aliases ask for the full name. Accounts remain optional, even for neutral movement tracking.

`bought potatoes for rs 40 using kotak upi` retains the original source text, saves `potatoes` as the purchase description, resolves an existing Kotak account/alias, and stores UPI as the payment channel. The confirmation displays the resolved account separately. With current AI consent and a configured Jev key, the capture path sends the purpose and source text to Jev for a validated leaf-category choice; a successful Groceries choice is persisted under Food & Groceries.

An Uncategorized result alone does not prove whether Jev was called. Request-correlated logs now report `Jev categorization outcome` with `jev_selected`, `consent_missing_fallback`, `unconfigured_fallback`, `provider_error_fallback`, or `invalid_choice_fallback`. `SelectedFallbackCategory=true` distinguishes Jev explicitly selecting the valid Uncategorized/Other Income option. No source text, account names, category names, or credentials are logged. Check `spndrr.jev.requests` with `operation=categorization` for the actual HTTP attempt and its success/error outcome, and `spndrr.capture.categorization` for the capture decision. A configured key is not proof that a deployed call succeeded; correlate the deployed request's logs/metrics.

Matching narrows to visible household events within the preceding year. A unique exact merchant/amount match with account or product-description evidence links automatically. Partial or ambiguous candidates require selection; incomplete evidence never silently chooses a purchase. Explicit API selection is revalidated against the current available amount and access rights.

## API

- `GET /api/financial-accounts?householdId=...` lists private accounts owned by the caller and shared household accounts, including archived accounts.
- `POST /api/financial-accounts` creates an account.
- `PUT /api/financial-accounts/{id}` updates its name, aliases and active status.
- `POST /api/transactions` accepts `TransactionIntent`: eventKind, amount, date, householdId, optional account IDs/aliases, counterparty IDs/aliases, paymentChannel, category/merchant/description, sourceText, inputMode, relatedTransactionId, matchOriginal, externalReference, observationAccountId and visibility.
- Existing `PATCH /api/transactions/{id}` can correct kind and optional account/channel fields. `clearAccount` and `clearCounterpartyAccount` explicitly remove references. Refund/reversal kinds are created through the normalized event flow, not by changing an unrelated row's kind.

A matching ambiguity returns HTTP 422 with visible candidates. Domain validation returns HTTP 400; unauthorized household access returns 404 or 403 according to the existing access boundary. Enum values, monetary precision, date bounds, account ownership/currency, category availability and relationships are validated on the server.

For two statement observations of a card settlement, both adapters normalize source = bank and destination = card. The bank observation uses `observationAccountId = bank`; the card observation uses `observationAccountId = card`. The same reference, amount, known pair and kind within three days creates `TransferPair`. A retry for the same observation returns its existing event. Similar amounts or descriptions alone do not establish a pair. No account balances are calculated in this release; a future ledger must collapse paired observations into one economic movement.

## Integrity, privacy and edits

- Private accounts cannot be resolved or listed by other household members. Shared accounts are managed by owners/admins.
- IDs must belong to the selected household and be available to the actor; no AI-selected foreign IDs are accepted.
- A linked adjustment inherits the original category, merchant/account, visibility, owner and enrichment. Its original event must remain available and active.
- Aggregate refund/reversal amounts cannot exceed an original event. Household transaction locks serialize linking, replays and edits, followed by day-fact locks in date order. Transaction writes, links and rebuilt facts commit together.
- An original event with active adjustments cannot be materially changed or deleted. Remove those adjustments first. Linked adjustment categories/visibility cannot diverge from the original. Editing the adjustment amount/date and deleting/restoring it revalidates capacity and rebuilds affected days.
- A reversal cannot reverse another reversal. Partial reversals are bounded by the original amount. No balance reconciliation or currency conversion is included.
- Account type and sharing cannot be changed once historical references depend on them; archiving preserves history. Deactivating an account removes it from new resolution.
- Privacy exports include event semantics, visible accounts/aliases and owned transaction relations; private account deletion follows the existing user/household data lifecycle.

## Migration and rollout

Run the new application migration before serving the updated API. `AccountAwareTransactions` adds nullable transaction account/semantic/reference columns, account/alias tables, relations, keys and indexes. Existing Expense/Income/Investment/Transfer records receive Purchase/Income/Investment/Transfer kinds. Historical accounts remain null. Nullable kind fallback preserves compatibility with existing writers and fixtures.

Existing daily facts do not need recalculation merely for the backfill, because their financial meaning is unchanged. New creates, edits, deletes and restores rebuild the affected days atomically and mark those facts `v2-account-aware`. Newly detected/refreshed judgment candidates carry the fact version into their decision context. Roll back application/database together if the new tables or columns are removed; a database downgrade discards the new account/link metadata.

No API key or new production feature flag is required. Jev category enrichment retains the existing privacy-consent and fallback behavior. No speech models, audio capture, speech configuration or transcription files are part of this change.

## Verification

Application tests cover every financial kind, legacy fallback, original-kind reversals, card purchases/settlement/refunds/fees, alias/channel separation, ordinary purchase/query routing and multi-turn clarification. Database tests cover real persistence/fact rebuilds, multiple partial refunds, over-refund rejection, soft-delete/restore capacity, matching, household isolation, imported replay/pairs and concurrent refund attempts. Browser tests cover account creation/archiving and financial-kind/channel editing at desktop and mobile widths.

Run:

```bash
dotnet build MoneyMentor.slnx
dotnet test apps/api/MoneyMentor.Application.Tests
dotnet test apps/api/MoneyMentor.Api.IntegrationTests
cd apps/web
pnpm lint
pnpm build
pnpm test:e2e
```

Integration tests use the existing Docker PostgreSQL/pgvector container by default. For an isolated external test database, set `SPNDRR_TEST_POSTGRES` to a disposable PostgreSQL connection string; tests run migrations and write test data. Local PostgreSQL-compatible validation does not substitute for the Docker concurrency check in CI.
