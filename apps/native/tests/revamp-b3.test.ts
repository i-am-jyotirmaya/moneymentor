import type { HouseholdSummary } from '../src/api/workspace-models';
import { householdSheetRows, moreSheetItems } from '../src/workspace/more-data';
import { judgmentBadge } from '../src/workspace/reports-data';

const household = (over: Partial<HouseholdSummary>): HouseholdSummary => ({ id: 'h', name: 'Home', kind: 'Family', currencyCode: 'INR', timeZone: 'Asia/Kolkata', role: 'Member', status: 'Active', canWrite: true, memberCount: 3, createdAt: '2026-01-01', ...over });

test('household sheet maps API roles onto the sheet labels', () => {
  const rows = householdSheetRows([household({ id: 'a', role: 'Owner' }), household({ id: 'b', role: 'Admin' }), household({ id: 'c', role: 'Viewer', canWrite: false }), household({ id: 'd', status: 'Removed' })]);
  expect(rows.map(r => [r.id, r.role, r.members])).toEqual([['a', 'owner', 3], ['b', 'write', 3], ['c', 'read', 3]]);
});
test('more sheet rows follow the mockup', () => {
  const items = moreSheetItems({ name: 'Sahu family', members: 3 }, 2);
  expect(items.map(i => i.key)).toEqual(['planning', 'reports', 'household', 'settings']);
  expect(items[1]).toMatchObject({ label: 'Judgments', subtitle: '2 need a look', badge: 2 });
  expect(items[2].subtitle).toBe('Sahu family · 3 members');
  expect(moreSheetItems(null)[1].badge).toBeUndefined();
});
test('judgment badges always carry words and an icon', () => {
  expect(judgmentBadge({ severity: 'Alert' })).toMatchObject({ tone: 'negative', label: 'Needs attention' });
  expect(judgmentBadge({ severity: 'Nudge' })).toMatchObject({ tone: 'warning', label: 'Watch' });
  expect(judgmentBadge({ severity: 'Info', direction: 'Positive' })).toMatchObject({ tone: 'income', label: 'Healthy' });
  expect(judgmentBadge({ severity: 'Info', direction: 'Neutral' }).icon).toBeTruthy();
});
