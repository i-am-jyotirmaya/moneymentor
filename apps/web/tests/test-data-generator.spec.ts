import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const profileId = "22222222-2222-4222-8222-222222222222";
const otherProfileId = "33333333-3333-4333-8333-333333333333";
const householdId = "44444444-4444-4444-8444-444444444444";
const marker = "[moneymentor-seed-vone]";

type StoredTransaction = {
  id: string;
  householdId: string;
  userProfileId: string;
  amount: number;
  currencyCode: string;
  type: "Expense" | "Income";
  categoryName: string | null;
  sourceText: string;
  transactionDate: string;
  deleted: boolean;
};

type BackendOptions = {
  assistantFailureStatus?: number;
  assistantNoTransactionRequest?: number;
  canWrite?: boolean;
  consentRequired?: boolean;
  failAssistantRequest?: number;
  refreshStatus?: number;
  initialTransactions?: StoredTransaction[];
};

type BackendHarness = {
  transactions: StoredTransaction[];
  assistantBodies: Array<Record<string, unknown>>;
  deletedIds: string[];
  restoredIds: string[];
  writeCount: () => number;
};

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Browser script coverage only needs one engine profile.");
});

async function json(route: Route, value: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(value),
  });
}

function transaction(overrides: Partial<StoredTransaction> = {}): StoredTransaction {
  return {
    id: `transaction-${Math.random().toString(16).slice(2)}`,
    householdId,
    userProfileId: profileId,
    amount: 100,
    currencyCode: "INR",
    type: "Expense",
    categoryName: "Groceries",
    sourceText: `groceries for 100 ${marker}`,
    transactionDate: "2026-07-04",
    deleted: false,
    ...overrides,
  };
}

function parserCategory(sourceText: string) {
  if (sourceText.includes("salary")) return "Salary / Wages";
  if (sourceText.includes("rent")) return "Rent";
  if (sourceText.includes("groceries")) return "Groceries";
  if (sourceText.includes("petrol")) return "Fuel";
  if (sourceText.includes("swiggy")) return "Food Delivery";
  if (sourceText.includes("electricity") || sourceText.includes("internet")) return "Utilities";
  if (sourceText.includes("amazon")) return "Shopping";
  return null;
}

async function mockSeedBackend(page: Page, options: BackendOptions = {}): Promise<BackendHarness> {
  const transactions = [...(options.initialTransactions ?? [])];
  const assistantBodies: Array<Record<string, unknown>> = [];
  const deletedIds: string[] = [];
  const restoredIds: string[] = [];
  let writeCount = 0;

  await page.route("http://localhost:5267/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname === "/api/auth/refresh" && method === "POST") {
      if (options.refreshStatus) {
        await json(route, { title: "Session unavailable" }, options.refreshStatus);
        return;
      }
      await json(route, {
        accessToken: "seed-test-access-token",
        accessTokenExpiresAt: "2099-01-01T00:00:00Z",
        requiresPrivacyConsent: Boolean(options.consentRequired),
        user: { id: "auth-user", email: "seed@example.test", displayName: "Seed Tester", roles: ["User"] },
      });
      return;
    }

    if (url.pathname === "/api/settings/me" && method === "GET") {
      await json(route, {
        userProfileId: profileId,
        email: "seed@example.test",
        displayName: "Seed Tester",
        currencyCode: "INR",
        timeZone: "Asia/Calcutta",
        plan: "Premium",
        requireMerchantForExpenses: false,
        defaultTransactionVisibility: "Private",
      });
      return;
    }

    if (url.pathname === "/api/households" && method === "GET") {
      await json(route, {
        plan: "Premium",
        canUseHouseholds: true,
        defaultHouseholdId: householdId,
        households: [{
          id: householdId,
          name: "Seed Test Personal",
          kind: "Personal",
          currencyCode: "INR",
          timeZone: "Asia/Calcutta",
          role: "Owner",
          status: "Active",
          canWrite: options.canWrite ?? true,
          memberCount: 1,
          createdAt: "2026-01-01T00:00:00Z",
        }],
      });
      return;
    }

    if (url.pathname === "/api/transactions" && method === "GET") {
      const month = url.searchParams.get("month");
      const pageNumber = Number(url.searchParams.get("page") ?? 1);
      const pageSize = Number(url.searchParams.get("pageSize") ?? 100);
      const matching = transactions.filter((item) => !item.deleted && item.transactionDate.startsWith(month ?? ""));
      await json(route, {
        items: matching.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
        page: pageNumber,
        pageSize,
        totalCount: matching.length,
        totalPages: Math.ceil(matching.length / pageSize),
        month,
      });
      return;
    }

    if (url.pathname === "/api/assistant/messages" && method === "POST") {
      writeCount += 1;
      const body = route.request().postDataJSON() as Record<string, unknown>;
      assistantBodies.push(body);
      if (options.failAssistantRequest === assistantBodies.length) {
        await json(route, { title: "Synthetic assistant failure" }, options.assistantFailureStatus ?? 500);
        return;
      }
      if (options.assistantNoTransactionRequest === assistantBodies.length) {
        await json(route, {
          status: "NeedsClarification",
          intent: "ClarificationResponse",
          assistantMessage: "Synthetic clarification request.",
          transaction: null,
          errors: [],
        });
        return;
      }

      const sourceText = String(body.text);
      const amountMatch = sourceText.match(/\d+(?:\.\d+)?/);
      const created = transaction({
        id: `created-${assistantBodies.length}`,
        amount: Number(amountMatch?.[0]),
        categoryName: parserCategory(sourceText),
        sourceText,
        transactionDate: String(body.transactionDate),
        type: sourceText.includes("salary") ? "Income" : "Expense",
      });
      transactions.push(created);
      await json(route, {
        status: "Responded",
        intent: created.type === "Income" ? "CreateIncome" : "CreateExpense",
        assistantMessage: "Tracked test transaction.",
        transaction: created,
        errors: [],
      });
      return;
    }

    const transactionMatch = url.pathname.match(/^\/api\/transactions\/([^/]+)$/);
    if (transactionMatch && method === "PATCH") {
      writeCount += 1;
      const item = transactions.find((candidate) => candidate.id === transactionMatch[1] && !candidate.deleted);
      if (!item) {
        await json(route, { title: "Not found" }, 404);
        return;
      }
      const body = route.request().postDataJSON() as { categoryName: string };
      item.categoryName = body.categoryName;
      await json(route, item);
      return;
    }

    if (transactionMatch && method === "DELETE") {
      writeCount += 1;
      const item = transactions.find((candidate) => candidate.id === transactionMatch[1] && !candidate.deleted);
      if (!item) {
        await json(route, { title: "Not found" }, 404);
        return;
      }
      item.deleted = true;
      deletedIds.push(item.id);
      await json(route, item);
      return;
    }

    const restoreMatch = url.pathname.match(/^\/api\/transactions\/([^/]+)\/restore$/);
    if (restoreMatch && method === "POST") {
      writeCount += 1;
      const item = transactions.find((candidate) => candidate.id === restoreMatch[1] && candidate.deleted);
      if (!item) {
        await json(route, { title: "Not found" }, 404);
        return;
      }
      item.deleted = false;
      restoredIds.push(item.id);
      await json(route, item);
      return;
    }

    await json(route, { title: `Unhandled ${method} ${url.pathname}` }, 404);
  });

  return { transactions, assistantBodies, deletedIds, restoredIds, writeCount: () => writeCount };
}

