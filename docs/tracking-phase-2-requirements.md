# Spndrr Tracking Phase 2 — Transaction intelligence and selective clarification

**Status:** Finalized implementation requirements
**Date:** 2026-09-29
**Audience:** Codex and Spndrr maintainers
**Scope:** Expense capture, Jev enrichment, optional follow-up questions, persistence, evaluation, and eventual Judgement Engine consumption.

## 1. Product decisions

1. Tracking completeness and interpretation completeness are separate. Save an expense as soon as the existing parser has the required amount and direction, subject to existing validation. Optional behavioral context must never block capture.
2. Preserve the existing hierarchical taxonomy. Jev chooses one valid leaf category; Spndrr derives its parent. A valid Jev choice is used without a confidence gate. Keep the existing parser/category fallback when Jev is unavailable.
3. At initial expense capture, make **at most one Jev request** containing narrow questions for category, transaction-specific essentiality, planning, impulse, and commitment. A later user answer or edit may cause a separate, idempotent re-enrichment; it is not another initial capture request.
4. Jev provides transaction-local semantic signals. Spndrr calculates history, amount anomalies, budgets, cashflow, and goals. The Judgement Engine determines whether a pattern deserves review or advice. Neither Jev nor the transaction record declares a purchase `IsWasteful`.
5. Follow-up questions are exceptional. Ask at most one useful, specific question after a successful save, and never require an answer. A missing or uncertain answer is valid data, not a reason to invent intent.
6. Persist new signals in shadow mode first. Do not change user-facing Judgement Engine conclusions until the evaluation and rollout gates below are met.

## 2. Capture and clarification contract

### 2.1 Decision classes

| Class | Missing information | Behavior |
| --- | --- | --- |
| P0: required to track | Amount, expense/income direction, or another field required by existing validation | Ask a concise required question before saving. Do not guess or create a transaction. |
| P1: category disambiguation | Several materially different category leaves remain plausible | Save with the best valid category/fallback, then consider one optional specific question. A correction updates category with `User` assignment source. |
| P2: behavioral context | Occasion, purpose, planned vs spontaneous, replacement vs new, or commitment | Save immediately. Ask only when the expected value of the answer passes the clarification policy. Never gate tracking. |

P1 and P2 can compete for one follow-up slot. Prefer the question with greater expected effect on correct categorization or future advice; prefer P1 when the category affects accounting materially. Do not ask where the user dined if occasion/purpose is the relevant uncertainty and category is already clear.

### 2.2 Context sufficiency and value policy

Build a deterministic `TransactionContextAssessment` (or equivalent) with `TrackingComplete`, missing-context type, candidate question, estimated significance, expected decision impact, and a reason code. Inputs may include Jev signal uncertainty **if already available**, category ambiguity, amount relative to the user's own robust category/transaction baseline, budget pressure, and whether the missing answer could change downstream treatment. This policy must not make another Jev call merely to decide whether to ask.

The initial policy should use configurable, documented rules and conservative thresholds, not an LLM-generated question or a fixed rupee cutoff. Use medians/percentiles when enough history exists; define a cautious cold-start fallback. Low Jev confidence or probabilities near 0.5 are uncertainty signals, not evidence of impulse. An uninformative input can remain `Unknown`/null in normalized storage when the provider cannot support a meaningful value.

Limit friction: one optional question per capture, a session/day cap, no repeat of the same unanswered question for the transaction, and suppression for low-impact routine purchases. Show the saved confirmation first. If the user ignores the question, tracking is complete. The policy must be observable and tunable without exposing merchant, user ID, or transaction ID as metric dimensions.

Initial question templates:

| Missing signal | Example question |
| --- | --- |
| Dining occasion/purpose | “Was this a regular meal, an outing, or a special occasion?” |
| Purchase purpose | “What was this purchase for?” |
| Replacement/new | “Was this replacing something you needed, or a new purchase?” |
| Planning | “Was this planned, or a spontaneous purchase?” |
| Recurring/commitment | “Is this a recurring or previously committed payment?” |
| Category ambiguity at a merchant | “Was the Apollo payment for medicines, a consultation, tests, or something else?” |
| Travel purpose | “Was this work travel, regular travel, or a trip?” |

Use only relevant choices and allow a free-text answer and dismissal. Associate a pending question with the saved transaction and a stable question ID. An answer updates transaction-local context, marks old enrichment stale, and queues an idempotent re-enrichment. If the answer explicitly changes category, mark the category `User` and never overwrite it automatically. Do not turn an ambiguous answer into a forced binary label.

### 2.3 Expected examples

| Input | Expected capture | Follow-up |
| --- | --- | --- |
| “Coffee ₹180” | Save coffee expense | None. |
| “Dinner ₹450” | Save dining expense | Normally none; history and policy can change this. |
| “Dinner ₹8,500” | Save dining expense | Ask about occasion only if significance and expected impact warrant it. |
| “Headphones ₹12,000” | Save with existing category behavior | May ask planned/replacement vs spontaneous. |
| “Paid ₹3,000 at Apollo” | Save with a valid category/fallback | May ask medicines, consultation, tests, or other. |
| “Anniversary dinner booked last week ₹5,500” | Save with explicit purpose/planning evidence | Do not ask for the already supplied context. |
| “Spent at dinner” | No amount, so no save | Ask for the amount. |

