import { expect, test } from "@playwright/test";

test("an approved email link can be opened inside the mobile app", async ({ page }) => {
  await page.route("**/api/auth/signup-invitations/validate", route => {
    expect(route.request().postDataJSON()).toEqual({ token: "approved-test-token" });
    return route.fulfill({ json: { name: "Tester", email: "tester@example.com" } });
  });
  await page.goto("/request-access/");
  await page.getByText("Already approved? Open your invitation").click();
  await page.getByLabel("Approved signup link").fill("https://mvp.spndrr.com/signup#token=approved-test-token");
  await page.getByRole("button", { name: "Open invitation", exact: true }).click();
  await expect(page).toHaveURL(/\/signup\/#token=approved-test-token$/);
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("tester@example.com");
  await expect(page.getByLabel("Email", { exact: true })).not.toBeEditable();
});

test("an untrusted invitation cannot navigate outside the app", async ({ page }) => {
  await page.goto("/request-access/");
  await page.getByText("Already approved? Open your invitation").click();
  await page.getByLabel("Approved signup link").fill("https://evil.example/signup#token=abc");
  await page.getByRole("button", { name: "Open invitation", exact: true }).click();
  await expect(page.locator("details").getByRole("alert")).toContainText("complete approved signup link");
  await expect(page).toHaveURL(/\/request-access\/$/);
});

test("a second invitation revalidates an already-open signup screen", async ({ page }) => {
  await page.route("**/api/auth/signup-invitations/validate", route => {
    const { token } = route.request().postDataJSON();
    return route.fulfill({ json: { name: token, email: `${token}@example.com` } });
  });
  await page.goto("/signup/#token=first");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("first@example.com");
  await page.evaluate(() => { window.location.hash = "token=second"; });
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("second@example.com");
});

test("offline state is visible and clears when connectivity returns", async ({ page, context }) => {
  await page.goto("/request-access/");
  await expect(page.getByRole("button", { name: "Request MVP access", exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole("status")).toContainText("You’re offline");
  await context.setOffline(false);
  await expect(page.getByText("You’re offline.", { exact: false })).toHaveCount(0);
});

test("bundled routes render at a narrow phone width without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/login/");
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: "test-results/mobile-login.png", fullPage: true });
});

test("saved sessions prompt automatically and stay covered after a canceled unlock", async ({ page }) => {
  let refreshes = 0;
  await page.addInitScript(() => {
    localStorage.setItem("spndrr.native-session", "saved");
    let attempts = 0;
    let foregroundChecks = 0;
    const methods = (names: string[], rtype = "promise") => names.map(name => ({ name, rtype }));
    Object.assign(window, {
      CapacitorCustomPlatform: { name: "ios" },
      Capacitor: {
        PluginHeaders: [
          { name: "App", methods: [...methods(["getLaunchUrl", "getState"]), ...methods(["addListener", "removeListener"], "callback")] },
          { name: "BiometricAuthNative", methods: methods(["checkBiometry", "internalAuthenticate"]) },
        ],
        nativeCallback: async () => "listener",
        nativePromise: async (_plugin: string, method: string) => {
          if (method === "checkBiometry") return { deviceIsSecure: true };
          if (method === "getState") return { isActive: ++foregroundChecks !== 3 };
          if (method === "internalAuthenticate") {
            document.documentElement.dataset.devicePrompts = String(++attempts);
            if (attempts === 1) return new Promise((_, reject) => {
              document.addEventListener("test-cancel-unlock", () => reject({ code: "userCancel" }), { once: true });
            });
          }
        },
      },
    });
  });
  await page.route("**/api/auth/refresh", route => {
    refreshes++;
    return route.fulfill({ json: {
      accessToken: "test-access-token", accessTokenExpiresAt: "2099-01-01T00:00:00Z", requiresPrivacyConsent: false,
      user: { id: "test-user", displayName: "Tester", email: "tester@example.com", roles: [] },
    } });
  });
  await page.goto("/login/");
  const root = page.locator("html");
  const password = page.getByLabel("Password", { exact: true });
  const retry = page.getByRole("button", { name: "Try again" });
  await expect(root).toHaveAttribute("data-device-prompts", "1");
  await expect(password).toHaveCount(0);
  await expect(retry).toHaveCount(0);
  expect(refreshes).toBe(0);

  await page.evaluate(() => document.dispatchEvent(new Event("test-cancel-unlock")));
  await expect(retry).toBeVisible();
  await expect(password).toHaveCount(0);
  expect(refreshes).toBe(0);

  await retry.click();
  await expect(password).toBeVisible();
  expect(refreshes).toBe(1);

  await page.evaluate(() => document.dispatchEvent(new Event("pause")));
  await expect(password).toHaveCount(0);
  await expect(root).toHaveAttribute("data-device-prompts", "2");
  await page.evaluate(() => document.dispatchEvent(new Event("resume")));
  await expect(root).toHaveAttribute("data-device-prompts", "3");
  await expect(password).toBeVisible();
  expect(refreshes).toBe(1);
});
