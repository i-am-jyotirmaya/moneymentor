import { expect, test, type Page, type Route } from "@playwright/test";

const sessionStorageKey = "moneymentor.auth.session.v1";

const mockSession = {
  accessToken: "playwright-access-token",
  accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
  refreshToken: "playwright-refresh-token",
  refreshTokenExpiresAt: "2099-01-02T00:00:00.000Z",
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "playwright@moneymentor.test",
    displayName: "Playwright Tester",
    roles: ["User"],
  },
};

const baseTransactions = [
  createTransaction({
    amount: 18000,
    categoryName: "Rent",
    description: "Paid rent",
    id: "txn-rent",
    merchantName: "Landlord",
    sourceText: "paid rent 18000",
    transactionDate: "2026-06-03",
    visibility: "Household",
  }),
  createTransaction({
    amount: 3250,
    categoryName: "Groceries",
    description: "Groceries",
    id: "txn-groceries",
    merchantName: "Local market",
    sourceText: "groceries for 3250 from local market",
    transactionDate: "2026-06-08",
    visibility: "Household",
  }),
];

async function seedAuthSession(page: Page) {
  await page.addInitScript(
    ([key, session]) => {
      window.sessionStorage.setItem(key, JSON.stringify(session));
    },
    [sessionStorageKey, mockSession],
  );
}

async function seedVoiceRecognition(page: Page) {
  await page.addInitScript(() => {
    class FakeSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "en-IN";
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onresult: ((event: { results: Array<Array<{ transcript: string }>> }) => void) | null = null;

      start() {
        window.setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: "swiggy dinner 540" }]] });
          this.onend?.();
        }, 1200);
      }

      stop() {
        this.onend?.();
      }
    }

    Object.assign(window, {
      SpeechRecognition: FakeSpeechRecognition,
      webkitSpeechRecognition: FakeSpeechRecognition,
    });
  });
}

async function mockBackend(page: Page) {
  let transactions = [...baseTransactions];

  await page.route("http://localhost:5267/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname === "/api/auth/login" && method === "POST") {
      await json(route, mockSession);
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
      await json(route, transactions);
      return;
    }

    if (url.pathname === "/api/households" && method === "GET") {
      await json(route, {
        plan: "Premium",
        canUseHouseholds: true,
        households: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            name: "Family workspace",
            kind: "Family",
            role: "Owner",
            status: "Active",
            memberCount: 1,
            createdAt: "2026-06-01T00:00:00Z",
          },
        ],
      });
      return;
    }

    if (url.pathname === "/api/dashboard/monthly" && method === "GET") {
      await json(route, createDashboard(transactions));
      return;
    }

    if (url.pathname === "/api/assistant/messages" && method === "POST") {
      const body = route.request().postDataJSON() as { text: string };
      if (/where/i.test(body.text)) {
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
            month: "2026-06",
            periodStart: "2026-06-01",
            periodEnd: "2026-06-30",
            currencyCode: "INR",
            amount: 18000,
            categoryName: "Rent",
            categories: createDashboard(transactions).categories,
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
        transactionDate: "2026-06-20",
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

test.beforeEach(async ({ page }) => {
  await seedAuthSession(page);
  await mockBackend(page);
});

test("login posts credentials to the API without putting them in the URL", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("button", { name: "Sign in" })).toHaveAttribute("type", "button");
  await expect(page.getByLabel("Email")).not.toHaveAttribute("name", /.+/);
  await expect(page.getByLabel("Password")).not.toHaveAttribute("name", /.+/);

  const loginRequest = page.waitForRequest(
    (request) =>
      request.url() === "http://localhost:5267/api/auth/login" &&
      request.method() === "POST",
  );

  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("dummy-secret");
  await page.getByRole("button", { name: "Sign in" }).click();

  const request = await loginRequest;
  expect(request.postDataJSON()).toEqual({
    email: "demo@example.com",
    password: "dummy-secret",
  });
  await expect(page).toHaveURL("http://127.0.0.1:3000/");
  expect(page.url()).not.toContain("password");
  expect(page.url()).not.toContain("dummy-secret");
});

