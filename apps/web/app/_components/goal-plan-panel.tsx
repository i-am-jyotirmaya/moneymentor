"use client";
import type { GoalPlanPace } from "@/lib/api";
import type { usePlanningController } from "../_hooks/use-planning-controller";
import { EmptyInline } from "./common-ui";
import { formatDate, formatMoney } from "./workspace-format";
type Props = Pick<
  ReturnType<typeof usePlanningController>,
  | "canWrite"
  | "currencyCode"
  | "goalDetail"
  | "planningRun"
  | "isPlanningWorking"
  | "planForm"
  | "setPlanForm"
  | "customizationContext"
  | "setCustomizationContext"
  | "handleGeneratePlan"
  | "handleActivate"
  | "handleCustomize"
  | "handleReview"
  | "handleConsent"
>;
export function GoalPlanPanel({
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
}: Props) {
  return (
    <article
      id="goal-plan"
      className="mt-5 rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">AI goal planner</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Based on calculated aggregates from your tracked finances. AI
            explains the plan; Spndrr calculates the amounts.
          </p>
        </div>
        {planningRun ? (
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
            {planningRun.runType} · {planningRun.status}
          </span>
        ) : null}
      </div>

      {!goalDetail ? (
        <div className="mt-4">
          <EmptyInline text="Select a goal to generate or review a plan." />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--surface)] p-3">
            <div>
              <p className="text-sm font-bold">{goalDetail.goal.name}</p>
              <p className="text-xs font-semibold text-[var(--muted)]">
                {formatMoney(goalDetail.goal.remainingAmount, currencyCode)}{" "}
                remaining
                {goalDetail.plan?.activeVersionId
                  ? " · following a plan"
                  : " · no followed plan"}
              </p>
            </div>
            {goalDetail.goal.userProfileId === null ? (
              <button
                className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs font-bold disabled:opacity-50"
                disabled={isPlanningWorking}
                onClick={() => void handleConsent()}
                type="button"
              >
                {goalDetail.currentUserConsent?.revokedAt === null
                  ? "Revoke private aggregate consent"
                  : "Opt in private aggregates"}
              </button>
            ) : null}
          </div>

          <form
            className="mt-4 grid gap-3 md:grid-cols-4"
            onSubmit={handleGeneratePlan}
          >
            <label className="text-xs font-bold text-[var(--muted)]">
              Pace (optional)
              <select
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--ink)]"
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    pace: event.target.value as "" | GoalPlanPace,
                  }))
                }
                value={planForm.pace}
              >
                <option value="">Show three paces</option>
                <option value="Comfortable">Comfortable</option>
                <option value="Balanced">Balanced</option>
                <option value="Aggressive">Aggressive</option>
              </select>
            </label>
            <label className="text-xs font-bold text-[var(--muted)]">
              Target date (optional)
              <input
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--ink)]"
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    targetDate: event.target.value,
                  }))
                }
                type="date"
                value={planForm.targetDate}
              />
            </label>
            <label className="text-xs font-bold text-[var(--muted)]">
              Monthly amount (optional)
              <input
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--ink)]"
                min="0.01"
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    monthlyContribution: event.target.value,
                  }))
                }
                step="0.01"
                type="number"
                value={planForm.monthlyContribution}
              />
            </label>
            <button
              className="self-end rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              disabled={
                !canWrite ||
                isPlanningWorking ||
                ["Pending", "Processing"].includes(planningRun?.status ?? "")
              }
              type="submit"
            >
              Generate plan
            </button>
          </form>

          {goalDetail.plan?.versions.length ? (
            <div className="mt-5 space-y-5">
              {goalDetail.plan.versions.map((version) => (
                <section
                  className="rounded-lg border border-[var(--border)] p-4"
                  key={version.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold">
                      Version {version.versionNumber} · {version.source}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                        disabled={isPlanningWorking}
                        onClick={() => void handleReview(version)}
                        type="button"
                      >
                        Review with AI
                      </button>
                      <button
                        className="rounded-md bg-[var(--ink)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                        disabled={
                          isPlanningWorking ||
                          goalDetail.plan?.activeVersionId === version.id
                        }
                        onClick={() => void handleActivate(version)}
                        type="button"
                      >
                        {goalDetail.plan?.activeVersionId === version.id
                          ? "Following"
                          : "Follow this version"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    {version.options.map((option) => (
                      <div
                        className="rounded-lg bg-[var(--surface)] p-3"
                        key={option.id}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold">{option.title}</p>
                          <span className="text-xs font-bold text-[var(--accent)]">
                            {option.pace}
                          </span>
                        </div>
                        <p className="mt-2 text-xl font-semibold">
                          {formatMoney(
                            option.monthlyContribution,
                            currencyCode,
                          )}
                          /mo
                        </p>
                        <p className="text-xs font-semibold text-[var(--muted)]">
                          Target {formatDate(option.projectedCompletionDate)} ·{" "}
                          {option.feasibility}
                        </p>
                        <p className="mt-3 text-sm text-[var(--muted)]">
                          {option.explanation}
                        </p>
                        {option.risks.length ? (
                          <ul className="mt-3 list-disc space-y-1 pl-4 text-xs font-medium text-amber-800">
                            {option.risks.map((risk) => (
                              <li key={risk}>{risk}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                    <textarea
                      aria-label="Plan customization context"
                      className="min-h-20 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      maxLength={1000}
                      onChange={(event) =>
                        setCustomizationContext(event.target.value)
                      }
                      placeholder="Optional context for a customized version, for example: keep more room for school fees."
                      value={customizationContext}
                    />
                    <button
                      className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-bold disabled:opacity-50"
                      disabled={isPlanningWorking}
                      onClick={() => void handleCustomize(version)}
                      type="button"
                    >
                      Save customization
                    </button>
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyInline text="No plan versions yet." />
            </div>
          )}
        </>
      )}
      <p className="mt-4 text-xs font-medium text-[var(--muted)]">
        Guidance is based on tracked data and is not a guarantee or certified
        financial advice. Review assumptions before following a plan.
      </p>
    </article>
  );
}
