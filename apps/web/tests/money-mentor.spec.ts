import { expect, test, type Page, type Route } from "@playwright/test";

const currentMonthKey = new Date().toISOString().slice(0, 7);
const previousMonthKey = shiftMonthKey(currentMonthKey, -1);

const mockSession = {
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

type MockTransaction = Omit<ReturnType<typeof createTransaction>, "deletedAt" | "purgeAfter"> & {
  deletedAt: string | null;
  purgeAfter: string | null;
};

const baseTransactions = [
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

async function seedAuthSession(page: Page) {
  await page.addInitScript(() => undefined);
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
  let transactions: MockTransaction[] = [...baseTransactions];
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

  await page.route("http://localhost:5267/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

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

      transactions[index] = {
        ...transactions[index],
        ...body,
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
      await json(route, { policyVersion: "2026-07-03-beta.1", acceptedAt: new Date().toISOString() });
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
  await expect(dialog.getByRole("heading", { name: "What did you spend or receive?" })).toBeVisible();

  const box = await dialog.boundingBox();
  expect(box?.width).toBeLessThan(520);
  expect(box?.height).toBeLessThan(650);
});

test("assistant popup keeps long conversations scrollable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");

  await page.goto("/");
  await page.getByRole("button", { name: "Open assistant chat" }).click();
  const dialog = page.getByRole("dialog", { name: "Assistant chat" });
  await dialog.getByLabel("Message MoneyMentor").fill("long assistant response");
  await dialog.getByRole("button", { name: "Send message" }).click();
  await expect(dialog.getByText(/Scrollable assistant detail 40/)).toBeVisible();

  const scrollState = await dialog.locator(".chat-scroll").evaluate((element) => ({
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    scrollHeight: element.scrollHeight,
  }));
  expect(scrollState.overflowY).toBe("auto");
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
});

test("dashboard month controls load the previous month", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");

  await page.goto("/");
  const dashboardRequest = page.waitForRequest(
    (request) =>
      request.url().includes(`/api/dashboard/monthly?month=${previousMonthKey}`) &&
      request.method() === "GET",
  );
  await page.getByRole("button", { name: "Previous dashboard month" }).click();
  await dashboardRequest;

  await expect(page.getByLabel("Dashboard month", { exact: true })).toHaveValue(previousMonthKey);
  await expect(page.getByText(formatMonthKey(previousMonthKey)).first()).toBeVisible();
});

test("transaction list paginates by month and opens editing only from the edit icon", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");

  await page.goto("/transactions");
  await expect(page.getByRole("dialog", { name: "Edit transaction" })).toHaveCount(0);
  await expect(page.getByText(/12 records, Page 1 of 2/).first()).toBeVisible();

  await page.getByRole("button", { name: "Next transaction page" }).click();
  await expect(page.getByText(/12 records, Page 2 of 2/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit transaction/ })).toHaveCount(2);

  await page.getByLabel("Transaction month", { exact: true }).first().selectOption(previousMonthKey);
  await expect(page.getByText("Previous month taxi").first()).toBeVisible();
  await expect(page.getByText(/1 records/).first()).toBeVisible();

  await page.getByRole("button", { name: "Edit transaction Previous month taxi" }).click();
  const editor = page.getByRole("dialog", { name: "Edit transaction" });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Amount")).toHaveValue("450");
  await editor.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(editor).toHaveCount(0);
});

test("mobile transaction editor is hidden until an edit icon is tapped", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only scenario");

  await page.goto("/transactions");
  await expect(page.getByRole("dialog", { name: "Edit transaction" })).toHaveCount(0);
  await page.getByRole("button", { name: /Edit transaction/ }).first().click();
  await expect(page.getByRole("dialog", { name: "Edit transaction" })).toBeVisible();
});

test("desktop assistant sends a finance question to the backend", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");

  await page.goto("/");
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await page.getByLabel("Message MoneyMentor").first().fill("where did I spend most this month?");
  await page.getByRole("button", { name: "Send message" }).first().click();

  await expect(page.getByText("You spent the most on Rent").first()).toBeVisible();
});

