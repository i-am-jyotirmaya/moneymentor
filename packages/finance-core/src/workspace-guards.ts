import { isTransaction } from './client.ts';
import type { Commitment, Goal, GoalDetail, GoalPlanVersion, GoalPlanningRun, HouseholdDashboard, HouseholdInvitation, HouseholdSummary, JudgementReport, JudgementReportObservation, MonthlyDashboardResponse } from './workspace-models.ts';

const text = (value: unknown): value is string => typeof value === 'string';
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nullableNumber = (value: unknown) => value === null || number(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
const currency = (value: unknown) => text(value) && /^[A-Z]{3}$/.test(value);
const zone = (value: unknown) => { if (!text(value)) return false; try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } };

export const validHousehold = (value: HouseholdSummary | null): boolean => !!value && text(value.id) && !!value.id && text(value.name)
  && ['Personal', 'Family'].includes(value.kind) && ['Owner', 'Admin', 'Member', 'Viewer'].includes(value.role)
  && ['Pending', 'Active', 'Removed'].includes(value.status) && typeof value.canWrite === 'boolean' && Number.isSafeInteger(value.memberCount)
  && value.memberCount >= 0 && currency(value.currencyCode) && zone(value.timeZone);
export const validHouseholds = (value: HouseholdDashboard | null): boolean => !!value && text(value.defaultHouseholdId)
  && ['Free', 'Premium'].includes(value.plan) && typeof value.canUseHouseholds === 'boolean' && Array.isArray(value.households) && value.households.every(validHousehold);
export const validInvitation = (value: HouseholdInvitation | null): boolean => !!value && text(value.id) && text(value.householdId)
  && text(value.householdName) && text(value.email) && text(value.invitedByDisplayName) && text(value.expiresAt)
  && ['Owner', 'Admin', 'Member', 'Viewer'].includes(value.role) && ['Pending', 'Accepted', 'Declined', 'Expired'].includes(value.status)
  && ['Unknown', 'Queued', 'Processing', 'Sent', 'Failed'].includes(value.deliveryStatus);
export const validGoal = (value: Goal | null): boolean => !!value && text(value.id) && text(value.householdId) && text(value.name)
  && (value.userProfileId === null || text(value.userProfileId)) && ['Saving', 'DebtPayoff', 'Purchase', 'Investment', 'EmergencyFund'].includes(value.goalType)
  && ['Low', 'Medium', 'High'].includes(value.priority) && ['Active', 'Completed', 'Paused', 'Cancelled'].includes(value.status)
  && number(value.targetAmount) && value.targetAmount > 0 && number(value.currentAmount) && number(value.remainingAmount)
  && nullableNumber(value.requiredMonthlyContribution) && nullableNumber(value.monthlyTarget)
  && (value.targetDate === null || text(value.targetDate)) && (value.projectedCompletionDate === null || text(value.projectedCompletionDate));
export const validPlanVersion = (value: GoalPlanVersion | null): boolean => !!value && text(value.id) && number(value.versionNumber) && text(value.source)
  && Array.isArray(value.options) && value.options.every(option => !!option && text(option.id) && text(option.title) && text(option.explanation)
    && text(option.pace) && text(option.feasibility) && number(option.monthlyContribution) && text(option.projectedCompletionDate)
    && strings(option.risks) && strings(option.assumptions) && strings(option.tradeOffs) && Array.isArray(option.milestones)
    && option.milestones.every(item => !!item && text(item.label) && text(item.targetDate) && number(item.targetAmount)));
export const validGoalDetail = (value: GoalDetail | null): boolean => !!value && validGoal(value.goal)
  && (value.plan === null || (!!value.plan && Array.isArray(value.plan.versions) && value.plan.versions.every(validPlanVersion)))
  && (value.currentUserConsent === null || (!!value.currentUserConsent && value.currentUserConsent.goalId === value.goal.id && (value.currentUserConsent.revokedAt === null || text(value.currentUserConsent.revokedAt))));
export const validPlanningRun = (value: GoalPlanningRun | null): boolean => !!value && text(value.id) && text(value.goalId)
  && ['Generate', 'Review'].includes(value.runType) && ['Pending', 'Processing', 'Succeeded', 'Failed', 'Cancelled'].includes(value.status)
  && (value.result === null || validPlanVersion(value.result));
export const validCommitment = (value: Commitment | null): boolean => !!value && text(value.id) && text(value.householdId) && text(value.name)
  && number(value.amount) && value.amount > 0 && ['Expense', 'Investment'].includes(value.transactionType)
  && ['Monthly', 'Quarterly', 'Annual'].includes(value.cadence) && text(value.nextDueDate) && typeof value.isActive === 'boolean';
export const validObservation = (value: JudgementReportObservation | null): boolean => !!value && text(value.id) && text(value.title)
  && text(value.message) && text(value.value) && text(value.severity) && text(value.direction) && text(value.status) && typeof value.isDismissed === 'boolean';
export const validReport = (value: JudgementReport | null): boolean => !!value && text(value.id) && text(value.householdId) && text(value.period)
  && ['Personal', 'Household'].includes(value.scope) && ['Weekly', 'Monthly'].includes(value.cadence) && currency(value.currencyCode)
  && text(value.startDate) && text(value.endDateExclusive) && zone(value.timeZone) && text(value.direction) && text(value.confidence)
  && strings(value.dataQualityFlags) && Array.isArray(value.metrics) && value.metrics.every(metric => !!metric && text(metric.code) && nullableNumber(metric.current) && nullableNumber(metric.previousDeltaPercent))
  && Array.isArray(value.categories) && value.categories.every(item => !!item && text(item.subjectKey) && text(item.name) && number(item.amount) && number(item.transactionCount))
  && Array.isArray(value.judgements) && value.judgements.every(validObservation)
  && (value.narration === null || (!!value.narration && text(value.narration.headline) && text(value.narration.overview) && strings(value.narration.whatChanged) && strings(value.narration.focusAreas) && strings(value.narration.actions)));
export const validDashboard = (value: MonthlyDashboardResponse | null): boolean => !!value && text(value.month) && currency(value.currencyCode)
  && [value.income, value.spends, value.invested, value.saved].every(number) && nullableNumber(value.savingsRate)
  && Array.isArray(value.categories) && value.categories.every(item => !!item && text(item.name) && number(item.amount) && nullableNumber(item.budget) && text(item.tone) && text(item.note))
  && Array.isArray(value.judgements) && value.judgements.every(item => !!item && text(item.title) && text(item.text) && text(item.tone) && text(item.value))
  && Array.isArray(value.insights) && value.insights.every(item => !!item && text(item.title) && text(item.text))
  && Array.isArray(value.recentTransactions) && value.recentTransactions.every(isTransaction);