async function loadGenerator(page: Page) {
  await page.goto("/login");
  const scriptPath = path.resolve(test.info().config.rootDir, "../../../scripts/generate-test-data.browser.js");
  await page.addScriptTag({ path: scriptPath });
}

async function runGenerator(page: Page, options: Record<string, unknown>) {
  return page.evaluate(async (generatorOptions) => {
    const target = window as typeof window & {
      generateMoneyMentorTestData: (value: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };
    return target.generateMoneyMentorTestData(generatorOptions);
  }, options);
}

test("dry run derives the two completed household months and performs no writes", async ({ page }) => {
  const backend = await mockSeedBackend(page);
  await loadGenerator(page);

  const result = await runGenerator(page, {
    dryRun: true,
    monthlyIncome: 10_000,
    now: "2026-08-29T12:00:00Z",
  });

  expect(result.periods).toEqual(["2026-06", "2026-07"]);
  expect(result.plannedTransactionCount).toBe(33);
  expect(result.financialSummary).toEqual([
    expect.objectContaining({ period: "2026-06", income: 10_000, consumption: 4_600, savingsAllocation: 1_500 }),
    expect.objectContaining({ period: "2026-07", income: 9_500, consumption: 6_850, savingsAllocation: 800 }),
  ]);
  expect(backend.writeCount()).toBe(0);
});

test("replacement removes only the current profile's marked rows and normalizes categories", async ({ page }) => {
  const oldSeed = transaction({ id: "old-own-seed" });
  const normalTransaction = transaction({ id: "normal-own", sourceText: "groceries for 100" });
  const otherUsersSeed = transaction({ id: "other-user-seed", userProfileId: otherProfileId });
  const backend = await mockSeedBackend(page, {
    initialTransactions: [oldSeed, normalTransaction, otherUsersSeed],
  });
  await loadGenerator(page);
  page.once("dialog", (dialog) => dialog.accept());

  const result = await runGenerator(page, { now: "2026-08-29T12:00:00Z" });

  expect(result.createdTransactionCount).toBe(33);
  expect(result.replacedTransactionCount).toBe(1);
  expect(backend.deletedIds).toContain("old-own-seed");
  expect(backend.deletedIds).not.toContain("normal-own");
  expect(backend.deletedIds).not.toContain("other-user-seed");
  expect(backend.assistantBodies).toHaveLength(33);
  expect(backend.assistantBodies.every((body) => body.householdId === householdId && body.inputMode === "System")).toBe(true);

  const activeCreated = backend.transactions.filter((item) => !item.deleted && item.id.startsWith("created-"));
  expect(activeCreated).toHaveLength(33);
  expect(activeCreated.filter((item) => item.categoryName === "Mutual Funds / ETFs")).toHaveLength(2);
  expect(activeCreated.filter((item) => item.categoryName === "Electricity")).toHaveLength(2);
  expect(activeCreated.filter((item) => item.categoryName === "Internet")).toHaveLength(2);
  expect(activeCreated.filter((item) => item.categoryName === "General Merchandise")).toHaveLength(3);
});

test("cancelling confirmation leaves existing data untouched", async ({ page }) => {
  const oldSeed = transaction({ id: "old-seed" });
  const backend = await mockSeedBackend(page, { initialTransactions: [oldSeed] });
  await loadGenerator(page);
  page.once("dialog", (dialog) => dialog.dismiss());

  const result = await runGenerator(page, { now: "2026-08-29T12:00:00Z" });

  expect(result.cancelled).toBe(true);
  expect(backend.writeCount()).toBe(0);
  expect(oldSeed.deleted).toBe(false);
});

test("a partial creation failure removes new rows and restores replaced rows", async ({ page }) => {
  const oldSeed = transaction({ id: "old-seed" });
  const backend = await mockSeedBackend(page, {
    failAssistantRequest: 3,
    initialTransactions: [oldSeed],
  });
  await loadGenerator(page);
  page.once("dialog", (dialog) => dialog.accept());

  await expect(runGenerator(page, { now: "2026-08-29T12:00:00Z" }))
    .rejects.toThrow("previous generated data was restored");

  expect(backend.restoredIds).toContain("old-seed");
  expect(oldSeed.deleted).toBe(false);
  expect(backend.transactions.filter((item) => item.id.startsWith("created-") && !item.deleted)).toHaveLength(0);
});

test("privacy consent and invalid sessions stop before financial APIs or writes", async ({ page }) => {
  const consentBackend = await mockSeedBackend(page, { consentRequired: true });
  await loadGenerator(page);
  await expect(runGenerator(page, { dryRun: true })).rejects.toThrow("Accept the current privacy policy");
  expect(consentBackend.writeCount()).toBe(0);

  await page.unrouteAll({ behavior: "wait" });
  const authBackend = await mockSeedBackend(page, { refreshStatus: 401 });
  await expect(runGenerator(page, { dryRun: true })).rejects.toThrow("Could not restore the logged-in session");
  expect(authBackend.writeCount()).toBe(0);
});

test("a non-writable personal household is rejected before confirmation", async ({ page }) => {
  const backend = await mockSeedBackend(page, { canWrite: false });
  await loadGenerator(page);

  await expect(runGenerator(page, { dryRun: true })).rejects.toThrow("cannot write");
  expect(backend.writeCount()).toBe(0);
});

test("parser clarification is treated as a failed write and rolled back", async ({ page }) => {
  const oldSeed = transaction({ id: "old-seed" });
  const backend = await mockSeedBackend(page, {
    assistantNoTransactionRequest: 1,
    initialTransactions: [oldSeed],
  });
  await loadGenerator(page);
  page.once("dialog", (dialog) => dialog.accept());

  await expect(runGenerator(page, { now: "2026-08-29T12:00:00Z" }))
    .rejects.toThrow("previous generated data was restored");
  expect(backend.restoredIds).toContain("old-seed");
  expect(oldSeed.deleted).toBe(false);
});

test("rate limiting fails clearly without leaving partial generated data", async ({ page }) => {
  const backend = await mockSeedBackend(page, {
    assistantFailureStatus: 429,
    failAssistantRequest: 2,
  });
  await loadGenerator(page);
  page.once("dialog", (dialog) => dialog.accept());

  await expect(runGenerator(page, { now: "2026-08-29T12:00:00Z" }))
    .rejects.toThrow("previous generated data was restored");
  expect(backend.transactions.filter((item) => item.id.startsWith("created-") && !item.deleted)).toHaveLength(0);
});

test("rerunning replaces the prior generated rows instead of duplicating them", async ({ page }) => {
  const backend = await mockSeedBackend(page);
  await loadGenerator(page);
  page.on("dialog", (dialog) => dialog.accept());

  await runGenerator(page, { now: "2026-08-29T12:00:00Z" });
  await runGenerator(page, { now: "2026-08-29T12:00:00Z" });

  const activeSeedRows = backend.transactions.filter((item) => !item.deleted && item.sourceText.includes(marker));
  expect(activeSeedRows).toHaveLength(33);
  expect(backend.assistantBodies).toHaveLength(66);
});

test("household timezone controls which months are considered complete", async ({ page }) => {
  await mockSeedBackend(page);
  await loadGenerator(page);

  const result = await runGenerator(page, {
    dryRun: true,
    now: "2026-08-31T20:00:00Z",
  });

  expect(result.periods).toEqual(["2026-07", "2026-08"]);
});
