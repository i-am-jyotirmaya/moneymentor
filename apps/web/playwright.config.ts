import { defineConfig, devices } from "@playwright/test";

// PLAYWRIGHT_WEB_PORT lets a shared machine run the suite without reusing another checkout's dev server.
const port = Number(process.env.PLAYWRIGHT_WEB_PORT ?? 3000);
const baseURL = `http://127.0.0.1:${port}`;
const coverageSuite = /a11y\/.*\.spec\.ts$/;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop-chromium",
      testIgnore: coverageSuite,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { height: 900, width: 1440 },
      },
    },
    {
      name: "mobile-chromium",
      testIgnore: coverageSuite,
      use: { ...devices["Pixel 5"] },
    },
    // Sets its own viewport per test (320, 360, 412 and 1440), so it runs once, not per device project.
    {
      name: "a11y-coverage",
      testMatch: coverageSuite,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    // Server components fetch registration settings directly, where page.route() can't mock them.
    // Point them at a closed port so a local API (if one is running) can't change the results.
    env: { API_BASE_URL: process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:9" },
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    url: baseURL,
  },
});
