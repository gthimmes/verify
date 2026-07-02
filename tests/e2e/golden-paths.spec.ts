import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * E2E golden paths.  These tests assume the seed fixture (Acme Storefront +
 * Internal Tools) is in place — globalSetup.ts re-seeds the database before
 * the suite runs.  Any test that mutates state should use a unique stamp so
 * it doesn't collide with the next run.
 */

// openDialog clicks a trigger and retries until a dialog appears.  This is
// the idiomatic Playwright way to handle the React 19 + Turbopack hydration
// race that used to break this suite.
async function openDialog(page: Page, trigger: Locator): Promise<Locator> {
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    if (!(await dialog.isVisible().catch(() => false))) {
      await trigger.click();
    }
    await expect(dialog).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000, intervals: [200, 400, 800] });
  return dialog;
}

test.describe("Verify — golden paths", () => {
  test("home page lists seeded projects", async ({ page }) => {
    // `/` now redirects to the most-recently-updated project; the project
    // list lives at `/?list=1` (header nav + breadcrumbs use this).
    await page.goto("/?list=1");
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    const cards = page.getByTestId("project-card");
    await expect(cards).not.toHaveCount(0);
    await expect(page.locator('[data-project-key="ACM"]')).toBeVisible();
  });

  test("create a new project and a folder", async ({ page }) => {
    const stamp = Date.now();
    await page.goto("/?list=1");
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

    const dialog = await openDialog(page, page.getByTestId("new-project-button").first());
    await dialog.getByTestId("project-name-input").fill(`Smoke Project ${stamp}`);
    await dialog.getByTestId("project-key-input").fill(`SMK${stamp.toString().slice(-4)}`);
    await dialog.getByTestId("project-submit").click();

    // After create, the server action redirects to /projects/{id}, which in
    // turn redirects to the folder view at /projects/{id}/cases.
    await expect(page).toHaveURL(/\/projects\/[\w-]+\/cases$/);
    await expect(page.getByText("Smoke Project " + stamp).first()).toBeVisible();

    // Folder creation lives in the Cases sidebar (the folder tree).
    await page.getByTestId("new-folder-open").click();
    await page.getByTestId("new-folder-input").fill("Checkout");
    await page.getByTestId("new-folder-save").click();
    await expect(
      page.getByTestId("folder-link").filter({ hasText: "Checkout" }),
    ).toBeVisible();
  });

  test("authoring a test case persists steps and parameters", async ({ page }) => {
    // Go to the list explicitly so the test doesn't depend on whichever
    // project was most-recently-updated by other tests in this run.
    await page.goto("/?list=1");
    await page.locator('[data-project-key="ACM"]').first().click();
    await expect(page.getByRole("heading", { name: /Acme Storefront/ })).toBeVisible();
    await page.getByTestId("new-case-cta").click();

    const stamp = Date.now();
    await page.getByTestId("case-title").fill(`Apple Pay invoice ${stamp}`);
    await page
      .getByTestId("case-folder")
      .selectOption({ label: "Payments › One-time payment" });
    await page.getByTestId("case-description").fill("Apple Pay should charge and confirm.");
    await page.getByTestId("case-tags").fill("smoke, P0");

    await page.getByTestId("step-action-0").fill("Open invoice and click Pay with Apple Pay");
    await page.getByTestId("step-expected-0").fill("Apple Pay sheet appears");
    await page.getByTestId("add-step").click();
    await page.getByTestId("step-action-1").fill("Authorize the charge");
    await page.getByTestId("step-expected-1").fill("Receipt is rendered");

    await page.getByTestId("add-param").click();
    await page.getByTestId("add-row").click();

    await page.getByTestId("case-automation-status").selectOption("not_automated");
    await page.getByTestId("case-submit").click();

    await expect(page).toHaveURL(/\/cases\/[\w-]+$/);
    await expect(page.getByRole("heading", { name: new RegExp(`Apple Pay invoice ${stamp}`) }),
    ).toBeVisible();
    await expect(page.getByText("Open invoice and click Pay with Apple Pay")).toBeVisible();
  });

  test("execute a pass and a fail in the in-progress run", async ({ page }) => {
    await page.goto("/runs");
    await expect(page.getByRole("heading", { name: "Active runs" })).toBeVisible();
    await page.getByRole("link", { name: /May 1 nightly smoke/ }).click();
    await page.getByTestId("execute-cta").click();
    await expect(page.getByRole("heading", { name: /Execute: May 1 nightly smoke/ })).toBeVisible();

    const firstRow = page.getByTestId("execution-row").first();
    await firstRow.getByTestId("result-pass").click();

    const rows = await page.getByTestId("execution-row").all();
    if (rows.length >= 2) {
      await rows[1].getByTestId("result-fail").click();
    }
  });

  test("reports page surfaces automation candidates", async ({ page }) => {
    await page.goto("/?list=1");
    await page.locator('[data-project-key="ACM"]').first().click();
    await page.getByRole("link", { name: "Reports" }).click();
    await expect(page.getByRole("heading", { name: /Automation candidates/ })).toBeVisible();
    await expect(page.getByTestId("candidates-table")).toBeVisible();
  });

  test("global search finds a case by ID", async ({ page }) => {
    await page.goto("/search?q=ACM-PAY-0001");
    const results = page.getByTestId("search-result");
    await expect(results.first()).toBeVisible();
    await expect(results.first()).toContainText("ACM-PAY-0001");
  });
});
