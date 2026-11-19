import { ApiError } from '../api/client';
import type { HouseholdSummary, JudgementReportScope } from '../api/workspace-models';

// The web reports route gates household scope by household kind, not plan or role.
export const canUseHouseholdReportScope = (household?: HouseholdSummary) => household?.kind === 'Family';
export function reportScope(requested: JudgementReportScope, household?: HouseholdSummary): JudgementReportScope {
  return canUseHouseholdReportScope(household) ? requested : 'Personal';
}
export function explanationValidation(text: string): string | null {
  const length = text.trim().length;
  return length < 5 || length > 2000 ? 'Please write between 5 and 2000 characters.' : null;
}
export function reportError(error: unknown): string {
  return error instanceof ApiError ? error.errors[0] ?? error.message : 'Could not update judgments. Please try again.';
}

/** Judgment severity badge: icon + words, never colour alone (HANDOFF B3 Judgments). */
export function judgmentBadge(item: { severity?: string | null; direction?: string | null }) {
  if (item.severity === 'Alert' || item.severity === 'Warning') return { tone: 'negative' as const, label: 'Needs attention', icon: { android: 'priority_high', ios: 'exclamationmark' } as const };
  if (item.direction === 'Positive') return { tone: 'income' as const, label: 'Healthy', icon: { android: 'thumb_up', ios: 'hand.thumbsup' } as const };
  if (item.severity === 'Nudge' || item.direction === 'Negative') return { tone: 'warning' as const, label: 'Watch', icon: { android: 'visibility', ios: 'eye' } as const };
  return { tone: 'info' as const, label: 'Note', icon: { android: 'info', ios: 'info.circle' } as const };
}
