// Accessibility and flow coverage for every current screen, against the shared mocked API.
//
// Run by the web "a11y-coverage" project and by the mobile static-export suite
// (apps/mobile/tests/a11y-flow-coverage.spec.ts). Assertions use roles and accessible names
// only, so the visual refresh can change every class without touching this file.
//
// Known current failures are listed in ./known-failures.ts with the AUDIT.md finding they
// come from, and run as test.fail(): the suite is green today and a check flips to
// "unexpectedly passed" as soon as the redesign fixes it. Delete the entry then.
import { expect, test, type Page } from "@playwright/test";
import { axeScan, navLabelBoxes, overlappingPairs, placeholderContrasts, smallTargets } from "../support/a11y-probes";
import {
  appRoutes, contextFor, mobileViewports, openRoute, prepareRoute, quickNavLinks, routeById,
  viewports, workspaceNavLinks, type AppRoute, type Viewport,
} from "../support/routes";
import { mockViewerHousehold, mockWorkspaceServerError } from "../support/scenarios";
import { expectKnownFailure } from "./known-failures";

async function settle(page: Page) {
  await expect(page.getByRole("progressbar", { name: "Loading page" })).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Loading content" })).toHaveCount(0);
}

for (const viewport of viewports) {
  const { formFactor } = viewport;

  test.describe(`@${viewport.name}`, () => {
    test.use(contextFor(viewport));

    for (const route of appRoutes) {
      const key = `${route.id}@${viewport.name}`;

      test.describe(route.path, () => {
        test.beforeEach(async ({ page }) => {
          await prepareRoute(page, route);
        });

        test(`${key} renders landmarks, heading and controls`, async ({ page }) => {
          await openRoute(page, route, formFactor);
          await expect(page.getByRole("main")).toBeVisible();
          await expect(page.getByRole("heading", { name: route.heading[formFactor], exact: true }).first()).toBeVisible();
          for (const control of route.controls.filter(control => !control.only || control.only === formFactor)) {
            await expect(page.getByRole(control.role, { name: control.name, exact: typeof control.name === "string" }).first()).toBeVisible();
          }
          if (route.kind === "workspace") await expectWorkspaceNavigation(page, viewport);
          if (formFactor === "mobile") {
            expect(await page.evaluate(() => document.documentElement.scrollWidth), "no horizontal overflow (audit A7)").toBeLessThanOrEqual(viewport.width);
          }
        });

        test(`${key} primary navigation reaches ${route.navigatesTo.linkName}`, async ({ page }) => {
          await openRoute(page, route, formFactor);
          const scope = route.kind === "public"
            ? page.getByRole("main")
            : page.getByRole("navigation", { name: formFactor === "mobile" ? "Quick navigation" : "Desktop navigation", exact: true });
          await scope.getByRole("link", { name: route.navigatesTo.linkName, exact: true }).click();
          await expect(page).toHaveURL(route.navigatesTo.url);
          await expect(page.getByRole("heading", { name: route.navigatesTo.heading[formFactor], exact: true }).first()).toBeVisible();
        });

        test(`${key} axe WCAG 2.1 AA (all rules except color-contrast)`, async ({ page }) => {
          expectKnownFailure("axe", key);
          await openRoute(page, route, formFactor);
          await settle(page);
          expect(await axeScan(page, { skip: ["color-contrast"] })).toEqual([]);
        });

        test(`${key} axe color-contrast`, async ({ page }) => {
          expectKnownFailure("contrast", key);
          await openRoute(page, route, formFactor);
          await settle(page);
          expect(await axeScan(page, { only: ["color-contrast"] })).toEqual([]);
        });

        if (formFactor === "mobile") {
          test(`${key} interactive targets are at least 48x48`, async ({ page }) => {
            expectKnownFailure("targets", key);
            await openRoute(page, route, formFactor);
            await settle(page);
            expect(await smallTargets(page)).toEqual([]);
          });
        }

        if (viewport.name === "360" || viewport.name === "1440") {
          test(`${key} has one h1 and it leads the heading order`, async ({ page }) => {
            expectKnownFailure("h1", key);
            await openRoute(page, route, formFactor);
            const levels = await page.getByRole("heading").evaluateAll(headings =>
              headings.filter(heading => heading.getClientRects().length > 0).map(heading => Number(heading.tagName.slice(1)) || Number(heading.getAttribute("aria-level"))));
            expect(levels.filter(level => level === 1), "exactly one visible h1").toHaveLength(1);
            expect(levels[0], "first heading is the h1").toBe(1);
          });

          if (hasPlaceholderFields(route, viewport)) {
            test(`${key} placeholder text has at least 4.5:1 contrast`, async ({ page }) => {
              expectKnownFailure("placeholder", key);
              await openRoute(page, route, formFactor);
              await settle(page);
              const fields = await placeholderContrasts(page);
              expect(fields.length, "route has placeholder fields").toBeGreaterThan(0);
              expect(fields.filter(field => field.ratio < 4.5)).toEqual([]);
            });
          }
        }
      });
    }
  });
}

function hasPlaceholderFields(route: AppRoute, viewport: Viewport) {
  if (route.id === "home") return viewport.formFactor === "mobile"; // desktop "/" is the dashboard
  return ["assistant", "planning", "household", "settings", "login", "signup", "request-access"].includes(route.id);
}

