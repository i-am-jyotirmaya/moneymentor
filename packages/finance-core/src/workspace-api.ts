import { ApiError, type FinanceClient } from './client.ts';
import type { Category, FinancialAccount, Transaction, UserSettings } from './models.ts';
import type {
  Commitment, CommitmentPatch, ContributionInput, CreateCategory, CreateCommitment, CreateGoal,
  Goal, GoalContribution, GoalDetail, GoalParticipantConsent, GoalPatch, GoalPlanningRun,
  GoalPlanPace, GoalPlanVersion, HouseholdDashboard, HouseholdInvitation, HouseholdRole,
  HouseholdSummary, Judgement, JudgementReport, JudgementReportObservation,
  MonthlyDashboardResponse, PlanningInput, ReportQuery, SaveFinancialAccount, SettingsPatch,
} from './workspace-models.ts';

const id = encodeURIComponent;
const query = (values: Record<string, string | number | undefined>) => {
  const parts = Object.entries(values).filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${id(key)}=${id(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};
const identified = (value: unknown): value is { id: string } => !!value && typeof value === 'object'
  && 'id' in value && typeof value.id === 'string' && value.id.length > 0;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
async function confirm<T>(operation: Promise<T>, valid: (value: T) => boolean, subject: string): Promise<T> {
  const value = await operation;
  if (!valid(value)) throw new ApiError(`The ${subject} response could not be verified. Refresh the saved data before trying again.`, 0, 'unknown');
  return value;
}
const planningHeaders = (reference: string) => {
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(reference)) throw new ApiError('A stable operation reference is required.');
  return { 'Idempotency-Key': reference };
};

/** Existing feature endpoints, using the same session and no automatic mutation retry. */
export function workspaceApi(client: FinanceClient) {
  return {
    dashboard: (month: string, householdId?: string) => client.request<MonthlyDashboardResponse>(`/api/dashboard/monthly${query({ month, householdId })}`),
    transaction: (transactionId: string) => client.request<Transaction>(`/api/transactions/${id(transactionId)}`),
    trash: (householdId?: string) => client.request<{ items: Transaction[] }>(`/api/transactions/trash${query({ householdId })}`),
    deleteTransaction: (transactionId: string) => confirm(client.request<Transaction>(`/api/transactions/${id(transactionId)}`, 'DELETE'), value => identified(value) && value.id === transactionId && !!value.deletedAt, 'deleted transaction'),
    restoreTransaction: (transactionId: string) => confirm(client.request<Transaction>(`/api/transactions/${id(transactionId)}/restore`, 'POST'), value => identified(value) && value.id === transactionId && !value.deletedAt, 'restored transaction'),
    updateSettings: (patch: SettingsPatch) => confirm(client.request<UserSettings>('/api/settings/me', 'PATCH', patch), value => !!value && typeof value.userProfileId === 'string' && typeof value.currencyCode === 'string' && typeof value.timeZone === 'string', 'settings'),
    saveAccount: (input: SaveFinancialAccount, accountId?: string) => confirm(client.request<FinancialAccount>(`/api/financial-accounts${accountId ? `/${id(accountId)}` : ''}`, accountId ? 'PUT' : 'POST', input), value => identified(value) && (!accountId || value.id === accountId) && value.accountType === input.accountType && value.name === input.name.trim(), 'account'),
    createCategory: (input: CreateCategory) => confirm(client.request<Category>('/api/categories', 'POST', input), value => identified(value) && value.type === input.type && value.name === input.name.trim(), 'category'),
    updateCategory: (categoryId: string, patch: Partial<Pick<Category, 'name' | 'parentCategoryId' | 'classification' | 'icon' | 'sortOrder' | 'isHidden'>>) => confirm(client.request<Category>(`/api/categories/${id(categoryId)}`, 'PATCH', patch), value => identified(value) && value.id === categoryId, 'category'),
    deleteCategory: (categoryId: string) => client.request<void>(`/api/categories/${id(categoryId)}`, 'DELETE'),
    goals: (householdId?: string) => client.request<Goal[]>(`/api/goals${query({ householdId })}`),
    goal: (goalId: string) => client.request<GoalDetail>(`/api/goals/${id(goalId)}`),
    createGoal: (input: CreateGoal) => confirm(client.request<Goal>('/api/goals', 'POST', input), value => identified(value) && value.targetAmount === input.targetAmount && positive(value.targetAmount), 'goal'),
    updateGoal: (goalId: string, patch: GoalPatch) => confirm(client.request<Goal>(`/api/goals/${id(goalId)}`, 'PATCH', patch), value => identified(value) && value.id === goalId && positive(value.targetAmount), 'goal'),
    contribute: (goalId: string, input: ContributionInput) => confirm(client.request<GoalContribution>(`/api/goals/${id(goalId)}/contributions`, 'POST', input), value => identified(value) && value.goalId === goalId && value.amount === input.amount && positive(value.amount), 'goal contribution'),
    startPlan: (goalId: string, input: PlanningInput, reference: string) => confirm(client.request<GoalPlanningRun>(`/api/goals/${id(goalId)}/planning-runs`, 'POST', input, planningHeaders(reference)), value => identified(value) && value.goalId === goalId, 'planning run'),
    planningRun: (goalId: string, runId: string) => client.request<GoalPlanningRun>(`/api/goals/${id(goalId)}/planning-runs/${id(runId)}`),
    activatePlan: (goalId: string, versionId: string, reference: string) => confirm(client.request<GoalPlanVersion>(`/api/goals/${id(goalId)}/plans/${id(versionId)}/activate`, 'POST', undefined, planningHeaders(reference)), value => identified(value) && value.id === versionId, 'active plan'),
    customizePlan: (goalId: string, versionId: string, input: { pace: GoalPlanPace; targetDate?: string; monthlyContribution?: number; context?: string }) => confirm(client.request<GoalPlanVersion>(`/api/goals/${id(goalId)}/plans/${id(versionId)}/customizations`, 'POST', input), identified, 'customized plan'),
    reviewPlan: (goalId: string, versionId: string, reference: string, locale = 'en-IN') => confirm(client.request<GoalPlanningRun>(`/api/goals/${id(goalId)}/plans/${id(versionId)}/review-runs`, 'POST', { locale }, planningHeaders(reference)), value => identified(value) && value.goalId === goalId, 'plan review'),
    consent: (goalId: string) => client.request<GoalParticipantConsent | null>(`/api/goals/${id(goalId)}/participant-consent`),
    grantConsent: (goalId: string) => confirm(client.request<GoalParticipantConsent>(`/api/goals/${id(goalId)}/participant-consent`, 'PUT'), value => !!value && value.goalId === goalId && !value.revokedAt, 'participant consent'),
    revokeConsent: (goalId: string) => client.request<void>(`/api/goals/${id(goalId)}/participant-consent`, 'DELETE'),
    commitments: (householdId?: string) => client.request<Commitment[]>(`/api/commitments${query({ householdId })}`),
    createCommitment: (input: CreateCommitment) => confirm(client.request<Commitment>('/api/commitments', 'POST', input), value => identified(value) && value.amount === input.amount && positive(value.amount), 'commitment'),
    updateCommitment: (commitmentId: string, patch: CommitmentPatch) => confirm(client.request<Commitment>(`/api/commitments/${id(commitmentId)}`, 'PATCH', patch), value => identified(value) && value.id === commitmentId && positive(value.amount), 'commitment'),
    judgements: (month: string, householdId?: string) => client.request<Judgement[]>(`/api/judgements${query({ month, householdId })}`),
    activeJudgements: (input: Omit<ReportQuery, 'period' | 'cadence'> & { cadence?: ReportQuery['cadence'] }) => client.request<JudgementReportObservation[]>(`/api/judgements/active${query(input)}`),
    dismissJudgement: (judgementId: string) => client.request<void>(`/api/judgements/${id(judgementId)}/dismiss`, 'POST'),
    explainJudgement: (judgementId: string, text: string) => client.request<{ feedbackId: string }>(`/api/judgements/${id(judgementId)}/explanations`, 'POST', { text, shareWithHousehold: false }),
    report: (input: ReportQuery) => client.request<JudgementReport>(`/api/judgement-reports${query(input)}`),
    reportHistory: (input: Omit<ReportQuery, 'period'> & { before?: string; limit?: number }) => client.request<JudgementReport[]>(`/api/judgement-reports/history${query(input)}`),
    households: () => client.request<HouseholdDashboard>('/api/households'),
    createHousehold: (name: string) => confirm(client.request<HouseholdSummary>('/api/households', 'POST', { name }), identified, 'household'),
    updateHousehold: (householdId: string, input: { currencyCode: string; timeZone: string }) => confirm(client.request<HouseholdSummary>(`/api/households/${id(householdId)}/settings`, 'PATCH', input), value => identified(value) && value.id === householdId, 'household settings'),
    invitations: () => client.request<HouseholdInvitation[]>('/api/households/invitations'),
    sentInvitations: (householdId: string) => client.request<HouseholdInvitation[]>(`/api/households/${id(householdId)}/invitations`),
    invite: (householdId: string, email: string, role: HouseholdRole) => confirm(client.request<HouseholdInvitation>(`/api/households/${id(householdId)}/invitations`, 'POST', { email, role }), identified, 'invitation'),
    respondToInvitation: (invitationId: string, response: 'accept' | 'decline') => confirm(client.request<HouseholdInvitation>(`/api/households/invitations/${id(invitationId)}/${response}`, 'POST'), value => identified(value) && value.id === invitationId, 'invitation response'),
    exportData: () => client.request<unknown>('/api/privacy/export'),
    deleteAccount: (password: string) => client.request<void>('/api/privacy/account', 'DELETE', { password, confirmation: 'DELETE' }),
  };
}
