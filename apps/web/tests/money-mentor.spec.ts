import { expect, test, type Route } from "@playwright/test";
import {
  currentMonthKey,
  formatMonthKey,
  json,
  mockBackend,
  mockSession,
  previousMonthKey,
  seedAuthSession,
  seedVoiceRecognition,
} from "./support/mock-backend";
import { mockViewerHousehold } from "./support/scenarios";

test.beforeEach(async ({ page }) => {
  await seedAuthSession(page);
  await mockBackend(page);
});

test("login posts credentials to the API without putting them in the URL", async ({ page, baseURL }) => {
  await page.goto("/login");

  await expect(page.getByRole("button", { name: "Sign in" })).toHaveAttribute("type", "submit");
  await expect(page.getByLabel("Email")).not.toHaveAttribute("name", /.+/);
  await expect(page.getByLabel("Password")).not.toHaveAttribute("name", /.+/);

  const loginRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/auth/login") &&
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
  await expect(page).toHaveURL(new URL("/", baseURL).href);
  expect(page.url()).not.toContain("password");
  expect(page.url()).not.toContain("dummy-secret");
});

test("mobile login keeps the fresh access-token session without an immediate refresh", async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only scenario");
  let refreshRequestCount = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/auth/refresh")) {
      refreshRequestCount += 1;
    }
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("dummy-secret");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(new URL("/", baseURL).href);
  await expect(page.getByRole("heading", { name: "What did you spend or receive?" })).toBeVisible();
  await expect(page.getByText("Sign in to use the assistant input workspace.")).toHaveCount(0);
  expect(refreshRequestCount).toBe(0);
});

test("desktop dashboard is the default authenticated screen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Backend data")).toHaveCount(0);
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
  await dialog.getByLabel("Message Spndrr").fill("long assistant response");
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

  await expect(page.getByRole("combobox", { name: "Dashboard month", exact: true })).toHaveText(formatMonthKey(previousMonthKey));
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

  await page.getByRole("combobox", { name: "Transaction month", exact: true }).click();
  await page.getByRole("option", { name: formatMonthKey(previousMonthKey), exact: true }).click();
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
  await page.getByRole("link", { name: "Assistant", exact: true }).click();
  await page.getByLabel("Message Spndrr").first().fill("where did I spend most this month?");
  await page.getByRole("button", { name: "Send message" }).first().click();

  await expect(page.getByText("You spent the most on Rent").first()).toBeVisible();
});

test("assistant tracks income with sender and reason terminology", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");

  await page.goto("/");
  await page.getByRole("link", { name: "Assistant", exact: true }).click();
  await page.getByLabel("Message Spndrr").first().fill("Joe sent me 300 Rs for chips");
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
  await editor.getByRole("combobox", { name: "Category", exact: true }).click();
  await expect(editor.getByRole("option", { name: "Income › Salary / Wages", exact: true })).toHaveCount(1);
  await expect(editor.getByRole("option", { name: "Housing › Rent", exact: true })).toHaveCount(0);
});

