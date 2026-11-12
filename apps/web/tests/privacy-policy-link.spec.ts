import { expect, test } from "@playwright/test";

test("on the web the signup policy link still opens /privacy in a new tab", async ({ page, context }) => {
  await page.route("**/api/auth/registration", route => route.fulfill({ json: { mode: "Open" } }));
  await page.route("**/api/auth/refresh", route => route.fulfill({ status: 401, json: { errors: ["Signed out"] } }));
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Asha E1");
  await page.getByLabel("Email", { exact: true }).fill("asha.e1@example.com");

  const link = page.getByRole("link", { name: "beta privacy policy" });
  await expect(link).toHaveAttribute("href", "/privacy");
  await expect(link).toHaveAttribute("target", "_blank");
  const [policy] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await expect(policy).toHaveURL(/\/privacy\/?$/);
  await expect(policy.getByRole("heading", { level: 1, name: "Spndrr beta privacy policy" })).toBeVisible();
  await expect(policy.getByRole("link", { name: "Return to Spndrr" })).toHaveAttribute("href", "/");

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/signup\/?$/);
  await expect(page.getByLabel("Display name")).toHaveValue("Asha E1");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("asha.e1@example.com");
});
