"use client";
import { Flag } from "lucide-react";
import {
  usePlanningController,
  type PlanningSectionProps,
} from "../_hooks/use-planning-controller";
import { EmptyInline } from "./common-ui";
import { GoalCreateForm } from "./goal-create-form";
import { GoalPlanPanel } from "./goal-plan-panel";
import { formatDate, formatMoney } from "./workspace-format";
export function PlanningSection(props: PlanningSectionProps) {
  const {
    canWrite,
    commitments,
    currencyCode,
    judgements,
    updateQuery,
    selectedGoalId,
    goalDetail,
    planningRun,
    isPlanningWorking,
    planningNotice,
    goalForm,
    setGoalForm,
    planForm,
    setPlanForm,
    customizationContext,
    setCustomizationContext,
    visibleGoals,
    handleCreateGoal,
    handleGeneratePlan,
    handleActivate,
    handleCustomize,
    handleReview,
    handleConsent,
    visibleGroups,
  } = usePlanningController(props);
  return (
    <section className="min-h-full overflow-y-auto px-4 py-4 lg:px-0 lg:py-0">
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal">
                Planning
              </h2>
              <p className="mt-1 text-sm font-medium text-[var(--muted)]">
                Goals, SIPs, premiums, and rule-based nudges in one place.
              </p>
            </div>
            <Flag className="h-5 w-5 text-[var(--accent)]" />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <PlanningStat
              label="Active goals"
              value={visibleGoals
                .filter((goal) => goal.status === "Active")
                .length.toString()}
            />
            <PlanningStat
              label="Commitments"
              value={commitments
                .filter((commitment) => commitment.isActive)
                .length.toString()}
            />
            <PlanningStat
              label="Judgements"
              value={judgements.length.toString()}
            />
          </div>

          {!canWrite ? (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
              This household is read-only for you. Planning data is visible, but
              changes are disabled.
            </p>
          ) : null}

          {canWrite ? (
            <GoalCreateForm
              {...{
                isPlanningWorking,
                goalForm,
                setGoalForm,
                handleCreateGoal,
              }}
            />
          ) : null}
          {planningNotice ? (
            <p
              className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"
              role="status"
            >
              {planningNotice}
            </p>
          ) : null}
        </article>

        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Current nudges</h3>
          <div className="mt-4 space-y-3">
            {judgements.length > 0 ? (
              judgements.slice(0, 4).map((judgement) => (
                <div
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
                  key={judgement.id ?? judgement.title}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold">{judgement.title}</p>
                    <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-[var(--muted)]">
                      {judgement.severity ?? judgement.tone}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {judgement.text}
                  </p>
                </div>
              ))
            ) : (
              <EmptyInline text="No planning nudges for this month yet." />
            )}
          </div>
        </article>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Goals</h3>
          <div className="mt-4 space-y-3">
            {visibleGoals.length > 0 ? (
              visibleGoals.slice(0, 8).map((goal) => (
                <button
                  className={`w-full rounded-lg border p-3 text-left ${selectedGoalId === goal.id ? "border-[var(--accent)] bg-emerald-50/40" : "border-[var(--border)]"}`}
                  key={goal.id}
                  onClick={() => updateQuery({ goal: goal.id }, "goal-plan")}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">{goal.name}</p>
                      <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                        {goal.goalType} - {goal.priority} priority -{" "}
                        {goal.status}
                      </p>
                    </div>
                    <span className="text-sm font-bold">
                      {formatMoney(goal.currentAmount, currencyCode)}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{
                        width: `${Math.min(100, Math.round((goal.currentAmount / Math.max(goal.targetAmount, 1)) * 100))}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs font-medium text-[var(--muted)]">
                    {formatMoney(goal.remainingAmount, currencyCode)} left
                    {goal.requiredMonthlyContribution
                      ? ` - needs ${formatMoney(goal.requiredMonthlyContribution, currencyCode)}/mo`
                      : ""}
                  </p>
                </button>
              ))
            ) : (
              <EmptyInline text="No goals yet. Create your first goal above." />
            )}
          </div>
        </article>

        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Commitments</h3>
          <div className="mt-4 space-y-3">
            {commitments.length > 0 ? (
              commitments.slice(0, 6).map((commitment) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3"
                  key={commitment.id}
                >
                  <div>
                    <p className="text-sm font-bold">{commitment.name}</p>
                    <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                      {commitment.transactionType} - {commitment.cadence} - due{" "}
                      {formatDate(commitment.nextDueDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">
                      {formatMoney(commitment.amount, currencyCode)}
                    </p>
                    <p
                      className={`text-xs font-bold ${commitment.isActive ? "text-emerald-600" : "text-slate-500"}`}
                    >
                      {commitment.isActive ? "Active" : "Paused"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyInline text="No recurring commitments tracked yet." />
            )}
          </div>
        </article>
      </div>

      <GoalPlanPanel
        {...{
          canWrite,
          currencyCode,
          goalDetail,
          planningRun,
          isPlanningWorking,
          planForm,
          setPlanForm,
          customizationContext,
          setCustomizationContext,
          handleGeneratePlan,
          handleActivate,
          handleCustomize,
          handleReview,
          handleConsent,
        }}
      />

      <article className="mt-5 rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold">Category groups</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visibleGroups.length > 0 ? (
            visibleGroups.map((group) => (
              <div
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
                key={group.id}
              >
                <p className="text-sm font-bold">{group.name}</p>
                <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                  {group.classification} - {group.childCount} categories
                </p>
              </div>
            ))
          ) : (
            <EmptyInline text="Categories will appear after the catalog is loaded." />
          )}
        </div>
      </article>
    </section>
  );
}

export function PlanningStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