test("household invitations can be accepted and sent", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");

  await page.goto("/household");
  await expect(page.getByText(/Joe invited you as Member/).first()).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).first().click();
  await expect(page.getByText("You joined Friends workspace.").first()).toBeVisible();
  await page.getByRole("button", { name: /Family workspace Owner/ }).click();
  await expect(page.getByRole("combobox", { name: "Household", exact: true })).toHaveText("Family workspace (Family)");

  const invitationRequest = page.waitForRequest(
    (request) =>
      /\/api\/households\/[^/]+\/invitations$/.test(new URL(request.url()).pathname) &&
      request.method() === "POST",
  );
  await page.getByLabel("Email").first().fill("friend@example.com");
  await page.getByRole("combobox", { name: "Role", exact: true }).click();
  await page.getByRole("option", { name: "Viewer", exact: true }).click();
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
  await page.route("**/api/auth/refresh", async (route) => {
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
  await page.getByRole("button", { name: "Next transaction page" }).click();
  await page.getByRole("button", { name: /Delete transaction Paid rent/ }).click();
  await expect(page.getByText("Moved to Recently Deleted.")).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("Moved to Recently Deleted.")).toHaveCount(0);

  await page.goto("/settings");
  await expect(page.getByLabel("Plan").first()).toHaveAttribute("readonly", "");
  await expect(page.getByText(/Entitlements are server-controlled/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Read the beta privacy policy" }).first()).toBeVisible();
  await expect(page.getByText(/Support:/).first()).toBeVisible();
});

test("Viewer household selection disables transaction writes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only scenario");
  await mockViewerHousehold(page);
  await page.goto("/transactions");
  await expect(page.locator("main").getByText("Read only", { exact: true }).first()).toBeVisible();
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
  await page.getByRole("navigation", { name: "Mobile navigation", exact: true }).getByRole("link", { name: "Dashboard" }).click();

  await expect(page.getByRole("heading", { name: "Dashboard" }).last()).toBeVisible();
  await expect(page.getByText("Backend data")).toHaveCount(0);
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
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __speechStatus: { active: boolean; stops: number; aborts: number } }).__speechStatus,
  )).toEqual({ active: false, stops: 1, aborts: 0 });
});

test("navigation has real URLs and keeps an unsent tracking draft", async ({ page }, testInfo) => {
  await page.goto("/assistant");
  await page.getByLabel("Message Spndrr").fill("coffee 120");
  const navigation = page.getByRole("navigation", { name: testInfo.project.name === "mobile-chromium" ? "Quick navigation" : "Desktop navigation" });
  await navigation.getByRole("link", { name: "Transactions", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions\/?$/);
  await expect(page.getByRole("heading", { name: "Transactions", exact: true }).last()).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/assistant\/?$/);
  await expect(page.getByLabel("Message Spndrr")).toHaveValue("coffee 120");
  await expect(page.getByLabel("Message Spndrr")).toHaveCount(1);
});

test("transaction filters and editor survive reload and Back", async ({ page }) => {
  await page.goto(`/transactions?month=${previousMonthKey}&page=1`);
  await expect(page.getByRole("combobox", { name: "Transaction month", exact: true })).toHaveText(formatMonthKey(previousMonthKey));
  await page.getByRole("button", { name: "Edit transaction Previous month taxi" }).click();
  await expect(page).toHaveURL(/edit=/);
  await page.reload();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("dashboard drawer is represented by a fragment", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop drawer");
  await page.goto("/dashboard#assistant");
  await expect(page.getByRole("dialog", { name: "Assistant chat" })).toBeVisible();
  await page.getByRole("button", { name: "Close assistant chat" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "Assistant chat" })).toBeVisible();
});

test("invalid URL filters fall back to a usable transaction view", async ({ page }) => {
  await page.goto("/transactions?month=2026-99&page=-12");
  await expect(page.getByRole("combobox", { name: "Transaction month", exact: true })).toHaveText(formatMonthKey(currentMonthKey));
  await expect(page.getByRole("button", { name: "Previous transaction page" })).toBeDisabled();
});

test("slow workspace requests show skeletons and a loading bar", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/dashboard/**", async route => {
    await gate;
    await route.fallback();
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("status", { name: "Loading content" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Loading page" })).toBeVisible();
  release();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true }).last()).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Loading page" })).toHaveCount(0);
});

test("contextual judgments can receive an explanation and be dismissed", async ({ page }) => {
  const id = "11111111-1111-1111-1111-111111111111";
  await page.route("**/api/judgements/active**", route => json(route, [{
    id, title: "Merchant visits changed", value: "INR 400", message: "Four visits this week.",
    decisionAction: "Ask", followUpQuestion: "Was this planned?",
  }]));
  await page.route(`**/api/judgements/${id}/explanations`, route => json(route, { feedbackId: id }));
  await page.route(`**/api/judgements/${id}/dismiss`, route => route.fulfill({ status: 204 }));
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Judgments", exact: true })).toBeVisible();
  await expect(page.getByText("Merchant visits changed")).toBeVisible();
  await expect(page.getByText("Was this planned?")).toBeVisible();
  await page.getByRole("button", { name: "Add context" }).click();
  await page.getByLabel("Your explanation").fill("This was a planned work expense.");
  await page.getByRole("button", { name: "Send explanation" }).click();
  await expect(page.getByText(/saved for review/)).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("Nothing needs your attention right now")).toBeVisible();
});

