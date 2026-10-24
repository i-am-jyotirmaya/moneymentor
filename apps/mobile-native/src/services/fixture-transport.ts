import type { AuthSession, Category, FinancialAccount, FinancialEventIntent, Transport, Transaction, TransactionIntent } from '@spndrr/finance-core';
import { fixtureWorkspace } from './fixture-workspace.ts';

/** Deterministic QA transport. Only the separately identified e2e binary can select it. */
export function fixtureTransport({ pause = async () => {} }: { pause?: (milliseconds: number) => Promise<void> } = {}) {
  let authenticated = false;
  let sequence = 0;
  const transactions: Transaction[] = [];
  const references = new Map<string, Transaction>();
  const householdId = '00000000-0000-4000-8000-000000000010';
  const userId = '00000000-0000-4000-8000-000000000011';
  const accounts: FinancialAccount[] = [
    { id: '00000000-0000-4000-8000-000000000021', householdId, ownerUserProfileId: userId, name: 'Kotak', accountType: 'BankAccount', currencyCode: 'INR', isActive: true, aliases: [], institution: 'Kotak', last4: null },
    { id: '00000000-0000-4000-8000-000000000022', householdId, ownerUserProfileId: userId, name: 'Kotak upi', accountType: 'CreditCard', currencyCode: 'INR', isActive: true, aliases: [], institution: 'Kotak', last4: null },
  ];
  const categoryDefaults = { householdId: null, isSystemCategory: true, icon: null, createdAt: '2026-01-01T00:00:00Z' };
  const categories: Category[] = [
    { ...categoryDefaults, id: 'food', name: 'Food', parentCategoryId: null, type: 'Expense', classification: 'Essential', isHidden: false, sortOrder: 0 },
    { ...categoryDefaults, id: 'groceries', name: 'Groceries', parentCategoryId: 'food', type: 'Expense', classification: 'Essential', isHidden: false, sortOrder: 1 },
    { ...categoryDefaults, id: 'salary', name: 'Salary', parentCategoryId: null, type: 'Income', classification: 'Income', isHidden: false, sortOrder: 2 },
  ];
  const session = (): AuthSession => ({ accessToken: 'fixture-only-token', accessTokenExpiresAt: '2099-01-01T00:00:00Z', requiresPrivacyConsent: false,
    user: { id: userId, displayName: 'Jyoti', email: 'qa@example.test', roles: [] } });
  // Match an HTTP JSON boundary: UI caches must not share mutable server objects.
  const ok = (data: unknown, status = 200) => ({ status, data: JSON.parse(JSON.stringify(data)) as unknown });
  const workspace = fixtureWorkspace({ householdId, userId, accounts, categories, transactions, nextId: () => `fixture-workspace-${++sequence}` });
  function save(intent: FinancialEventIntent): Transaction {
    const key = `${intent.accountId}|${intent.externalReference}`;
    const previous = references.get(key);
    if (previous) return previous;
    const transaction: Transaction = { ...intent, id: `fixture-${++sequence}`, amount: intent.amount, currencyCode: 'INR',
      type: ['Transfer', 'CreditCardPayment', 'CashWithdrawal'].includes(intent.eventKind) ? 'Transfer' : intent.eventKind === 'Investment' ? 'Investment' : intent.eventKind === 'Income' ? 'Income' : 'Expense', kind: intent.eventKind, householdId: intent.householdId, userProfileId: userId,
      categoryName: categories.find(c => c.id === intent.categoryId)?.name ?? null, accountName: accounts.find(a => a.id === intent.accountId)?.name ?? null,
      counterpartyAccountName: accounts.find(a => a.id === intent.counterpartyAccountId)?.name ?? null,
      merchantName: intent.merchant, transactionDate: intent.date, sourceText: intent.sourceText,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), visibility: intent.visibility };
    transactions.unshift(transaction); references.set(key, transaction); return transaction;
  }
  let pendingText: string | null = null;
  const transport: Transport = async request => {
    const body = request.body as Record<string, unknown> | undefined;
    if (request.path === '/api/auth/login') {
      if (body?.email !== 'qa@example.test' || body?.password !== 'fixture-only') return ok({}, 401);
      authenticated = true; return ok(session());
    }
    if (request.path === '/api/auth/refresh') return authenticated ? ok(session()) : ok({}, 401);
    if (request.path === '/api/auth/logout') { authenticated = false; return ok(null, 204); }
    if (request.path === '/api/public/privacy') return ok({ version: 'fixture-policy', effectiveDate: '2026-07-03', policyUrl: 'https://example.test/privacy', supportEmail: 'support@example.test' });
    if (request.path === '/api/public/registration') return ok({ mode: 'Open' });
    if (!authenticated) return ok({}, 401);
    const workspaceResponse = workspace(request); if (workspaceResponse) return ok(workspaceResponse.data, workspaceResponse.status);
    if (request.path === '/api/settings/me') return ok({ userProfileId: userId, displayName: 'Jyoti', email: 'qa@example.test', currencyCode: 'INR', timeZone: 'Asia/Kolkata', plan: 'Free', requireMerchantForExpenses: false, defaultTransactionVisibility: 'Private' });
    if (request.path === '/api/households') return ok({ plan: 'Free', canUseHouseholds: false, defaultHouseholdId: householdId, households: [{ id: householdId, name: 'Personal', kind: 'Personal', currencyCode: 'INR', timeZone: 'Asia/Kolkata', role: 'Owner', status: 'Active', canWrite: true, memberCount: 1, createdAt: '2026-01-01T00:00:00Z' }] });
    if (request.path.split('?')[0] === '/api/categories') return ok({ householdId, canWrite: true, categories });
    if (request.path.split('?')[0] === '/api/financial-accounts' && request.method === 'GET') return ok(accounts);
    if (request.path === '/api/financial-accounts') {
      const account = { ...accounts[0]!, ...body, id: `account-${++sequence}`, householdId }; accounts.push(account as typeof accounts[number]); return ok(account);
    }
    if (request.path.startsWith('/api/transactions?')) {
      const month = request.path.split('month=')[1]?.split('&')[0] ?? new Date().toISOString().slice(0, 7);
      const requestedScope = decodeURIComponent(/[?&]householdId=([^&]+)/.exec(request.path)?.[1] ?? householdId);
      const items = transactions.filter(transaction => transaction.transactionDate.startsWith(month) && !transaction.deletedAt && transaction.householdId === requestedScope);
      const page = Math.max(1, Number(/[?&]page=(\d+)/.exec(request.path)?.[1] ?? 1));
      return ok({ items: items.slice((page - 1) * 30, page * 30), totalCount: items.length, totalPages: Math.ceil(items.length / 30), page, pageSize: 30, month });
    }
    if (request.path === '/api/transactions' && request.method === 'POST') {
      const intent = request.body as TransactionIntent;
      const prior = references.has(`${intent.accountId}|${intent.externalReference}`);
      if (intent.description === 'simulate validation') return ok({ errors: { amount: ['Check this amount.'] } }, 400);
      const transaction = save(intent);
      if (intent.description === 'simulate lost response' && !prior) throw Error('Simulated response loss after commit');
      if (intent.description === 'simulate slow response') await pause(10000);
      return ok(transaction);
    }
    if (request.path.startsWith('/api/transactions/')) {
      const transaction = transactions.find(t => request.path.endsWith(`/${t.id}`));
      if (!transaction) return ok({}, 404);
      if (request.method === 'PATCH') Object.assign(transaction, body);
      return ok(transaction);
    }
    if (request.path === '/api/assistant/messages') {
      const text = String(body?.text ?? '');
      if (text === 'simulate history') {
        const date = String(body?.transactionDate);
        const template = save({ eventKind: 'Purchase', amount: 1, date, categoryId: 'groceries', accountId: accounts[0]!.id,
          householdId, merchant: 'Fixture market', description: 'Benchmark item', sourceText: '', paymentChannel: 'UPI', inputMode: 'Text', confidence: 1,
          visibility: 'Private', externalReference: 'fixture-benchmark-template' });
        transactions.length = 0; references.clear();
        for (let index = 0; index < 10000; index++) {
          transactions.push({ ...template, id: `fixture-benchmark-${++sequence}`, description: `Benchmark item ${index + 1}`, amount: ((index % 10000) + 1) / 100 });
          if (index % 250 === 249) await pause(0);
        }
        return ok({ status: 'Responded', intent: 'AskFinanceQuestion', assistantMessage: 'Benchmark history ready.', transaction: null, errors: [] });
      }
      if (text === 'simulate failure') throw Error('Simulated network loss');
      const amount = /\d+(?:\.\d{1,2})?/.exec(text)?.[0];
      if (!amount) { pendingText = text; return ok({ status: 'NeedsClarification', intent: 'CreateExpense', assistantMessage: 'How much did you spend?', transaction: null, errors: [] }); }
      const sourceText = pendingText ?? text;
      const income = /salary|received|income/i.test(sourceText);
      const account = /kotak upi/i.test(sourceText) ? accounts[1]! : accounts[0]!;
      const transaction = save({ eventKind: income ? 'Income' : 'Purchase', amount: Number(amount), date: String(body?.transactionDate), categoryId: income ? 'salary' : 'groceries', accountId: account.id,
        householdId, merchant: null, description: sourceText, sourceText: text, paymentChannel: /upi/i.test(sourceText) ? 'UPI' : 'Unknown', inputMode: 'Text', confidence: 1,
        visibility: 'Private', externalReference: `fixture-${++sequence}` }); pendingText = null;
      transaction.inputMode = body?.inputMode === 'Voice' ? 'Voice' : 'Text';
      return ok({ status: 'Responded', intent: 'CreateExpense', assistantMessage: 'Tracked your transaction.', transaction, errors: [] });
    }
    return ok({}, 404);
  };
  return { transport, clear: async () => { authenticated = false; } };
}
