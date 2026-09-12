import { expect, test, type Page } from "@playwright/test";

async function registration(page: Page, mode = "RequestOnly") {
  await page.route("**/api/auth/registration", route => route.fulfill({ json: { mode } }));
  await page.route("**/api/auth/refresh", route => route.fulfill({ status: 401, json: { errors: ["Signed out"] } }));
}

test("public entry points offer MVP requests and direct signup redirects", async ({ page }) => {
  await registration(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Request MVP access" })).toHaveAttribute("href", "/request-access");
  await expect(page.getByRole("link", { name: "Sign up", exact: true })).toHaveCount(0);
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Request MVP access" })).toBeVisible();
  await page.goto("/signup?invite=household-invitation");
  await expect(page).toHaveURL(/\/request-access$/);
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
});

test("request form submits name email and optional reason without creating an account", async ({ page }) => {
  let accountCreations = 0;
  await registration(page);
  await page.route("**/api/auth/users", route => { accountCreations++; return route.abort(); });
  await page.route("**/api/auth/access-requests", async route => {
    expect(route.request().postDataJSON()).toEqual({ name: "MVP Tester", email: "tester@example.com", reason: "Try household tracking" });
    await route.fulfill({ status: 202, json: { message: "Request received" } });
  });
  await page.goto("/request-access");
  await page.getByLabel("Display name").fill("MVP Tester");
  await page.getByLabel("Email", { exact: true }).fill("tester@example.com");
  await page.getByLabel("Why would you like access? (optional)").fill("Try household tracking");
  await page.getByRole("button", { name: "Request MVP access" }).click();
  await expect(page.getByRole("status")).toHaveText("Your request has been received. We’ll email you if access is approved.");
  expect(accountCreations).toBe(0);
  await expect(page.getByRole("button", { name: "Request MVP access" })).toHaveCount(0);
});

test("approved signup fixes email and sends the token only in the API body", async ({ page }) => {
  await registration(page);
  const token = "A".repeat(64);
  await page.route("**/api/auth/signup-invitations/validate", route => {
    expect(route.request().postDataJSON()).toEqual({ token });
    expect(route.request().url()).not.toContain(token);
    return route.fulfill({ json: { name: "Approved Tester", email: "approved@example.com" } });
  });
  let submitted = false;
  await page.route("**/api/auth/users", route => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ email: "approved@example.com", invitationToken: token, password: "MvpPassword1", acceptPrivacyPolicy: true });
    submitted = true;
    return route.fulfill({ status: 400, json: { errors: ["Test validation failure"] } });
  });
  await page.goto(`/signup#token=${token}`);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("approved@example.com");
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("readonly", "");
  await page.getByLabel("Password", { exact: true }).fill("MvpPassword1");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Test validation failure");
  expect(submitted).toBe(true);
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeEnabled();
});

test("invalid signup links show support without a signup form", async ({ page }) => {
  await registration(page);
  await page.route("**/api/auth/signup-invitations/validate", route => route.fulfill({ status: 403, json: { errors: ["Invalid link"] } }));
  await page.goto("/signup#token=expired");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("invalid, expired, or already used");
  await expect(page.getByRole("link", { name: "Contact support", exact: true })).toHaveAttribute("href", /^mailto:/);
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
});

test("registration settings failures keep signup closed", async ({ page }) => {
  await page.route("**/api/auth/registration", route => route.fulfill({ status: 503, json: {} }));
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Request MVP access" })).toBeVisible();
  await page.goto("/signup");
  await expect(page).toHaveURL(/\/request-access$/);
});

test("open mode restores public signup", async ({ page }) => {
  await registration(page, "Open");
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Create a new account" })).toHaveAttribute("href", "/signup");
  await page.getByRole("link", { name: "Create a new account" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeEditable();
});

test("request failures allow retry and the reason is optional", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/auth/access-requests", route => {
    attempts++;
    expect(route.request().postDataJSON()).toEqual({ name: "Tester", email: "tester@example.com" });
    return attempts === 1
      ? route.fulfill({ status: 429, json: { detail: "Please try again later." } })
      : route.fulfill({ status: 202, json: { message: "Received" } });
  });
  await page.goto("/request-access");
  await page.getByLabel("Display name").fill("Tester");
  await page.getByLabel("Email", { exact: true }).fill("tester@example.com");
  await page.getByRole("button", { name: "Request MVP access" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Please try again later.");
  await page.getByRole("button", { name: "Request MVP access" }).click();
  await expect(page.getByRole("status")).toContainText("Your request has been received");
});
