import { test, expect } from "@playwright/test";

/**
 * E2E for the auth UI in its signed-out state (no session cookie). The full
 * Google round-trip needs real credentials and can't run headlessly, so this
 * asserts the entry point: the header offers "Sign in with Google" and no
 * user menu is shown.
 */

test("signed-out header offers Google sign-in", async ({ page }) => {
  await page.goto("/?list=1");

  const signin = page.getByTestId("signin-button");
  await expect(signin).toBeVisible();
  await expect(signin).toHaveAttribute("href", "/api/auth/google/login");

  // No signed-in user menu / sign-out when there's no session.
  await expect(page.getByTestId("user-menu")).toHaveCount(0);
  await expect(page.getByTestId("logout-button")).toHaveCount(0);
});

test("login route redirects toward Google (or reports misconfig)", async ({ page }) => {
  // Don't follow the cross-origin redirect to Google; just confirm our route
  // responds with a redirect rather than an error page.
  const res = await page.request.get("/api/auth/google/login", {
    maxRedirects: 0,
  });
  expect([302, 307, 308]).toContain(res.status());
  const loc = res.headers()["location"] ?? "";
  // Either off to Google, or back home with a clear not_configured flag.
  expect(
    loc.includes("accounts.google.com") || loc.includes("auth_error=not_configured"),
  ).toBeTruthy();
});
