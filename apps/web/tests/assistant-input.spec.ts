import { expect, test, type Page } from "@playwright/test";

async function workspace(page: Page, whileLoading?: () => Promise<void>) {
  let releaseLoad: () => void = () => {};
  const loadGate = new Promise<void>(resolve => { releaseLoad = resolve; });
  if (!whileLoading) releaseLoad();
  const requests: Record<string, unknown>[] = [];
  const month = new Date().toISOString().slice(0, 7);
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let response: unknown = [];
    if (path === "/api/auth/refresh") response = {
      accessToken: "test-token", accessTokenExpiresAt: "2099-01-01T00:00:00Z", requiresPrivacyConsent: false,
      user: { id: "user", email: "test@example.com", displayName: "Test", roles: ["User"] },
    };
    else if (path === "/api/settings/me") response = { currencyCode: "INR", timeZone: "Asia/Kolkata", plan: "Free", requireMerchantForExpenses: false, defaultTransactionVisibility: "Private" };
    else if (path === "/api/households") response = { defaultHouseholdId: "home", households: [{ id: "home", name: "Personal", kind: "Personal", role: "Owner", canWrite: true, status: "Active" }] };
    else if (path === "/api/transactions") response = { items: [], month, page: 1, pageSize: 10, totalCount: 0, totalPages: 0 };
    else if (path === "/api/transactions/trash") response = { items: [] };
    else if (path === "/api/categories") response = { categories: [], canWrite: true };
    else if (path === "/api/dashboard/monthly") response = { month, monthLabel: "This month", currencyCode: "INR", income: 0, spends: 0, saved: 0, savingsRate: null, categories: [], judgements: [], insights: [], recentTransactions: [] };
    else if (path === "/api/assistant/messages") {
      const body = route.request().postDataJSON(); requests.push(body);
      const image = body.inputMode === "Image";
      const preview = image && body.processingMode === "Preview";
      response = { status: "Responded", intent: "CreateExpense", assistantMessage: preview ? "Review this payment before tracking." : "Tracked expense.",
        transaction: preview ? null : { id: "saved", amount: 649, currencyCode: "INR", type: "Expense", categoryName: "Food Delivery", merchantName: "Swiggy", description: "Payment", sourceText: body.text, transactionDate: "2026-09-20", inputMode: body.inputMode, visibility: "Private", confidence: 0.9 },
        parsedDebug: image ? { amount: 649, merchantName: "Swiggy", categoryGuess: "Food Delivery", transactionDate: "2026-09-20", sourceText: body.text, inputMode: "Image", confidence: 0.9, missingFields: [] } : null,
        confirmationToken: preview ? "server-token" : null, paymentState: "Success", errors: [] };
    }
    if (path === "/api/households") await loadGate;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(response) });
  });
  await page.goto("/assistant");
  await expect(page.getByLabel("Message Spndrr")).toBeVisible();
  try { await whileLoading?.(); } finally { releaseLoad(); }
  await expect(page.getByRole("button", { name: "Attach image", exact: true })).toBeEnabled();
  return requests;
}
async function screenshotImage(page: Page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 1000; canvas.height = 520;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black"; ctx.font = "32px Arial";
    ["Payment successful", "INR 649.00", "Paid to SWIGGY LIMITED", "UPI transaction ID 625163091872", "20 Sep 2026"].forEach((line, i) => ctx.fillText(line, 35, 65 + i * 80));
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(data, "base64");
}
async function speech(page: Page, fail = false) {
  await page.addInitScript(({ fail }) => {
    class Recognition {
      continuous = false; interimResults = false; lang = "";
      onresult: ((event: { results: { transcript: string }[][] }) => void) | null = null;
      onend: (() => void) | null = null; onerror: (() => void) | null = null;
      start() { setTimeout(() => { if (fail) this.onerror?.(); else { const result = { results: [[{ transcript: "Spent 850 at Reliance yesterday" }]] }; this.onresult?.(result); this.onresult?.(result); } this.onend?.(); }, 800); }
      stop() { this.onend?.(); }
    }
    Object.assign(window, { SpeechRecognition: Recognition });
  }, { fail });
}