test("assistant tracks income with sender and reason terminology", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");

  await page.goto("/");
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await page.getByLabel("Message MoneyMentor").first().fill("Joe sent me 300 Rs for chips");
  await page.getByRole("button", { name: "Send message" }).first().click();
  await expect(page.getByText("Tracked ₹300 received from Joe for chips.").first()).toBeVisible();

  await page.goto("/transactions");
  await expect(page.getByText("chips", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/From Joe/).first()).toBeVisible();
  await page.getByRole("button", { name: "Edit transaction chips" }).click();

  const editor = page.getByRole("dialog", { name: "Edit transaction" });
  await expect(editor.getByLabel("Sender")).toHaveValue("Joe");
  await expect(editor.getByLabel("Reason")).toHaveValue("chips");
  await expect(editor.getByLabel("Merchant")).toHaveCount(0);
});

test("household invitations can be accepted and sent", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");

  await page.goto("/household");
  await expect(page.getByText(/Joe invited you as Member/).first()).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).first().click();
  await expect(page.getByText("You joined Friends workspace.").first()).toBeVisible();
  await page.getByLabel("Household").first().selectOption("44444444-4444-4444-8444-444444444444");

  const invitationRequest = page.waitForRequest(
    (request) =>
      /\/api\/households\/[^/]+\/invitations$/.test(new URL(request.url()).pathname) &&
      request.method() === "POST",
  );
  await page.getByLabel("Email").first().fill("friend@example.com");
  await page.getByLabel("Role").first().selectOption("Viewer");
  await page.getByRole("button", { name: "Send invitation" }).first().click();

  const request = await invitationRequest;
  expect(request.postDataJSON()).toEqual({ email: "friend@example.com", role: "Viewer" });
  await expect(page.getByText("Invitation sent to friend@example.com.").first()).toBeVisible();
  await expect(page.getByText("Queued").first()).toBeVisible();
});

test("silent refresh restores the session and logout calls the server", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");
  const refreshRequest = page.waitForRequest((request) => request.url().endsWith("/api/auth/refresh"));
  await page.goto("/");
  await refreshRequest;
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const logoutRequest = page.waitForRequest((request) => request.url().endsWith("/api/auth/logout"));
  await page.getByRole("button", { name: "Sign out" }).click();
  await logoutRequest;
  await expect(page).toHaveURL(/\/login$/);
});

test("privacy consent gate blocks finance UI until accepted", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");
  await page.route("http://localhost:5267/api/auth/refresh", async (route) => {
    await json(route, { ...mockSession, requiresPrivacyConsent: true });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Review the beta privacy policy" })).toBeVisible();
  await page.getByRole("button", { name: "Accept and continue" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("delete offers undo and Premium remains read-only", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");
  await page.goto("/transactions");
  await page.getByRole("button", { name: /Delete transaction Paid rent/ }).click();
  await expect(page.getByText("Moved to Recently Deleted.")).toBeVisible();
  await expect(page.getByText("Paid rent").last()).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Moved to Recently Deleted.")).toHaveCount(0);

  await page.goto("/settings");
  await expect(page.getByLabel("Plan")).toHaveAttribute("readonly", "");
  await expect(page.getByText(/Entitlements are server-controlled/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Read the beta privacy policy" })).toBeVisible();
  await expect(page.getByText(/Support:/)).toBeVisible();
});

test("Viewer household selection disables transaction writes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");
  await page.route("http://localhost:5267/api/households", async (route) => {
    await json(route, {
      plan: "Premium",
      canUseHouseholds: true,
      defaultHouseholdId: "viewer-household",
      households: [{
        id: "viewer-household",
        name: "Shared read only",
        kind: "Family",
        role: "Viewer",
        status: "Active",
        canWrite: false,
        memberCount: 2,
        createdAt: "2026-06-01T00:00:00Z",
      }],
    });
  });
  await page.goto("/transactions");
  await expect(page.getByText("Read only")).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit transaction/ }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: /Delete transaction/ }).first()).toBeDisabled();
});

test("mobile root opens directly to the assistant", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only scenario");

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What did you spend or receive?" })).toBeVisible();
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

function createDashboard(
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

function shiftMonthKey(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7);
}

function formatMonthKey(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function createTransaction({
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