These examples are regression cases, not universal monetary thresholds.

## 3. Jev input and output

### 3.1 Sanitized transaction-local state

Introduce a single `TransactionIntelligenceStateBuilder`. Send only the fields needed to understand this expense: type, amount, currency, date where useful, sanitized merchant, concise description/normalized purpose, a clearly labeled parser category hint, and explicit transaction-local evidence such as “planned,” “replacement,” or a deterministic recurring/commitment match. Omit absent fields.

Do not send salary, balances, savings, goals, budgets, household transactions, full history, or Judgement results. Do not send raw screenshots, full OCR output, UPI IDs, account/phone fragments, references, or arbitrary source text. If structured fields are insufficient, use a minimal sanitized excerpt with a length limit and documented redaction rules. Never log provider input or raw source text. Test redaction with realistic OCR/payment examples.

Example state:

```json
{
  "type": "Expense",
  "amount": 2499,
  "currency": "INR",
  "merchant": "Amazon",
  "description": "replacement laptop charger for work",
  "categoryHint": "Electronics",
  "evidence": { "userSaidReplacement": true }
}
```

### 3.2 One request, five questions

| Signal | Type | Meaning and rules |
| --- | --- | --- |
| Category | Choice | Choose one allowed leaf; derive parent in code. Preserve current fallback. |
| Essentiality | Score, 0–4 | 0 optional indulgence; 1 discretionary convenience; 2 useful but deferrable; 3 normally necessary; 4 essential/unavoidable. This is transaction-specific and distinct from baseline `CategoryClassification`. |
| Planned | Noul/probability | Evidence that the purchase was intended, expected, or budgeted in advance. Do not infer planning from category alone. |
| Impulse | Noul/probability | Evidence of a spontaneous purchase. Discretionary, expensive, or non-essential does **not** by itself imply impulse. Explicit planning/commitment is counterevidence. |
| Committed | Noul/probability | Evidence of a subscription, obligation, bill, recurring, or prior commitment. Deterministic matches remain facts from Spndrr. |

Specify both positive and negative criteria where supported by the current Jev API/client. Keep the questions independent: planned and impulse are related, not exact complements. A planned luxury purchase can have high planning, low impulse, and low essentiality.

The normalized result contains suggested leaf category, diagnostic category confidence, essentiality and its diagnostic confidence, the three probabilities (nullable when unavailable), provider, resolved model, schema version, evaluation time, status, and failure code. Extend the shared Jev client to retain model and token usage and, where supplied, choice probabilities and score distribution/legend. Preserve provider answers in normalized form without copying raw transaction text. Verify exact provider response fields against the API when implementing.

Production uses a configured, tested model version; an alias such as `jev-latest` is acceptable in development. Record the actual resolved version. Upgrade against the evaluation set before changing the production version.

## 4. Persistence, editing, and failure behavior

Create a one-to-one `transaction_enrichments` record keyed by transaction ID, with schema version, status (`Completed`, `Partial`, `SkippedUnconfigured`, `ProviderFailed`, `InvalidResponse`, `Stale`), provider/model/time, source fingerprint, suggested category ID, semantic signals/confidences, normalized provider answers, and failure code. Keep source text out of this record. Retain a bounded/auditable treatment of provider metadata and avoid storing secrets.

Add category assignment source (`Parser`, `Jev`, `User`, `Legacy`) and migrate existing rows to `Legacy` or a better source only when verifiable. A manual category edit sets `User`; all capture, retry, backfill, and re-enrichment paths must respect that lock. Jev may still store a suggested category for diagnostics. Define concurrency behavior so a delayed result cannot overwrite a newer user correction or transaction edit.

Changes to amount, merchant, description, source text, or transaction-local intent/evidence invalidate enrichment and schedule re-evaluation. Visibility-only edits do not. Category-only user edits lock the category; decide whether a semantic refresh is needed based on changed intent, and do not overwrite the user's choice. Use fingerprint/version and compare-and-set or equivalent to discard stale in-flight responses. Deletion removes/cancels related enrichment and pending follow-up according to existing transaction deletion rules.

Provider outage, invalid output, timeout, or missing key never prevents tracking. Save the transaction with parser/category fallback and a skipped/failed enrichment status; retry in a bounded, idempotent manner only when appropriate. Avoid duplicate capture or duplicate questions. If the existing capture flow must await Jev for category, impose a short timeout and preserve its successful category behavior; move slow semantic completion off the critical path when feasible.

## 5. Context feature and Judgement boundary

Compute merchant/category counts over 7/30 days, category spend/trends, amount relative to a robust 90-day category or merchant baseline, budget utilization before/after, recurring matches, cashflow pressure, and eventual goal funding gap in Spndrr. Handle sparse history explicitly. Do not ask Jev to calculate these quantities.