async function expectWorkspaceNavigation(page: Page, viewport: Viewport) {
  if (viewport.formFactor === "mobile") {
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    const quick = page.getByRole("navigation", { name: "Quick navigation", exact: true });
    await expect(quick).toBeVisible();
    for (const name of quickNavLinks) await expect(quick.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(quick.getByRole("button", { name: "More", exact: true })).toBeVisible();
  } else {
    const sidebar = page.getByRole("navigation", { name: "Desktop navigation", exact: true });
    await expect(sidebar).toBeVisible();
    for (const name of workspaceNavLinks) await expect(sidebar.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  }
}

// Error states (audit S1, S2): the error banner must replace content, not sit above an
// empty state or a skeleton that never stops loading.
for (const viewport of [viewports[1], viewports[3]]) {
  test.describe(`@${viewport.name} error state`, () => {
    test.use(contextFor(viewport));

    for (const id of ["transactions", "dashboard", "household", "settings"]) {
      const route = routeById(id);
      const key = `${id}@${viewport.name}`;

      test(`${key} server error shows the error banner without empty states or skeletons`, async ({ page }) => {
        expectKnownFailure("error-state", key);
        await prepareRoute(page, route);
        await mockWorkspaceServerError(page);
        await page.goto(route.path);
        await expect(page.getByRole("alert").filter({ hasText: "Server error" }).first()).toBeVisible();
        await expect(page.getByText(/No transactions found/)).toHaveCount(0);
        await expect(page.getByText("Trash is empty.")).toHaveCount(0);
        await expect(page.getByRole("status", { name: "Loading content" })).toHaveCount(0);
      });
    }
  });
}

// Large text (audit T4): bottom-bar labels must not run into each other at 200% font size.
test.describe("@360 200% font scale", () => {
  test.use(contextFor(viewports[1]));

  for (const id of ["assistant", "dashboard", "transactions"]) {
    const route = routeById(id);
    const key = `${id}@360`;

    test(`${key} bottom navigation labels do not overlap or clip at 200% font size`, async ({ page }) => {
      expectKnownFailure("font-200", key);
      await prepareRoute(page, route);
      await openRoute(page, route, "mobile");
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      const quick = page.getByRole("navigation", { name: "Quick navigation", exact: true });
      await expect(quick).toBeVisible();
      const boxes = await navLabelBoxes(quick);
      expect(boxes.map(box => box.label)).toEqual([...quickNavLinks, "More"]);
      expect(overlappingPairs(boxes), "overlapping labels").toEqual([]);
      expect(boxes.filter(box => box.clipped).map(box => box.label), "clipped labels").toEqual([]);
    });
  }
});

// Navigation drawer (audit N4, N5) on every phone width.
for (const viewport of mobileViewports) {
  test.describe(`@${viewport.name} navigation drawer`, () => {
    test.use(contextFor(viewport));
    const route = routeById("dashboard");

    test.beforeEach(async ({ page }) => {
      await prepareRoute(page, route);
      await openRoute(page, route, "mobile");
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(page.getByLabel("Mobile menu")).toBeVisible();
    });

    test(`drawer@${viewport.name} close button closes it and its links navigate`, async ({ page }) => {
      await page.getByRole("button", { name: "Close menu" }).click();
      await expect(page.getByLabel("Mobile menu")).toBeHidden();
      await page.getByRole("button", { name: "Open menu" }).click();
      await page.getByRole("navigation", { name: "Mobile navigation", exact: true }).getByRole("link", { name: "Settings", exact: true }).click();
      await expect(page).toHaveURL(/\/settings\/?$/);
      await expect(page.getByRole("heading", { name: "Settings", exact: true }).first()).toBeVisible();
    });

    test(`drawer@${viewport.name} closes on Escape`, async ({ page }) => {
      expectKnownFailure("drawer-escape", `drawer@${viewport.name}`);
      await page.keyboard.press("Escape");
      await expect(page.getByLabel("Mobile menu")).toBeHidden();
    });

    test(`drawer@${viewport.name} closes on a tap outside it`, async ({ page }) => {
      expectKnownFailure("drawer-outside", `drawer@${viewport.name}`);
      const box = await page.getByLabel("Mobile menu").boundingBox();
      if (!box) throw new Error("drawer has no box");
      const outsideX = (box.x + box.width + viewport.width) / 2;
      expect(outsideX, "there is page area outside the drawer").toBeLessThan(viewport.width);
      await page.touchscreen.tap(outsideX, viewport.height / 2);
      await expect(page.getByLabel("Mobile menu")).toBeHidden();
    });

    test(`drawer@${viewport.name} moves focus inside while open`, async ({ page }) => {
      expectKnownFailure("drawer-focus", `drawer@${viewport.name}`);
      await expect.poll(() => page.getByLabel("Mobile menu").evaluate(drawer => drawer.contains(document.activeElement))).toBe(true);
    });
  });
}

// Read-only household (audit S7): a Viewer must not be able to submit from the Assistant composer.
for (const viewport of [viewports[1], viewports[3]]) {
  test.describe(`@${viewport.name} read-only household`, () => {
    test.use(contextFor(viewport));
    const route = routeById("assistant");
    const key = `assistant@${viewport.name}`;

    test(`${key} Viewer household disables the composer`, async ({ page }) => {
      expectKnownFailure("readonly-composer", key);
      await prepareRoute(page, route);
      await mockViewerHousehold(page);
      await openRoute(page, route, viewport.formFactor);
      await expect(page.locator("main").getByText("Read only", { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Message Spndrr" }).first()).toBeDisabled();
      await expect(page.getByRole("button", { name: "Send message" }).first()).toBeDisabled();
      await expect(page.getByRole("button", { name: "Start voice input" }).first()).toBeDisabled();
    });
  });
}
