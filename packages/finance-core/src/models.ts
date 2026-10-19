/** Wire names mirror the existing .NET contracts; no presentation or platform imports. */
export type EventKind = "Purchase" | "Income" | "Refund" | "Transfer" | "CreditCardPayment" | "Reversal" | "Cashback" | "Fee" | "Interest" | "CashWithdrawal" | "Investment";
export type PaymentChannel = "UPI" | "Card" | "Cash" | "BankTransfer" | "AutoDebit" | "Wallet" | "Cheque" | "Unknown";
export type Visibility = "Private" | "Household";
export type AuthSession = {
  accessToken: string; accessTokenExpiresAt: string; requiresPrivacyConsent: boolean;
  user: { id: string; email: string; displayName: string; roles: string[] };
};
export type FinancialAccount = {
  id: string; householdId: string; ownerUserProfileId: string | null; name: string;
  accountType: "BankAccount" | "CreditCard" | "Cash" | "Wallet";
  institution: string | null; last4: string | null; currencyCode: string;
  isActive: boolean; aliases: string[];
};
export type Category = {
  id: string; householdId: string | null; parentCategoryId: string | null; name: string;
  type: "Expense" | "Income"; classification: "Essential" | "Discretionary" | "Income" | "Savings" | "Debt";
  isHidden: boolean; isSystemCategory: boolean; icon: string | null; sortOrder: number; createdAt: string;
};
export type CategoryCatalog = { householdId: string; canWrite: boolean; categories: Category[] };
export type UserSettings = {
  userProfileId: string; email: string; displayName: string; currencyCode: string;
  timeZone: string; plan: "Free" | "Premium"; requireMerchantForExpenses: boolean;
  defaultTransactionVisibility: Visibility;
};
export type Transaction = {
  id: string; householdId: string; userProfileId: string | null; amount: number; currencyCode: string;
  type: "Expense" | "Income" | "Investment" | "Transfer"; kind?: EventKind;
  categoryId?: string | null; categoryName: string | null; parentCategoryName?: string | null;
  accountId?: string | null; accountName?: string | null; counterpartyAccountId?: string | null;
  counterpartyAccountName?: string | null; paymentChannel?: PaymentChannel | null;
  relatedTransactionId?: string | null; categoryClassification?: Category['classification'] | null;
  merchantName: string | null; description: string | null; senderName?: string | null; reason?: string | null;
  sourceText: string; transactionDate: string; inputMode: "Text" | "Voice" | "System";
  confidence: number; visibility: Visibility; createdAt: string; updatedAt: string;
  deletedAt?: string | null; financialImpact?: { spending: number; income: number; investment: number; rewards: number };
};
export type TransactionPage = { items: Transaction[]; page: number; pageSize: number; totalCount: number; totalPages: number; month: string };
export type TransactionIntent = {
  eventKind: EventKind; amount: number; date: string;
  accountId: string; categoryId: string; householdId: string;
  merchant: string | null; description: string | null; sourceText: string;
  paymentChannel: PaymentChannel; visibility: Visibility; inputMode: "Text";
  externalReference: string; confidence: number;
};
export type FinancialEventIntent = Omit<TransactionIntent, 'categoryId'> & {
  categoryId?: string; counterpartyAccountId?: string; relatedTransactionId?: string;
  matchOriginal?: boolean; observationAccountId?: string;
};
export type AssistantResponse = {
  status: "Responded" | "NeedsClarification" | "Unsupported" | "Failed";
  intent: string; assistantMessage: string | null; transaction: Transaction | null; errors: string[];
};
export type TransactionPatch = Partial<{
  amount: number; categoryId: string; accountId: string; description: string; merchantName: string;
  transactionDate: string; paymentChannel: PaymentChannel; visibility: Visibility;
}>;