test("typed and final voice acquisition submit through the assistant endpoint once each", async ({ page }) => {
  await speech(page); const requests = await workspace(page);
  await page.getByLabel("Message Spndrr").fill("Spent 850 at Reliance yesterday");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  await page.getByRole("button", { name: "Start voice input" }).click();
  await expect(page.getByTestId("voice-wave")).toBeVisible();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests.map(x => x.inputMode)).toEqual(["Text", "Voice"]);
  expect(requests.every(x => x.processingMode === "Execute")).toBeTruthy();
  expect(requests[0].text).toBe(requests[1].text);
});
test("stopping voice suppresses late transcription", async ({ page }) => {
  await speech(page); const requests = await workspace(page);
  await page.getByRole("button", { name: "Start voice input" }).click();
  await page.getByRole("button", { name: "Stop voice input" }).click();
  await page.waitForTimeout(1000);
  expect(requests).toHaveLength(0);
  await expect(page.getByTestId("voice-wave")).toHaveCount(0);
});
test("permission failure leaves typing available", async ({ page }) => {
  await speech(page, true); const requests = await workspace(page);
  await page.getByRole("button", { name: "Start voice input" }).click();
  await expect(page.getByText(/Check microphone permission/)).toBeVisible();
  expect(requests).toHaveLength(0);
  await expect(page.getByLabel("Message Spndrr")).toBeEditable();
});
for (const method of ["select", "paste"] as const) test(`${method}: local OCR previews sanitized text and requires confirmation`, async ({ page }) => {
  test.setTimeout(90_000);
  const requests = await workspace(page);
  const external: string[] = [];
  page.on("request", request => { if (!/127\.0\.0\.1|localhost/.test(new URL(request.url()).hostname)) external.push(request.url()); });
  await page.evaluate(() => {
    const original = URL.revokeObjectURL.bind(URL);
    Object.assign(window, { revokedImages: [] as string[] });
    URL.revokeObjectURL = url => { (window as unknown as { revokedImages: string[] }).revokedImages.push(url); original(url); };
  });
  const buffer = await screenshotImage(page);
  if (method === "select") await page.getByLabel("Choose screenshot").setInputFiles({ name: "payment.png", mimeType: "image/png", buffer });
  else await page.getByLabel("Message Spndrr").evaluate((element, base64) => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const clipboardData = new DataTransfer(); clipboardData.items.add(new File([bytes], "payment.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  }, buffer.toString("base64"));
  await expect(page.getByRole("button", { name: "Track expense", exact: true })).toBeVisible({ timeout: 70_000 });
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ inputMode: "Image", processingMode: "Preview" });
  expect(String(requests[0].text)).toContain("649");
  expect(String(requests[0].text)).toMatch(/SWIGGY/i);
  expect(String(requests[0].text)).not.toContain("625163091872");
  expect(Object.keys(requests[0]).sort()).toEqual(["currencyCode", "householdId", "inputMode", "locale", "processingMode", "text"]);
  expect(external).toEqual([]);
  if (method === "paste") {
    await page.getByRole("button", { name: "Edit text" }).click();
    await page.getByLabel("Message Spndrr").fill("Payment successful\n₹649\nPaid to Swiggy\nUPI transaction ID 625163091872");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1]).toMatchObject({ inputMode: "Image", processingMode: "Preview" });
    expect(String(requests[1].text)).not.toContain("625163091872");
  }
  await page.getByRole("button", { name: "Track expense", exact: true }).click();
  await expect(page.getByTestId("image-preview")).toHaveCount(0);
  expect(requests.at(-1)).toMatchObject({ inputMode: "Image", processingMode: "Execute", confirmationToken: "server-token" });
  expect(await page.evaluate(() => (window as unknown as { revokedImages: string[] }).revokedImages.length)).toBeGreaterThan(0);
});

test("composer waits for household initialization before accepting input", async ({ page }) => {
  await workspace(page, async () => {
    await expect(page.getByRole("button", { name: "Attach image", exact: true })).toBeDisabled();
    await expect(page.getByLabel("Choose screenshot")).toBeDisabled();
    await expect(page.getByLabel("Message Spndrr")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Start voice input" })).toBeDisabled();
  });
  await expect(page.getByLabel("Message Spndrr")).toBeEditable();
});
