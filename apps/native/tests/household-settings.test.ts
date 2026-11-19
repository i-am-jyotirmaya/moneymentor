import { FinanceClient, type HttpRequest } from '../src/api/client';
import type { UserSettings } from '../src/api/models';
import type { HouseholdDashboard, HouseholdRole, HouseholdSummary } from '../src/api/workspace-models';
import { canCreateHousehold, canEditReportSettings, canListSentInvitations, canManageHousehold, invitationValidation, reportingValidation } from '../src/workspace/household-data';
import { accountPayload, accountValidation, canDeleteAccount, emptyAccount, settingsPayload } from '../src/workspace/settings-data';

const household: HouseholdSummary = { id: 'home', name: 'Family', kind: 'Family', currencyCode: 'INR', timeZone: 'Asia/Kolkata', role: 'Owner', status: 'Active', canWrite: true, memberCount: 2, createdAt: '' };
const settings: UserSettings = { userProfileId: 'u', displayName: 'Person', email: 'p@example.test', currencyCode: 'INR', timeZone: 'Asia/Kolkata', plan: 'Premium', requireMerchantForExpenses: false, defaultTransactionVisibility: 'Private' };
const account = { ...emptyAccount('home'), id: 'bank', name: 'Bank', currencyCode: 'INR', ownerUserProfileId: 'u' };

