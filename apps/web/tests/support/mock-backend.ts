// Shared mocked API for the Playwright suites. Moved verbatim from
// money-mentor.spec.ts so the coverage and visual suites reuse the same fixtures.
import type { Page, Route } from "@playwright/test";

export const currentMonthKey = new Date().toISOString().slice(0, 7);
export const previousMonthKey = shiftMonthKey(currentMonthKey, -1);

export const mockSession = {
  accessToken: "playwright-access-token",
  accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
  requiresPrivacyConsent: false,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "playwright@moneymentor.test",
    displayName: "Playwright Tester",
    roles: ["User"],
  },
};

export type MockTransaction = Omit<ReturnType<typeof createTransaction>, "deletedAt" | "purgeAfter"> & {
  deletedAt: string | null;
  purgeAfter: string | null;
};

export const baseTransactions = [
  createTransaction({
    amount: 18000,
    categoryName: "Rent",
    description: "Paid rent",
    id: "txn-rent",
    merchantName: "Landlord",
    sourceText: "paid rent 18000",
    transactionDate: `${currentMonthKey}-03`,
    visibility: "Household",
  }),
  createTransaction({
    amount: 3250,
    categoryName: "Groceries",
    description: "Groceries",
    id: "txn-groceries",
    merchantName: "Local market",
    sourceText: "groceries for 3250 from local market",
    transactionDate: `${currentMonthKey}-08`,
    visibility: "Household",
  }),
  ...Array.from({ length: 10 }, (_, index) =>
    createTransaction({
      amount: 100 + index,
      categoryName: "Everyday",
      description: `Current month expense ${index + 1}`,
      id: `txn-current-${index + 1}`,
      merchantName: "Corner shop",
      sourceText: `expense ${100 + index}`,
      transactionDate: `${currentMonthKey}-${String(10 + index).padStart(2, "0")}`,
      visibility: "Private",
    }),
  ),
  createTransaction({
    amount: 450,
    categoryName: "Transport",
    description: "Previous month taxi",
    id: "txn-previous-taxi",
    merchantName: "City taxi",
    sourceText: "taxi 450",
    transactionDate: `${previousMonthKey}-14`,
    visibility: "Private",
  }),
];

export const categoryCatalog = [
  { id: "housing", name: "Housing", parentCategoryId: null, type: "Expense", sortOrder: 100 },
  { id: "rent", name: "Rent", parentCategoryId: "housing", type: "Expense", sortOrder: 101 },
  { id: "food", name: "Food & Groceries", parentCategoryId: null, type: "Expense", sortOrder: 300 },
  { id: "groceries", name: "Groceries", parentCategoryId: "food", type: "Expense", sortOrder: 301 },
  { id: "standalone", name: "Everyday", parentCategoryId: null, type: "Expense", sortOrder: 310 },
  { id: "empty-group", name: "Archived Group", parentCategoryId: null, type: "Expense", sortOrder: 320 },
  { id: "empty-group-child", name: "Archived Groceries", parentCategoryId: "empty-group", type: "Expense", sortOrder: 321, isHidden: true },
  { id: "dining", name: "Dining & Lifestyle", parentCategoryId: null, type: "Expense", sortOrder: 400 },
  { id: "restaurants", name: "Restaurants", parentCategoryId: "dining", type: "Expense", sortOrder: 401 },
  { id: "food-delivery", name: "Food Delivery", parentCategoryId: "dining", type: "Expense", sortOrder: 406 },
  { id: "custom-dining", name: "Date Night", parentCategoryId: "dining", type: "Expense", sortOrder: 402, householdId: "44444444-4444-4444-8444-444444444444" },
  { id: "hidden", name: "Hidden category", parentCategoryId: "dining", type: "Expense", sortOrder: 403, isHidden: true },
  { id: "hidden-group", name: "Hidden group", parentCategoryId: null, type: "Expense", sortOrder: 450, isHidden: true },
  { id: "hidden-child", name: "Hidden child", parentCategoryId: "hidden-group", type: "Expense", sortOrder: 451 },
  { id: "income", name: "Income", parentCategoryId: null, type: "Income", sortOrder: 10 },
  { id: "salary", name: "Salary / Wages", parentCategoryId: "income", type: "Income", sortOrder: 11 },
].map((category) => ({
  householdId: null as string | null, isHidden: false, classification: "Discretionary",
  isSystemCategory: true, icon: null, createdAt: "2026-01-01T00:00:00Z", ...category,
}));

