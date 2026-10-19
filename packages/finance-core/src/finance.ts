import type { Category, FinancialAccount, PaymentChannel, TransactionIntent, UserSettings, Visibility } from "./models.ts";

export class ValidationError extends Error {
  fields: Record<string, string>;
  constructor(fields: Record<string, string>) {
    super(Object.values(fields)[0] ?? "Check the transaction details.");
    this.name = "ValidationError";
    this.fields = fields;
  }
}

/** Parse to integer minor units before conversion to the API's JSON decimal number. */
export function parseMoney(text: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match || (match[1]?.length ?? 0) > 12) return null;
  const cents = BigInt(match[1] ?? "0") * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return cents > 0n && cents <= 99999999999900n ? Number(cents) : null;
}

export function dateInTimeZone(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function isValidDate(date: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && date <= today && date >= "0001-01-01";
}

export function formatMoney(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: currencyCode, maximumFractionDigits: 2 }).format(amount);
}

export type CategoryOption = { id: string; label: string; category: Category };
export function categoryOptions(categories: Category[], type: Category["type"], search = ""): CategoryOption[] {
  const byId = new Map(categories.map(c => [c.id, c]));
  return categories.flatMap(category => {
    if (category.type !== type) return [];
    const seen = new Set<string>();
    const path: string[] = [];
    let node: Category | undefined = category;
    while (node) {
      if (seen.has(node.id) || node.isHidden || node.type !== type) return [];
      seen.add(node.id);
      path.unshift(node.name);
      if (node.parentCategoryId && !byId.has(node.parentCategoryId)) return [];
      node = node.parentCategoryId ? byId.get(node.parentCategoryId) : undefined;
    }
    const label = path.join(" / ");
    return label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) ? [{ id: category.id, label, category }] : [];
  }).sort((a, b) => a.label.localeCompare(b.label));
}

export type ManualDraft = {
  eventKind: "Purchase" | "Income"; amount: string; date: string; accountId: string | null;
  categoryId: string | null; merchant: string; description: string; sourceText: string;
  paymentChannel: PaymentChannel; visibility: Visibility;
};
export type EntryResources = { categories: Category[]; accounts: FinancialAccount[]; settings: UserSettings; householdId: string; canWrite: boolean; today: string };
export function emptyDraft(settings: UserSettings, today: string): ManualDraft {
  return { eventKind: "Purchase", amount: "", date: today, accountId: null, categoryId: null,
    merchant: "", description: "", sourceText: "", paymentChannel: "Unknown", visibility: settings.defaultTransactionVisibility };
}

export function buildTransactionIntent(draft: ManualDraft, resources: EntryResources, reference: string): Readonly<TransactionIntent> {
  const errors: Record<string, string> = {};
  const cents = parseMoney(draft.amount);
  if (cents === null) errors.amount = "Enter a positive amount with up to two decimal places.";
  if (!isValidDate(draft.date, resources.today)) errors.date = "Use a real date no later than today.";
  const account = resources.accounts.find(a => a.id === draft.accountId && a.isActive);
  if (!account || account.householdId !== resources.householdId || account.currencyCode !== resources.settings.currencyCode) errors.accountId = "Choose an active account in this currency.";
  const type = draft.eventKind === "Income" ? "Income" : "Expense";
  if (!categoryOptions(resources.categories, type).some(c => c.id === draft.categoryId)) errors.categoryId = "Choose an available category or subcategory.";
  if (draft.merchant.trim().length > 256) errors.merchant = "Use at most 256 characters.";
  if (draft.description.trim().length > 1024) errors.description = "Use at most 1024 characters.";
  if (draft.sourceText.length > 4000) errors.sourceText = "Use at most 4000 characters.";
  if (!resources.canWrite) errors.scope = "You cannot add transactions to this household.";
  if (!["Purchase", "Income"].includes(draft.eventKind)) errors.eventKind = "Choose expense or income.";
  if (!["Private", "Household"].includes(draft.visibility)) errors.visibility = "Choose a supported visibility.";
  if (!["UPI", "Card", "Cash", "BankTransfer", "AutoDebit", "Wallet", "Cheque", "Unknown"].includes(draft.paymentChannel)) errors.paymentChannel = "Choose a supported payment method.";
  if (!/^native:[a-zA-Z0-9-]{8,100}$/.test(reference)) errors.reference = "Start a new transaction to create a valid reference.";
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return Object.freeze({ eventKind: draft.eventKind, amount: (cents ?? 0) / 100, date: draft.date,
    accountId: account!.id, householdId: resources.householdId, categoryId: draft.categoryId!,
    merchant: draft.merchant.trim() || null, description: draft.description.trim() || null,
    sourceText: draft.sourceText, inputMode: "Text", confidence: 1,
    paymentChannel: draft.paymentChannel, visibility: draft.visibility, externalReference: reference });
}

/** An uncertain manual operation is immutable and can only replay this same intent. */
export type PendingManual = { payload: Readonly<TransactionIntent>; phase: "sending" | "uncertain" };
export type ComposerDraft = { version: 1; ownerId: string; manual: ManualDraft; text: string; pendingManual: PendingManual | null; assistantUncertain: boolean };

export function decodeComposerDraft(value: unknown, ownerId: string): ComposerDraft | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<ComposerDraft>;
  if (v.version !== 1 || v.ownerId !== ownerId || !v.manual || typeof v.text !== "string" || v.text.length > 4000) return null;
  const d = v.manual;
  if (!["Purchase", "Income"].includes(d.eventKind) || typeof d.amount !== "string" || typeof d.date !== "string"
    || typeof d.description !== "string" || typeof d.merchant !== "string" || typeof d.sourceText !== "string"
    || !(d.accountId === null || typeof d.accountId === "string") || !(d.categoryId === null || typeof d.categoryId === "string")
    || !["Private", "Household"].includes(d.visibility)
    || !["UPI", "Card", "Cash", "BankTransfer", "AutoDebit", "Wallet", "Cheque", "Unknown"].includes(d.paymentChannel)) return null;
  if (v.pendingManual) {
    const p = v.pendingManual.payload;
    if (!p || !p.accountId || !p.householdId || !p.categoryId || !/^native:[a-zA-Z0-9-]{8,100}$/.test(p.externalReference)
      || typeof p.amount !== "number" || !Number.isFinite(p.amount) || p.amount <= 0
      || !["Purchase", "Income"].includes(p.eventKind) || typeof p.date !== "string") return null;
  }
  return { version: 1, ownerId, manual: d, text: v.text,
    pendingManual: v.pendingManual ? { payload: Object.freeze(v.pendingManual.payload), phase: "uncertain" } : null,
    assistantUncertain: v.assistantUncertain === true };
}
