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
