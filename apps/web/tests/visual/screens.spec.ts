// Screenshot baselines: route x width x theme. Not part of the default run (see playwright.config.ts);
// run with `pnpm --filter web test:visual`. Baselines are recorded per redesign PR and are not committed yet.
import { expect, test } from "@playwright/test";
import { appRoutes, contextFor, openRoute, prepareRoute, viewports } from "../support/routes";

const themes = [
  { name: "light", colorScheme: "light" as const, ready: true },
  // Dark mode is in scope for the refresh but does not exist yet (audit V1). Unskip when the dark tokens ship.
  { name: "dark", colorScheme: "dark" as const, ready: false },
];

for (const theme of themes) {
  for (const viewport of viewports) {
    test.describe(`${theme.name} @${viewport.name}`, () => {
      test.use({ ...contextFor(viewport), colorScheme: theme.colorScheme });

      for (const route of appRoutes) {
        test(`${route.id}-${viewport.name}-${theme.name}`, async ({ page }) => {
          test.skip(!theme.ready, "Dark mode not implemented yet (audit V1)");
          await prepareRoute(page, route);
          await openRoute(page, route, viewport.formFactor);
          await expect(page.getByRole("progressbar", { name: "Loading page" })).toHaveCount(0);
          await expect(page.getByRole("status", { name: "Loading content" })).toHaveCount(0);
          // The mocked data is dated in the current month, so month labels are masked.
          await expect(page).toHaveScreenshot(`${route.id}-${viewport.name}-${theme.name}.png`, {
            animations: "disabled",
            caret: "hide",
            fullPage: true,
            mask: [page.getByText(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b|\b\d{2} [A-Z][a-z]{2} \d{4}\b/)],
          });
        });
      }
    });
  }
}