test.each(['Free', 'Premium'] as const)('%s creation follows the server entitlement, never an inferred plan', plan => {
  for (const canUseHouseholds of [true, false]) expect(canCreateHousehold({ plan, canUseHouseholds } as HouseholdDashboard)).toBe(canUseHouseholds);
  expect(canCreateHousehold(null)).toBe(false);
});
test.each(['Owner', 'Admin', 'Member', 'Viewer'] as HouseholdRole[])('%s household guards match web across personal, family and read-only scopes', role => {
  for (const kind of ['Personal', 'Family'] as const) for (const canWrite of [false, true]) {
    const h = { ...household, role, kind, canWrite };
    const manager = role === 'Owner' || role === 'Admin';
    expect(canEditReportSettings(h)).toBe(manager && canWrite);
    expect(canManageHousehold(h)).toBe(kind === 'Family' && manager && canWrite);
    expect(canListSentInvitations(h)).toBe(kind === 'Family' && manager);
  }
  expect(canManageHousehold(undefined)).toBe(false);
});
test('report settings validate native equivalents of required fields and currency/time-zone format', () => {
  expect(reportingValidation('INR', 'Asia/Kolkata')).toBeNull();
  expect(reportingValidation('USD', 'America/New_York')).toBeNull();
  for (const currency of ['', 'IN', '123', 'inr', 'INRR']) expect(reportingValidation(currency, 'UTC')).toBeTruthy();
  for (const zone of ['', ' ', 'not-a-zone']) expect(reportingValidation('INR', zone)).toBeTruthy();
});
test('invitation email, exact deletion confirmation and account constraints', () => {
  expect(invitationValidation(' name@example.com ')).toBeNull();
  for (const email of ['', 'no-email', 'a@', 'a b@example.com']) expect(invitationValidation(email)).toBeTruthy();
  expect(canDeleteAccount('password', 'DELETE')).toBe(true);
  for (const confirmation of ['delete', ' DELETE', 'DELETE ', '']) expect(canDeleteAccount('password', confirmation)).toBe(false);
  expect(canDeleteAccount('', 'DELETE')).toBe(false);
  expect(accountValidation(emptyAccount(null))).toBeTruthy();
  expect(accountValidation({ ...emptyAccount(null), name: 'Bank', last4: '1234' })).toBeNull();
  for (const last4 of ['1', 'abcd', '12345']) expect(accountValidation({ ...account, last4 })).toBeTruthy();
  expect(accountPayload({ ...account, aliases: [' Bank ', '', '  ', 'salary'] }, 'new').aliases).toEqual(['Bank', 'salary']);
  expect(accountPayload(account, 'new').householdId).toBe('new');
});
test('settings payload excludes entitlement and profile fields', () => {
  expect(settingsPayload(settings)).toEqual({ currencyCode: 'INR', timeZone: 'Asia/Kolkata', requireMerchantForExpenses: false, defaultTransactionVisibility: 'Private' });
});
async function setup(data: unknown = null, status = 200) {
  const requests: HttpRequest[] = [];
  const clear = jest.fn(async () => {});
  const client = new FinanceClient(async request => {
    requests.push(request);
    return request.path === '/api/auth/login'
      ? { status: 200, data: { accessToken: 'token', accessTokenExpiresAt: '2099-01-01', requiresPrivacyConsent: false, user: { id: 'u', displayName: 'Person' } } }
      : { status, data };
  }, clear);
  await client.login('p@example.test', 'password'); clear.mockClear();
  return { client, requests, clear };
}
test('household client methods preserve web paths, verbs and bodies, encoding identifiers', async () => {
  const { client, requests } = await setup(household);
  await client.households();
  await client.createHousehold('My home');
  await client.householdInvitations();
  await client.sentHouseholdInvitations('a/b');
  await client.createHouseholdInvitation('a/b', { email: 'p@example.test', role: 'Viewer' });
  await client.updateHouseholdSettings('a/b', { currencyCode: 'USD', timeZone: 'UTC' });
  await client.respondToHouseholdInvitation('i/d', 'accept');
  await client.respondToHouseholdInvitation('i/d', 'decline');
  expect(requests.slice(1).map(({ path, method, body }) => ({ path, method, body }))).toEqual([
    { path: '/api/households', method: 'GET' },
    { path: '/api/households', method: 'POST', body: { name: 'My home' } },
    { path: '/api/households/invitations', method: 'GET' },
    { path: '/api/households/a%2Fb/invitations', method: 'GET' },
    { path: '/api/households/a%2Fb/invitations', method: 'POST', body: { email: 'p@example.test', role: 'Viewer' } },
    { path: '/api/households/a%2Fb/settings', method: 'PATCH', body: { currencyCode: 'USD', timeZone: 'UTC' } },
    { path: '/api/households/invitations/i%2Fd/accept', method: 'POST' },
    { path: '/api/households/invitations/i%2Fd/decline', method: 'POST' },
  ]);
  expect(requests.slice(1).every(r => r.headers?.Authorization === 'Bearer token')).toBe(true);
});
test('preference update sends only editable fields even if passed a full settings object', async () => {
  const { client, requests } = await setup(settings);
  expect(await client.updateSettings(settings)).toEqual(settings);
  expect(requests[1]).toMatchObject({ path: '/api/settings/me', method: 'PATCH', body: settingsPayload(settings) });
  expect(requests[1].body).not.toHaveProperty('plan');
});
test('account create and edit use web POST/PUT and complete request body', async () => {
  const { client, requests } = await setup(account);
  const body = accountPayload(account, 'home');
  await client.saveFinancialAccount(body);
  await client.saveFinancialAccount(body, 'a/b');
  expect(requests[1]).toMatchObject({ path: '/api/financial-accounts', method: 'POST', body });
  expect(requests[2]).toMatchObject({ path: '/api/financial-accounts/a%2Fb', method: 'PUT', body });
});
test('privacy export is authenticated JSON and rejects missing data', async () => {
  const data = { schemaVersion: 1, transactions: [] };
  const { client, requests } = await setup(data);
  expect(await client.exportPrivacy()).toEqual(data);
  expect(requests[1]).toMatchObject({ path: '/api/privacy/export', method: 'GET' });
  const invalid = await setup();
  await expect(invalid.client.exportPrivacy()).rejects.toThrow('Could not verify');
});
test('successful account deletion clears local credentials and signed-in state', async () => {
  const { client, requests, clear } = await setup();
  await client.deleteAccount({ password: 'password', confirmation: 'DELETE' });
  expect(requests[1]).toMatchObject({ path: '/api/privacy/account', method: 'DELETE', body: { password: 'password', confirmation: 'DELETE' } });
  expect(clear).toHaveBeenCalledTimes(1);
  expect(client.getSnapshot().status).toBe('signedOut');
});
test('rejected deletion keeps session and propagates server errors', async () => {
  const { client, clear } = await setup({ errors: ['Password is incorrect.'] }, 400);
  await expect(client.deleteAccount({ password: 'wrong', confirmation: 'DELETE' })).rejects.toThrow('Password is incorrect.');
  expect(clear).not.toHaveBeenCalled();
  expect(client.getSnapshot().status).toBe('authenticated');
});
test('settings and account invalid save responses do not become confirmations', async () => {
  const { client } = await setup({});
  await expect(client.updateSettings(settingsPayload(settings))).rejects.toMatchObject({ outcome: 'unknown' });
  await expect(client.saveFinancialAccount(emptyAccount(null))).rejects.toMatchObject({ outcome: 'unknown' });
});
