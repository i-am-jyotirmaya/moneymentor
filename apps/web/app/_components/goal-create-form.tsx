"use client";
import type { Goal } from "@/lib/api";
import type { usePlanningController } from "../_hooks/use-planning-controller";
import { Dropdown } from "./dropdown";
type Props = Pick<
  ReturnType<typeof usePlanningController>,
  "isPlanningWorking" | "goalForm" | "setGoalForm" | "handleCreateGoal"
>;
export function GoalCreateForm({
  isPlanningWorking,
  goalForm,
  setGoalForm,
  handleCreateGoal,
}: Props) {
  return (
    <form
      className="mt-5 grid gap-3 sm:grid-cols-2"
      onSubmit={handleCreateGoal}
    >
      <label className="text-xs font-bold text-[var(--muted)]">
        Goal
        <input
          className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--ink)]"
          maxLength={128}
          onChange={(event) =>
            setGoalForm((current) => ({
              ...current,
              name: event.target.value,
            }))
          }
          placeholder="Emergency fund"
          required
          value={goalForm.name}
        />
      </label>
      <label className="text-xs font-bold text-[var(--muted)]">
        Target amount
        <input
          className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--ink)]"
          min="0.01"
          onChange={(event) =>
            setGoalForm((current) => ({
              ...current,
              targetAmount: event.target.value,
            }))
          }
          required
          step="0.01"
          type="number"
          value={goalForm.targetAmount}
        />
      </label>
      <Dropdown
        label="Goal type"
        onChange={(value) => setGoalForm((current) => ({ ...current, goalType: value as Goal["goalType"] }))}
        options={[
          { value: "Saving", label: "Saving" },
          { value: "EmergencyFund", label: "Emergency fund" },
          { value: "DebtPayoff", label: "Debt payoff" },
          { value: "Purchase", label: "Purchase" },
          { value: "Investment", label: "Investment" },
        ]}
        value={goalForm.goalType}
      />
      <label className="text-xs font-bold text-[var(--muted)]">
        Target date (optional)
        <input
          className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--ink)]"
          onChange={(event) =>
            setGoalForm((current) => ({
              ...current,
              targetDate: event.target.value,
            }))
          }
          type="date"
          value={goalForm.targetDate}
        />
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          checked={goalForm.isShared}
          onChange={(event) =>
            setGoalForm((current) => ({
              ...current,
              isShared: event.target.checked,
            }))
          }
          type="checkbox"
        />
        Share with household
      </label>
      <button
        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        disabled={isPlanningWorking}
        type="submit"
      >
        Create goal
      </button>
    </form>
  );
}