export async function seedAuthSession(page: Page) {
  await page.addInitScript(() => undefined);
}

export async function seedVoiceRecognition(page: Page) {
  await page.addInitScript(() => {
    const status = { active: false, stops: 0, aborts: 0 };
    Object.assign(window, { __speechStatus: status });
    class FakeSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "en-IN";
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onresult: ((event: { results: Array<Array<{ transcript: string }>> }) => void) | null = null;

      start() {
        status.active = true;
        window.setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: "swiggy dinner 540" }]] });
        }, 1200);
      }

      stop() {
        status.active = false;
        status.stops++;
        this.onend?.();
      }

      abort() {
        status.active = false;
        status.aborts++;
        this.onend?.();
      }
    }

    Object.assign(window, {
      SpeechRecognition: FakeSpeechRecognition,
      webkitSpeechRecognition: FakeSpeechRecognition,
    });
  });
}

export async function mockBackend(page: Page) {
  let transactions: MockTransaction[] = [...baseTransactions];
  let financialAccounts: Array<Record<string, unknown>> = [];
  let deletedTransactions: MockTransaction[] = [];
  let sentInvitations: Array<Record<string, unknown>> = [];
  let pendingInvitations = [
    {
      id: "invite-friends",
      householdId: "55555555-5555-4555-8555-555555555555",
      householdName: "Friends workspace",
      email: mockSession.user.email,
      role: "Member",
      status: "Pending",
      invitedByDisplayName: "Joe",
      createdAt: "2026-07-01T00:00:00Z",
      expiresAt: "2026-07-08T00:00:00Z",
      respondedAt: null,
      deliveryStatus: "Sent",
      deliveryAttemptCount: 1,
      sentAt: "2026-07-01T00:00:01Z",
      lastDeliveryError: null,
    },
  ];

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname.startsWith("/api/financial-accounts")) {
      if (method === "GET") await json(route, financialAccounts);
      else {
        const body = route.request().postDataJSON();
        const id = method === "PUT" ? url.pathname.split("/").at(-1) : `account-${financialAccounts.length + 1}`;
        const account = { ...body, id, ownerUserProfileId: body.shared ? null : "22222222-2222-4222-8222-222222222222", currencyCode: "INR" };
        financialAccounts = [...financialAccounts.filter(x => x.id !== id), account];
        await json(route, account);
      }
      return;
    }
    if (url.pathname === "/api/auth/login" && method === "POST") {
      await json(route, mockSession);
      return;
    }

    if (url.pathname === "/api/auth/refresh" && method === "POST") {
      await json(route, mockSession);
      return;
    }

    if (url.pathname === "/api/auth/logout" && method === "POST") {
      await route.fulfill({ status: 204 });
      return;
    }

    if (url.pathname === "/api/settings/me" && method === "GET") {
      await json(route, {
        userProfileId: "22222222-2222-4222-8222-222222222222",
        email: "playwright@moneymentor.test",
        displayName: "Playwright Tester",
        currencyCode: "INR",
        timeZone: "Asia/Calcutta",
        plan: "Premium",
        requireMerchantForExpenses: false,
        defaultTransactionVisibility: "Private",
      });
      return;
    }

    if (url.pathname === "/api/transactions" && method === "GET") {
      const month = url.searchParams.get("month") ?? currentMonthKey;
      const page = Number(url.searchParams.get("page") ?? 1);
      const pageSize = Number(url.searchParams.get("pageSize") ?? 10);
      const matchingTransactions = transactions
        .filter((transaction) => transaction.transactionDate.startsWith(month))
        .toSorted((left, right) => right.transactionDate.localeCompare(left.transactionDate));
      await json(route, {
        items: matchingTransactions.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        totalCount: matchingTransactions.length,
        totalPages: Math.ceil(matchingTransactions.length / pageSize),
        month,
      });
      return;
    }

    if (url.pathname === "/api/settings/me" && method === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await json(route, {
        userProfileId: "22222222-2222-4222-8222-222222222222",
        email: "playwright@moneymentor.test",
        displayName: "Playwright Tester",
        currencyCode: body.currencyCode ?? "INR",
        timeZone: body.timeZone ?? "Asia/Kolkata",
        plan: "Premium",
        requireMerchantForExpenses: body.requireMerchantForExpenses ?? false,
        defaultTransactionVisibility: body.defaultTransactionVisibility ?? "Private",
      });
      return;
    }

    if (url.pathname === "/api/transactions/trash" && method === "GET") {
      await json(route, { items: deletedTransactions });
      return;
    }

    const restoreMatch = url.pathname.match(/^\/api\/transactions\/([^/]+)\/restore$/);
    if (restoreMatch && method === "POST") {
      const restored = deletedTransactions.find((item) => item.id === restoreMatch[1]);
      if (!restored) {
        await route.fulfill({ status: 404, body: "Not found" });
        return;
      }
      deletedTransactions = deletedTransactions.filter((item) => item.id !== restored.id);
      transactions = [{ ...restored, deletedAt: null, purgeAfter: null }, ...transactions];
      await json(route, transactions[0]);
      return;
    }

    const deleteMatch = url.pathname.match(/^\/api\/transactions\/([^/]+)$/);
    if (deleteMatch && method === "DELETE") {
      const deleted = transactions.find((item) => item.id === deleteMatch[1]);
      if (!deleted) {
        await route.fulfill({ status: 404, body: "Not found" });
        return;
      }
      transactions = transactions.filter((item) => item.id !== deleted.id);
      const trashed = { ...deleted, deletedAt: new Date().toISOString(), purgeAfter: "2099-01-01T00:00:00Z" };
      deletedTransactions = [trashed, ...deletedTransactions];
      await json(route, trashed);
      return;
    }

    if (url.pathname.startsWith("/api/transactions/") && method === "PATCH") {
      const transactionId = url.pathname.split("/").at(-1);
      const body = route.request().postDataJSON() as Partial<(typeof transactions)[number]>;
      const index = transactions.findIndex((transaction) => transaction.id === transactionId);
      if (index < 0) {
        await route.fulfill({ status: 404, body: "Not found" });
        return;
      }

      const categoryId = (body as { categoryId?: string }).categoryId;
      const category = categoryCatalog.find((item) => item.id === categoryId);
      transactions[index] = {
        ...transactions[index],
        ...body,
        ...(category ? { categoryName: category.name } : {}),
        updatedAt: new Date().toISOString(),
      };
      await json(route, transactions[index]);
      return;
    }

    if (url.pathname === "/api/households" && method === "GET") {
      await json(route, {
        plan: "Premium",
        canUseHouseholds: true,
        defaultHouseholdId: "33333333-3333-4333-8333-333333333333",
        households: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Personal",
            kind: "Personal",
            role: "Owner",
            status: "Active",
            canWrite: true,
            memberCount: 1,
            createdAt: "2026-06-01T00:00:00Z",
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            name: "Family workspace",
            kind: "Family",
            role: "Owner",
            status: "Active",
            canWrite: true,
            memberCount: 1,
            createdAt: "2026-06-01T00:00:00Z",
          },
        ],
      });
      return;
    }

    if (url.pathname === "/api/categories" && method === "GET") {
      await json(route, {
        householdId: url.searchParams.get("householdId"),
        canWrite: true,
        categories: categoryCatalog,
      });
      return;
    }

    if (url.pathname === "/api/goals" && method === "GET") {
      await json(route, []);
      return;
    }

    if (url.pathname === "/api/commitments" && method === "GET") {
      await json(route, []);
      return;
    }

    if (url.pathname === "/api/households/invitations" && method === "GET") {
      await json(route, pendingInvitations);
      return;
    }

    if (/^\/api\/households\/[^/]+\/invitations$/.test(url.pathname) && method === "GET") {
      await json(route, sentInvitations);
      return;
    }

    if (/^\/api\/households\/[^/]+\/invitations$/.test(url.pathname) && method === "POST") {
      const body = route.request().postDataJSON() as { email: string; role: string };
      const invitation = {
        id: "invite-sent",
        householdId: url.pathname.split("/")[3],
        householdName: "Family workspace",
        email: body.email,
        role: body.role,
        status: "Pending",
        invitedByDisplayName: mockSession.user.displayName,
        createdAt: new Date().toISOString(),
        expiresAt: "2099-01-01T00:00:00Z",
        respondedAt: null,
        deliveryStatus: "Queued",
        deliveryAttemptCount: 0,
        sentAt: null,
        lastDeliveryError: null,
      };
      sentInvitations = [invitation, ...sentInvitations];
      await json(route, invitation);
      return;
    }

    if (url.pathname === "/api/privacy/consents" && method === "POST") {
      await json(route, { policyVersion: "2026-07-26-ai-planning.1", acceptedAt: new Date().toISOString() });
      return;
    }

    if (url.pathname === "/api/privacy/export" && method === "GET") {
      await route.fulfill({
        body: JSON.stringify({ schemaVersion: 1, profile: { email: mockSession.user.email } }),
        contentType: "application/json",
        headers: { "Content-Disposition": "attachment; filename=moneymentor-export.json" },
        status: 200,
      });
      return;
    }

    if (url.pathname === "/api/privacy/account" && method === "DELETE") {
      await route.fulfill({ status: 204 });
      return;
    }

    const invitationResponse = url.pathname.match(
      /^\/api\/households\/invitations\/([^/]+)\/(accept|decline)$/,
    );
    if (invitationResponse && method === "POST") {
      const [, invitationId, response] = invitationResponse;
      const invitation = pendingInvitations.find((item) => item.id === invitationId);
      if (!invitation) {
        await route.fulfill({ status: 404, body: "Not found" });
        return;
      }

      pendingInvitations = pendingInvitations.filter((item) => item.id !== invitationId);
      await json(route, {
        ...invitation,
        status: response === "accept" ? "Accepted" : "Declined",
        respondedAt: new Date().toISOString(),
      });
      return;
    }

    if (url.pathname === "/api/dashboard/monthly" && method === "GET") {
      const month = url.searchParams.get("month") ?? currentMonthKey;
      await json(
        route,
        createDashboard(
          transactions.filter((transaction) => transaction.transactionDate.startsWith(month)),
          month,
        ),
      );
      return;
    }

    if (url.pathname === "/api/assistant/messages" && method === "POST") {
      const body = route.request().postDataJSON() as { text: string };
      if (/joe sent me 300/i.test(body.text)) {
        const transaction = createTransaction({
          amount: 300,
          categoryName: "Other Income",
          description: null,
          id: "txn-income-joe",
          merchantName: null,
          reason: "chips",
          senderName: "Joe",
          sourceText: body.text,
          transactionDate: `${currentMonthKey}-20`,
          type: "Income",
          visibility: "Private",
        });
        transactions = [transaction, ...transactions.filter((item) => item.id !== transaction.id)];
        await json(route, {
          status: "Responded",
          intent: "CreateIncome",
          assistantMessage: "Tracked ₹300 received from Joe for chips.",
          transaction,
          parsedDebug: null,
          parsedIncomeDebug: null,
          financeAnswer: null,
          errors: [],
        });
        return;
      }
      if (/long assistant response/i.test(body.text)) {
        await json(route, {
          status: "Responded",
          intent: "Unknown",
          assistantMessage: Array.from(
            { length: 40 },
            (_, index) => `Scrollable assistant detail ${index + 1}.`,
          ).join(" "),
          transaction: null,
          parsedDebug: null,
          financeAnswer: null,
          errors: [],
        });
        return;
      }

      if (/where/i.test(body.text)) {
        const dashboard = createDashboard(
          transactions.filter((transaction) => transaction.transactionDate.startsWith(currentMonthKey)),
          currentMonthKey,
        );
        await json(route, {
          status: "Responded",
          intent: "AskFinanceQuestion",
          assistantMessage: "You spent the most on Rent: ₹18000 in June 2026.",
          transaction: null,
          parsedDebug: null,
          financeAnswer: {
            kind: "TopSpendingCategory",
            question: body.text,
            answer: "You spent the most on Rent: ₹18000 in June 2026.",
            month: currentMonthKey,
            periodStart: `${currentMonthKey}-01`,
            periodEnd: dashboard.periodEnd,
            currencyCode: "INR",
            amount: 18000,
            categoryName: "Rent",
            categories: dashboard.categories,
          },
          errors: [],
        });
        return;
      }

      const transaction = createTransaction({
        amount: 540,
        categoryName: "Food Delivery",
        description: "dinner",
        id: "txn-swiggy",
        merchantName: "Swiggy",
        sourceText: body.text,
        transactionDate: `${currentMonthKey}-20`,
        visibility: "Private",
      });
      transactions = [transaction, ...transactions.filter((item) => item.id !== transaction.id)];

      await json(route, {
        status: "Responded",
        intent: "CreateExpense",
        assistantMessage: "Tracked ₹540 for dinner from Swiggy under Food Delivery.",
        transaction,
        parsedDebug: null,
        financeAnswer: null,
        errors: [],
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Not mocked" });
  });
}

