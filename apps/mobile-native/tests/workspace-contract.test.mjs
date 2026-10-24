import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FinanceClient, workspaceApi } from '../../../packages/finance-core/src/index.ts';
import { fixtureTransport } from '../src/services/fixture-transport.ts';

async function setup(change = (_request, response) => response) {
  const fixture = fixtureTransport();
  const client = new FinanceClient(async request => change(request, await fixture.transport(request)), fixture.clear);
  await client.login('qa@example.test', 'fixture-only');
  const api = workspaceApi(client); const scope = (await client.categories()).householdId;
  return { client, api, scope };
}
test('planning screens can create, contribute, poll, activate and link a recurring commitment through the typed client', async () => {
  const { api, scope } = await setup();
  const goal = await api.createGoal({ householdId: scope, name: 'Laptop', goalType: 'Purchase', targetAmount: 5000, priority: 'Medium', isShared: false });
  await api.contribute(goal.id, { amount: 100.25, source: 'Manual', contributedAt: '2026-10-20' });
  const started = await api.startPlan(goal.id, { pace: 'Balanced' }, 'native-plan-contract');
  const finished = await api.planningRun(goal.id, started.id); assert.equal(finished.status, 'Succeeded');
  await api.activatePlan(goal.id, finished.result.id, 'native-activate-contract');
  const detail = await api.goal(goal.id); assert.equal(detail.goal.currentAmount, 100.25); assert.equal(detail.plan.activeVersionId, finished.result.id);
  const commitment = await api.createCommitment({ householdId: scope, name: 'Monthly saving', transactionType: 'Investment', amount: 500, cadence: 'Monthly', nextDueDate: '2026-11-01', isShared: false, goalId: goal.id });
  await api.updateCommitment(commitment.id, { isActive: false }); assert.equal((await api.commitments(scope))[0].isActive, false);
});
test('foreign household goal records are rejected before a scoped screen can render them', async () => {
  const { api, scope } = await setup((request, response) => request.path.startsWith('/api/goals?')
    ? { status: 200, data: response.data.map(goal => ({ ...goal, householdId: 'foreign-family' })) } : response);
  await api.createGoal({ householdId: scope, name: 'Private goal', goalType: 'Saving', targetAmount: 1000, priority: 'Low', isShared: false });
  await assert.rejects(api.goals(scope), /goals data could not be verified/);
});
test('a malformed dashboard is a recoverable read error rather than invalid money on screen', async () => {
  const { api, scope } = await setup((request, response) => request.path.startsWith('/api/dashboard/monthly')
    ? { status: 200, data: { ...response.data, spends: '123.45' } } : response);
  await assert.rejects(api.dashboard('2026-10', scope), /dashboard data could not be verified/);
});
test('an invalid household time zone is rejected before it can enter native date calculations', async () => {
  const { api } = await setup((request, response) => request.path === '/api/households'
    ? { status: 200, data: { ...response.data, households: response.data.households.map(item => ({ ...item, timeZone: 'Mars/Unknown' })) } } : response);
  await assert.rejects(api.households(), /households data could not be verified/);
});
test('restored plan progress cannot confirm a run belonging to a different goal', async () => {
  const { api, scope } = await setup((request, response) => request.path.includes('/planning-runs/')
    ? { status: 200, data: { ...response.data, goalId: 'another-goal' } } : response);
  const goal = await api.createGoal({ householdId: scope, name: 'Saving', goalType: 'Saving', targetAmount: 1000, priority: 'Low', isShared: false });
  const run = await api.startPlan(goal.id, {}, 'native-plan-identity');
  await assert.rejects(api.planningRun(goal.id, run.id), /planning progress data could not be verified/);
});
