import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3001", screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [
    { name: "mobile-chromium", testIgnore: "**/visual.spec.ts", use: { ...devices["Pixel 5"] } },
    // Opt-in screenshot baselines: PLAYWRIGHT_VISUAL=1 playwright test --project=visual (see test:visual).
    ...(process.env.PLAYWRIGHT_VISUAL
      ? [{ name: "visual", testMatch: "**/visual.spec.ts", use: { ...devices["Desktop Chrome"] } }]
      : []),
  ],
  webServer: {
    command: "node scripts/serve-export.mjs",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: !process.env.CI,
  },
});
