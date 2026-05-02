import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ?? "3000";
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: { mode: "retain-on-failure", size: { width: 1440, height: 900 } },
  },
  projects: [
    {
      name: "golden-paths",
      testMatch: /.*\.spec\.ts/,
      testIgnore: /demo-tour\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "demo",
      testMatch: /demo-tour\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        video: { mode: "on", size: { width: 1440, height: 900 } },
      },
    },
  ],
  webServer: process.env.PW_REUSE_SERVER
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
