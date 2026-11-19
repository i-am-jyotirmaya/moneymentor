import { ApiError, FinanceClient, type HttpRequest } from '../src/api/client';
import type { HouseholdSummary } from '../src/api/workspace-models';
import { canUseHouseholdReportScope, explanationValidation, reportError, reportScope } from '../src/workspace/reports-data';

async function setup(data: unknown = [], status = 200) {
  const requests: HttpRequest[] = [];
  const client = new FinanceClient(async request => {
    requests.push(request);
    return request.path === '/api/auth/login'
      ? { status: 200, data: { accessToken: 'token', accessTokenExpiresAt: '2099-01-01', requiresPrivacyConsent: false, user: { id: 'u', displayName: 'Person' } } }
      : { status, data };
  }, async () => {});
  await client.login('p@example.test', 'password');
  return { client, requests };
}
test.each(['Personal', 'Household'] as const)('active judgments preserve server order and web %s query', async scope => {
  const data = [{ id: 'second' }, { id: 'first' }];
  const { client, requests } = await setup(data);
  expect(await client.listActiveJudgements({ householdId: 'family & home', scope })).toEqual(data);
  expect(requests[1]).toEqual({ path: `/api/judgements/active?householdId=family+%26+home&scope=${scope}`, method: 'GET', body: undefined, headers: { Authorization: 'Bearer token' } });
  await client.listActiveJudgements({ householdId: 'home', scope, cadence: 'Weekly' });
  expect(requests[2].path).toBe(`/api/judgements/active?householdId=home&scope=${scope}&cadence=Weekly`);
});
test('dismiss has no body; explanations are always private and use the web payload', async () => {
  const { client, requests } = await setup({ feedbackId: 'feedback' });
  await client.dismissJudgement('a/b');
  expect(await client.explainJudgement('a/b', 'Planned purchase')).toEqual({ feedbackId: 'feedback' });
  expect(requests.slice(1).map(({ path, method, body }) => ({ path, method, body }))).toEqual([
    { path: '/api/judgements/a%2Fb/dismiss', method: 'POST', body: undefined },
    { path: '/api/judgements/a%2Fb/explanations', method: 'POST', body: { text: 'Planned purchase', shareWithHousehold: false } },
  ]);
});
test('report API errors propagate for all operations', async () => {
  const { client } = await setup({ errors: ['Not allowed.', 'More detail.'] }, 403);
  for (const request of [() => client.listActiveJudgements({ householdId: 'home', scope: 'Household' }), () => client.dismissJudgement('id'), () => client.explainJudgement('id', 'Planned')]) {
    await expect(request()).rejects.toMatchObject({ status: 403, errors: ['Not allowed.', 'More detail.'] });
  }
});
test('household report scope follows family kind, including read-only members, without a plan gate', () => {
  expect(canUseHouseholdReportScope()).toBe(false);
  expect(reportScope('Household')).toBe('Personal');
  for (const kind of ['Personal', 'Family'] as const) for (const role of ['Owner', 'Admin', 'Member', 'Viewer'] as const) for (const canWrite of [true, false]) {
    const household = { kind, role, canWrite } as HouseholdSummary;
    expect(canUseHouseholdReportScope(household)).toBe(kind === 'Family');
    expect(reportScope('Household', household)).toBe(kind === 'Family' ? 'Household' : 'Personal');
    expect(reportScope('Personal', household)).toBe('Personal');
  }
});
test('explanation validation trims and enforces inclusive web boundaries', () => {
  for (const text of ['', '    ', '1234', ' 1234 ', 'x'.repeat(2001)]) expect(explanationValidation(text)).toBe('Please write between 5 and 2000 characters.');
  for (const text of ['12345', ' 12345 ', 'x'.repeat(2000)]) expect(explanationValidation(text)).toBeNull();
});
test('report errors match web first-error and fallback copy', () => {
  expect(reportError(new ApiError('Summary', 400, 'rejected', ['First', 'Second']))).toBe('First');
  expect(reportError(new ApiError('Summary', 400, 'rejected', []))).toBe('Summary');
  expect(reportError(new Error('offline'))).toBe('Could not update judgments. Please try again.');
});
