# Financial judgement calculations

Calculation version: `v1`

This document is the source of truth for weekly and monthly financial summaries. The backend persists these calculations and classifications before optional AI narration. AI may rewrite wording, but it must not change amounts, deltas, directions, severities, or action codes.

## Periods and scopes

- Weekly windows are ISO Monday through the following Monday, end-exclusive.
- Monthly windows are the local calendar month, end-exclusive.
- Boundaries use the summary's stored IANA time zone. Only completed windows are finalized.
- Personal scope contains only the selected member's transactions in the selected household.
- Household scope contains only household-visible transactions from all members. Private transactions are never included.
- Transfers are excluded from health calculations.

## Window metrics

Savings-classified expenses and `Investment` transactions are asset allocations rather than consumption.

```text
Income = sum(Income)
ExplicitSavings = sum(Investment) + sum(Expense classified Savings)
ConsumptionSpend = sum(Expense excluding Savings classification)
EssentialSpend = sum(consumption classified Essential)
DiscretionarySpend = sum(consumption classified Discretionary)
DebtSpend = sum(consumption classified Debt)
UncategorizedSpend = sum(consumption without category/classification)
CashOutflow = ConsumptionSpend + ExplicitSavings
OperatingSurplus = Income - ConsumptionSpend
CashBalance = Income - CashOutflow
SavingsRate = OperatingSurplus / Income * 100
SavingsAllocationRate = ExplicitSavings / Income * 100
ExpenseToIncomeRate = ConsumptionSpend / Income * 100
EssentialShare = EssentialSpend / ConsumptionSpend * 100
DiscretionaryShare = DiscretionarySpend / ConsumptionSpend * 100
DebtShare = DebtSpend / ConsumptionSpend * 100
UncategorizedShare = UncategorizedSpend / ConsumptionSpend * 100
```

Income-dependent rates are null when income is zero. Spend shares are null when consumption is zero. Money is stored as `decimal(18,2)`; rates retain calculation precision and are rounded only for presentation.

The summary also stores transaction counts by type, active transaction days, categorized and uncategorized counts, first/last transaction dates, and parent-category amount/share/count snapshots.

## Comparisons

- Weekly baseline: median of the previous 8 completed weeks; require 4 usable periods.
- Monthly baseline: median of the previous 6 completed months; require 3 usable periods.
- The immediately preceding completed period is retained separately.
- Empty periods after tracking begins count as zero; pre-tracking periods are missing.

```text
PreviousDeltaAmount = Current - Previous
PreviousDeltaPct = (Current - Previous) / Previous * 100
BaselineDeltaAmount = Current - BaselineMedian
BaselineDeltaPct = (Current - BaselineMedian) / BaselineMedian * 100
ShareDeltaPoints = CurrentShare - BaselineMedianShare
RateDeltaPoints = CurrentRate - BaselineMedianRate
```

Percentage deltas are null when their comparator is zero; the comparison is marked `NewActivity` or `StoppedActivity`. A category change is material when current share is at least 5% and its absolute delta is at least the greater of 2% of current consumption or 2% of baseline consumption. A new category is noteworthy only at a current share of at least 10%.

## Deterministic classifications

- Operating surplus below zero: Alert / Critical / Negative.
- Savings rate 0–<10%: Warning / NeedsAttention; 10–<20%: Nudge / Watch; at least 20%: Info / Healthy.
- Savings-rate decline of at least 10 percentage points: Warning; 5–<10 points: Nudge. Improvement of at least 5 points is positive when the absolute rate is not unhealthy.
- Consumption increase 10–<20%: Nudge; 20–<30%: Warning; at least 30%: Warning / Risky.
- Consumption decrease of at least 10% is positive only when discretionary reductions drive at least half of it, essential spend did not fall more than 20%, and income did not fall at least 10%.
- Income decline 10–<20%: Nudge; at least 20%: Warning. An increase of at least 10% is positive only with non-negative operating surplus.
- Discretionary share at least 50% or an increase of at least 10 points: Warning. A 40–<50% share or increase of 5–<10 points: Nudge. A decrease of at least 5 points is positive.
- Category increase at least 30%, share increase at least 3 points, current share at least 5%, and materiality satisfied: Warning. At least 60% increase and 10% share: Risky. A discretionary decrease of at least 20% and share decrease of at least 3 points is positive.
- Uncategorized share 10–20%: data-quality Nudge; above 20%: data-quality Warning, not financial failure.

At most one cashflow/savings, one consumption, one discretionary, one income, and three material category findings are produced per report. Essential spending, debt repayment, and savings allocations are not automatically described as harmful.

Overall direction is `Worsened` for any negative Alert or at least two negative Warnings; `Improved` for material positive evidence with no negative Warning/Alert; `Stable` otherwise; and `InsufficientData` when no trend is evaluable and no absolute health condition applies.

## Lifecycle and narration boundary

The stable issue key is scope + cadence + rule code + subject key. A recurring observation supersedes the previous one; a missing issue in the next conclusive report resolves it. Low-confidence evaluation does not resolve an issue without evidence. Weekly observations expire after 14 days and monthly observations after 62 days. Resolved/superseded observations remain in their historical report but are excluded from the active feed.

Only stored aggregates, comparisons, classifications, action codes, and category names may be sent for narration. Raw transactions, source text, merchants, and identity data are excluded. Personal narration requires the user's consent; household narration requires the household owner's consent. Missing consent or exhausted provider retries publishes deterministic fallback wording.