test("goal deep links load the selected goal", async ({ page }) => {
  const goal = { id: "goal-emergency", name: "Emergency reserve", userProfileId: "profile", remainingAmount: 50000, currentAmount: 1000, targetAmount: 51000, goalType: "Saving", priority: "Medium", status: "Active" };
  await page.route("**/api/goals?**", route => json(route, [goal]));
  await page.route("**/api/goals/goal-emergency", route => json(route, { goal, plan: null, currentUserConsent: null }));
  await page.goto("/planning?goal=goal-emergency#goal-plan");
  await expect(page.locator("#goal-plan").getByText("Emergency reserve", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("#goal-plan").getByText("Emergency reserve", { exact: true })).toBeVisible();
});


test("category dropdown searches the hierarchy and saves a household category by ID", async ({ page }, testInfo) => {
  await page.goto(`/transactions?month=${previousMonthKey}&page=1`);
  await page.getByRole("button", { name: "Edit transaction Previous month taxi" }).click();
  const editor = page.getByRole("dialog", { name: "Edit transaction" });
  const category = editor.getByRole("combobox", { name: "Category", exact: true });
  await expect(category).toHaveAttribute("aria-expanded", "false");
  await expect(editor.getByRole("searchbox")).toHaveCount(0);
  await category.click();
  const panel = editor.getByRole("listbox", { name: "Category options" });
  await expect(panel).toBeVisible();
  const bounds = await panel.evaluate((element) => {
    const rect = element.parentElement!.getBoundingClientRect();
    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, radius: getComputedStyle(element.parentElement!).borderRadius };
  });
  const viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(viewport.width);
  expect(bounds.bottom).toBeLessThanOrEqual(viewport.height);
  expect(Number.parseFloat(bounds.radius)).toBeGreaterThanOrEqual(8);
  await page.screenshot({ path: testInfo.outputPath("category-dropdown.png") });
  await expect(editor.getByRole("option", { name: /Hidden|Salary/ })).toHaveCount(0);
  await editor.getByRole("searchbox", { name: "Search categories" }).fill("DINING");
  await expect(editor.getByRole("option", { name: "Dining & Lifestyle › Restaurants", exact: true })).toBeVisible();
  await expect(editor.getByRole("option", { name: /Housing/ })).toHaveCount(0);
  await editor.getByRole("searchbox", { name: "Search categories" }).fill("date");
  await editor.getByRole("option", { name: "Dining & Lifestyle › Date Night", exact: true }).click();
  await expect(editor.getByRole("searchbox")).toHaveCount(0);
  await expect(category).toHaveText("Dining & Lifestyle › Date Night");
  await expect(category).toHaveAccessibleDescription("Dining & Lifestyle › Date Night");
  const request = page.waitForRequest((request) => request.method() === "PATCH" && request.url().includes("/transactions/txn-previous-taxi"));
  await editor.getByRole("button", { name: "Save transaction" }).click();
  expect((await request).postDataJSON()).toMatchObject({ categoryId: "custom-dining" });
  expect((await request).postDataJSON()).not.toHaveProperty("categoryName");
  await expect(editor).toHaveCount(0);
  await expect(page.locator("article").filter({ has: page.getByRole("button", { name: "Edit transaction Previous month taxi" }) }).last()).toContainText("Date Night");
  await page.getByRole("button", { name: "Edit transaction Previous month taxi" }).click();
  await expect(category).toHaveText("Dining & Lifestyle › Date Night");
  await category.click();
  await expect(editor.getByRole("searchbox")).toHaveValue("");
  await editor.getByRole("searchbox").fill("housing");
  await expect(editor.getByRole("option", { name: /Date Night/ })).toHaveCount(0);
  await expect(category).toHaveText("Dining & Lifestyle › Date Night");
});

