import type { HouseholdSummary } from '../api/workspace-models';
import type { IconName } from '../ui/Icon';

/** More sheet rows (more-sheet-* mockup). Keys are section routes. */
export function moreSheetItems(household: { name: string; members: number } | null, judgments?: number) {
  const items: { key: 'planning' | 'reports' | 'household' | 'settings'; icon: IconName; label: string; subtitle?: string; badge?: number }[] = [
    { key: 'planning', icon: { android: 'flag', ios: 'flag' }, label: 'Planning', subtitle: 'Goals and commitments' },
    { key: 'reports', icon: { android: 'shield_person', ios: 'checkmark.shield' }, label: 'Judgments', subtitle: judgments ? `${judgments} need a look` : 'Patterns worth a look', badge: judgments },
    { key: 'household', icon: { android: 'group', ios: 'person.2' }, label: 'Household', subtitle: household ? `${household.name} · ${household.members} ${household.members === 1 ? 'member' : 'members'}` : 'Members and invitations' },
    { key: 'settings', icon: { android: 'settings', ios: 'gearshape' }, label: 'Settings', subtitle: 'Currency, theme, privacy' },
  ];
  return items;
}

/**
 * A4's HouseholdSheet labels roles as 'owner' | 'write' | 'read', while the API sends
 * Owner/Admin/Member/Viewer plus canWrite. Map here so the sheet shows "Owner" / "Can write" / "Read only".
 */
export function householdSheetRows(households: readonly HouseholdSummary[]) {
  return households.filter(h => h.status !== 'Removed').map(h => ({
    id: h.id, name: h.name, kind: h.kind, members: h.memberCount,
    role: h.role === 'Owner' ? 'owner' : h.canWrite ? 'write' : 'read',
  }));
}
