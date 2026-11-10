import { expect, test, type Page } from "@playwright/test";

// Pretend to be the Android shell: Capacitor reports "android" when window.androidBridge
// exists, and App plugin calls go through the native callback below. The test keeps the
// registered listeners so it can press the hardware Back button.
async function emulateAndroidShell(page: Page) {
  await page.addInitScript(() => {
    const listeners: Record<string, (data: unknown) => void> = {};
    const shell = window as unknown as Record<string, unknown>;
    shell.__nativeListeners = listeners;
    shell.androidBridge = { postMessage() {} };
    shell.Capacitor = {
      PluginHeaders: [{
        name: "App",
        methods: ["addListener", "removeListener", "getLaunchUrl", "minimizeApp"].map(name => ({
          name, rtype: name === "addListener" ? "callback" : "promise",
        })),
      }],
      nativeCallback(_plugin: string, method: string, options: { eventName?: string }, callback: (data: unknown) => void) {
        if (method === "addListener" && options.eventName) listeners[options.eventName] = callback;
        return `callback-${Object.keys(listeners).length}`;
      },
      nativePromise() { return Promise.resolve(undefined); },
    };
  });
}

async function pressAndroidBack(page: Page) {
  await page.evaluate(() => {
    const listeners = (window as unknown as { __nativeListeners: Record<string, (data: unknown) => void> }).__nativeListeners;
    listeners.backButton({ canGoBack: true });
  });
}

const session = {
  accessToken: "playwright-access-token",
  accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
  user: { id: "11111111-1111-4111-8111-111111111111", email: "playwright@moneymentor.test", displayName: "Playwright Tester", roles: ["User"] },
};

async function signedIn(page: Page, requiresPrivacyConsent: boolean) {
  const month = new Date().toISOString().slice(0, 7);
  await page.route("**/api/**", route => {
    const { pathname } = new URL(route.request().url());
    const body: Record<string, unknown> = {
      "/api/auth/refresh": { ...session, requiresPrivacyConsent },
      "/api/settings/me": {
        userProfileId: "22222222-2222-4222-8222-222222222222", email: session.user.email, displayName: session.user.displayName,
        currencyCode: "INR", timeZone: "Asia/Calcutta", plan: "Free", requireMerchantForExpenses: false, defaultTransactionVisibility: "Private",
      },
      "/api/households": {
        plan: "Free", canUseHouseholds: false, defaultHouseholdId: "33333333-3333-4333-8333-333333333333",
        households: [{ id: "33333333-3333-4333-8333-333333333333", name: "Personal", kind: "Personal", role: "Owner", status: "Active", canWrite: true, memberCount: 1, createdAt: "2026-06-01T00:00:00Z" }],
      },
      "/api/households/invitations": [],
      "/api/financial-accounts": [],
      "/api/categories": { householdId: null, canWrite: true, categories: [] },
      "/api/goals": [],
      "/api/commitments": [],
      "/api/transactions": { items: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 0, month },
      "/api/transactions/trash": { items: [] },
      "/api/dashboard/monthly": {
        month, periodStart: `${month}-01`, periodEnd: `${month}-28`, monthLabel: month, currencyCode: "INR",
        income: 0, spends: 0, saved: 0, savingsRate: null, categories: [], judgements: [], insights: [], recentTransactions: [],
      },
    };
    return pathname in body ? route.fulfill({ json: body[pathname] }) : route.fulfill({ status: 404, body: "Not mocked" });
  });
}

test("on Android the signup policy opens in a sheet and the half-filled form survives", async ({ page, context }) => {
  await emulateAndroidShell(page);
  await page.route("**/api/auth/registration", route => route.fulfill({ json: { mode: "Open" } }));
  await page.route("**/api/auth/refresh", route => route.fulfill({ status: 401, json: { errors: ["Signed out"] } }));
  const newTabs: string[] = [];
  context.on("page", tab => newTabs.push(tab.url()));
  await page.goto("/signup/");
  await page.getByLabel("Display name").fill("Asha E1");
  await page.getByLabel("Email", { exact: true }).fill("asha.e1@example.com");
  await page.getByLabel("Password", { exact: true }).fill("not-a-real-password");

  const link = page.getByRole("link", { name: "beta privacy policy" });
  const sheet = page.getByRole("dialog", { name: "Privacy policy" });
  const consent = page.getByRole("checkbox");
  await expect(consent).not.toBeChecked();

  // Escape closes the sheet and focus returns to the link.
  await link.click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Spndrr beta privacy policy" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Close privacy policy" })).toBeFocused();
  await expect(page).toHaveURL(/\/signup\/$/);
  // Tapping inside the sheet must not reach the consent checkbox's <label>.
  await sheet.getByText("What we store").click();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(link).toBeFocused();

  // The close button and the hardware Back button close it too.
  await link.click();
  await sheet.getByRole("button", { name: "Close privacy policy" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(link).toBeFocused();
  await link.click();
  await expect(sheet).toBeVisible();
  await pressAndroidBack(page);
  await expect(sheet).toHaveCount(0);
  await expect(link).toBeFocused();

  await expect(page).toHaveURL(/\/signup\/$/);
  await expect(page.getByLabel("Display name")).toHaveValue("Asha E1");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("asha.e1@example.com");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("not-a-real-password");
  await expect(consent).not.toBeChecked();
  expect(newTabs).toEqual([]);
});

test("on Android the Settings and consent-gate policy links use the same sheet", async ({ page }) => {
  await emulateAndroidShell(page);
  await signedIn(page, false);
  await page.goto("/settings/");
  await page.getByRole("link", { name: "Read the beta privacy policy" }).click();
  const sheet = page.getByRole("dialog", { name: "Privacy policy" });
  await expect(sheet.getByRole("heading", { name: "Spndrr beta privacy policy" })).toBeVisible();
  await pressAndroidBack(page);
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/$/);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await signedIn(page, true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Review the beta privacy policy" })).toBeVisible();
  await page.getByRole("link", { name: "Read the plain-language policy" }).click();
  await expect(sheet.getByRole("heading", { name: "Spndrr beta privacy policy" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Review the beta privacy policy" })).toBeVisible();
});

test("the mobile bundle in a plain browser keeps the new-tab policy link", async ({ page }) => {
  await page.route("**/api/auth/registration", route => route.fulfill({ json: { mode: "Open" } }));
  await page.route("**/api/auth/refresh", route => route.fulfill({ status: 401, json: {} }));
  await page.goto("/signup/");
  const link = page.getByRole("link", { name: "beta privacy policy" });
  await expect(link).toHaveAttribute("href", /^\/privacy\/?$/);
  await expect(link).toHaveAttribute("target", "_blank");
});