export async function json(route: Route, body: unknown) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status: 200,
  });
}

export function createDashboard(
  transactions: MockTransaction[],
  month: string,
) {
  const nextMonth = shiftMonthKey(month, 1);
  const periodEnd = new Date(`${nextMonth}-01T00:00:00.000Z`);
  periodEnd.setUTCDate(0);
  const expenses = transactions.filter((transaction) => transaction.type === "Expense");
  const incomeTransactions = transactions.filter((transaction) => transaction.type === "Income");
  const categoryTotals = new Map<string, number>();
  for (const transaction of expenses) {
    categoryTotals.set(
      transaction.categoryName,
      (categoryTotals.get(transaction.categoryName) ?? 0) + transaction.amount,
    );
  }
  const categories = Array.from(categoryTotals, ([name, amount]) => ({
    name,
    amount,
    budget: null,
    tone: name === "Rent" ? "NeedsAttention" : "Watch",
    note: `${name} spending for this month.`,
  }));
  const topCategory = categories.toSorted((left, right) => right.amount - left.amount)[0];
  const spends = expenses.reduce((total, transaction) => total + transaction.amount, 0);
  const income = incomeTransactions.reduce((total, transaction) => total + transaction.amount, 0);

  return {
    month,
    periodStart: `${month}-01`,
    periodEnd: periodEnd.toISOString().slice(0, 10),
    monthLabel: formatMonthKey(month),
    currencyCode: "INR",
    income,
    spends,
    saved: income - spends,
    savingsRate: income > 0 ? Math.round(((income - spends) / income) * 10000) / 100 : null,
    categories,
    judgements: topCategory ? [
      {
        title: "Top category",
        tone: "NeedsAttention",
        value: topCategory.name,
        text: `${topCategory.name} is currently your largest tracked expense category this month.`,
      },
    ] : [],
    insights: topCategory ? [
      {
        title: "Best next move",
        text: `Review ${topCategory.name} first if you want to reduce this month's spending.`,
      },
    ] : [],
    recentTransactions: transactions.slice(0, 6),
  };
}

export function shiftMonthKey(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function formatMonthKey(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

export function createTransaction({
  amount,
  categoryName,
  description,
  id,
  merchantName,
  reason = null,
  senderName = null,
  sourceText,
  transactionDate,
  type = "Expense",
  visibility,
}: {
  amount: number;
  categoryName: string;
  description: string | null;
  id: string;
  merchantName: string | null;
  reason?: string | null;
  senderName?: string | null;
  sourceText: string;
  transactionDate: string;
  type?: "Expense" | "Income" | "Transfer";
  visibility: "Private" | "Household";
}) {
  const deletedAt: string | null = null;
  const purgeAfter: string | null = null;
  return {
    id,
    householdId: "44444444-4444-4444-8444-444444444444",
    userProfileId: "22222222-2222-4222-8222-222222222222",
    amount,
    currencyCode: "INR",
    type,
    categoryName,
    merchantName,
    description,
    senderName,
    reason,
    sourceText,
    transactionDate,
    inputMode: "Text",
    confidence: 0.9,
    visibility,
    createdAt: `${transactionDate}T00:00:00Z`,
    updatedAt: `${transactionDate}T00:00:00Z`,
    updatedByDisplayName: "Playwright Tester",
    deletedAt,
    purgeAfter,
  };
}