test("searching categories does not overwrite a legacy category or submit search text", async ({ page }) => {
  await page.goto(`/transactions?month=${previousMonthKey}&page=1`);
  await page.getByRole("button", { name: "Edit transaction Previous month taxi" }).click();
  const editor = page.getByRole("dialog", { name: "Edit transaction" });
  const category = editor.getByRole("combobox", { name: "Category", exact: true });
  await category.click();
  await editor.getByRole("searchbox", { name: "Search categories" }).fill("not a category");
  await expect(editor.getByText("No matching categories. Try another search.")).toBeVisible();
  await expect(category).toHaveText("Transport (current category)");
  await editor.getByLabel("Amount").fill("500");
  await expect(editor.getByRole("searchbox")).toHaveCount(0);
  const request = page.waitForRequest((request) => request.method() === "PATCH" && request.url().includes("/transactions/txn-previous-taxi"));
  await editor.getByRole("button", { name: "Save transaction" }).click();
  const body = (await request).postDataJSON();
  expect(body).toMatchObject({ amount: 500 });
  expect(body).not.toHaveProperty("categoryName");
  expect(body).not.toHaveProperty("categoryId");
  await expect(editor).toHaveCount(0);
});

test("dropdown keyboard navigation and Escape preserve the transaction modal", async ({ page }) => {
  await page.goto(`/transactions?month=${previousMonthKey}&page=1`);
  await page.getByRole("button", { name: "Edit transaction Previous month taxi" }).click();
  const editor = page.getByRole("dialog", { name: "Edit transaction" });
  const category = editor.getByRole("combobox", { name: "Category", exact: true });
  await category.focus();
  await category.press("ArrowDown");
  const search = editor.getByRole("searchbox", { name: "Search categories" });
  await expect(search).toBeFocused();
  await search.fill("restaurants");
  await search.press("Enter");
  await expect(category).toHaveText("Dining & Lifestyle › Restaurants");
  await expect(category).toBeFocused();
  await expect(editor).toBeVisible();
  await category.click();
  await search.fill("rent");
  await search.press("Escape");
  await expect(editor.getByRole("listbox")).toHaveCount(0);
  await expect(editor).toBeVisible();
  await expect(category).toBeFocused();
  await category.click();
  await expect(search).toHaveValue("");
  await search.press("Tab");
  await expect(editor.getByLabel("Merchant")).toBeFocused();
  await expect(editor.getByRole("listbox")).toHaveCount(0);
});

test("flat dropdown has no search and supports arrows, Home, End, and type-ahead", async ({ page }) => {
  await page.goto(`/transactions?month=${previousMonthKey}&page=1`);
  await page.getByRole("button", { name: "Edit transaction Previous month taxi" }).click();
  const editor = page.getByRole("dialog", { name: "Edit transaction" });
  const visibility = editor.getByRole("combobox", { name: "Visibility", exact: true });
  await visibility.press("ArrowDown");
  const list = editor.getByRole("listbox", { name: "Visibility options" });
  await expect(list).toBeFocused();
  await expect(editor.getByRole("searchbox")).toHaveCount(0);
  await list.press("End");
  await list.press("Enter");
  await expect(visibility).toHaveText("Household");
  await visibility.click();
  await list.press("Home");
  await list.press("ArrowUp");
  await list.press("Enter");
  await expect(visibility).toHaveText("Household");
  await visibility.press("p");
  await expect(visibility).toHaveText("Private");
  await visibility.click();
  await editor.getByLabel("Amount").click();
  await expect(list).toHaveCount(0);
  await expect(editor).toBeVisible();
});