The Judgement Engine may eventually combine essentiality, planning, impulse, commitment, historical frequency/amount anomalies, budget pressure, and goal pressure into evidence-backed review or optimization opportunities. Do not hard-code review weights in the enrichment service. Never persist `Transaction.IsWasteful`, and do not label a specific purchase “impulsive” to a user merely because its probability is moderately high. Keep feature calculation and signal consumption disabled for user-facing nudges until rollout gates pass.

## 6. Delivery packages (separate PRs, in order)

Each PR includes targeted tests and migration/operational notes where relevant. Codex should inspect the current repository and adapt names to its actual conventions without changing these behaviors.

| PR | Deliverable | Acceptance gate |
| --- | --- | --- |
| **1. Contract and Jev client** | Normalized result/state types; Noul criteria support where available; model/usage/probability capture; explicit five-question schema; initial labeled evaluation fixtures. No capture behavior change. | Provider parsing and invalid/missing-field tests pass; category confidence remains diagnostic, never a gate. |
| **2. Enrichment and persistence** | Sanitized state builder; one-request enricher; `transaction_enrichments` entity/migration; category assignment source and user lock; capture fallback; edit invalidation. | One Jev request maximum on initial capture; successful category behavior remains; outage/unconfigured paths save; stale responses cannot overwrite edits. |
| **3. Shadow rollout and observability** | Config flags `TrackingEnrichment.Enabled`, `PersistSignals`, `UseSignalsForJudgement`; default the last flag to `false`; bounded retries; metrics and safe logs. | Production-compatible configuration collects signals without changing nudges; no sensitive text or high-cardinality metric dimensions. |
| **4. Selective clarification** | Context assessment/value policy, deterministic question templates, one-question conversation UI/API, pending-answer state, caps/dismissal, idempotent re-enrichment. | Examples in §2.3 pass; P0 blocks saving only when required; P1/P2 never block capture; repeat or dismissed questions do not spam. |
| **5. Deterministic context features** | History, robust anomaly, budget/cashflow, recurring, and goal signals with sparse-history behavior. No new Jev call. | Time-window/baseline tests cover skewed amounts, sparse data, and boundary dates; feature work is measured and avoids per-transaction query explosions. |
| **6. Evaluation and backfill** | Executable labeled dataset/harness for categories and semantic signals; report accuracy, score error, Brier/calibration buckets and clarification yield; bounded, restartable last-90-days backfill. | Results, model/schema versions, failure rates, privacy checks, and representative error cases are reviewed before enabling Judgement consumption. User categories stay locked. |
| **7. Judgement integration** | Consume validated signals plus deterministic features behind `UseSignalsForJudgement`; evidence-backed patterns, nudges, and goal opportunities. | Compare shadow vs proposed outcomes, suppress misleading conclusions for planned/special purchases, stage rollout, and keep a rollback flag. |

PR 1–4 are the near-term tracking milestone. PR 5–7 complete the path to user-facing intelligence; do not turn on PR 7 solely because PR 1–4 deployed. If repo changes have already landed, amend the relevant PR scope rather than duplicate existing code.

## 7. Observability and evaluation requirements

Keep existing `spndrr.jev.requests`, `spndrr.jev.request.duration`, and capture categorization measurements. Add enrichment attempts/outcomes, duration, failures, Jev input/output token counts where reported, clarification eligible/asked/answered/dismissed, and backfill progress/failures. Use bounded dimensions such as outcome, question kind, and signal schema version. No merchant, category free text, user ID, or transaction ID dimensions. Do not log raw input or provider state.

The evaluation fixtures must cover groceries, rent, medicine, consultations, restaurants/cafes, alcohol, gaming, subscriptions, shopping, travel, fuel, electronics, EMI, emergencies, planned luxury, impulse small purchases, replacements, and ambiguous merchant inputs. Label expected leaf category, acceptable essentiality range, and planning/impulse/commitment expectations, including unknown evidence. Measure category accuracy, essentiality error, probability calibration/Brier score, and whether follow-up answers actually improve decisions. Review errors by scenario before model/question changes; retain model and schema versions for comparison.

## 8. End-to-end definition of done

- Complete expense capture succeeds even with Jev absent or failing; P0 missing data is requested before a save.
- Initial capture issues at most one Jev request for the five semantic/category questions; no extra request is made just to decide whether to ask a follow-up.
- Hierarchical category, parser fallback, and manual category overrides behave correctly across capture, edits, retries, and backfill.
- The provider sees only a minimal sanitized transaction state, and sensitive OCR/payment text is excluded from requests and logs.
- Signals, resolved model, schema version, status, and evaluation time are persisted independently of the transaction; stale in-flight answers cannot replace newer context.
- Optional follow-ups are specific, rare, skippable, rate-limited, and at most one per capture; answering one updates the saved record safely.
- Shadow-mode metrics and evaluation results support a deliberate decision to enable Judgement consumption. Judgement owns user-facing review and goal advice; no `IsWasteful` field is introduced.
