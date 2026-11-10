// Route-level scenarios shared by the e2e, coverage and visual suites.
// Each helper layers on top of mockBackend(): Playwright runs the newest matching route first.
import type { Page } from "@playwright/test";
import { json } from "./mock-backend";

/** Public auth pages: signed-out session plus the server's registration mode. */
export async function mockRegistration(page: Page, mode = "RequestOnly") {
  await page.route("**/api/auth/registration", route => route.fulfill({ json: { mode } }));
  await page.route("**/api/auth/refresh", route => route.fulfill({ status: 401, json: { errors: ["Signed out"] } }));
}

/** The household-permission mock: the only selectable household is one the user can only view. */
export const viewerHouseholds = {
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
};

export async function mockViewerHousehold(page: Page) {
  await page.route("**/api/households", route => json(route, viewerHouseholds));
}

/** Judgments with nothing active, so /reports renders its designed empty state instead of a 404 banner. */
export async function mockNoActiveJudgements(page: Page) {
  await page.route("**/api/judgements/active**", route => json(route, []));
}

/** Every workspace data endpoint fails with a server error; auth keeps working so the workspace still opens. */
export async function mockWorkspaceServerError(page: Page) {
  await page.route("**/api/**", async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname.startsWith("/api/auth/")) {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ title: "Server error" }) });
  });
}
