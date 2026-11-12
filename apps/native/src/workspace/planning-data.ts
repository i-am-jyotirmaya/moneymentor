import type { Category } from '../api/models';
import type { CreateGoal, Goal, GoalPlanningRun, PlanningInput } from '../api/workspace-models';
export const emptyGoalForm = () => ({ name: '', goalType: 'Saving' as Goal['goalType'], targetAmount: '', targetDate: '', priority: 'Medium' as Goal['priority'], isShared: false });
export const emptyPlanForm = () => ({ pace: '' as '' | NonNullable<PlanningInput['pace']>, targetDate: '', monthlyContribution: '' });
export function validPlanningDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validPlanningAmount(value: string) {
  const amount = Number(value);
  return /^\d+(\.\d{1,2})?$/.test(value) && Number.isFinite(amount) && amount >= 0.01;
}
export function goalValidation(form: ReturnType<typeof emptyGoalForm>): string | null {
  if (!form.name.trim() || form.name.length > 128) return 'Enter a goal name of up to 128 characters.';
  if (!validPlanningAmount(form.targetAmount)) return 'Enter a valid target amount.';
  if (form.targetDate && !validPlanningDate(form.targetDate)) return 'Enter a valid target date (YYYY-MM-DD).';
  return null;
}
export function planValidation(form: ReturnType<typeof emptyPlanForm>): string | null {
  if (form.targetDate && !validPlanningDate(form.targetDate)) return 'Enter a valid target date (YYYY-MM-DD).';
  if (form.monthlyContribution && !validPlanningAmount(form.monthlyContribution)) return 'Enter a valid monthly amount.';
  return null;
}
export function goalPayload(form: ReturnType<typeof emptyGoalForm>, householdId: string): CreateGoal {
  return { ...form, name: form.name.trim(), targetAmount: Number(form.targetAmount), targetDate: form.targetDate || undefined, householdId };
}
export function planPayload(form: ReturnType<typeof emptyPlanForm>): PlanningInput {
  return { pace: form.pace || undefined, targetDate: form.targetDate || undefined, monthlyContribution: form.monthlyContribution ? Number(form.monthlyContribution) : undefined, locale: 'en-IN' };
}
export const planningPending = (run: GoalPlanningRun | null) => !!run && ['Pending', 'Processing'].includes(run.status);
export const goalProgress = (goal: Goal) => Math.min(100, Math.round(goal.currentAmount / Math.max(goal.targetAmount, 1) * 100));
export function planningGroups(categories: Category[]) {
  return categories.filter(c => c.parentCategoryId === null && !c.isHidden).map(group => ({ ...group, childCount: categories.filter(c => c.parentCategoryId === group.id && !c.isHidden).length })).slice(0, 8);
}

let requestSequence = 0;
// Opaque idempotency keys need uniqueness, not a native crypto dependency.
export const planningRequestKey = () => `planning-${Date.now()}-${++requestSequence}-${Math.random().toString(36).slice(2)}`;
