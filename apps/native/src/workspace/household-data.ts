import type { HouseholdDashboard, HouseholdSummary } from '../api/workspace-models';
export const canCreateHousehold = (dashboard: HouseholdDashboard | null) => dashboard?.canUseHouseholds === true;
export const canEditReportSettings = (household?: HouseholdSummary) => !!household?.canWrite && ['Owner', 'Admin'].includes(household.role);
export const canManageHousehold = (household?: HouseholdSummary) => household?.kind === 'Family' && canEditReportSettings(household);
export const canListSentInvitations = (household?: HouseholdSummary) => household?.kind === 'Family' && ['Owner', 'Admin'].includes(household.role);
export function reportingValidation(currencyCode: string, timeZone: string): string | null {
  if (!/^[A-Z]{3}$/.test(currencyCode)) return 'Enter a three-letter currency code.';
  if (!timeZone.trim()) return 'Enter an IANA time zone.';
  try { new Intl.DateTimeFormat('en', { timeZone }); } catch { return 'Enter a valid IANA time zone.'; }
  return null;
}
export const invitationValidation = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'Enter a valid email address.';
