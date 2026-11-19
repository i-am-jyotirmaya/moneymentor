import { FinanceClient, type HttpRequest } from '../src/api/client';
import { emptyGoalForm, emptyPlanForm, goalPayload, goalValidation, planPayload, planValidation, validPlanningDate, validPlanningAmount, planningPending, planningRequestKey, planningGroups, goalProgress } from '../src/workspace/planning-data';
import type { Goal, GoalPlanningRun } from '../src/api/workspace-models';
import type { Category } from '../src/api/models';
async function setup(status = 200) {
  const requests: HttpRequest[] = [];
  const client = new FinanceClient(async request => {
    requests.push(request);
    return request.path === '/api/auth/login' ? { status: 200, data: { accessToken: 'token', accessTokenExpiresAt: '2099-01-01', requiresPrivacyConsent: false, user: { id: 'u', displayName: 'Person' } } } : { status, data: status === 200 ? {} : { errors: ['Not allowed.'] } };
  }, async () => {});
  await client.login('p@example.test', 'password');
  return { client, requests };
}
async function calls(client: FinanceClient) {
  const input = goalPayload({ ...emptyGoalForm(), name: ' Fund ', targetAmount: '100.50' }, 'home');
  await client.listGoals('a & b'); await client.listCommitments('a & b'); await client.createGoal(input); await client.getGoal('a/b');
  await client.createGoalPlanningRun('a/b', { pace: 'Balanced', locale: 'en-IN' }, 'generate-key');
  await client.getGoalPlanningRun('a/b', 'r/s'); await client.activateGoalPlan('a/b', 'v/s', 'activate-key');
  await client.customizeGoalPlan('a/b', 'v/s', { pace: 'Balanced', monthlyContribution: 100, context: 'School fees' });
  await client.reviewGoalPlan('a/b', 'v/s', 'review-key'); await client.putGoalParticipantConsent('a/b'); await client.deleteGoalParticipantConsent('a/b');
}
test('planning calls mirror web paths, methods, payloads and idempotency headers', async () => {
  const { client, requests } = await setup(); await calls(client);
  expect(requests.slice(1).map(({ path, method, body, headers }) => ({ path, method, body, headers }))).toEqual([
    { path: '/api/goals?householdId=a%20%26%20b', method: 'GET' },
    { path: '/api/commitments?householdId=a%20%26%20b', method: 'GET' },
    { path: '/api/goals', method: 'POST', body: goalPayload({ ...emptyGoalForm(), name: ' Fund ', targetAmount: '100.50' }, 'home') },
    { path: '/api/goals/a%2Fb', method: 'GET' },
    { path: '/api/goals/a%2Fb/planning-runs', method: 'POST', body: { pace: 'Balanced', locale: 'en-IN' }, key: 'generate-key' },
    { path: '/api/goals/a%2Fb/planning-runs/r%2Fs', method: 'GET' },
    { path: '/api/goals/a%2Fb/plans/v%2Fs/activate', method: 'POST', key: 'activate-key' },
    { path: '/api/goals/a%2Fb/plans/v%2Fs/customizations', method: 'POST', body: { pace: 'Balanced', monthlyContribution: 100, context: 'School fees' } },
    { path: '/api/goals/a%2Fb/plans/v%2Fs/review-runs', method: 'POST', body: { locale: 'en-IN' }, key: 'review-key' },
    { path: '/api/goals/a%2Fb/participant-consent', method: 'PUT' },
    { path: '/api/goals/a%2Fb/participant-consent', method: 'DELETE' },
  ].map(({ key, ...request }) => ({ body: undefined, ...request, headers: { Authorization: 'Bearer token', ...(key ? { 'Idempotency-Key': key } : {}) } })));
});
test('every planning endpoint propagates server rejection', async () => {
  const { client } = await setup(403);
  const operations = [() => client.listGoals('h'), () => client.listCommitments('h'), () => client.createGoal(goalPayload({ ...emptyGoalForm(), name: 'Fund', targetAmount: '1' }, 'h')), () => client.getGoal('g'), () => client.createGoalPlanningRun('g', {}, 'key'), () => client.getGoalPlanningRun('g', 'r'), () => client.activateGoalPlan('g', 'v', 'key'), () => client.customizeGoalPlan('g', 'v', { pace: 'Balanced' }), () => client.reviewGoalPlan('g', 'v', 'key'), () => client.putGoalParticipantConsent('g'), () => client.deleteGoalParticipantConsent('g')];
  for (const operation of operations) await expect(operation()).rejects.toMatchObject({ status: 403, errors: ['Not allowed.'] });
});
test('validated text dates reject impossible dates and accept leap days', () => {
  for (const value of ['2025-02-29', '2024-02-30', '2024-13-01', '2024-2-01', 'garbage']) expect(validPlanningDate(value)).toBe(false);
  expect(validPlanningDate('2024-02-29')).toBe(true);
});
test('amounts require positive finite values and at most two decimal places', () => {
  for (const value of ['', ' ', '0', '-1', 'NaN', 'Infinity', '1e3', '0.001', '1.234']) expect(validPlanningAmount(value)).toBe(false);
  for (const value of ['0.01', '100', '100.50']) expect(validPlanningAmount(value)).toBe(true);
});
test('goal validation and payload preserve web defaults and optional fields', () => {
  expect(goalValidation(emptyGoalForm())).toMatch(/name/);
  const form = { ...emptyGoalForm(), name: ' Fund ', targetAmount: '100' };
  expect(goalValidation(form)).toBeNull();
  expect(goalValidation({ ...form, name: 'x'.repeat(129) })).toMatch(/name/);
  expect(goalValidation({ ...form, targetAmount: '0' })).toMatch(/amount/);
  expect(goalValidation({ ...form, targetDate: '2025-02-29' })).toMatch(/date/);
  expect(goalPayload(form, 'h')).toEqual({ householdId: 'h', name: 'Fund', goalType: 'Saving', targetAmount: 100, targetDate: undefined, priority: 'Medium', isShared: false });
  expect(planValidation(emptyPlanForm())).toBeNull();
  expect(planValidation({ ...emptyPlanForm(), monthlyContribution: '-1' })).toMatch(/amount/);
  expect(planValidation({ ...emptyPlanForm(), targetDate: 'bad' })).toMatch(/date/);
  expect(planPayload(emptyPlanForm())).toEqual({ pace: undefined, targetDate: undefined, monthlyContribution: undefined, locale: 'en-IN' });
});
test('pending status, progress and group ordering match web', () => {
  expect(planningPending(null)).toBe(false);
  for (const status of ['Pending', 'Processing', 'Succeeded', 'Failed', 'Cancelled']) expect(planningPending({ status } as GoalPlanningRun)).toBe(['Pending', 'Processing'].includes(status));
  expect(goalProgress({ currentAmount: 200, targetAmount: 100 } as Goal)).toBe(100);
  expect(goalProgress({ currentAmount: 1, targetAmount: 3 } as Goal)).toBe(33);
  const categories = [{ id: 'a', parentCategoryId: null, isHidden: false }, { id: 'hidden', parentCategoryId: null, isHidden: true }, { id: 'b', parentCategoryId: 'a', isHidden: false }, { id: 'c', parentCategoryId: 'a', isHidden: true }] as Category[];
  expect(planningGroups(categories)).toEqual([{ ...categories[0], childCount: 1 }]);
  expect(new Set(Array.from({ length: 100 }, planningRequestKey)).size).toBe(100);
});