test("dropdown triggers disable while saving and recover after a failed save", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/transactions/txn-previous-taxi", async (route) => {
    if (route.request().method() !== "PATCH") { await route.fallback(); return; }
    await pending;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ title: "Save failed" }) });
  });
  await page.goto(`/transactions?month=${previousMonthKey}&page=1`);
  await page.getByRole("button", { name: "Edit transaction Previous month taxi" }).click();
  const editor = page.getByRole("dialog", { name: "Edit transaction" });
  try {
    await editor.getByRole("button", { name: "Save transaction" }).click();
    await expect(editor.getByRole("combobox", { name: "Category", exact: true })).toBeDisabled();
    await expect(editor.getByRole("combobox", { name: "Visibility", exact: true })).toBeDisabled();
  } finally { release(); }
  await expect(editor.getByRole("combobox", { name: "Category", exact: true })).toBeEnabled();
  await expect(editor.getByRole("listbox")).toHaveCount(0);
  await editor.getByRole("combobox", { name: "Category", exact: true }).click();
  await expect(editor.getByRole("listbox")).toBeVisible();
});

test("category groups stay bold headings before and during food search", async ({ page }, testInfo) => {
  await page.goto(`/transactions?month=${previousMonthKey}&page=1`);
  await page.getByRole("button", { name: "Edit transaction Previous month taxi" }).click();
  const editor = page.getByRole("dialog", { name: "Edit transaction" });
  const category = editor.getByRole("combobox", { name: "Category", exact: true });
  await category.click();
  const panel = editor.getByRole("listbox", { name: "Category options" });
  const search = editor.getByRole("searchbox", { name: "Search categories" });
  const foodGroup = panel.getByText("Food & Groceries", { exact: true });
  const diningGroup = panel.getByText("Dining & Lifestyle", { exact: true });
  for (const query of ["", "food", ""]) {
    await search.fill(query);
    await expect(foodGroup).toBeVisible();
    await expect(diningGroup).toBeVisible();
    await expect(panel.getByRole("option", { name: "Food & Groceries", exact: true })).toHaveCount(0);
    await expect(panel.getByRole("option", { name: "Dining & Lifestyle", exact: true })).toHaveCount(0);
    for (const heading of [foodGroup, diningGroup]) {
      expect(await heading.evaluate((element) => Number.parseInt(getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(700);
      await heading.click();
      await expect(category).toHaveAttribute("aria-expanded", "true");
      await expect(category).toHaveText("Transport (current category)");
    }
  }
  await search.fill("food");
  await expect(panel.getByRole("option", { name: "Food & Groceries › Groceries", exact: true })).toBeVisible();
  await expect(panel.getByRole("option", { name: "Dining & Lifestyle › Food Delivery", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("food-group-headings.png") });
  await search.press("Enter");
  await expect(category).toHaveText("Food & Groceries › Groceries");
  await expect(panel).toHaveCount(0);
});

test("groups with hidden children remain headings and standalone categories stay selectable", async ({ page }) => {
  await page.goto(`/transactions?month=${previousMonthKey}&page=1`);
  await page.getByRole("button", { name: "Edit transaction Previous month taxi" }).click();
  const editor = page.getByRole("dialog", { name: "Edit transaction" });
  const category = editor.getByRole("combobox", { name: "Category", exact: true });
  await category.click();
  const panel = editor.getByRole("listbox");
  await expect(panel.getByText("Archived Group", { exact: true })).toBeVisible();
  await expect(panel.getByRole("option", { name: "Archived Group", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("option", { name: /Archived Groceries/ })).toHaveCount(0);
  await panel.getByRole("option", { name: "Everyday", exact: true }).click();
  await expect(category).toHaveText("Everyday");
});

test("shared month dropdown navigates months without search or native selects", async ({ page }, testInfo) => {
  await page.goto("/dashboard");
  const month = page.getByRole("combobox", { name: "Dashboard month", exact: true });
  await expect(month).toHaveText(formatMonthKey(currentMonthKey));
  await month.focus();
  await month.press("Space");
  const panel = page.getByRole("listbox", { name: "Dashboard month options", exact: true });
  await expect(panel).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await expect(panel.getByRole("option", { name: formatMonthKey(currentMonthKey), exact: true })).toHaveAttribute("aria-selected", "true");
  await page.screenshot({ path: testInfo.outputPath("shared-month-dropdown.png") });
  const request = page.waitForRequest((request) => request.url().includes(`/api/dashboard/monthly?month=${previousMonthKey}`));
  await panel.getByRole("option", { name: formatMonthKey(previousMonthKey), exact: true }).click();
  await request;
  await expect(month).toHaveText(formatMonthKey(previousMonthKey));
  await expect(page).toHaveURL(new RegExp(`month=${previousMonthKey}`));
  await page.getByRole("button", { name: "Next dashboard month", exact: true }).click();
  await expect(month).toHaveText(formatMonthKey(currentMonthKey));
  await expect(page.getByRole("button", { name: "Next dashboard month", exact: true })).toBeDisabled();
  await expect(page.locator("select")).toHaveCount(0);
});

test("shared household and role dropdowns preserve scope and invitation payload", async ({ page }, testInfo) => {
  await page.goto("/household");
  const household = page.getByRole("combobox", { name: "Household", exact: true });
  await household.click();
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("shared-household-dropdown.png") });
  await page.getByRole("option", { name: "Family workspace (Family)", exact: true }).click();
  await expect(household).toHaveText("Family workspace (Family)");
  await expect(page).toHaveURL(/household=44444444-4444-4444-8444-444444444444/);
  const role = page.getByRole("combobox", { name: "Role", exact: true });
  await role.click();
  await expect(page.getByRole("listbox", { name: "Role options", exact: true }).getByRole("option")).toHaveCount(3);
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await page.getByRole("option", { name: "Viewer", exact: true }).click();
  await expect(role).toHaveText("Viewer");
  await page.getByLabel("Email", { exact: true }).fill("viewer@example.com");
  const request = page.waitForRequest((request) => request.url().endsWith("/api/households/44444444-4444-4444-8444-444444444444/invitations") && request.method() === "POST");
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  expect((await request).postDataJSON()).toEqual({ email: "viewer@example.com", role: "Viewer" });
  await expect(page.getByText("Invitation sent to viewer@example.com.", { exact: true })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
});

test("shared default visibility dropdown saves the selected setting", async ({ page }) => {
  await page.goto("/settings");
  const visibility = page.getByRole("combobox", { name: "Default visibility", exact: true });
  await visibility.click();
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await page.getByRole("option", { name: "Household", exact: true }).click();
  await expect(visibility).toHaveText("Household");
  const request = page.waitForRequest((request) => request.url().endsWith("/api/settings/me") && request.method() === "PATCH");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({ defaultTransactionVisibility: "Household" });
  await expect(visibility).toHaveText("Household");
  await expect(page.locator("select")).toHaveCount(0);
});

test("shared goal dropdowns submit goal type and reset optional pace", async ({ page }) => {
  const goal = { id: "goal-dropdown", name: "Emergency reserve", userProfileId: "profile", remainingAmount: 50000, currentAmount: 0, targetAmount: 50000, goalType: "EmergencyFund", priority: "Medium", status: "Active" };
  await page.route("**/api/goals", async (route) => {
    if (route.request().method() === "POST") await json(route, goal);
    else await route.fallback();
  });
  await page.route("**/api/goals/goal-dropdown", route => json(route, { goal, plan: null, currentUserConsent: null }));
  await page.route("**/api/goals/goal-dropdown/planning-runs", route => json(route, { id: "run-dropdown", goalId: goal.id, runType: "Generate", status: "Succeeded" }));
  await page.goto("/planning");
  await page.getByLabel("Goal", { exact: true }).fill(goal.name);
  await page.getByLabel("Target amount", { exact: true }).fill("50000");
  const type = page.getByRole("combobox", { name: "Goal type", exact: true });
  await type.click();
  await expect(page.getByRole("listbox", { name: "Goal type options", exact: true }).getByRole("option")).toHaveCount(5);
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await page.getByRole("option", { name: "Emergency fund", exact: true }).click();
  await expect(type).toHaveText("Emergency fund");
  const create = page.waitForRequest((request) => request.url().endsWith("/api/goals") && request.method() === "POST");
  await page.getByRole("button", { name: "Create goal", exact: true }).click();
  expect((await create).postDataJSON()).toMatchObject({ goalType: "EmergencyFund", targetAmount: 50000 });
  const pace = page.getByRole("combobox", { name: "Pace (optional)", exact: true });
  await expect(pace).toHaveText("Show three paces");
  for (const label of ["Balanced", "Show three paces"]) {
    await pace.click();
    const panel = page.getByRole("listbox", { name: "Pace (optional) options", exact: true });
    await expect(panel.getByRole("option")).toHaveCount(4);
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await panel.getByRole("option", { name: label, exact: true }).click();
    await expect(pace).toHaveText(label);
    const generate = page.waitForRequest((request) => request.url().endsWith("/api/goals/goal-dropdown/planning-runs") && request.method() === "POST");
    await page.getByRole("button", { name: "Generate plan", exact: true }).click();
    const payload = (await generate).postDataJSON();
    if (label === "Balanced") expect(payload.pace).toBe("Balanced");
    else expect(payload).not.toHaveProperty("pace");
    await expect(page.getByRole("button", { name: "Generate plan", exact: true })).toBeEnabled();
  }
  await expect(page.locator("select")).toHaveCount(0);
});

test("financial accounts save aliases and keep account setup optional", async ({ page }) => {
  await page.goto("/settings");
  const panel = page.locator("article").filter({ has: page.getByRole("heading", { name: "Financial accounts", exact: true }) });
  await expect(panel.getByText("You can keep tracking without adding an account.")).toBeVisible();
  await panel.getByLabel("Account name", { exact: true }).fill("HDFC Millennia");
  await panel.getByRole("combobox", { name: "Account type", exact: true }).click();
  await page.getByRole("option", { name: "Credit card", exact: true }).click();
  await panel.getByLabel("Aliases (comma separated)", { exact: true }).fill("Millennia,HDFC card");
  const request = page.waitForRequest(request => new URL(request.url()).pathname === "/api/financial-accounts" && request.method() === "POST");
  await panel.getByRole("button", { name: "Add account", exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({ name: "HDFC Millennia", accountType: "CreditCard", aliases: ["Millennia", "HDFC card"], shared: false });
  await expect(panel.getByRole("status")).toHaveText("Financial account saved.");
  await panel.getByRole("button", { name: "Edit HDFC Millennia", exact: true }).click();
  await panel.getByLabel("Active", { exact: true }).uncheck();
  await panel.getByRole("button", { name: "Save account", exact: true }).click();
  await expect(panel.getByText(/Archived/)).toBeVisible();
});

test("transaction editor exposes financial kind independently of payment channel", async ({ page }) => {
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Next transaction page", exact: true }).click();
  await page.getByRole("button", { name: "Edit transaction Paid rent", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit transaction", exact: true });
  await expect(editor.getByRole("combobox", { name: "Account (optional)", exact: true })).toHaveText("Unspecified");
  await editor.getByRole("combobox", { name: "Financial event", exact: true }).click();
  await editor.getByRole("option", { name: "Credit Card Payment", exact: true }).click();
  await expect(editor.getByRole("combobox", { name: "Source account (optional)", exact: true })).toBeVisible();
  await expect(editor.getByRole("combobox", { name: "Destination account (optional)", exact: true })).toBeVisible();
  await editor.getByRole("combobox", { name: "Payment channel (optional)", exact: true }).click();
  await editor.getByRole("option", { name: "UPI", exact: true }).click();
  const request = page.waitForRequest(request => request.url().endsWith("/api/transactions/txn-rent") && request.method() === "PATCH");
  await editor.getByRole("button", { name: /Save/ }).click();
  expect((await request).postDataJSON()).toMatchObject({ kind: "CreditCardPayment", paymentChannel: "UPI", amount: 18000 });
});

test("Enter submits valid login credentials and preserves browser validation", async ({ page }) => {
  let loginCount = 0;
  page.on("request", request => {
    if (request.url().endsWith("/api/auth/login")) loginCount++;
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill("invalid-email");
  await page.getByLabel("Password").fill("dummy-secret");
  await page.getByLabel("Password").press("Enter");
  await expect(page.getByLabel("Email")).toBeFocused();
  expect(loginCount).toBe(0);

  await page.getByLabel("Email").fill("demo@example.com");
  const request = page.waitForRequest(request => request.url().endsWith("/api/auth/login"));
  await page.getByLabel("Password").press("Enter");
  expect((await request).postDataJSON()).toEqual({ email: "demo@example.com", password: "dummy-secret" });
  await expect(page).toHaveURL(/\/$/);
  expect(loginCount).toBe(1);
});

test("page reload silently restores login", async ({ page }) => {
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { name: "Transactions", exact: true }).first()).toBeVisible();
  const refresh = page.waitForRequest(request => request.url().endsWith("/api/auth/refresh"));
  await page.reload();
  await refresh;
  await expect(page.getByRole("heading", { name: "Transactions", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Sign in to use the assistant input workspace.")).toHaveCount(0);
});

test("session restoration waits for server recovery instead of signing out", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/auth/refresh", async route => {
    if (++attempts === 1) {
      await route.fulfill({ status: 503, json: { errors: ["Restarting"] } });
    } else {
      await json(route, mockSession);
    }
  });
  await page.goto("/transactions");
  await expect(page.getByRole("status")).toContainText("Reconnecting automatically");
  await expect(page.getByText("Sign in to use the assistant input workspace.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Transactions", exact: true }).first()).toBeVisible();
  expect(attempts).toBe(2);
});

test("temporary refresh failure on an expired access token preserves login and allows retry", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop pagination scenario");
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { name: "Transactions", exact: true }).first()).toBeVisible();
  let recovered = false;
  let refreshAttempts = 0;
  await page.route("**/api/auth/refresh", async route => {
    refreshAttempts++;
    if (!recovered) return route.fulfill({ status: 503, json: { errors: ["Restarting"] } });
    return json(route, { ...mockSession, accessToken: "renewed-token" });
  });
  await page.route("**/api/transactions?**", async route => {
    if (route.request().headers().authorization === "Bearer renewed-token") return route.fallback();
    return route.fulfill({ status: 401, json: { errors: ["Access token expired"] } });
  });
  await page.getByRole("button", { name: "Next transaction page" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Restarting");
  await expect(page).toHaveURL(/transactions/);
  recovered = true;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect.poll(() => refreshAttempts).toBe(2);
});

test("rejected refresh still signs out", async ({ page }) => {
  await page.route("**/api/auth/refresh", route => route.fulfill({ status: 401, json: { errors: ["Session expired"] } }));
  await page.goto("/");
  await expect(page.getByText("Sign in to use the assistant input workspace.")).toBeVisible();
});

test("tabs serialize refresh token rotation", async ({ page, context }) => {
  const otherPage = await context.newPage();
  await mockBackend(otherPage);
  let active = 0;
  let maximumActive = 0;
  let requests = 0;
  const refresh = async (route: Route) => {
    requests++;
    maximumActive = Math.max(maximumActive, ++active);
    await new Promise(resolve => setTimeout(resolve, 150));
    await json(route, mockSession);
    active--;
  };
  await page.route("**/api/auth/refresh", refresh);
  await otherPage.route("**/api/auth/refresh", refresh);
  await Promise.all([page.goto("/transactions"), otherPage.goto("/transactions")]);
  await expect(page.getByRole("heading", { name: "Transactions", exact: true }).first()).toBeVisible();
  await expect(otherPage.getByRole("heading", { name: "Transactions", exact: true }).first()).toBeVisible();
  expect(requests).toBe(2);
  expect(maximumActive).toBe(1);
  await otherPage.close();
});
