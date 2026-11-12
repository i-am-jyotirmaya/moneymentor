import type { UserSettings } from '../api/models';
import type { SaveFinancialAccount, SettingsPatch } from '../api/workspace-models';
export function settingsPayload(form: UserSettings): SettingsPatch {
  return { currencyCode: form.currencyCode, timeZone: form.timeZone, requireMerchantForExpenses: form.requireMerchantForExpenses, defaultTransactionVisibility: form.defaultTransactionVisibility };
}
export const canDeleteAccount = (password: string, confirmation: string) => password.length > 0 && confirmation === 'DELETE';
export function emptyAccount(householdId: string | null): SaveFinancialAccount {
  return { householdId, name: '', accountType: 'BankAccount', institution: null, last4: null, aliases: [], shared: false, isActive: true };
}
export function accountValidation(form: SaveFinancialAccount): string | null {
  if (!form.name.trim() || form.name.length > 128) return 'Enter an account name of up to 128 characters.';
  if (form.last4 && !/^[0-9]{4}$/.test(form.last4)) return 'Enter exactly four digits.';
  return null;
}
export function accountPayload(form: SaveFinancialAccount, householdId: string | null): SaveFinancialAccount {
  return { ...form, householdId, aliases: form.aliases.map(alias => alias.trim()).filter(Boolean) };
}
