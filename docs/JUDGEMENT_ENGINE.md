# Judgment engine operations

The engine runs inside the API's modular monolith. Financial amounts and comparisons
are computed from stored transactions and daily facts; AI only classifies context
or explains already-calculated evidence. The candidate/decision path is the sole
active producer of judgments. Earlier weekly/monthly reports remain readable
as historical snapshots. Their scheduler, recalculation queue, calculation and
narration workers, and manual backfill command have been retired.

## Flow

1. Expense ingestion keeps raw merchant text, resolves a merchant alias, and may
   ask Jev for category/context when `TYPESAFE_API_KEY` and current privacy consent
   are present. Any category suggestion must clear the configured confidence gate.
2. Transaction mutations and category classification changes rebuild affected
   daily aggregates. A migration backfills existing transaction days.
3. Daily analysis examines 7/30/90-day facts and produces versioned, deduplicated
   candidates for category spikes, repeated discretionary spend, merchant frequency,
   acceleration, subscriptions and goal-funding pressure.
4. A leased worker builds a bounded context and asks Jev to IGNORE, OBSERVE, ASK
   or NUDGE only when the relevant user(s) consented. Without a key or consent it
   uses a deterministic bounded fallback. IGNORE records an audit, not a judgment.
5. Important ASK/NUDGE cases may receive OpenAI wording when configured and
   consented; numerical evidence remains unchanged.
6. `POST /api/judgements/{id}/explanations` queues a user's own explanation.
   Jev may admit durable context, with the original text retained and optional
   `text-embedding-3-small` embedding. Generic acknowledgments are discarded.
   Retrieval first enforces household/owner visibility in SQL, then optionally
   ranks the authorized subset by vector similarity.

## Configuration and rollout

- Apply app migrations before rolling out API instances. The memory migration
  requires PostgreSQL with the `vector` extension available; a managed database
  role must be permitted to run `CREATE EXTENSION IF NOT EXISTS vector`. The
  extension is retained on rollback because it may be shared.
- `TYPESAFE_API_KEY` is optional; unset means no external Jev calls, no memory
  admission, and a deterministic judgment gate. Pending user explanations remain
  queued until the integration is enabled. `Jev:Model` defaults to `jev-latest`.
- `OPENAI_API_KEY` is optional; unset means deterministic explanation and text-only
  memory retrieval. It does not disable financial calculations or candidates.
- `JudgmentCandidates:Enabled` (default `true`) controls periodic detection;
  `AnalysisIntervalHours` defaults to 24. The decision and feedback workers have
  durable leases, bounded retries and periodic recovery. Inspect `ManualReview`
  feedback rows if a provider or malformed response repeatedly fails.
- Historical `GET /api/judgement-reports` and `/history` return previously
  published snapshots only. Pending legacy revisions will not complete. The
  contextual candidate decisions shown at `GET /api/judgements/active` do not
  depend on a report cadence. Do not configure legacy `JudgementReports` flags;
  they have no effect.
- Privacy consent is checked before sending financial context or explanations
  externally; household candidate context requires every active member's current
  consent. Shared memory retrieval includes only active authors and explicitly
  household-visible memories. Removing consent prevents future external calls.

The future Goals Engine can inject `IGoalJudgmentSignalReader`. It returns
authorized 30/90-day deterministic facts plus active, relevant candidate judgments
for a goal. Shared goals see only household-visible facts/judgments; private goals
require their owner. The existing goal-capacity calculator remains independent of
Jev and the judgment wording. This contract is intentionally a read boundary, not
an automatic change to goal plans.