test("desktop dashboard is the default authenticated screen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Backend data")).toBeVisible();
  await expect(page.getByText("Income", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Spends", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Groceries", { exact: true }).first()).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "Paid rent" }).first()).toBeVisible();
  await expect(page.getByText("Mock data active")).toHaveCount(0);
  await testInfo.attach("desktop-dashboard", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
});

test("desktop assistant opens as a compact floating chat", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");

  await page.goto("/");
  await page.getByRole("button", { name: "Open assistant chat" }).click();

  const dialog = page.getByRole("dialog", { name: "Assistant chat" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "What did you spend on?" })).toBeVisible();

  const box = await dialog.boundingBox();
  expect(box?.width).toBeLessThan(520);
  expect(box?.height).toBeLessThan(650);
});

test("desktop assistant sends a finance question to the backend", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");

  await page.goto("/");
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await page.getByLabel("Message MoneyMentor").first().fill("where did I spend most this month?");
  await page.getByRole("button", { name: "Send message" }).first().click();

  await expect(page.getByText("You spent the most on Rent").first()).toBeVisible();
});

test("mobile root opens directly to the assistant", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only scenario");

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What did you spend on?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start voice input" })).toBeVisible();
});

test("mobile hamburger menu can open the dashboard", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only scenario");

  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByLabel("Mobile menu")).toBeVisible();
  await page.getByRole("button", { name: "Dashboard" }).click();

  await expect(page.getByRole("heading", { name: "Dashboard" }).last()).toBeVisible();
  await expect(page.getByText("Backend data").last()).toBeVisible();
});

test("voice interaction shows wave feedback and sends captured speech", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only scenario");
  await seedVoiceRecognition(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Start voice input" }).click();

  await expect(page.getByTestId("voice-wave")).toBeVisible();
  await expect(page.getByText("Recording")).toBeVisible();
  await testInfo.attach("mobile-voice-recording", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
  await expect(page.locator(".chat-message-bubble").filter({ hasText: "swiggy dinner 540" })).toBeVisible({ timeout: 3000 });
  await expect(page.getByText("Tracked ₹540 for dinner")).toBeVisible({ timeout: 4000 });
});

async function json(route: Route, body: unknown) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status: 200,
  });
}

function createDashboard(transactions: Array<ReturnType<typeof createTransaction>>) {
  return {
    month: "2026-06",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    monthLabel: "June 2026",
    currencyCode: "INR",
    income: 0,
    spends: transactions.reduce((total, transaction) => total + transaction.amount, 0),
    saved: -transactions.reduce((total, transaction) => total + transaction.amount, 0),
    savingsRate: null,
    categories: [
      {
        name: "Rent",
        amount: 18000,
        budget: null,
        tone: "NeedsAttention",
        note: "Rent is taking a large share of tracked spending this month.",
      },
      {
        name: "Groceries",
        amount: 3250,
        budget: null,
        tone: "Watch",
        note: "Groceries is worth watching as the month develops.",
      },
    ],
    judgements: [
      {
        title: "Top category",
        tone: "NeedsAttention",
        value: "Rent",
        text: "Rent is currently your largest tracked expense category this month.",
      },
    ],
    insights: [
      {
        title: "Best next move",
        text: "Review Rent first if you want to reduce this month's spending.",
      },
    ],
    recentTransactions: transactions,
  };
}

function createTransaction({
  amount,
  categoryName,
  description,
  id,
  merchantName,
  sourceText,
  transactionDate,
  visibility,
}: {
  amount: number;
  categoryName: string;
  description: string;
  id: string;
  merchantName: string;
  sourceText: string;
  transactionDate: string;
  visibility: "Private" | "Household";
}) {
  return {
    id,
    householdId: "44444444-4444-4444-8444-444444444444",
    userProfileId: "22222222-2222-4222-8222-222222222222",
    amount,
    currencyCode: "INR",
    type: "Expense",
    categoryName,
    merchantName,
    description,
    sourceText,
    transactionDate,
    inputMode: "Text",
    confidence: 0.9,
    visibility,
    createdAt: `${transactionDate}T00:00:00Z`,
    updatedAt: `${transactionDate}T00:00:00Z`,
    updatedByDisplayName: "Playwright Tester",
  };
}
